import "server-only";

import { aiUsageEvents, type AiUsageStatus } from "@/db/schema";

import { estimateAiUsageCost, type AiGatewayPricingSnapshot } from "@/features/ai/models";

type UsageEventDb = {
  insert: (table: typeof aiUsageEvents) => {
    values: (value: typeof aiUsageEvents.$inferInsert) => Promise<unknown>;
  };
};

export type WriteAiUsageEventInput = {
  userId: string;
  conversationId: string;
  userMessageId: string;
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
  const cost = estimateAiUsageCost(input.pricingSnapshot, {
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    cachedPromptTokens: input.cachedPromptTokens,
    cacheWritePromptTokens: input.cacheWritePromptTokens,
  });

  await db.insert(aiUsageEvents).values({
    userId: input.userId,
    conversationId: input.conversationId,
    userMessageId: input.userMessageId,
    assistantMessageId: input.assistantMessageId ?? null,
    purpose: input.purpose,
    provider: input.provider,
    model: input.model,
    aiGatewayModelId: input.aiGatewayModelId ?? input.pricingSnapshot?.aiGatewayModelId ?? null,
    promptVersion: input.promptVersion,
    status: input.status,
    latencyMs: input.latencyMs,
    promptTokens: normalizeDbInteger(input.promptTokens),
    completionTokens: normalizeDbInteger(input.completionTokens),
    totalTokens: normalizeDbInteger(input.totalTokens),
    cachedPromptTokens: normalizeDbInteger(input.cachedPromptTokens),
    cacheWritePromptTokens: normalizeDbInteger(input.cacheWritePromptTokens),
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

function normalizeDbInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
}
