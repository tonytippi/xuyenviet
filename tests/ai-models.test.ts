import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, auditEvents, userRoles, users, type UserRole } from "@/db/schema";

import { testDb } from "./helpers/db";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

async function createUser(userId: string, roles: UserRole[] = []) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });

  if (roles.length > 0) {
    await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
  }
}

async function createModel(values: Partial<typeof aiGatewayModels.$inferInsert> = {}) {
  const [model] = await testDb
    .insert(aiGatewayModels)
    .values({
      id: values.id ?? `model-${crypto.randomUUID()}`,
      gatewayModelName: values.gatewayModelName ?? "cx/test-model",
      displayLabel: values.displayLabel ?? "Test model",
      purpose: values.purpose ?? "ai_ask_initial_answer",
      active: values.active ?? true,
      defaultForPurpose: values.defaultForPurpose ?? false,
      supportsTextInput: values.supportsTextInput ?? true,
      supportsImageInput: values.supportsImageInput ?? false,
      supportsImageOutput: values.supportsImageOutput ?? false,
      supportsEmbeddings: values.supportsEmbeddings ?? false,
      supportsExtraction: values.supportsExtraction ?? false,
      supportsEvaluation: values.supportsEvaluation ?? false,
      supportsStreaming: values.supportsStreaming ?? false,
      supportsCachePricing: values.supportsCachePricing ?? false,
      pricingCurrency: values.pricingCurrency === undefined ? "USD" : values.pricingCurrency,
      inputTokenPriceMicros: values.inputTokenPriceMicros === undefined ? 1_000_000 : values.inputTokenPriceMicros,
      outputTokenPriceMicros: values.outputTokenPriceMicros === undefined ? 3_000_000 : values.outputTokenPriceMicros,
      cacheReadTokenPriceMicros: values.cacheReadTokenPriceMicros ?? null,
      cacheWriteTokenPriceMicros: values.cacheWriteTokenPriceMicros ?? null,
      pricingUnitTokens: values.pricingUnitTokens ?? 1_000_000,
      pricingVersion: values.pricingVersion ?? "test-v1",
      pricingEffectiveAt: values.pricingEffectiveAt ?? new Date("2026-07-07T00:00:00.000Z"),
    })
    .returning();

  return model;
}

