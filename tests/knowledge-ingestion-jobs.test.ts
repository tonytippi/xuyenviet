import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { knowledgeIngestionCandidates, knowledgeIngestionJobs, sources, userRoles } from "@/db/schema";
import { claimNextKnowledgeIngestionJob, ensureIngestionJobForCaptureVersion } from "@/features/knowledge/ingestion-jobs";
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
});
