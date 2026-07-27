import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { getDb } from "@/db/client";
import { auditEvents, knowledgeCardEvidence, knowledgeCardSearchDocuments, knowledgeCards, knowledgeCardSources, knowledgeCardTypeValues, knowledgeIngestionCandidates, knowledgeIngestionJobs, sourceCaptureVersions, sources } from "@/db/schema";
import { completeEvaluation, completeExtraction } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel, type SelectedAiGatewayModel } from "@/features/ai/models";
import { buildKnowledgePipelineExtractionMessages, buildKnowledgePipelineJudgmentMessages, buildKnowledgePipelineMultiFactExtractionMessages, buildKnowledgePipelineRelationJudgmentMessages, knowledgePipelineExtractionPromptVersion, knowledgePipelineExtractionPurpose, knowledgePipelineJudgmentPromptVersion, knowledgePipelineJudgmentPurpose, knowledgePipelineMultiFactExtractionPromptVersion } from "@/features/ai/prompts";
import { commitKnowledgeIngestionStage, finalizeV2Parent, retryKnowledgeIngestionCandidate, retryKnowledgeIngestionStage, terminalizeKnowledgeIngestionCandidate, type KnowledgeIngestionCandidateClaim, type KnowledgeIngestionCheckpoint, type KnowledgeIngestionClaim } from "@/features/knowledge/ingestion-jobs";
import { disableStaleKnowledgeSearchProjection, enqueueKnowledgeIndexWork } from "@/features/knowledge/indexing-queue";
import { enrollAutoActiveSampling, enrollVerifyFirstSampling, lockSamplingPolicyBoundary, scheduleKnowledgeRecommendation } from "@/features/knowledge/recommendations";
import { writeAiUsageEvent } from "@/features/audit/usage";

const systemActorId = "system-knowledge-pipeline";
const systemActorEmail = "system-knowledge-pipeline@xuyenviet.invalid";
const systemRecommendationActor = { userId: systemActorId, email: systemActorEmail };
type PipelineDb = ReturnType<typeof getDb>;
type Candidate = { type: (typeof knowledgeCardTypeValues)[number]; title: string; summary: string; locationName: string | null; routeSegment: string | null; conditions: string[]; freshnessSensitive: boolean; evidence: { quoteText: string; spanStart: number; spanEnd: number } };
type Judgment = { decision: "publish" | "review_recommended" | "verify_first" | "suppress"; summary: string; relevance: number; extractability: number; evidenceGrounding: number; specificity: number; actionability: number; firstHandLikelihood: number; spamCommercialRisk: number };
type Relation = { action: "attach" | "create" | "conflict" | "ambiguous"; targetCardId: string | null; summary: string };
export type KnowledgeIngestionPipelineResult = { jobId: string; sourceId: string; outcome: "published" | "suppressed" | "review_recommended" | "verify_first" | "failed"; cardId?: string };

export async function runKnowledgeIngestionPipeline(claim: KnowledgeIngestionClaim, db: PipelineDb = getDb()): Promise<KnowledgeIngestionPipelineResult | null> {
  if (claim.protocolVersion === 2) return runV2Discovery(claim, db);
  let stage = claim.stage; let stageVersion = claim.stageVersion;
  const advance = async (nextStage: typeof knowledgeIngestionJobs.$inferSelect.stage, checkpoint: KnowledgeIngestionCheckpoint) => {
    const committed = await commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: stage, expectedStageVersion: stageVersion, fencingToken: claim.fencingToken, nextStage, checkpoint }, db);
    if (!committed) return false; stage = nextStage as typeof stage; stageVersion = committed.stageVersion; return true;
  };
  const bundle = await loadBundle(db, claim); const rawText = bundle?.rawText;
  if (!bundle || !rawText?.trim() || containsSensitiveText(rawText)) return finish(claim, stage, stageVersion, "suppressed", "unsafe_or_unreadable_capture", db);
  let checkpoint = claim.checkpoint;
  if (stage === "queued") {
    if (isCommercial(rawText) || isQuestionOnly(rawText) || isOpinionOnly(rawText) || !hasTravelContext(rawText)) return finish(claim, stage, stageVersion, "suppressed", "insufficient_travel_context", db);
    checkpoint = { version: 1, completedStage: "triaging", passed: true };
    if (!await advance("triaging", checkpoint)) return null;
  }
  if (!checkpoint || (stage !== "triaging" && stage !== "extracting" && stage !== "judging" && stage !== "relating")) return finish(claim, stage, stageVersion, "failed", "invalid_checkpoint", db);
  let candidate: Candidate | null = checkpoint.completedStage !== "triaging" ? candidateFromCheckpoint(checkpoint, rawText) : null;
  let extractionModel: SelectedAiGatewayModel | null = null;
  if (stage === "triaging") {
    extractionModel = await selectActiveAiGatewayModel({ purpose: knowledgePipelineExtractionPurpose, requiredCapabilities: { textInput: true, extraction: true }, db });
    if (!extractionModel) return finish(claim, stage, stageVersion, "failed", "model_unavailable", db);
    const extracted = await completeExtraction({ model: extractionModel.gatewayModelName, messages: buildKnowledgePipelineExtractionMessages({ source: bundle.source, rawText }) });
    await recordUsage(db, extractionModel, knowledgePipelineExtractionPurpose, knowledgePipelineExtractionPromptVersion, extracted);
    if (!extracted.ok) return retryOrFail(claim, stage, stageVersion, "provider_failed", db);
    const parsedCandidate = parseCandidate(extracted.content, rawText);
    candidate = parsedCandidate.candidate;
    if (!candidate) return finish(claim, stage, stageVersion, "suppressed", parsedCandidate.reason, db);
    checkpoint = checkpointForCandidate(candidate, extractionModel);
    if (!await advance("extracting", checkpoint)) return null;
  }
  if (!candidate) return finish(claim, stage, stageVersion, "failed", "invalid_checkpoint", db);
  const judgmentModel = stage === "extracting" || stage === "judging"
    ? await selectActiveAiGatewayModel({ purpose: knowledgePipelineJudgmentPurpose, requiredCapabilities: { textInput: true, evaluation: true }, db })
    : null;
  if ((stage === "extracting" || stage === "judging") && !judgmentModel) return finish(claim, stage, stageVersion, "failed", "judge_model_unavailable", db);
  let judgment: Judgment | null = checkpoint.completedStage === "judging" || checkpoint.completedStage === "relating" ? checkpoint.judgment : null;
  if (stage === "extracting") {
    const extractionModelId = extractionModel?.id ?? (checkpoint.completedStage === "extracting" ? checkpoint.candidate.modelId : null);
    const extractionGatewayModelName = extractionModel?.gatewayModelName ?? (checkpoint.completedStage === "extracting" ? checkpoint.candidate.modelGatewayName : null);
    if (extractionModelId === judgmentModel!.id || extractionGatewayModelName === judgmentModel!.gatewayModelName) return finish(claim, stage, stageVersion, "review_recommended", "judge_model_not_independent", db);
    const judged = await completeEvaluation({ model: judgmentModel!.gatewayModelName, messages: buildKnowledgePipelineJudgmentMessages({ candidate: candidate as unknown as Record<string, unknown>, evidence: candidate.evidence }) });
    await recordUsage(db, judgmentModel!, knowledgePipelineJudgmentPurpose, knowledgePipelineJudgmentPromptVersion, judged);
    if (!judged.ok) return retryOrFail(claim, stage, stageVersion, "judge_provider_failed", db);
    judgment = parseJudgment(judged.content);
    if (!judgment) return finish(claim, stage, stageVersion, "suppressed", "invalid_judgment", db);
    checkpoint = { version: 1, completedStage: "judging", candidate: checkpoint.completedStage === "extracting" ? checkpoint.candidate : checkpointForCandidate(candidate, extractionModel!).candidate, judgment };
    if (!await advance("judging", checkpoint)) return null;
  }
  if (!judgment) return finish(claim, stage, stageVersion, "failed", "invalid_checkpoint", db);
  const outcome = decideOutcome(candidate, judgment);
  if (outcome === "review_recommended") return retainCandidateForReview(claim, stageVersion, candidate, judgment, bundle, checkpoint.completedStage === "judging" ? checkpoint.candidate.modelId : checkpointForCandidate(candidate, extractionModel!).candidate.modelId, "weak_evidence", "judge_review_recommended", db);
  if (outcome !== "published" && outcome !== "verify_first") return finish(claim, stage, stageVersion, outcome, "policy_outcome", db);
  let relation: Relation | null = checkpoint.completedStage === "relating" ? checkpoint.relation : null;
  if (stage === "judging") {
    const related = await loadRelatedCandidates(db, candidate);
    const relatedResult = await completeEvaluation({ model: judgmentModel!.gatewayModelName, messages: buildKnowledgePipelineRelationJudgmentMessages({ candidate: candidate as unknown as Record<string, unknown>, candidates: related }) });
    await recordUsage(db, judgmentModel!, knowledgePipelineJudgmentPurpose, knowledgePipelineJudgmentPromptVersion, relatedResult);
    if (!relatedResult.ok) return retryOrFail(claim, stage, stageVersion, "relation_judge_provider_failed", db);
    relation = parseRelation(relatedResult.content, new Set(related.map((card) => card.id)));
    if (!relation) return finish(claim, stage, stageVersion, "review_recommended", "relation_ambiguous", db);
    if (relation.action === "ambiguous") return retainCandidateForReview(claim, stageVersion, candidate, judgment, bundle, checkpoint.completedStage === "judging" ? checkpoint.candidate.modelId : checkpointForCandidate(candidate, extractionModel!).candidate.modelId, "relation", "relation_ambiguous", db);
    const relationCheckpoint: Extract<KnowledgeIngestionCheckpoint, { completedStage: "relating" }> = { version: 1, completedStage: "relating", candidate: checkpoint.completedStage === "judging" ? checkpoint.candidate : checkpointForCandidate(candidate, extractionModel!).candidate, judgment, relation: { action: relation.action as "attach" | "create" | "conflict", targetCardId: relation.targetCardId, summary: relation.summary } };
    checkpoint = relationCheckpoint;
    if (!await advance("relating", relationCheckpoint)) return null;
  }
  if (!relation) return finish(claim, stage, stageVersion, "failed", "invalid_checkpoint", db);
  if (checkpoint.completedStage === "triaging") return finish(claim, stage, stageVersion, "failed", "invalid_checkpoint", db);
  if (outcome === "verify_first") return publishVerifyFirst(claim, stageVersion, candidate, judgment, bundle, checkpoint.candidate.modelId, relation, db);
  return publish(claim, stageVersion, candidate, judgment, bundle, checkpoint.candidate.modelId, relation, db);
}

