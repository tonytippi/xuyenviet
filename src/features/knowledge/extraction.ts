import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  facebookCaptureReviews,
  knowledgeCards,
  knowledgeCardSources,
  knowledgeExtractionJobs,
  knowledgeCardTypeValues,
  knowledgeConfidenceValues,
  rawSourceMaterial,
  sources,
  type KnowledgeConfidence,
  type AiUsageStatus,
} from "@/db/schema";
import { completeExtraction } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel, type SelectedAiGatewayModel } from "@/features/ai/models";
import {
  buildSourceKnowledgeDraftExtractionMessages,
  sourceKnowledgeDraftExtractionPromptVersion,
  sourceKnowledgeDraftExtractionPurpose,
} from "@/features/ai/prompts";
import { recordAuditEvent } from "@/features/audit/events";
import { writeAiUsageEvent } from "@/features/usage/events";
import type { AuthenticatedSession } from "@/server/auth";

const maxDraftsPerExtraction = 12;
const maxTitleLength = 160;
const maxLocationLength = 160;
const maxRouteSegmentLength = 160;
const maxSummaryLength = 1200;
const maxDetailStringLength = 500;
const maxDetailArrayItems = 10;
const maxOrderedStops = 40;
const maxTags = 12;
const maxTagLength = 40;

type ExtractionDb = ReturnType<typeof getDb>;
type ExtractionQueryDb = Pick<ExtractionDb, "select">;
type ExtractionLockDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

export type KnowledgeDraftExtractionPreProviderGuard = (input: { db: ExtractionQueryDb; sourceId: string }) => Promise<void>;

type DraftInsert = Pick<
  typeof knowledgeCards.$inferInsert,
  | "type"
  | "title"
  | "locationName"
  | "routeSegment"
  | "summary"
  | "practicalDetails"
  | "tags"
  | "confidence"
  | "freshnessSensitive"
  | "aiPromptVersion"
>;

export type KnowledgeDraftExtractionResult = {
  sourceId: string;
  draftCount: number;
  draftIds: string[];
};

export class KnowledgeExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_source" | "model_unavailable" | "unsupported_material" | "provider_failed" | "invalid_model_output" | "already_extracted" | "capture_not_actionable",
    public readonly safeDetail?: string,
  ) {
    super(message);
    this.name = "KnowledgeExtractionError";
  }
}

export function isKnowledgeExtractionError(error: unknown) {
  return error instanceof KnowledgeExtractionError || (error instanceof Error && error.name === "KnowledgeExtractionError");
}

export async function extractKnowledgeDraftsFromSource(sourceId: string, options: { preProviderGuard?: KnowledgeDraftExtractionPreProviderGuard } = {}): Promise<KnowledgeDraftExtractionResult> {
  const { requireAdminSession } = await import("@/server/auth");
  const session = await requireAdminSession();
  return extractKnowledgeDraftsFromSourceAsActor(sourceId, session, options);
}

