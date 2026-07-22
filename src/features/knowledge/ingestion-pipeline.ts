import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { auditEvents, knowledgeCardEvidence, knowledgeCards, knowledgeCardSources, knowledgeCardTypeValues, knowledgeIngestionJobs, sourceCaptureVersions, sources } from "@/db/schema";
import { completeEvaluation, completeExtraction } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel, type SelectedAiGatewayModel } from "@/features/ai/models";
import { buildKnowledgePipelineExtractionMessages, buildKnowledgePipelineJudgmentMessages, buildKnowledgePipelineRelationJudgmentMessages, knowledgePipelineExtractionPromptVersion, knowledgePipelineExtractionPurpose, knowledgePipelineJudgmentPromptVersion, knowledgePipelineJudgmentPurpose } from "@/features/ai/prompts";
import { commitKnowledgeIngestionStage, type KnowledgeIngestionClaim } from "@/features/knowledge/ingestion-jobs";
import { writeAiUsageEvent } from "@/features/usage/events";

const systemActorId = "system-knowledge-pipeline";
const systemActorEmail = "system-knowledge-pipeline@xuyenviet.invalid";
type PipelineDb = ReturnType<typeof getDb>;
type Candidate = { type: (typeof knowledgeCardTypeValues)[number]; title: string; summary: string; locationName: string | null; routeSegment: string | null; conditions: string[]; freshnessSensitive: boolean; evidence: { quoteText: string; spanStart: number; spanEnd: number } };
type Judgment = { decision: "publish" | "review_recommended" | "verify_first" | "suppress"; summary: string; relevance: number; extractability: number; evidenceGrounding: number; specificity: number; actionability: number; firstHandLikelihood: number; spamCommercialRisk: number };
type Relation = { action: "attach" | "create" | "conflict" | "ambiguous"; targetCardId: string | null; summary: string };
export type KnowledgeIngestionPipelineResult = { jobId: string; sourceId: string; outcome: "published" | "suppressed" | "review_recommended" | "verify_first" | "failed"; cardId?: string };

