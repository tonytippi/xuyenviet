import "server-only";

import { and, desc, eq, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  knowledgeCards,
  knowledgeCardSources,
  knowledgeCardTypeValues,
  knowledgeConfidenceValues,
  knowledgeSourceSuggestions,
  rawSourceMaterial,
  sources,
  type AiUsageStatus,
  type KnowledgeConfidence,
  type KnowledgeSuggestionAction,
} from "@/db/schema";
import { completeExtraction } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel, type SelectedAiGatewayModel } from "@/features/ai/models";
import { buildSourceKnowledgeSuggestionMessages, sourceKnowledgeSuggestionPromptVersion, sourceKnowledgeSuggestionPurpose } from "@/features/ai/prompts";
import { recordAuditEvent } from "@/features/audit/events";
import { writeAiUsageEvent } from "@/features/usage/events";
import { requireAdminSession } from "@/server/auth";

const maxSuggestionsPerRun = 12;
const maxTitleLength = 160;
const maxLocationLength = 160;
const maxRouteSegmentLength = 160;
const maxSummaryLength = 1200;
const maxSuggestionSummaryLength = 1200;
const maxDetailStringLength = 500;
const maxTags = 12;
const maxTagLength = 40;
const suggestionActions = ["create", "update", "conflict", "duplicate", "no_action"] as const;
const emailLikePattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phoneLikePattern = /(?:\+?84|0)(?:[\s.-]?\d){8,10}/;
const sensitiveTokenPattern = /(provider[_-]?payload|storage[_-]?key|raw[_-]?metadata|raw[_-]?source)/i;

type SuggestionDb = ReturnType<typeof getDb>;
type SuggestionInsert = typeof knowledgeSourceSuggestions.$inferInsert;
type DraftInsert = Pick<
  typeof knowledgeCards.$inferInsert,
  "type" | "title" | "locationName" | "routeSegment" | "summary" | "practicalDetails" | "tags" | "confidence" | "freshnessSensitive" | "aiPromptVersion" | "createdByUserId" | "aiGatewayModelId"
>;

type NormalizedSuggestion = Pick<SuggestionInsert, "action" | "targetCardId" | "beforeSummary" | "afterSummary" | "conflictSummary" | "rationale"> & {
  draft: Omit<DraftInsert, "createdByUserId" | "aiGatewayModelId"> | null;
};

export type KnowledgeSourceSuggestionResult = {
  sourceId: string;
  suggestionCount: number;
  draftIds: string[];
  actions: KnowledgeSuggestionAction[];
};

export class KnowledgeSuggestionError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_source" | "unsupported_material" | "model_unavailable" | "provider_failed" | "invalid_model_output" | "already_suggested",
  ) {
    super(message);
    this.name = "KnowledgeSuggestionError";
  }
}

export function isKnowledgeSuggestionError(error: unknown) {
  return error instanceof KnowledgeSuggestionError || (error instanceof Error && error.name === "KnowledgeSuggestionError");
}

