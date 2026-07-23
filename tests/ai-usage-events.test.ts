import { describe, expect, test } from "vitest";

import { aiUsageEvents } from "@/db/schema";
import { aiUsageMechanisms, aiUsagePromptVersions, aiUsageProviders, aiUsagePurposes, writeAiUsageEvent } from "@/features/usage/events";

function createUsageDb() {
  const rows: Array<typeof aiUsageEvents.$inferInsert> = [];

  return {
    rows,
    db: {
      insert: () => ({
        values: async (value: typeof aiUsageEvents.$inferInsert) => {
          rows.push(value);
        },
      }),
    },
  };
}

describe("AI usage events", () => {
  test("normalizes token metadata and stores calculable pricing snapshots", async () => {
    const { db, rows } = createUsageDb();

    await writeAiUsageEvent(db, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessageId: "message-1",
      assistantMessageId: "message-2",
      purpose: aiUsagePurposes.aiAskInitialAnswer,
      provider: "ai_gateway",
      model: "cx/gpt-5.5-test",
      promptVersion: aiUsagePromptVersions.aiAskInitialAnswer,
      status: "success",
      latencyMs: 123,
      promptTokens: 1_000,
      completionTokens: 500,
      totalTokens: 1_500,
      cachedPromptTokens: 200,
      cacheWritePromptTokens: 50,
      pricingSnapshot: {
        aiGatewayModelId: "model-1",
        pricingCurrency: "USD",
        inputTokenPriceMicros: 2_000_000,
        outputTokenPriceMicros: 4_000_000,
        cacheReadTokenPriceMicros: 500_000,
        cacheWriteTokenPriceMicros: 1_000_000,
        pricingUnitTokens: 1_000_000,
        pricingVersion: "v1",
        pricingEffectiveAt: new Date("2026-07-09T00:00:00.000Z"),
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "user-1",
      purpose: "ai_ask_initial_answer",
      provider: "ai_gateway",
      model: "cx/gpt-5.5-test",
      promptVersion: aiUsagePromptVersions.aiAskInitialAnswer,
      status: "success",
      promptTokens: 1_000,
      completionTokens: 500,
      cachedPromptTokens: 200,
      cacheWritePromptTokens: 50,
      aiGatewayModelId: "model-1",
      estimatedInputCostMicros: 1_600,
      estimatedOutputCostMicros: 2_000,
      estimatedCacheReadCostMicros: 100,
      estimatedCacheWriteCostMicros: 50,
      estimatedTotalCostMicros: 3_750,
      pricingCurrency: "USD",
      pricingVersion: "v1",
      costStatus: "estimated",
    });
  });

  test("keeps missing token, pricing, and cache pricing metadata nullable", async () => {
    const { db, rows } = createUsageDb();

    await writeAiUsageEvent(db, {
      userId: "user-1",
      purpose: aiUsagePurposes.extraction,
      provider: "ai_gateway",
      model: "cx/extract",
      promptVersion: aiUsagePromptVersions.chatContextExtraction,
      status: "failure",
      latencyMs: null,
      promptTokens: -1,
      completionTokens: 2.5,
      totalTokens: 3_000_000_000,
      cachedPromptTokens: 10,
      cacheWritePromptTokens: 20,
      pricingSnapshot: {
        aiGatewayModelId: "model-2",
        pricingCurrency: "USD",
        inputTokenPriceMicros: 1_000_000,
        outputTokenPriceMicros: null,
        cacheReadTokenPriceMicros: null,
        cacheWriteTokenPriceMicros: null,
        pricingUnitTokens: 1_000_000,
        pricingVersion: null,
        pricingEffectiveAt: new Date("2026-07-09T00:00:00.000Z"),
      },
      errorCode: "invalid_gateway_response",
    });

    expect(rows[0]).toMatchObject({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      cachedPromptTokens: 10,
      cacheWritePromptTokens: 20,
      estimatedInputCostMicros: null,
      estimatedOutputCostMicros: null,
      estimatedCacheReadCostMicros: null,
      estimatedCacheWriteCostMicros: null,
      estimatedTotalCostMicros: null,
      outputTokenPriceMicros: null,
      cacheReadTokenPriceMicros: null,
      cacheWriteTokenPriceMicros: null,
      errorCode: "invalid_gateway_response",
    });
  });

  test("drops impossible cache token metadata only when prompt token bounds are available", async () => {
    const { db, rows } = createUsageDb();

    await writeAiUsageEvent(db, {
      userId: "user-1",
      purpose: aiUsagePurposes.aiAskInitialAnswer,
      provider: "ai_gateway",
      model: "cx/gpt-5.5-test",
      promptVersion: aiUsagePromptVersions.aiAskInitialAnswer,
      status: "success",
      latencyMs: 100,
      promptTokens: 5,
      cachedPromptTokens: 6,
      cacheWritePromptTokens: 4,
    });

    expect(rows[0]).toMatchObject({
      promptTokens: 5,
      cachedPromptTokens: null,
      cacheWritePromptTokens: 4,
    });
  });

  test("calculates cache costs when cache token metadata exists without prompt token bounds", async () => {
    const { db, rows } = createUsageDb();

    await writeAiUsageEvent(db, {
      userId: "user-1",
      purpose: aiUsagePurposes.aiAskInitialAnswer,
      provider: "ai_gateway",
      model: "cx/gpt-5.5-test",
      promptVersion: aiUsagePromptVersions.aiAskInitialAnswer,
      status: "success",
      latencyMs: 100,
      promptTokens: null,
      cachedPromptTokens: 200,
      cacheWritePromptTokens: 50,
      pricingSnapshot: {
        aiGatewayModelId: "model-1",
        pricingCurrency: "USD",
        inputTokenPriceMicros: 2_000_000,
        outputTokenPriceMicros: 4_000_000,
        cacheReadTokenPriceMicros: 500_000,
        cacheWriteTokenPriceMicros: 1_000_000,
        pricingUnitTokens: 1_000_000,
        pricingVersion: "v1",
        pricingEffectiveAt: new Date("2026-07-09T00:00:00.000Z"),
      },
    });

    expect(rows[0]).toMatchObject({
      promptTokens: null,
      cachedPromptTokens: 200,
      cacheWritePromptTokens: 50,
      estimatedInputCostMicros: null,
      estimatedCacheReadCostMicros: 100,
      estimatedCacheWriteCostMicros: 50,
      estimatedTotalCostMicros: 150,
    });
  });

  test("records web-search provider usage without raw query, result, prompt, or answer fields", async () => {
    const { db, rows } = createUsageDb();

    await writeAiUsageEvent(db, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessageId: "message-1",
      purpose: aiUsagePurposes.webSearchFallback,
      provider: aiUsageProviders.tavily,
      model: aiUsageMechanisms.webSearch,
      promptVersion: aiUsagePromptVersions.webSearchFallback,
      status: "failure",
      latencyMs: 42,
      errorCode: "low_quality_results",
    });

    expect(rows[0]).toMatchObject({
      purpose: "web_search_fallback",
      provider: "tavily",
      model: "search",
      promptVersion: "web_search_fallback_v1",
      status: "failure",
      latencyMs: 42,
      errorCode: "low_quality_results",
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      estimatedTotalCostMicros: null,
    });
    expect(Object.keys(rows[0])).not.toEqual(expect.arrayContaining(["query", "results", "prompt", "answer", "content", "snippet", "rawProviderPayload"]));
  });

  test("records missing-pricing metadata without blocking a safe answer usage event", async () => {
    const { db, rows } = createUsageDb();

    await writeAiUsageEvent(db, {
      userId: "user-1",
      conversationId: "conversation-1",
      userMessageId: "message-1",
      purpose: aiUsagePurposes.aiAskInitialAnswer,
      provider: "ai_gateway",
      model: "cx/unpriced",
      aiGatewayModelId: "model-unpriced",
      promptVersion: aiUsagePromptVersions.aiAskInitialAnswer,
      status: "success",
      latencyMs: 42,
      promptTokens: 100,
      completionTokens: 20,
      pricingSnapshot: null,
    });

    expect(rows[0]).toMatchObject({ aiGatewayModelId: "model-unpriced", costStatus: "missing_pricing", estimatedTotalCostMicros: null });
  });

  test("records incomplete selected-model pricing as missing pricing when provider token usage is valid", async () => {
    const { db, rows } = createUsageDb();

    await writeAiUsageEvent(db, {
      userId: "user-1",
      purpose: aiUsagePurposes.aiAskInitialAnswer,
      provider: "ai_gateway",
      model: "cx/incomplete-pricing",
      aiGatewayModelId: "model-incomplete-pricing",
      promptVersion: aiUsagePromptVersions.aiAskInitialAnswer,
      status: "success",
      latencyMs: 42,
      promptTokens: 100,
      completionTokens: 20,
      pricingSnapshot: {
        aiGatewayModelId: "model-incomplete-pricing",
        pricingCurrency: "USD",
        inputTokenPriceMicros: 1_000_000,
        outputTokenPriceMicros: null,
        cacheReadTokenPriceMicros: null,
        cacheWriteTokenPriceMicros: null,
        pricingUnitTokens: 1_000_000,
        pricingVersion: "v1",
        pricingEffectiveAt: new Date("2026-07-09T00:00:00.000Z"),
      },
    });

    expect(rows[0]).toMatchObject({
      promptTokens: 100,
      completionTokens: 20,
      estimatedTotalCostMicros: null,
      costStatus: "missing_pricing",
    });
  });
});