const maxWindowCoreSize = 8_000;
const minWindowCoreSize = 500;
const windowOverlap = 1_000;

async function runV2Discovery(claim: KnowledgeIngestionClaim, db: PipelineDb): Promise<KnowledgeIngestionPipelineResult | null> {
  const [bundle] = await db.select({ rawText: sourceCaptureVersions.rawText, source: { id: sources.id, kind: sources.kind, label: sources.label, sourceType: sources.sourceType, verificationStatus: sources.verificationStatus, official: sources.official, partner: sources.partner }, cursor: knowledgeIngestionJobs.discoveryCursor, windowSize: knowledgeIngestionJobs.discoveryWindowSize }).from(knowledgeIngestionJobs).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeIngestionJobs.captureVersionId)).innerJoin(sources, eq(sources.id, knowledgeIngestionJobs.sourceId)).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
  if (!bundle?.rawText) return terminalizeStaleV2Discovery(claim, db);
  if (containsSensitiveText(bundle.rawText)) return finish(claim, claim.stage, claim.stageVersion, "suppressed", "unsafe_or_unreadable_capture", db);
  const total = Array.from(bundle.rawText).length;
  const coreStart = bundle.cursor;
  if (coreStart >= total) {
    const [committed] = await db.update(knowledgeIngestionJobs).set({ discoveryComplete: true, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: new Date() }).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.protocolVersion, 2), eq(knowledgeIngestionJobs.stage, "queued"), eq(knowledgeIngestionJobs.stageVersion, claim.stageVersion), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), sql`${knowledgeIngestionJobs.leaseExpiresAt} > timezone('UTC', now())`)).returning({ id: knowledgeIngestionJobs.id });
    if (!committed) return null;
    await finalizeV2Parent(db, claim.jobId);
    return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "suppressed" };
  }
  const coreEnd = Math.min(coreStart + bundle.windowSize, total);
  const requestEnd = Math.min(coreEnd + windowOverlap, total);
  const model = await selectActiveAiGatewayModel({ purpose: knowledgePipelineExtractionPurpose, requiredCapabilities: { textInput: true, extraction: true }, db });
  if (!model) return finish(claim, claim.stage, claim.stageVersion, "failed", "model_unavailable", db);
  const windowStart = Math.max(0, coreStart - windowOverlap);
  const extracted = await completeExtraction({ model: model.gatewayModelName, messages: buildKnowledgePipelineMultiFactExtractionMessages({ source: bundle.source, rawText: Array.from(bundle.rawText).slice(windowStart, requestEnd).join(""), sourceOffset: windowStart, coreStart, coreEnd }) });
  await recordUsage(db, model, knowledgePipelineExtractionPurpose, knowledgePipelineMultiFactExtractionPromptVersion, extracted);
  if (!extracted.ok) return retryOrFail(claim, claim.stage, claim.stageVersion, "provider_failed", db);
  const parsed = parseCandidates(extracted.content, bundle.rawText, coreStart, coreEnd);
  if (!parsed) return retryV2Discovery(claim, bundle.windowSize, db);
  const candidates = parsed.candidates;
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ id: knowledgeIngestionJobs.id }).from(knowledgeIngestionJobs).innerJoin(sources, eq(sources.id, knowledgeIngestionJobs.sourceId)).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.sourceId, claim.sourceId), eq(knowledgeIngestionJobs.captureVersionId, claim.captureVersionId), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), eq(knowledgeIngestionJobs.stageVersion, claim.stageVersion), sql`${knowledgeIngestionJobs.leaseExpiresAt} > timezone('UTC', now())`, eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"))).limit(1).for("update");
    if (!current) return null;
    let inserted = 0;
    let invalidInserted = 0;
    for (const candidate of candidates) {
      const rows = await tx.insert(knowledgeIngestionCandidates).values({ ingestionJobId: claim.jobId, sourceId: claim.sourceId, captureVersionId: claim.captureVersionId, fingerprint: fingerprint(candidate), type: candidate.type, title: candidate.title, summary: candidate.summary, locationName: candidate.locationName, routeSegment: candidate.routeSegment, conditions: candidate.conditions, freshnessSensitive: candidate.freshnessSensitive, spanStart: candidate.evidence.spanStart, spanEnd: candidate.evidence.spanEnd, extractionModelId: model.id, extractionPromptVersion: knowledgePipelineMultiFactExtractionPromptVersion }).onConflictDoNothing().returning({ id: knowledgeIngestionCandidates.id });
      inserted += rows.length;
    }
    for (let index = 0; index < parsed.invalidCount; index += 1) {
      const rows = await tx.insert(knowledgeIngestionCandidates).values({ ingestionJobId: claim.jobId, sourceId: claim.sourceId, captureVersionId: claim.captureVersionId, fingerprint: invalidFingerprint(coreStart, index), type: "general_travel_tip", title: "Candidate extraction rejected", summary: "Rejected during structural or safety validation.", conditions: [], freshnessSensitive: false, spanStart: coreStart, spanEnd: Math.min(coreStart + 1, total), extractionModelId: model.id, extractionPromptVersion: knowledgePipelineMultiFactExtractionPromptVersion, stage: "suppressed", stageVersion: 2, outcomeReasonCode: "invalid_discovery_candidate" }).onConflictDoNothing().returning({ id: knowledgeIngestionCandidates.id });
      inserted += rows.length;
      invalidInserted += rows.length;
    }
    const [advanced] = await tx.update(knowledgeIngestionJobs).set({ discoveryCursor: coreEnd, discoveryWindowSize: maxWindowCoreSize, discoveredCandidateCount: sql`${knowledgeIngestionJobs.discoveredCandidateCount} + ${inserted}`, terminalCandidateCount: sql`${knowledgeIngestionJobs.terminalCandidateCount} + ${invalidInserted}`, suppressedCandidateCount: sql`${knowledgeIngestionJobs.suppressedCandidateCount} + ${invalidInserted}`, invalidCandidateCount: sql`${knowledgeIngestionJobs.invalidCandidateCount} + ${invalidInserted}`, lastErrorCode: invalidInserted > 0 ? "invalid_discovery_candidate" : null, attemptCount: 0, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: new Date(), updatedAt: new Date() }).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.sourceId, claim.sourceId), eq(knowledgeIngestionJobs.captureVersionId, claim.captureVersionId), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), eq(knowledgeIngestionJobs.stageVersion, claim.stageVersion), sql`${knowledgeIngestionJobs.leaseExpiresAt} > timezone('UTC', now())`)).returning();
    return advanced ? { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "suppressed" as const } : null;
  });
}

async function retryV2Discovery(claim: KnowledgeIngestionClaim, windowSize: number, db: PipelineDb) {
  if (windowSize > minWindowCoreSize) {
    const [retried] = await db.update(knowledgeIngestionJobs).set({ discoveryWindowSize: Math.max(minWindowCoreSize, Math.floor(windowSize / 2)), attemptCount: 0, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: new Date(), lastErrorCode: "discovery_window_subdivided", updatedAt: new Date() }).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.stage, claim.stage), eq(knowledgeIngestionJobs.stageVersion, claim.stageVersion), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), sql`${knowledgeIngestionJobs.leaseExpiresAt} > timezone('UTC', now())`)).returning({ id: knowledgeIngestionJobs.id });
    return retried ? null : finish(claim, claim.stage, claim.stageVersion, "failed", "invalid_discovery_response", db);
  }
  return retryOrFail(claim, claim.stage, claim.stageVersion, "invalid_discovery_response", db);
}

