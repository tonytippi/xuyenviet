import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { auditEvents, facebookCaptureReviews, knowledgeCards, knowledgeCardSources, rawSourceMaterial, schema, sources, type FacebookCaptureReviewStatus } from "../../db/schema";

export type FacebookCaptureReviewDb = Pick<PostgresJsDatabase<typeof schema>, "select" | "insert" | "update">;
type FacebookCaptureReviewTransitionDb = FacebookCaptureReviewDb & Pick<PostgresJsDatabase<typeof schema>, "transaction">;

export type FacebookCaptureReviewActor = {
  userId: string;
  email: string;
};

const maxSafeReasonLength = 500;
const unsafeSummaryPattern = /provider[_-]?payload|raw[_-]?text|cookie|token|password|localstorage|local_storage|<html|secret/i;

function capturedRawTextCondition() {
  return and(isNotNull(rawSourceMaterial.rawText), sql`length(btrim(${rawSourceMaterial.rawText})) > 0`);
}

function normalizeSafeSummary(value: string | undefined, fieldName: string) {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maxSafeReasonLength || normalized.includes("\n") || normalized.includes("\r") || unsafeSummaryPattern.test(normalized)) {
    throw new Error(`${fieldName} must be a short safe summary.`);
  }

  return normalized;
}

async function loadReviewById(db: FacebookCaptureReviewDb, reviewId: string) {
  const [review] = await db.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, reviewId)).limit(1);
  return review ?? null;
}

export async function ensureFacebookCaptureReviewForCapturedSource(
  db: FacebookCaptureReviewDb,
  input: { sourceId: string; rawSourceMaterialId: string; now?: Date },
) {
  const [existing] = await db.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.sourceId, input.sourceId)).limit(1);

  if (existing) {
    return { status: "exists" as const, review: existing };
  }

  const [reviewable] = await db
    .select({ sourceId: sources.id, rawSourceMaterialId: rawSourceMaterial.id })
    .from(sources)
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.sourceId, sources.id))
    .where(and(eq(sources.id, input.sourceId), eq(sources.kind, "facebook"), eq(rawSourceMaterial.id, input.rawSourceMaterialId), capturedRawTextCondition()))
    .limit(1);

  if (!reviewable) {
    return { status: "not_reviewable" as const };
  }

  const [review] = await db
    .insert(facebookCaptureReviews)
    .values({
      sourceId: reviewable.sourceId,
      rawSourceMaterialId: reviewable.rawSourceMaterialId,
      status: "needs_review",
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();

  return { status: "created" as const, review };
}

export async function listFacebookCaptureReviews(db: FacebookCaptureReviewDb, input: { status?: FacebookCaptureReviewStatus } = {}) {
  const rows = await db
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
    })
    .from(facebookCaptureReviews)
    .innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId))
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.id, facebookCaptureReviews.rawSourceMaterialId))
    .where(input.status ? eq(facebookCaptureReviews.status, input.status) : undefined)
    .orderBy(desc(facebookCaptureReviews.updatedAt));

  return rows;
}

export async function getExistingCardsForCaptureSource(db: FacebookCaptureReviewDb, sourceId: string) {
  return db
    .select({
      id: knowledgeCards.id,
      status: knowledgeCards.status,
      title: knowledgeCards.title,
      type: knowledgeCards.type,
      updatedAt: knowledgeCards.updatedAt,
    })
    .from(knowledgeCardSources)
    .innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSources.knowledgeCardId))
    .where(eq(knowledgeCardSources.sourceId, sourceId))
    .orderBy(desc(knowledgeCards.updatedAt));
}

export async function markFacebookCaptureReviewStatus(
  db: FacebookCaptureReviewTransitionDb,
  input: {
    reviewId: string;
    status: Exclude<FacebookCaptureReviewStatus, "needs_review">;
    actor: FacebookCaptureReviewActor;
    rejectionReason?: string;
    extractionError?: string;
    now?: Date;
  },
) {
  return db.transaction(async (transaction) => {
    const review = await loadReviewById(transaction, input.reviewId);

    if (!review) {
      return { status: "not_found" as const };
    }

    const existingCards = await getExistingCardsForCaptureSource(transaction, review.sourceId);

    if ((input.status === "extracted" || input.status === "extracted_approved") && existingCards.length > 0) {
      return { status: "blocked_existing_cards" as const, existingCards };
    }

    const rejectionReason = normalizeSafeSummary(input.rejectionReason, "rejectionReason");
    const extractionError = normalizeSafeSummary(input.extractionError, "extractionError");

    if (input.status === "rejected" && !rejectionReason) {
      throw new Error("rejectionReason is required when rejecting a capture.");
    }

    if (input.status === "extraction_failed" && !extractionError) {
      throw new Error("extractionError is required when marking extraction failure.");
    }

    const now = input.now ?? new Date();

    const [updated] = await transaction
      .update(facebookCaptureReviews)
      .set({
        status: input.status,
        reviewerUserId: input.actor.userId,
        reviewedAt: now,
        rejectionReason: input.status === "rejected" ? rejectionReason : null,
        extractionError: input.status === "extraction_failed" ? extractionError : null,
        updatedAt: now,
      })
      .where(eq(facebookCaptureReviews.id, input.reviewId))
      .returning();

    await transaction.insert(auditEvents).values({
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      operation: "update",
      targetType: "facebook_capture_review",
      targetId: review.id,
      beforeSummary: `Facebook capture review ${review.id}: status=${review.status}; sourceId=${review.sourceId}.`,
      afterSummary: `Facebook capture review ${review.id}: ${review.status} -> ${input.status}; sourceId=${review.sourceId}; reason=${rejectionReason ?? extractionError ?? "none"}.`,
      createdAt: now,
    });

    return { status: "updated" as const, review: updated };
  });
}
