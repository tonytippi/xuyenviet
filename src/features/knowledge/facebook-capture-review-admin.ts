import "server-only";

import { count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { facebookCaptureReviews, knowledgeCards, knowledgeCardTypeValues, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, sourceCaptureVersions, sources, type KnowledgeIngestionStage } from "@/db/schema";
import { getExistingCardsForCaptureSource } from "@/features/knowledge/facebook-capture-review";
import { requireAdminSession } from "@/server/auth";

export const facebookCaptureQueueFilters = ["in_progress", "needs_attention", "failed", "published", "suppressed"] as const;
export type FacebookCaptureQueueFilter = (typeof facebookCaptureQueueFilters)[number];
const defaultQueueFilter: FacebookCaptureQueueFilter = "in_progress";
const safeMetadataMaxLength = 500;
const candidateProjectionLimit = 100;
const unsafeMetadataValuePattern = /cookie|token|local\s*storage|localStorage|provider\s*payload|providerPayload|browser\s*profile|playwright\/facebook-profile|<html|<!doctype|hidden\s*data/i;

export function parseFacebookCaptureQueueFilter(value: string | undefined): FacebookCaptureQueueFilter {
  if (facebookCaptureQueueFilters.includes(value as FacebookCaptureQueueFilter)) return value as FacebookCaptureQueueFilter;
  if (value === "attention") return "in_progress";
  if (value === "published" || value === "extracted" || value === "extracted_approved") return "published";
  if (value === "suppressed" || value === "rejected") return "suppressed";
  return defaultQueueFilter;
}

export function getFacebookCaptureQueueFilterForStage(stage: KnowledgeIngestionStage | null): FacebookCaptureQueueFilter {
  if (stage === "published") return "published";
  if (stage === "suppressed") return "suppressed";
  if (stage === "failed") return "failed";
  if (stage === "review_recommended" || stage === "verify_first") return "needs_attention";
  return "in_progress";
}

export async function listAdminFacebookCaptureQueue(input: { filter?: FacebookCaptureQueueFilter; limit?: number; offset?: number } = {}) {
  await requireAdminSession();
  const db = getDb();
  const filter = input.filter ?? defaultQueueFilter;
  const queueCondition = filter === "in_progress"
    ? or(isNull(knowledgeIngestionJobs.id), inArray(knowledgeIngestionJobs.stage, ["queued", "triaging", "extracting", "judging", "relating"]))
    : filter === "needs_attention"
      ? inArray(knowledgeIngestionJobs.stage, ["review_recommended", "verify_first"])
      : eq(knowledgeIngestionJobs.stage, filter);
  const rows = await db
    .select({
      id: facebookCaptureReviews.id,
      sourceId: facebookCaptureReviews.sourceId,
      captureVersionId: facebookCaptureReviews.captureVersionId,
      status: facebookCaptureReviews.status,
      createdAt: facebookCaptureReviews.createdAt,
      updatedAt: facebookCaptureReviews.updatedAt,
      sourceLabel: sources.label,
      sourceUrl: sources.url,
      sourceCanonicalUrl: sources.canonicalUrl,
      sourceType: sources.sourceType,
      verificationStatus: sources.verificationStatus,
      official: sources.official,
      partner: sources.partner,
      captureMethod: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'captureMethod'`,
      capturedAt: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'capturedAt'`,
      finalUrl: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'finalUrl'`,
      authorText: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'authorText'`,
      groupName: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'groupName'`,
      timestampText: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'timestampText'`,
      postCreatedAt: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'postCreatedAt'`,
      hasRawText: sql<boolean>`length(btrim(coalesce(${sourceCaptureVersions.rawText}, ''))) > 0`,
      ingestionJob: {
        id: knowledgeIngestionJobs.id,
        protocolVersion: knowledgeIngestionJobs.protocolVersion,
        stage: knowledgeIngestionJobs.stage,
        attemptCount: knowledgeIngestionJobs.attemptCount,
        maxAttempts: knowledgeIngestionJobs.maxAttempts,
        updatedAt: knowledgeIngestionJobs.updatedAt,
        discoveredCandidateCount: knowledgeIngestionJobs.discoveredCandidateCount,
        terminalCandidateCount: knowledgeIngestionJobs.terminalCandidateCount,
        failedCandidateCount: knowledgeIngestionJobs.failedCandidateCount,
      },
    })
    .from(facebookCaptureReviews)
    .innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId))
    .leftJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, facebookCaptureReviews.captureVersionId))
    .leftJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId))
    .where(queueCondition)
    .orderBy(
      sql`case ${knowledgeIngestionJobs.stage} when 'queued' then 0 when 'triaging' then 1 when 'extracting' then 2 when 'judging' then 3 when 'relating' then 4 when 'review_recommended' then 5 when 'verify_first' then 6 when 'failed' then 7 when 'published' then 8 when 'suppressed' then 9 else 10 end`,
      desc(knowledgeIngestionJobs.updatedAt),
      desc(facebookCaptureReviews.updatedAt),
    )
    .limit(input.limit ?? 25)
    .offset(input.offset ?? 0);

  return Promise.all(
    rows.map(async (row) => ({
      ...sanitizeReviewMetadata(row),
      ingestionJob: row.ingestionJob?.id ? row.ingestionJob : null,
      captureOperation: row.ingestionJob?.id ? null : row.hasRawText ? "awaiting_ingestion_job" as const : "recapture_pending" as const,
      existingCards: await getExistingCardsForCaptureSource(db, row.sourceId),
    })),
  );
}

export async function listAdminFacebookCaptureQueueCounts() {
  await requireAdminSession();
  const db = getDb();
  const rows = await db
    .select({ stage: knowledgeIngestionJobs.stage, count: count() })
    .from(facebookCaptureReviews)
    .leftJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, facebookCaptureReviews.captureVersionId))
    .leftJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId))
    .groupBy(knowledgeIngestionJobs.stage);
  const counts: Record<FacebookCaptureQueueFilter, number> = { in_progress: 0, needs_attention: 0, failed: 0, published: 0, suppressed: 0 };
  for (const row of rows) counts[getFacebookCaptureQueueFilterForStage(row.stage)] += Number(row.count);
  return counts;
}


export async function getAdminFacebookCaptureReviewDetail(reviewId: string) {
  await requireAdminSession();
  const normalizedReviewId = reviewId.trim();

  if (!normalizedReviewId) {
    return null;
  }

  const db = getDb();
  const [review] = await db
    .select({
      id: facebookCaptureReviews.id,
      sourceId: facebookCaptureReviews.sourceId,
      rawSourceMaterialId: facebookCaptureReviews.rawSourceMaterialId,
      captureVersionId: facebookCaptureReviews.captureVersionId,
      status: facebookCaptureReviews.status,
      reviewerUserId: facebookCaptureReviews.reviewerUserId,
      reviewedAt: facebookCaptureReviews.reviewedAt,
      rejectionReason: facebookCaptureReviews.rejectionReason,
      extractionError: facebookCaptureReviews.extractionError,
      createdAt: facebookCaptureReviews.createdAt,
      updatedAt: facebookCaptureReviews.updatedAt,
      sourceLabel: sources.label,
      sourceUrl: sources.url,
      sourceCanonicalUrl: sources.canonicalUrl,
      sourceType: sources.sourceType,
      verificationStatus: sources.verificationStatus,
      official: sources.official,
      partner: sources.partner,
       rawText: sourceCaptureVersions.rawText,
       captureMethod: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'captureMethod'`,
       capturedAt: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'capturedAt'`,
        finalUrl: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'finalUrl'`,
        authorText: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'authorText'`,
        groupName: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'groupName'`,
        timestampText: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'timestampText'`,
        postCreatedAt: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'postCreatedAt'`,
    })
    .from(facebookCaptureReviews)
    .innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId))
      .leftJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, facebookCaptureReviews.captureVersionId))
    .where(eq(facebookCaptureReviews.id, normalizedReviewId))
    .limit(1);

  if (!review) {
    return null;
  }

  return {
    ...sanitizeReviewMetadata(review),
    existingCards: await getExistingCardsForCaptureSource(db, review.sourceId),
    ingestionJob: await getKnowledgeIngestionJobForCaptureVersion(db, review.captureVersionId, review.rawText),
  };
}

