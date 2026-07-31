import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { schemaCompatibilityDeclarations, type OperationalTelemetryEvent } from "@xuyenviet/contracts";

import { aiGatewayModels, conversations, domainOutbox, domainOutboxEffects, knowledgeIngestionJobs, messages, releaseSchemaVersions, sourceCaptureVersions, sources } from "@/db/schema";
import { acquireAiAskCommand, finalizeAiAskCommand } from "@/features/ai/ai-ask-commands";
import { hashCaptureText } from "@/features/knowledge/source-captures";

import { WorkerRuntime, createChildProcessAdapters } from "../apps/worker/src/runtime";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";
import { getTestDatabaseUrl } from "./helpers/env-file";

const root = resolve(import.meta.dirname, "..");
const adapters = ["extraction", "ingestion", "indexing", "outbox"];
const forbiddenWorkerBoundaryReferences = /@\/|@worker\/|(?:from\s+["']|import\s*\()["'](?:next(?:\/|["'])|next-auth(?:\/|["'])|server-only["'])|\bAuth\b|src\/app\/|["']use server["']|unavailableWebEntrypoint|Web-only trip/;
let workerBuilt = false;

async function listWorkerDomainSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listWorkerDomainSourceFiles(path) : [path];
  }));
  return files.flat();
}

function buildWorker() {
  if (workerBuilt) return;
  execFileSync("pnpm", ["--filter", "@xuyenviet/worker", "build"], { cwd: root, stdio: "inherit" });
  workerBuilt = true;
}

function runCompiledAdapter(adapter: "ingestion" | "outbox", workerId: string): Promise<OperationalTelemetryEvent[]> {
  const directory = mkdtempSync(join(root, ".worker-telemetry-"));
  const outputPath = join(directory, "events.jsonl");
  try {
    const output = spawnSync("node", [`apps/worker/dist/adapters/${adapter}.mjs`, adapter, "--once", `--worker-id=${workerId}`], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: getTestDatabaseUrl(), NODE_ENV: "test", NODE_OPTIONS: undefined, VITEST: undefined, XV_WORKER_TELEMETRY_FILE: outputPath },
      encoding: "utf8",
      timeout: 30_000,
    });
    if (output.error || output.status !== 0) throw new Error(`Compiled ${adapter} adapter failed (exit ${output.status ?? "unknown"}): stdout=${output.stdout.trim()} stderr=${output.stderr.trim()}`);
    if (!existsSync(outputPath)) {
      throw new Error(`Compiled ${adapter} adapter emitted no telemetry file (exit ${output.status ?? "unknown"}): stdout=${output.stdout.trim()} stderr=${output.stderr.trim()}`);
    }
    const captured = readFileSync(outputPath, "utf8");
    return Promise.resolve(captured.split("\n").filter(Boolean).map((line) => JSON.parse(line) as OperationalTelemetryEvent));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectCompiledWorkerEvent(events: OperationalTelemetryEvent[], expected: Partial<OperationalTelemetryEvent>) {
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    capability: "knowledge.ingestion",
    principalClass: "system",
    latencyMs: expect.any(Number),
    correlationId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f-]{27}$/),
    ...expected,
  });
}

async function seedIngestionJob(id: string, rawText = "Tôi nghĩ cảnh rất đẹp.") {
  await testDb.insert(sources).values({
    id: `${id}-source`,
    kind: "pasted_text",
    label: `Boundary source ${id}`,
    sourceType: "curated",
    verificationStatus: "unverified",
    submittedByUserId: "operator",
  });
  await testDb.insert(sourceCaptureVersions).values({
    id: `${id}-capture`,
    sourceId: `${id}-source`,
    versionSequence: 1,
    captureKind: "pasted_text",
    rawText,
    contentHash: hashCaptureText(rawText),
    capturedAt: new Date(),
  });
  await testDb.update(sources).set({ currentCaptureVersionId: `${id}-capture` }).where(eq(sources.id, `${id}-source`));
  const [job] = await testDb.insert(knowledgeIngestionJobs).values({
    id: `${id}-job`,
    sourceId: `${id}-source`,
    captureVersionId: `${id}-capture`,
    submittedByUserId: "operator",
    submittedByEmail: "operator@example.com",
    protocolVersion: 1,
    stage: "queued",
    nextRunAt: new Date(0),
  }).returning();
  return job;
}

