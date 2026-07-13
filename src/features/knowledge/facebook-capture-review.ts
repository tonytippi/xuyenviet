import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { sourceKnowledgeDraftExtractionPromptVersion } from "../ai/prompts";
import { auditEvents, facebookCaptureReviews, knowledgeCards, knowledgeCardSources, rawSourceMaterial, schema, sources, type FacebookCaptureReviewStatus } from "../../db/schema";

export type FacebookCaptureReviewDb = Pick<PostgresJsDatabase<typeof schema>, "select" | "insert" | "update">;
type FacebookCaptureReviewTransitionDb = FacebookCaptureReviewDb & Pick<PostgresJsDatabase<typeof schema>, "transaction">;

export type FacebookCaptureReviewActor = {
  userId: string;
  email: string;
};

const maxSafeReasonLength = 500;
const unsafeSummaryPattern = /provider[_-]?payload|raw[_-]?text|cookie|token|password|localstorage|local_storage|<html|secret/i;
const allowedTransitionSourceStatuses: Record<Exclude<FacebookCaptureReviewStatus, "needs_review">, FacebookCaptureReviewStatus[]> = {
  rejected: ["needs_review", "extraction_failed"],
  extracted: ["needs_review", "extraction_failed"],
  extracted_approved: ["extracted"],
  extraction_failed: ["needs_review"],
};

function capturedRawTextCondition() {
  return and(isNotNull(rawSourceMaterial.rawText), sql`length(btrim(${rawSourceMaterial.rawText})) > 0`);
}

function normalizeForOverlap(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsRawTextOverlap(value: string, rawText: string | null) {
  if (!rawText) {
    return false;
  }

  const normalizedValue = normalizeForOverlap(value);
  const normalizedRawText = normalizeForOverlap(rawText);
  return normalizedValue.length >= 24 && normalizedRawText.includes(normalizedValue);
}

function normalizeSafeSummary(value: string | undefined, fieldName: string, rawText: string | null) {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maxSafeReasonLength || normalized.includes("\n") || normalized.includes("\r") || unsafeSummaryPattern.test(normalized) || containsRawTextOverlap(normalized, rawText)) {
    throw new Error(`${fieldName} must be a short safe summary.`);
  }

  return normalized;
}

async function loadReviewById(db: FacebookCaptureReviewDb, reviewId: string) {
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
      rawText: rawSourceMaterial.rawText,
    })
    .from(facebookCaptureReviews)
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.id, facebookCaptureReviews.rawSourceMaterialId))
    .where(eq(facebookCaptureReviews.id, reviewId))
    .limit(1);
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
    .onConflictDoNothing({ target: facebookCaptureReviews.sourceId })
    .returning();

  if (!review) {
    const [concurrentReview] = await db.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.sourceId, input.sourceId)).limit(1);
    if (concurrentReview) {
      return { status: "exists" as const, review: concurrentReview };
    }
    throw new Error("Facebook capture review could not be created.");
  }

  return { status: "created" as const, review };
}

export async function listFacebookCaptureReviews(db: FacebookCaptureReviewDb, input: { status?: FacebookCaptureReviewStatus } = {}) {
  const statusCondition = input.status ? eq(facebookCaptureReviews.status, input.status) : undefined;
  const rawTextCondition = input.status === "needs_review" ? capturedRawTextCondition() : undefined;
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
      captureMethod: sql<string | null>`${rawSourceMaterial.rawMetadata}->>'captureMethod'`,
      capturedAt: sql<string | null>`${rawSourceMaterial.rawMetadata}->>'capturedAt'`,
      finalUrl: sql<string | null>`${rawSourceMaterial.rawMetadata}->>'finalUrl'`,
      authorText: sql<string | null>`${rawSourceMaterial.rawMetadata}->>'authorText'`,
      timestampText: sql<string | null>`${rawSourceMaterial.rawMetadata}->>'timestampText'`,
    })
    .from(facebookCaptureReviews)
    .innerJoin(sources, eq(sources.id, facebookCaptureReviews.sourceId))
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.id, facebookCaptureReviews.rawSourceMaterialId))
    .where(and(statusCondition, rawTextCondition))
    .orderBy(desc(facebookCaptureReviews.updatedAt));

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      existingCards: await getExistingCardsForCaptureSource(db, row.sourceId),
    })),
  );
}

export async function getExistingCardsForCaptureSource(db: FacebookCaptureReviewDb, sourceId: string) {
  return db
    .select({
      id: knowledgeCards.id,
      status: knowledgeCards.status,
      title: knowledgeCards.title,
      type: knowledgeCards.type,
      aiPromptVersion: knowledgeCards.aiPromptVersion,
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
    return markFacebookCaptureReviewStatusInTransaction(transaction, input);
  });
}

