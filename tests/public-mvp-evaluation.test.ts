import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  aiGatewayModels,
  publicMvpEvaluationPromptSets,
  publicMvpEvaluationResultScores,
  publicMvpEvaluationResults,
  publicMvpEvaluationRuns,
  userRoles,
  users,
  type PublicMvpEvaluationScoreDimension,
  type UserRole,
} from "@/db/schema";

import { testDb } from "./helpers/db";

const sessionWithRolesMock = vi.fn();

vi.mock("@/server/auth", () => ({
  getAuthenticatedSessionWithRoles: sessionWithRolesMock,
  hasAdminAccess: (roles: UserRole[]) => roles.includes("admin") || roles.includes("operator"),
}));

async function createUser(userId: string, roles: UserRole[] = []) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });

  if (roles.length > 0) {
    await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
  }
}

async function createEvaluationModel() {
  const [model] = await testDb
    .insert(aiGatewayModels)
    .values({
      id: "evaluation-model",
      gatewayModelName: "cx/evaluator",
      displayLabel: "Evaluator",
      purpose: "evaluation",
      active: true,
      defaultForPurpose: true,
      supportsTextInput: true,
      supportsEvaluation: true,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 1,
      outputTokenPriceMicros: 2,
      pricingVersion: "test-v1",
      pricingEffectiveAt: new Date("2026-07-11T00:00:00.000Z"),
    })
    .returning();

  return model;
}

async function mockSession(userId: string | null, roles: UserRole[] = []) {
  sessionWithRolesMock.mockResolvedValue(userId ? { userId, email: `${userId}@example.com`, roles } : null);
}

function validScores(score = 8) {
  return {
    user_context_use: score,
    practical_specificity: score,
    source_grounding: score,
    uncertainty_handling: score,
    family_awareness: score,
    vietnamese_clarity: score,
  } satisfies Record<PublicMvpEvaluationScoreDimension, number>;
}

