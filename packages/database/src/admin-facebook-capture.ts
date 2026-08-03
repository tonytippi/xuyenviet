import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AdminFacebookCapture, AdminFacebookCaptureCommandResult, AdminFacebookCaptureDetail, AdminFacebookCaptureQueue, AdminFacebookCaptureQueueStatus, RequestPrincipal } from "@xuyenviet/contracts";
import { adminFacebookCapturePageSize } from "@xuyenviet/contracts";
import type { AdminFacebookCapturePort } from "@xuyenviet/domain";
import { createUserAuditActor } from "./actors";
import { recordAuditEvent } from "./audit-writers";
import { getDb } from "./client";
import { knowledgeCardEvidence, knowledgeCardSearchDocuments, knowledgeCardSources, knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, sourceCaptureVersions, sources, users, facebookCaptureReviews } from "./schema";
import { sourceKnowledgeDraftExtractionPromptVersion } from "./prompts";

const unsafe = /cookie|token|local\s*storage|provider\s*payload|browser\s*profile|playwright|<html|<!doctype|hidden\s*data/i;
const stages = ["queued", "triaging", "extracting", "judging", "relating", "published", "suppressed", "review_recommended", "verify_first", "failed"] as const;

export function createPostgresAdminFacebookCapturePort(): AdminFacebookCapturePort {
  return { list, detail, recapture, rerunIngestion };
}

async function list(input: { status: AdminFacebookCaptureQueueStatus; page: number }): Promise<AdminFacebookCaptureQueue> {
  const db = getDb(); const where = queueCondition(input.status); const offset = (input.page - 1) * adminFacebookCapturePageSize;
  const [rows, totals, countRows] = await Promise.all([
    baseQuery(db).where(where).orderBy(stageOrder(), desc(knowledgeIngestionJobs.updatedAt), desc(facebookCaptureReviews.updatedAt), desc(facebookCaptureReviews.id)).limit(adminFacebookCapturePageSize).offset(offset),
    db.select({ count: count() }).from(facebookCaptureReviews).leftJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId)).where(where),
    db.select({ stage: knowledgeIngestionJobs.stage, count: count() }).from(facebookCaptureReviews).leftJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId)).groupBy(knowledgeIngestionJobs.stage),
  ]);
  const counts: Record<AdminFacebookCaptureQueueStatus, number> = { in_progress: 0, needs_attention: 0, failed: 0, published: 0, suppressed: 0 };
  for (const row of countRows) counts[queueStatus(row.stage)] += Number(row.count);
  return { status: input.status, page: input.page, pageSize: adminFacebookCapturePageSize, totalCount: Number(totals[0]?.count ?? 0), counts, items: rows.map(project) };
}

async function detail(reviewId: string): Promise<AdminFacebookCaptureDetail | null> {
  const [row] = await baseQuery(getDb()).where(eq(facebookCaptureReviews.id, reviewId)).limit(1);
  if (!row) return null; const projected = project(row);
  return { ...projected, canRecapture: ["needs_review", "extraction_failed", "rejected"].includes(projected.reviewStatus), canRerunIngestion: projected.ingestionJob?.protocolVersion === 2 };
}