async function terminalizeStaleV2Discovery(claim: KnowledgeIngestionClaim, db: PipelineDb) {
  return db.transaction(async (tx) => {
    const rows = await tx.update(knowledgeIngestionCandidates).set({ stage: "suppressed", stageVersion: sql`${knowledgeIngestionCandidates.stageVersion} + 1`, outcomeReasonCode: "stale_or_deleted_capture", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: new Date() }).where(and(eq(knowledgeIngestionCandidates.ingestionJobId, claim.jobId), sql`${knowledgeIngestionCandidates.stage} in ('queued', 'judging', 'relating')`)).returning({ id: knowledgeIngestionCandidates.id });
    const [terminalized] = await tx.update(knowledgeIngestionJobs).set({ stage: "suppressed", stageVersion: claim.stageVersion + 1, terminalCandidateCount: sql`${knowledgeIngestionJobs.terminalCandidateCount} + ${rows.length}`, suppressedCandidateCount: sql`${knowledgeIngestionJobs.suppressedCandidateCount} + ${rows.length}`, lastErrorCode: "stale_or_deleted_capture", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: new Date() }).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(knowledgeIngestionJobs.stage, claim.stage), eq(knowledgeIngestionJobs.stageVersion, claim.stageVersion), eq(knowledgeIngestionJobs.fencingToken, claim.fencingToken), sql`${knowledgeIngestionJobs.leaseExpiresAt} > timezone('UTC', now())`)).returning({ id: knowledgeIngestionJobs.id });
    return terminalized ? { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "suppressed" as const } : null;
  });
}

export async function runKnowledgeIngestionCandidatePipeline(claim: KnowledgeIngestionCandidateClaim, db: PipelineDb = getDb()) {
  const [candidate] = await db.select().from(knowledgeIngestionCandidates).where(and(eq(knowledgeIngestionCandidates.id, claim.candidateId), eq(knowledgeIngestionCandidates.ingestionJobId, claim.jobId), eq(knowledgeIngestionCandidates.sourceId, claim.sourceId), eq(knowledgeIngestionCandidates.captureVersionId, claim.captureVersionId), eq(knowledgeIngestionCandidates.fencingToken, claim.fencingToken))).limit(1);
  if (!candidate) return null;
  const [capture] = await db.select({ rawText: sourceCaptureVersions.rawText, capturedAt: sourceCaptureVersions.capturedAt, sourceKind: sources.kind, sourceType: sources.sourceType }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, claim.captureVersionId), eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
  const quoteText = capture?.rawText ? slice(capture.rawText, candidate.spanStart, candidate.spanEnd) : null;
  if (!quoteText) return terminalizeKnowledgeIngestionCandidate({ candidateId: claim.candidateId, expectedStage: claim.stage, expectedStageVersion: claim.stageVersion, fencingToken: claim.fencingToken, outcome: "suppressed", reasonCode: "stale_or_deleted_capture" }, db);
  const model = await selectActiveAiGatewayModel({ purpose: knowledgePipelineJudgmentPurpose, requiredCapabilities: { textInput: true, evaluation: true }, db });
  if (!model) return terminalizeKnowledgeIngestionCandidate({ candidateId: claim.candidateId, expectedStage: claim.stage, expectedStageVersion: claim.stageVersion, fencingToken: claim.fencingToken, outcome: "failed", reasonCode: "judge_model_unavailable" }, db);
  if (model.id === candidate.extractionModelId) return terminalizeKnowledgeIngestionCandidate({ candidateId: claim.candidateId, expectedStage: claim.stage, expectedStageVersion: claim.stageVersion, fencingToken: claim.fencingToken, outcome: "review_recommended", reasonCode: "judge_model_not_independent" }, db);
  const fact: Candidate = { type: candidate.type, title: candidate.title, summary: candidate.summary, locationName: candidate.locationName, routeSegment: candidate.routeSegment, conditions: candidate.conditions, freshnessSensitive: candidate.freshnessSensitive, evidence: { quoteText, spanStart: candidate.spanStart, spanEnd: candidate.spanEnd } };
  const judged = await completeEvaluation({ model: model.gatewayModelName, messages: buildKnowledgePipelineJudgmentMessages({ candidate: fact as unknown as Record<string, unknown>, evidence: fact.evidence }) });
  await recordUsage(db, model, knowledgePipelineJudgmentPurpose, knowledgePipelineJudgmentPromptVersion, judged);
  const judgment = judged.ok ? parseJudgment(judged.content) : null;
  const outcome: "published" | "suppressed" | "review_recommended" | "verify_first" | "failed" = judgment ? decideOutcome(fact, judgment) : "failed";
  if (!judgment) return retryKnowledgeIngestionCandidate({ candidateId: claim.candidateId, expectedStage: claim.stage, expectedStageVersion: claim.stageVersion, fencingToken: claim.fencingToken, errorCode: "judge_provider_failed" }, db);
  if (outcome === "suppressed") return terminalizeKnowledgeIngestionCandidate({ candidateId: claim.candidateId, expectedStage: claim.stage, expectedStageVersion: claim.stageVersion, fencingToken: claim.fencingToken, outcome, reasonCode: "candidate_terminalized", judgmentSummary: judgment.summary, scores: scoresFor(judgment) }, db);
  if (outcome === "review_recommended") return persistV2CandidateCard(claim, candidate, fact, judgment, outcome, capture, { action: "ambiguous", targetCardId: null, summary: "relation_ambiguous" }, db);
  const related = await loadRelatedCandidates(db, fact);
  const relatedResult = await completeEvaluation({ model: model.gatewayModelName, messages: buildKnowledgePipelineRelationJudgmentMessages({ candidate: fact as unknown as Record<string, unknown>, candidates: related }) });
  await recordUsage(db, model, knowledgePipelineJudgmentPurpose, knowledgePipelineJudgmentPromptVersion, relatedResult);
  if (!relatedResult.ok) return retryKnowledgeIngestionCandidate({ candidateId: claim.candidateId, expectedStage: claim.stage, expectedStageVersion: claim.stageVersion, fencingToken: claim.fencingToken, errorCode: "relation_provider_failed" }, db);
  const relation = parseRelation(relatedResult.content, new Set(related.map((card) => card.id)));
  if (!relation || relation.action === "ambiguous") return persistV2CandidateCard(claim, candidate, fact, judgment, "review_recommended", capture, { action: "ambiguous", targetCardId: null, summary: "relation_ambiguous" }, db);
  return persistV2CandidateCard(claim, candidate, fact, judgment, outcome as "published" | "review_recommended" | "verify_first", capture, relation, db);
}