async function getKnowledgeIngestionJobForCaptureVersion(db: ReturnType<typeof getDb>, captureVersionId: string | null, rawText: string | null = null) {
  if (!captureVersionId) return null;

  const [job] = await db
    .select({
      id: knowledgeIngestionJobs.id,
      protocolVersion: knowledgeIngestionJobs.protocolVersion,
      stage: knowledgeIngestionJobs.stage,
      attemptCount: knowledgeIngestionJobs.attemptCount,
      maxAttempts: knowledgeIngestionJobs.maxAttempts,
      nextRunAt: knowledgeIngestionJobs.nextRunAt,
      lastErrorCode: knowledgeIngestionJobs.lastErrorCode,
      rawDiscoveryResponse: knowledgeIngestionJobs.rawDiscoveryResponse,
      updatedAt: knowledgeIngestionJobs.updatedAt,
      discoveredCandidateCount: knowledgeIngestionJobs.discoveredCandidateCount,
      terminalCandidateCount: knowledgeIngestionJobs.terminalCandidateCount,
      failedCandidateCount: knowledgeIngestionJobs.failedCandidateCount,
    })
    .from(knowledgeIngestionJobs)
    .where(eq(knowledgeIngestionJobs.captureVersionId, captureVersionId))
    .limit(1);

  if (!job) return null;
  const candidates = job.protocolVersion === 2 ? await db.select({ id: knowledgeIngestionCandidates.id, type: knowledgeIngestionCandidates.type, title: knowledgeIngestionCandidates.title, summary: knowledgeIngestionCandidates.summary, locationName: knowledgeIngestionCandidates.locationName, routeSegment: knowledgeIngestionCandidates.routeSegment, conditions: knowledgeIngestionCandidates.conditions, freshnessSensitive: knowledgeIngestionCandidates.freshnessSensitive, stage: knowledgeIngestionCandidates.stage, outcomeReasonCode: knowledgeIngestionCandidates.outcomeReasonCode, judgmentSummary: knowledgeIngestionCandidates.judgmentSummary, scores: knowledgeIngestionCandidates.scores, knowledgeCardId: knowledgeIngestionCandidates.knowledgeCardId, openRecommendationId: sql<string | null>`(select ${knowledgeRecommendations.id} from ${knowledgeRecommendations} where ${knowledgeIngestionCandidates.stage} in ('review_recommended', 'verify_first') and ${knowledgeRecommendations.knowledgeCardId} = ${knowledgeIngestionCandidates.knowledgeCardId} and ${knowledgeRecommendations.contentVersion} = ${knowledgeCards.contentVersion} and ${knowledgeRecommendations.evidenceSetRevision} = ${knowledgeCards.evidenceSetRevision} and ${knowledgeRecommendations.status} in ('open', 'in_review') order by ${knowledgeRecommendations.priority}, ${knowledgeRecommendations.createdAt} limit 1)`, openRecommendationContentVersion: sql<number | null>`(select ${knowledgeRecommendations.contentVersion} from ${knowledgeRecommendations} where ${knowledgeIngestionCandidates.stage} = 'verify_first' and ${knowledgeRecommendations.reason} = 'verification' and ${knowledgeRecommendations.knowledgeCardId} = ${knowledgeIngestionCandidates.knowledgeCardId} and ${knowledgeRecommendations.contentVersion} = ${knowledgeCards.contentVersion} and ${knowledgeRecommendations.evidenceSetRevision} = ${knowledgeCards.evidenceSetRevision} and ${knowledgeRecommendations.status} in ('open', 'in_review') order by ${knowledgeRecommendations.priority}, ${knowledgeRecommendations.createdAt} limit 1)`, openRecommendationEvidenceSetRevision: sql<number | null>`(select ${knowledgeRecommendations.evidenceSetRevision} from ${knowledgeRecommendations} where ${knowledgeIngestionCandidates.stage} = 'verify_first' and ${knowledgeRecommendations.reason} = 'verification' and ${knowledgeRecommendations.knowledgeCardId} = ${knowledgeIngestionCandidates.knowledgeCardId} and ${knowledgeRecommendations.contentVersion} = ${knowledgeCards.contentVersion} and ${knowledgeRecommendations.evidenceSetRevision} = ${knowledgeCards.evidenceSetRevision} and ${knowledgeRecommendations.status} in ('open', 'in_review') order by ${knowledgeRecommendations.priority}, ${knowledgeRecommendations.createdAt} limit 1)` }).from(knowledgeIngestionCandidates).leftJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeIngestionCandidates.knowledgeCardId)).where(eq(knowledgeIngestionCandidates.ingestionJobId, job.id)).orderBy(knowledgeIngestionCandidates.createdAt).limit(candidateProjectionLimit) : [];
  const [{ count }] = job.protocolVersion === 2 ? await db.select({ count: sql<number>`count(*)::integer` }).from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.ingestionJobId, job.id)) : [{ count: 0 }];
  return { ...job, candidates: hydrateLegacyEvidenceMismatchCandidates(candidates, job.rawDiscoveryResponse, rawText), candidateTotalCount: count, candidateHasMore: count > candidates.length };
}

