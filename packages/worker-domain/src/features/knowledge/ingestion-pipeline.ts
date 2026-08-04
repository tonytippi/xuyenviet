import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { KnowledgeRelationFact } from "@xuyenviet/domain";
import { completeExtraction, getDb, knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, lockKnowledgeIngestionJob, projectAndFinalizeKnowledgeIngestionJob, selectActiveAiGatewayModel, sourceKnowledgeSuggestionPurpose, sourceCaptureVersions, sources, transitionKnowledgeCard } from "@xuyenviet/database";
import { failKnowledgeIngestionCandidate, type KnowledgeIngestionCandidateClaim, type KnowledgeIngestionClaim } from "./ingestion-jobs";

type PipelineDb = ReturnType<typeof getDb>;

export type KnowledgeIngestionPipelineResult = { jobId: string; sourceId: string; outcome: "completed" | "failed" | "retry"; candidateCount?: number };

/** Discovery is technical work only; card lifecycle decisions are owned by Story 15.3. */
export type DiscoveredCandidate = Readonly<{ fingerprint: string; type: "place" | "activity" | "route_note" | "general_travel_tip"; title: string; summary: string; spanStart: number; spanEnd: number; locationName?: string | null; routeSegment?: string | null; conditions?: string[]; freshnessSensitive?: boolean; practicalDetails?: Record<string, unknown>; tags?: string[] }>;
export type CandidateDiscoverer = (input: { captureText: string }) => Promise<DiscoveredCandidate[]>;

/** Discovery persists only validated facts before terminalizing the parent lease. */
export async function runKnowledgeIngestionPipeline(claim: KnowledgeIngestionClaim, db: PipelineDb = getDb(), discover: CandidateDiscoverer = discoverCandidates): Promise<KnowledgeIngestionPipelineResult | null> {
  let discovered: DiscoveredCandidate[];
  try {
    const [capture] = await db.select({ rawText: sourceCaptureVersions.rawText }).from(knowledgeIngestionJobs).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeIngestionJobs.captureVersionId)).innerJoin(sources, eq(sources.id, knowledgeIngestionJobs.sourceId)).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.discoveryTerminal, false), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), gt(knowledgeIngestionJobs.leaseExpiresAt, new Date()), eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
    if (!capture?.rawText?.trim()) return null;
    discovered = await discover({ captureText: capture.rawText });
    const captureLength = Array.from(capture.rawText).length;
    if (!discovered.every((candidate) => validDiscoveredCandidate(candidate, captureLength))) throw new Error("invalid_discovery_candidate");
  } catch {
    return db.transaction(async (tx) => {
      const [failed] = await tx.update(knowledgeIngestionJobs).set({ status: "failed", lastErrorCode: "discovery_failed", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: new Date() }).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.discoveryTerminal, false), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), gt(knowledgeIngestionJobs.leaseExpiresAt, new Date()), sql`exists (select 1 from sources join source_capture_versions on source_capture_versions.id = sources.current_capture_version_id where sources.id = ${claim.sourceId} and sources.current_capture_version_id = ${claim.captureVersionId} and sources.eligibility = 'eligible' and source_capture_versions.payload_deleted_at is null)`)).returning({ id: knowledgeIngestionJobs.id });
      return failed ? { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "failed" as const } : null;
    });
  }
  return db.transaction(async (tx) => {
    const [capture] = await tx.select({ rawText: sourceCaptureVersions.rawText }).from(knowledgeIngestionJobs).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeIngestionJobs.captureVersionId)).innerJoin(sources, eq(sources.id, knowledgeIngestionJobs.sourceId)).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.sourceId, claim.sourceId), eq(knowledgeIngestionJobs.captureVersionId, claim.captureVersionId), eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.discoveryTerminal, false), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), sql`${knowledgeIngestionJobs.leaseExpiresAt} > timezone('UTC', now())`, eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1).for("update");
    if (!capture?.rawText?.trim()) return null;
    for (const candidate of discovered) {
      await tx.insert(knowledgeIngestionCandidates).values({ ingestionJobId: claim.jobId, sourceId: claim.sourceId, captureVersionId: claim.captureVersionId, fingerprint: candidate.fingerprint, type: candidate.type, title: candidate.title.trim(), summary: candidate.summary.trim(), locationName: candidate.locationName?.trim() || null, routeSegment: candidate.routeSegment?.trim() || null, conditions: candidate.conditions ?? [], freshnessSensitive: candidate.freshnessSensitive ?? false, practicalDetails: candidate.practicalDetails ?? {}, tags: candidate.tags ?? [], spanStart: candidate.spanStart, spanEnd: candidate.spanEnd, extractionPromptVersion: "knowledge-ingestion-discovery-v1" }).onConflictDoNothing();
    }
    const [updated] = await tx.update(knowledgeIngestionJobs).set({ discoveryTerminal: true, lastErrorCode: null, updatedAt: new Date() }).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), gt(knowledgeIngestionJobs.leaseExpiresAt, new Date()))).returning({ candidateCount: knowledgeIngestionJobs.candidateCount, status: knowledgeIngestionJobs.status });
    if (!updated) return null;
    if (updated.status === "failed") return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "failed" };
    await projectAndFinalizeKnowledgeIngestionJob(tx, claim.jobId);
    return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "completed", candidateCount: discovered.length };
  });
}

