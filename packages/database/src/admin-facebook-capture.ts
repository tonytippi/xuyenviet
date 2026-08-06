import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { adminFacebookCapturePageSize, type AdminFacebookCapture, type AdminFacebookCaptureCandidate, type AdminFacebookCaptureCommandResult, type AdminFacebookCaptureDetail, type AdminFacebookCaptureQueue, type AdminFacebookCaptureQueueStatus, type RequestPrincipal } from "@xuyenviet/contracts";
import type { AdminFacebookCapturePort } from "@xuyenviet/domain";
import { getDb } from "./client";
import { facebookCaptureReviews, knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, sourceCaptureVersions, sources } from "./schema";
import { safeAdminDisplayUrl } from "./admin-youtube-capture";
import { clearKnowledgeIngestionCandidatesForRerun } from "./knowledge-lifecycle";

export function createPostgresAdminFacebookCapturePort(): AdminFacebookCapturePort { return { list, detail, recapture, rerunIngestion }; }

async function list(input: { status: AdminFacebookCaptureQueueStatus; page: number }): Promise<AdminFacebookCaptureQueue> {
  const db = getDb();
  const filter = input.status === "not_started" ? isNull(knowledgeIngestionJobs.id) : eq(knowledgeIngestionJobs.status, input.status);
  const offset = (input.page - 1) * adminFacebookCapturePageSize;
  const [rows, totalRows, countRows] = await Promise.all([
    query().where(filter).orderBy(desc(knowledgeIngestionJobs.updatedAt), desc(facebookCaptureReviews.updatedAt)).limit(adminFacebookCapturePageSize).offset(offset),
    db.select({ count: count() }).from(facebookCaptureReviews).leftJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId)).where(filter),
    db.select({ status: knowledgeIngestionJobs.status, count: count() }).from(facebookCaptureReviews).leftJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId)).groupBy(knowledgeIngestionJobs.status),
  ]);
  const counts: Record<AdminFacebookCaptureQueueStatus, number> = { queued: 0, running: 0, completed: 0, failed: 0, not_started: 0 };
  for (const row of countRows) counts[row.status ?? "not_started"] = Number(row.count);
  return { status: input.status, page: input.page, pageSize: adminFacebookCapturePageSize, totalCount: Number(totalRows[0]?.count ?? 0), counts, items: rows.map(project) };
}

async function detail(id: string): Promise<AdminFacebookCaptureDetail | null> {
  const [row] = await detailQuery().where(eq(facebookCaptureReviews.id, id)).limit(1);
  if (!row) return null;
  const candidates = row.jobId ? await candidateProjection(row.jobId) : [];
  return { ...project(row), capture: row.captureId && row.captureCapturedAt ? { id: row.captureId, capturedAt: row.captureCapturedAt.toISOString(), captureMethod: safeText(row.captureMethod, 80), rawText: row.rawText } : null, candidates, canRecapture: row.status === "failed" || row.jobId === null, canRerunIngestion: row.status === "failed" || row.status === "completed" };
}

async function recapture(_actor: RequestPrincipal, _id: string, _reason: string): Promise<AdminFacebookCaptureCommandResult> { throw new Error("Facebook capture lifecycle commands require the Story 15.3 lifecycle command."); }
async function rerunIngestion(_actor: RequestPrincipal, id: string): Promise<AdminFacebookCaptureCommandResult> {
  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [review] = await tx.select({ sourceId: facebookCaptureReviews.sourceId, captureVersionId: facebookCaptureReviews.captureVersionId }).from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, id)).limit(1).for("update");
    if (!review) return { status: "not_found" };
    if (!review.captureVersionId) return { status: "not_rerunnable" };
    const [job] = await tx.select({ id: knowledgeIngestionJobs.id, status: knowledgeIngestionJobs.status }).from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, review.captureVersionId)).limit(1);
    if (!job || (job.status !== "failed" && job.status !== "completed")) return { status: "not_rerunnable" };
    const [queued] = await tx.update(knowledgeIngestionJobs).set({ status: "queued", discoveryTerminal: false, candidateCount: 0, completedCandidateCount: 0, needsOperatorCandidateCount: 0, failedCandidateCount: 0, attemptCount: 0, nextRunAt: now, lastErrorCode: null, requeueReasonCode: "operator_rerun", checkpoint: null, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now }).where(and(eq(knowledgeIngestionJobs.id, job.id), sql`${knowledgeIngestionJobs.status} in ('failed', 'completed')`, sql`exists (select 1 from sources join source_capture_versions on source_capture_versions.id = sources.current_capture_version_id where sources.id = ${review.sourceId} and sources.current_capture_version_id = ${review.captureVersionId} and sources.eligibility = 'eligible' and source_capture_versions.payload_deleted_at is null)`)).returning({ id: knowledgeIngestionJobs.id });
    if (!queued) return { status: "stale_review" };
    await clearKnowledgeIngestionCandidatesForRerun(tx, job.id);
    return { status: "updated" };
  });
}

