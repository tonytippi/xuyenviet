import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { auditEvents, rawSourceMaterial, schema, sources } from "../../db/schema";

export type YoutubeCaptureDb = PostgresJsDatabase<typeof schema>;

export type YoutubeCaptureActor = { userId: string; email: string };

export type QueuedYoutubeSource = {
  sourceId: string;
  url: string | null;
  canonicalUrl: string | null;
  rawMaterialId: string;
  rawMetadata: Record<string, unknown> | null;
};

export type YoutubeEvidence = {
  category: "road_condition" | "route" | "toll" | "fuel" | "charging" | "rest_stop" | "parking" | "accommodation" | "food" | "attraction" | "safety" | "weather" | "cost";
  claim_vi: string;
  evidence_type: "spoken" | "on_screen" | "both";
  timestamp_start_seconds: number;
  timestamp_end_seconds: number;
  confidence: "high" | "medium" | "low";
  freshness_sensitive: boolean;
  evidence_excerpt: string;
  uncertainty_or_condition: string | null;
};

export type SafeYoutubeCaptureMetadata = {
  captureMethod: "gemini_youtube_url";
  capturedAt: string;
  sourceUrl: string;
  model: string;
  promptVersion: string;
  evidenceCount: number;
  latencyMs: number;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  captureOrigin?: "live" | "cache";
  captureArtifactId?: string;
  importedAt?: string;
  importCorrelationToken?: string;
  payloadSchemaVersion?: string;
  importActorId?: string;
};

const categories = new Set<YoutubeEvidence["category"]>(["road_condition", "route", "toll", "fuel", "charging", "rest_stop", "parking", "accommodation", "food", "attraction", "safety", "weather", "cost"]);
const evidenceTypes = new Set<YoutubeEvidence["evidence_type"]>(["spoken", "on_screen", "both"]);
const confidences = new Set<YoutubeEvidence["confidence"]>(["high", "medium", "low"]);
const maxEvidenceItems = 20;
const maxRawTextLength = 20_000;
const maxClaimLength = 500;
const maxExcerptLength = 240;
const maxConditionLength = 400;

function queuedCondition() {
  return and(or(isNull(rawSourceMaterial.rawText), sql`length(btrim(${rawSourceMaterial.rawText})) = 0`), sql`${rawSourceMaterial.rawMetadata}->>'duplicateSourceId' is null`);
}

export async function listQueuedYoutubeSources(db: YoutubeCaptureDb, input: { sourceId?: string; limit?: number } = {}): Promise<QueuedYoutubeSource[]> {
  const limit = input.sourceId ? 1 : Math.min(Math.max(Math.trunc(input.limit ?? 5), 1), 25);
  return db
    .select({ sourceId: sources.id, url: sources.url, canonicalUrl: sources.canonicalUrl, rawMaterialId: rawSourceMaterial.id, rawMetadata: rawSourceMaterial.rawMetadata })
    .from(sources)
    .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.sourceId, sources.id))
    .where(and(eq(sources.kind, "youtube"), queuedCondition(), input.sourceId ? eq(sources.id, input.sourceId) : undefined))
    .orderBy(asc(sources.createdAt))
    .limit(limit);
}

export function parseYoutubeEvidence(value: unknown): YoutubeEvidence[] {
  if (!isRecord(value) || !Array.isArray(value.evidence)) throw new Error("gemini_invalid_json");
  if (value.evidence.length > maxEvidenceItems) throw new Error("gemini_evidence_limit_exceeded");
  return value.evidence.map((item) => normalizeEvidence(item));
}

export function serializeYoutubeEvidence(evidence: YoutubeEvidence[]) {
  const rawText = JSON.stringify({ evidence });
  if (rawText.length > maxRawTextLength) throw new Error("gemini_evidence_too_large");
  return rawText;
}

