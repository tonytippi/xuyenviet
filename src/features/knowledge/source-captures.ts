import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { auditEvents, facebookCaptureReviews, knowledgeCards, knowledgeCardSources, knowledgeExtractionJobs, sourceCaptureVersions, sources, userRoles, users, type SourceKind } from "@/db/schema";

const submittedKinds = new Set<SourceKind>(["url", "copied_post", "pasted_text", "screenshot"]);
const unsafeMetadataKey = /cookie|token|password|local_?storage|html|hidden|profile|provider|secret/i;
const maxMetadataEntries = 16;
const maxMetadataKeyLength = 48;
const maxMetadataValueLength = 500;

export type GenericCaptureMetadata = { kind: "submitted"; fileName?: string; mimeType?: "image/jpeg" | "image/png" | "image/webp"; byteSize?: number; storageKey?: string };
export type FacebookCaptureMetadata = { kind: "facebook_operator"; captureMethod: "playwright_operator_browser"; capturedAt: string; sourceUrl: string; finalUrl: string; authorText?: string; groupName?: string; timestampText?: string; postCreatedAt?: string; captureOrigin?: "live" | "cache"; captureArtifactId?: string; importCorrelationToken?: string; captureMethodVersion?: string; payloadSchemaVersion?: string; captureActorId?: string; importActorId?: string };
export type YoutubeCaptureMetadata = { kind: "youtube"; captureMethod: "gemini_youtube_url"; capturedAt: string; sourceUrl: string; model: string; mediaResolution: "MEDIA_RESOLUTION_LOW" | "MEDIA_RESOLUTION_MEDIUM" | "MEDIA_RESOLUTION_HIGH"; promptVersion: string; evidenceCount: number; latencyMs: number; videoDurationSeconds?: number; windowStartSeconds?: number; windowEndSeconds?: number; windowCount?: number; captureOrigin?: "live" | "cache"; captureArtifactId?: string; importedAt?: string; importCorrelationToken?: string; payloadSchemaVersion?: string; importActorId?: string; promptTokens?: number; outputTokens?: number; totalTokens?: number };
export type SafeCaptureMetadata = GenericCaptureMetadata | FacebookCaptureMetadata | YoutubeCaptureMetadata;

export class SourceCaptureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceCaptureValidationError";
  }
}

type CaptureDb = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update" | "execute">;
const retentionDays = 180;
const retentionCandidateLimit = 100;

