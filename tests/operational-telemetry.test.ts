import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { consoleOperationalTelemetrySink, correlationId, emitOperationalTelemetry, isOperationalTelemetryEvent, type OperationalTelemetryEvent } from "@xuyenviet/contracts";
import { runWorkerAdapter } from "../packages/worker-domain/src/adapters";
import { processAiAskDomainOutboxBatch } from "../packages/worker-domain/src/features/ai/domain-outbox-worker";
import { conversations, domainOutbox } from "@/db/schema";
import { acquireAiAskCommand } from "@/features/ai/ai-ask-commands";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

describe("operational telemetry contract", () => {
  it("emits only validated allowlisted event fields and isolates sink failures", async () => {
    const emit = vi.fn(() => { throw new Error("sink unavailable"); });
    const requestId = correlationId("request_1");
    emitOperationalTelemetry({ emit }, {
      correlationId: requestId,
      capability: "ai_ask.stream",
      principalClass: "user",
      resultCode: "success",
      latencyMs: 12,
      durableId: "command_1",
    });
    expect(emit).toHaveBeenCalledWith({ correlationId: "request_1", capability: "ai_ask.stream", principalClass: "user", resultCode: "success", latencyMs: 12, durableId: "command_1" });
    emitOperationalTelemetry({ emit }, {
      correlationId: "invalid id with spaces",
      capability: "ai_ask.stream",
      principalClass: "user",
      resultCode: "success",
      latencyMs: 12,
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(correlationId("invalid id")).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(isOperationalTelemetryEvent({ correlationId: requestId, capability: "ai_ask.stream", principalClass: "system", resultCode: "success", latencyMs: 1 })).toBe(false);
    expect(isOperationalTelemetryEvent({ correlationId: requestId, capability: "unknown", principalClass: "system", resultCode: "success", latencyMs: 1 })).toBe(false);
    expect(isOperationalTelemetryEvent({ correlationId: requestId, capability: "ai_ask.stream", principalClass: "user", resultCode: "success", latencyMs: 1, prompt: "secret" })).toBe(false);
    expect(isOperationalTelemetryEvent({ correlationId: requestId, capability: "ai_ask.stream", principalClass: "user", resultCode: "success", latencyMs: 1, authorization: "Bearer secret" })).toBe(false);
  });

  it("emits exact safe worker observations with a fresh UUID per poll", async () => {
    const events: OperationalTelemetryEvent[] = [];
    const observation = { capability: "ai_ask.outbox" as const, resultCode: "no_work" as const, leaseRecovery: "none" as const };
    const sink = { emit(event: OperationalTelemetryEvent) { events.push(event); } };
    await runWorkerAdapter(["outbox", "--once", "--worker-id=telemetry-test-worker"], { telemetry: sink, runPoll: async () => observation });
    await runWorkerAdapter(["outbox", "--once", "--worker-id=telemetry-test-worker"], { telemetry: sink, runPoll: async () => observation });

    expect(events).toHaveLength(2);
    expect(events).toEqual(events.map((event) => ({
      correlationId: event.correlationId,
      capability: "ai_ask.outbox",
      principalClass: "system",
      resultCode: "no_work",
      latencyMs: event.latencyMs,
      leaseRecovery: "none",
    })));
    expect(events.map((event) => event.correlationId)).toEqual(events.map((event) => expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)));
    expect(new Set(events.map((event) => event.correlationId)).size).toBe(2);
    expect(events.every(isOperationalTelemetryEvent)).toBe(true);
  });

  it("keeps worker-domain silent without a configured sink", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await runWorkerAdapter(["outbox", "--once", "--worker-id=telemetry-test-worker"], { runPoll: async () => ({ capability: "ai_ask.outbox", resultCode: "no_work", leaseRecovery: "none" }) });
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("cannot let a throwing sink alter a worker poll result", async () => {
    await expect(runWorkerAdapter(["outbox", "--once", "--worker-id=telemetry-test-worker"], {
      telemetry: { emit() { throw new Error("sink unavailable"); } },
      runPoll: async () => ({ capability: "ai_ask.outbox", resultCode: "success", durableId: "outbox_1", retryCount: 2, jobLagMs: 4, leaseRecovery: "recovered", leaseRecoveryCount: 1 }),
    })).resolves.toMatchObject({ durableId: "outbox_1", resultCode: "success" });
  });

  it("drops console telemetry while stdout is backpressured without changing the caller result", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValueOnce(false).mockReturnValue(true);
    const event = { correlationId: "console_telemetry_1", capability: "worker.startup" as const, principalClass: "system" as const, resultCode: "success" as const, latencyMs: 1 };
    try {
      expect(consoleOperationalTelemetrySink.emit(event)).toBeUndefined();
      expect(consoleOperationalTelemetrySink.emit(event)).toBeUndefined();
      expect(write).toHaveBeenCalledTimes(1);

      process.stdout.emit("drain");
      expect(consoleOperationalTelemetrySink.emit(event)).toBeUndefined();
      expect(write).toHaveBeenCalledTimes(2);
    } finally {
      process.stdout.emit("drain");
      write.mockRestore();
    }
  });

  it("absorbs asynchronous stdout errors without changing the caller result", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const emitWarning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    const event = { correlationId: "console_telemetry_error_1", capability: "worker.startup" as const, principalClass: "system" as const, resultCode: "success" as const, latencyMs: 1 };
    try {
      expect(consoleOperationalTelemetrySink.emit(event)).toBeUndefined();
      expect(() => process.stdout.emit("error", new Error("stdout unavailable"))).not.toThrow();
      expect(emitWarning).toHaveBeenCalledWith("Operational telemetry stdout is unavailable.");
    } finally {
      emitWarning.mockRestore();
      write.mockRestore();
    }
  });

  it.runIf(Boolean(process.env.DATABASE_URL_TEST))("observes an expired outbox lease from its claimed durable protocol facts", async () => {
    await resetTestDatabase();
    await seedTestOperator();
    const now = new Date();
    const [conversation] = await testDb.insert(conversations).values({ id: "telemetry_conversation_1", userId: "operator" }).returning();
    const command = await acquireAiAskCommand({ userId: "operator", idempotencyKey: "telemetry_outbox_key_1", question: "Telemetry question", conversationId: conversation!.id });
    if (command.kind !== "admitted") throw new Error("Expected command admission");
    const [event] = await testDb.select().from(domainOutbox);
    await testDb.update(domainOutbox).set({ status: "processing", availableAt: new Date(now.getTime() - 2_000), claimedAt: new Date(now.getTime() - 2_000), leaseExpiresAt: new Date(now.getTime() - 1_000), claimedBy: "stale-worker", fencingToken: "a".repeat(64) }).where(eq(domainOutbox.id, event!.id));
    const observations: OperationalTelemetryEvent[] = [];
    await processAiAskDomainOutboxBatch({ workerId: "telemetry-worker", onObservation(observation) {
      observations.push({ correlationId: "worker_poll_1", principalClass: "system", latencyMs: 1, ...observation });
    } });
    expect(observations).toEqual([expect.objectContaining({
      capability: "ai_ask.outbox", resultCode: "success", durableId: event!.id, retryCount: 1,
      jobLagMs: expect.any(Number), leaseRecovery: "recovered", leaseRecoveryCount: 1,
    })]);
    expect(observations.every(isOperationalTelemetryEvent)).toBe(true);
  });
});