describe("AI Gateway model catalog", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test("selects the active default model constrained by purpose and capabilities", async () => {
    await createModel({ id: "inactive", gatewayModelName: "cx/inactive", active: false, defaultForPurpose: false });
    await createModel({ id: "wrong-purpose", gatewayModelName: "cx/extract", purpose: "extraction", supportsExtraction: true, defaultForPurpose: true });
    await createModel({ id: "non-default", gatewayModelName: "cx/non-default", defaultForPurpose: false, supportsImageInput: true });
    await createModel({ id: "image", gatewayModelName: "cx/image", defaultForPurpose: true, supportsImageInput: true });
    const { selectActiveAiGatewayModel } = await import("@/features/ai/models");

    await expect(
      selectActiveAiGatewayModel({ purpose: "ai_ask_initial_answer", requiredCapabilities: { textInput: true, imageInput: true } }),
    ).resolves.toMatchObject({ id: "image", gatewayModelName: "cx/image" });
  });

  test("does not silently fall back to a non-default capable model", async () => {
    await createModel({ id: "text-default", gatewayModelName: "cx/text-default", defaultForPurpose: true, supportsImageInput: false });
    await createModel({ id: "image-non-default", gatewayModelName: "cx/image-non-default", defaultForPurpose: false, supportsImageInput: true });
    const { selectActiveAiGatewayModel } = await import("@/features/ai/models");

    await expect(
      selectActiveAiGatewayModel({ purpose: "ai_ask_initial_answer", requiredCapabilities: { textInput: true, imageInput: true } }),
    ).resolves.toBeNull();
  });

  test("returns null before provider calls when no capable model exists", async () => {
    await createModel({ id: "text-only", gatewayModelName: "cx/text-only", supportsImageInput: false });
    const { selectActiveAiGatewayModel } = await import("@/features/ai/models");

    await expect(
      selectActiveAiGatewayModel({ purpose: "ai_ask_initial_answer", requiredCapabilities: { textInput: true, imageInput: true } }),
    ).resolves.toBeNull();
  });

  test("estimates token cost with integer micro-units and snapshots pricing metadata", async () => {
    const model = await createModel({
      id: "priced",
      inputTokenPriceMicros: 2_000_000,
      outputTokenPriceMicros: 6_000_000,
      cacheReadTokenPriceMicros: 500_000,
      cacheWriteTokenPriceMicros: 250_000,
      pricingVersion: "priced-v1",
    });
    const { estimateAiUsageCost, getAiGatewayPricingSnapshot } = await import("@/features/ai/models");

    expect(
      estimateAiUsageCost(getAiGatewayPricingSnapshot(model), {
        promptTokens: 1_500,
        completionTokens: 750,
        cachedPromptTokens: 200,
        cacheWritePromptTokens: 100,
      }),
    ).toMatchObject({
      estimatedInputCostMicros: 2_600,
      estimatedOutputCostMicros: 4_500,
      estimatedCacheReadCostMicros: 100,
      estimatedCacheWriteCostMicros: 25,
      estimatedTotalCostMicros: 7_225,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 2_000_000,
      outputTokenPriceMicros: 6_000_000,
      cacheReadTokenPriceMicros: 500_000,
      cacheWriteTokenPriceMicros: 250_000,
      pricingUnitTokens: 1_000_000,
      pricingVersion: "priced-v1",
      pricingEffectiveAt: new Date("2026-07-07T00:00:00.000Z"),
    });
  });

  test("keeps total cost nullable when a present token component lacks pricing", async () => {
    const model = await createModel({ id: "partial-price", cacheReadTokenPriceMicros: null });
    const { estimateAiUsageCost, getAiGatewayPricingSnapshot } = await import("@/features/ai/models");

    expect(estimateAiUsageCost(getAiGatewayPricingSnapshot(model), { promptTokens: 100, completionTokens: 10, cachedPromptTokens: 20 })).toMatchObject({
      estimatedInputCostMicros: 80,
      estimatedOutputCostMicros: 30,
      estimatedCacheReadCostMicros: null,
      estimatedTotalCostMicros: null,
    });
  });

  test("ignores impossible cached token counts", async () => {
    const model = await createModel({ id: "cached-overflow", cacheReadTokenPriceMicros: 500_000 });
    const { estimateAiUsageCost, getAiGatewayPricingSnapshot } = await import("@/features/ai/models");

    expect(estimateAiUsageCost(getAiGatewayPricingSnapshot(model), { promptTokens: 100, completionTokens: 10, cachedPromptTokens: 120 })).toMatchObject({
      estimatedInputCostMicros: 100,
      estimatedOutputCostMicros: 30,
      estimatedCacheReadCostMicros: null,
      estimatedTotalCostMicros: 130,
    });
  });

  test("keeps cost nullable when tokens or pricing are missing", async () => {
    const model = await createModel({ id: "unpriced", inputTokenPriceMicros: null, outputTokenPriceMicros: null, pricingCurrency: null });
    const { estimateAiUsageCost, getAiGatewayPricingSnapshot } = await import("@/features/ai/models");

    expect(estimateAiUsageCost(getAiGatewayPricingSnapshot(model), { promptTokens: 100, completionTokens: null })).toMatchObject({
      estimatedInputCostMicros: null,
      estimatedOutputCostMicros: null,
      estimatedTotalCostMicros: null,
      pricingCurrency: null,
    });
  });

  test("database rejects invalid model catalog constraints", async () => {
    await expect(
      testDb.execute(sql`insert into ai_gateway_models (id, gateway_model_name, display_label, purpose, pricing_unit_tokens) values ('bad', 'cx/bad', 'Bad', 'ai_ask_initial_answer', 0)`),
    ).rejects.toThrow();

    await expect(
      testDb.execute(sql`insert into ai_gateway_models (id, gateway_model_name, display_label, purpose, input_token_price_micros) values ('bad-price', 'cx/bad-price', 'Bad', 'ai_ask_initial_answer', -1)`),
    ).rejects.toThrow();

    await expect(
      testDb.execute(sql`insert into ai_gateway_models (id, gateway_model_name, display_label, purpose, active, default_for_purpose) values ('inactive-default', 'cx/inactive-default', 'Inactive default', 'ai_ask_initial_answer', false, true)`),
    ).rejects.toThrow();

    await expect(
      testDb.execute(sql`insert into ai_gateway_models (id, gateway_model_name, display_label, purpose, pricing_currency, input_token_price_micros) values ('priced-no-currency', 'cx/priced-no-currency', 'Priced without currency', 'ai_ask_initial_answer', null, 1)`),
    ).rejects.toThrow();
  });

  test("database rejects multiple defaults for the same purpose", async () => {
    await createModel({ id: "default-1", gatewayModelName: "cx/default-1", defaultForPurpose: true });

    await expect(createModel({ id: "default-2", gatewayModelName: "cx/default-2", defaultForPurpose: true })).rejects.toThrow();
  });

  test("admin/operator actions create, set default, archive, and audit catalog mutations", async () => {
    await createUser("operator-user", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const { archiveAiGatewayModel, createAiGatewayModel, setDefaultAiGatewayModel } = await import("@/features/admin/actions");

    const created = await createAiGatewayModel({
      gatewayModelName: "cx/admin-model",
      displayLabel: "Admin model",
      purpose: "ai_ask_initial_answer",
      defaultForPurpose: true,
      supportsTextInput: true,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 1,
      outputTokenPriceMicros: 2,
    });
    await setDefaultAiGatewayModel(created.id);
    await archiveAiGatewayModel(created.id);

    await expect(testDb.select().from(aiGatewayModels).where(eq(aiGatewayModels.id, created.id))).resolves.toMatchObject([
      { active: false, defaultForPurpose: false },
    ]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.actorUserId, "operator-user"))).resolves.toHaveLength(3);
  });

  test("admin update preserves default invariants across purpose and active changes", async () => {
    await createUser("admin-user", ["admin"]);
    authMock.mockResolvedValue({ user: { id: "admin-user", email: "admin-user@example.com" } });
    const existingEvaluationDefault = await createModel({ id: "eval-default", gatewayModelName: "cx/eval-default", purpose: "evaluation", supportsEvaluation: true, defaultForPurpose: true });
    const chatDefault = await createModel({ id: "chat-default", gatewayModelName: "cx/chat-default", defaultForPurpose: true });
    const { updateAiGatewayModel } = await import("@/features/admin/actions");

    await updateAiGatewayModel(chatDefault.id, { purpose: "evaluation", supportsEvaluation: true });

    await expect(testDb.select().from(aiGatewayModels).where(eq(aiGatewayModels.id, existingEvaluationDefault.id))).resolves.toMatchObject([
      { defaultForPurpose: false },
    ]);
    await expect(testDb.select().from(aiGatewayModels).where(eq(aiGatewayModels.id, chatDefault.id))).resolves.toMatchObject([
      { purpose: "evaluation", defaultForPurpose: true, active: true },
    ]);
    await expect(updateAiGatewayModel(chatDefault.id, { active: false })).rejects.toThrow("Default AI Gateway model must be active.");
    await expect(updateAiGatewayModel(chatDefault.id, { active: false, defaultForPurpose: false })).resolves.toMatchObject({ active: false, defaultForPurpose: false });
  });

  test("admin actions reject default models without purpose-required capabilities", async () => {
    await createUser("admin-capability-user", ["admin"]);
    authMock.mockResolvedValue({ user: { id: "admin-capability-user", email: "admin-capability-user@example.com" } });
    const model = await createModel({ id: "capability-model", gatewayModelName: "cx/capability", defaultForPurpose: false, supportsTextInput: false });
    const { createAiGatewayModel, setDefaultAiGatewayModel } = await import("@/features/admin/actions");

    await expect(
      createAiGatewayModel({
        gatewayModelName: "cx/no-text-default",
        displayLabel: "No text default",
        purpose: "ai_ask_initial_answer",
        defaultForPurpose: true,
        supportsTextInput: false,
      }),
    ).rejects.toThrow("Default AI Ask model must support text input.");
    await expect(setDefaultAiGatewayModel(model.id)).rejects.toThrow("Default AI Ask model must support text input.");
  });

  test("admin actions reject token prices without a currency", async () => {
    await createUser("admin-pricing-user", ["admin"]);
    authMock.mockResolvedValue({ user: { id: "admin-pricing-user", email: "admin-pricing-user@example.com" } });
    const { createAiGatewayModel } = await import("@/features/admin/actions");

    await expect(
      createAiGatewayModel({
        gatewayModelName: "cx/no-currency",
        displayLabel: "No currency",
        purpose: "ai_ask_initial_answer",
        supportsTextInput: true,
        pricingCurrency: null,
        inputTokenPriceMicros: 1,
      }),
    ).rejects.toThrow("Pricing currency is required when any token price is configured.");
  });

  test("traveler is denied before model catalog mutation side effects", async () => {
    await createUser("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    const { createAiGatewayModel } = await import("@/features/admin/actions");

    await expect(
      createAiGatewayModel({ gatewayModelName: "cx/denied", displayLabel: "Denied", purpose: "ai_ask_initial_answer", supportsTextInput: true }),
    ).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(testDb.select().from(aiGatewayModels).where(eq(aiGatewayModels.gatewayModelName, "cx/denied"))).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });
});