async function persistV2CandidateCard(claim: KnowledgeIngestionCandidateClaim, candidate: typeof knowledgeIngestionCandidates.$inferSelect, fact: Candidate, judgment: Judgment, outcome: "published" | "review_recommended" | "verify_first", capture: { capturedAt: Date; sourceKind: typeof sources.$inferSelect.kind; sourceType: typeof sources.$inferSelect.sourceType; rawText: string | null }, relation: Relation, db: PipelineDb) {
  return db.transaction(async (tx) => {
    await lockSamplingPolicyBoundary(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${claim.sourceId}, 44))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity(fact)}, 45))`);
    const [current] = await tx.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).innerJoin(knowledgeIngestionJobs, and(eq(knowledgeIngestionJobs.sourceId, sources.id), eq(knowledgeIngestionJobs.captureVersionId, sourceCaptureVersions.id))).where(and(eq(knowledgeIngestionJobs.id, claim.jobId), eq(sourceCaptureVersions.id, claim.captureVersionId), eq(sources.id, claim.sourceId), eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1).for("update");
    if (!current) return terminalizeKnowledgeIngestionCandidate({ candidateId: claim.candidateId, expectedStage: claim.stage, expectedStageVersion: claim.stageVersion, fencingToken: claim.fencingToken, outcome: "suppressed", reasonCode: "stale_or_deleted_capture" }, tx);
    let target: { id: string; conditions: string[]; locationName: string | null; routeSegment: string | null; publicationState: typeof knowledgeCards.$inferSelect.publicationState; verificationState: typeof knowledgeCards.$inferSelect.verificationState; reviewState: typeof knowledgeCards.$inferSelect.reviewState; knowledgeState: typeof knowledgeCards.$inferSelect.knowledgeState } | null = null;
    if (relation.targetCardId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${relation.targetCardId}, 46))`);
      const [row] = await tx.select({ id: knowledgeCards.id, conditions: knowledgeCards.conditions, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, publicationState: knowledgeCards.publicationState, verificationState: knowledgeCards.verificationState, reviewState: knowledgeCards.reviewState, knowledgeState: knowledgeCards.knowledgeState }).from(knowledgeCards).where(and(eq(knowledgeCards.id, relation.targetCardId), eq(knowledgeCards.type, fact.type))).limit(1).for("update");
      if (!row || !sameScope(row, fact)) relation = { action: "ambiguous", targetCardId: null, summary: "stale_relation_target" }; else target = row;
    }
    if (relation.action === "attach" && target && (outcome === "published" ? target.publicationState !== "active" : outcome === "verify_first" ? target.publicationState !== "suppressed" || target.verificationState !== "required" || target.reviewState !== "ai_recommended" || !["uncertain", "community_pattern"].includes(target.knowledgeState) : true)) relation = { action: "ambiguous", targetCardId: null, summary: "stale_relation_target" };
    if (relation.action === "conflict" && target && target.publicationState !== "active") relation = { action: "ambiguous", targetCardId: null, summary: "stale_relation_target" };
    const reasonCode = relation.action === "ambiguous" ? "relation_ambiguous" : relation.action === "create" && relation.targetCardId ? "relation_invalid" : !target ? "stale_relation_target" : !sameConditions(target.conditions, fact.conditions) ? relation.action === "attach" ? "attach_condition_mismatch" : "conflict_condition_mismatch" : "candidate_terminalized";
    if (relation.action === "ambiguous" || (relation.action !== "create" && (!target || !sameConditions(target.conditions, fact.conditions))) || (relation.action === "create" && relation.targetCardId)) outcome = "review_recommended";
    const [locked] = await tx.update(knowledgeIngestionCandidates).set({ stage: outcome, stageVersion: claim.stageVersion + 1, outcomeReasonCode: reasonCode, judgmentSummary: judgment.summary, scores: scoresFor(judgment), claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: new Date() }).where(and(eq(knowledgeIngestionCandidates.id, claim.candidateId), eq(knowledgeIngestionCandidates.ingestionJobId, claim.jobId), eq(knowledgeIngestionCandidates.sourceId, claim.sourceId), eq(knowledgeIngestionCandidates.captureVersionId, claim.captureVersionId), eq(knowledgeIngestionCandidates.stage, claim.stage), eq(knowledgeIngestionCandidates.stageVersion, claim.stageVersion), eq(knowledgeIngestionCandidates.fencingToken, claim.fencingToken), sql`${knowledgeIngestionCandidates.leaseExpiresAt} > timezone('UTC', now())`)).returning({ id: knowledgeIngestionCandidates.id, jobId: knowledgeIngestionCandidates.ingestionJobId });
    if (!locked) return null;
    const v1Claim = { jobId: claim.jobId, sourceId: claim.sourceId, captureVersionId: claim.captureVersionId } as KnowledgeIngestionClaim;
    const bundle = { capturedAt: capture.capturedAt, source: { kind: capture.sourceKind, sourceType: capture.sourceType } } as NonNullable<Awaited<ReturnType<typeof loadBundle>>>;
    if (relation.action === "attach" && target && sameConditions(target.conditions, fact.conditions)) {
      await attachEvidence(tx, target.id, v1Claim, fact, bundle, "supporting");
      const promoted = await promote(tx, target.id);
      const [version] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, target.id)).limit(1);
      if (version) { await markIndexDirty(tx, target.id, version, "ingestion_attach"); if (promoted) await markIndexDirty(tx, target.id, version, "ingestion_promotion"); if (outcome === "published") await enrollAutoActiveSampling({ terminalIngestionJobId: claim.jobId, cardId: target.id, contentVersion: version.contentVersion, evidenceSetRevision: version.evidenceSetRevision, routeSegment: target.routeSegment, locationName: target.locationName }, tx); else await enrollVerifyFirstSampling({ terminalIngestionJobId: claim.jobId, cardId: target.id, contentVersion: version.contentVersion, evidenceSetRevision: version.evidenceSetRevision, routeSegment: target.routeSegment, locationName: target.locationName }, tx); }
      await tx.update(knowledgeIngestionCandidates).set({ knowledgeCardId: target.id }).where(eq(knowledgeIngestionCandidates.id, claim.candidateId));
      return finishV2Candidate(tx, locked.jobId, claim.sourceId, outcome === "verify_first" ? "verify_first" : "published", target.id);
    }
    if (relation.action === "conflict" && target && sameConditions(target.conditions, fact.conditions)) {
      await attachEvidence(tx, target.id, v1Claim, fact, bundle, "conflicting");
      await tx.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "conflicted", reviewState: "ai_recommended", verificationState: isHighRisk(fact) ? "required" : target.verificationState, needsReview: true, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(eq(knowledgeCards.id, target.id));
      const [version] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, target.id)).limit(1);
      if (version) { await scheduleKnowledgeRecommendation({ cardId: target.id, contentVersion: version.contentVersion, evidenceSetRevision: version.evidenceSetRevision, reason: "conflict", supersedeStaleBy: systemRecommendationActor }, tx); await invalidateConflictedProjection(tx, target.id, version); }
      await tx.update(knowledgeIngestionCandidates).set({ stage: "review_recommended", knowledgeCardId: target.id }).where(eq(knowledgeIngestionCandidates.id, claim.candidateId));
      return finishV2Candidate(tx, locked.jobId, claim.sourceId, "review_recommended", target.id);
    }
    const verificationRequired = outcome === "verify_first";
    const [card] = await tx.insert(knowledgeCards).values({ type: fact.type, title: fact.title, summary: fact.summary, locationName: fact.locationName, routeSegment: fact.routeSegment, conditions: fact.conditions, freshnessSensitive: fact.freshnessSensitive, confidence: capture.sourceType === "community" ? "community" : "unverified", status: "approved", publicationState: outcome === "published" ? "active" : "suppressed", knowledgeState: outcome === "published" ? "community_observation" : "uncertain", reviewState: outcome === "published" ? "reviewed" : "ai_recommended", verificationState: verificationRequired ? "required" : "not_required", needsReview: outcome !== "published", currentJudgeSummary: judgment.summary, aiPromptVersion: candidate.extractionPromptVersion, aiGatewayModelId: candidate.extractionModelId, createdByUserId: systemActorId }).returning({ id: knowledgeCards.id });
    await tx.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: claim.sourceId, supportLevel: "primary" });
    await tx.insert(knowledgeCardEvidence).values({ knowledgeCardId: card.id, sourceId: claim.sourceId, captureVersionId: claim.captureVersionId, quoteText: fact.evidence.quoteText, spanStart: fact.evidence.spanStart, spanEnd: fact.evidence.spanEnd, observedAt: capture.capturedAt, capturedAt: capture.capturedAt, conditions: fact.conditions, supportLevel: "supporting", displayPolicy: capture.sourceKind === "facebook" ? "operator_only" : "fact_only", state: "active", independenceKey: claim.sourceId });
    await tx.update(knowledgeCards).set({ contentVersion: sql`${knowledgeCards.contentVersion} + 1`, evidenceSetRevision: sql`${knowledgeCards.evidenceSetRevision} + 1`, updatedAt: new Date() }).where(eq(knowledgeCards.id, card.id));
    await tx.update(knowledgeIngestionCandidates).set({ knowledgeCardId: card.id }).where(eq(knowledgeIngestionCandidates.id, claim.candidateId));
    const [version] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, card.id)).limit(1);
    if (version) {
      await markIndexDirty(tx, card.id, version, outcome === "published" ? "ingestion_publication" : outcome === "verify_first" ? "ingestion_verify_first" : "ingestion_relation_review");
      if (outcome === "published") await enrollAutoActiveSampling({ terminalIngestionJobId: claim.jobId, cardId: card.id, contentVersion: version.contentVersion, evidenceSetRevision: version.evidenceSetRevision, routeSegment: fact.routeSegment, locationName: fact.locationName }, tx);
      if (outcome === "verify_first") await enrollVerifyFirstSampling({ terminalIngestionJobId: claim.jobId, cardId: card.id, contentVersion: version.contentVersion, evidenceSetRevision: version.evidenceSetRevision, routeSegment: fact.routeSegment, locationName: fact.locationName }, tx);
      if (outcome === "review_recommended") await scheduleKnowledgeRecommendation({ cardId: card.id, contentVersion: version.contentVersion, evidenceSetRevision: version.evidenceSetRevision, reason: relation.action === "ambiguous" ? "relation" : "missing_context", supersedeStaleBy: systemRecommendationActor }, tx);
    }
    await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "create", targetType: "knowledge_ingestion_candidate", targetId: card.id, afterSummary: "System pipeline persisted an independently judged candidate." });
    return finishV2Candidate(tx, locked.jobId, claim.sourceId, outcome, card.id);
  });
}