export async function suggestKnowledgeFromSourceUrl(sourceId: string): Promise<KnowledgeSourceSuggestionResult> {
  const session = await requireAdminSession();
  const normalizedSourceId = sourceId.trim();
  let providerUsage: Parameters<typeof writeUsageForProviderCall>[3] | null = null;

  if (!normalizedSourceId) {
    throw new KnowledgeSuggestionError("Không tìm thấy nguồn URL cần phân tích.", "invalid_source");
  }

  const db = getDb();
  const sourceBundle = await loadSourceBundle(db, normalizedSourceId);

  if (!sourceBundle) {
    throw new KnowledgeSuggestionError("Không tìm thấy nguồn URL cần phân tích.", "invalid_source");
  }

  if (sourceBundle.source.kind !== "url") {
    throw new KnowledgeSuggestionError("Story 4.4 chỉ hỗ trợ nguồn URL có văn bản đọc được.", "unsupported_material");
  }

  if (!sourceBundle.raw.rawText?.trim()) {
    throw new KnowledgeSuggestionError("Nguồn URL này chưa có văn bản đọc được. Vui lòng nạp nội dung trước khi chạy gợi ý.", "unsupported_material");
  }
  const rawText = sourceBundle.raw.rawText;
  const rawLeakCorpus = [rawText, ...flattenMetadataStrings(sourceBundle.raw.rawMetadata)];

  const model = await selectActiveAiGatewayModel({
    purpose: sourceKnowledgeSuggestionPurpose,
    requiredCapabilities: { textInput: true, extraction: true },
    db,
  });

  if (!model) {
    throw new KnowledgeSuggestionError("Chưa có model AI extraction đang hoạt động.", "model_unavailable");
  }

  const candidates = await loadSafeCandidates(db);

  try {
    const result = await db.transaction(async (transaction) => {
      await lockSourceSuggestion(transaction, sourceBundle.source.id);

      if (await sourceAlreadyHasSuggestions(transaction, sourceBundle.source.id)) {
        throw new KnowledgeSuggestionError("Nguồn này đã có gợi ý cần xử lý. Vui lòng duyệt kết quả hiện có trước khi chạy lại.", "already_suggested");
      }

      const gatewayResult = await completeExtraction({
        model: model.gatewayModelName,
        messages: buildSourceKnowledgeSuggestionMessages({
          source: {
            kind: sourceBundle.source.kind,
            label: sourceBundle.source.label,
            publisher: sourceBundle.source.publisher,
            collectedDate: sourceBundle.source.collectedDate,
            sourceType: sourceBundle.source.sourceType,
            verificationStatus: sourceBundle.source.verificationStatus,
            official: sourceBundle.source.official,
            partner: sourceBundle.source.partner,
            canonicalUrl: sourceBundle.source.canonicalUrl,
          },
          rawText,
          candidates,
        }),
      });

      if (!gatewayResult.ok) {
        providerUsage = { status: "failure" as const, provider: gatewayResult.provider ?? "unknown", model: gatewayResult.model ?? model.gatewayModelName, latencyMs: gatewayResult.latencyMs, errorCode: gatewayResult.errorCode };
        throw new KnowledgeSuggestionError("AI chưa tạo được gợi ý từ URL này. Vui lòng thử lại sau.", "provider_failed");
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

      const suggestions = parseSuggestions(gatewayResult.content, sourceBundle.source, rawLeakCorpus, candidates.map((candidate) => candidate.id));

      if (suggestions.length === 0) {
        throw new KnowledgeSuggestionError("AI không trả về gợi ý hợp lệ cho nguồn URL này.", "invalid_model_output");
      }

      const draftIds: string[] = [];
      const actions: KnowledgeSuggestionAction[] = [];

      for (const suggestion of suggestions) {
        let suggestedCardId: string | null = null;

        if (suggestion.targetCardId) {
          await assertCurrentTargetCard(transaction, suggestion.targetCardId);
        }

        if (suggestion.draft) {
          const [card] = await transaction
            .insert(knowledgeCards)
            .values({ ...suggestion.draft, createdByUserId: session.userId, aiGatewayModelId: model.id })
            .returning({ id: knowledgeCards.id });

          suggestedCardId = card.id;
          draftIds.push(card.id);
          await transaction.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: sourceBundle.source.id, supportLevel: "primary" });
        }

        await transaction.insert(knowledgeSourceSuggestions).values({
          sourceId: sourceBundle.source.id,
          suggestedCardId,
          action: suggestion.action,
          targetCardId: suggestion.targetCardId,
          beforeSummary: suggestion.beforeSummary,
          afterSummary: suggestion.afterSummary,
          conflictSummary: suggestion.conflictSummary,
          rationale: suggestion.rationale,
          aiPromptVersion: sourceKnowledgeSuggestionPromptVersion,
          aiGatewayModelId: model.id,
          createdByUserId: session.userId,
        });
        actions.push(suggestion.action);
      }

      await recordAuditEvent(
        {
          actor: session,
          operation: "create",
          targetType: "knowledge_source_suggestion",
          targetId: sourceBundle.source.id,
          afterSummary: `AI suggestion run created ${suggestions.length} review trace(s); actions=${actions.join(",")}; draftCards=${draftIds.length}.`,
        },
        transaction,
      );

      return { sourceId: sourceBundle.source.id, suggestionCount: suggestions.length, draftIds, actions };
    });

    if (providerUsage) {
      await writeUsageBestEffort(db, session.userId, model, providerUsage);
    }

    return result;
  } catch (error) {
    if (providerUsage) {
      await writeUsageBestEffort(db, session.userId, model, providerUsage);
    }
    throw error;
  }
}

