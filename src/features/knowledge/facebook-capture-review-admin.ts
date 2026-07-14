import "server-only";

import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { facebookCaptureReviews, facebookCaptureReviewStatusValues, rawSourceMaterial, sources, type FacebookCaptureReviewStatus } from "@/db/schema";
import { countFacebookCaptureReviewsByStatus, getExistingCardsForCaptureSource, listFacebookCaptureReviews } from "@/features/knowledge/facebook-capture-review";
import { getActiveKnowledgeExtractionJobForSource } from "@/features/knowledge/extraction-jobs";
import { requireAdminSession } from "@/server/auth";

const defaultReviewStatus: FacebookCaptureReviewStatus = "needs_review";
const safeMetadataMaxLength = 500;
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

  return reviews.map(sanitizeReviewMetadata);
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
      rawText: rawSourceMaterial.rawText,
      captureMethod: sql<string | null>`${rawSourceMaterial.rawMetadata}->>'captureMethod'`,
      capturedAt: sql<string | null>`${rawSourceMaterial.rawMetadata}->>'capturedAt'`,
      finalUrl: sql<string | null>`${rawSourceMaterial.rawMetadata}->>'finalUrl'`,
      authorText: sql<string | null>`${rawSourceMaterial.rawMetadata}->>'authorText'`,
      timestampText: sql<string | null>`${rawSourceMaterial.rawMetadata}->>'timestampText'`,
    })
    .from(facebookCaptureReviews)
    .innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId))
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.id, facebookCaptureReviews.rawSourceMaterialId))
    .where(eq(facebookCaptureReviews.id, normalizedReviewId))
    .limit(1);

  if (!review) {
    return null;
  }

  return {
    ...sanitizeReviewMetadata(review),
    existingCards: await getExistingCardsForCaptureSource(db, review.sourceId),
    activeExtractionJob: await getActiveKnowledgeExtractionJobForSource(db, review.sourceId),
  };
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
      rawText: rawSourceMaterial.rawText,
    })
    .from(facebookCaptureReviews)
    .innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId))
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.id, facebookCaptureReviews.rawSourceMaterialId))
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

function sanitizeReviewMetadata<T extends { captureMethod: string | null; capturedAt: string | null; finalUrl: string | null; authorText: string | null; timestampText: string | null }>(review: T): T {
  return {
    ...review,
    captureMethod: sanitizeMetadataText(review.captureMethod),
    capturedAt: sanitizeMetadataText(review.capturedAt),
    finalUrl: sanitizeMetadataUrl(review.finalUrl),
    authorText: sanitizeMetadataText(review.authorText),
    timestampText: sanitizeMetadataText(review.timestampText),
  };
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