export async function extractKnowledgeDraftsFromSourceAsActor(sourceId: string, actor: AuthenticatedSession, options: { preProviderGuard?: KnowledgeDraftExtractionPreProviderGuard; resultJobId?: string } = {}): Promise<KnowledgeDraftExtractionResult> {
  const normalizedSourceId = sourceId.trim();
  let providerUsage: Parameters<typeof writeUsageForProviderCall>[3] | null = null;

  if (!normalizedSourceId) {
    throw new KnowledgeExtractionError("Không tìm thấy nguồn cần trích xuất.", "invalid_source");
  }

  const db = getDb();
  const sourceBundle = await loadSourceBundle(db, normalizedSourceId);

  if (!sourceBundle) {
    throw new KnowledgeExtractionError("Không tìm thấy nguồn cần trích xuất.", "invalid_source");
  }

  if (!sourceBundle.raw.rawText?.trim()) {
    throw new KnowledgeExtractionError("Nguồn này chưa có văn bản đọc được để AI trích xuất.", "unsupported_material");
  }
  const rawText = sourceBundle.raw.rawText;

  const model = await selectActiveAiGatewayModel({
    purpose: sourceKnowledgeDraftExtractionPurpose,
    requiredCapabilities: { textInput: true, extraction: true },
    db,
  });

  if (!model) {
    throw new KnowledgeExtractionError("Chưa có model AI extraction đang hoạt động.", "model_unavailable");
  }

  try {
    await db.transaction(async (transaction) => {
      await lockSourceExtraction(transaction, sourceBundle.source.id);

      if (await sourceAlreadyHasExtraction(transaction, sourceBundle.source.id)) {
        throw new KnowledgeExtractionError("Nguồn này đã được AI trích xuất trước đó. Vui lòng duyệt, sửa hoặc xử lý các thẻ đã tạo thay vì trích xuất lại.", "already_extracted");
      }

      await options.preProviderGuard?.({ db: transaction, sourceId: sourceBundle.source.id });
    });

    const gatewayResult = await completeExtraction({
      model: model.gatewayModelName,
      messages: buildSourceKnowledgeDraftExtractionMessages({
        source: {
          kind: sourceBundle.source.kind,
          label: sourceBundle.source.label,
          publisher: sourceBundle.source.publisher,
          collectedDate: sourceBundle.source.collectedDate,
          sourceType: sourceBundle.source.sourceType,
          verificationStatus: sourceBundle.source.verificationStatus,
          official: sourceBundle.source.official,
          partner: sourceBundle.source.partner,
        },
        rawText,
      }),
    });

    if (!gatewayResult.ok) {
      providerUsage = {
        status: "failure" as const,
        provider: gatewayResult.provider ?? "unknown",
        model: gatewayResult.model ?? model.gatewayModelName,
        latencyMs: gatewayResult.latencyMs,
        errorCode: gatewayResult.errorCode,
      };
      throw new KnowledgeExtractionError("AI chưa trích xuất được nguồn này. Vui lòng thử lại sau.", "provider_failed");
    }

    providerUsage = {
      status: "success",
      provider: gatewayResult.provider,
      model: gatewayResult.model,
      latencyMs: gatewayResult.latencyMs,
      promptTokens: gatewayResult.usage.promptTokens,
      completionTokens: gatewayResult.usage.completionTokens,
      totalTokens: gatewayResult.usage.totalTokens,
      cachedPromptTokens: gatewayResult.usage.cachedPromptTokens,
      cacheWritePromptTokens: gatewayResult.usage.cacheWritePromptTokens,
    };

    let drafts: DraftInsert[];

    try {
      drafts = parseDrafts(gatewayResult.content, sourceBundle.source, rawText);
    } catch (error) {
      logRejectedModelOutput(sourceBundle.source.id, gatewayResult.content, error);
      throw error;
    }

    if (drafts.length === 0) {
      throw new KnowledgeExtractionError("AI không tìm thấy tri thức du lịch đủ rõ để tạo bản nháp.", "invalid_model_output");
    }

    const extraction = await db.transaction(async (transaction) => {
      await lockSourceExtraction(transaction, sourceBundle.source.id);

      if (await sourceAlreadyHasExtraction(transaction, sourceBundle.source.id)) {
        throw new KnowledgeExtractionError("Nguồn này đã được AI trích xuất trước đó. Vui lòng duyệt, sửa hoặc xử lý các thẻ đã tạo thay vì trích xuất lại.", "already_extracted");
      }

      await options.preProviderGuard?.({ db: transaction, sourceId: sourceBundle.source.id });

      const inserted = await transaction.insert(knowledgeCards).values(drafts.map((draft) => ({ ...draft, createdByUserId: actor.userId, aiGatewayModelId: model.id }))).returning({ id: knowledgeCards.id });

      await transaction.insert(knowledgeCardSources).values(inserted.map((card) => ({ knowledgeCardId: card.id, sourceId: sourceBundle.source.id, supportLevel: "primary" as const })));

      const extraction = {
        sourceId: sourceBundle.source.id,
        draftCount: inserted.length,
        draftIds: inserted.map((card) => card.id),
      };

      if (options.resultJobId) {
        await transaction
          .update(knowledgeExtractionJobs)
          .set({ resultDraftIds: extraction.draftIds, resultDraftCount: extraction.draftCount, updatedAt: new Date() })
          .where(eq(knowledgeExtractionJobs.id, options.resultJobId));
      }

      await recordAuditEvent(
        {
          actor,
          operation: "create",
          targetType: "knowledge_draft_extraction",
          targetId: sourceBundle.source.id,
          afterSummary: `AI extraction created ${inserted.length} draft knowledge card(s) from one source.`,
        },
        transaction,
      );

      return extraction;
    });

    if (providerUsage) {
      await writeUsageForProviderCall(db, actor.userId, model, providerUsage);
    }

    return extraction;
  } catch (error) {
    if (providerUsage && error instanceof KnowledgeExtractionError) {
      await writeUsageForProviderCall(db, actor.userId, model, providerUsage);
    }
    throw error;
  }
}

