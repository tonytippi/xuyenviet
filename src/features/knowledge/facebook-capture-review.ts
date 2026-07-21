import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { sourceKnowledgeDraftExtractionPromptVersion } from "../ai/prompts";
import { auditEvents, facebookCaptureReviews, knowledgeCards, knowledgeCardSources, rawSourceMaterial, schema, sourceCaptureVersions, sources, type FacebookCaptureReviewStatus } from "../../db/schema";
import { lockFacebookCaptureResources } from "./facebook-capture-locks";

export type FacebookCaptureReviewDb = Pick<PostgresJsDatabase<typeof schema>, "select" | "insert" | "update" | "execute">;
type FacebookCaptureReviewTransitionDb = FacebookCaptureReviewDb & Pick<PostgresJsDatabase<typeof schema>, "transaction">;
type FacebookCaptureReviewLockDb = Pick<PostgresJsDatabase<typeof schema>, "execute">;

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
  return and(isNotNull(sourceCaptureVersions.rawText), sql`length(btrim(${sourceCaptureVersions.rawText})) > 0`);
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
      forceLiveCapture: facebookCaptureReviews.forceLiveCapture,
      createdAt: facebookCaptureReviews.createdAt,
      updatedAt: facebookCaptureReviews.updatedAt,
       rawText: sourceCaptureVersions.rawText,
    })
    .from(facebookCaptureReviews)
      .leftJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, facebookCaptureReviews.captureVersionId))
    .where(eq(facebookCaptureReviews.id, reviewId))
    .limit(1);
  return review ?? null;
}

export async function ensureFacebookCaptureReviewForCapturedSource(
  db: FacebookCaptureReviewDb,
  input: { sourceId: string; rawSourceMaterialId: string; captureVersionId?: string; now?: Date },
) {
  const [existing] = await db.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.sourceId, input.sourceId)).limit(1);

  if (existing) {
    const [review] = await db.update(facebookCaptureReviews).set({ ...(input.captureVersionId ? { captureVersionId: input.captureVersionId } : {}), status: "needs_review", reviewerUserId: null, reviewedAt: null, rejectionReason: null, extractionError: null, updatedAt: input.now }).where(eq(facebookCaptureReviews.id, existing.id)).returning();
    return { status: "exists" as const, review };
  }

  const [reviewable] = await db
    .select({ sourceId: sources.id, rawSourceMaterialId: rawSourceMaterial.id, captureVersionId: sourceCaptureVersions.id })
    .from(sources)
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.sourceId, sources.id))
    .innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, input.captureVersionId ?? sources.currentCaptureVersionId))
    .where(and(eq(sources.id, input.sourceId), eq(sources.kind, "facebook"), eq(rawSourceMaterial.id, input.rawSourceMaterialId), eq(sourceCaptureVersions.sourceId, sources.id), capturedRawTextCondition()))
    .limit(1);

  if (!reviewable) {
    return { status: "not_reviewable" as const };
  }

  const [review] = await db
    .insert(facebookCaptureReviews)
    .values({
      sourceId: reviewable.sourceId,
      rawSourceMaterialId: reviewable.rawSourceMaterialId,
      captureVersionId: reviewable.captureVersionId,
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

export async function listFacebookCaptureReviews(db: FacebookCaptureReviewDb, input: { status?: FacebookCaptureReviewStatus; limit?: number; offset?: number } = {}) {
  const statusCondition = input.status ? eq(facebookCaptureReviews.status, input.status) : undefined;
  const rawTextCondition = input.status === "needs_review" ? capturedRawTextCondition() : undefined;
  const limit = input.limit ?? 25;
  const offset = input.offset ?? 0;
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
    .where(and(statusCondition, rawTextCondition))
    .orderBy(desc(facebookCaptureReviews.updatedAt))
    .limit(limit)
    .offset(offset);

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      existingCards: await getExistingCardsForCaptureSource(db, row.sourceId),
    })),
  );
}

