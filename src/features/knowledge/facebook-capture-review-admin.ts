import "server-only";

import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { facebookCaptureReviews, facebookCaptureReviewStatusValues, rawSourceMaterial, sources, type FacebookCaptureReviewStatus } from "@/db/schema";
import { getExistingCardsForCaptureSource, listFacebookCaptureReviews } from "@/features/knowledge/facebook-capture-review";
import { requireAdminSession } from "@/server/auth";

const defaultReviewStatus: FacebookCaptureReviewStatus = "needs_review";

export function parseFacebookCaptureReviewStatus(value: string | undefined): FacebookCaptureReviewStatus {
  if (value && facebookCaptureReviewStatusValues.includes(value as FacebookCaptureReviewStatus)) {
    return value as FacebookCaptureReviewStatus;
  }

  return defaultReviewStatus;
}

export async function listAdminFacebookCaptureReviews(input: { status?: FacebookCaptureReviewStatus } = {}) {
  await requireAdminSession();
  const db = getDb();
  const status = input.status ?? defaultReviewStatus;
  const reviews = await listFacebookCaptureReviews(db, { status });

  return reviews;
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
    ...review,
    existingCards: await getExistingCardsForCaptureSource(db, review.sourceId),
  };
}
