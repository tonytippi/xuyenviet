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
  pricingSnapshot?: AiGatewayPricingSnapshot | null;
  errorCode?: string | null;
};

export async function writeAiUsageEvent(db: UsageEventDb, input: WriteAiUsageEventInput) {
  const cost = estimateAiUsageCost(input.pricingSnapshot, {
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    cachedPromptTokens: input.cachedPromptTokens,
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
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    totalTokens: input.totalTokens ?? null,
    cachedPromptTokens: input.cachedPromptTokens ?? null,
    estimatedInputCostMicros: cost.estimatedInputCostMicros,
    estimatedOutputCostMicros: cost.estimatedOutputCostMicros,
    estimatedCacheReadCostMicros: cost.estimatedCacheReadCostMicros,
    estimatedCacheWriteCostMicros: cost.estimatedCacheWriteCostMicros,
    estimatedTotalCostMicros: cost.estimatedTotalCostMicros,
    pricingCurrency: cost.pricingCurrency,
    pricingUnitTokens: cost.pricingUnitTokens,
    pricingVersion: cost.pricingVersion,
    errorCode: input.errorCode ?? null,
  });
}
