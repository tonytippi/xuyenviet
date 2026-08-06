import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import type { OperationalTelemetryEvent } from "@xuyenviet/contracts";

import { aiAskCommands, aiGatewayModels, conversations, domainOutbox, domainOutboxEffects, knowledgeCards, knowledgeExtractionJobs, knowledgeIndexDirtyMarkers, knowledgeIngestionCandidates, knowledgeIngestionJobs, messages, sourceCaptureVersions, sources } from "@/db/schema";
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

async function runCompiledAdapter(adapter: "extraction" | "ingestion" | "indexing" | "outbox", workerId: string, environment: Record<string, string | undefined> = {}): Promise<OperationalTelemetryEvent[]> {
  const directory = mkdtempSync(join(root, ".worker-telemetry-"));
  const outputPath = join(directory, "events.jsonl");
  try {
    const output = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn("node", [`apps/worker/dist/adapters/${adapter}.mjs`, adapter, "--once", `--worker-id=${workerId}`], {
        cwd: root,
        env: { ...process.env, ...environment, DATABASE_URL: getTestDatabaseUrl(), NODE_ENV: "test", NODE_OPTIONS: undefined, VITEST: undefined, XV_WORKER_TELEMETRY_FILE: outputPath },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.once("error", reject);
      child.once("close", (status) => resolve({ status, stdout, stderr }));
    });
    if (output.status !== 0) throw new Error(`Compiled ${adapter} adapter failed (exit ${output.status ?? "unknown"}): stdout=${output.stdout.trim()} stderr=${output.stderr.trim()}`);
    if (!existsSync(outputPath)) {
      throw new Error(`Compiled ${adapter} adapter emitted no telemetry file (exit ${output.status ?? "unknown"}): stdout=${output.stdout.trim()} stderr=${output.stderr.trim()}`);
    }
    const captured = readFileSync(outputPath, "utf8");
    return captured.split("\n").filter(Boolean).map((line) => JSON.parse(line) as OperationalTelemetryEvent);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectCompiledWorkerEvent(events: OperationalTelemetryEvent[], expected: Partial<OperationalTelemetryEvent>) {
  expect(events).toEqual(expect.arrayContaining([expect.objectContaining({
    capability: expect.any(String),
    principalClass: "system",
    latencyMs: expect.any(Number),
    correlationId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f-]{27}$/),
    ...expected,
  })]));
}

