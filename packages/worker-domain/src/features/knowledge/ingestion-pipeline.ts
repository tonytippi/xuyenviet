import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { KnowledgeRelationFact } from "@xuyenviet/domain";
import { buildKnowledgePipelineMultiFactExtractionMessages, completeExtraction, getDb, knowledgeCards, knowledgeCardTypeValues, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgePipelineExtractionPurpose, knowledgePipelineMultiFactExtractionPromptVersion, lockKnowledgeIngestionJob, projectAndFinalizeKnowledgeIngestionJob, selectActiveAiGatewayModel, sourceKnowledgeSuggestionPurpose, sourceCaptureVersions, sources, transitionKnowledgeCard, type KnowledgeCardType } from "@xuyenviet/database";
import { failKnowledgeIngestionCandidate, type KnowledgeIngestionCandidateClaim, type KnowledgeIngestionClaim } from "./ingestion-jobs";

type PipelineDb = ReturnType<typeof getDb>;

export type KnowledgeIngestionPipelineResult = { jobId: string; sourceId: string; outcome: "completed" | "failed" | "retry"; candidateCount?: number };

/** Discovery is technical work only; card lifecycle decisions are owned by Story 15.3. */
export type DiscoveredCandidate = Readonly<{ fingerprint: string; type: KnowledgeCardType; title: string; summary: string; spanStart: number; spanEnd: number; locationName?: string | null; routeSegment?: string | null; conditions?: string[]; freshnessSensitive?: boolean; practicalDetails?: Record<string, unknown>; tags?: string[] }>;
export type CandidateDiscoverer = (input: { captureText: string }) => Promise<DiscoveredCandidate[]>;

type DiscoveryFailureCode = "discovery_model_unavailable" | "discovery_gateway_http_error" | "discovery_gateway_network_error" | "discovery_invalid_gateway_response" | "discovery_client_stream_aborted" | "discovery_invalid_output" | "discovery_failed";
const discoveryRetryBackoffMs = [30_000, 120_000, 300_000] as const;

export class DiscoveryFailure extends Error {
  constructor(readonly code: Exclude<DiscoveryFailureCode, "discovery_failed">) {
    super(code);
  }
}