type CandidateProjection = { id: string; type: (typeof knowledgeCardTypeValues)[number]; title: string; summary: string; locationName: string | null; routeSegment: string | null; conditions: string[]; freshnessSensitive: boolean; stage: string; outcomeReasonCode: string | null; judgmentSummary: string | null; scores: Record<string, number> | null; knowledgeCardId: string | null; openRecommendationId: string | null; openRecommendationContentVersion: number | null; openRecommendationEvidenceSetRevision: number | null };
type RejectedCandidateDiagnostic = Pick<CandidateProjection, "type" | "title" | "summary" | "locationName" | "routeSegment" | "conditions" | "freshnessSensitive"> & { rejectedQuoteText: string };

function hydrateLegacyEvidenceMismatchCandidates(candidates: CandidateProjection[], rawResponse: string | null, rawText: string | null) {
  const diagnostics = parseEvidenceMismatchDiagnostics(rawResponse, rawText);
  let diagnosticIndex = 0;
  return candidates.map((candidate) => {
    if (candidate.outcomeReasonCode !== "candidate_evidence_mismatch" || candidate.title !== "Candidate extraction rejected") return candidate;
    const diagnostic = diagnostics[diagnosticIndex++];
    return diagnostic ? { ...candidate, ...diagnostic } : candidate;
  });
}

