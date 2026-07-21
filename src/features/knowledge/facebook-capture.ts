import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { auditEvents, facebookCaptureReviews, rawSourceMaterial, schema, sourceCaptureVersions, sources } from "../../db/schema";
import { canonicalizeFacebookUrl } from "./capture-identity";
import { lockFacebookCaptureResources } from "./facebook-capture-locks";
import { ensureFacebookCaptureReviewForCapturedSource } from "./facebook-capture-review";
import { appendSourceCaptureVersion, type FacebookCaptureMetadata } from "./source-captures";

export type FacebookCaptureDb = PostgresJsDatabase<typeof schema>;

export type QueuedFacebookSource = {
  sourceId: string;
  url: string | null;
  canonicalUrl: string | null;
  label: string;
  rawMaterialId: string;
  rawMetadata: Record<string, unknown> | null;
  forceLiveCapture: boolean;
  forceLiveCaptureGeneration: number;
};

export type SafeFacebookCaptureMetadata = {
  captureMethod: "playwright_operator_browser";
  capturedAt: string;
  sourceUrl: string;
  finalUrl: string;
  authorText?: string;
  groupName?: string;
  timestampText?: string;
  postCreatedAt?: string;
  diagnostics?: Record<string, string | number | boolean | null>;
  captureOrigin?: "live" | "cache";
  captureArtifactId?: string;
  importedAt?: string;
  importCorrelationToken?: string;
  captureMethodVersion?: string;
  payloadSchemaVersion?: string;
  captureActorId?: string;
  importActorId?: string;
};

export type FacebookCaptureActor = {
  userId: string;
  email: string;
};

export type DiscoveredFacebookPost = {
  url: string;
  canonicalUrl: string;
};

const DEFAULT_QUEUE_LIMIT = 5;
const MAX_METADATA_STRING_LENGTH = 500;
const MAX_DISCOVERED_POSTS_PER_CAPTURE = 20;
const unsafeMetadataKeyPattern = /cookie|token|password|localstorage|local_storage|html|profile|storage|secret/i;
const safeMetadataKeys = new Set<keyof SafeFacebookCaptureMetadata>([
  "captureMethod",
  "capturedAt",
  "sourceUrl",
  "finalUrl",
  "authorText",
  "groupName",
  "timestampText",
  "postCreatedAt",
  "captureOrigin", "captureArtifactId", "importCorrelationToken", "captureMethodVersion", "payloadSchemaVersion", "captureActorId", "importActorId",
]);

