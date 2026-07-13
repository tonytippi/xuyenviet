import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { auditEvents, rawSourceMaterial, schema, sources } from "../../db/schema";
import { ensureFacebookCaptureReviewForCapturedSource } from "./facebook-capture-review";

export type FacebookCaptureDb = PostgresJsDatabase<typeof schema>;

export type QueuedFacebookSource = {
  sourceId: string;
  url: string | null;
  canonicalUrl: string | null;
  label: string;
  rawMaterialId: string;
  rawMetadata: Record<string, unknown> | null;
};

export type SafeFacebookCaptureMetadata = {
  captureMethod: "playwright_operator_browser";
  capturedAt: string;
  sourceUrl: string;
  finalUrl: string;
  authorText?: string;
  timestampText?: string;
  diagnostics?: Record<string, string | number | boolean | null>;
};

export type FacebookCaptureActor = {
  userId: string;
  email: string;
};

const DEFAULT_QUEUE_LIMIT = 5;
const MAX_RAW_TEXT_LENGTH = 20_000;
const MAX_METADATA_STRING_LENGTH = 500;
const unsafeMetadataKeyPattern = /cookie|token|password|localstorage|local_storage|html|profile|storage|secret/i;
const safeMetadataKeys = new Set<keyof SafeFacebookCaptureMetadata>([
  "captureMethod",
  "capturedAt",
  "sourceUrl",
  "finalUrl",
  "authorText",
  "timestampText",
  "diagnostics",
]);

function queuedRawTextCondition() {
  return or(isNull(rawSourceMaterial.rawText), sql`length(btrim(${rawSourceMaterial.rawText})) = 0`);
}

function normalizeLimit(limit?: number) {
  if (!Number.isFinite(limit) || !limit) {
    return DEFAULT_QUEUE_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 25);
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.slice(0, MAX_METADATA_STRING_LENGTH);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeMetadataValue).filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const sanitized: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (unsafeMetadataKeyPattern.test(key)) {
        continue;
      }

      const sanitizedValue = sanitizeMetadataValue(nestedValue);

      if (sanitizedValue !== undefined) {
        sanitized[key] = sanitizedValue;
      }
    }

    return sanitized;
  }

  return undefined;
}

function sanitizeExistingRawMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) {
    return {};
  }

  const sanitized = sanitizeMetadataValue(metadata);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? (sanitized as Record<string, unknown>) : {};
}

function sanitizeCaptureMetadata(metadata: SafeFacebookCaptureMetadata & Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (safeMetadataKeys.has(key as keyof SafeFacebookCaptureMetadata) && value !== undefined && !unsafeMetadataKeyPattern.test(key)) {
      const sanitizedValue = sanitizeMetadataValue(value);

      if (sanitizedValue !== undefined) {
        sanitized[key] = sanitizedValue;
      }
    }
  }

  return sanitized as SafeFacebookCaptureMetadata;
}

function normalizeRawText(rawText: string) {
  const text = rawText.trim();

  if (!text) {
    throw new Error("Captured Facebook text is empty.");
  }

  if (text.length > MAX_RAW_TEXT_LENGTH) {
    return text.slice(0, MAX_RAW_TEXT_LENGTH).trimEnd();
  }

  return text;
}

export async function listQueuedFacebookSources(db: FacebookCaptureDb, input: { sourceId?: string; limit?: number } = {}): Promise<QueuedFacebookSource[]> {
  const rows = await db
    .select({
      sourceId: sources.id,
      url: sources.url,
      canonicalUrl: sources.canonicalUrl,
      label: sources.label,
      rawMaterialId: rawSourceMaterial.id,
      rawMetadata: rawSourceMaterial.rawMetadata,
    })
    .from(sources)
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.sourceId, sources.id))
    .where(and(eq(sources.kind, "facebook"), queuedRawTextCondition(), input.sourceId ? eq(sources.id, input.sourceId) : undefined))
    .orderBy(asc(sources.createdAt))
    .limit(input.sourceId ? 1 : normalizeLimit(input.limit));

  return rows;
}

export async function updateQueuedFacebookSourceRawText(
  db: FacebookCaptureDb,
  input: {
    sourceId: string;
    rawText: string;
    captureMetadata: SafeFacebookCaptureMetadata & Record<string, unknown>;
    actor?: FacebookCaptureActor;
    now?: Date;
  },
) {
  const rawText = normalizeRawText(input.rawText);

  return db.transaction(async (transaction) => {
    const [queued] = await transaction
      .select({
        sourceId: sources.id,
        rawMaterialId: rawSourceMaterial.id,
        rawMetadata: rawSourceMaterial.rawMetadata,
      })
      .from(sources)
      .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.sourceId, sources.id))
      .where(and(eq(sources.kind, "facebook"), queuedRawTextCondition(), eq(sources.id, input.sourceId)))
      .limit(1)
      .for("update");

    if (!queued) {
      return { status: "not_queued" as const };
    }

    const rawMetadata = {
      ...sanitizeExistingRawMetadata(queued.rawMetadata),
      ...sanitizeCaptureMetadata(input.captureMetadata),
    };

    const updated = await transaction
      .update(rawSourceMaterial)
      .set({ rawText, rawMetadata })
      .where(and(eq(rawSourceMaterial.id, queued.rawMaterialId), queuedRawTextCondition()))
      .returning({ id: rawSourceMaterial.id });

    if (updated.length === 0) {
      return { status: "no_longer_queued" as const };
    }

    const review = await ensureFacebookCaptureReviewForCapturedSource(transaction, {
      sourceId: queued.sourceId,
      rawSourceMaterialId: queued.rawMaterialId,
      now: input.now,
    });

    if (review.status === "not_reviewable") {
      throw new Error("Captured Facebook source could not enter review state.");
    }

    if (input.actor) {
      await transaction.insert(auditEvents).values({
        actorUserId: input.actor.userId,
        actorEmail: input.actor.email,
        operation: "update",
        targetType: "raw_source_material",
        targetId: queued.rawMaterialId,
        beforeSummary: `Facebook capture raw text present: false; method: ${rawMetadata.captureMethod}`,
        afterSummary: `Facebook capture raw text present: true; method: ${rawMetadata.captureMethod}; capturedAt: ${rawMetadata.capturedAt}`,
        createdAt: input.now,
      });
    }

    return { status: "updated" as const, rawMaterialId: updated[0].id, reviewId: review.review.id };
  });
}

export function recordFacebookCaptureFailure(sourceId: string, reason: string) {
  return { sourceId, status: "failed" as const, reason };
}