async function recapture(actor: RequestPrincipal, reviewId: string, reason: string): Promise<AdminFacebookCaptureCommandResult> {
  const db = getDb(); const email = await actorEmail(actor.userId);
  return db.transaction(async (tx) => {
    const [initial] = await tx.select({ sourceId: facebookCaptureReviews.sourceId }).from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, reviewId)).limit(1);
    if (!initial) return { status: "not_found" };
    await tx.execute(sql`select pg_advisory_xact_lock(1179990092::integer, ${facebookCaptureLockHash(`facebook-capture:source:${initial.sourceId}`)}::integer)`);
    const [review] = await tx.select({ id: facebookCaptureReviews.id, sourceId: facebookCaptureReviews.sourceId, status: facebookCaptureReviews.status, captureVersionId: facebookCaptureReviews.captureVersionId }).from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, reviewId)).limit(1).for("update");
    if (!review) return { status: "not_found" };
    if (!["needs_review", "extraction_failed", "rejected"].includes(review.status)) return { status: "invalid_transition" };
    if (!safeText(reason, 500)) throw new Error("unsafe recapture reason");
    const cards = await tx.select({ id: knowledgeCards.id }).from(knowledgeCards).innerJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id)).where(and(eq(knowledgeCardSources.sourceId, review.sourceId), eq(knowledgeCards.aiPromptVersion, sourceKnowledgeDraftExtractionPromptVersion)));
    if (cards.length) return { status: "already_extracted" };
    const now = new Date(); const [updated] = await tx.update(facebookCaptureReviews).set({ status: "needs_review", reviewerUserId: null, executorSystem: null, reviewedAt: null, rejectionReason: null, extractionError: null, captureVersionId: null, forceLiveCapture: true, forceLiveCaptureGeneration: sql`${facebookCaptureReviews.forceLiveCaptureGeneration} + 1`, updatedAt: now }).where(and(eq(facebookCaptureReviews.id, review.id), eq(facebookCaptureReviews.status, review.status), sql`${facebookCaptureReviews.captureVersionId} is not distinct from ${review.captureVersionId}`)).returning({ id: facebookCaptureReviews.id });
    if (!updated) return { status: "stale_review" };
    await tx.update(sources).set({ currentCaptureVersionId: null }).where(and(eq(sources.id, review.sourceId), sql`${sources.currentCaptureVersionId} is not distinct from ${review.captureVersionId}`));
    await recordAuditEvent({ actor: createUserAuditActor({ userId: actor.userId, email }), operation: "update", targetType: "facebook_capture_review", targetId: review.id, afterSummary: `Facebook capture recapture requested; sourceId=${review.sourceId}; reason=${safeText(reason, 500)}.` }, tx);
    return { status: "updated" };
  });
}

async function rerunIngestion(actor: RequestPrincipal, reviewId: string): Promise<AdminFacebookCaptureCommandResult> {
  const db = getDb(); const email = await actorEmail(actor.userId);
  return db.transaction(async (tx) => {
    const [review] = await tx.select({ sourceId: facebookCaptureReviews.sourceId, captureVersionId: facebookCaptureReviews.captureVersionId, jobId: knowledgeIngestionJobs.id, protocolVersion: knowledgeIngestionJobs.protocolVersion, stage: knowledgeIngestionJobs.stage, stageVersion: knowledgeIngestionJobs.stageVersion }).from(facebookCaptureReviews).innerJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId)).innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId)).where(and(eq(facebookCaptureReviews.id, reviewId), eq(sources.currentCaptureVersionId, facebookCaptureReviews.captureVersionId))).limit(1).for("update");
    if (!review) return { status: "not_rerunnable" }; if (review.protocolVersion !== 2 || !review.captureVersionId) return { status: "not_rerunnable" };
    const now = new Date(); await supersedeCaptureOnlyCards(tx, { sourceId: review.sourceId, captureVersionId: review.captureVersionId }, now);
    await tx.delete(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.ingestionJobId, review.jobId));
    const [updated] = await tx.update(knowledgeIngestionJobs).set({ stage: "queued", discoveredCandidateCount: 0, terminalCandidateCount: 0, publishedCandidateCount: 0, suppressedCandidateCount: 0, reviewRecommendedCandidateCount: 0, verifyFirstCandidateCount: 0, failedCandidateCount: 0, invalidCandidateCount: 0, stageVersion: sql`${knowledgeIngestionJobs.stageVersion} + 1`, attemptCount: 0, nextRunAt: now, lastErrorCode: null, requeueReasonCode: "operator_rerun_current_pipeline", rawDiscoveryResponse: null, checkpoint: null, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now }).where(and(eq(knowledgeIngestionJobs.id, review.jobId), eq(knowledgeIngestionJobs.stage, review.stage), eq(knowledgeIngestionJobs.stageVersion, review.stageVersion), eq(knowledgeIngestionJobs.captureVersionId, review.captureVersionId))).returning({ id: knowledgeIngestionJobs.id });
    if (!updated) return { status: "stale_review" };
    await recordAuditEvent({ actor: createUserAuditActor({ userId: actor.userId, email }), operation: "update", targetType: "knowledge_ingestion_job", targetId: review.jobId, afterSummary: "Operator re-ran Facebook canonical ingestion with the current pipeline." }, tx);
    return { status: "updated" };
  });
}

