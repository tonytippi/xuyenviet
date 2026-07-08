import "server-only";

import { and, eq, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  knowledgeCards,
  knowledgeCardSources,
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
import { requireAdminSession } from "@/server/auth";

const maxDraftsPerExtraction = 12;
const maxTitleLength = 160;
const maxLocationLength = 160;
const maxRouteSegmentLength = 160;
const maxSummaryLength = 1200;
const maxDetailStringLength = 500;
const maxTags = 12;
const maxTagLength = 40;

type ExtractionDb = ReturnType<typeof getDb>;
type ExtractionQueryDb = Pick<ExtractionDb, "select">;
type ExtractionLockDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

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
    public readonly code: "invalid_source" | "model_unavailable" | "unsupported_material" | "provider_failed" | "invalid_model_output" | "already_extracted",
  ) {
    super(message);
    this.name = "KnowledgeExtractionError";
  }
}

export function isKnowledgeExtractionError(error: unknown) {
  return error instanceof KnowledgeExtractionError || (error instanceof Error && error.name === "KnowledgeExtractionError");
}

export async function extractKnowledgeDraftsFromSource(sourceId: string): Promise<KnowledgeDraftExtractionResult> {
  const session = await requireAdminSession();
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
    const extraction = await db.transaction(async (transaction) => {
      await lockSourceExtraction(transaction, sourceBundle.source.id);

      if (await sourceAlreadyHasDrafts(transaction, sourceBundle.source.id)) {
        throw new KnowledgeExtractionError("Nguồn này đã có bản nháp cần duyệt. Vui lòng duyệt hoặc xử lý bản nháp hiện có trước khi trích xuất lại.", "already_extracted");
      }

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

      const drafts = parseDrafts(gatewayResult.content, sourceBundle.source, rawText);

      if (drafts.length === 0) {
        throw new KnowledgeExtractionError("AI không tìm thấy tri thức du lịch đủ rõ để tạo bản nháp.", "invalid_model_output");
      }

      const inserted = await transaction.insert(knowledgeCards).values(drafts.map((draft) => ({ ...draft, createdByUserId: session.userId, aiGatewayModelId: model.id }))).returning({ id: knowledgeCards.id });

      await transaction.insert(knowledgeCardSources).values(inserted.map((card) => ({ knowledgeCardId: card.id, sourceId: sourceBundle.source.id, supportLevel: "primary" as const })));

      await recordAuditEvent(
        {
          actor: session,
          operation: "create",
          targetType: "knowledge_draft_extraction",
          targetId: sourceBundle.source.id,
          afterSummary: `AI extraction created ${inserted.length} draft knowledge card(s) from one source.`,
        },
        transaction,
      );

      return {
        sourceId: sourceBundle.source.id,
        draftCount: inserted.length,
        draftIds: inserted.map((card) => card.id),
      };
    });

    if (providerUsage) {
      await writeUsageForProviderCall(db, session.userId, model, providerUsage);
    }

    return extraction;
  } catch (error) {
    if (providerUsage && error instanceof KnowledgeExtractionError) {
      await writeUsageForProviderCall(db, session.userId, model, providerUsage);
    }
    throw error;
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

async function sourceAlreadyHasDrafts(db: ExtractionQueryDb, sourceId: string) {
  const [existingLink] = await db
    .select({ sourceId: knowledgeCardSources.sourceId })
    .from(knowledgeCardSources)
    .innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSources.knowledgeCardId))
    .where(and(eq(knowledgeCardSources.sourceId, sourceId), or(eq(knowledgeCards.status, "draft"), eq(knowledgeCards.needsReview, true))))
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
    throw new KnowledgeExtractionError("AI trả về cấu trúc bản nháp không hợp lệ.", "invalid_model_output");
  }

  const drafts = draftValues.slice(0, maxDraftsPerExtraction).map((draft) => normalizeDraft(draft, source, rawText));

  if (drafts.some((draft) => draft === null)) {
    throw new KnowledgeExtractionError("AI trả về bản nháp không hợp lệ.", "invalid_model_output");
  }

  return drafts as DraftInsert[];
}

function normalizeDraft(value: unknown, source: typeof sources.$inferSelect, rawText: string): DraftInsert | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = normalizeEnum(value.type, knowledgeCardTypeValues);
  const title = normalizeBoundedString(value.title, maxTitleLength);
  const summary = normalizeBoundedString(value.summary, maxSummaryLength);
  const confidence = clampConfidence(normalizeEnum(value.confidence, knowledgeConfidenceValues), source);
  const freshnessSensitive = normalizeFreshnessSensitive(value.freshness_sensitive);

  if (!type || !title || !summary || !confidence || freshnessSensitive === null) {
    return null;
  }

  const locationName = normalizeBoundedString(value.location_name, maxLocationLength);
  const routeSegment = normalizeBoundedString(value.route_segment, maxRouteSegmentLength);

  if (!locationName && !routeSegment) {
    return null;
  }

  const practicalDetails = normalizePracticalDetails(value.practical_details);
  const tags = normalizeTags(value.tags);

  if (containsUnsafeRawOverlap([title, locationName, routeSegment, summary, ...flattenDetailValues(practicalDetails), ...tags], rawText)) {
    return null;
  }

  return {
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

  throw new KnowledgeExtractionError("AI trả về JSON không hợp lệ.", "invalid_model_output");
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

function normalizePracticalDetails(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const details: Record<string, unknown> = {};

  for (const [key, detailValue] of Object.entries(value).slice(0, 20)) {
    const safeKey = normalizeBoundedString(key, 60);
    const safeValue = normalizeDetailValue(detailValue);

    if (safeKey && safeValue !== null) {
      details[safeKey] = safeValue;
    }
  }

  return details;
}

function normalizeDetailValue(value: unknown): string | string[] | null {
  if (typeof value === "string") {
    return normalizeBoundedString(value, maxDetailStringLength);
  }

  if (Array.isArray(value)) {
    const values = value.map((item) => normalizeBoundedString(item, maxDetailStringLength)).filter((item): item is string => item !== null).slice(0, 10);
    return values.length > 0 ? values : null;
  }

  return null;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((tag) => normalizeBoundedString(tag, maxTagLength)).filter((tag): tag is string => tag !== null))).slice(0, maxTags);
}

function flattenDetailValues(details: Record<string, unknown>) {
  return Object.values(details).flatMap((value) => (Array.isArray(value) ? value : [value])).filter((value): value is string => typeof value === "string");
}

function containsUnsafeRawOverlap(values: Array<string | null>, rawText: string) {
  const normalizedRaw = normalizeForOverlap(rawText);
  return values.some((value) => {
    if (!value) return false;
    const normalizedValue = normalizeForOverlap(value);
    return containsSensitivePattern(normalizedValue) || (normalizedValue.length >= 24 && normalizedRaw.includes(normalizedValue));
  });
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