export async function countFacebookCaptureReviewsByStatus(db: FacebookCaptureReviewDb) {
  const rows = await db
    .select({ status: facebookCaptureReviews.status, count: count() })
    .from(facebookCaptureReviews)
    .innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, facebookCaptureReviews.captureVersionId))
    .where(capturedRawTextCondition())
    .groupBy(facebookCaptureReviews.status);

  return Object.fromEntries(rows.map((row) => [row.status, row.count])) as Partial<Record<FacebookCaptureReviewStatus, number>>;
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

  await lockFacebookCaptureSource(db, review.sourceId);
  const lockedReview = await loadReviewById(db, input.reviewId);

  if (!lockedReview) {
    return { status: "not_found" as const };
  }

  const existingCards = await getExistingCardsForCaptureSource(db, lockedReview.sourceId);
  const existingExtractionCards = existingCards.filter((card) => card.aiPromptVersion === sourceKnowledgeDraftExtractionPromptVersion);

  if (input.status === "extracted" && existingExtractionCards.length === 0) {
    return { status: "missing_extracted_cards" as const };
  }

  if (input.status === "extracted_approved" && existingExtractionCards.length === 0) {
    return { status: "missing_extracted_cards" as const };
  }

  if (!allowedTransitionSourceStatuses[input.status].includes(lockedReview.status)) {
    return { status: "invalid_transition" as const, currentStatus: lockedReview.status };
  }

  const rejectionReason = normalizeSafeSummary(input.rejectionReason, "rejectionReason", lockedReview.rawText);
  const extractionError = normalizeSafeSummary(input.extractionError, "extractionError", lockedReview.rawText);

  if (input.status === "rejected" && !rejectionReason) {
    throw new Error("rejectionReason is required when rejecting a capture.");
  }

  if (input.status === "rejected" && !lockedReview.rawText?.trim()) {
    return { status: "missing_raw_text" as const };
  }

  if (input.status === "extraction_failed" && !extractionError) {
    throw new Error("extractionError is required when marking extraction failure.");
  }

  const mutationTimestamp = getMutationTimestamp(input.now);

  const [updated] = await db
    .update(facebookCaptureReviews)
    .set({
      status: input.status,
      reviewerUserId: input.actor.userId,
      reviewedAt: mutationTimestamp,
      rejectionReason: input.status === "rejected" ? rejectionReason : null,
      extractionError: input.status === "extraction_failed" ? extractionError : null,
      updatedAt: mutationTimestamp,
    })
    .where(and(eq(facebookCaptureReviews.id, input.reviewId), eq(facebookCaptureReviews.status, lockedReview.status)))
    .returning();

  if (!updated) {
    return { status: "stale_review" as const };
  }

  await db.insert(auditEvents).values({
    actorUserId: input.actor.userId,
    actorEmail: input.actor.email,
    operation: "update",
    targetType: "facebook_capture_review",
    targetId: lockedReview.id,
    beforeSummary: `Facebook capture review ${lockedReview.id}: status=${lockedReview.status}; sourceId=${lockedReview.sourceId}.`,
    afterSummary: `Facebook capture review ${lockedReview.id}: ${lockedReview.status} -> ${input.status}; sourceId=${lockedReview.sourceId}; reason=${rejectionReason ?? extractionError ?? "none"}.`,
    createdAt: updated.updatedAt,
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

    await lockFacebookCaptureSource(transaction, review.sourceId);
    const lockedReview = await loadReviewById(transaction, input.reviewId);

    if (!lockedReview) {
      return { status: "not_found" as const };
    }

    if (lockedReview.status !== "rejected") {
      return { status: "invalid_transition" as const, currentStatus: lockedReview.status };
    }

    const reopenReason = normalizeSafeSummary(input.reason, "reopenReason", lockedReview.rawText);

    if (!reopenReason) {
      throw new Error("reopenReason is required when reopening a capture for recapture.");
    }

    const mutationTimestamp = getMutationTimestamp(input.now);

    const [updatedReview] = await transaction
      .update(facebookCaptureReviews)
      .set({
        status: "needs_review",
        reviewerUserId: null,
        reviewedAt: null,
        rejectionReason: null,
        extractionError: null,
        captureVersionId: null,
        forceLiveCapture: true,
        forceLiveCaptureGeneration: sql`${facebookCaptureReviews.forceLiveCaptureGeneration} + 1`,
        updatedAt: mutationTimestamp,
      })
      .where(and(eq(facebookCaptureReviews.id, input.reviewId), eq(facebookCaptureReviews.status, "rejected")))
      .returning();

    if (!updatedReview) {
      return { status: "stale_review" as const };
    }

    await transaction.update(sources).set({ currentCaptureVersionId: null }).where(eq(sources.id, lockedReview.sourceId));

    await transaction.insert(auditEvents).values({
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      operation: "update",
      targetType: "facebook_capture_review",
      targetId: lockedReview.id,
      beforeSummary: `Facebook capture review ${lockedReview.id}: status=rejected; sourceId=${lockedReview.sourceId}; rawTextPresent=${Boolean(lockedReview.rawText?.trim())}.`,
      afterSummary: `Facebook capture review ${lockedReview.id}: rejected -> recapture-ready; sourceId=${lockedReview.sourceId}; rawSourceMaterialId=${lockedReview.rawSourceMaterialId}; reason=${reopenReason}.`,
      createdAt: updatedReview.updatedAt,
    });

    return { status: "updated" as const, review: updatedReview };
  });
}

