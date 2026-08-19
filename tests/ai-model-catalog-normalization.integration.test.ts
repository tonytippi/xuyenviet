import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import type { RequestPrincipal } from "@xuyenviet/contracts";
import { createPostgresAdminAiModelCatalogPort, selectActiveAiGatewayModel } from "@xuyenviet/database";
import { auditEvents, aiGatewayModels, aiPurposes, userRoles } from "@/db/schema";
import { getTestDatabaseUrl } from "./helpers/env-file";
import { resetTestDatabase, seedAiPurposeModel, seedTestOperator, testDb } from "./helpers/db";

const admin: RequestPrincipal = { userId: "operator", email: "operator@example.com", roles: ["admin"], sessionId: "ai-model-admin", authorizationVersion: 1 };

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

  test("prevents deletion of catalog models even after their purpose mappings are removed", async () => {
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
    await expect(testDb.delete(aiGatewayModels).where(eq(aiGatewayModels.id, "mapped-model"))).rejects.toThrow();
  });

  test("remaps purposes atomically, audits the change, and rejects invalid assignments", async () => {
    await seedTestOperator();
    await testDb.insert(userRoles).values({ userId: "operator", role: "admin" });
    await seedAiPurposeModel({ id: "original", gatewayModelName: "test/original", displayLabel: "Original", purpose: "extraction", active: true, supportsTextInput: true, supportsExtraction: true });
    await seedAiPurposeModel({ id: "replacement", gatewayModelName: "test/replacement", displayLabel: "Replacement", purpose: "evaluation", mapPurpose: false, active: true, supportsTextInput: true, supportsExtraction: true, supportsEvaluation: true });
    await seedAiPurposeModel({ id: "inactive", gatewayModelName: "test/inactive", displayLabel: "Inactive", purpose: "ai_ask_initial_answer", active: false, supportsTextInput: true });
    const catalog = createPostgresAdminAiModelCatalogPort(getTestDatabaseUrl());

    await expect(catalog.assignPurpose(admin, { purpose: "extraction", aiGatewayModelId: "replacement" })).resolves.toEqual({ purpose: "extraction", aiGatewayModelId: "replacement" });
    await expect(testDb.select({ aiGatewayModelId: aiPurposes.aiGatewayModelId }).from(aiPurposes).where(eq(aiPurposes.purpose, "extraction"))).resolves.toEqual([{ aiGatewayModelId: "replacement" }]);
    await expect(testDb.select({ beforeSummary: auditEvents.beforeSummary, afterSummary: auditEvents.afterSummary }).from(auditEvents).where(and(eq(auditEvents.targetType, "ai_purpose"), eq(auditEvents.targetId, "extraction")))).resolves.toEqual([{ beforeSummary: JSON.stringify({ purpose: "extraction", aiGatewayModelId: "original" }), afterSummary: JSON.stringify({ purpose: "extraction", aiGatewayModelId: "replacement" }) }]);

    await expect(catalog.assignPurpose(admin, { purpose: "extraction", aiGatewayModelId: "inactive" })).rejects.toThrow("Assigned AI Gateway model must be active.");
    await expect(testDb.select({ aiGatewayModelId: aiPurposes.aiGatewayModelId }).from(aiPurposes).where(eq(aiPurposes.purpose, "extraction"))).resolves.toEqual([{ aiGatewayModelId: "replacement" }]);
    await expect(catalog.archive(admin, "replacement")).rejects.toThrow("AI Gateway model is still assigned to a purpose.");
    await expect(catalog.assignPurpose(admin, { purpose: "extraction", aiGatewayModelId: "original" })).resolves.toEqual({ purpose: "extraction", aiGatewayModelId: "original" });
    await expect(catalog.archive(admin, "replacement")).resolves.toMatchObject({ id: "replacement", active: false });
  });
});
