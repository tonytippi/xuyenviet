import "server-only";

import { aiUsageEvents, type AiUsageStatus } from "@/db/schema";

import { estimateAiUsageCost, type AiGatewayPricingSnapshot } from "@/features/ai/models";

export const aiUsagePurposes = {
  aiAskInitialAnswer: "ai_ask_initial_answer",
  extraction: "extraction",
  webSearchFallback: "web_search_fallback",
} as const;

export const aiUsagePromptVersions = {
  aiAskInitialAnswer: "ai_ask_initial_v8",
  chatContextExtraction: "chat_context_extraction_v3",
  sourceKnowledgeDraftExtraction: "source_knowledge_draft_extraction_v1",
  sourceKnowledgeSuggestion: "source_knowledge_suggestion_v1",
  webSearchFallback: "web_search_fallback_v1",
} as const;

export const aiUsageProviders = {
  tavily: "tavily",
} as const;

export const aiUsageMechanisms = {
  webSearch: "search",
} as const;

type UsageEventDb = {
  insert: (table: typeof aiUsageEvents) => {
    values: (value: typeof aiUsageEvents.$inferInsert) => Promise<unknown>;
  };
};

export type WriteAiUsageEventInput = {
  userId: string;
  conversationId?: string | null;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  purpose: string;
  provider: string;
  model: string;
  aiGatewayModelId?: string | null;
  promptVersion: string;
  status: AiUsageStatus;
  latencyMs: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  cachedPromptTokens?: number | null;
  cacheWritePromptTokens?: number | null;
  pricingSnapshot?: AiGatewayPricingSnapshot | null;
  errorCode?: string | null;
};

export async function writeAiUsageEvent(db: UsageEventDb, input: WriteAiUsageEventInput) {
  const tokens = normalizeUsageTokens(input);
  const cost = estimateAiUsageCost(input.pricingSnapshot, {
    promptTokens: tokens.promptTokens,
    completionTokens: tokens.completionTokens,
    cachedPromptTokens: tokens.cachedPromptTokens,
    cacheWritePromptTokens: tokens.cacheWritePromptTokens,
  });

  await db.insert(aiUsageEvents).values({
    userId: input.userId,
    conversationId: input.conversationId ?? null,
    userMessageId: input.userMessageId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
    purpose: input.purpose,
    provider: input.provider,
    model: input.model,
    aiGatewayModelId: input.aiGatewayModelId ?? input.pricingSnapshot?.aiGatewayModelId ?? null,
    promptVersion: input.promptVersion,
    status: input.status,
    latencyMs: input.latencyMs,
    promptTokens: tokens.promptTokens,
    completionTokens: tokens.completionTokens,
    totalTokens: tokens.totalTokens,
    cachedPromptTokens: tokens.cachedPromptTokens,
    cacheWritePromptTokens: tokens.cacheWritePromptTokens,
    estimatedInputCostMicros: cost.estimatedInputCostMicros,
    estimatedOutputCostMicros: cost.estimatedOutputCostMicros,
    estimatedCacheReadCostMicros: cost.estimatedCacheReadCostMicros,
    estimatedCacheWriteCostMicros: cost.estimatedCacheWriteCostMicros,
    estimatedTotalCostMicros: cost.estimatedTotalCostMicros,
    pricingCurrency: cost.pricingCurrency,
    inputTokenPriceMicros: cost.inputTokenPriceMicros,
    outputTokenPriceMicros: cost.outputTokenPriceMicros,
    cacheReadTokenPriceMicros: cost.cacheReadTokenPriceMicros,
    cacheWriteTokenPriceMicros: cost.cacheWriteTokenPriceMicros,
    pricingUnitTokens: cost.pricingUnitTokens,
    pricingVersion: cost.pricingVersion,
    pricingEffectiveAt: cost.pricingEffectiveAt,
    errorCode: input.errorCode ?? null,
  });
}

function normalizeUsageTokens(input: WriteAiUsageEventInput) {
  const promptTokens = normalizeDbInteger(input.promptTokens);
  const completionTokens = normalizeDbInteger(input.completionTokens);

  return {
    promptTokens,
    completionTokens,
    totalTokens: normalizeDbInteger(input.totalTokens),
    cachedPromptTokens: normalizeCacheTokenMetadata(input.cachedPromptTokens, promptTokens),
    cacheWritePromptTokens: normalizeCacheTokenMetadata(input.cacheWritePromptTokens, promptTokens),
  };
}

function normalizeDbInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
}

function normalizeCacheTokenMetadata(value: number | null | undefined, upperBound: number | null) {
  const normalized = normalizeDbInteger(value);

  if (normalized === null) {
    return null;
  }

  return upperBound === null || normalized <= upperBound ? normalized : null;
}