export async function requestFacebookCaptureRecapture(
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

    await lockFacebookCaptureSource(transaction, review.sourceId);
    const lockedReview = await loadReviewById(transaction, input.reviewId);

    if (!lockedReview) {
      return { status: "not_found" as const };
    }

    if (lockedReview.status !== "needs_review" && lockedReview.status !== "extraction_failed" && lockedReview.status !== "rejected") {
      return { status: "invalid_transition" as const, currentStatus: lockedReview.status };
    }

    const existingCards = await getExistingCardsForCaptureSource(transaction, lockedReview.sourceId);
    const existingExtractionCards = existingCards.filter((card) => card.aiPromptVersion === sourceKnowledgeDraftExtractionPromptVersion);

    if (existingExtractionCards.length > 0) {
      return { status: "already_extracted" as const, existingCards: existingExtractionCards.length };
    }

    const recaptureReason = normalizeSafeSummary(input.reason ?? "Recapture requested by operator", "recaptureReason", lockedReview.rawText);

    if (!recaptureReason) {
      throw new Error("recaptureReason must be a short safe summary.");
    }

    const mutationTimestamp = getMutationTimestamp(input.now);

    const [updatedReview] = await transaction
      .update(facebookCaptureReviews)
      .set({
        status: "needs_review",
        reviewerUserId: null,
        reviewedAt: null,
        rejectionReason: null,
        extractionError: null,
        captureVersionId: null,
        forceLiveCapture: true,
        forceLiveCaptureGeneration: sql`${facebookCaptureReviews.forceLiveCaptureGeneration} + 1`,
        updatedAt: mutationTimestamp,
      })
      .where(and(eq(facebookCaptureReviews.id, input.reviewId), eq(facebookCaptureReviews.status, lockedReview.status)))
      .returning();

    if (!updatedReview) {
      return { status: "stale_review" as const };
    }

    await transaction.update(sources).set({ currentCaptureVersionId: null }).where(eq(sources.id, lockedReview.sourceId));

    await transaction.insert(auditEvents).values({
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      operation: "update",
      targetType: "facebook_capture_review",
      targetId: lockedReview.id,
      beforeSummary: `Facebook capture review ${lockedReview.id}: status=${lockedReview.status}; sourceId=${lockedReview.sourceId}; rawTextPresent=${Boolean(lockedReview.rawText?.trim())}.`,
      afterSummary: `Facebook capture review ${lockedReview.id}: ${lockedReview.status} -> recapture-ready; sourceId=${lockedReview.sourceId}; rawSourceMaterialId=${lockedReview.rawSourceMaterialId}; reason=${recaptureReason}.`,
      createdAt: updatedReview.updatedAt,
    });

    return { status: "updated" as const, review: updatedReview };
  });
}

async function lockFacebookCaptureSource(db: FacebookCaptureReviewLockDb, sourceId: string) {
  await lockFacebookCaptureResources(db, { sourceId });
}

function getMutationTimestamp(requested: Date | undefined) {
  // Let Postgres retain created_at microseconds instead of round-tripping it through JS Date.
  return requested
    ? sql<Date>`greatest(${requested.toISOString()}::timestamp, ${facebookCaptureReviews.createdAt})`
    : sql<Date>`greatest(now(), ${facebookCaptureReviews.createdAt})`;
}