export async function saveYoutubeEvidence(db: YoutubeCaptureDb, input: { sourceId: string; evidence: YoutubeEvidence[]; metadata: SafeYoutubeCaptureMetadata; actor: YoutubeCaptureActor; title?: string | null; now?: Date }) {
  const rawText = serializeYoutubeEvidence(input.evidence);
  return db.transaction(async (transaction) => {
    const [queued] = await transaction
      .select({ rawMaterialId: rawSourceMaterial.id })
      .from(sources)
      .innerJoin(rawSourceMaterial, eq(rawSourceMaterial.sourceId, sources.id))
      .where(and(eq(sources.id, input.sourceId), eq(sources.kind, "youtube"), queuedCondition()))
      .limit(1)
      .for("update");
    if (!queued) return { status: "not_queued" as const };

    const updated = await transaction.update(rawSourceMaterial).set({ rawText, rawMetadata: sanitizeYoutubeMetadata(input.metadata) }).where(and(eq(rawSourceMaterial.id, queued.rawMaterialId), queuedCondition())).returning({ id: rawSourceMaterial.id });
    if (updated.length === 0) return { status: "no_longer_queued" as const };

    if (input.title) {
      await transaction.update(sources).set({ label: input.title }).where(eq(sources.id, input.sourceId));
    }

    await transaction.insert(auditEvents).values({
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      operation: "update",
      targetType: "raw_source_material",
      targetId: queued.rawMaterialId,
      beforeSummary: "YouTube evidence present: false.",
      afterSummary: `YouTube evidence present: true; method: gemini_youtube_url; evidenceCount: ${input.evidence.length}; capturedAt: ${input.metadata.capturedAt}.`,
      createdAt: input.now,
    });
    return { status: "updated" as const, rawMaterialId: updated[0].id };
  });
}

export async function findYoutubeCaptureImportByCorrelationToken(db: YoutubeCaptureDb, input: { sourceId: string; correlationToken: string }) {
  const [row] = await db.select({ id: rawSourceMaterial.id }).from(rawSourceMaterial).where(and(eq(rawSourceMaterial.sourceId, input.sourceId), sql`${rawSourceMaterial.rawMetadata}->>'importCorrelationToken' = ${input.correlationToken}`)).limit(1);
  return Boolean(row);
}

export async function recordYoutubeCaptureFailure(db: YoutubeCaptureDb, input: { sourceId: string; reason: string; actor: YoutubeCaptureActor; now?: Date }) {
  await db.insert(auditEvents).values({
    actorUserId: input.actor.userId,
    actorEmail: input.actor.email,
    operation: "update",
    targetType: "youtube_capture",
    targetId: input.sourceId,
    afterSummary: `YouTube capture failed: ${safeFailureReason(input.reason)}.`,
    createdAt: input.now,
  });
}

function normalizeEvidence(value: unknown): YoutubeEvidence {
  if (!isRecord(value)) throw new Error("gemini_invalid_evidence_item");
  const category = enumValue(value.category, categories);
  const evidenceType = enumValue(value.evidence_type, evidenceTypes);
  const confidence = enumValue(value.confidence, confidences);
  const claim = boundedString(value.claim_vi, maxClaimLength);
  const excerpt = boundedString(value.evidence_excerpt, maxExcerptLength);
  const start = timestamp(value.timestamp_start_seconds);
  const end = timestamp(value.timestamp_end_seconds);
  const condition = nullableBoundedString(value.uncertainty_or_condition, maxConditionLength);
  if (!category || !evidenceType || !confidence || !claim || !excerpt || start === null || end === null || end < start || typeof value.freshness_sensitive !== "boolean") throw new Error("gemini_invalid_evidence_item");
  return { category, claim_vi: claim, evidence_type: evidenceType, timestamp_start_seconds: start, timestamp_end_seconds: end, confidence, freshness_sensitive: value.freshness_sensitive, evidence_excerpt: excerpt, uncertainty_or_condition: condition };
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>): T | null {
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : null;
}

function boundedString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() && value.trim().length <= maxLength ? value.trim() : null;
}

function nullableBoundedString(value: unknown, maxLength: number) {
  return value === null ? null : boundedString(value, maxLength);
}

function timestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isInteger(value) ? value : null;
}

function safeFailureReason(reason: string) {
  return reason.replace(/[^a-z0-9_.:-]+/gi, "_").slice(0, 120) || "unknown";
}

export function sanitizeYoutubeMetadata(metadata: Record<string, unknown>) {
  const allowed = new Set<keyof SafeYoutubeCaptureMetadata>(["captureMethod", "capturedAt", "sourceUrl", "model", "promptVersion", "evidenceCount", "latencyMs", "promptTokens", "outputTokens", "totalTokens", "captureOrigin", "captureArtifactId", "importedAt", "importCorrelationToken", "payloadSchemaVersion", "importActorId"]);
  return Object.fromEntries(Object.entries(metadata).filter(([key, value]) => allowed.has(key as keyof SafeYoutubeCaptureMetadata) && value !== undefined)) as SafeYoutubeCaptureMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