export function normalizeCaptureText(value: string) {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

export function hashCaptureText(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function validateSafeCaptureMetadata(captureKind: SourceKind, value: SafeCaptureMetadata): Record<string, unknown> {
  if (!isRecord(value) || !isSafeCaptureMetadataKind(value.kind)) {
    throw new SourceCaptureValidationError("Capture metadata kind is invalid.");
  }

  const metadata = value;
  const allowed = allowedMetadataKeys(metadata.kind);
  if (Object.keys(metadata).length > maxMetadataEntries || Object.keys(metadata).some((key) => !allowed.has(key) || key.length > maxMetadataKeyLength)) {
    throw new SourceCaptureValidationError("Capture metadata contains unsupported or unsafe fields.");
  }
  if ((metadata.kind === "facebook_operator" && captureKind !== "facebook") || (metadata.kind === "youtube" && captureKind !== "youtube") || (metadata.kind === "submitted" && !submittedKinds.has(captureKind))) {
    throw new SourceCaptureValidationError("Capture metadata does not match the source kind.");
  }
  for (const [key, item] of Object.entries(metadata)) {
    if (typeof item === "string" && (!item.trim() || item.length > maxMetadataValueLength || unsafeMetadataKey.test(item))) {
      throw new SourceCaptureValidationError(`Capture metadata field ${key} is unsafe.`);
    }
    if (typeof item === "number" && (!Number.isFinite(item) || item < 0 || !Number.isInteger(item))) throw new SourceCaptureValidationError(`Capture metadata field ${key} is invalid.`);
    if (key !== "kind" && typeof item !== "string" && typeof item !== "number") throw new SourceCaptureValidationError(`Capture metadata field ${key} is invalid.`);
  }

  if (metadata.kind === "facebook_operator") {
    if (metadata.captureMethod !== "playwright_operator_browser" || !isIsoInstant(metadata.capturedAt) || !isHttpUrl(metadata.sourceUrl) || !isHttpUrl(metadata.finalUrl)) {
      throw new SourceCaptureValidationError("Facebook capture metadata is incomplete or invalid.");
    }
  }
  if (metadata.kind === "youtube") {
    if (metadata.captureMethod !== "gemini_youtube_url" || !isIsoInstant(metadata.capturedAt) || !isHttpUrl(metadata.sourceUrl) || !metadata.model || !metadata.promptVersion || !["MEDIA_RESOLUTION_LOW", "MEDIA_RESOLUTION_MEDIUM", "MEDIA_RESOLUTION_HIGH"].includes(metadata.mediaResolution) || typeof metadata.evidenceCount !== "number" || typeof metadata.latencyMs !== "number") {
      throw new SourceCaptureValidationError("YouTube capture metadata is incomplete or invalid.");
    }
  }
  return metadata;
}

function allowedMetadataKeys(kind: SafeCaptureMetadata["kind"]) {
  if (kind === "submitted") return new Set(["kind", "fileName", "mimeType", "byteSize", "storageKey"]);
  if (kind === "facebook_operator") return new Set(["kind", "captureMethod", "capturedAt", "sourceUrl", "finalUrl", "authorText", "groupName", "timestampText", "postCreatedAt", "captureOrigin", "captureArtifactId", "importCorrelationToken", "captureMethodVersion", "payloadSchemaVersion", "captureActorId", "importActorId"]);
  return new Set(["kind", "captureMethod", "capturedAt", "sourceUrl", "model", "mediaResolution", "promptVersion", "evidenceCount", "latencyMs", "videoDurationSeconds", "windowStartSeconds", "windowEndSeconds", "windowCount", "captureOrigin", "captureArtifactId", "importedAt", "importCorrelationToken", "payloadSchemaVersion", "importActorId", "promptTokens", "outputTokens", "totalTokens"]);
}

function isSafeCaptureMetadataKind(value: unknown): value is SafeCaptureMetadata["kind"] {
  return value === "submitted" || value === "facebook_operator" || value === "youtube";
}

function isIsoInstant(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isHttpUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function appendSourceCaptureVersion(
  db: CaptureDb,
  input: { sourceId: string; captureKind: SourceKind; rawText: string; metadata: SafeCaptureMetadata; capturedAt?: Date; file?: { fileName?: string | null; mimeType?: string | null; byteSize?: number | null; storageKey?: string | null } },
) {
  const rawText = normalizeCaptureText(input.rawText);
  const limit = input.captureKind === "youtube" ? 120_000 : 20_000;
  if (!rawText) throw new SourceCaptureValidationError("Captured readable material cannot be empty.");
  if (rawText.length > limit) throw new SourceCaptureValidationError(`Captured readable material exceeds the ${limit}-character limit.`);
  const rawMetadata = validateSafeCaptureMetadata(input.captureKind, input.metadata);
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.sourceId}, 44))`);
  const [source] = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, input.sourceId)).limit(1);
  if (!source) throw new SourceCaptureValidationError("Source does not exist.");
  const [latest] = await db.select({ versionSequence: sourceCaptureVersions.versionSequence }).from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, input.sourceId)).orderBy(desc(sourceCaptureVersions.versionSequence)).limit(1);
  const [version] = await db.insert(sourceCaptureVersions).values({
    sourceId: input.sourceId,
    versionSequence: (latest?.versionSequence ?? 0) + 1,
    captureKind: input.captureKind,
    rawText,
    contentHash: hashCaptureText(rawText),
    rawMetadata,
    capturedAt: input.capturedAt ?? new Date(),
    fileName: input.file?.fileName ?? null,
    mimeType: input.file?.mimeType ?? null,
    byteSize: input.file?.byteSize ?? null,
    storageKey: input.file?.storageKey ?? null,
  }).returning();
  await db.update(sources).set({ currentCaptureVersionId: version.id }).where(eq(sources.id, input.sourceId));
  return version;
}

export async function getCaptureVersion(db: Pick<CaptureDb, "select">, captureVersionId: string) {
  const [version] = await db.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.id, captureVersionId)).limit(1);
  return version ?? null;
}

export async function retainExpiredFacebookCaptureVersions(
  input: { actorUserId: string; actorEmail: string; dryRun: boolean; now?: Date; limit?: number },
  db = getDb(),
) {
  const now = input.now ?? new Date();
  const actorUserId = input.actorUserId.trim();
  const actorEmail = input.actorEmail.trim().toLowerCase();
  if (!actorUserId || !actorEmail) throw new SourceCaptureValidationError("Retention requires an authenticated actor ID and email.");
  const [actor] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.id, actorUserId), eq(users.email, actorEmail), inArray(userRoles.role, ["operator", "admin"])))
    .limit(1);
  if (!actor) throw new SourceCaptureValidationError("Retention actor is not a matching existing user.");

  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const candidates = await db
    .select({ id: sourceCaptureVersions.id })
    .from(sourceCaptureVersions)
    .where(and(eq(sourceCaptureVersions.captureKind, "facebook"), isNull(sourceCaptureVersions.payloadDeletedAt), lte(sourceCaptureVersions.capturedAt, cutoff)))
    .orderBy(sourceCaptureVersions.capturedAt)
    .limit(Math.min(Math.max(input.limit ?? retentionCandidateLimit, 1), retentionCandidateLimit));
  const tombstoned: string[] = [];
  const blocked: string[] = [];

  for (const candidate of candidates) {
    const outcome = await db.transaction(async (transaction) => {
      const [version] = await transaction
        .select({ id: sourceCaptureVersions.id, sourceId: sourceCaptureVersions.sourceId, capturedAt: sourceCaptureVersions.capturedAt, payloadDeletedAt: sourceCaptureVersions.payloadDeletedAt })
        .from(sourceCaptureVersions)
        .where(eq(sourceCaptureVersions.id, candidate.id))
        .limit(1)
        .for("update");
      if (!version || version.payloadDeletedAt || version.capturedAt > cutoff) return "skip" as const;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${version.sourceId}, 44))`);

      const [current] = await transaction.select({ currentCaptureVersionId: sources.currentCaptureVersionId }).from(sources).where(eq(sources.id, version.sourceId)).limit(1).for("update");
      if (!current || await hasRetentionBlocker(transaction, version.sourceId, version.id)) return "blocked" as const;
      if (input.dryRun) return "would_tombstone" as const;

      const [updated] = await transaction.update(sourceCaptureVersions).set({ rawText: null, fileName: null, mimeType: null, byteSize: null, storageKey: null, rawMetadata: null, payloadDeletedAt: now }).where(and(eq(sourceCaptureVersions.id, version.id), isNull(sourceCaptureVersions.payloadDeletedAt))).returning({ id: sourceCaptureVersions.id });
      if (!updated) return "skip" as const;
      if (current.currentCaptureVersionId === version.id) await transaction.update(sources).set({ currentCaptureVersionId: null }).where(and(eq(sources.id, version.sourceId), eq(sources.currentCaptureVersionId, version.id)));
      await transaction.insert(auditEvents).values({ actorUserId, actorEmail, operation: "delete", targetType: "source_capture_version_retention", targetId: version.id, afterSummary: `Retention tombstoned Facebook capture version; sourceId=${version.sourceId}; basis=captured_at_180_days.` , createdAt: now });
      return "tombstoned" as const;
    });
    if (outcome === "tombstoned" || outcome === "would_tombstone") tombstoned.push(candidate.id);
    if (outcome === "blocked") blocked.push(candidate.id);
  }
  return { dryRun: input.dryRun, candidateCount: candidates.length, tombstonedVersionIds: tombstoned, blockedVersionIds: blocked };
}

