"use server";

import { and, eq, ne } from "drizzle-orm";

import { aiGatewayModels, type AiGatewayModelPurpose } from "@/db/schema";
import { runAuditedAdminMutation } from "@/server/mutations";

type AiGatewayModelMutationInput = {
  gatewayModelName: string;
  displayLabel: string;
  purpose: AiGatewayModelPurpose;
  active?: boolean;
  defaultForPurpose?: boolean;
  supportsTextInput?: boolean;
  supportsImageInput?: boolean;
  supportsImageOutput?: boolean;
  supportsEmbeddings?: boolean;
  supportsExtraction?: boolean;
  supportsEvaluation?: boolean;
  supportsStreaming?: boolean;
  supportsCachePricing?: boolean;
  pricingCurrency?: string | null;
  inputTokenPriceMicros?: number | null;
  outputTokenPriceMicros?: number | null;
  cacheReadTokenPriceMicros?: number | null;
  cacheWriteTokenPriceMicros?: number | null;
  pricingUnitTokens?: number;
  pricingVersion?: string | null;
  pricingEffectiveAt?: Date;
};

export async function validateAdminActionAccess() {
  await runAuditedAdminMutation({
    audit: {
      operation: "access_check",
      targetType: "admin_action",
      targetId: "validate-admin-action-access",
      afterSummary: "Admin/operator action access validated from the admin shell.",
    },
    action: async () => undefined,
  });
}

export async function createAiGatewayModel(input: AiGatewayModelMutationInput) {
  const values = normalizeAiGatewayModelInput(input);

  return runAuditedAdminMutation({
    audit: {
      operation: "create",
      targetType: "ai_gateway_model",
      targetId: `${values.purpose}:${values.gatewayModelName}`,
      afterSummary: summarizeAiGatewayModel(values),
    },
    action: async (_session, transaction) => {
      const active = values.active ?? true;
      const defaultForPurpose = values.defaultForPurpose ?? false;
      validateActiveDefault(active, defaultForPurpose);

      if (defaultForPurpose) {
        await transaction.update(aiGatewayModels).set({ defaultForPurpose: false, updatedAt: new Date() }).where(eq(aiGatewayModels.purpose, values.purpose));
      }

      const [model] = await transaction.insert(aiGatewayModels).values({ ...values, active, defaultForPurpose }).returning();

      return model;
    },
  });
}

export async function updateAiGatewayModel(modelId: string, input: Partial<AiGatewayModelMutationInput>) {
  const id = normalizeId(modelId);
  const values = normalizePartialAiGatewayModelInput(input);

  return runAuditedAdminMutation({
    audit: {
      operation: "update",
      targetType: "ai_gateway_model",
      targetId: id,
      afterSummary: summarizeAiGatewayModel(values),
    },
    action: async (_session, transaction) => {
      const [existing] = await transaction.select().from(aiGatewayModels).where(eq(aiGatewayModels.id, id)).limit(1);

      if (!existing) {
        throw new Error("AI Gateway model not found.");
      }

      const nextPurpose = values.purpose ?? existing.purpose;
      const nextActive = values.active ?? existing.active;
      const nextDefaultForPurpose = values.defaultForPurpose ?? existing.defaultForPurpose;
      validateActiveDefault(nextActive, nextDefaultForPurpose);

      if (nextDefaultForPurpose) {
        await transaction
          .update(aiGatewayModels)
          .set({ defaultForPurpose: false, updatedAt: new Date() })
          .where(and(eq(aiGatewayModels.purpose, nextPurpose), ne(aiGatewayModels.id, id)));
      }

      const [model] = await transaction
        .update(aiGatewayModels)
        .set({ ...values, active: nextActive, defaultForPurpose: nextDefaultForPurpose, updatedAt: new Date() })
        .where(eq(aiGatewayModels.id, id))
        .returning();

      return model;
    },
  });
}

