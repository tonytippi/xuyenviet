import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { knowledgeIngestionCandidates, knowledgeIngestionJobs, sourceCaptureVersions, sources, users } from "@/db/schema";
import { claimNextKnowledgeIngestionJob, commitKnowledgeIngestionStage, ensureIngestionJobForCaptureVersion, listKnowledgeIngestionJobStatuses, recoverKnowledgeIngestionJobs, retryKnowledgeIngestionStage } from "@/features/knowledge/ingestion-jobs";
import { runKnowledgeIngestionWorkerLoop } from "@/features/knowledge/ingestion-worker";
import { appendSourceCaptureVersion, hashCaptureText } from "@/features/knowledge/source-captures";

import { resetTestDatabase, testDb } from "./helpers/db";

async function createSource(id: string, submitterId = "operator") {
  await testDb.insert(sources).values({ id, kind: "pasted_text", label: `Source ${id}`, sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: submitterId });
}

async function appendReadableCapture(sourceId: string, rawText = "Đèo Hải Vân có điểm dừng ngắm cảnh.") {
  return appendSourceCaptureVersion(testDb, {
    sourceId,
    captureKind: "pasted_text",
    rawText,
    metadata: { kind: "submitted" },
    capturedAt: new Date("2026-07-22T00:00:00.000Z"),
  });
}