async function seedExtractionJob(id: string) {
  await testDb.insert(sources).values({ id: `${id}-source`, kind: "pasted_text", label: `Extraction source ${id}`, sourceType: "curated", verificationStatus: "unverified", submittedByUserId: "operator" });
  await testDb.insert(sourceCaptureVersions).values({ id: `${id}-capture`, sourceId: `${id}-source`, versionSequence: 1, captureKind: "pasted_text", rawText: "Nguồn trích xuất có nội dung.", contentHash: hashCaptureText("Nguồn trích xuất có nội dung."), capturedAt: new Date() });
  await testDb.update(sources).set({ currentCaptureVersionId: `${id}-capture` }).where(eq(sources.id, `${id}-source`));
  const [job] = await testDb.insert(knowledgeExtractionJobs).values({ id, sourceId: `${id}-source`, captureVersionId: `${id}-capture`, mode: "extract_only", status: "queued", nextRunAt: new Date(0), createdByUserId: "operator", createdByEmail: "operator@example.com" }).returning();
  return job;
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
      { status: "failed", discoveryTerminal: false, attemptCount: 1, claimedBy: null, fencingToken: null, lastErrorCode: "discovery_failed" },
    ]);
    await expect(testDb.select().from(domainOutbox).where(eq(domainOutbox.id, annotation.id))).resolves.toMatchObject([
      { status: "completed", attemptCount: 1, claimedBy: null, fencingToken: null },
    ]);
    await expect(testDb.select().from(domainOutboxEffects).where(eq(domainOutboxEffects.outboxEventId, annotation.id))).resolves.toMatchObject([
      { effectType: "answer_annotation" },
    ]);
  });

  test.runIf(Boolean(process.env.DATABASE_URL_TEST))("emits persisted terminal, retry, contention, and exhaustion dispositions through compiled adapters", async () => {
    await resetTestDatabase();
    await seedTestOperator();
    buildWorker();

    const extraction = await seedExtractionJob("compiled-terminal-extraction");
    const extractionEvents = await runCompiledAdapter("extraction", "compiled-terminal-extraction-worker");
    expectCompiledWorkerEvent(extractionEvents, { capability: "knowledge.extraction", resultCode: "failure", durableId: extraction.id });
    await expect(testDb.select().from(knowledgeExtractionJobs).where(eq(knowledgeExtractionJobs.id, extraction.id))).resolves.toMatchObject([{ status: "failed", lastErrorCode: "model_unavailable" }]);

    const retryExtraction = await seedExtractionJob("compiled-retry-extraction");
    await testDb.insert(aiGatewayModels).values({ id: "compiled-retry-extraction-model", gatewayModelName: "compiled-retry-extraction-model", displayLabel: "Compiled retry extraction model", purpose: "extraction", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000, pricingEffectiveAt: new Date("2026-01-01T00:00:00.000Z") });
    const retryGateway = createServer((_, response) => { response.writeHead(503).end(); });
    await new Promise<void>((resolve, reject) => retryGateway.once("error", reject).listen(0, "127.0.0.1", resolve));
    const retryAddress = retryGateway.address();
    if (!retryAddress || typeof retryAddress === "string") throw new Error("Expected retry gateway address");
    try {
      const retryExtractionEvents = await runCompiledAdapter("extraction", "compiled-retry-extraction-worker", { AI_GATEWAY_BASE_URL: `http://127.0.0.1:${retryAddress.port}`, AI_GATEWAY_API_KEY: "test-key" });
      expectCompiledWorkerEvent(retryExtractionEvents, { capability: "knowledge.extraction", resultCode: "retry", durableId: retryExtraction.id });
    await expect(testDb.select().from(knowledgeExtractionJobs).where(eq(knowledgeExtractionJobs.id, retryExtraction.id))).resolves.toMatchObject([{ status: "queued", lastErrorCode: "provider_failed", lockedBy: null }]);
    } finally {
      await new Promise<void>((resolve) => retryGateway.close(() => resolve()));
    }

    const staleExtraction = await seedExtractionJob("compiled-stale-extraction");
    await testDb.update(knowledgeExtractionJobs).set({ status: "running", attemptCount: 3, maxAttempts: 3, lockedBy: "dead-worker", lockedAt: new Date(0), startedAt: new Date(0) }).where(eq(knowledgeExtractionJobs.id, staleExtraction.id));
    const staleExtractionEvents = await runCompiledAdapter("extraction", "compiled-stale-extraction-worker");
    expectCompiledWorkerEvent(staleExtractionEvents, { capability: "knowledge.extraction", resultCode: "failure", durableId: staleExtraction.id, leaseRecovery: "recovered", leaseRecoveryCount: 1 });
    await expect(testDb.select().from(knowledgeExtractionJobs).where(eq(knowledgeExtractionJobs.id, staleExtraction.id))).resolves.toMatchObject([{ status: "failed", lastErrorCode: "stale_max_attempts" }]);

    const ingestion = await seedIngestionJob("compiled-terminal-candidate");
    await testDb.update(knowledgeIngestionJobs).set({ candidateCount: 1 }).where(eq(knowledgeIngestionJobs.id, ingestion.id));
    await testDb.insert(aiGatewayModels).values({ id: "compiled-candidate-extraction-model", gatewayModelName: "compiled-candidate-extraction-model", displayLabel: "Compiled candidate extraction model", purpose: "extraction", active: false, defaultForPurpose: false, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000, pricingEffectiveAt: new Date("2026-01-01T00:00:00.000Z") });
    const [candidate] = await testDb.insert(knowledgeIngestionCandidates).values({ ingestionJobId: ingestion.id, sourceId: ingestion.sourceId, captureVersionId: ingestion.captureVersionId, fingerprint: "compiled-terminal-candidate", type: "general_travel_tip", title: "Candidate", summary: "Candidate summary", conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, extractionModelId: "compiled-candidate-extraction-model", extractionPromptVersion: "test", processingStatus: "queued", nextRunAt: new Date(0) }).returning();
    const candidateEvents = await runCompiledAdapter("ingestion", "compiled-terminal-candidate-worker");
    expectCompiledWorkerEvent(candidateEvents, { capability: "knowledge.ingestion", resultCode: "failure", durableId: candidate.id });
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.id, candidate.id))).resolves.toMatchObject([{ processingStatus: "failed", aiDisposition: null, outcomeReasonCode: null }]);

    const recoveryIngestion = await seedIngestionJob("compiled-exhausted-ingestion");
    await testDb.update(knowledgeIngestionJobs).set({ status: "running", attemptCount: 3, maxAttempts: 3, claimedBy: "dead-worker", claimedAt: new Date(0), leaseExpiresAt: new Date(1), fencingToken: "b".repeat(64) }).where(eq(knowledgeIngestionJobs.id, recoveryIngestion.id));
    const recoveryIngestionEvents = await runCompiledAdapter("ingestion", "compiled-exhausted-ingestion-worker");
    expectCompiledWorkerEvent(recoveryIngestionEvents, { capability: "knowledge.ingestion", resultCode: "failure", durableId: recoveryIngestion.id, leaseRecovery: "recovered", leaseRecoveryCount: 1 });
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, recoveryIngestion.id))).resolves.toMatchObject([{ status: "failed", lastErrorCode: "retry_exhausted" }]);

    await testDb.insert(knowledgeCards).values({ id: "compiled-exhausted-card", lifecycleState: "draft", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Exhausted indexing card", summary: "Indexing recovery fixture.", aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(knowledgeIndexDirtyMarkers).values({ id: "compiled-exhausted-index", knowledgeCardId: "compiled-exhausted-card", contentVersion: 1, evidenceSetRevision: 1, reason: "test", status: "claimed", attemptCount: 3, maxAttempts: 3, claimedBy: "dead-worker", claimedAt: new Date(0), leaseExpiresAt: new Date(0), fencingToken: "a".repeat(64), nextRunAt: new Date(0) });
    const indexingEvents = await runCompiledAdapter("indexing", "compiled-exhausted-index-worker");
    expectCompiledWorkerEvent(indexingEvents, { capability: "knowledge.indexing", resultCode: "failure", leaseRecovery: "recovered" });
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.id, "compiled-exhausted-index"))).resolves.toMatchObject([{ status: "failed", failureCode: "retry_exhausted" }]);

    const annotation = await seedCompletedAiAskAnnotation();
    await testDb.update(aiAskCommands).set({ status: "failed" }).where(eq(aiAskCommands.id, annotation.originatingCommandId));
    const outboxEvents = await runCompiledAdapter("outbox", "compiled-fenced-outbox-worker");
    expectCompiledWorkerEvent(outboxEvents, { capability: "ai_ask.outbox", resultCode: "contended", durableId: annotation.id });
    await expect(testDb.select().from(domainOutboxEffects).where(eq(domainOutboxEffects.outboxEventId, annotation.id))).resolves.toMatchObject([{ effectType: "fenced_out" }]);
  });

  test.runIf(Boolean(process.env.DATABASE_URL_TEST))("drains real child adapters without claiming new work and recovers an interrupted lease", async () => {
    await resetTestDatabase();
    await seedTestOperator();
    const first = await seedIngestionJob("drain-first", "Điểm dừng trên đèo Hải Vân có bãi đỗ xe an toàn.");
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
        { status: "queued", attemptCount: 1, claimedBy: null, fencingToken: null, requeueReasonCode: "lease_expired" },
      ]);
      expectCompiledWorkerEvent(recoveryEvents, {
        resultCode: "retry",
        durableId: first.id,
        leaseRecovery: "recovered",
        leaseRecoveryCount: 1,
      });
      expectCompiledWorkerEvent(recoveryEvents, {
        resultCode: "failure",
        durableId: second.id,
        leaseRecovery: "none",
      });
      await testDb.update(knowledgeIngestionJobs).set({ nextRunAt: new Date(0) }).where(eq(knowledgeIngestionJobs.id, first.id));
      const retryEvents = await runCompiledAdapter("ingestion", "recovery-worker");
      await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, first.id))).resolves.toMatchObject([
        { status: "failed", attemptCount: 2, lastErrorCode: "discovery_failed", claimedBy: null, fencingToken: null },
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