/** Discovery persists only validated facts before terminalizing the parent lease. */
export async function runKnowledgeIngestionPipeline(claim: KnowledgeIngestionClaim, db: PipelineDb = getDb(), discover: CandidateDiscoverer = discoverCandidates): Promise<KnowledgeIngestionPipelineResult | null> {
  let discovered: DiscoveredCandidate[];
  try {
    const [capture] = await db.select({ rawText: sourceCaptureVersions.rawText }).from(knowledgeIngestionJobs).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeIngestionJobs.captureVersionId)).innerJoin(sources, eq(sources.id, knowledgeIngestionJobs.sourceId)).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.discoveryTerminal, false), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), gt(knowledgeIngestionJobs.leaseExpiresAt, new Date()), eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
    if (!capture?.rawText?.trim()) return null;
    discovered = await discover({ captureText: capture.rawText });
    const captureLength = Array.from(capture.rawText).length;
    if (!discovered.every((candidate) => validDiscoveredCandidate(candidate, captureLength))) throw new DiscoveryFailure("discovery_invalid_output");
  } catch (error) {
    const errorCode: DiscoveryFailureCode = error instanceof DiscoveryFailure ? error.code : "discovery_failed";
    const retryable = isRetryableDiscoveryFailure(errorCode) && claim.attemptCount < claim.maxAttempts;
    const now = new Date();
    return db.transaction(async (tx) => {
      const [updated] = await tx.update(knowledgeIngestionJobs).set(retryable ? { status: "queued", nextRunAt: new Date(now.getTime() + discoveryRetryDelayMs(claim.attemptCount)), lastErrorCode: errorCode, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now } : { status: "failed", lastErrorCode: errorCode, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now }).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.discoveryTerminal, false), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), gt(knowledgeIngestionJobs.leaseExpiresAt, now), sql`exists (select 1 from sources join source_capture_versions on source_capture_versions.id = sources.current_capture_version_id where sources.id = ${claim.sourceId} and sources.current_capture_version_id = ${claim.captureVersionId} and sources.eligibility = 'eligible' and source_capture_versions.payload_deleted_at is null)`)).returning({ id: knowledgeIngestionJobs.id });
      return updated ? { jobId: claim.jobId, sourceId: claim.sourceId, outcome: retryable ? "retry" as const : "failed" as const } : null;
    });
  }
  return db.transaction(async (tx) => {
    const [capture] = await tx.select({ rawText: sourceCaptureVersions.rawText }).from(knowledgeIngestionJobs).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeIngestionJobs.captureVersionId)).innerJoin(sources, eq(sources.id, knowledgeIngestionJobs.sourceId)).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.sourceId, claim.sourceId), eq(knowledgeIngestionJobs.captureVersionId, claim.captureVersionId), eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.discoveryTerminal, false), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), sql`${knowledgeIngestionJobs.leaseExpiresAt} > timezone('UTC', now())`, eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1).for("update");
    if (!capture?.rawText?.trim()) return null;
    for (const candidate of discovered) {
      await tx.insert(knowledgeIngestionCandidates).values({ ingestionJobId: claim.jobId, sourceId: claim.sourceId, captureVersionId: claim.captureVersionId, fingerprint: candidate.fingerprint, type: candidate.type, title: candidate.title.trim(), summary: candidate.summary.trim(), locationName: candidate.locationName?.trim() || null, routeSegment: candidate.routeSegment?.trim() || null, conditions: candidate.conditions ?? [], freshnessSensitive: candidate.freshnessSensitive ?? false, practicalDetails: candidate.practicalDetails ?? {}, tags: candidate.tags ?? [], spanStart: candidate.spanStart, spanEnd: candidate.spanEnd, extractionPromptVersion: knowledgePipelineMultiFactExtractionPromptVersion }).onConflictDoNothing();
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
  const model = await selectActiveAiGatewayModel({ purpose: knowledgePipelineExtractionPurpose, requiredCapabilities: { textInput: true, extraction: true } });
  if (!model) throw new DiscoveryFailure("discovery_model_unavailable");
  const result = await completeExtraction({ model: model.gatewayModelName, messages: buildKnowledgePipelineMultiFactExtractionMessages({ source: { kind: "facebook_capture" }, rawText: input.captureText }) });
  if (!result.ok) throw new DiscoveryFailure(discoveryGatewayFailureCode(result.errorCode));
  try {
    const parsed = JSON.parse(result.content) as { candidates?: unknown };
    if (!Array.isArray(parsed.candidates)) throw new Error("missing_candidates");
    if (parsed.candidates.length > 100) throw new Error("too_many_candidates");
    return parsed.candidates.map((value) => normalizeDiscoveredCandidate(value, input.captureText));
  } catch (error) {
    logInvalidDiscoveryOutput(error);
    throw new DiscoveryFailure("discovery_invalid_output");
  }
}

function discoveryGatewayFailureCode(errorCode: string): Exclude<DiscoveryFailureCode, "discovery_model_unavailable" | "discovery_invalid_output" | "discovery_failed"> {
  if (errorCode === "gateway_http_error") return "discovery_gateway_http_error";
  if (errorCode === "gateway_network_error") return "discovery_gateway_network_error";
  if (errorCode === "client_stream_aborted") return "discovery_client_stream_aborted";
  return "discovery_invalid_gateway_response";
}

function isRetryableDiscoveryFailure(errorCode: DiscoveryFailureCode) { return errorCode === "discovery_gateway_http_error" || errorCode === "discovery_gateway_network_error" || errorCode === "discovery_invalid_gateway_response" || errorCode === "discovery_client_stream_aborted"; }
function discoveryRetryDelayMs(attemptCount: number) { return discoveryRetryBackoffMs[Math.min(Math.max(attemptCount - 1, 0), discoveryRetryBackoffMs.length - 1)]; }