describe("canonical knowledge ingestion jobs", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
  });

  test("creates exactly one queued job with immutable submitter provenance for a readable capture", async () => {
    await createSource("source-one");
    const capture = await appendReadableCapture("source-one");

    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id))).resolves.toMatchObject([
      { sourceId: "source-one", captureVersionId: capture.id, submittedByUserId: "operator", submittedByEmail: "operator@example.com", protocolVersion: 2, stage: "queued", stageVersion: 1, attemptCount: 0, maxAttempts: 3, claimedBy: null, fencingToken: null },
    ]);
    await expect(ensureIngestionJobForCaptureVersion(testDb, { sourceId: "source-one", captureVersionId: capture.id })).resolves.toMatchObject({ captureVersionId: capture.id, submittedByEmail: "operator@example.com" });
    await expect(testDb.select().from(knowledgeIngestionJobs)).resolves.toHaveLength(1);
  });

  test("keeps an existing v1 row unchanged while new capture jobs select v2", async () => {
    await createSource("legacy-source");
    await testDb.insert(sourceCaptureVersions).values({ id: "legacy-capture", sourceId: "legacy-source", versionSequence: 1, captureKind: "pasted_text", rawText: "Legacy capture.", contentHash: hashCaptureText("Legacy capture."), capturedAt: new Date() });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "legacy-job", sourceId: "legacy-source", captureVersionId: "legacy-capture", submittedByUserId: "operator", submittedByEmail: "operator@example.com", protocolVersion: 1 });
    await expect(ensureIngestionJobForCaptureVersion(testDb, { sourceId: "legacy-source", captureVersionId: "legacy-capture" })).resolves.toMatchObject({ id: "legacy-job", protocolVersion: 1 });
    expect(await testDb.select().from(knowledgeIngestionCandidates)).toEqual([]);
  });

  test("keeps the canonical worker loop available for supervised execution and supports a one-shot no-work check", async () => {
    await expect(runKnowledgeIngestionWorkerLoop({ once: true, workerId: "supervised-worker" })).resolves.toBeNull();
  });

  test("creates exactly one canonical job when concurrent callers ensure an unqueued readable capture", async () => {
    await createSource("concurrent-ensure");
    await testDb.insert(sourceCaptureVersions).values({ id: "concurrent-ensure-version", sourceId: "concurrent-ensure", versionSequence: 1, captureKind: "pasted_text", rawText: "Readable capture without queued work.", contentHash: hashCaptureText("Readable capture without queued work."), capturedAt: new Date() });

    const jobs = await Promise.all([
      ensureIngestionJobForCaptureVersion(testDb, { sourceId: "concurrent-ensure", captureVersionId: "concurrent-ensure-version" }),
      ensureIngestionJobForCaptureVersion(testDb, { sourceId: "concurrent-ensure", captureVersionId: "concurrent-ensure-version" }),
    ]);

    expect(jobs).toEqual(expect.arrayContaining([expect.objectContaining({ submittedByEmail: "operator@example.com" })]));
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, "concurrent-ensure-version"))).resolves.toMatchObject([
      { sourceId: "concurrent-ensure", submittedByUserId: "operator", submittedByEmail: "operator@example.com" },
    ]);
  });

  test("preserves prior provenance when a source is recaptured", async () => {
    await createSource("recaptured");
    const first = await appendReadableCapture("recaptured", "Phiên bản đầu tiên.");
    await testDb.update(users).set({ email: "changed@example.com" }).where(eq(users.id, "operator"));
    const second = await appendReadableCapture("recaptured", "Phiên bản tái thu thập.");

    const jobs = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.sourceId, "recaptured")).orderBy(knowledgeIngestionJobs.createdAt);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.captureVersionId).sort()).toEqual([first.id, second.id].sort());
    expect(jobs.map((job) => job.submittedByEmail).sort()).toEqual(["changed@example.com", "operator@example.com"]);
  });

  test("serializes concurrent capture appends so the current pointer is the last committed version", async () => {
    await createSource("concurrent-captures");
    const [first, second] = await Promise.all([
      appendReadableCapture("concurrent-captures", "Phiên bản đồng thời một."),
      appendReadableCapture("concurrent-captures", "Phiên bản đồng thời hai."),
    ]);

    const captures = await testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, "concurrent-captures")).orderBy(sourceCaptureVersions.versionSequence);
    const [source] = await testDb.select().from(sources).where(eq(sources.id, "concurrent-captures"));
    expect(captures.map((capture) => capture.versionSequence)).toEqual([1, 2]);
    expect(source?.currentCaptureVersionId).toBe(captures[1]?.id);
    expect([first.id, second.id]).toContain(source?.currentCaptureVersionId);
  });

  test("claims a due queued job once with a bounded opaque fence and does not advance its stage", async () => {
    await createSource("claimable");
    await appendReadableCapture("claimable");
    const now = new Date(Date.now() + 1_000);

    const claims = await Promise.all([
      claimNextKnowledgeIngestionJob({ workerId: "worker-a", expectedStageVersion: 1, now }, testDb),
      claimNextKnowledgeIngestionJob({ workerId: "worker-b", expectedStageVersion: 1, now }, testDb),
    ]);
    const winner = claims.filter((claim) => claim !== null);
    expect(winner).toHaveLength(1);
    expect(winner[0]).toMatchObject({ stage: "queued", stageVersion: 1, attemptCount: 1 });
    expect(winner[0]?.fencingToken).toMatch(/^[a-f0-9]{64}$/);
    expect(winner[0]?.leaseExpiresAt.getTime()).toBeGreaterThan(now.getTime());

    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, winner[0]?.jobId ?? "")).limit(1);
    expect(job).toMatchObject({ stage: "queued", stageVersion: 1, attemptCount: 1 });
  });

  test("does not claim exhausted jobs or silently reclaim expired claims", async () => {
    await createSource("exhausted");
    const capture = await appendReadableCapture("exhausted");
    const now = new Date("2026-07-22T01:00:00.000Z");
    await testDb.update(knowledgeIngestionJobs).set({ attemptCount: 3 }).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    const [exhaustedBefore] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    await expect(claimNextKnowledgeIngestionJob({ workerId: "worker", expectedStageVersion: 1, now }, testDb)).resolves.toBeNull();
    const [exhaustedAfter] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    expect(exhaustedAfter).toEqual(exhaustedBefore);

    await testDb.update(knowledgeIngestionJobs).set({ attemptCount: 0, claimedBy: "old-worker", claimedAt: new Date("2026-07-22T00:00:00.000Z"), leaseExpiresAt: new Date("2026-07-22T00:15:00.000Z"), fencingToken: "a".repeat(64) }).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    await expect(claimNextKnowledgeIngestionJob({ workerId: "new-worker", expectedStageVersion: 1, now }, testDb)).resolves.toBeNull();
    await expect(listKnowledgeIngestionJobStatuses(testDb, now)).resolves.toMatchObject([{ captureVersionId: capture.id, claimedBy: "old-worker", expired: true }]);
  });

  test("enforces source-version ownership and claim-shape constraints", async () => {
    await createSource("constraint-source");
    await createSource("wrong-source");
    const capture = await appendReadableCapture("constraint-source");

    await expect(testDb.execute(sql`insert into knowledge_ingestion_jobs (id, source_id, capture_version_id, submitted_by_user_id, submitted_by_email, stage) values ('wrong-source-job', 'wrong-source', ${capture.id}, 'operator', 'operator@example.com', 'queued')`)).rejects.toThrow();
    await expect(testDb.execute(sql`insert into knowledge_ingestion_jobs (id, source_id, capture_version_id, submitted_by_user_id, submitted_by_email, stage, stage_version) values ('invalid-stage-job', 'constraint-source', ${capture.id}, 'operator', 'operator@example.com', 'not_a_stage', 0)`)).rejects.toThrow();
    await testDb.insert(sourceCaptureVersions).values([
      { id: "constraint-retry", sourceId: "constraint-source", versionSequence: 2, captureKind: "pasted_text", rawText: "Retry constraint.", contentHash: hashCaptureText("Retry constraint."), capturedAt: new Date() },
      { id: "constraint-claim", sourceId: "constraint-source", versionSequence: 3, captureKind: "pasted_text", rawText: "Claim constraint.", contentHash: hashCaptureText("Claim constraint."), capturedAt: new Date() },
      { id: "constraint-terminal", sourceId: "constraint-source", versionSequence: 4, captureKind: "pasted_text", rawText: "Terminal constraint.", contentHash: hashCaptureText("Terminal constraint."), capturedAt: new Date() },
    ]);
    await expect(testDb.execute(sql`insert into knowledge_ingestion_jobs (id, source_id, capture_version_id, submitted_by_user_id, submitted_by_email, attempt_count) values ('invalid-retry-job', 'constraint-source', 'constraint-retry', 'operator', 'operator@example.com', -1)`)).rejects.toThrow();
    await expect(testDb.execute(sql`insert into knowledge_ingestion_jobs (id, source_id, capture_version_id, submitted_by_user_id, submitted_by_email, claimed_by) values ('invalid-claim-job', 'constraint-source', 'constraint-claim', 'operator', 'operator@example.com', 'worker')`)).rejects.toThrow();
    await expect(testDb.execute(sql`insert into knowledge_ingestion_jobs (id, source_id, capture_version_id, submitted_by_user_id, submitted_by_email, stage, claimed_by, claimed_at, lease_expires_at, fencing_token) values ('invalid-terminal-job', 'constraint-source', 'constraint-terminal', 'operator', 'operator@example.com', 'published', 'worker', now(), now() + interval '1 minute', ${"a".repeat(64)})`)).rejects.toThrow();

    await testDb.update(knowledgeIngestionJobs).set({ stage: "triaging", stageVersion: 2 }).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    const staleClaim = await claimNextKnowledgeIngestionJob({ workerId: "worker", expectedStageVersion: 2, now: new Date("2026-07-22T23:00:00.000Z") }, testDb);
    expect(staleClaim).toBeNull();
  });

  test("rejects unreadable and mismatched versions and exposes no raw payload or fence in the operator projection", async () => {
    await createSource("private-source");
    await createSource("other-source");
    await testDb.insert(sourceCaptureVersions).values({ id: "unreadable", sourceId: "private-source", versionSequence: 1, captureKind: "pasted_text", rawText: null, contentHash: hashCaptureText("not stored"), capturedAt: new Date() });
    await expect(ensureIngestionJobForCaptureVersion(testDb, { sourceId: "private-source", captureVersionId: "unreadable" })).rejects.toThrow("not readable");

    const capture = await appendReadableCapture("private-source", "RAW_CAPTURE_MARKER");
    await expect(ensureIngestionJobForCaptureVersion(testDb, { sourceId: "other-source", captureVersionId: capture.id })).rejects.toThrow("not readable");
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "safe-worker", expectedStageVersion: 1 }, testDb);
    expect(claim).not.toBeNull();
    const status = await listKnowledgeIngestionJobStatuses(testDb);
    expect(JSON.stringify(status)).not.toContain("RAW_CAPTURE_MARKER");
    expect(JSON.stringify(status)).not.toContain(claim?.fencingToken ?? "");
  });

  test("recovers an expired fenced stage without permitting its old fence to commit", async () => {
    await createSource("recovery");
    await appendReadableCapture("recovery");
    const claimedAt = new Date(Date.now() + 1_000);
    const first = await claimNextKnowledgeIngestionJob({ workerId: "old-worker", now: claimedAt }, testDb);
    if (!first) throw new Error("expected claim");
    await commitKnowledgeIngestionStage({ jobId: first.jobId, expectedStage: "queued", expectedStageVersion: first.stageVersion, fencingToken: first.fencingToken, nextStage: "triaging", checkpoint: { version: 1, completedStage: "triaging", passed: true }, now: claimedAt }, testDb);
    const expiredAt = new Date(first.leaseExpiresAt.getTime() + 1);
    await expect(recoverKnowledgeIngestionJobs(testDb, expiredAt)).resolves.toMatchObject({ recovered: 1 });
    const second = await claimNextKnowledgeIngestionJob({ workerId: "new-worker", now: expiredAt }, testDb);
    expect(second).toMatchObject({ stage: "triaging", checkpoint: { completedStage: "triaging" } });
    await expect(commitKnowledgeIngestionStage({ jobId: first.jobId, expectedStage: "triaging", expectedStageVersion: 2, fencingToken: first.fencingToken, nextStage: "extracting", checkpoint: { version: 1, completedStage: "extracting", candidate: { type: "place", title: "Title", summary: "Summary", locationName: "Place", routeSegment: null, conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, modelId: "extract", modelGatewayName: "extract-model", promptVersion: "v1" } }, now: expiredAt }, testDb)).resolves.toBeNull();
  });

  test("clears checkpoints for terminal and exhausted jobs without exposing them in status", async () => {
    await createSource("checkpoint");
    const capture = await appendReadableCapture("checkpoint", "Checkpoint RAW_CAPTURE_MARKER");
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected claim");
    await commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: "queued", expectedStageVersion: 1, fencingToken: claim.fencingToken, nextStage: "suppressed", now: new Date(Date.now() + 2_000) }, testDb);
    await expect(testDb.select({ checkpoint: knowledgeIngestionJobs.checkpoint }).from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id))).resolves.toEqual([{ checkpoint: null }]);
    expect(JSON.stringify(await listKnowledgeIngestionJobStatuses(testDb))).not.toContain("RAW_CAPTURE_MARKER");
  });

  test("rejects protected or unknown checkpoint fields and terminalizes an exhausted retry with a new version", async () => {
    await createSource("checkpoint-validation");
    await appendReadableCapture("checkpoint-validation");
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected claim");
    const candidate = { type: "place" as const, title: "Title", summary: "Summary", locationName: "Place", routeSegment: null, conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, modelId: "extract", modelGatewayName: "extract-model", promptVersion: "v1", providerPayload: "secret" };
    await expect(commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: "queued", expectedStageVersion: 1, fencingToken: claim.fencingToken, nextStage: "triaging", checkpoint: { version: 1, completedStage: "triaging", passed: true, candidate } as never }, testDb)).rejects.toThrow("Checkpoint is invalid");
    await testDb.update(knowledgeIngestionJobs).set({ attemptCount: 3 }).where(eq(knowledgeIngestionJobs.id, claim.jobId));
    await expect(retryKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: "queued", expectedStageVersion: 1, fencingToken: claim.fencingToken, errorCode: "provider_failed" }, testDb)).resolves.toMatchObject({ stage: "failed", stageVersion: 2, checkpoint: null, lastErrorCode: "retry_exhausted" });
  });

  test("rejects PII in durable judgment and relation checkpoint summaries", async () => {
    await createSource("checkpoint-pii");
    await appendReadableCapture("checkpoint-pii");
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected claim");
    const candidate = { type: "place" as const, title: "Title", summary: "Summary", locationName: "Place", routeSegment: null, conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, modelId: "extract", modelGatewayName: "extract-model", promptVersion: "v1" };
    const checkpoint = { version: 1 as const, completedStage: "judging" as const, candidate, judgment: { decision: "publish" as const, summary: "Liên hệ person@example.com", relevance: .9, extractability: .9, evidenceGrounding: .9, specificity: .9, actionability: .9, firstHandLikelihood: .9, spamCommercialRisk: .1 } };
    await expect(commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: "queued", expectedStageVersion: 1, fencingToken: claim.fencingToken, nextStage: "suppressed", checkpoint }, testDb)).rejects.toThrow("Checkpoint is invalid");
  });

});
