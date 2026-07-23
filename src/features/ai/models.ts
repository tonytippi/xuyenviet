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
  pricingEffectiveAt: Date;
};

export type AiUsageTokenCounts = {
  promptTokens?: number | null;
  completionTokens?: number | null;
  cachedPromptTokens?: number | null;
  cacheWritePromptTokens?: number | null;
};

export type EstimatedAiUsageCost = {
  estimatedInputCostMicros: number | null;
  estimatedOutputCostMicros: number | null;
  estimatedCacheReadCostMicros: number | null;
  estimatedCacheWriteCostMicros: number | null;
  estimatedTotalCostMicros: number | null;
  pricingCurrency: string | null;
  inputTokenPriceMicros: number | null;
  outputTokenPriceMicros: number | null;
  cacheReadTokenPriceMicros: number | null;
  cacheWriteTokenPriceMicros: number | null;
  pricingUnitTokens: number | null;
  pricingVersion: string | null;
  pricingEffectiveAt: Date | null;
  costCalculationFailed: boolean;
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
  const conditions = [eq(aiGatewayModels.purpose, purpose), eq(aiGatewayModels.active, true), eq(aiGatewayModels.defaultForPurpose, true)];

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
    pricingEffectiveAt: model.pricingEffectiveAt,
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
  const cachedPromptTokens = normalizeRelatedTokenCount(tokens.cachedPromptTokens, promptTokens);
  const cacheWritePromptTokens = normalizeRelatedTokenCount(tokens.cacheWritePromptTokens, promptTokens);
  const billableInputTokens = promptTokens === null ? null : Math.max(promptTokens - (cachedPromptTokens ?? 0), 0);
  const estimatedInputCostMicros = calculateTokenCost(billableInputTokens, pricing.inputTokenPriceMicros, pricing.pricingUnitTokens);
  const estimatedOutputCostMicros = calculateTokenCost(completionTokens, pricing.outputTokenPriceMicros, pricing.pricingUnitTokens);
  const estimatedCacheReadCostMicros = calculateTokenCost(cachedPromptTokens, pricing.cacheReadTokenPriceMicros, pricing.pricingUnitTokens);
  const estimatedCacheWriteCostMicros = calculateTokenCost(cacheWritePromptTokens, pricing.cacheWriteTokenPriceMicros, pricing.pricingUnitTokens);
  const costInputs = [
    { tokens: billableInputTokens, cost: estimatedInputCostMicros },
    { tokens: completionTokens, cost: estimatedOutputCostMicros },
    { tokens: cachedPromptTokens, cost: estimatedCacheReadCostMicros },
    { tokens: cacheWritePromptTokens, cost: estimatedCacheWriteCostMicros },
  ];
  const estimatedTotalCostMicros = costInputs.some((input) => input.tokens !== null) && costInputs.every((input) => input.tokens === null || input.cost !== null)
    ? safeCostSum(costInputs.map((input) => input.cost ?? 0))
    : null;
  const costCalculationFailed = [
    [billableInputTokens, pricing.inputTokenPriceMicros],
    [completionTokens, pricing.outputTokenPriceMicros],
    [cachedPromptTokens, pricing.cacheReadTokenPriceMicros],
    [cacheWritePromptTokens, pricing.cacheWriteTokenPriceMicros],
  ].some(([tokens, price]) => isCostUnrepresentable(tokens as number | null, price as number | null, pricing.pricingUnitTokens))
    || (costInputs.some((input) => input.tokens !== null) && costInputs.every((input) => input.tokens === null || input.cost !== null) && estimatedTotalCostMicros === null);

  return {
    estimatedInputCostMicros,
    estimatedOutputCostMicros,
    estimatedCacheReadCostMicros,
    estimatedCacheWriteCostMicros,
    estimatedTotalCostMicros,
    pricingCurrency: pricing.pricingCurrency,
    inputTokenPriceMicros: pricing.inputTokenPriceMicros,
    outputTokenPriceMicros: pricing.outputTokenPriceMicros,
    cacheReadTokenPriceMicros: pricing.cacheReadTokenPriceMicros,
    cacheWriteTokenPriceMicros: pricing.cacheWriteTokenPriceMicros,
    pricingUnitTokens: pricing.pricingUnitTokens,
    pricingVersion: pricing.pricingVersion,
    pricingEffectiveAt: pricing.pricingEffectiveAt,
    costCalculationFailed,
  };
}

function calculateTokenCost(tokens: number | null | undefined, priceMicros: number | null, unitTokens: number) {
  if (tokens === null || tokens === undefined || priceMicros === null) {
    return null;
  }

  if (!Number.isSafeInteger(tokens) || !Number.isSafeInteger(priceMicros) || !Number.isSafeInteger(unitTokens) || unitTokens <= 0) {
    return null;
  }

  if (tokens > Number.MAX_SAFE_INTEGER / priceMicros) {
    return null;
  }

  const cost = Math.ceil((tokens * priceMicros) / unitTokens);
  return Number.isSafeInteger(cost) && cost <= 2_147_483_647 ? cost : null;
}

function normalizeTokenCount(tokens: number | null | undefined) {
  return typeof tokens === "number" && Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : null;
}

function normalizeRelatedTokenCount(tokens: number | null | undefined, upperBound: number | null) {
  const normalized = normalizeTokenCount(tokens);

  if (normalized === null || (upperBound !== null && normalized > upperBound)) {
    return null;
  }

  return normalized;
}

function emptyCostEstimate(): EstimatedAiUsageCost {
  return {
    estimatedInputCostMicros: null,
    estimatedOutputCostMicros: null,
    estimatedCacheReadCostMicros: null,
    estimatedCacheWriteCostMicros: null,
    estimatedTotalCostMicros: null,
    pricingCurrency: null,
    inputTokenPriceMicros: null,
    outputTokenPriceMicros: null,
    cacheReadTokenPriceMicros: null,
    cacheWriteTokenPriceMicros: null,
    pricingUnitTokens: null,
    pricingVersion: null,
    pricingEffectiveAt: null,
    costCalculationFailed: false,
  };
}

function safeCostSum(costs: number[]) {
  const total = costs.reduce((sum, cost) => sum + cost, 0);
  return Number.isSafeInteger(total) && total <= 2_147_483_647 ? total : null;
}

function isCostUnrepresentable(tokens: number | null, priceMicros: number | null, unitTokens: number) {
  if (tokens === null || priceMicros === null || !Number.isSafeInteger(tokens) || !Number.isSafeInteger(priceMicros) || !Number.isSafeInteger(unitTokens) || unitTokens <= 0) {
    return false;
  }

  return tokens > Number.MAX_SAFE_INTEGER / priceMicros || Math.ceil((tokens * priceMicros) / unitTokens) > 2_147_483_647;
}