function queuedRawTextCondition() {
  return and(
    isNull(sources.currentCaptureVersionId),
    sql`${rawSourceMaterial.rawMetadata}->>'duplicateSourceId' is null`,
  );
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

export async function listQueuedFacebookSources(db: FacebookCaptureDb, input: { sourceId?: string; limit?: number } = {}): Promise<QueuedFacebookSource[]> {
  const queuedSourceRows = await db
    .select({ sourceId: sources.id, rawMaterialId: rawSourceMaterial.id })
    .from(sources)
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.sourceId, sources.id))
    .where(and(eq(sources.kind, "facebook"), queuedRawTextCondition(), input.sourceId ? eq(sources.id, input.sourceId) : undefined))
    .orderBy(asc(sources.createdAt))
    .limit(input.sourceId ? 1 : normalizeLimit(input.limit));

  // A review row carries the capture generation token, including for normal cache-first work.
  if (queuedSourceRows.length > 0) {
    await db
      .insert(facebookCaptureReviews)
      .values(queuedSourceRows.map((source) => ({ sourceId: source.sourceId, rawSourceMaterialId: source.rawMaterialId })))
      .onConflictDoNothing({ target: facebookCaptureReviews.sourceId });
  }

  const rows = await db
    .select({
      sourceId: sources.id,
      url: sources.url,
      canonicalUrl: sources.canonicalUrl,
      label: sources.label,
      rawMaterialId: rawSourceMaterial.id,
      rawMetadata: rawSourceMaterial.rawMetadata,
      forceLiveCapture: sql<boolean>`coalesce(${facebookCaptureReviews.forceLiveCapture}, false)`,
      forceLiveCaptureGeneration: sql<number>`coalesce(${facebookCaptureReviews.forceLiveCaptureGeneration}, 0)`,
    })
    .from(sources)
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.sourceId, sources.id))
    .leftJoin(facebookCaptureReviews, eq(facebookCaptureReviews.sourceId, sources.id))
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
    discoveredUrls?: string[];
    sourceUrl?: string;
    expectedForceLiveCapture?: boolean;
    expectedForceLiveCaptureGeneration?: number;
  },
) {
  const canonicalFinalUrl = canonicalizeFacebookUrl(input.captureMetadata.finalUrl);
  const discoveredPosts = input.actor && input.sourceUrl
    ? normalizeDiscoveredFacebookPosts(input.discoveredUrls ?? [], input.sourceUrl)
    : [];

  return db.transaction(async (transaction) => {
    // Acquire every identity this completion can mutate in a global order before row writes.
    await lockFacebookCaptureResources(transaction, {
      sourceId: input.sourceId,
      canonicalUrls: [canonicalFinalUrl, ...discoveredPosts.map((post) => post.canonicalUrl)],
    });

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
    if (input.expectedForceLiveCapture !== undefined && input.expectedForceLiveCaptureGeneration !== undefined) {
      const [review] = await transaction
        .select({ forceLiveCapture: facebookCaptureReviews.forceLiveCapture, forceLiveCaptureGeneration: facebookCaptureReviews.forceLiveCaptureGeneration })
        .from(facebookCaptureReviews)
        .where(eq(facebookCaptureReviews.sourceId, queued.sourceId))
        .limit(1)
        .for("update");
      if (
        !review
        || review.forceLiveCapture !== input.expectedForceLiveCapture
        || review.forceLiveCaptureGeneration !== input.expectedForceLiveCaptureGeneration
      ) {
        return { status: "no_longer_queued" as const };
      }
    }

    if (canonicalFinalUrl) {
      const existingFacebookSources = await transaction
        .select({ id: sources.id, canonicalUrl: sources.canonicalUrl })
        .from(sources)
        .where(eq(sources.kind, "facebook"));
      const duplicate = existingFacebookSources.find((source) => source.id !== queued.sourceId && canonicalizeFacebookUrl(source.canonicalUrl ?? "") === canonicalFinalUrl);

      if (duplicate) {
        await transaction
          .update(sources)
          .set({ label: `Duplicate source ${duplicate.id}` })
          .where(eq(sources.id, queued.sourceId));
        await transaction
          .update(rawSourceMaterial)
          .set({
            rawMetadata: {
              ...sanitizeExistingRawMetadata(queued.rawMetadata),
              duplicateSourceId: duplicate.id,
              duplicateCanonicalUrl: canonicalFinalUrl,
            },
          })
          .where(eq(rawSourceMaterial.id, queued.rawMaterialId));

        if (input.actor) {
          await transaction.insert(auditEvents).values({
            actorUserId: input.actor.userId,
            actorEmail: input.actor.email,
            operation: "update",
            targetType: "sources",
            targetId: queued.sourceId,
            afterSummary: `Facebook capture skipped as duplicate of source ${duplicate.id}.`,
            createdAt: input.now,
          });
        }

        return { status: "duplicate" as const, duplicateSourceId: duplicate.id };
      }
    }

    const rawMetadata = sanitizeCaptureMetadata(input.captureMetadata);
    const version = await appendSourceCaptureVersion(transaction, {
      sourceId: queued.sourceId,
      captureKind: "facebook",
      rawText: input.rawText,
      metadata: { ...rawMetadata, kind: "facebook_operator" } as FacebookCaptureMetadata,
      capturedAt: new Date(input.captureMetadata.capturedAt),
    });

    if (canonicalFinalUrl) {
      await transaction
        .update(sources)
        .set({ canonicalUrl: canonicalFinalUrl })
        .where(eq(sources.id, queued.sourceId));
    }

    const review = await ensureFacebookCaptureReviewForCapturedSource(transaction, {
      sourceId: queued.sourceId,
      rawSourceMaterialId: queued.rawMaterialId,
      captureVersionId: version.id,
      now: input.now,
    });

    if (review.status === "not_reviewable") {
      throw new Error("Captured Facebook source could not enter review state.");
    }
    if (input.expectedForceLiveCapture && input.expectedForceLiveCaptureGeneration !== undefined) {
      await transaction
        .update(facebookCaptureReviews)
        .set({ forceLiveCapture: false })
        .where(and(
          eq(facebookCaptureReviews.sourceId, queued.sourceId),
          eq(facebookCaptureReviews.forceLiveCapture, true),
          eq(facebookCaptureReviews.forceLiveCaptureGeneration, input.expectedForceLiveCaptureGeneration),
        ));
    }

    if (input.actor) {
      await transaction.insert(auditEvents).values({
        actorUserId: input.actor.userId,
        actorEmail: input.actor.email,
        operation: "update",
        targetType: "source_capture_version",
        targetId: version.id,
        beforeSummary: `Facebook capture version appended; method: ${rawMetadata.captureMethod}`,
        afterSummary: `Facebook capture version appended; capturedAt: ${rawMetadata.capturedAt}`,
        createdAt: input.now,
      });
    }

    const discovered = input.actor && input.sourceUrl && !queued.rawMetadata?.discoveredFromSourceId
        ? await queueDiscoveredFacebookPostsInTransaction(transaction, {
          sourceId: queued.sourceId,
          sourceUrl: input.sourceUrl,
          urls: input.discoveredUrls ?? [],
          actor: input.actor,
        }, discoveredPosts, true)
      : { queuedCount: 0, duplicateCount: 0 };

    return { status: "updated" as const, rawMaterialId: queued.rawMaterialId, captureVersionId: version.id, reviewId: review.review.id, discovered };
  });
}