async function hasRetentionBlocker(db: Pick<ReturnType<typeof getDb>, "select">, sourceId: string, versionId: string) {
  const [card] = await db.select({ id: knowledgeCards.id }).from(knowledgeCardSources).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSources.knowledgeCardId)).where(and(eq(knowledgeCardSources.sourceId, sourceId), sql`(${knowledgeCards.publicationState} = 'active' or ${knowledgeCards.reviewState} in ('ai_recommended', 'in_review'))`)).limit(1);
  if (card) return true;
  const [review] = await db.select({ id: facebookCaptureReviews.id }).from(facebookCaptureReviews).where(and(eq(facebookCaptureReviews.captureVersionId, versionId), inArray(facebookCaptureReviews.status, ["needs_review", "extraction_failed"]))).limit(1);
  if (review) return true;
  const [job] = await db.select({ id: knowledgeExtractionJobs.id }).from(knowledgeExtractionJobs).where(and(eq(knowledgeExtractionJobs.captureVersionId, versionId), inArray(knowledgeExtractionJobs.status, ["queued", "running"]))).limit(1);
  if (job) return true;
  const [unknownJob] = await db.select({ id: knowledgeExtractionJobs.id }).from(knowledgeExtractionJobs).where(and(eq(knowledgeExtractionJobs.sourceId, sourceId), isNull(knowledgeExtractionJobs.captureVersionId), inArray(knowledgeExtractionJobs.status, ["queued", "running"]))).limit(1);
  if (unknownJob) return true;
  const [unknown] = await db.select({ id: facebookCaptureReviews.id }).from(facebookCaptureReviews).where(and(eq(facebookCaptureReviews.sourceId, sourceId), isNull(facebookCaptureReviews.captureVersionId))).limit(1);
  return Boolean(unknown);
}
