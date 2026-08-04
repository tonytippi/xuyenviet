import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { knowledgeIngestionCandidates, knowledgeIngestionJobs, sources, userRoles } from "@/db/schema";
import { claimNextKnowledgeIngestionJob, ensureIngestionJobForCaptureVersion, finalizeKnowledgeIngestionJob, recoverKnowledgeIngestionJobs } from "@/features/knowledge/ingestion-jobs";
import { appendSourceCaptureVersion } from "@/features/knowledge/source-captures";

import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

async function createJob(id = "source") {
  await testDb.insert(sources).values({ id, kind: "pasted_text", label: `Source ${id}`, sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
  const capture = await appendSourceCaptureVersion(testDb, { sourceId: id, captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
  const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
  if (!job) throw new Error("expected ingestion job");
  return { capture, job };
}

function candidateValues(jobId: string, captureVersionId: string, overrides: Record<string, unknown> = {}) {
  return { id: crypto.randomUUID(), ingestionJobId: jobId, sourceId: "source", captureVersionId, fingerprint: crypto.randomUUID(), type: "place" as const, title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", ...overrides };
}

async function rejectionMessage(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    let current: unknown = error;
    while (current instanceof Error) {
      if (current.message.includes("Completed candidate AI decision is immutable")) return current.message;
      current = current.cause;
    }
  }
  throw new Error("Expected candidate decision immutability rejection");
}

describe("target knowledge ingestion jobs", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedTestOperator();
    await testDb.insert(userRoles).values({ userId: "operator", role: "operator" });
  });

  test("creates and claims one queued technical job without legacy stages", async () => {
    const { capture } = await createJob();

    await expect(ensureIngestionJobForCaptureVersion(testDb, { sourceId: "source", captureVersionId: capture.id })).resolves.toMatchObject({ captureVersionId: capture.id, status: "queued", discoveryTerminal: false, candidateCount: 0, completedCandidateCount: 0, needsOperatorCandidateCount: 0, failedCandidateCount: 0 });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "worker", now: new Date(Date.now() + 1_000) }, testDb);
    expect(claim).toMatchObject({ status: "running", attemptCount: 1 });
    await expect(testDb.select({ status: knowledgeIngestionJobs.status }).from(knowledgeIngestionJobs)).resolves.toEqual([{ status: "running" }]);
  });

  test("enforces target candidate completion and failed decision shapes", async () => {
    const { capture, job } = await createJob();

    const invalidCompletedCandidate = candidateValues(job.id, capture.id);
    await expect(testDb.execute(sql`
      insert into knowledge_ingestion_candidates (
        id, ingestion_job_id, source_id, capture_version_id, fingerprint, type, title, summary,
        conditions, span_start, span_end, extraction_prompt_version,
        processing_status, ai_disposition, outcome_reason_code
      ) values (
        ${invalidCompletedCandidate.id}, ${job.id}, 'source', ${capture.id}, ${invalidCompletedCandidate.fingerprint},
        'place', 'Điểm dừng', 'Có điểm dừng phù hợp.', '[]'::jsonb, 0, 1, 'test',
        'completed', 'invalid_disposition', 'applied'
      )
    `)).rejects.toThrow();
    const failedCandidate = candidateValues(job.id, capture.id);
    await testDb.insert(knowledgeIngestionCandidates).values(failedCandidate);
    await expect(testDb.update(knowledgeIngestionCandidates).set({ processingStatus: "failed", aiDisposition: "discard", outcomeReasonCode: "policy_rejected" }).where(eq(knowledgeIngestionCandidates.id, failedCandidate.id))).rejects.toThrow();
    await expect(testDb.insert(knowledgeIngestionCandidates).values(candidateValues(job.id, capture.id, { processingStatus: "completed", aiDisposition: "apply", outcomeReasonCode: "applied" }))).resolves.toBeDefined();
  });

  test("rejects later AI disposition or reason changes after candidate completion", async () => {
    const { capture, job } = await createJob();
    const candidate = candidateValues(job.id, capture.id, { processingStatus: "completed", aiDisposition: "needs_operator", outcomeReasonCode: "verification_required" });
    await testDb.insert(knowledgeIngestionCandidates).values(candidate);

    await expect(rejectionMessage(testDb.execute(sql`update knowledge_ingestion_candidates set ai_disposition = 'discard' where id = ${candidate.id}`))).resolves.toContain("Completed candidate AI decision is immutable");
    await expect(rejectionMessage(testDb.execute(sql`update knowledge_ingestion_candidates set outcome_reason_code = 'weak_evidence' where id = ${candidate.id}`))).resolves.toContain("Completed candidate AI decision is immutable");
  });

  test("derives exact mixed counters and completes only after terminal discovery and candidates", async () => {
    const { capture, job } = await createJob();
    await testDb.update(knowledgeIngestionJobs).set({ status: "running" }).where(eq(knowledgeIngestionJobs.id, job.id));
    await testDb.insert(knowledgeIngestionCandidates).values([
      candidateValues(job.id, capture.id, { processingStatus: "completed", aiDisposition: "apply", outcomeReasonCode: "applied" }),
      candidateValues(job.id, capture.id, { processingStatus: "completed", aiDisposition: "needs_operator", outcomeReasonCode: "verification_required" }),
      candidateValues(job.id, capture.id, { processingStatus: "failed" }),
    ]);

    await finalizeKnowledgeIngestionJob(testDb, job.id);
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, job.id))).resolves.toMatchObject([{ status: "running", candidateCount: 3, completedCandidateCount: 2, needsOperatorCandidateCount: 1, failedCandidateCount: 1 }]);
    await testDb.update(knowledgeIngestionJobs).set({ discoveryTerminal: true }).where(eq(knowledgeIngestionJobs.id, job.id));
    await finalizeKnowledgeIngestionJob(testDb, job.id);
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, job.id))).resolves.toMatchObject([{ status: "completed", candidateCount: 3, completedCandidateCount: 2, needsOperatorCandidateCount: 1, failedCandidateCount: 1, claimedBy: null }]);
  });

  test("recovers an expired processing candidate and terminalizes an exhausted candidate without a business outcome", async () => {
    const { capture, job } = await createJob();
    const now = new Date();
    await testDb.update(knowledgeIngestionJobs).set({ status: "running", discoveryTerminal: true }).where(eq(knowledgeIngestionJobs.id, job.id));
    await testDb.insert(knowledgeIngestionCandidates).values([
      candidateValues(job.id, capture.id, { id: "retry", processingStatus: "processing", attemptCount: 1, maxAttempts: 3, claimedBy: "worker", claimedAt: new Date(0), leaseExpiresAt: new Date(1), fencingToken: "a".repeat(64) }),
      candidateValues(job.id, capture.id, { id: "exhausted", processingStatus: "processing", attemptCount: 3, maxAttempts: 3, claimedBy: "worker", claimedAt: new Date(0), leaseExpiresAt: new Date(1), fencingToken: "b".repeat(64) }),
    ]);

    await expect(recoverKnowledgeIngestionJobs(testDb, now)).resolves.toMatchObject({ recoveredCandidates: [{ id: "retry" }], exhaustedCandidates: [{ id: "exhausted" }] });
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(sql`${knowledgeIngestionCandidates.id} in ('retry', 'exhausted')`).orderBy(knowledgeIngestionCandidates.id)).resolves.toMatchObject([
      { id: "exhausted", processingStatus: "failed", claimedBy: null, fencingToken: null, aiDisposition: null, outcomeReasonCode: null },
      { id: "retry", processingStatus: "queued", claimedBy: null, fencingToken: null, aiDisposition: null, outcomeReasonCode: null },
    ]);
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, job.id))).resolves.toMatchObject([{ status: "running", candidateCount: 2, completedCandidateCount: 0, failedCandidateCount: 1 }]);
  });

  test("does not recover a discovery-terminal parent while candidates own processing", async () => {
    const { capture, job } = await createJob();
    const now = new Date();
    await testDb.update(knowledgeIngestionJobs).set({ status: "running", discoveryTerminal: true, attemptCount: 1, claimedBy: "discovery-worker", claimedAt: new Date(0), leaseExpiresAt: new Date(1), fencingToken: "a".repeat(64) }).where(eq(knowledgeIngestionJobs.id, job.id));
    await testDb.insert(knowledgeIngestionCandidates).values(candidateValues(job.id, capture.id, { processingStatus: "queued" }));

    await expect(recoverKnowledgeIngestionJobs(testDb, now)).resolves.toMatchObject({ recovered: 0, exhausted: 0 });
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, job.id))).resolves.toMatchObject([{ status: "running", discoveryTerminal: true, claimedBy: "discovery-worker", fencingToken: "a".repeat(64) }]);
  });
});
