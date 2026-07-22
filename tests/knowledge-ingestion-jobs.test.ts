import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";

import { knowledgeIngestionJobs, sourceCaptureVersions, sources, users } from "@/db/schema";
import { claimNextKnowledgeIngestionJob, commitKnowledgeIngestionStage, ensureIngestionJobForCaptureVersion, listKnowledgeIngestionJobStatuses, recoverKnowledgeIngestionJobs, retryKnowledgeIngestionStage } from "@/features/knowledge/ingestion-jobs";
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
      { sourceId: "source-one", captureVersionId: capture.id, submittedByUserId: "operator", submittedByEmail: "operator@example.com", stage: "queued", stageVersion: 1, attemptCount: 0, maxAttempts: 3, claimedBy: null, fencingToken: null },
    ]);
    await expect(ensureIngestionJobForCaptureVersion(testDb, { sourceId: "source-one", captureVersionId: capture.id })).resolves.toMatchObject({ captureVersionId: capture.id, submittedByEmail: "operator@example.com" });
    await expect(testDb.select().from(knowledgeIngestionJobs)).resolves.toHaveLength(1);
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
    const now = new Date("2026-07-22T23:00:00.000Z");

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

  test("backfills only readable retained versions with immutable source submitter provenance", async () => {
    await createSource("migration-readable");
    await createSource("migration-unreadable");
    await createSource("migration-tombstoned");
    await testDb.insert(sourceCaptureVersions).values([
      { id: "migration-readable-version", sourceId: "migration-readable", versionSequence: 1, captureKind: "pasted_text", rawText: "Readable historical capture.", contentHash: hashCaptureText("Readable historical capture."), capturedAt: new Date("2026-01-01T00:00:00.000Z") },
      { id: "migration-unreadable-version", sourceId: "migration-unreadable", versionSequence: 1, captureKind: "pasted_text", rawText: null, contentHash: hashCaptureText("unreadable"), capturedAt: new Date("2026-01-01T00:00:00.000Z") },
      { id: "migration-tombstoned-version", sourceId: "migration-tombstoned", versionSequence: 1, captureKind: "pasted_text", rawText: null, contentHash: hashCaptureText("tombstoned"), capturedAt: new Date("2026-01-01T00:00:00.000Z"), payloadDeletedAt: new Date("2026-02-01T00:00:00.000Z") },
    ]);

    const migration = readFileSync(resolve(process.cwd(), "drizzle/migrations/0043_wealthy_glorian.sql"), "utf8");
    const schemaName = `migration_0043_${randomUUID().replaceAll("-", "")}`;
    const scopedMigration = migration.replaceAll('"public".', `"${schemaName}".`);

    await testDb.transaction(async (transaction) => {
      await transaction.execute(sql.raw(`create schema "${schemaName}"`));
      await transaction.execute(sql.raw(`create table "${schemaName}".users (id text primary key, email text not null)`));
      await transaction.execute(sql.raw(`create table "${schemaName}".sources (id text primary key, submitted_by_user_id text not null)`));
      await transaction.execute(sql.raw(`create table "${schemaName}".source_capture_versions (id text not null, source_id text not null, payload_deleted_at timestamp, raw_text text, primary key (id, source_id))`));
      await transaction.execute(sql.raw(`insert into "${schemaName}".users values ('operator', 'operator@example.com')`));
      await transaction.execute(sql.raw(`insert into "${schemaName}".sources values ('migration-readable', 'operator'), ('migration-unreadable', 'operator'), ('migration-tombstoned', 'operator')`));
      await transaction.execute(sql.raw(`insert into "${schemaName}".source_capture_versions values ('migration-readable-version', 'migration-readable', null, 'Readable historical capture.'), ('migration-unreadable-version', 'migration-unreadable', null, null), ('migration-tombstoned-version', 'migration-tombstoned', now(), 'Tombstoned historical capture.')`));
      await transaction.execute(sql.raw(`set local search_path to "${schemaName}"`));
      for (const statement of scopedMigration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await transaction.execute(sql.raw(statement));

      await expect(transaction.execute(sql`select capture_version_id, source_id, submitted_by_user_id, submitted_by_email, stage, stage_version, attempt_count from knowledge_ingestion_jobs`)).resolves.toEqual([
        { capture_version_id: "migration-readable-version", source_id: "migration-readable", submitted_by_user_id: "operator", submitted_by_email: "operator@example.com", stage: "queued", stage_version: 1, attempt_count: 0 },
      ]);
    });
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

  test("migration 0045 clears unrecoverable staged jobs while preserving queued jobs", async () => {
    const migration = readFileSync(resolve(process.cwd(), "drizzle/migrations/0045_recover_knowledge_ingestion_jobs.sql"), "utf8");
    const schemaName = `migration_0045_${randomUUID().replaceAll("-", "")}`;
    await testDb.transaction(async (transaction) => {
      await transaction.execute(sql.raw(`create schema "${schemaName}"`));
      await transaction.execute(sql.raw(`create table "${schemaName}"."knowledge_ingestion_jobs" (id text primary key, stage text not null, stage_version integer not null, last_error_code text, requeue_reason_code text, claimed_by text, claimed_at timestamp, lease_expires_at timestamp, fencing_token text, updated_at timestamp)`));
      await transaction.execute(sql.raw(`insert into "${schemaName}"."knowledge_ingestion_jobs" (id, stage, stage_version, claimed_by, claimed_at, lease_expires_at, fencing_token) values ('staged', 'extracting', 2, 'worker', now(), now() + interval '1 minute', '${"a".repeat(64)}'), ('queued', 'queued', 1, null, null, null, null)`));
      await transaction.execute(sql.raw(`set local search_path to "${schemaName}"`));
      for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await transaction.execute(sql.raw(statement));
      await expect(transaction.execute(sql.raw(`select id, stage, stage_version, checkpoint, claimed_by from "${schemaName}"."knowledge_ingestion_jobs" order by id`))).resolves.toEqual([{ id: "queued", stage: "queued", stage_version: 1, checkpoint: null, claimed_by: null }, { id: "staged", stage: "failed", stage_version: 3, checkpoint: null, claimed_by: null }]);
    });
  });
});