export async function runKnowledgeIngestionPipeline(claim: KnowledgeIngestionClaim, db: PipelineDb = getDb()): Promise<KnowledgeIngestionPipelineResult | null> {
  let stage = claim.stage; let stageVersion = claim.stageVersion;
  const advance = async (nextStage: typeof knowledgeIngestionJobs.$inferSelect.stage, errorCode?: string) => {
    const committed = await commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: stage, expectedStageVersion: stageVersion, fencingToken: claim.fencingToken, nextStage, lastErrorCode: errorCode }, db);
    if (!committed) return false; stage = nextStage as typeof stage; stageVersion = committed.stageVersion; return true;
  };
  if (!await advance("triaging")) return null;
  const bundle = await loadBundle(db, claim); const rawText = bundle?.rawText;
  if (!bundle || !rawText?.trim() || containsSensitiveText(rawText)) return finish(claim, stage, stageVersion, "suppressed", "unsafe_or_unreadable_capture", db);
  if (isCommercial(rawText) || isQuestionOnly(rawText) || isOpinionOnly(rawText) || !hasTravelContext(rawText)) return finish(claim, stage, stageVersion, "suppressed", "insufficient_travel_context", db);
  if (isHighRiskText(rawText)) return finish(claim, stage, stageVersion, "verify_first", "high_risk_capture", db);
  if (!await advance("extracting")) return null;
  const extractionModel = await selectActiveAiGatewayModel({ purpose: knowledgePipelineExtractionPurpose, requiredCapabilities: { textInput: true, extraction: true }, db });
  if (!extractionModel) return finish(claim, stage, stageVersion, "failed", "model_unavailable", db);
  const extracted = await completeExtraction({ model: extractionModel.gatewayModelName, messages: buildKnowledgePipelineExtractionMessages({ source: bundle.source, rawText }) });
  await recordUsage(db, extractionModel, knowledgePipelineExtractionPurpose, knowledgePipelineExtractionPromptVersion, extracted);
  if (!extracted.ok) return finish(claim, stage, stageVersion, "failed", "provider_failed", db);
  const candidate = parseCandidate(extracted.content, rawText);
  if (!candidate) return finish(claim, stage, stageVersion, "suppressed", "invalid_candidate", db);
  if (!await advance("judging")) return null;
  const judgmentModel = await selectActiveAiGatewayModel({ purpose: knowledgePipelineJudgmentPurpose, requiredCapabilities: { textInput: true, evaluation: true }, db });
  if (!judgmentModel) return finish(claim, stage, stageVersion, "failed", "judge_model_unavailable", db);
  if (judgmentModel.id === extractionModel.id || judgmentModel.gatewayModelName === extractionModel.gatewayModelName) return finish(claim, stage, stageVersion, "review_recommended", "judge_model_not_independent", db);
  const judged = await completeEvaluation({ model: judgmentModel.gatewayModelName, messages: buildKnowledgePipelineJudgmentMessages({ candidate: candidate as unknown as Record<string, unknown>, evidence: candidate.evidence }) });
  await recordUsage(db, judgmentModel, knowledgePipelineJudgmentPurpose, knowledgePipelineJudgmentPromptVersion, judged);
  if (!judged.ok) return finish(claim, stage, stageVersion, "failed", "judge_provider_failed", db);
  const judgment = parseJudgment(judged.content);
  if (!judgment) return finish(claim, stage, stageVersion, "suppressed", "invalid_judgment", db);
  if (!await advance("relating")) return null;
  const outcome = decideOutcome(candidate, judgment);
  if (outcome !== "published") return finish(claim, stage, stageVersion, outcome, "policy_outcome", db);
  const related = await loadRelatedCandidates(db, candidate);
  const relatedResult = await completeEvaluation({ model: judgmentModel.gatewayModelName, messages: buildKnowledgePipelineRelationJudgmentMessages({ candidate: candidate as unknown as Record<string, unknown>, candidates: related }) });
  await recordUsage(db, judgmentModel, knowledgePipelineJudgmentPurpose, knowledgePipelineJudgmentPromptVersion, relatedResult);
  if (!relatedResult.ok) return finish(claim, stage, stageVersion, "review_recommended", "relation_judge_provider_failed", db);
  const relation = parseRelation(relatedResult.content, new Set(related.map((card) => card.id)));
  if (!relation || relation.action === "ambiguous") return finish(claim, stage, stageVersion, "review_recommended", "relation_ambiguous", db);
  return publish(claim, stageVersion, candidate, judgment, bundle, extractionModel, relation, db);
}

