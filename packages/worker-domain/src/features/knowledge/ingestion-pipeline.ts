import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, knowledgeIngestionCandidates, knowledgeIngestionJobs, sourceCaptureVersions, sources } from "@xuyenviet/database";
import { completeKnowledgeIngestionCandidate, failKnowledgeIngestionCandidate, finalizeKnowledgeIngestionJob, type KnowledgeIngestionCandidateClaim, type KnowledgeIngestionClaim } from "./ingestion-jobs";

type PipelineDb = ReturnType<typeof getDb>;

export type KnowledgeIngestionPipelineResult = { jobId: string; sourceId: string; outcome: "completed" | "failed" | "retry"; candidateCount?: number };

/** Discovery is technical work only; card lifecycle decisions are owned by Story 15.3. */
export async function runKnowledgeIngestionPipeline(claim: KnowledgeIngestionClaim, db: PipelineDb = getDb()): Promise<KnowledgeIngestionPipelineResult | null> {
  return db.transaction(async (tx) => {
    const [capture] = await tx.select({ rawText: sourceCaptureVersions.rawText }).from(knowledgeIngestionJobs).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeIngestionJobs.captureVersionId)).innerJoin(sources, eq(sources.id, knowledgeIngestionJobs.sourceId)).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.sourceId, claim.sourceId), eq(knowledgeIngestionJobs.captureVersionId, claim.captureVersionId), eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), sql`${knowledgeIngestionJobs.leaseExpiresAt} > timezone('UTC', now())`, eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1).for("update");
    const [updated] = await tx.update(knowledgeIngestionJobs).set({ discoveryTerminal: true, status: capture?.rawText?.trim() ? "running" : "failed", lastErrorCode: capture?.rawText?.trim() ? null : "stale_capture", claimedBy: capture?.rawText?.trim() ? null : null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: new Date() }).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken))).returning({ candidateCount: knowledgeIngestionJobs.candidateCount, status: knowledgeIngestionJobs.status });
    if (!updated) return null;
    if (updated.status === "failed") return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "failed" };
    await finalizeKnowledgeIngestionJob(tx, claim.jobId);
    return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "completed", candidateCount: updated.candidateCount };
  });
}

/** Candidate processing records an immutable AI outcome but does not mutate card lifecycle. */
export async function runKnowledgeIngestionCandidatePipeline(claim: KnowledgeIngestionCandidateClaim, db: PipelineDb = getDb()) {
  const [candidate] = await db.select({ id: knowledgeIngestionCandidates.id, captureVersionId: knowledgeIngestionCandidates.captureVersionId }).from(knowledgeIngestionCandidates).where(and(eq(knowledgeIngestionCandidates.id, claim.candidateId), eq(knowledgeIngestionCandidates.ingestionJobId, claim.jobId), eq(knowledgeIngestionCandidates.processingStatus, "processing"), eq(knowledgeIngestionCandidates.fencingToken, claim.fencingToken))).limit(1);
  if (!candidate) return null;
  const [capture] = await db.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, candidate.captureVersionId), eq(sources.currentCaptureVersionId, candidate.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
  if (!capture) return failKnowledgeIngestionCandidate({ candidateId: claim.candidateId, fencingToken: claim.fencingToken, errorCode: "stale_capture" }, db);
  return completeKnowledgeIngestionCandidate({ candidateId: claim.candidateId, fencingToken: claim.fencingToken, disposition: "needs_operator", outcomeReasonCode: "missing_context" }, db);
}