export async function archiveAiGatewayModel(modelId: string) {
  const id = normalizeId(modelId);

  return runAuditedAdminMutation({
    audit: {
      operation: "archive",
      targetType: "ai_gateway_model",
      targetId: id,
      afterSummary: "Archived AI Gateway model catalog record.",
    },
    action: async (_session, transaction) => {
      const [model] = await transaction
        .update(aiGatewayModels)
        .set({ active: false, defaultForPurpose: false, updatedAt: new Date() })
        .where(eq(aiGatewayModels.id, id))
        .returning();

      if (!model) {
        throw new Error("AI Gateway model not found.");
      }

      return model;
    },
  });
}

export async function setDefaultAiGatewayModel(modelId: string) {
  const id = normalizeId(modelId);

  return runAuditedAdminMutation({
    audit: {
      operation: "update",
      targetType: "ai_gateway_model",
      targetId: id,
      afterSummary: "Set default AI Gateway model for its purpose.",
    },
    action: async (_session, transaction) => {
      const [existing] = await transaction.select().from(aiGatewayModels).where(eq(aiGatewayModels.id, id)).limit(1);

      if (!existing) {
        throw new Error("AI Gateway model not found.");
      }

      await transaction.update(aiGatewayModels).set({ defaultForPurpose: false, updatedAt: new Date() }).where(eq(aiGatewayModels.purpose, existing.purpose));

      const [model] = await transaction
        .update(aiGatewayModels)
        .set({ active: true, defaultForPurpose: true, updatedAt: new Date() })
        .where(eq(aiGatewayModels.id, id))
        .returning();

      return model;
    },
  });
}

function normalizeAiGatewayModelInput(input: AiGatewayModelMutationInput): typeof aiGatewayModels.$inferInsert {
  return {
    gatewayModelName: normalizeRequiredString(input.gatewayModelName, "Gateway model name"),
    displayLabel: normalizeRequiredString(input.displayLabel, "Display label"),
    purpose: input.purpose,
    active: input.active ?? true,
    defaultForPurpose: input.defaultForPurpose ?? false,
    supportsTextInput: input.supportsTextInput ?? false,
    supportsImageInput: input.supportsImageInput ?? false,
    supportsImageOutput: input.supportsImageOutput ?? false,
    supportsEmbeddings: input.supportsEmbeddings ?? false,
    supportsExtraction: input.supportsExtraction ?? false,
    supportsEvaluation: input.supportsEvaluation ?? false,
    supportsStreaming: input.supportsStreaming ?? false,
    supportsCachePricing: input.supportsCachePricing ?? false,
    pricingCurrency: normalizeOptionalString(input.pricingCurrency),
    inputTokenPriceMicros: normalizeOptionalNonNegativeInteger(input.inputTokenPriceMicros, "Input token price"),
    outputTokenPriceMicros: normalizeOptionalNonNegativeInteger(input.outputTokenPriceMicros, "Output token price"),
    cacheReadTokenPriceMicros: normalizeOptionalNonNegativeInteger(input.cacheReadTokenPriceMicros, "Cache read token price"),
    cacheWriteTokenPriceMicros: normalizeOptionalNonNegativeInteger(input.cacheWriteTokenPriceMicros, "Cache write token price"),
    pricingUnitTokens: normalizePositiveInteger(input.pricingUnitTokens ?? 1_000_000, "Pricing unit tokens"),
    pricingVersion: normalizeOptionalString(input.pricingVersion),
    pricingEffectiveAt: input.pricingEffectiveAt ?? new Date(),
  };
}