export async function markFacebookCaptureReviewStatusInTransaction(
  db: FacebookCaptureReviewDb,
  input: {
    reviewId: string;
    status: Exclude<FacebookCaptureReviewStatus, "needs_review">;
    actor: FacebookCaptureReviewActor;
    rejectionReason?: string;
    extractionError?: string;
    now?: Date;
  },
) {
    if (!Object.hasOwn(allowedTransitionSourceStatuses, input.status)) {
      throw new Error("Unsupported Facebook capture review transition status.");
    }

    const review = await loadReviewById(db, input.reviewId);

    if (!review) {
      return { status: "not_found" as const };
    }

    const existingCards = await getExistingCardsForCaptureSource(db, review.sourceId);
    const existingExtractionCards = existingCards.filter((card) => card.aiPromptVersion === sourceKnowledgeDraftExtractionPromptVersion);

    if (input.status === "extracted" && existingExtractionCards.length === 0) {
      return { status: "missing_extracted_cards" as const };
    }

    if (input.status === "extracted_approved" && existingExtractionCards.length === 0) {
      return { status: "missing_extracted_cards" as const };
    }

    if (!allowedTransitionSourceStatuses[input.status].includes(review.status)) {
      return { status: "invalid_transition" as const, currentStatus: review.status };
    }

    const rejectionReason = normalizeSafeSummary(input.rejectionReason, "rejectionReason", review.rawText);
    const extractionError = normalizeSafeSummary(input.extractionError, "extractionError", review.rawText);

    if (input.status === "rejected" && !rejectionReason) {
      throw new Error("rejectionReason is required when rejecting a capture.");
    }

    if (input.status === "rejected" && !review.rawText?.trim()) {
      return { status: "missing_raw_text" as const };
    }

    if (input.status === "extraction_failed" && !extractionError) {
      throw new Error("extractionError is required when marking extraction failure.");
    }

    const now = input.now ?? new Date();

    const [updated] = await db
      .update(facebookCaptureReviews)
      .set({
        status: input.status,
        reviewerUserId: input.actor.userId,
        reviewedAt: now,
        rejectionReason: input.status === "rejected" ? rejectionReason : null,
        extractionError: input.status === "extraction_failed" ? extractionError : null,
        updatedAt: now,
      })
      .where(and(eq(facebookCaptureReviews.id, input.reviewId), eq(facebookCaptureReviews.status, review.status)))
      .returning();

    if (!updated) {
      return { status: "stale_review" as const };
    }

    await db.insert(auditEvents).values({
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
}

export async function reopenFacebookCaptureForRecapture(
  db: FacebookCaptureReviewTransitionDb,
  input: {
    reviewId: string;
    actor: FacebookCaptureReviewActor;
    reason?: string;
    now?: Date;
  },
) {
  return db.transaction(async (transaction) => {
    const review = await loadReviewById(transaction, input.reviewId);

    if (!review) {
      return { status: "not_found" as const };
    }

    if (review.status !== "rejected") {
      return { status: "invalid_transition" as const, currentStatus: review.status };
    }

    const reopenReason = normalizeSafeSummary(input.reason, "reopenReason", review.rawText);

    if (!reopenReason) {
      throw new Error("reopenReason is required when reopening a capture for recapture.");
    }

    const now = input.now ?? new Date();

    const [updatedReview] = await transaction
      .update(facebookCaptureReviews)
      .set({
        status: "needs_review",
        reviewerUserId: null,
        reviewedAt: null,
        rejectionReason: null,
        extractionError: null,
        updatedAt: now,
      })
      .where(and(eq(facebookCaptureReviews.id, input.reviewId), eq(facebookCaptureReviews.status, "rejected")))
      .returning();

    if (!updatedReview) {
      return { status: "stale_review" as const };
    }

    await transaction.update(rawSourceMaterial).set({ rawText: null, rawMetadata: null }).where(eq(rawSourceMaterial.id, review.rawSourceMaterialId));

    await transaction.insert(auditEvents).values({
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      operation: "update",
      targetType: "facebook_capture_review",
      targetId: review.id,
      beforeSummary: `Facebook capture review ${review.id}: status=rejected; sourceId=${review.sourceId}; rawTextPresent=${Boolean(review.rawText?.trim())}.`,
      afterSummary: `Facebook capture review ${review.id}: rejected -> recapture-ready; sourceId=${review.sourceId}; rawSourceMaterialId=${review.rawSourceMaterialId}; reason=${reopenReason}.`,
      createdAt: now,
    });

    return { status: "updated" as const, review: updatedReview };
  });
}