async function loadBundle(db: PipelineDb, claim: KnowledgeIngestionClaim) {
  const [bundle] = await db.select({ rawText: sourceCaptureVersions.rawText, capturedAt: sourceCaptureVersions.capturedAt, source: { id: sources.id, kind: sources.kind, label: sources.label, sourceType: sources.sourceType, verificationStatus: sources.verificationStatus, official: sources.official, partner: sources.partner } }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, claim.captureVersionId), eq(sourceCaptureVersions.sourceId, claim.sourceId), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
  return bundle ?? null;
}
async function finish(claim: KnowledgeIngestionClaim, stage: typeof knowledgeIngestionJobs.$inferSelect.stage, version: number, outcome: Exclude<KnowledgeIngestionPipelineResult["outcome"], "published">, code: string, db: PipelineDb) {
  const committed = await commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: stage as "queued" | "triaging" | "extracting" | "judging" | "relating", expectedStageVersion: version, fencingToken: claim.fencingToken, nextStage: outcome, lastErrorCode: code }, db);
  return committed ? { jobId: claim.jobId, sourceId: claim.sourceId, outcome } : null;
}
async function loadRelatedCandidates(db: PipelineDb, candidate: Candidate) {
  const scope = normalize(candidate.locationName ?? candidate.routeSegment ?? "");
  const scopeColumn = candidate.locationName ? knowledgeCards.locationName : knowledgeCards.routeSegment;
  return db.select({ id: knowledgeCards.id, title: knowledgeCards.title, summary: knowledgeCards.summary, conditions: knowledgeCards.conditions, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, verificationState: knowledgeCards.verificationState })
    .from(knowledgeCards)
    .where(and(eq(knowledgeCards.type, candidate.type), eq(knowledgeCards.publicationState, "active"), sql`lower(regexp_replace(normalize(coalesce(${scopeColumn}, '')), '\\s+', ' ', 'g')) = ${scope}`))
    .orderBy(desc(knowledgeCards.updatedAt))
    .limit(200);
}
async function publish(claim: KnowledgeIngestionClaim, version: number, candidate: Candidate, judgment: Judgment, bundle: NonNullable<Awaited<ReturnType<typeof loadBundle>>>, extractionModel: SelectedAiGatewayModel, relation: Relation, db: PipelineDb): Promise<KnowledgeIngestionPipelineResult | null> {
  return db.transaction(async (tx) => {
    // Matches appendSourceCaptureVersion so current-capture validation and publish are atomic.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${claim.sourceId}, 44))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity(candidate)}, 45))`);
    const [current] = await tx.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, claim.captureVersionId), eq(sources.currentCaptureVersionId, claim.captureVersionId), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1).for("update");
    if (!current) return terminal(claim, version, "suppressed", "stale_or_deleted_capture", tx);
    if ((relation.action === "attach" || relation.action === "conflict") && !relation.targetCardId) return terminal(claim, version, "review_recommended", "invalid_relation_target", tx);
    let target: { id: string; conditions: string[]; verificationState: typeof knowledgeCards.$inferSelect.verificationState } | null = null;
    if (relation.targetCardId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${relation.targetCardId}, 46))`);
      const [lockedTarget] = await tx.select({ id: knowledgeCards.id, conditions: knowledgeCards.conditions, verificationState: knowledgeCards.verificationState, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment }).from(knowledgeCards).where(and(eq(knowledgeCards.id, relation.targetCardId), eq(knowledgeCards.type, candidate.type), eq(knowledgeCards.publicationState, "active"))).limit(1).for("update");
      if (!lockedTarget || !sameScope(lockedTarget, candidate)) return terminal(claim, version, "review_recommended", "stale_relation_target", tx);
      target = lockedTarget;
    }
    if (relation.action === "attach" && target) {
      if (!sameConditions(target.conditions, candidate.conditions)) return terminal(claim, version, "review_recommended", "attach_condition_mismatch", tx);
      if (!await fence(claim, version, "published", undefined, tx)) return null;
      await attachEvidence(tx, target.id, claim, candidate, bundle, "supporting"); await promote(tx, target.id);
      await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "update", targetType: "knowledge_ingestion_evidence", targetId: target.id, afterSummary: "System pipeline attached independent supporting evidence." });
      return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "published", cardId: target.id };
    }
    if (relation.action === "conflict" && target) {
      if (!sameConditions(target.conditions, candidate.conditions)) return terminal(claim, version, "review_recommended", "conflict_condition_mismatch", tx);
      if (!await fence(claim, version, "review_recommended", "relation_conflict", tx)) return null;
      await attachEvidence(tx, target.id, claim, candidate, bundle, "conflicting");
      await tx.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "conflicted", reviewState: "ai_recommended", verificationState: isHighRisk(candidate) ? "required" : target.verificationState, needsReview: true, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(eq(knowledgeCards.id, target.id));
      await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "update", targetType: "knowledge_ingestion_conflict", targetId: target.id, afterSummary: "System pipeline suppressed a conflicted card for review." });
      return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "review_recommended" };
    }
    if (relation.action !== "create") return terminal(claim, version, "review_recommended", "invalid_relation_action", tx);
    if (!await fence(claim, version, "published", undefined, tx)) return null;
    const [card] = await tx.insert(knowledgeCards).values({ type: candidate.type, title: candidate.title, summary: candidate.summary, locationName: candidate.locationName, routeSegment: candidate.routeSegment, conditions: candidate.conditions, freshnessSensitive: candidate.freshnessSensitive, confidence: bundle.source.sourceType === "community" ? "community" : "unverified", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", needsReview: false, currentJudgeSummary: judgment.summary, aiPromptVersion: knowledgePipelineExtractionPromptVersion, aiGatewayModelId: extractionModel.id, createdByUserId: systemActorId }).returning({ id: knowledgeCards.id });
    await tx.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: claim.sourceId, supportLevel: "primary" }); await attachEvidence(tx, card.id, claim, candidate, bundle, "supporting");
    await tx.insert(auditEvents).values({ actorUserId: systemActorId, actorEmail: systemActorEmail, operation: "create", targetType: "knowledge_ingestion_publication", targetId: card.id, afterSummary: "System pipeline published an evidence-grounded knowledge card." });
    return { jobId: claim.jobId, sourceId: claim.sourceId, outcome: "published", cardId: card.id };
  });
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
async function incrementEvidenceSetRevision(tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0], cardId: string) { await tx.update(knowledgeCards).set({ evidenceSetRevision: sql`${knowledgeCards.evidenceSetRevision} + 1` }).where(eq(knowledgeCards.id, cardId)); }
async function promote(tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0], cardId: string) { const evidence = await tx.select({ key: knowledgeCardEvidence.independenceKey }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, cardId), eq(knowledgeCardEvidence.supportLevel, "supporting"), eq(knowledgeCardEvidence.state, "active"))); if (new Set(evidence.map((item) => item.key)).size >= 2) await tx.update(knowledgeCards).set({ knowledgeState: "community_pattern" }).where(eq(knowledgeCards.id, cardId)); }
async function fence(claim: KnowledgeIngestionClaim, version: number, stage: "published" | "suppressed" | "review_recommended", code: string | undefined, tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0]) { const [row] = await tx.execute(sql`update knowledge_ingestion_jobs set stage = ${stage}, stage_version = ${version + 1}, last_error_code = ${code ?? null}, claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null, updated_at = timezone('UTC', now()) where id = ${claim.jobId} and stage = 'relating' and stage_version = ${version} and fencing_token = ${claim.fencingToken} and lease_expires_at > timezone('UTC', now()) returning id`) as Array<{ id: string }>; return row ?? null; }
async function terminal(claim: KnowledgeIngestionClaim, version: number, stage: "suppressed" | "review_recommended", code: string, tx: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0]) { const committed = await fence(claim, version, stage, code, tx); return committed ? { jobId: claim.jobId, sourceId: claim.sourceId, outcome: stage } : null; }
function decideOutcome(candidate: Candidate, judgment: Judgment): KnowledgeIngestionPipelineResult["outcome"] { if (!passes(judgment)) return "suppressed"; if (candidate.freshnessSensitive || isHighRisk(candidate) || judgment.decision === "verify_first") return "verify_first"; return judgment.decision === "publish" ? "published" : judgment.decision === "suppress" ? "suppressed" : "review_recommended"; }
function parseCandidate(content: string, rawText: string): Candidate | null { const value = parseObject(content)?.candidate; if (!isRecord(value) || !knowledgeCardTypeValues.includes(value.type as Candidate["type"])) return null; const title = bounded(value.title, 160); const summary = bounded(value.summary, 1200); const locationName = optionalBounded(value.location_name, 160); const routeSegment = optionalBounded(value.route_segment, 160); const evidence = isRecord(value.evidence) ? value.evidence : null; const quoteText = evidence ? bounded(evidence.quote_text, 2000) : null; const start = evidence?.span_start; const end = evidence?.span_end; const conditions = Array.isArray(value.conditions) ? [...new Set(value.conditions.map((item) => bounded(item, 160)).filter((item): item is string => Boolean(item)).map(normalize))].slice(0, 12) : []; if (!title || !summary || (!locationName && !routeSegment) || typeof value.freshness_sensitive !== "boolean" || !quoteText || !Number.isInteger(start) || !Number.isInteger(end)) return null; const spanStart = start as number; const spanEnd = end as number; const persisted = [title, summary, ...[locationName, routeSegment].filter((value): value is string => value !== null), ...conditions, quoteText]; if (persisted.some(containsSensitiveText)) return null; const text = persisted.join("\n"); if (spanStart < 0 || spanEnd <= spanStart || slice(rawText, spanStart, spanEnd) !== quoteText || isCommercial(text) || isQuestionOnly(text) || isOpinionOnly(text) || !hasTravelContext(text)) return null; return { type: value.type as Candidate["type"], title, summary, locationName, routeSegment, conditions, freshnessSensitive: value.freshness_sensitive, evidence: { quoteText, spanStart, spanEnd } }; }
function parseJudgment(content: string): Judgment | null { const value = parseObject(content); if (!isRecord(value) || !["publish", "review_recommended", "verify_first", "suppress"].includes(String(value.decision))) return null; const summary = bounded(value.summary, 1000); const keys = ["relevance", "extractability", "evidence_grounding", "specificity", "actionability", "first_hand_likelihood", "spam_commercial_risk"] as const; if (!summary || keys.some((key) => typeof value[key] !== "number" || value[key] < 0 || value[key] > 1)) return null; return { decision: value.decision as Judgment["decision"], summary, relevance: value.relevance as number, extractability: value.extractability as number, evidenceGrounding: value.evidence_grounding as number, specificity: value.specificity as number, actionability: value.actionability as number, firstHandLikelihood: value.first_hand_likelihood as number, spamCommercialRisk: value.spam_commercial_risk as number }; }
function parseRelation(content: string, ids: Set<string>): Relation | null { const value = parseObject(content); if (!isRecord(value) || !["attach", "create", "conflict", "ambiguous"].includes(String(value.action))) return null; const summary = bounded(value.summary, 1000); const targetCardId = optionalBounded(value.target_card_id, 160); if (!summary || (targetCardId && !ids.has(targetCardId)) || (["attach", "conflict"].includes(String(value.action)) && !targetCardId)) return null; return { action: value.action as Relation["action"], targetCardId, summary }; }
async function recordUsage(db: Parameters<Parameters<PipelineDb["transaction"]>[0]>[0] | PipelineDb, model: SelectedAiGatewayModel, purpose: string, promptVersion: string, result: Awaited<ReturnType<typeof completeExtraction>>) { try { await writeAiUsageEvent(db, { userId: systemActorId, purpose, provider: result.provider, model: result.model, aiGatewayModelId: model.id, promptVersion, status: result.ok ? "success" : "failure", latencyMs: result.latencyMs, ...(result.ok ? result.usage : {}), pricingSnapshot: getAiGatewayPricingSnapshot(model), errorCode: result.ok ? null : result.errorCode }); } catch { /* telemetry never changes the fenced outcome */ } }
function passes(value: Judgment) { return value.relevance >= .75 && value.extractability >= .70 && value.evidenceGrounding >= .90 && value.specificity >= .65 && value.actionability >= .65 && value.firstHandLikelihood >= .55 && value.spamCommercialRisk <= .25; }
function isHighRisk(candidate: Candidate) { return ["warning", "ev_charging", "cost_note", "discount_promotion", "parking"].includes(candidate.type) || isHighRiskText(`${candidate.title}\n${candidate.summary}\n${candidate.conditions.join("\n")}\n${candidate.evidence.quoteText}`); }
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
function identity(candidate: Candidate) { return `${candidate.type}:${normalize(candidate.locationName ?? candidate.routeSegment ?? "")}:${normalize(candidate.title)}`; }
function parseObject(content: string): Record<string, unknown> | null { try { const value: unknown = JSON.parse(content); return isRecord(value) ? value : null; } catch { return null; } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function bounded(value: unknown, max: number) { return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null; }
function optionalBounded(value: unknown, max: number) { return value === null || value === undefined ? null : bounded(value, max); }