export async function listKnowledgeSourceSuggestionTraces(sourceId: string) {
  await requireAdminSession();
  const normalizedSourceId = sourceId.trim();

  if (!normalizedSourceId) {
    return [];
  }

  return getDb()
    .select({
      id: knowledgeSourceSuggestions.id,
      action: knowledgeSourceSuggestions.action,
      targetCardId: knowledgeSourceSuggestions.targetCardId,
      beforeSummary: knowledgeSourceSuggestions.beforeSummary,
      afterSummary: knowledgeSourceSuggestions.afterSummary,
      conflictSummary: knowledgeSourceSuggestions.conflictSummary,
      rationale: knowledgeSourceSuggestions.rationale,
      suggestedCardId: knowledgeSourceSuggestions.suggestedCardId,
      createdAt: knowledgeSourceSuggestions.createdAt,
    })
    .from(knowledgeSourceSuggestions)
    .where(eq(knowledgeSourceSuggestions.sourceId, normalizedSourceId))
    .orderBy(desc(knowledgeSourceSuggestions.createdAt));
}

async function loadSourceBundle(db: SuggestionDb, sourceId: string) {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) return null;
  const [raw] = await db.select().from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, source.id)).limit(1);
  return raw ? { source, raw } : null;
}

async function loadSafeCandidates(db: Pick<SuggestionDb, "select">) {
  return db
    .select({
      id: knowledgeCards.id,
      status: knowledgeCards.status,
      type: knowledgeCards.type,
      title: knowledgeCards.title,
      locationName: knowledgeCards.locationName,
      routeSegment: knowledgeCards.routeSegment,
      summary: knowledgeCards.summary,
      confidence: knowledgeCards.confidence,
      freshnessSensitive: knowledgeCards.freshnessSensitive,
      tags: knowledgeCards.tags,
    })
    .from(knowledgeCards)
    .where(or(eq(knowledgeCards.status, "draft"), eq(knowledgeCards.status, "approved")))
    .orderBy(desc(knowledgeCards.updatedAt));
}

async function sourceAlreadyHasSuggestions(db: Pick<SuggestionDb, "select">, sourceId: string) {
  const [suggestion] = await db
    .select({ id: knowledgeSourceSuggestions.id })
    .from(knowledgeSourceSuggestions)
    .where(and(eq(knowledgeSourceSuggestions.sourceId, sourceId), or(eq(knowledgeSourceSuggestions.action, "create"), eq(knowledgeSourceSuggestions.action, "update"), eq(knowledgeSourceSuggestions.action, "conflict"))))
    .limit(1);
  return Boolean(suggestion);
}

