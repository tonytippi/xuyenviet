import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { selectActiveAiGatewayModel } from "@xuyenviet/database";
import { aiGatewayModels, aiPurposes } from "@/db/schema";
import { resetTestDatabase, seedAiPurposeModel, testDb } from "./helpers/db";

describe("AI model catalog normalization", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("routes multiple purposes to one active catalog model at runtime", async () => {
    await seedAiPurposeModel({
      id: "shared-model",
      gatewayModelName: "test/shared",
      displayLabel: "Shared model",
      purpose: "ai_ask_initial_answer",
      active: true,
      supportsTextInput: true,
      supportsExtraction: true,
      supportsStreaming: true,
    });
    await testDb.insert(aiPurposes).values({ purpose: "extraction", aiGatewayModelId: "shared-model" });

    await expect(selectActiveAiGatewayModel({
      purpose: "ai_ask_initial_answer",
      requiredCapabilities: { textInput: true, streaming: true },
      db: testDb,
    })).resolves.toMatchObject({ id: "shared-model", gatewayModelName: "test/shared" });
    await expect(selectActiveAiGatewayModel({
      purpose: "extraction",
      requiredCapabilities: { textInput: true, extraction: true },
      db: testDb,
    })).resolves.toMatchObject({ id: "shared-model", gatewayModelName: "test/shared" });
  });

  test("returns null for inactive or capability-incompatible purpose mappings", async () => {
    await seedAiPurposeModel({
      id: "inactive-model",
      gatewayModelName: "test/inactive",
      displayLabel: "Inactive model",
      purpose: "ai_ask_initial_answer",
      active: false,
      supportsTextInput: true,
      supportsStreaming: true,
    });
    await seedAiPurposeModel({
      id: "text-only-model",
      gatewayModelName: "test/text-only",
      displayLabel: "Text only model",
      purpose: "extraction",
      active: true,
      supportsTextInput: true,
    });

    await expect(selectActiveAiGatewayModel({
      purpose: "ai_ask_initial_answer",
      requiredCapabilities: { textInput: true, streaming: true },
      db: testDb,
    })).resolves.toBeNull();
    await expect(selectActiveAiGatewayModel({
      purpose: "extraction",
      requiredCapabilities: { textInput: true, extraction: true },
      db: testDb,
    })).resolves.toBeNull();
  });

  test("prevents deletion of a catalog model while a purpose mapping references it", async () => {
    await seedAiPurposeModel({
      id: "mapped-model",
      gatewayModelName: "test/mapped",
      displayLabel: "Mapped model",
      purpose: "evaluation",
      active: true,
      supportsTextInput: true,
      supportsEvaluation: true,
    });

    await expect(testDb.delete(aiGatewayModels).where(eq(aiGatewayModels.id, "mapped-model"))).rejects.toThrow();

    await testDb.delete(aiPurposes).where(eq(aiPurposes.aiGatewayModelId, "mapped-model"));
    await expect(testDb.delete(aiGatewayModels).where(eq(aiGatewayModels.id, "mapped-model"))).resolves.toBeDefined();
  });
});