function normalizeDiscoveredCandidate(value: unknown, captureText: string): DiscoveredCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_discovery_candidate");
  const row = value as Record<string, unknown>;
  const evidence = row.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("missing_discovery_evidence");
  const evidenceRow = evidence as Record<string, unknown>;
  const quoteText = evidenceRow.quote_text;
  if (typeof quoteText !== "string") throw new Error("invalid_discovery_evidence");
  const matchedSpan = resolveEvidenceSpan(captureText, quoteText);
  if (!matchedSpan) throw new Error("ungrounded_discovery_evidence");
  const [spanStart, spanEnd] = matchedSpan;
  const locationName = textValue(row.location_name);
  const routeSegment = textValue(row.route_segment);
  const type = row.type as KnowledgeCardType;
  const title = textValue(row.title) ?? "";
  const summary = textValue(row.summary) ?? "";
  return { fingerprint: discoveryFingerprint({ type, title, summary, spanStart, spanEnd }), type, title, summary, spanStart, spanEnd, locationName, routeSegment, conditions: stringArray(row.conditions), freshnessSensitive: row.freshness_sensitive === true, practicalDetails: recordValue(row.practical_details), tags: stringArray(row.tags) };
}

function validDiscoveredCandidate(candidate: DiscoveredCandidate, captureLength: number) {
  const conditions = candidate.conditions ?? [];
  const tags = candidate.tags ?? [];
  return candidate.fingerprint.trim().length > 0 && candidate.fingerprint.length <= 512 && knowledgeCardTypeValues.includes(candidate.type) && candidate.title.trim().length > 0 && candidate.title.trim().length <= 160 && candidate.summary.trim().length > 0 && candidate.summary.trim().length <= 1200 && Boolean(candidate.locationName?.trim() || candidate.routeSegment?.trim()) && conditions.every((condition) => condition.trim().length > 0 && condition.length <= 500) && conditions.length <= 20 && tags.every((tag) => tag.trim().length > 0 && tag.length <= 80) && tags.length <= 20 && Number.isInteger(candidate.spanStart) && Number.isInteger(candidate.spanEnd) && candidate.spanStart >= 0 && candidate.spanEnd > candidate.spanStart && candidate.spanEnd <= captureLength;
}

function textValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function stringArray(value: unknown) { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value.map((item) => item.trim()).filter(Boolean) : []; }
function recordValue(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function discoveryFingerprint(value: { type: KnowledgeCardType; title: string; summary: string; spanStart: number; spanEnd: number }) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function resolveEvidenceSpan(captureText: string, modelQuote: string): [number, number] | null {
  const capture = normalizedEvidenceCharacters(captureText, true);
  const quote = normalizedEvidenceCharacters(modelQuote, false);
  if (quote.length === 0 || capture.length < quote.length) return null;
  const matches: Array<[number, number]> = [];
  for (let start = 0; start <= capture.length - quote.length; start += 1) {
    if (quote.every((character, offset) => capture[start + offset]!.value === character.value)) matches.push([capture[start]!.start, capture[start + quote.length - 1]!.end]);
  }
  return matches.length === 1 ? matches[0]! : null;
}

function normalizedEvidenceCharacters(value: string, retainOffsets: boolean) {
  const result: Array<{ value: string; start: number; end: number }> = [];
  for (const [index, codePoint] of Array.from(value).entries()) {
    const normalized = codePoint.normalize("NFKC").replace(/[\p{C}\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F]/gu, "");
    for (const character of normalized) {
      if (/\s/u.test(character)) {
        const previous = result.at(-1);
        if (previous?.value === " ") {
          if (retainOffsets) previous.end = index + 1;
        } else {
          result.push({ value: " ", start: index, end: index + 1 });
        }
      } else {
        result.push({ value: character, start: index, end: index + 1 });
      }
    }
  }
  return result;
}
function logInvalidDiscoveryOutput(error: unknown) { console.warn("Knowledge ingestion discovery output rejected", { reason: safeDiscoveryOutputReason(error) }); }
function safeDiscoveryOutputReason(error: unknown) {
  if (error instanceof SyntaxError) return "invalid_json";
  const message = error instanceof Error ? error.message : "";
  return ["missing_candidates", "too_many_candidates", "invalid_discovery_candidate", "missing_discovery_evidence", "invalid_discovery_evidence", "ungrounded_discovery_evidence"].includes(message) ? message : "invalid_candidate_shape";
}