async function lockSourceSuggestion(db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }, sourceId: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sourceId}, 42))`);
}

async function assertCurrentTargetCard(db: Pick<SuggestionDb, "select">, targetCardId: string) {
  const [target] = await db
    .select({ id: knowledgeCards.id })
    .from(knowledgeCards)
    .where(and(eq(knowledgeCards.id, targetCardId), or(eq(knowledgeCards.status, "draft"), eq(knowledgeCards.status, "approved"))))
    .limit(1);

  if (!target) {
    throw new KnowledgeSuggestionError("Thẻ mục tiêu của gợi ý không còn hợp lệ.", "invalid_model_output");
  }
}

async function writeUsageBestEffort(db: Pick<SuggestionDb, "insert">, userId: string, model: SelectedAiGatewayModel, event: Parameters<typeof writeUsageForProviderCall>[3]) {
  try {
    await writeUsageForProviderCall(db, userId, model, event);
  } catch {
    // The provider call already produced durable suggestions; do not surface a false failure to the operator.
  }
}

async function writeUsageForProviderCall(
  db: Pick<SuggestionDb, "insert">,
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
    purpose: sourceKnowledgeSuggestionPurpose,
    provider: event.provider,
    model: event.model,
    aiGatewayModelId: model.id,
    promptVersion: sourceKnowledgeSuggestionPromptVersion,
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

function parseSuggestions(content: string, source: typeof sources.$inferSelect, rawLeakCorpus: string[], candidateIds: string[]): NormalizedSuggestion[] {
  const payload = parseJsonObject(content);
  const values = Array.isArray(payload.suggestions) ? payload.suggestions : null;
  if (!values) throw new KnowledgeSuggestionError("AI trả về cấu trúc gợi ý không hợp lệ.", "invalid_model_output");
  if (values.length > maxSuggestionsPerRun) throw new KnowledgeSuggestionError("AI trả về quá nhiều gợi ý cho một lần chạy.", "invalid_model_output");

  const suggestions = values.map((value) => normalizeSuggestion(value, source, rawLeakCorpus, candidateIds));
  if (suggestions.some((suggestion) => suggestion === null)) throw new KnowledgeSuggestionError("AI trả về gợi ý không hợp lệ.", "invalid_model_output");
  return suggestions as NormalizedSuggestion[];
}

function normalizeSuggestion(value: unknown, source: typeof sources.$inferSelect, rawLeakCorpus: string[], candidateIds: string[]): NormalizedSuggestion | null {
  if (!isRecord(value)) return null;

  const action = normalizeEnum(value.action, suggestionActions);
  if (!action) return null;

  const targetCardId = action === "update" || action === "conflict" || action === "duplicate" ? normalizeOptionalTargetId(value.target_card_id, candidateIds) : null;
  const beforeSummary = normalizeOptionalSafeSummary(value.before_summary, rawLeakCorpus);
  const afterSummary = normalizeOptionalSafeSummary(value.after_summary, rawLeakCorpus);
  const conflictSummary = normalizeOptionalSafeSummary(value.conflict_summary, rawLeakCorpus);
  const rationale = normalizeOptionalSafeSummary(value.rationale, rawLeakCorpus);

  if ((action === "update" || action === "conflict" || action === "duplicate") && !targetCardId) return null;
  if (action === "update" && (!beforeSummary || !afterSummary)) return null;
  if (action === "conflict" && !conflictSummary) return null;
  if ((action === "create" || action === "update" || action === "conflict") && !isRecord(value.draft)) return null;

  const draft = action === "create" || action === "update" || action === "conflict" ? normalizeDraft(value.draft, source, rawLeakCorpus) : null;
  if ((action === "create" || action === "update" || action === "conflict") && !draft) return null;

  return { action, targetCardId, beforeSummary, afterSummary, conflictSummary, rationale, draft };
}

function normalizeDraft(value: unknown, source: typeof sources.$inferSelect, rawLeakCorpus: string[]): Omit<DraftInsert, "createdByUserId" | "aiGatewayModelId"> | null {
  if (!isRecord(value)) return null;
  const type = normalizeEnum(value.type, knowledgeCardTypeValues);
  const title = normalizeBoundedString(value.title, maxTitleLength);
  const summary = normalizeBoundedString(value.summary, maxSummaryLength);
  const confidence = clampConfidence(normalizeEnum(value.confidence, knowledgeConfidenceValues), source);
  const freshnessSensitive = typeof value.freshness_sensitive === "boolean" ? value.freshness_sensitive : null;
  const locationName = normalizeOptionalBoundedString(value.location_name, maxLocationLength);
  const routeSegment = normalizeOptionalBoundedString(value.route_segment, maxRouteSegmentLength);
  const practicalDetails = normalizePracticalDetails(value.practical_details);
  const tags = normalizeTags(value.tags);

  if (!type || !title || !summary || !confidence || freshnessSensitive === null || (!locationName && !routeSegment)) return null;
  rejectUnsafeSafeFields([title, locationName, routeSegment, summary, ...Object.keys(practicalDetails), ...flattenDetailStrings(practicalDetails), ...tags].filter((item): item is string => Boolean(item)), rawLeakCorpus);

  return { type, title, locationName, routeSegment, summary, practicalDetails, tags, confidence, freshnessSensitive, aiPromptVersion: sourceKnowledgeSuggestionPromptVersion };
}

function parseJsonObject(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (isRecord(parsed)) return parsed;
  } catch {
    // Fall through to safe operational error.
  }
  throw new KnowledgeSuggestionError("AI trả về JSON không hợp lệ.", "invalid_model_output");
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function normalizeOptionalTargetId(value: unknown, candidateIds: string[]) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && candidateIds.includes(value) ? value : null;
}

function normalizeOptionalSafeSummary(value: unknown, rawLeakCorpus: string[]) {
  if (value === null || value === undefined || value === "") return null;
  const summary = normalizeBoundedString(value, maxSuggestionSummaryLength);
  if (!summary) return null;
  rejectUnsafeSafeFields([summary], rawLeakCorpus);
  return summary;
}

function clampConfidence(confidence: KnowledgeConfidence | null, source: typeof sources.$inferSelect): KnowledgeConfidence | null {
  if (!confidence) return null;
  if (source.official && confidence === "official") return "official";
  if (source.partner && (confidence === "partner" || confidence === "official")) return "partner";
  if (source.sourceType === "community") return confidence === "community" ? "community" : "unverified";
  if (source.verificationStatus === "unverified") return "unverified";
  if (confidence === "official" || confidence === "partner") return "curated";
  return confidence;
}

function normalizeBoundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function normalizeOptionalBoundedString(value: unknown, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  return normalizeBoundedString(value, maxLength);
}

function normalizePracticalDetails(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const details: Record<string, unknown> = {};
  for (const [key, detailValue] of Object.entries(value).slice(0, 20)) {
    const safeKey = normalizeBoundedString(key, 60);
    const safeValue = normalizeDetailValue(detailValue);
    if (safeKey && safeValue !== null) details[safeKey] = safeValue;
  }
  return details;
}

function normalizeDetailValue(value: unknown): string | string[] | null {
  if (typeof value === "string") return normalizeBoundedString(value, maxDetailStringLength);
  if (Array.isArray(value)) {
    const values = value.map((item) => normalizeBoundedString(item, maxDetailStringLength)).filter((item): item is string => item !== null).slice(0, 10);
    return values.length > 0 ? values : null;
  }
  return null;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((tag) => normalizeBoundedString(tag, maxTagLength)).filter((tag): tag is string => tag !== null))).slice(0, maxTags);
}

function rejectUnsafeSafeFields(values: string[], rawTexts: string[]) {
  const normalizedRawValues = rawTexts.map(normalizeForOverlap).filter(Boolean);
  const rawCorpus = normalizedRawValues.join(" ");
  const rawSnippets = normalizedRawValues.flatMap(buildRawOverlapSnippets);
  for (const value of values) {
    if (emailLikePattern.test(value) || phoneLikePattern.test(value) || sensitiveTokenPattern.test(value)) throw new KnowledgeSuggestionError("Gợi ý AI chứa dữ liệu không an toàn.", "invalid_model_output");
    const normalized = normalizeForOverlap(value);
    if (normalizedRawValues.includes(normalized) || (normalized.length >= 24 && rawCorpus.includes(normalized)) || rawSnippets.some((snippet) => normalized.includes(snippet))) {
      throw new KnowledgeSuggestionError("Gợi ý AI sao chép nguyên văn nội dung nguồn thô.", "invalid_model_output");
    }
  }
}

function buildRawOverlapSnippets(normalizedRawText: string) {
  const snippets = normalizedRawText
    .split(/(?<=[.!?。！？])\s+|[\n\r]+/)
    .map((snippet) => snippet.trim())
    .filter((snippet) => snippet.length >= 24 && snippet.length <= maxSuggestionSummaryLength);
  const words = normalizedRawText.split(" ").filter(Boolean);
  for (let index = 0; index <= words.length - 8; index += 1) {
    const snippet = words.slice(index, index + 8).join(" ");
    if (snippet.length >= 24) snippets.push(snippet);
  }
  return Array.from(new Set(snippets));
}

function flattenDetailStrings(details: Record<string, unknown>) {
  return Object.values(details).flatMap((value) => (Array.isArray(value) ? value : [value])).filter((value): value is string => typeof value === "string");
}

function flattenMetadataStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenMetadataStrings);
  if (isRecord(value)) return Object.entries(value).flatMap(([key, metadataValue]) => [key, ...flattenMetadataStrings(metadataValue)]);
  return [];
}

function normalizeForOverlap(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