export async function assertFacebookCaptureStillNeedsReview(db: ExtractionQueryDb, input: { reviewId: string; sourceId: string }) {
  const [review] = await db
    .select({ status: facebookCaptureReviews.status })
    .from(facebookCaptureReviews)
    .where(and(eq(facebookCaptureReviews.id, input.reviewId), eq(facebookCaptureReviews.sourceId, input.sourceId)))
    .limit(1);

  if (!review || (review.status !== "needs_review" && review.status !== "extraction_failed")) {
    throw new KnowledgeExtractionError("Capture này không còn ở trạng thái có thể trích xuất.", "capture_not_actionable");
  }
}

async function loadSourceBundle(db: ExtractionDb, sourceId: string) {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);

  if (!source) {
    return null;
  }

  const [raw] = await db.select().from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, source.id)).limit(1);

  return raw ? { source, raw } : null;
}

async function sourceAlreadyHasExtraction(db: ExtractionQueryDb, sourceId: string) {
  const [existingLink] = await db
    .select({ sourceId: knowledgeCardSources.sourceId })
    .from(knowledgeCardSources)
    .innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSources.knowledgeCardId))
    .where(and(eq(knowledgeCardSources.sourceId, sourceId), eq(knowledgeCards.aiPromptVersion, sourceKnowledgeDraftExtractionPromptVersion)))
    .limit(1);
  return Boolean(existingLink);
}