function parseEvidenceMismatchDiagnostics(rawResponse: string | null, rawText: string | null): RejectedCandidateDiagnostic[] {
  if (!rawResponse || !rawText) return [];
  try {
    const value: unknown = JSON.parse(rawResponse);
    if (!isRecord(value) || !Array.isArray(value.candidates)) return [];
    return value.candidates.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const type = normalizeCandidateType(entry.type); const title = bounded(entry.title, 160); const summary = bounded(entry.summary, 1200); const locationName = optionalBounded(entry.location_name, 160); const routeSegment = optionalBounded(entry.route_segment, 160); const evidence = isRecord(entry.evidence) ? entry.evidence : null; const rejectedQuoteText = evidence ? bounded(evidence.quote_text, 2000) : null;
      const conditions = Array.isArray(entry.conditions) ? entry.conditions.map((condition) => bounded(condition, 160)).filter((condition): condition is string => Boolean(condition)).slice(0, 12) : [];
      if (!type || !title || !summary || (!locationName && !routeSegment) || typeof entry.freshness_sensitive !== "boolean" || !rejectedQuoteText || rawText.includes(rejectedQuoteText)) return [];
      const values = [title, summary, ...[locationName, routeSegment].filter((item): item is string => item !== null), ...conditions, rejectedQuoteText];
      if (values.some(containsSensitiveText)) return [];
      return [{ type, title, summary, locationName, routeSegment, conditions, freshnessSensitive: entry.freshness_sensitive, rejectedQuoteText }];
    });
  } catch {
    return [];
  }
}

