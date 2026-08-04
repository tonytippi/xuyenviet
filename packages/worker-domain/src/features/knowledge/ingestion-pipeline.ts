import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { KnowledgeRelationFact } from "@xuyenviet/domain";
import { completeExtraction, getDb, knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, selectActiveAiGatewayModel, sourceKnowledgeSuggestionPurpose, sourceCaptureVersions, sources, transitionKnowledgeCard } from "@xuyenviet/database";
import { failKnowledgeIngestionCandidate, finalizeKnowledgeIngestionJob, type KnowledgeIngestionCandidateClaim, type KnowledgeIngestionClaim } from "./ingestion-jobs";

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

/** The system supplies a bounded relation context; the lifecycle command owns persistence. */
export type CandidateRelationDecision = Readonly<{ disposition: "apply" | "needs_operator"; outcomeReasonCode: "applied" | "verification_required" | "relation_ambiguous" | "missing_context" | "conflict"; relation: KnowledgeRelationFact }>;
export type CandidateRelationDecider = (input: { candidate: { id: string; type: string; title: string; summary: string }; shortlist: Array<{ id: string; title: string; summary: string }> }) => Promise<CandidateRelationDecision>;

export async function runKnowledgeIngestionCandidatePipeline(claim: KnowledgeIngestionCandidateClaim, db: PipelineDb = getDb(), decideRelation?: CandidateRelationDecider) {
  const [candidate] = await db.select({ id: knowledgeIngestionCandidates.id, captureVersionId: knowledgeIngestionCandidates.captureVersionId, type: knowledgeIngestionCandidates.type, title: knowledgeIngestionCandidates.title, summary: knowledgeIngestionCandidates.summary }).from(knowledgeIngestionCandidates).where(and(eq(knowledgeIngestionCandidates.id, claim.candidateId), eq(knowledgeIngestionCandidates.ingestionJobId, claim.jobId), eq(knowledgeIngestionCandidates.processingStatus, "processing"), eq(knowledgeIngestionCandidates.fencingToken, claim.fencingToken))).limit(1);
  if (!candidate) return null;
  const [capture] = await db.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, candidate.captureVersionId), eq(sources.currentCaptureVersionId, candidate.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
  if (!capture) return failKnowledgeIngestionCandidate({ candidateId: claim.candidateId, fencingToken: claim.fencingToken, errorCode: "stale_capture" }, db);
  const shortlist = await db.select({ id: knowledgeCards.id, title: knowledgeCards.title, summary: knowledgeCards.summary }).from(knowledgeCards).where(and(eq(knowledgeCards.type, candidate.type), inArray(knowledgeCards.lifecycleState, ["draft", "pending_operator", "active", "suppressed"]))).orderBy(asc(knowledgeCards.id)).limit(20);
  let decision: CandidateRelationDecision;
  try {
    decision = decideRelation ? await decideRelation({ candidate: { id: candidate.id, type: candidate.type, title: candidate.title, summary: candidate.summary }, shortlist }) : await decideCandidateRelation({ candidate: { id: candidate.id, type: candidate.type, title: candidate.title, summary: candidate.summary }, shortlist }, db);
  } catch {
    return failKnowledgeIngestionCandidate({ candidateId: claim.candidateId, fencingToken: claim.fencingToken, errorCode: "relation_decision_failed" }, db);
  }
  const transition = await transitionKnowledgeCard({
    actor: { kind: "system", system: "system-knowledge-pipeline" },
    fences: { candidateFencingToken: claim.fencingToken },
    trigger: {
      kind: "candidate_relation",
      candidateId: claim.candidateId,
      ...decision,
    },
  }, db);
  return transition.status === "invalid"
    ? failKnowledgeIngestionCandidate({ candidateId: claim.candidateId, fencingToken: claim.fencingToken, errorCode: "invalid_relation" }, db)
    : transition;
}

async function decideCandidateRelation(input: Parameters<CandidateRelationDecider>[0], db: PipelineDb): Promise<CandidateRelationDecision> {
  const model = await selectActiveAiGatewayModel({ purpose: sourceKnowledgeSuggestionPurpose, requiredCapabilities: { textInput: true, extraction: true }, db });
  if (!model) throw new Error("relation_model_unavailable");
  const result = await completeExtraction({ model: model.gatewayModelName, messages: [{ role: "system", content: "Return strict JSON only: {kind,rationale,target_card_id?}. kind is attach, create, conflict, or ambiguous. target_card_id is required only for attach/conflict and must be one of shortlist ids. Do not invent ids." }, { role: "user", content: JSON.stringify({ candidate: input.candidate, shortlist: input.shortlist }) }] });
  if (!result.ok) throw new Error(result.errorCode);
  const value = JSON.parse(result.content) as Record<string, unknown>;
  const rationale = typeof value.rationale === "string" ? value.rationale.trim() : "";
  const kind = typeof value.kind === "string" ? value.kind : "";
  const shortlistCardIds = input.shortlist.map((card) => card.id);
  if (!rationale || !["attach", "create", "conflict", "ambiguous"].includes(String(kind))) throw new Error("invalid_relation_output");
  if (kind === "create") return { disposition: "apply", outcomeReasonCode: "applied", relation: { kind: "create", rationale } };
  if (kind === "ambiguous") return { disposition: "needs_operator", outcomeReasonCode: "relation_ambiguous", relation: { kind: "ambiguous", rationale, shortlistCardIds } };
  const targetCardId = typeof value.target_card_id === "string" ? value.target_card_id : "";
  if (!shortlistCardIds.includes(targetCardId)) throw new Error("invalid_relation_target");
  return kind === "conflict" ? { disposition: "needs_operator", outcomeReasonCode: "conflict", relation: { kind: "conflict", rationale, targetCardId, shortlistCardIds } } : { disposition: "apply", outcomeReasonCode: "applied", relation: { kind: "attach", rationale, targetCardId, shortlistCardIds } };
}