function normalizePartialAiGatewayModelInput(input: Partial<AiGatewayModelMutationInput>): Partial<typeof aiGatewayModels.$inferInsert> {
  const values: Partial<typeof aiGatewayModels.$inferInsert> = {};

  if (input.gatewayModelName !== undefined) values.gatewayModelName = normalizeRequiredString(input.gatewayModelName, "Gateway model name");
  if (input.displayLabel !== undefined) values.displayLabel = normalizeRequiredString(input.displayLabel, "Display label");
  if (input.purpose !== undefined) values.purpose = input.purpose;
  if (input.active !== undefined) values.active = input.active;
  if (input.defaultForPurpose !== undefined) values.defaultForPurpose = input.defaultForPurpose;
  if (input.supportsTextInput !== undefined) values.supportsTextInput = input.supportsTextInput;
  if (input.supportsImageInput !== undefined) values.supportsImageInput = input.supportsImageInput;
  if (input.supportsImageOutput !== undefined) values.supportsImageOutput = input.supportsImageOutput;
  if (input.supportsEmbeddings !== undefined) values.supportsEmbeddings = input.supportsEmbeddings;
  if (input.supportsExtraction !== undefined) values.supportsExtraction = input.supportsExtraction;
  if (input.supportsEvaluation !== undefined) values.supportsEvaluation = input.supportsEvaluation;
  if (input.supportsStreaming !== undefined) values.supportsStreaming = input.supportsStreaming;
  if (input.supportsCachePricing !== undefined) values.supportsCachePricing = input.supportsCachePricing;
  if (input.pricingCurrency !== undefined) values.pricingCurrency = normalizeOptionalString(input.pricingCurrency);
  if (input.inputTokenPriceMicros !== undefined) values.inputTokenPriceMicros = normalizeOptionalNonNegativeInteger(input.inputTokenPriceMicros, "Input token price");
  if (input.outputTokenPriceMicros !== undefined) values.outputTokenPriceMicros = normalizeOptionalNonNegativeInteger(input.outputTokenPriceMicros, "Output token price");
  if (input.cacheReadTokenPriceMicros !== undefined) values.cacheReadTokenPriceMicros = normalizeOptionalNonNegativeInteger(input.cacheReadTokenPriceMicros, "Cache read token price");
  if (input.cacheWriteTokenPriceMicros !== undefined) values.cacheWriteTokenPriceMicros = normalizeOptionalNonNegativeInteger(input.cacheWriteTokenPriceMicros, "Cache write token price");
  if (input.pricingUnitTokens !== undefined) values.pricingUnitTokens = normalizePositiveInteger(input.pricingUnitTokens, "Pricing unit tokens");
  if (input.pricingVersion !== undefined) values.pricingVersion = normalizeOptionalString(input.pricingVersion);
  if (input.pricingEffectiveAt !== undefined) values.pricingEffectiveAt = input.pricingEffectiveAt;

  return values;
}

function normalizeId(id: string) {
  return normalizeRequiredString(id, "AI Gateway model id");
}

function normalizeRequiredString(value: string, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeOptionalString(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return value.trim() || null;
}

function normalizeOptionalNonNegativeInteger(value: number | null | undefined, label: string) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  return value;
}

function normalizePositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function validateActiveDefault(active: boolean, defaultForPurpose: boolean) {
  if (!active && defaultForPurpose) {
    throw new Error("Default AI Gateway model must be active.");
  }
}

function summarizeAiGatewayModel(values: Partial<typeof aiGatewayModels.$inferInsert>) {
  return JSON.stringify({
    gatewayModelName: values.gatewayModelName,
    displayLabel: values.displayLabel,
    purpose: values.purpose,
    active: values.active,
    defaultForPurpose: values.defaultForPurpose,
    capabilities: {
      textInput: values.supportsTextInput,
      imageInput: values.supportsImageInput,
      imageOutput: values.supportsImageOutput,
      embeddings: values.supportsEmbeddings,
      extraction: values.supportsExtraction,
      evaluation: values.supportsEvaluation,
      streaming: values.supportsStreaming,
      cachePricing: values.supportsCachePricing,
    },
    pricingCurrency: values.pricingCurrency,
    pricingUnitTokens: values.pricingUnitTokens,
    pricingVersion: values.pricingVersion,
  });
}
