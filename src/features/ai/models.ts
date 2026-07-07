import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { aiGatewayModels, type AiGatewayModelPurpose } from "@/db/schema";

export type AiModelCapabilityRequirement = {
  textInput?: boolean;
  imageInput?: boolean;
  imageOutput?: boolean;
  embeddings?: boolean;
  extraction?: boolean;
  evaluation?: boolean;
  streaming?: boolean;
};

export type SelectedAiGatewayModel = typeof aiGatewayModels.$inferSelect;

export type AiGatewayPricingSnapshot = {
  aiGatewayModelId: string;
  pricingCurrency: string | null;
  inputTokenPriceMicros: number | null;
  outputTokenPriceMicros: number | null;
  cacheReadTokenPriceMicros: number | null;
  cacheWriteTokenPriceMicros: number | null;
  pricingUnitTokens: number;
  pricingVersion: string | null;
};

export type AiUsageTokenCounts = {
  promptTokens?: number | null;
  completionTokens?: number | null;
  cachedPromptTokens?: number | null;
};

export type EstimatedAiUsageCost = {
  estimatedInputCostMicros: number | null;
  estimatedOutputCostMicros: number | null;
  estimatedCacheReadCostMicros: number | null;
  estimatedCacheWriteCostMicros: number | null;
  estimatedTotalCostMicros: number | null;
  pricingCurrency: string | null;
  pricingUnitTokens: number | null;
  pricingVersion: string | null;
};

type AiModelDb = Pick<ReturnType<typeof getDb>, "select">;

export async function selectActiveAiGatewayModel({
  purpose,
  requiredCapabilities,
  db = getDb(),
}: {
  purpose: AiGatewayModelPurpose;
  requiredCapabilities: AiModelCapabilityRequirement;
  db?: AiModelDb;
}) {
  const conditions = [eq(aiGatewayModels.purpose, purpose), eq(aiGatewayModels.active, true)];

  if (requiredCapabilities.textInput) conditions.push(eq(aiGatewayModels.supportsTextInput, true));
  if (requiredCapabilities.imageInput) conditions.push(eq(aiGatewayModels.supportsImageInput, true));
  if (requiredCapabilities.imageOutput) conditions.push(eq(aiGatewayModels.supportsImageOutput, true));
  if (requiredCapabilities.embeddings) conditions.push(eq(aiGatewayModels.supportsEmbeddings, true));
  if (requiredCapabilities.extraction) conditions.push(eq(aiGatewayModels.supportsExtraction, true));
  if (requiredCapabilities.evaluation) conditions.push(eq(aiGatewayModels.supportsEvaluation, true));
  if (requiredCapabilities.streaming) conditions.push(eq(aiGatewayModels.supportsStreaming, true));

  const [model] = await db
    .select()
    .from(aiGatewayModels)
    .where(and(...conditions))
    .orderBy(desc(aiGatewayModels.defaultForPurpose), desc(aiGatewayModels.pricingEffectiveAt), asc(aiGatewayModels.gatewayModelName))
    .limit(1);

  return model ?? null;
}

export function getAiGatewayPricingSnapshot(model: SelectedAiGatewayModel): AiGatewayPricingSnapshot {
  return {
    aiGatewayModelId: model.id,
    pricingCurrency: model.pricingCurrency,
    inputTokenPriceMicros: model.inputTokenPriceMicros,
    outputTokenPriceMicros: model.outputTokenPriceMicros,
    cacheReadTokenPriceMicros: model.cacheReadTokenPriceMicros,
    cacheWriteTokenPriceMicros: model.cacheWriteTokenPriceMicros,
    pricingUnitTokens: model.pricingUnitTokens,
    pricingVersion: model.pricingVersion,
  };
}

export function estimateAiUsageCost(
  pricing: AiGatewayPricingSnapshot | null | undefined,
  tokens: AiUsageTokenCounts,
): EstimatedAiUsageCost {
  if (!pricing) {
    return emptyCostEstimate();
  }

  const promptTokens = normalizeTokenCount(tokens.promptTokens);
  const completionTokens = normalizeTokenCount(tokens.completionTokens);
  const cachedPromptTokens = normalizeTokenCount(tokens.cachedPromptTokens);
  const billableInputTokens = promptTokens === null ? null : Math.max(promptTokens - (cachedPromptTokens ?? 0), 0);
  const estimatedInputCostMicros = calculateTokenCost(billableInputTokens, pricing.inputTokenPriceMicros, pricing.pricingUnitTokens);
  const estimatedOutputCostMicros = calculateTokenCost(completionTokens, pricing.outputTokenPriceMicros, pricing.pricingUnitTokens);
  const estimatedCacheReadCostMicros = calculateTokenCost(cachedPromptTokens, pricing.cacheReadTokenPriceMicros, pricing.pricingUnitTokens);
  const estimatedCacheWriteCostMicros = calculateTokenCost(null, pricing.cacheWriteTokenPriceMicros, pricing.pricingUnitTokens);
  const totalParts = [estimatedInputCostMicros, estimatedOutputCostMicros, estimatedCacheReadCostMicros, estimatedCacheWriteCostMicros];
  const estimatedTotalCostMicros = totalParts.some((cost) => cost !== null)
    ? totalParts.reduce<number>((total, cost) => total + (cost ?? 0), 0)
    : null;

  return {
    estimatedInputCostMicros,
    estimatedOutputCostMicros,
    estimatedCacheReadCostMicros,
    estimatedCacheWriteCostMicros,
    estimatedTotalCostMicros,
    pricingCurrency: pricing.pricingCurrency,
    pricingUnitTokens: pricing.pricingUnitTokens,
    pricingVersion: pricing.pricingVersion,
  };
}

function calculateTokenCost(tokens: number | null | undefined, priceMicros: number | null, unitTokens: number) {
  if (tokens === null || tokens === undefined || priceMicros === null) {
    return null;
  }

  return Math.ceil((tokens * priceMicros) / unitTokens);
}

function normalizeTokenCount(tokens: number | null | undefined) {
  return typeof tokens === "number" && Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : null;
}

function emptyCostEstimate(): EstimatedAiUsageCost {
  return {
    estimatedInputCostMicros: null,
    estimatedOutputCostMicros: null,
    estimatedCacheReadCostMicros: null,
    estimatedCacheWriteCostMicros: null,
    estimatedTotalCostMicros: null,
    pricingCurrency: null,
    pricingUnitTokens: null,
    pricingVersion: null,
  };
}
