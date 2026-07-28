import "server-only";

import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { facebookCaptureReviews, facebookCaptureReviewStatusValues, knowledgeCardTypeValues, knowledgeIngestionCandidates, knowledgeIngestionJobs, sourceCaptureVersions, sources, type FacebookCaptureReviewStatus } from "@/db/schema";
import { countFacebookCaptureReviewsByStatus, getExistingCardsForCaptureSource, listFacebookCaptureReviews } from "@/features/knowledge/facebook-capture-review";
import { requireAdminSession } from "@/server/auth";

const defaultReviewStatus: FacebookCaptureReviewStatus = "needs_review";
const safeMetadataMaxLength = 500;
const candidateProjectionLimit = 100;
const unsafeMetadataValuePattern = /cookie|token|local\s*storage|localStorage|provider\s*payload|providerPayload|browser\s*profile|playwright\/facebook-profile|<html|<!doctype|hidden\s*data/i;

export function parseFacebookCaptureReviewStatus(value: string | undefined): FacebookCaptureReviewStatus {
  if (value && facebookCaptureReviewStatusValues.includes(value as FacebookCaptureReviewStatus)) {
    return value as FacebookCaptureReviewStatus;
  }

  return defaultReviewStatus;
}

export async function listAdminFacebookCaptureReviews(input: { status?: FacebookCaptureReviewStatus; limit?: number; offset?: number } = {}) {
  await requireAdminSession();
  const db = getDb();
  const status = input.status ?? defaultReviewStatus;
  const reviews = await listFacebookCaptureReviews(db, { status, limit: input.limit, offset: input.offset });

  return Promise.all(
    reviews.map(async (review) => ({
      ...sanitizeReviewMetadata(review),
      ingestionJob: await getKnowledgeIngestionJobForCaptureVersion(db, review.captureVersionId),
    })),
  );
}

export async function listAdminFacebookCaptureReviewStatusCounts() {
  await requireAdminSession();
  const db = getDb();
  const counts = await countFacebookCaptureReviewsByStatus(db);

  return Object.fromEntries(facebookCaptureReviewStatusValues.map((status) => [status, counts[status] ?? 0])) as Record<FacebookCaptureReviewStatus, number>;
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
     .innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, facebookCaptureReviews.captureVersionId))
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
  const candidates = job.protocolVersion === 2 ? await db.select({ id: knowledgeIngestionCandidates.id, type: knowledgeIngestionCandidates.type, title: knowledgeIngestionCandidates.title, summary: knowledgeIngestionCandidates.summary, locationName: knowledgeIngestionCandidates.locationName, routeSegment: knowledgeIngestionCandidates.routeSegment, conditions: knowledgeIngestionCandidates.conditions, freshnessSensitive: knowledgeIngestionCandidates.freshnessSensitive, stage: knowledgeIngestionCandidates.stage, outcomeReasonCode: knowledgeIngestionCandidates.outcomeReasonCode, judgmentSummary: knowledgeIngestionCandidates.judgmentSummary, scores: knowledgeIngestionCandidates.scores, knowledgeCardId: knowledgeIngestionCandidates.knowledgeCardId }).from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.ingestionJobId, job.id)).orderBy(knowledgeIngestionCandidates.createdAt).limit(candidateProjectionLimit) : [];
  const [{ count }] = job.protocolVersion === 2 ? await db.select({ count: sql<number>`count(*)::integer` }).from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.ingestionJobId, job.id)) : [{ count: 0 }];
  return { ...job, candidates: hydrateLegacyEvidenceMismatchCandidates(candidates, job.rawDiscoveryResponse, rawText), candidateTotalCount: count, candidateHasMore: count > candidates.length };
}

type CandidateProjection = { id: string; type: (typeof knowledgeCardTypeValues)[number]; title: string; summary: string; locationName: string | null; routeSegment: string | null; conditions: string[]; freshnessSensitive: boolean; stage: string; outcomeReasonCode: string | null; judgmentSummary: string | null; scores: Record<string, number> | null; knowledgeCardId: string | null };
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