/** The system supplies a bounded relation context; the lifecycle command owns persistence. */
export type CandidateRelationDecision = Readonly<{ disposition: "apply" | "needs_operator"; outcomeReasonCode: "applied" | "verification_required" | "relation_ambiguous" | "missing_context" | "conflict"; relation: KnowledgeRelationFact }> | Readonly<{ disposition: "discard"; outcomeReasonCode: "weak_evidence" | "policy_rejected" }>;
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
  if (decision.disposition === "discard") return completeDiscardedCandidate(claim, decision, db);
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

async function completeDiscardedCandidate(claim: KnowledgeIngestionCandidateClaim, decision: Extract<CandidateRelationDecision, { disposition: "discard" }>, db: PipelineDb) {
  return db.transaction(async (tx) => {
    const [ownedCandidate] = await tx.select({ ingestionJobId: knowledgeIngestionCandidates.ingestionJobId }).from(knowledgeIngestionCandidates).where(and(eq(knowledgeIngestionCandidates.id, claim.candidateId), eq(knowledgeIngestionCandidates.processingStatus, "processing"), eq(knowledgeIngestionCandidates.fencingToken, claim.fencingToken), gt(knowledgeIngestionCandidates.leaseExpiresAt, new Date()))).limit(1).for("update");
    if (!ownedCandidate) return null;
    await lockKnowledgeIngestionJob(tx, ownedCandidate.ingestionJobId);
    const [candidate] = await tx.update(knowledgeIngestionCandidates).set({ processingStatus: "completed", aiDisposition: "discard", outcomeReasonCode: decision.outcomeReasonCode, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: new Date() }).where(and(eq(knowledgeIngestionCandidates.id, claim.candidateId), eq(knowledgeIngestionCandidates.processingStatus, "processing"), eq(knowledgeIngestionCandidates.fencingToken, claim.fencingToken), gt(knowledgeIngestionCandidates.leaseExpiresAt, new Date()))).returning({ ingestionJobId: knowledgeIngestionCandidates.ingestionJobId });
    if (!candidate) return null;
    await projectAndFinalizeKnowledgeIngestionJob(tx, candidate.ingestionJobId);
    return { processingStatus: "completed" as const, ingestionJobId: candidate.ingestionJobId };
  });
}