async function seedCompletedAiAskAnnotation() {
  const [conversation] = await testDb.insert(conversations).values({ id: "boundary-conversation", userId: "operator" }).returning();
  const admitted = await acquireAiAskCommand({ userId: "operator", idempotencyKey: "boundary_outbox_key_123", question: "Đi Huế an toàn", conversationId: conversation.id });
  if (admitted.kind !== "admitted") throw new Error("Expected AI Ask command admission");
  await finalizeAiAskCommand(admitted.commandId, async (transaction, command) => {
    const [assistant] = await transaction.insert(messages).values({ conversationId: command.conversationId, userId: command.userId, role: "assistant", content: "Đi Huế an toàn." }).returning();
    return { assistantMessageId: assistant.id, result: { type: "done" as const, conversationId: command.conversationId, userMessage: admitted.userMessage, assistantMessage: { id: assistant.id, content: assistant.content } } };
  });
  await testDb.update(domainOutbox).set({ availableAt: new Date("2099-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));
  await testDb.update(domainOutbox).set({ availableAt: new Date(0) }).where(eq(domainOutbox.eventType, "ai_ask.answer_annotation.v1"));
  const [event] = await testDb.select().from(domainOutbox).where(eq(domainOutbox.eventType, "ai_ask.answer_annotation.v1"));
  if (!event) throw new Error("Expected AI Ask annotation outbox event");
  return event;
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for worker state");
}

describe("compiled worker adapters", () => {
  test("source package and compiled adapters contain no root application or web authentication graph", async () => {
    const sourceFiles = await listWorkerDomainSourceFiles(resolve(root, "packages/worker-domain/src"));
    expect(sourceFiles).not.toContainEqual(expect.stringMatching(/\.tsx$/));

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, "utf8");
      expect(source).not.toMatch(forbiddenWorkerBoundaryReferences);
    }

    buildWorker();

    for (const adapter of adapters) {
      const compiled = await readFile(resolve(root, `apps/worker/dist/adapters/${adapter}.mjs`), "utf8");
      expect(compiled).not.toMatch(/\.\.\/\.\.\/src\/(?:app|features|db|server)\//);
      expect(compiled).not.toMatch(forbiddenWorkerBoundaryReferences);
    }
  });

  test.runIf(Boolean(process.env.DATABASE_URL_TEST))("runs every compiled --once adapter against an empty test database", () => {
    for (const adapter of adapters) {
      execFileSync("node", [
        `apps/worker/dist/adapters/${adapter}.mjs`,
        adapter,
        "--once",
        `--worker-id=boundary-${adapter}`,
      ], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
        stdio: "inherit",
        timeout: 30_000,
      });
    }
  });

  test.runIf(Boolean(process.env.DATABASE_URL_TEST))("processes persisted knowledge and AI Ask work through compiled adapters", async () => {
    await resetTestDatabase();
    await seedTestOperator();
    const ingestion = await seedIngestionJob("compiled-ingestion");
    const annotation = await seedCompletedAiAskAnnotation();
    buildWorker();

    await runCompiledAdapter("ingestion", "compiled-ingestion-worker");
    await runCompiledAdapter("outbox", "compiled-outbox-worker");

    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, ingestion.id))).resolves.toMatchObject([
      { stage: "suppressed", attemptCount: 1, claimedBy: null, fencingToken: null, lastErrorCode: "insufficient_travel_context" },
    ]);
    await expect(testDb.select().from(domainOutbox).where(eq(domainOutbox.id, annotation.id))).resolves.toMatchObject([
      { status: "completed", attemptCount: 1, claimedBy: null, fencingToken: null },
    ]);
    await expect(testDb.select().from(domainOutboxEffects).where(eq(domainOutboxEffects.outboxEventId, annotation.id))).resolves.toMatchObject([
      { effectType: "answer_annotation" },
    ]);
  });

  test.runIf(Boolean(process.env.DATABASE_URL_TEST))("drains real child adapters without claiming new work and recovers an interrupted lease", async () => {
    await resetTestDatabase();
    await seedTestOperator();
    // This compiled-runtime proof intentionally has no deployment policy
    // projection, so it must use the policy-free pre-overlap release.
    await testDb.insert(releaseSchemaVersions).values({ version: schemaCompatibilityDeclarations.worker.minimumVersion });
    const first = await seedIngestionJob("drain-first", "Điểm dừng trên đèo Hải Vân có bãi đỗ xe an toàn.");
    await testDb.update(knowledgeIngestionJobs).set({ protocolVersion: 2 }).where(eq(knowledgeIngestionJobs.id, first.id));
    await testDb.insert(aiGatewayModels).values({
      id: "drain-extraction-model",
      gatewayModelName: "drain-extraction-model",
      displayLabel: "Drain extraction model",
      purpose: "extraction",
      active: true,
      defaultForPurpose: true,
      supportsTextInput: true,
      supportsExtraction: true,
      pricingUnitTokens: 1_000_000,
      pricingEffectiveAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    buildWorker();

    let requestStarted!: () => void;
    const requestReceived = new Promise<void>((resolve) => { requestStarted = resolve; });
    const gateway = createServer(() => requestStarted());
    await new Promise<void>((resolve, reject) => gateway.once("error", reject).listen(0, "127.0.0.1", resolve));
    const address = gateway.address();
    if (!address || typeof address === "string") throw new Error("Expected local gateway address");
    const previousGatewayUrl = process.env.AI_GATEWAY_BASE_URL;
    process.env.AI_GATEWAY_BASE_URL = `http://127.0.0.1:${address.port}`;

    try {
      const runtime = new WorkerRuntime({ databaseUrl: process.env.DATABASE_URL_TEST!, port: 0, gracefulShutdownMs: 1_000, pollIntervalMs: 1_000 }, createChildProcessAdapters(root), async () => undefined);
      await runtime.start();
      await requestReceived;
      await waitFor(async () => (await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, first.id)))[0]?.claimedBy !== null);
      const duplicatePollerEvents = await runCompiledAdapter("ingestion", "duplicate-poller-worker");
      expectCompiledWorkerEvent(duplicatePollerEvents, {
        resultCode: "no_work",
        leaseRecovery: "none",
      });
      const second = await seedIngestionJob("drain-second");

      await runtime.drain();

      await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, first.id))).resolves.toMatchObject([
        { attemptCount: 1, claimedBy: expect.stringMatching(/^worker-ingestion-/), fencingToken: expect.stringMatching(/^[a-f0-9]{64}$/) },
      ]);
      await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, second.id))).resolves.toMatchObject([
        { attemptCount: 0, claimedBy: null, fencingToken: null },
      ]);

      const expiredAt = new Date(Date.now() - 2_000);
      await testDb.update(knowledgeIngestionJobs).set({ claimedAt: new Date(expiredAt.getTime() - 1), leaseExpiresAt: expiredAt }).where(eq(knowledgeIngestionJobs.id, first.id));
      await testDb.delete(aiGatewayModels).where(eq(aiGatewayModels.id, "drain-extraction-model"));
      const recoveryEvents = await runCompiledAdapter("ingestion", "recovery-worker");

      await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, first.id))).resolves.toMatchObject([
        { stage: "queued", attemptCount: 1, claimedBy: null, fencingToken: null, requeueReasonCode: "lease_expired" },
      ]);
      expectCompiledWorkerEvent(recoveryEvents, {
        resultCode: "success",
        leaseRecovery: "recovered",
        leaseRecoveryCount: 1,
      });
      await testDb.update(knowledgeIngestionJobs).set({ nextRunAt: new Date(0) }).where(eq(knowledgeIngestionJobs.id, first.id));
      const retryEvents = await runCompiledAdapter("ingestion", "recovery-worker");
      await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, first.id))).resolves.toMatchObject([
        { stage: "failed", attemptCount: 2, lastErrorCode: "model_unavailable", claimedBy: null, fencingToken: null },
      ]);
      expectCompiledWorkerEvent(retryEvents, {
        resultCode: "failure",
        durableId: first.id,
        retryCount: 2,
        jobLagMs: expect.any(Number),
        leaseRecovery: "none",
      });
    } finally {
      if (previousGatewayUrl === undefined) delete process.env.AI_GATEWAY_BASE_URL;
      else process.env.AI_GATEWAY_BASE_URL = previousGatewayUrl;
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  }, 15_000);
});
