import { aiUsageEvents, type AiUsageStatus } from "@/db/schema";

import { estimateAiUsageCost, type AiGatewayPricingSnapshot } from "@/features/ai/models";
export { aiUsageMechanisms, aiUsagePromptVersions, aiUsageProviders, aiUsagePurposes } from "@/features/usage/constants";

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
  providerRequestId?: string | null;
};

export async function writeAiUsageEvent(db: UsageEventDb, input: WriteAiUsageEventInput) {
  const id = crypto.randomUUID();
  const tokens = normalizeUsageTokens(input);
  const cost = estimateAiUsageCost(input.pricingSnapshot, {
    promptTokens: tokens.promptTokens,
    completionTokens: tokens.completionTokens,
    cachedPromptTokens: tokens.cachedPromptTokens,
    cacheWritePromptTokens: tokens.cacheWritePromptTokens,
  });

  await db.insert(aiUsageEvents).values({
    id,
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
    costStatus: cost.estimatedTotalCostMicros !== null ? "estimated" : cost.costCalculationFailed ? "missing_cost" : hasCompleteEffectivePricing(input.pricingSnapshot, tokens) ? "missing_usage" : "missing_pricing",
    errorCode: input.errorCode ?? null,
    providerRequestId: normalizeProviderRequestId(input.providerRequestId),
  });

  return id;
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

function hasCompleteEffectivePricing(pricing: AiGatewayPricingSnapshot | null | undefined, tokens: ReturnType<typeof normalizeUsageTokens>) {
  if (!pricing || !pricing.pricingCurrency?.trim() || !isValidPrice(pricing.inputTokenPriceMicros) || !isValidPrice(pricing.outputTokenPriceMicros) || !Number.isSafeInteger(pricing.pricingUnitTokens) || pricing.pricingUnitTokens <= 0) {
    return false;
  }

  return (tokens.cachedPromptTokens === null || isValidPrice(pricing.cacheReadTokenPriceMicros))
    && (tokens.cacheWritePromptTokens === null || isValidPrice(pricing.cacheWriteTokenPriceMicros));
}

function isValidPrice(value: number | null) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function normalizeProviderRequestId(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 && normalized.length <= 200 ? normalized : null;
}