function baseQuery(db: ReturnType<typeof getDb>) { return db.select({ id: facebookCaptureReviews.id, reviewStatus: facebookCaptureReviews.status, updatedAt: facebookCaptureReviews.updatedAt, sourceLabel: sources.label, sourceUrl: sources.url, canonicalUrl: sources.canonicalUrl, captureMethod: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'captureMethod'`, capturedAt: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'capturedAt'`, groupName: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'groupName'`, authorText: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'authorText'`, postCreatedAt: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'postCreatedAt'`, rawPresent: sql<boolean>`length(btrim(coalesce(${sourceCaptureVersions.rawText}, ''))) > 0`, jobId: knowledgeIngestionJobs.id, stage: knowledgeIngestionJobs.stage, protocolVersion: knowledgeIngestionJobs.protocolVersion, jobUpdatedAt: knowledgeIngestionJobs.updatedAt, lastErrorCode: knowledgeIngestionJobs.lastErrorCode, discoveredCandidateCount: knowledgeIngestionJobs.discoveredCandidateCount, terminalCandidateCount: knowledgeIngestionJobs.terminalCandidateCount, failedCandidateCount: knowledgeIngestionJobs.failedCandidateCount }).from(facebookCaptureReviews).innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId)).leftJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, facebookCaptureReviews.captureVersionId)).leftJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId)); }
type CaptureRow = { id: string; reviewStatus: AdminFacebookCapture["reviewStatus"]; updatedAt: Date; sourceLabel: string; sourceUrl: string | null; canonicalUrl: string | null; captureMethod: string | null; capturedAt: string | null; groupName: string | null; authorText: string | null; postCreatedAt: string | null; rawPresent: boolean; jobId: string | null; stage: typeof stages[number] | null; protocolVersion: number | null; jobUpdatedAt: Date | null; lastErrorCode: string | null; discoveredCandidateCount: number | null; terminalCandidateCount: number | null; failedCandidateCount: number | null };
function project(row: CaptureRow): AdminFacebookCapture { const job = row.jobId && row.stage && row.protocolVersion && row.jobUpdatedAt ? { stage: row.stage, protocolVersion: row.protocolVersion as 1 | 2, updatedAt: row.jobUpdatedAt.toISOString(), lastErrorCode: safeText(row.lastErrorCode, 160), discoveredCandidateCount: row.discoveredCandidateCount ?? 0, terminalCandidateCount: row.terminalCandidateCount ?? 0, failedCandidateCount: row.failedCandidateCount ?? 0 } : null; return { id: row.id, sourceLabel: safeText(row.sourceLabel, 500) ?? "Nguồn Facebook", displayUrl: safeUrl(row.canonicalUrl ?? row.sourceUrl), reviewStatus: row.reviewStatus, captureMethod: safeText(row.captureMethod, 500), capturedAt: safeTimestamp(row.capturedAt), groupName: safeText(row.groupName, 500), authorText: safeText(row.authorText, 500), postCreatedAt: safeTimestamp(row.postCreatedAt), updatedAt: row.updatedAt.toISOString(), ingestionJob: job, operationState: job ? null : row.rawPresent ? "awaiting_ingestion_job" : "recapture_pending" }; }
function queueCondition(status: AdminFacebookCaptureQueueStatus) { return status === "in_progress" ? or(isNull(knowledgeIngestionJobs.id), inArray(knowledgeIngestionJobs.stage, ["queued", "triaging", "extracting", "judging", "relating"])) : status === "needs_attention" ? inArray(knowledgeIngestionJobs.stage, ["review_recommended", "verify_first"]) : eq(knowledgeIngestionJobs.stage, status); }
async function supersedeCaptureOnlyCards(db: Pick<ReturnType<typeof getDb>, "select" | "update">, input: { sourceId: string; captureVersionId: string }, now: Date) { const cards = await db.select({ id: knowledgeCards.id }).from(knowledgeCards).innerJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id)).innerJoin(knowledgeCardEvidence, eq(knowledgeCardEvidence.knowledgeCardId, knowledgeCards.id)).where(and(eq(knowledgeCardSources.sourceId, input.sourceId), eq(knowledgeCardEvidence.sourceId, input.sourceId), eq(knowledgeCardEvidence.captureVersionId, input.captureVersionId), eq(knowledgeCardEvidence.state, "active"), sql`not exists (select 1 from knowledge_card_sources other_source where other_source.knowledge_card_id = ${knowledgeCards.id} and other_source.source_id <> ${input.sourceId})`, sql`not exists (select 1 from knowledge_card_evidence other_evidence where other_evidence.knowledge_card_id = ${knowledgeCards.id} and other_evidence.state = 'active' and (other_evidence.source_id <> ${input.sourceId} or other_evidence.capture_version_id <> ${input.captureVersionId}))`)).for("update"); const ids = [...new Set(cards.map((card) => card.id))]; if (!ids.length) return; await db.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "superseded", reviewState: "ai_recommended", needsReview: false, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: now }).where(inArray(knowledgeCards.id, ids)); await db.update(knowledgeRecommendations).set({ status: "superseded", resolution: "accepted", resolvedAt: now, executorSystem: "system-knowledge-pipeline", updatedAt: now }).where(and(inArray(knowledgeRecommendations.knowledgeCardId, ids), inArray(knowledgeRecommendations.status, ["open", "in_review"]))); await db.update(knowledgeCardSearchDocuments).set({ status: "disabled", disabledAt: now, updatedAt: now }).where(and(inArray(knowledgeCardSearchDocuments.knowledgeCardId, ids), eq(knowledgeCardSearchDocuments.status, "active"))); }
function queueStatus(stage: string | null): AdminFacebookCaptureQueueStatus { return stage === "published" ? "published" : stage === "suppressed" ? "suppressed" : stage === "failed" ? "failed" : stage === "review_recommended" || stage === "verify_first" ? "needs_attention" : "in_progress"; }
function stageOrder() { return sql`case ${knowledgeIngestionJobs.stage} when 'queued' then 0 when 'triaging' then 1 when 'extracting' then 2 when 'judging' then 3 when 'relating' then 4 when 'review_recommended' then 5 when 'verify_first' then 6 when 'failed' then 7 when 'published' then 8 when 'suppressed' then 9 else 10 end`; }
function safeText(value: string | null, max: number) { const text = value?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim(); return text && !unsafe.test(text) ? text.slice(0, max) : null; }
function safeTimestamp(value: string | null) { const text = safeText(value, 100); return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null; }
function safeUrl(value: string | null) { if (!value) return null; try { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol) || unsafe.test(`${url.origin}${url.pathname}${url.hash}`)) return null; for (const key of [...url.searchParams.keys()]) if (/token|secret|code|key|signature|password/i.test(key) || unsafe.test(url.searchParams.get(key) ?? "")) url.searchParams.set(key, "[redacted]"); return url.toString().slice(0, 500); } catch { return null; } }
async function actorEmail(userId: string) { const [user] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1); if (!user?.email) throw new Error("audit actor unavailable"); return user.email; }
function facebookCaptureLockHash(key: string) { let hash = 0x811c9dc5; for (let index = 0; index < key.length; index += 1) { hash ^= key.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return hash | 0; }