function query() { return getDb().select({ id: facebookCaptureReviews.id, sourceId: facebookCaptureReviews.sourceId, currentCaptureVersionId: sources.currentCaptureVersionId, captureVersionId: facebookCaptureReviews.captureVersionId, updatedAt: facebookCaptureReviews.updatedAt, sourceLabel: sources.label, sourceUrl: sources.url, canonicalUrl: sources.canonicalUrl, captureMethod: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'captureMethod'`, capturedAt: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'capturedAt'`, jobId: knowledgeIngestionJobs.id, status: knowledgeIngestionJobs.status, jobUpdatedAt: knowledgeIngestionJobs.updatedAt, lastErrorCode: knowledgeIngestionJobs.lastErrorCode, candidateCount: knowledgeIngestionJobs.candidateCount, completedCandidateCount: knowledgeIngestionJobs.completedCandidateCount, needsOperatorCandidateCount: knowledgeIngestionJobs.needsOperatorCandidateCount, failedCandidateCount: knowledgeIngestionJobs.failedCandidateCount }).from(facebookCaptureReviews).innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId)).leftJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, facebookCaptureReviews.captureVersionId)).leftJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId)); }
function detailQuery() { return getDb().select({ id: facebookCaptureReviews.id, sourceId: facebookCaptureReviews.sourceId, currentCaptureVersionId: sources.currentCaptureVersionId, captureVersionId: facebookCaptureReviews.captureVersionId, updatedAt: facebookCaptureReviews.updatedAt, sourceLabel: sources.label, sourceUrl: sources.url, canonicalUrl: sources.canonicalUrl, captureId: sourceCaptureVersions.id, rawText: sourceCaptureVersions.rawText, captureCapturedAt: sourceCaptureVersions.capturedAt, captureMethod: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'captureMethod'`, capturedAt: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'capturedAt'`, jobId: knowledgeIngestionJobs.id, status: knowledgeIngestionJobs.status, jobUpdatedAt: knowledgeIngestionJobs.updatedAt, lastErrorCode: knowledgeIngestionJobs.lastErrorCode, candidateCount: knowledgeIngestionJobs.candidateCount, completedCandidateCount: knowledgeIngestionJobs.completedCandidateCount, needsOperatorCandidateCount: knowledgeIngestionJobs.needsOperatorCandidateCount, failedCandidateCount: knowledgeIngestionJobs.failedCandidateCount }).from(facebookCaptureReviews).innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId)).leftJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, sources.currentCaptureVersionId)).leftJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, sources.currentCaptureVersionId)); }
function project(row: Awaited<ReturnType<ReturnType<typeof query>["limit"]>>[number]): AdminFacebookCapture { const job = row.jobId && row.status && row.jobUpdatedAt ? { status: row.status, updatedAt: row.jobUpdatedAt.toISOString(), lastErrorCode: safeCode(row.lastErrorCode), candidateCount: row.candidateCount ?? 0, completedCandidateCount: row.completedCandidateCount ?? 0, needsOperatorCandidateCount: row.needsOperatorCandidateCount ?? 0, failedCandidateCount: row.failedCandidateCount ?? 0 } : null; return { id: row.id, sourceLabel: safeText(row.sourceLabel, 500) ?? "Facebook capture", displayUrl: safeUrl(row.canonicalUrl ?? row.sourceUrl), captureMethod: safeText(row.captureMethod, 80), capturedAt: safeTimestamp(row.capturedAt), updatedAt: row.updatedAt.toISOString(), ingestionJob: job }; }
async function candidateProjection(jobId: string): Promise<AdminFacebookCaptureCandidate[]> { const rows = await getDb().select({ type: knowledgeIngestionCandidates.type, title: knowledgeIngestionCandidates.title, summary: knowledgeIngestionCandidates.summary, processingStatus: knowledgeIngestionCandidates.processingStatus, aiDisposition: knowledgeIngestionCandidates.aiDisposition, outcomeReasonCode: knowledgeIngestionCandidates.outcomeReasonCode, cardId: knowledgeCards.id, lifecycleState: knowledgeCards.lifecycleState, knowledgeState: knowledgeCards.knowledgeState, verificationRequirement: knowledgeCards.verificationRequirement }).from(knowledgeIngestionCandidates).leftJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeIngestionCandidates.knowledgeCardId)).where(eq(knowledgeIngestionCandidates.ingestionJobId, jobId)).orderBy(desc(knowledgeIngestionCandidates.createdAt)).limit(100); return rows.map((row) => ({ type: row.type, title: row.title, summary: row.summary, processingStatus: row.processingStatus, aiDisposition: row.aiDisposition, outcomeReasonCode: row.outcomeReasonCode, card: row.cardId && row.lifecycleState && row.knowledgeState && row.verificationRequirement ? { id: row.cardId, lifecycleState: row.lifecycleState, knowledgeState: row.knowledgeState, verificationRequirement: row.verificationRequirement } : null })); }
function safeText(value: string | null, maximum: number) { const text = value?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim(); return text && text.length <= maximum && !/cookie|token|secret|password|provider|prompt|response/i.test(text) ? text : null; }
function safeCode(value: string | null) { return value && /^[a-z0-9_:-]{1,120}$/.test(value) ? value : null; }
function safeTimestamp(value: string | null) { return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null; }
const safeUrl = safeAdminDisplayUrl;