async function finishV2Candidate(tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0], jobId: string, sourceId: string, outcome: "published" | "review_recommended" | "verify_first", cardId: string) {
  const counters = outcome === "published" ? { publishedCandidateCount: sql`${knowledgeIngestionJobs.publishedCandidateCount} + 1` } : outcome === "verify_first" ? { verifyFirstCandidateCount: sql`${knowledgeIngestionJobs.verifyFirstCandidateCount} + 1` } : { reviewRecommendedCandidateCount: sql`${knowledgeIngestionJobs.reviewRecommendedCandidateCount} + 1` };
  await tx.update(knowledgeIngestionJobs).set({ terminalCandidateCount: sql`${knowledgeIngestionJobs.terminalCandidateCount} + 1`, ...counters, updatedAt: new Date() }).where(eq(knowledgeIngestionJobs.id, jobId));
  await finalizeV2Parent(tx, jobId);
  return { jobId, sourceId, outcome, cardId };
}

async function loadBundle(db: PipelineDb, claim: KnowledgeIngestionClaim) {
  const [bundle] = await db.select({ rawText: sourceCaptureVersions.rawText, capturedAt: sourceCaptureVersions.capturedAt, source: { id: sources.id, kind: sources.kind, label: sources.label, sourceType: sources.sourceType, verificationStatus: sources.verificationStatus, official: sources.official, partner: sources.partner } }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, claim.captureVersionId), eq(sourceCaptureVersions.sourceId, claim.sourceId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
  return bundle ?? null;
}
async function finish(claim: KnowledgeIngestionClaim, stage: typeof knowledgeIngestionJobs.$inferSelect.stage, version: number, outcome: Exclude<KnowledgeIngestionPipelineResult["outcome"], "published">, code: string, db: PipelineDb) {
  const committed = await commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: stage as "queued" | "triaging" | "extracting" | "judging" | "relating", expectedStageVersion: version, fencingToken: claim.fencingToken, nextStage: outcome, lastErrorCode: code }, db);
  return committed ? { jobId: claim.jobId, sourceId: claim.sourceId, outcome } : null;
}
async function retryOrFail(claim: KnowledgeIngestionClaim, stage: typeof knowledgeIngestionJobs.$inferSelect.stage, version: number, code: string, db: PipelineDb) {
  const retried = await retryKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: stage as "queued" | "triaging" | "extracting" | "judging" | "relating", expectedStageVersion: version, fencingToken: claim.fencingToken, errorCode: code }, db);
  if (retried) return null;
  return finish(claim, stage, version, "failed", code, db);
}
function checkpointForCandidate(candidate: Candidate, model: SelectedAiGatewayModel): Extract<KnowledgeIngestionCheckpoint, { completedStage: "extracting" }> { return { version: 1, completedStage: "extracting", candidate: { type: candidate.type, title: candidate.title, summary: candidate.summary, locationName: candidate.locationName, routeSegment: candidate.routeSegment, conditions: candidate.conditions, freshnessSensitive: candidate.freshnessSensitive, spanStart: candidate.evidence.spanStart, spanEnd: candidate.evidence.spanEnd, modelId: model.id, modelGatewayName: model.gatewayModelName, promptVersion: knowledgePipelineExtractionPromptVersion } }; }
function candidateFromCheckpoint(checkpoint: Exclude<KnowledgeIngestionCheckpoint, { completedStage: "triaging" }>, rawText: string): Candidate | null { const candidate = checkpoint.candidate; const quoteText = slice(rawText, candidate.spanStart, candidate.spanEnd); if (!quoteText || containsSensitiveText(quoteText)) return null; const persisted = [candidate.title, candidate.summary, ...[candidate.locationName, candidate.routeSegment].filter((value): value is string => value !== null), ...candidate.conditions, quoteText]; const text = persisted.join("\n"); if (persisted.some(containsSensitiveText) || isCommercial(text) || isQuestionOnly(text) || isOpinionOnly(text) || !hasTravelContext(text)) return null; return { type: candidate.type, title: candidate.title, summary: candidate.summary, locationName: candidate.locationName, routeSegment: candidate.routeSegment, conditions: candidate.conditions, freshnessSensitive: candidate.freshnessSensitive, evidence: { quoteText, spanStart: candidate.spanStart, spanEnd: candidate.spanEnd } }; }
async function loadRelatedCandidates(db: PipelineDb, candidate: Candidate) {
  const scope = normalize(candidate.locationName ?? candidate.routeSegment ?? "");
  const scopeColumn = candidate.locationName ? knowledgeCards.locationName : knowledgeCards.routeSegment;
  return db.select({ id: knowledgeCards.id, title: knowledgeCards.title, summary: knowledgeCards.summary, conditions: knowledgeCards.conditions, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, verificationState: knowledgeCards.verificationState })
    .from(knowledgeCards)
    .where(and(
      eq(knowledgeCards.type, candidate.type),
      or(
        eq(knowledgeCards.publicationState, "active"),
        and(
          eq(knowledgeCards.publicationState, "suppressed"),
          eq(knowledgeCards.verificationState, "required"),
          eq(knowledgeCards.reviewState, "ai_recommended"),
          or(eq(knowledgeCards.knowledgeState, "uncertain"), eq(knowledgeCards.knowledgeState, "community_pattern")),
        ),
      ),
      sql`lower(regexp_replace(normalize(coalesce(${scopeColumn}, '')), '\\s+', ' ', 'g')) = ${scope}`,
    ))
    .orderBy(desc(knowledgeCards.updatedAt))
    .limit(200);
}
async function publish(claim: KnowledgeIngestionClaim, version: number, candidate: Candidate, judgment: Judgment, bundle: NonNullable<Awaited<ReturnType<typeof loadBundle>>>, extractionModelId: string, relation: Relation, db: PipelineDb): Promise<KnowledgeIngestionPipelineResult | null> {
  return db.transaction(async (tx) => {
    await lockSamplingPolicyBoundary(tx);
    // Matches appendSourceCaptureVersion so current-capture validation and publish are atomic.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${claim.sourceId}, 44))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity(candidate)}, 45))`);
    const [current] = await tx.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, claim.captureVersionId), eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1).for("update");
    if (!current) return terminal(claim, version, "suppressed", "stale_or_deleted_capture", tx);
    if ((relation.action === "attach" || relation.action === "conflict") && !relation.targetCardId) return terminal(claim, version, "review_recommended", "invalid_relation_target", tx);
    let target: { id: string; conditions: string[]; verificationState: typeof knowledgeCards.$inferSelect.verificationState; locationName: string | null; routeSegment: string | null } | null = null;
    if (relation.targetCardId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${relation.targetCardId}, 46))`);
      const [lockedTarget] = await tx.select({ id: knowledgeCards.id, conditions: knowledgeCards.conditions, verificationState: knowledgeCards.verificationState, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment }).from(knowledgeCards).where(and(eq(knowledgeCards.id, relation.targetCardId), eq(knowledgeCards.type, candidate.type), eq(knowledgeCards.publicationState, "active"))).limit(1).for("update");
      if (!lockedTarget || !sameScope(lockedTarget, candidate)) return terminal(claim, version, "review_recommended", "stale_relation_target", tx);
      target = lockedTarget;
    }
    if (relation.action === "attach" && target) {
      if (!sameConditions(target.conditions, candidate.conditions)) return persistCandidateForReview(claim, version, candidate, judgment, bundle, extractionModelId, "missing_context", "attach_condition_mismatch", tx);
       if (!await fence(claim, version, "published", undefined, tx)) return null;
       await attachEvidence(tx, target.id, claim, candidate, bundle, "supporting");
       const promoted = await promote(tx, target.id);
        const [attachedVersion] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, target.id)).limit(1);
        if (attachedVersion) {
          await markIndexDirty(tx, target.id, attachedVersion, "ingestion_attach");
          if (promoted) await markIndexDirty(tx, target.id, attachedVersion, "ingestion_promotion");
            await enrollAutoActiveSampling({ terminalIngestionJobId: claim.jobId, cardId: target.id, contentVersion: attachedVersion.contentVersion, evidenceSetRevision: attachedVersion.evidenceSetRevision, routeSegment: target.routeSegment, locationName: target.locationName }, tx);
        }
       await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "update", targetType: "knowledge_ingestion_evidence", targetId: target.id, afterSummary: "System pipeline attached independent supporting evidence." });
      return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "published", cardId: target.id };
    }
    if (relation.action === "conflict" && target) {
      if (!sameConditions(target.conditions, candidate.conditions)) return persistCandidateForReview(claim, version, candidate, judgment, bundle, extractionModelId, "missing_context", "conflict_condition_mismatch", tx);
      if (!await fence(claim, version, "review_recommended", "relation_conflict", tx)) return null;
      await attachEvidence(tx, target.id, claim, candidate, bundle, "conflicting");
        await tx.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "conflicted", reviewState: "ai_recommended", verificationState: isHighRisk(candidate) ? "required" : target.verificationState, needsReview: true, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(eq(knowledgeCards.id, target.id));
        const [updated] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, target.id)).limit(1);
        if (updated) {
          await scheduleKnowledgeRecommendation({ cardId: target.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, reason: "conflict", supersedeStaleBy: systemRecommendationActor }, tx);
          await invalidateConflictedProjection(tx, target.id, updated);
        }
      await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "update", targetType: "knowledge_ingestion_conflict", targetId: target.id, afterSummary: "System pipeline suppressed a conflicted card for review." });
      return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "review_recommended" };
    }
    if (relation.action !== "create") return terminal(claim, version, "review_recommended", "invalid_relation_action", tx);
    if (!await fence(claim, version, "published", undefined, tx)) return null;
      const [card] = await tx.insert(knowledgeCards).values({ type: candidate.type, title: candidate.title, summary: candidate.summary, locationName: candidate.locationName, routeSegment: candidate.routeSegment, conditions: candidate.conditions, freshnessSensitive: candidate.freshnessSensitive, confidence: bundle.source.sourceType === "community" ? "community" : "unverified", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", needsReview: false, currentJudgeSummary: judgment.summary, aiPromptVersion: knowledgePipelineExtractionPromptVersion, aiGatewayModelId: extractionModelId, createdByUserId: systemActorId }).returning({ id: knowledgeCards.id });
    await tx.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: claim.sourceId, supportLevel: "primary" }); await attachEvidence(tx, card.id, claim, candidate, bundle, "supporting");
     await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "create", targetType: "knowledge_ingestion_publication", targetId: card.id, afterSummary: "System pipeline published an evidence-grounded knowledge card." });
     const [cardVersion] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, card.id)).limit(1);
      if (cardVersion) {
        await markIndexDirty(tx, card.id, cardVersion, "ingestion_publication");
        await enrollAutoActiveSampling({ terminalIngestionJobId: claim.jobId, cardId: card.id, contentVersion: cardVersion.contentVersion, evidenceSetRevision: cardVersion.evidenceSetRevision, routeSegment: candidate.routeSegment, locationName: candidate.locationName }, tx);
      }
     return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "published", cardId: card.id };
  });
}
async function publishVerifyFirst(claim: KnowledgeIngestionClaim, version: number, candidate: Candidate, judgment: Judgment, bundle: NonNullable<Awaited<ReturnType<typeof loadBundle>>>, extractionModelId: string, relation: Relation, db: PipelineDb): Promise<KnowledgeIngestionPipelineResult | null> {
  return db.transaction(async (tx) => {
    await lockSamplingPolicyBoundary(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${claim.sourceId}, 44))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity(candidate)}, 45))`);
    const [current] = await tx.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, claim.captureVersionId), eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1).for("update");
    if (!current) return terminalVerifyFirst(claim, version, tx);
    if ((relation.action === "attach" || relation.action === "conflict") && !relation.targetCardId) return terminal(claim, version, "review_recommended", "invalid_relation_target", tx);
    if (relation.action === "attach" && relation.targetCardId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${relation.targetCardId}, 46))`);
      const [target] = await tx.select({ id: knowledgeCards.id, conditions: knowledgeCards.conditions, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, publicationState: knowledgeCards.publicationState, verificationState: knowledgeCards.verificationState, reviewState: knowledgeCards.reviewState, knowledgeState: knowledgeCards.knowledgeState }).from(knowledgeCards).where(and(eq(knowledgeCards.id, relation.targetCardId), eq(knowledgeCards.type, candidate.type))).limit(1).for("update");
      if (!target || !sameScope(target, candidate)) return terminal(claim, version, "review_recommended", "stale_relation_target", tx);
      if (!sameConditions(target.conditions, candidate.conditions)) return persistCandidateForReview(claim, version, candidate, judgment, bundle, extractionModelId, "missing_context", "attach_condition_mismatch", tx);
      if (target.publicationState !== "suppressed" || target.verificationState !== "required" || target.reviewState !== "ai_recommended" || !["uncertain", "community_pattern"].includes(target.knowledgeState)) return terminal(claim, version, "review_recommended", "stale_relation_target", tx);
      if (!await fence(claim, version, "verify_first", "verification_required", tx)) return null;
      await attachEvidence(tx, target.id, claim, candidate, bundle, "supporting");
      const promoted = await promote(tx, target.id);
      const [attachedVersion] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, target.id)).limit(1);
      if (!attachedVersion) return null;
      await markIndexDirty(tx, target.id, attachedVersion, "ingestion_attach");
      if (promoted) await markIndexDirty(tx, target.id, attachedVersion, "ingestion_promotion");
      await enrollVerifyFirstSampling({ terminalIngestionJobId: claim.jobId, cardId: target.id, contentVersion: attachedVersion.contentVersion, evidenceSetRevision: attachedVersion.evidenceSetRevision, routeSegment: target.routeSegment, locationName: target.locationName }, tx);
      await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "update", targetType: "knowledge_ingestion_verify_first_evidence", targetId: target.id, afterSummary: "System pipeline attached corroborating evidence to a suppressed verification-required card." });
      return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "verify_first", cardId: target.id };
    }
    if (relation.action === "conflict" && relation.targetCardId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${relation.targetCardId}, 46))`);
      const [target] = await tx.select({ id: knowledgeCards.id, conditions: knowledgeCards.conditions, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment }).from(knowledgeCards).where(and(eq(knowledgeCards.id, relation.targetCardId), eq(knowledgeCards.type, candidate.type), eq(knowledgeCards.publicationState, "active"))).limit(1).for("update");
      if (!target || !sameScope(target, candidate)) return terminal(claim, version, "review_recommended", "stale_relation_target", tx);
      if (!sameConditions(target.conditions, candidate.conditions)) return persistCandidateForReview(claim, version, candidate, judgment, bundle, extractionModelId, "missing_context", "conflict_condition_mismatch", tx);
      if (!await fence(claim, version, "review_recommended", "relation_conflict", tx)) return null;
      await attachEvidence(tx, target.id, claim, candidate, bundle, "conflicting");
      await tx.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "conflicted", reviewState: "ai_recommended", verificationState: "required", needsReview: true, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(eq(knowledgeCards.id, target.id));
      const [updated] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, target.id)).limit(1);
      if (!updated) return null;
      await scheduleKnowledgeRecommendation({ cardId: target.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, reason: "conflict", supersedeStaleBy: systemRecommendationActor }, tx);
      await invalidateConflictedProjection(tx, target.id, updated);
      await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "update", targetType: "knowledge_ingestion_conflict", targetId: target.id, afterSummary: "System pipeline suppressed a conflicted high-risk card for required verification." });
      return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "review_recommended" };
    }
    if (relation.action !== "create") return terminal(claim, version, "review_recommended", "verify_first_relation_not_create", tx);
    if (!await fence(claim, version, "verify_first", "verification_required", tx)) return null;
    const [card] = await tx.insert(knowledgeCards).values({ type: candidate.type, title: candidate.title, summary: candidate.summary, locationName: candidate.locationName, routeSegment: candidate.routeSegment, conditions: candidate.conditions, freshnessSensitive: candidate.freshnessSensitive, confidence: bundle.source.sourceType === "community" ? "community" : "unverified", status: "approved", publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "ai_recommended", verificationState: "required", needsReview: true, currentJudgeSummary: judgment.summary, aiPromptVersion: knowledgePipelineExtractionPromptVersion, aiGatewayModelId: extractionModelId, createdByUserId: systemActorId }).returning({ id: knowledgeCards.id, contentVersion: knowledgeCards.contentVersion });
    await tx.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: claim.sourceId, supportLevel: "primary" });
    await attachEvidence(tx, card.id, claim, candidate, bundle, "supporting");
    const [versioned] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, card.id)).limit(1);
    if (!versioned) return null;
    await markIndexDirty(tx, card.id, versioned, "ingestion_verify_first");
    await enrollVerifyFirstSampling({ terminalIngestionJobId: claim.jobId, cardId: card.id, contentVersion: versioned.contentVersion, evidenceSetRevision: versioned.evidenceSetRevision, routeSegment: candidate.routeSegment, locationName: candidate.locationName }, tx);
    await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "create", targetType: "knowledge_ingestion_verify_first", targetId: card.id, afterSummary: "System pipeline retained a suppressed canonical card for required verification." });
    return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "verify_first", cardId: card.id };
  });
}
async function retainCandidateForReview(claim: KnowledgeIngestionClaim, version: number, candidate: Candidate, judgment: Judgment, bundle: NonNullable<Awaited<ReturnType<typeof loadBundle>>>, extractionModelId: string, reason: "relation" | "missing_context" | "weak_evidence", code: string, db: PipelineDb): Promise<KnowledgeIngestionPipelineResult | null> {
  return db.transaction(async (tx) => {
    await lockSamplingPolicyBoundary(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${claim.sourceId}, 44))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity(candidate)}, 45))`);
    const [current] = await tx.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, claim.captureVersionId), eq(sources.currentCaptureVersionId, claim.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1).for("update");
    if (!current) {
      const committed = await fence(claim, version, "suppressed", "stale_or_deleted_capture", tx, "judging");
      return committed ? { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "suppressed" } : null;
    }
    return persistCandidateForReview(claim, version, candidate, judgment, bundle, extractionModelId, reason, code, tx, "judging");
  });
}
async function persistCandidateForReview(claim: KnowledgeIngestionClaim, version: number, candidate: Candidate, judgment: Judgment, bundle: NonNullable<Awaited<ReturnType<typeof loadBundle>>>, extractionModelId: string, reason: "relation" | "missing_context" | "weak_evidence", code: string, tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0], expectedStage: "judging" | "relating" = "relating"): Promise<KnowledgeIngestionPipelineResult | null> {
  if (!await fence(claim, version, "review_recommended", code, tx, expectedStage)) return null;
  const verificationRequired = judgment.decision === "verify_first" || candidate.freshnessSensitive || isHighRisk(candidate);
  const [card] = await tx.insert(knowledgeCards).values({ type: candidate.type, title: candidate.title, summary: candidate.summary, locationName: candidate.locationName, routeSegment: candidate.routeSegment, conditions: candidate.conditions, freshnessSensitive: candidate.freshnessSensitive, confidence: bundle.source.sourceType === "community" ? "community" : "unverified", status: "approved", publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "ai_recommended", verificationState: verificationRequired ? "required" : "not_required", needsReview: true, currentJudgeSummary: judgment.summary, aiPromptVersion: knowledgePipelineExtractionPromptVersion, aiGatewayModelId: extractionModelId, createdByUserId: systemActorId }).returning({ id: knowledgeCards.id });
  await tx.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: claim.sourceId, supportLevel: "primary" });
  await attachEvidence(tx, card.id, claim, candidate, bundle, "supporting");
  const [versioned] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, card.id)).limit(1);
  if (!versioned) return null;
  await markIndexDirty(tx, card.id, versioned, "ingestion_relation_review");
  await scheduleKnowledgeRecommendation({ cardId: card.id, contentVersion: versioned.contentVersion, evidenceSetRevision: versioned.evidenceSetRevision, reason, supersedeStaleBy: systemRecommendationActor }, tx);
  await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "create", targetType: "knowledge_ingestion_relation_review", targetId: card.id, afterSummary: `System pipeline retained a suppressed canonical card for ${verificationRequired ? "required verification and " : ""}${reason === "relation" ? "relation" : reason === "weak_evidence" ? "weak-evidence" : "missing-context"} review.` });
  return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "review_recommended", cardId: card.id };
}
async function invalidateConflictedProjection(tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0], cardId: string, version: { contentVersion: number; evidenceSetRevision: number }) {
  await markIndexDirty(tx, cardId, version, "ingestion_conflict");
  await tx.update(knowledgeCardSearchDocuments).set({ status: "disabled", disabledAt: new Date(), updatedAt: new Date() }).where(and(eq(knowledgeCardSearchDocuments.knowledgeCardId, cardId), eq(knowledgeCardSearchDocuments.status, "active")));
}
async function attachEvidence(tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0], cardId: string, claim: KnowledgeIngestionClaim, candidate: Candidate, bundle: NonNullable<Awaited<ReturnType<typeof loadBundle>>>, supportLevel: "supporting" | "conflicting") {
  const [source] = await tx.select({ sourceId: knowledgeCardSources.sourceId }).from(knowledgeCardSources).where(and(eq(knowledgeCardSources.knowledgeCardId, cardId), eq(knowledgeCardSources.sourceId, claim.sourceId))).limit(1);
  if (!source) await tx.insert(knowledgeCardSources).values({ knowledgeCardId: cardId, sourceId: claim.sourceId, supportLevel });
  const values = { sourceId: claim.sourceId, captureVersionId: claim.captureVersionId, quoteText: candidate.evidence.quoteText, spanStart: candidate.evidence.spanStart, spanEnd: candidate.evidence.spanEnd, observedAt: bundle.capturedAt, capturedAt: bundle.capturedAt, conditions: candidate.conditions, supportLevel, displayPolicy: bundle.source.kind === "facebook" ? "operator_only" as const : "fact_only" as const, state: "active" as const, independenceKey: claim.sourceId };
  const [existing] = await tx.select({ id: knowledgeCardEvidence.id }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, cardId), eq(knowledgeCardEvidence.independenceKey, claim.sourceId))).limit(1).for("update");
  if (existing) {
    await tx.update(knowledgeCardEvidence).set(values).where(eq(knowledgeCardEvidence.id, existing.id));
    await incrementEvidenceSetRevision(tx, cardId);
    return;
  }
  const active = await tx.select({ id: knowledgeCardEvidence.id }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, cardId), eq(knowledgeCardEvidence.supportLevel, supportLevel), eq(knowledgeCardEvidence.state, "active"))).orderBy(desc(knowledgeCardEvidence.capturedAt)).for("update");
  for (const evidence of active.slice((supportLevel === "supporting" ? 3 : 1) - 1)) await tx.update(knowledgeCardEvidence).set({ state: "removed" }).where(eq(knowledgeCardEvidence.id, evidence.id));
  await tx.insert(knowledgeCardEvidence).values({ knowledgeCardId: cardId, ...values });
  await incrementEvidenceSetRevision(tx, cardId);
}
async function incrementEvidenceSetRevision(tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0], cardId: string) {
  const [updated] = await tx.update(knowledgeCards).set({ evidenceSetRevision: sql`${knowledgeCards.evidenceSetRevision} + 1`, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(eq(knowledgeCards.id, cardId)).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (updated) {
    await enqueueKnowledgeIndexWork(tx, { cardId, ...updated, reason: "evidence_change" });
    await disableStaleKnowledgeSearchProjection(tx, cardId, updated.contentVersion);
  }
}
async function promote(tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0], cardId: string) { const evidence = await tx.select({ key: knowledgeCardEvidence.independenceKey }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, cardId), eq(knowledgeCardEvidence.supportLevel, "supporting"), eq(knowledgeCardEvidence.state, "active"))); if (new Set(evidence.map((item) => item.key)).size < 2) return false; const [updated] = await tx.update(knowledgeCards).set({ knowledgeState: "community_pattern", contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, cardId), sql`${knowledgeCards.knowledgeState} <> 'community_pattern'`)).returning({ id: knowledgeCards.id }); return Boolean(updated); }
async function markIndexDirty(tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0], cardId: string, version: { contentVersion: number; evidenceSetRevision: number }, reason: string) { await enqueueKnowledgeIndexWork(tx, { cardId, ...version, reason }); }
async function fence(claim: KnowledgeIngestionClaim, version: number, stage: "published" | "suppressed" | "review_recommended" | "verify_first", code: string | undefined, tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0], expectedStage: "judging" | "relating" = "relating") { const [row] = await tx.execute(sql`update knowledge_ingestion_jobs set stage = ${stage}, stage_version = ${version + 1}, checkpoint = null, last_error_code = ${code ?? null}, claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null, updated_at = timezone('UTC', now()) where id = ${claim.jobId} and stage = ${expectedStage} and stage_version = ${version} and fencing_token = ${claim.fencingToken} and lease_expires_at > timezone('UTC', now()) returning id`) as Array<{ id: string }>; return row ?? null; }
async function terminal(claim: KnowledgeIngestionClaim, version: number, stage: "suppressed" | "review_recommended", code: string, tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0]) { const committed = await fence(claim, version, stage, code, tx); return committed ? { jobId: claim.jobId, sourceId: claim.sourceId, outcome: stage } : null; }
async function terminalVerifyFirst(claim: KnowledgeIngestionClaim, version: number, tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0]) { const [row] = await tx.execute(sql`update knowledge_ingestion_jobs set stage = 'suppressed', stage_version = ${version + 1}, checkpoint = null, last_error_code = 'stale_or_deleted_capture', claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null, updated_at = timezone('UTC', now()) where id = ${claim.jobId} and stage = 'relating' and stage_version = ${version} and fencing_token = ${claim.fencingToken} and lease_expires_at > timezone('UTC', now()) returning id`) as Array<{ id: string }>; return row ? { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "suppressed" as const } : null; }
function decideOutcome(candidate: Candidate, judgment: Judgment): KnowledgeIngestionPipelineResult["outcome"] { if (!passes(judgment)) return "suppressed"; if (candidate.freshnessSensitive || isHighRisk(candidate) || judgment.decision === "verify_first") return "verify_first"; return judgment.decision === "publish" ? "published" : judgment.decision === "suppress" ? "suppressed" : "review_recommended"; }
function parseCandidate(content: string, rawText: string): { candidate: Candidate | null; reason: string } {
  const value = parseObject(content)?.candidate;
  if (!isRecord(value) || !knowledgeCardTypeValues.includes(value.type as Candidate["type"])) return { candidate: null, reason: "candidate_invalid_structure" };
  const title = bounded(value.title, 160); const summary = bounded(value.summary, 1200); const locationName = optionalBounded(value.location_name, 160); const routeSegment = optionalBounded(value.route_segment, 160); const evidence = isRecord(value.evidence) ? value.evidence : null; const quoteText = evidence ? bounded(evidence.quote_text, 2000) : null; const start = evidence?.span_start; const end = evidence?.span_end; const conditions = Array.isArray(value.conditions) ? [...new Set(value.conditions.map((item) => bounded(item, 160)).filter((item): item is string => Boolean(item)).map(normalize))].slice(0, 12) : [];
  if (!title || !summary || (!locationName && !routeSegment) || typeof value.freshness_sensitive !== "boolean" || !quoteText || !Number.isInteger(start) || !Number.isInteger(end)) return { candidate: null, reason: "candidate_missing_required_fields" };
  const spanStart = start as number; const spanEnd = end as number; const persisted = [title, summary, ...[locationName, routeSegment].filter((item): item is string => item !== null), ...conditions, quoteText];
  if (persisted.some(containsSensitiveText)) return { candidate: null, reason: "candidate_sensitive_content" };
  const text = persisted.join("\n");
  if (spanStart < 0 || spanEnd <= spanStart || slice(rawText, spanStart, spanEnd) !== quoteText) return { candidate: null, reason: "candidate_evidence_mismatch" };
  if (isCommercial(text) || isQuestionOnly(text) || isOpinionOnly(text) || !hasTravelContext(text)) return { candidate: null, reason: "candidate_insufficient_travel_context" };
  return { candidate: { type: value.type as Candidate["type"], title, summary, locationName, routeSegment, conditions, freshnessSensitive: value.freshness_sensitive, evidence: { quoteText, spanStart, spanEnd } }, reason: "" };
}
function parseCandidates(content: string, rawText: string, coreStart: number, coreEnd: number) {
  if (Buffer.byteLength(content, "utf8") > 256_000) return null;
  const value = parseObject(content);
  if (!value || !Array.isArray(value.candidates) || Object.keys(value).length !== 1) return null;
  const unique = new Map<string, Candidate>();
  let invalidCount = 0;
  for (const entry of value.candidates) {
    const parsed = parseCandidate(JSON.stringify({ candidate: entry }), rawText);
    if (parsed.candidate && parsed.candidate.evidence.spanStart >= coreStart && parsed.candidate.evidence.spanStart < coreEnd) unique.set(fingerprint(parsed.candidate), parsed.candidate);
    else if (!parsed.candidate) invalidCount += 1;
  }
  return { candidates: [...unique.values()], invalidCount };
}
function parseJudgment(content: string): Judgment | null { const value = parseObject(content); if (!isRecord(value) || !["publish", "review_recommended", "verify_first", "suppress"].includes(String(value.decision))) return null; const summary = bounded(value.summary, 1000); const keys = ["relevance", "extractability", "evidence_grounding", "specificity", "actionability", "first_hand_likelihood", "spam_commercial_risk"] as const; if (!summary || keys.some((key) => typeof value[key] !== "number" || value[key] < 0 || value[key] > 1)) return null; return { decision: value.decision as Judgment["decision"], summary, relevance: value.relevance as number, extractability: value.extractability as number, evidenceGrounding: value.evidence_grounding as number, specificity: value.specificity as number, actionability: value.actionability as number, firstHandLikelihood: value.first_hand_likelihood as number, spamCommercialRisk: value.spam_commercial_risk as number }; }
function parseRelation(content: string, ids: Set<string>): Relation | null { const value = parseObject(content); if (!isRecord(value) || !["attach", "create", "conflict", "ambiguous"].includes(String(value.action))) return null; const summary = bounded(value.summary, 1000); const targetCardId = optionalBounded(value.target_card_id, 160); if (!summary || (targetCardId && !ids.has(targetCardId)) || (["attach", "conflict"].includes(String(value.action)) && !targetCardId)) return null; return { action: value.action as Relation["action"], targetCardId, summary }; }
async function recordUsage(db: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0] | PipelineDb, model: SelectedAiGatewayModel, purpose: string, promptVersion: string, result: Awaited<ReturnType<typeof completeExtraction>>) { try { await writeAiUsageEvent(db, { initiatedByUserId: null, executorSystem: "system-knowledge-pipeline", purpose, provider: result.provider, model: result.model, aiGatewayModelId: model.id, promptVersion, status: result.ok ? "success" : "failure", latencyMs: result.latencyMs, ...(result.ok ? result.usage : {}), pricingSnapshot: getAiGatewayPricingSnapshot(model), errorCode: result.ok ? null : result.errorCode }); } catch { /* telemetry never changes the fenced outcome */ } }
function passes(value: Judgment) { return value.relevance >= .75 && value.extractability >= .70 && value.evidenceGrounding >= .90 && value.specificity >= .65 && value.actionability >= .65 && value.firstHandLikelihood >= .55 && value.spamCommercialRisk <= .25; }
function isHighRisk(candidate: Candidate) { return ["warning", "route_note", "ev_charging", "cost_note", "discount_promotion", "parking"].includes(candidate.type) || isHighRiskText(`${candidate.title}\n${candidate.summary}\n${candidate.conditions.join("\n")}\n${candidate.evidence.quoteText}`); }
function isHighRiskText(value: string) { return /\b(?:ev|sạc|charging|giá|phí|mở cửa|đóng cửa|lịch|còn chỗ|availability|đặt chỗ|booking|khuyến mãi|giảm giá|sạt lở|tai nạn|cấm đường|đường đóng)\b/i.test(value); }
function containsSensitiveText(value: string) { return /(?:\+?84|0)(?:[\s.-]?\d){8,10}\b|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(value); }
function isCommercial(value: string) { return /\b(liên hệ|inbox|đặt ngay|mua ngay|sale|khuyến mãi|giảm giá|ưu đãi|hotline|zalo)\b/i.test(value); }
function isQuestionOnly(value: string) { const parts = value.split(/[.!?\n]+/).map((part) => part.trim()).filter(Boolean); return parts.length > 0 && parts.every((part) => /\?|\b(ai biết|xin hỏi|có ai|cho hỏi)\b/i.test(part)); }
function isOpinionOnly(value: string) { return /(tôi nghĩ|theo tôi|cảm thấy|rất đẹp|rất hay|tuyệt vời|đáng đi)/i.test(value) && !/(có|không có|mở|đóng|cấm|bãi|trạm|quán|khách sạn|km|giờ|phí|chỗ)/i.test(value); }
function hasTravelContext(value: string) { return value.length >= 20 && /(đèo|đường|quốc lộ|cao tốc|bãi|trạm|quán|nhà hàng|khách sạn|homestay|điểm dừng|điểm ngắm|địa chỉ|km|phường|xã|thành phố|tỉnh|ban ngày|buổi sáng|buổi tối)/i.test(value); }
function slice(value: string, start: number, end: number) { return Array.from(value).slice(start, end).join(""); }
function normalize(value: string) { return value.normalize("NFKC").trim().toLocaleLowerCase("vi").replace(/\s+/g, " "); }
function sameScope(card: { locationName: string | null; routeSegment: string | null }, candidate: Candidate) { return candidate.locationName ? normalize(card.locationName ?? "") === normalize(candidate.locationName) : normalize(card.routeSegment ?? "") === normalize(candidate.routeSegment ?? ""); }
function sameConditions(left: string[], right: string[]) { const normalizedLeft = [...new Set(left.map(normalize))].sort(); const normalizedRight = [...new Set(right.map(normalize))].sort(); return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((condition, index) => condition === normalizedRight[index]); }
function identity(candidate: Candidate) { return `${candidate.type}:${normalize(candidate.locationName ?? candidate.routeSegment ?? "")}:${[...new Set(candidate.conditions.map(normalize))].sort().join("|")}:${createHash("sha256").update(candidate.evidence.quoteText, "utf8").digest("hex")}`; }
function fingerprint(candidate: Candidate) { return createHash("sha256").update(`${candidate.type}\u0000${candidate.evidence.spanStart}\u0000${candidate.evidence.spanEnd}\u0000${normalize(candidate.locationName ?? candidate.routeSegment ?? "")}\u0000${[...new Set(candidate.conditions.map(normalize))].sort().join("|")}`, "utf8").digest("hex"); }
function invalidFingerprint(coreStart: number, index: number) { return createHash("sha256").update(`invalid\u0000${coreStart}\u0000${index}`, "utf8").digest("hex"); }
function scoresFor(judgment: Judgment) { return { relevance: judgment.relevance, extractability: judgment.extractability, evidenceGrounding: judgment.evidenceGrounding, specificity: judgment.specificity, actionability: judgment.actionability, firstHandLikelihood: judgment.firstHandLikelihood, spamCommercialRisk: judgment.spamCommercialRisk }; }
function parseObject(content: string): Record<string, unknown> | null { try { const value: unknown = JSON.parse(content); return isRecord(value) ? value : null; } catch { return null; } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function bounded(value: unknown, max: number) { return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null; }
function optionalBounded(value: unknown, max: number) { return value === null || value === undefined ? null : bounded(value, max); }