export async function getAdminFacebookCaptureReviewExtractionTarget(reviewId: string) {
  const session = await requireAdminSession();
  const normalizedReviewId = reviewId.trim();

  if (!normalizedReviewId) {
    return null;
  }

  const db = getDb();
  const [review] = await db
    .select({
      id: facebookCaptureReviews.id,
      sourceId: facebookCaptureReviews.sourceId,
      status: facebookCaptureReviews.status,
      sourceKind: sources.kind,
      sourceType: sources.sourceType,
      verificationStatus: sources.verificationStatus,
      official: sources.official,
      partner: sources.partner,
       rawText: sourceCaptureVersions.rawText,
    })
    .from(facebookCaptureReviews)
    .innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId))
     .innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, facebookCaptureReviews.captureVersionId))
    .where(eq(facebookCaptureReviews.id, normalizedReviewId))
    .limit(1);

  if (!review) {
    return null;
  }

  return {
    ...review,
    actor: { userId: session.userId, email: session.email },
    existingCards: await getExistingCardsForCaptureSource(db, review.sourceId),
  };
}

function sanitizeReviewMetadata<T extends { captureMethod: string | null; capturedAt: string | null; finalUrl: string | null; authorText: string | null; groupName: string | null; timestampText: string | null; postCreatedAt: string | null }>(review: T): T {
  return {
    ...review,
    captureMethod: sanitizeMetadataText(review.captureMethod),
    capturedAt: sanitizeMetadataText(review.capturedAt),
    finalUrl: sanitizeMetadataUrl(review.finalUrl),
    authorText: sanitizeMetadataText(review.authorText),
    groupName: sanitizeMetadataText(review.groupName),
    timestampText: sanitizeMetadataText(review.timestampText),
    postCreatedAt: sanitizeMetadataTimestamp(review.postCreatedAt),
  };
}

function sanitizeMetadataTimestamp(value: string | null) {
  const text = sanitizeMetadataText(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeMetadataText(value: string | null) {
  const text = value?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();

  if (!text || unsafeMetadataValuePattern.test(text)) {
    return null;
  }

  return text.slice(0, safeMetadataMaxLength);
}

function sanitizeMetadataUrl(value: string | null) {
  const text = value?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);
    if (unsafeMetadataValuePattern.test(`${url.origin}${url.pathname}${url.hash}`)) {
      return null;
    }

    for (const key of Array.from(url.searchParams.keys())) {
      if (unsafeMetadataValuePattern.test(key) || unsafeMetadataValuePattern.test(url.searchParams.get(key) ?? "")) {
        url.searchParams.delete(key);
      }
    }

    return url.toString().slice(0, safeMetadataMaxLength);
  } catch {
    return null;
  }
}

function normalizeCandidateType(value: unknown): (typeof knowledgeCardTypeValues)[number] | null {
  if (value === "weather") return "warning";
  return knowledgeCardTypeValues.includes(value as (typeof knowledgeCardTypeValues)[number]) ? value as (typeof knowledgeCardTypeValues)[number] : null;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function bounded(value: unknown, max: number) { return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null; }
function optionalBounded(value: unknown, max: number) { return value === null || value === undefined ? null : bounded(value, max); }
function containsSensitiveText(value: string) { return /(?:\+?84|0)(?:[\s.-]?\d){8,10}\b|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(value); }