async function decideCandidateRelation(input: Parameters<CandidateRelationDecider>[0], db: PipelineDb): Promise<CandidateRelationDecision> {
  const model = await selectActiveAiGatewayModel({ purpose: sourceKnowledgeSuggestionPurpose, requiredCapabilities: { textInput: true, extraction: true }, db });
  if (!model) throw new Error("relation_model_unavailable");
  const result = await completeExtraction({ model: model.gatewayModelName, messages: [{ role: "system", content: "Return strict JSON only: {kind,rationale,target_card_id?,discard_reason?}. kind is attach, create, conflict, ambiguous, or discard. target_card_id is required only for attach/conflict and must be one of shortlist ids. discard_reason is required only for discard and is weak_evidence or policy_rejected. Do not invent ids." }, { role: "user", content: JSON.stringify({ candidate: input.candidate, shortlist: input.shortlist }) }] });
  if (!result.ok) throw new Error(result.errorCode);
  const value = JSON.parse(result.content) as Record<string, unknown>;
  const rationale = typeof value.rationale === "string" ? value.rationale.trim() : "";
  const kind = typeof value.kind === "string" ? value.kind : "";
  const shortlistCardIds = input.shortlist.map((card) => card.id);
  if (!rationale || !["attach", "create", "conflict", "ambiguous", "discard"].includes(String(kind))) throw new Error("invalid_relation_output");
  if (kind === "discard") {
    const outcomeReasonCode = value.discard_reason;
    if (outcomeReasonCode !== "weak_evidence" && outcomeReasonCode !== "policy_rejected") throw new Error("invalid_discard_reason");
    return { disposition: "discard", outcomeReasonCode };
  }
  if (kind === "create") return { disposition: "apply", outcomeReasonCode: "applied", relation: { kind: "create", rationale } };
  if (kind === "ambiguous") return { disposition: "needs_operator", outcomeReasonCode: "relation_ambiguous", relation: { kind: "ambiguous", rationale, shortlistCardIds } };
  const targetCardId = typeof value.target_card_id === "string" ? value.target_card_id : "";
  if (!shortlistCardIds.includes(targetCardId)) throw new Error("invalid_relation_target");
  return kind === "conflict" ? { disposition: "needs_operator", outcomeReasonCode: "conflict", relation: { kind: "conflict", rationale, targetCardId, shortlistCardIds } } : { disposition: "apply", outcomeReasonCode: "applied", relation: { kind: "attach", rationale, targetCardId, shortlistCardIds } };
}

async function discoverCandidates(input: { captureText: string }): Promise<DiscoveredCandidate[]> {
  const model = await selectActiveAiGatewayModel({ purpose: sourceKnowledgeSuggestionPurpose, requiredCapabilities: { textInput: true, extraction: true } });
  if (!model) throw new Error("discovery_model_unavailable");
  const result = await completeExtraction({ model: model.gatewayModelName, messages: [{ role: "system", content: "Return strict JSON only: {candidates:[{fingerprint,type,title,summary,span_start,span_end}]}. Every span is zero-based Unicode code points in the supplied immutable capture." }, { role: "user", content: input.captureText }] });
  if (!result.ok) throw new Error(result.errorCode);
  const parsed = JSON.parse(result.content) as { candidates?: unknown };
  if (!Array.isArray(parsed.candidates)) throw new Error("invalid_discovery_output");
  return parsed.candidates.map((value) => normalizeDiscoveredCandidate(value));
}

function normalizeDiscoveredCandidate(value: unknown): DiscoveredCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_discovery_candidate");
  const row = value as Record<string, unknown>;
  return { fingerprint: typeof row.fingerprint === "string" ? row.fingerprint : "", type: row.type as DiscoveredCandidate["type"], title: typeof row.title === "string" ? row.title : "", summary: typeof row.summary === "string" ? row.summary : "", spanStart: row.span_start as number, spanEnd: row.span_end as number };
}

function validDiscoveredCandidate(candidate: DiscoveredCandidate, captureLength: number) {
  return candidate.fingerprint.trim().length > 0 && candidate.fingerprint.length <= 512 && ["place", "activity", "route_note", "general_travel_tip"].includes(candidate.type) && candidate.title.trim().length > 0 && candidate.title.trim().length <= 160 && candidate.summary.trim().length > 0 && candidate.summary.trim().length <= 1200 && Number.isInteger(candidate.spanStart) && Number.isInteger(candidate.spanEnd) && candidate.spanStart >= 0 && candidate.spanEnd > candidate.spanStart && candidate.spanEnd <= captureLength;
}