export async function findFacebookCaptureImportByCorrelationToken(db: FacebookCaptureDb, input: { sourceId: string; correlationToken: string }) {
  const [row] = await db.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).where(and(eq(sourceCaptureVersions.sourceId, input.sourceId), sql`${sourceCaptureVersions.rawMetadata}->>'importCorrelationToken' = ${input.correlationToken}`)).limit(1);
  return Boolean(row);
}

export async function queueDiscoveredFacebookPosts(
  db: FacebookCaptureDb,
  input: {
    sourceId: string;
    sourceUrl: string;
    urls: string[];
    actor: FacebookCaptureActor;
  },
) {
  const discoveredPosts = normalizeDiscoveredFacebookPosts(input.urls, input.sourceUrl);

  if (discoveredPosts.length === 0) {
    return { queuedCount: 0, duplicateCount: 0 };
  }

  return db.transaction(async (transaction) => {
    return queueDiscoveredFacebookPostsInTransaction(transaction, input, discoveredPosts);
  });
}

async function queueDiscoveredFacebookPostsInTransaction(
  transaction: Parameters<Parameters<FacebookCaptureDb["transaction"]>[0]>[0],
  input: { sourceId: string; sourceUrl: string; urls: string[]; actor: FacebookCaptureActor },
  discoveredPosts = normalizeDiscoveredFacebookPosts(input.urls, input.sourceUrl),
  locksHeld = false,
) {
  if (discoveredPosts.length === 0) {
    return { queuedCount: 0, duplicateCount: 0 };
  }

  if (!locksHeld) {
    await lockFacebookCaptureResources(transaction, { canonicalUrls: discoveredPosts.map((post) => post.canonicalUrl) });
  }

  const existing = await transaction
    .select({ canonicalUrl: sources.canonicalUrl })
    .from(sources)
    .where(eq(sources.kind, "facebook"));
  const existingCanonicalUrls = new Set(existing.flatMap((source) => {
    const canonicalUrl = source.canonicalUrl ? canonicalizeFacebookUrl(source.canonicalUrl) : null;
    return canonicalUrl ? [canonicalUrl] : [];
  }));
  const postsToQueue = discoveredPosts.filter((post) => !existingCanonicalUrls.has(post.canonicalUrl));

  if (postsToQueue.length > 0) {
    const queuedSources = await transaction
      .insert(sources)
      .values(postsToQueue.map((post) => ({
        kind: "facebook" as const,
        url: post.url,
        canonicalUrl: post.canonicalUrl,
        label: "Facebook post discovered from summary",
        publisher: "Facebook",
        sourceType: "community" as const,
        verificationStatus: "unverified" as const,
        official: false,
        partner: false,
        submittedByUserId: input.actor.userId,
      })))
      .returning({ id: sources.id });
    await transaction.insert(rawSourceMaterial).values(queuedSources.map((source) => ({
      sourceId: source.id,
      rawMetadata: { discoveredFromSourceId: input.sourceId },
    })));
  }

  await transaction.insert(auditEvents).values({
    actorUserId: input.actor.userId,
    actorEmail: input.actor.email,
    operation: "create",
    targetType: "facebook_capture_discovered_posts",
    targetId: input.sourceId,
    afterSummary: `Facebook capture discovered posts: queued=${postsToQueue.length}; existing=${discoveredPosts.length - postsToQueue.length}.`,
  });

  return { queuedCount: postsToQueue.length, duplicateCount: discoveredPosts.length - postsToQueue.length };
}

export function normalizeDiscoveredFacebookPosts(urls: string[], sourceUrl: string): DiscoveredFacebookPost[] {
  const sourceCanonicalUrl = canonicalizeFacebookUrl(sourceUrl);
  const posts = new Map<string, DiscoveredFacebookPost>();

  for (const url of urls) {
    const canonicalUrl = canonicalizeFacebookUrl(url);
    if (!canonicalUrl || canonicalUrl === sourceCanonicalUrl || posts.has(canonicalUrl)) {
      continue;
    }

    posts.set(canonicalUrl, { url: canonicalUrl, canonicalUrl });
    if (posts.size === MAX_DISCOVERED_POSTS_PER_CAPTURE) {
      break;
    }
  }

  return Array.from(posts.values());
}

export function recordFacebookCaptureFailure(sourceId: string, reason: string) {
  return { sourceId, status: "failed" as const, reason };
}