async function lockSourceExtraction(db: ExtractionLockDb, sourceId: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sourceId}, 42))`);
}

async function writeUsageForProviderCall(
  db: Pick<ExtractionDb, "insert">,
  userId: string,
  model: SelectedAiGatewayModel,
  event: {
    status: AiUsageStatus;
    provider: string;
    model: string;
    latencyMs: number | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    cachedPromptTokens?: number | null;
    cacheWritePromptTokens?: number | null;
    errorCode?: string | null;
  },
) {
  await writeAiUsageEvent(db, {
    userId,
    purpose: sourceKnowledgeDraftExtractionPurpose,
    provider: event.provider,
    model: event.model,
    aiGatewayModelId: model.id,
    promptVersion: sourceKnowledgeDraftExtractionPromptVersion,
    status: event.status,
    latencyMs: event.latencyMs,
    promptTokens: event.promptTokens,
    completionTokens: event.completionTokens,
    totalTokens: event.totalTokens,
    cachedPromptTokens: event.cachedPromptTokens,
    cacheWritePromptTokens: event.cacheWritePromptTokens,
    pricingSnapshot: getAiGatewayPricingSnapshot(model),
    errorCode: event.errorCode,
  });
}

function parseDrafts(content: string, source: typeof sources.$inferSelect, rawText: string): DraftInsert[] {
  const payload = parseJsonObject(content);
  const draftValues = Array.isArray(payload.drafts) ? payload.drafts : null;

  if (!draftValues) {
    throw new KnowledgeExtractionError("AI trả về cấu trúc bản nháp không hợp lệ.", "invalid_model_output", "missing_drafts_array");
  }

  if (draftValues.length === 0) {
    return [];
  }

  const normalizedDrafts = draftValues.slice(0, maxDraftsPerExtraction).map((draft) => normalizeDraft(draft, source, rawText));
  const firstInvalidDraft = normalizedDrafts.find((draft) => draft.result === null);

  if (firstInvalidDraft) {
    throw new KnowledgeExtractionError("AI trả về bản nháp không hợp lệ.", "invalid_model_output", firstInvalidDraft.reason);
  }

  return normalizedDrafts.map((draft) => draft.result as DraftInsert);
}

function normalizeDraft(value: unknown, source: typeof sources.$inferSelect, rawText: string): { result: DraftInsert | null; reason: string } {
  if (!isRecord(value)) {
    return { result: null, reason: "draft_not_object" };
  }

  const type = normalizeEnum(value.type, knowledgeCardTypeValues);
  const title = normalizeBoundedString(value.title, maxTitleLength);
  const summary = normalizeBoundedString(value.summary, maxSummaryLength);
  const confidence = clampConfidence(normalizeEnum(value.confidence, knowledgeConfidenceValues), source);
  const freshnessSensitive = normalizeFreshnessSensitive(value.freshness_sensitive);

  if (!type || !title || !summary || !confidence || freshnessSensitive === null) {
    return { result: null, reason: "missing_or_invalid_required_field" };
  }

  let locationName = normalizeBoundedString(value.location_name, maxLocationLength);
  let routeSegment = normalizeBoundedString(value.route_segment, maxRouteSegmentLength);

  if (!locationName && !routeSegment) {
    const fallback = inferLocationFallback(rawText);
    locationName = fallback.locationName ?? null;
    routeSegment = fallback.routeSegment ?? null;

    if (!locationName && !routeSegment) {
      return { result: null, reason: "missing_location_or_route" };
    }
  }

  const practicalDetails = normalizePracticalDetails(value.practical_details);
  const tags = normalizeTags(value.tags);

  if (!practicalDetails) {
    return { result: null, reason: "invalid_practical_details" };
  }

  if (containsUnsafeDraftFields({ title, locationName, routeSegment, summary, practicalDetails, tags }, rawText)) {
    return { result: null, reason: "unsafe_raw_overlap_or_sensitive_value" };
  }

  return {
    result: {
      type,
      title,
      locationName,
      routeSegment,
      summary,
      practicalDetails,
      tags,
      confidence,
      freshnessSensitive,
      aiPromptVersion: sourceKnowledgeDraftExtractionPromptVersion,
    },
    reason: "valid",
  };
}

function parseJsonObject(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    // Fall through to safe operational error.
  }

  throw new KnowledgeExtractionError("AI trả về JSON không hợp lệ.", "invalid_model_output", "invalid_json");
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function clampConfidence(confidence: KnowledgeConfidence | null, source: typeof sources.$inferSelect): KnowledgeConfidence | null {
  if (!confidence) {
    return null;
  }

  if (source.official && confidence === "official") return "official";
  if (source.partner && (confidence === "partner" || confidence === "official")) return "partner";
  if (source.sourceType === "community") return confidence === "community" ? "community" : "unverified";
  if (source.verificationStatus === "unverified") return "unverified";
  if (confidence === "official" || confidence === "partner") return "curated";

  return confidence;
}

function normalizeFreshnessSensitive(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeBoundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function normalizePracticalDetails(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return {};
  }

  const details: Record<string, unknown> = {};

  const entries = Object.entries(value);

  if (entries.length > 20) {
    return null;
  }

  for (const [key, detailValue] of entries) {
    const safeKey = normalizeBoundedString(key, 60);
    const safeValue = normalizeDetailValue(safeKey, detailValue);

    if (!safeKey || safeValue === null) {
      return null;
    }

    details[safeKey] = safeValue;
  }

  return details;
}

function normalizeDetailValue(key: string | null, value: unknown): string | string[] | null {
  if (typeof value === "string") {
    return normalizeBoundedString(value, maxDetailStringLength);
  }

  if (Array.isArray(value)) {
    if (value.length > (key === "ordered_stops" ? maxOrderedStops : maxDetailArrayItems)) {
      return null;
    }

    const values = value.map((item) => key === "ordered_stops" ? normalizeOrderedStop(item) : normalizeBoundedString(item, maxDetailStringLength));
    return values.length > 0 && values.every((item): item is string => item !== null) ? values : null;
  }

  return null;
}

function normalizeOrderedStop(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeBoundedString(stripOrderedStopFormatting(value), maxLocationLength);
  const withoutDecimalNotation = normalized?.replace(/\d+\.\d+/g, "") ?? "";

  if (!normalized || normalized.split(/\s+/).length > 12 || /[\r\n\[\]{}.,;:!?]/.test(withoutDecimalNotation) || /^\d{1,3}\s*[.)]\s+/.test(normalized) || /(rẽ|đi tiếp|chạy tiếp|băng qua|vượt|lướt qua|theo đường)/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function stripOrderedStopFormatting(value: string) {
  const withoutListNumber = value.replace(/^\s*\d{1,3}\s*[.)]\s+/, "").trim();
  const trailingAnnotation = withoutListNumber.match(/\s*\(([^()]*)\)\s*$/);

  if (trailingAnnotation && (/^\s*\d{1,3}\s*$/.test(trailingAnnotation[1]) || /(rẽ|đường|lối|tránh|đoạn)/i.test(trailingAnnotation[1]))) {
    return withoutListNumber.slice(0, trailingAnnotation.index).trim();
  }

  return withoutListNumber;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((tag) => normalizeBoundedString(tag, maxTagLength)).filter((tag): tag is string => tag !== null))).slice(0, maxTags);
}

function inferLocationFallback(rawText: string): { locationName: string | null; routeSegment: string | null } {
  const normalizedRaw = normalizeForOverlap(rawText);
  const mentionsDaNang = /(?:đà nẵng|da nang)/i.test(normalizedRaw);
  const mentionsHoiAn = /(?:hội an|hoi an)/i.test(normalizedRaw);
  const mentionsHue = /(?:huế|hue)/i.test(normalizedRaw);
  const mentionsLangCo = /(?:lăng cô|lang co)/i.test(normalizedRaw);
  const mentionsHaiVan = /(?:hải vân|hai van)/i.test(normalizedRaw);

  if (mentionsDaNang && mentionsHoiAn) {
    return { locationName: "Đà Nẵng - Hội An", routeSegment: "Đà Nẵng - Hội An" };
  }

  if (mentionsLangCo && mentionsDaNang && mentionsHaiVan) {
    return { locationName: "Đèo Hải Vân", routeSegment: "Lăng Cô - Đà Nẵng" };
  }

  if (mentionsHue && mentionsDaNang) {
    return { locationName: null, routeSegment: "Huế - Đà Nẵng" };
  }

  if (mentionsDaNang) return { locationName: "Đà Nẵng", routeSegment: null };
  if (mentionsHoiAn) return { locationName: "Hội An", routeSegment: null };
  if (mentionsHue) return { locationName: "Huế", routeSegment: null };

  return { locationName: null, routeSegment: null };
}

function containsUnsafeDraftFields(input: { title: string; locationName: string | null; routeSegment: string | null; summary: string; practicalDetails: Record<string, unknown>; tags: string[] }, rawText: string) {
  const strictValues = [input.title, input.locationName, input.routeSegment, input.summary, ...input.tags, ...Object.keys(input.practicalDetails)];
  const detailValues = flattenDetailEntries(input.practicalDetails);
  return containsUnsafeRawOverlap(strictValues, rawText, { allowContactValues: false }) || detailValues.some((detail) => containsUnsafeRawOverlap([detail.value], rawText, { allowContactValues: isPublicContactDetailKey(detail.key) }));
}

function flattenDetailEntries(details: Record<string, unknown>) {
  return Object.entries(details).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string").map((item) => ({ key, value: item })));
}

function containsUnsafeRawOverlap(values: Array<string | null>, rawText: string, options: { allowContactValues: boolean }) {
  const normalizedRaw = normalizeForOverlap(rawText);
  return values.some((value) => {
    if (!value) return false;
    const normalizedValue = normalizeForOverlap(value);
    return (!options.allowContactValues && containsSensitivePattern(normalizedValue)) || (normalizedValue.length >= 24 && normalizedRaw.includes(normalizedValue));
  });
}

function isPublicContactDetailKey(key: string) {
  return /contact|phone|tel|hotline|email|booking|reservation|zalo/i.test(key);
}

function containsSensitivePattern(value: string) {
  return /(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/.test(value) || /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/.test(value);
}

function normalizeForOverlap(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logRejectedModelOutput(sourceId: string, content: string, error: unknown) {
  if (process.env.APP_ENV !== "local" || process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT !== "true") {
    return;
  }

  console.warn("Knowledge extraction rejected model output", {
    sourceId,
    reason: error instanceof KnowledgeExtractionError ? error.safeDetail ?? error.code : "unknown",
    modelOutput: content,
  });
}