describe("public MVP answer evaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("configures the five required public MVP prompt types", async () => {
    const { publicMvpEvaluationPrompts } = await import("@/features/feedback/evaluation");

    expect(publicMvpEvaluationPrompts.map((prompt) => prompt.type)).toEqual([
      "magic_moment_family_trip",
      "sparse_data",
      "freshness_sensitive",
      "service_activity",
      "route_logistics",
    ]);
    expect(new Set(publicMvpEvaluationPrompts.map((prompt) => prompt.version)).size).toBe(5);
  });

  test("rejects unauthenticated or traveler runs before writing rows", async () => {
    await createUser("traveler", ["traveler"]);
    await createEvaluationModel();
    await mockSession(null);
    const unauthenticatedModule = await import("@/features/feedback/evaluation");

    await expect(unauthenticatedModule.runPublicMvpAnswerEvaluationPromptSet({ db: testDb })).resolves.toEqual({ success: false, reason: "unauthorized" });

    await mockSession("traveler", ["traveler"]);
    const travelerModule = await import("@/features/feedback/evaluation");

    await expect(travelerModule.runPublicMvpAnswerEvaluationPromptSet({ db: testDb })).resolves.toEqual({ success: false, reason: "unauthorized" });
    await expect(testDb.select().from(publicMvpEvaluationRuns)).resolves.toHaveLength(0);
    await expect(testDb.select().from(publicMvpEvaluationResults)).resolves.toHaveLength(0);
  });

  test("fails safely when no active evaluation-capable model exists", async () => {
    await createUser("operator", ["operator"]);
    await mockSession("operator", ["operator"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    await expect(runPublicMvpAnswerEvaluationPromptSet({ db: testDb })).resolves.toEqual({ success: false, reason: "missing_evaluation_model" });
    await expect(testDb.select().from(publicMvpEvaluationRuns)).resolves.toHaveLength(0);
  });

  test("stores one scored result and six bounded rubric scores for each standard prompt", async () => {
    await createUser("admin", ["admin"]);
    await createEvaluationModel();
    await mockSession("admin", ["admin"]);
    const { publicMvpEvaluationPrompts, runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    const result = await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      scorer: async ({ prompt }) => ({
        answerText: `Câu trả lời an toàn cho ${prompt.type}`,
        scores: validScores(prompt.type === "magic_moment_family_trip" ? 9 : 8),
        flags: {
          unsupportedClaim: prompt.type === "service_activity",
          missingUncertainty: prompt.type === "freshness_sensitive",
          noBetterThanGeneric: prompt.type === "sparse_data",
        },
      }),
    });
    const runs = await testDb.select().from(publicMvpEvaluationRuns);
    const rows = await testDb.select().from(publicMvpEvaluationResults);
    const scores = await testDb.select().from(publicMvpEvaluationResultScores);
    const promptSets = await testDb.select().from(publicMvpEvaluationPromptSets);

    expect(result.success).toBe(true);
    expect(result.success ? result.run : null).toMatchObject({ actorUserId: "admin", modelVersion: "cx/evaluator", status: "completed", resultCount: 5, scoredCount: 5, failedCount: 0 });
    expect(promptSets).toMatchObject([{ version: "public_mvp_v1", rubricVersion: "epic_6_quality_rubric_v1" }]);
    expect(runs).toHaveLength(1);
    expect(rows.map((row) => row.promptType).sort()).toEqual([...publicMvpEvaluationPrompts.map((prompt) => prompt.type)].sort());
    expect(rows).toHaveLength(5);
    expect(scores).toHaveLength(30);
    expect(scores.every((score) => Number.isInteger(score.score) && score.score >= 1 && score.score <= 10)).toBe(true);
    expect(rows.find((row) => row.promptType === "service_activity")?.unsupportedClaimFlag).toBe(true);
    expect(rows.find((row) => row.promptType === "freshness_sensitive")?.missingUncertaintyFlag).toBe(true);
    expect(rows.find((row) => row.promptType === "sparse_data")?.noBetterThanGenericFlag).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/rawProviderPayload|raw_source_material|providerPayload|operatorOnlyNotes/);
  });

  test("stores malformed scorer output as failed without malformed scores", async () => {
    await createUser("operator", ["operator"]);
    await createEvaluationModel();
    await mockSession("operator", ["operator"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    const result = await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      scorer: async ({ prompt }) => ({
        answerText: `Answer for ${prompt.type}`,
        scores: prompt.type === "magic_moment_family_trip" ? { ...validScores(), source_grounding: 11 } : validScores(),
        flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false },
      }),
    });
    const rows = await testDb.select().from(publicMvpEvaluationResults);
    const failedRow = rows.find((row) => row.promptType === "magic_moment_family_trip");
    const failedScores = failedRow ? await testDb.select().from(publicMvpEvaluationResultScores).where(eq(publicMvpEvaluationResultScores.resultId, failedRow.id)) : [];

    expect(result.success ? result.run.status : null).toBe("partial_failed");
    expect(failedRow).toMatchObject({ status: "failed", safeErrorCode: "invalid_score_payload", answerText: null });
    expect(failedScores).toHaveLength(0);
  });

  test("database rejects out-of-range scores and duplicate prompt results per run", async () => {
    await createUser("admin", ["admin"]);
    await createEvaluationModel();
    await mockSession("admin", ["admin"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    const result = await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      scorer: async ({ prompt }) => ({
        answerText: `Answer for ${prompt.type}`,
        scores: validScores(),
        flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false },
      }),
    });
    const [storedResult] = await testDb.select().from(publicMvpEvaluationResults).where(eq(publicMvpEvaluationResults.promptType, "route_logistics"));

    await expect(
      testDb.insert(publicMvpEvaluationResultScores).values({ resultId: storedResult.id, dimension: "user_context_use", score: 0 }),
    ).rejects.toThrow();
    await expect(
      testDb.insert(publicMvpEvaluationResults).values({
        runId: result.success ? result.run.id : "missing",
        promptSetId: storedResult.promptSetId,
        promptSetVersion: storedResult.promptSetVersion,
        promptType: "route_logistics",
        promptVersion: "duplicate_v1",
        modelVersion: storedResult.modelVersion,
        status: "scored",
        answerText: "Duplicate",
      }),
    ).rejects.toThrow();
  });
});
