import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  aiGatewayModels,
  aiUsageEvents,
  assistantRetrievalDecisions,
  assistantResponseProvenance,
  publicMvpEvaluationPromptSets,
  publicMvpEvaluationResultScores,
  publicMvpEvaluationResultPolicySnapshots,
  publicMvpEvaluationResults,
  publicMvpEvaluationRuns,
  conversations,
  knowledgeCardSearchDocuments,
  knowledgeCards,
  messages,
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

  await createAiAskModel();

  return model;
}

async function createAiAskModel() {
  await testDb.insert(aiGatewayModels).values({
    id: "ai-ask-model",
    gatewayModelName: "cx/ai-ask",
    displayLabel: "AI Ask",
    purpose: "ai_ask_initial_answer",
    active: true,
    defaultForPurpose: true,
    supportsTextInput: true,
    pricingCurrency: "USD",
    inputTokenPriceMicros: 1,
    outputTokenPriceMicros: 2,
    pricingVersion: "test-v1",
    pricingEffectiveAt: new Date("2026-07-11T00:00:00.000Z"),
  });
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

async function createPersistedEvaluationAnswer(userId: string, promptType: string, scenarioId: string, options: { conditionalPolicy?: "caveat_only" | "contextual_use"; conditionalVerification?: "required" | "not_required"; conditionalConditions?: string[]; answerText?: string; fallbackWarnings?: string[]; selectedKnowledgeSnapshot?: Record<string, unknown> } = {}) {
  const conflict = scenarioId === "conflict_exclusion";
  const withdrawn = scenarioId === "source_withdrawal";
  const fallback = conflict || withdrawn || scenarioId === "web_fallback_unavailable" || scenarioId === "conditional_high_risk_claim";
  const selectedState = scenarioId === "community_observation" ? "community_observation" : scenarioId === "independent_community_pattern" ? "community_pattern" : scenarioId === "conditional_high_risk_claim" ? "conditional" : null;
  const [conversation] = await testDb.insert(conversations).values({ userId }).returning({ id: conversations.id });
  const [userMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId, role: "user", content: `Prompt ${promptType}` }).returning({ id: messages.id });
  const conditionalConditions = options.conditionalConditions ?? ["Cần xác minh trước khi khởi hành"];
  const answerText = options.answerText ?? `${fallback ? "Không thể xác minh, hãy kiểm tra lại. " : ""}${selectedState === "conditional" ? `${conditionalConditions.join(". ")}. ` : ""}Câu trả lời AI Ask cho ${promptType}`;
  const [assistantMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId, role: "assistant", content: answerText }).returning({ id: messages.id });
  const [decision] = await testDb
    .insert(assistantRetrievalDecisions)
    .values({
      userId,
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      approvedKnowledgeCandidateCount: 0,
      approvedKnowledgeSelectedCount: 0,
      approvedKnowledgeTargetCount: 3,
      approvedKnowledgeRelevanceThreshold: 1,
      broadPlanningQuestion: true,
      freshnessRequired: false,
      conflictDetected: false,
      generalReasoningUsed: true,
      webSearchTriggered: fallback,
      webSearchTriggerReasons: fallback ? [conflict ? "excluded_conflict_candidate" : "no_active_knowledge"] : [],
      warnings: fallback ? (options.fallbackWarnings ?? ["web_search_low_quality"]) : [],
      knowledgePolicySnapshot: {
        excludedPolicyCounts: { conflict: conflict ? 1 : 0, verificationRequired: 0, other: withdrawn ? 1 : 0 },
        excludedReasonCodes: conflict ? ["unsupported_knowledge_state"] : withdrawn ? ["missing_traveler_safe_evidence"] : [],
      },
    })
    .returning({ id: assistantRetrievalDecisions.id });
  const selectedKnowledgeSnapshot = selectedState
    ? {
        knowledgeCardId: `${scenarioId}-card`,
        contentVersion: 1,
        knowledgeState: selectedState,
        verificationState: selectedState === "conditional" ? (options.conditionalVerification ?? "required") : "not_required",
        usePolicy: selectedState === "conditional" ? (options.conditionalPolicy ?? "caveat_only") : "contextual_use",
        ...(selectedState === "conditional" ? { conditions: conditionalConditions } : {}),
        ...options.selectedKnowledgeSnapshot,
      }
    : { available: true };
  const [provenance] = await testDb
    .insert(assistantResponseProvenance)
    .values({
      userId,
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
       sourceCategory: selectedState ? "knowledge" : "general",
      rank: 1,
      sourceType: "general_reasoning",
      verificationStatus: "unverified",
        sourceSnapshot: selectedKnowledgeSnapshot,
    })
    .returning({ id: assistantResponseProvenance.id });

  return {
    answerText,
    conversationId: conversation.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    retrievalDecisionId: decision.id,
    provenanceId: provenance.id,
    provenance: [{ id: provenance.id, sourceCategory: selectedState ? "knowledge" : "general", usedInPrompt: true, sourceSnapshot: selectedKnowledgeSnapshot }],
    retrievalDecision: {
      selectedKnowledgeCardIds: [],
      knowledgePolicySnapshot: {
        excludedPolicyCounts: { conflict: conflict ? 1 : 0, verificationRequired: 0, other: withdrawn ? 1 : 0 },
        excludedReasonCodes: conflict ? ["unsupported_knowledge_state"] : withdrawn ? ["missing_traveler_safe_evidence"] : [],
      },
      webSearchTriggered: fallback,
      webSearchTriggerReasons: fallback ? [conflict ? "excluded_conflict_candidate" : "no_active_knowledge"] : [],
      warnings: fallback ? (options.fallbackWarnings ?? ["web_search_low_quality"]) : [],
    },
    usageEventId: null,
    modelVersion: "cx/ai-ask",
  };
}

function answerGenerator(userId = "admin") {
  return async ({ prompt, scenario }: { prompt: { type: string }; scenario: { id: string } }) => ({ ok: true as const, answer: await createPersistedEvaluationAnswer(userId, prompt.type, scenario.id) });
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

  test("fails safely when no active AI Ask model exists before evaluation-owned writes or gateway calls", async () => {
    await createUser("operator", ["operator"]);
    await testDb.insert(aiGatewayModels).values({
      id: "evaluation-model-only",
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
    });
    await mockSession("operator", ["operator"]);
    const answerGenerator = vi.fn();
    const scorer = vi.fn();
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    await expect(runPublicMvpAnswerEvaluationPromptSet({ db: testDb, answerGenerator, scorer })).resolves.toEqual({ success: false, reason: "missing_ai_ask_model" });

    await expect(testDb.select().from(publicMvpEvaluationPromptSets)).resolves.toHaveLength(0);
    await expect(testDb.select().from(publicMvpEvaluationRuns)).resolves.toHaveLength(0);
    await expect(testDb.select().from(publicMvpEvaluationResults)).resolves.toHaveLength(0);
    await expect(testDb.select().from(publicMvpEvaluationResultScores)).resolves.toHaveLength(0);
    await expect(testDb.select().from(conversations)).resolves.toHaveLength(0);
    await expect(testDb.select().from(messages)).resolves.toHaveLength(0);
    await expect(testDb.select().from(assistantRetrievalDecisions)).resolves.toHaveLength(0);
    await expect(testDb.select().from(assistantResponseProvenance)).resolves.toHaveLength(0);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(0);
    expect(answerGenerator).not.toHaveBeenCalled();
    expect(scorer).not.toHaveBeenCalled();
  });

  test("stores one scored result and six bounded rubric scores for each standard prompt", async () => {
    await createUser("admin", ["admin"]);
    await createEvaluationModel();
    await mockSession("admin", ["admin"]);
    const { publicMvpEvaluationPrompts, runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    const result = await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      answerGenerator: answerGenerator("admin"),
      scorer: async ({ prompt }) => ({
        answerText: `Câu trả lời an toàn cho ${prompt.type}`,
        scores: validScores(prompt.type === "magic_moment_family_trip" ? 9 : 8),
        flags: {
          unsupportedClaim: prompt.type === "service_activity",
          missingUncertainty: prompt.type === "freshness_sensitive",
          noBetterThanGeneric: prompt.type === "sparse_data",
          unsupportedCommunityWording: false,
          requiredCaveatOmitted: false,
        },
      }),
    });
    const runs = await testDb.select().from(publicMvpEvaluationRuns);
    const rows = await testDb.select().from(publicMvpEvaluationResults);
    const scores = await testDb.select().from(publicMvpEvaluationResultScores);
    const policySnapshots = await testDb.select().from(publicMvpEvaluationResultPolicySnapshots);
    const promptSets = await testDb.select().from(publicMvpEvaluationPromptSets);

    expect(result.success).toBe(true);
    expect(result.success ? result.run : null).toMatchObject({ actorUserId: "admin", modelVersion: "cx/evaluator", status: "completed", resultCount: 6, scoredCount: 6, failedCount: 0 });
    expect(promptSets).toMatchObject([{ version: "public_mvp_ai_first_v2", rubricVersion: "epic_6_quality_rubric_ai_first_v2" }]);
    expect(runs).toHaveLength(1);
    expect(new Set(rows.map((row) => row.promptType))).toEqual(new Set(publicMvpEvaluationPrompts.map((prompt) => prompt.type)));
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.answerText?.includes("Câu trả lời AI Ask cho"))).toBe(true);
    expect(rows.every((row) => row.modelVersion === "cx/ai-ask")).toBe(true);
    expect(rows.every((row) => row.assistantMessageId && row.retrievalDecisionId && row.provenanceId)).toBe(true);
    expect(scores).toHaveLength(36);
    expect(policySnapshots).toHaveLength(6);
    expect(policySnapshots.find((snapshot) => snapshot.scenarioId === "conflict_exclusion")).toMatchObject({
      excludedCandidateCounts: { conflict: 1, verificationRequired: 0, other: 0 },
      excludedReasonCodes: ["unsupported_knowledge_state"],
      targetCandidateExcluded: true,
      sourceOrEvidenceOutcome: "excluded_conflict",
    });
    expect(policySnapshots.find((snapshot) => snapshot.scenarioId === "source_withdrawal")).toMatchObject({
      excludedCandidateCounts: { conflict: 0, verificationRequired: 0, other: 1 },
      excludedReasonCodes: ["missing_traveler_safe_evidence"],
      targetCandidateExcluded: true,
      sourceOrEvidenceOutcome: "withdrawn_or_ineligible",
    });
    expect(policySnapshots.find((snapshot) => snapshot.scenarioId === "web_fallback_unavailable")?.webFallback).toMatchObject({
      triggered: true,
      warnings: ["web_search_low_quality"],
      guidanceMet: true,
    });
    expect(scores.every((score) => Number.isInteger(score.score) && score.score >= 1 && score.score <= 10)).toBe(true);
    expect(rows.find((row) => row.promptType === "service_activity")?.unsupportedClaimFlag).toBe(true);
    expect(rows.find((row) => row.promptType === "freshness_sensitive")?.missingUncertaintyFlag).toBe(true);
    expect(rows.find((row) => row.promptType === "sparse_data")?.noBetterThanGenericFlag).toBe(true);
    const fixtureCards = await testDb.select().from(knowledgeCards).where(eq(knowledgeCards.aiPromptVersion, "public_mvp_evaluation_fixture_v1"));
    expect(fixtureCards).toHaveLength(5);
    expect(fixtureCards.every((card) => card.publicationState === "suppressed")).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/rawProviderPayload|raw_source_material|providerPayload|operatorOnlyNotes/);
  });

  test("keeps synthetic fixtures suppressed and absent from ordinary traveler retrieval throughout evaluation", async () => {
    await createUser("admin", ["admin"]);
    await createEvaluationModel();
    await mockSession("admin", ["admin"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");
    const { searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      answerGenerator: async ({ prompt, scenario }) => {
        const travelerResults = await searchApprovedKnowledge(prompt.prompt);
        expect(travelerResults.filter((result) => result.id.startsWith("evaluation-"))).toEqual([]);
        await expect(testDb.select().from(knowledgeCardSearchDocuments)).resolves.toEqual([]);
        return { ok: true, answer: await createPersistedEvaluationAnswer("admin", prompt.type, scenario.id) };
      },
      scorer: async () => ({ answerText: "Câu trả lời an toàn", scores: validScores(), flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false, unsupportedCommunityWording: false, requiredCaveatOmitted: false } }),
    });

    const fixtures = await testDb.select().from(knowledgeCards).where(eq(knowledgeCards.aiPromptVersion, "public_mvp_evaluation_fixture_v1"));
    expect(fixtures).toHaveLength(5);
    expect(fixtures.every((card) => card.publicationState === "suppressed")).toBe(true);
    await expect(searchApprovedKnowledge("Dữ liệu đánh giá")).resolves.toEqual([]);
  });

  test("stores malformed scorer output as failed without malformed scores", async () => {
    await createUser("operator", ["operator"]);
    await createEvaluationModel();
    await mockSession("operator", ["operator"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    const result = await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      answerGenerator: answerGenerator("operator"),
      scorer: async ({ prompt }) => ({
        answerText: `Answer for ${prompt.type}`,
        scores: prompt.type === "magic_moment_family_trip" ? { ...validScores(), source_grounding: 11 } : validScores(),
        flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false, unsupportedCommunityWording: false, requiredCaveatOmitted: false },
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
      answerGenerator: answerGenerator("admin"),
      scorer: async ({ prompt }) => ({
        answerText: `Answer for ${prompt.type}`,
        scores: validScores(),
        flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false, unsupportedCommunityWording: false, requiredCaveatOmitted: false },
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
        scenarioId: "independent_community_pattern",
        scenarioVersion: "v1",
        modelVersion: storedResult.modelVersion,
        status: "scored",
        answerText: "Duplicate",
      }),
    ).rejects.toThrow();
  });

  test("stores structurally malformed scorer output as invalid score payload", async () => {
    await createUser("operator", ["operator"]);
    await createEvaluationModel();
    await mockSession("operator", ["operator"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      answerGenerator: answerGenerator("operator"),
      scorer: async () => ({ answerText: "Answer", scores: null, flags: null }) as never,
    });
    const rows = await testDb.select().from(publicMvpEvaluationResults);

    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.status === "failed" && row.safeErrorCode === "invalid_score_payload")).toBe(true);
  });

  test("fails a result when its persisted answer-time policy contract does not match the scenario", async () => {
    await createUser("admin", ["admin"]);
    await createEvaluationModel();
    await mockSession("admin", ["admin"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      answerGenerator: async ({ prompt, scenario }) => {
        const answer = await createPersistedEvaluationAnswer("admin", prompt.type, scenario.id);
        if (scenario.id === "conflict_exclusion") {
          answer.retrievalDecision = { ...answer.retrievalDecision!, knowledgePolicySnapshot: { excludedPolicyCounts: { conflict: 0, verificationRequired: 0, other: 0 }, excludedReasonCodes: [] } };
        }
        return { ok: true, answer };
      },
      scorer: async () => ({ answerText: "Câu trả lời an toàn", scores: validScores(), flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false, unsupportedCommunityWording: false, requiredCaveatOmitted: false } }),
    });
    const [conflictResult] = await testDb.select().from(publicMvpEvaluationResults).where(eq(publicMvpEvaluationResults.scenarioId, "conflict_exclusion"));
    const [conflictSnapshot] = await testDb.select().from(publicMvpEvaluationResultPolicySnapshots).where(eq(publicMvpEvaluationResultPolicySnapshots.resultId, conflictResult.id));

    expect(conflictResult).toMatchObject({ status: "failed", safeErrorCode: "evaluator_failed" });
    expect(conflictSnapshot).toMatchObject({
      scenarioId: "conflict_exclusion",
      excludedCandidateCounts: { conflict: 0, verificationRequired: 0, other: 0 },
      sourceOrEvidenceOutcome: "no_eligible_knowledge",
    });
  });

  test("does not fail conflict or withdrawal scenarios when live web fallback succeeds", async () => {
    await createUser("admin", ["admin"]);
    await createEvaluationModel();
    await mockSession("admin", ["admin"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    const result = await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      answerGenerator: async ({ prompt, scenario }) => ({
        ok: true,
        answer: await createPersistedEvaluationAnswer("admin", prompt.type, scenario.id, (scenario.id === "conflict_exclusion" || scenario.id === "source_withdrawal") ? { fallbackWarnings: [] } : {}),
      }),
      scorer: async () => ({ answerText: "Câu trả lời an toàn", scores: validScores(), flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false, unsupportedCommunityWording: false, requiredCaveatOmitted: false } }),
    });

    expect(result.success ? result.run.status : null).toBe("completed");
    expect(result.success ? result.run.results.filter((row) => row.scenarioId === "conflict_exclusion" || row.scenarioId === "source_withdrawal").every((row) => row.status === "scored") : false).toBe(true);
  });

  test("flags ineligible provenance and withheld evidence disclosure without relying on sentinel strings", async () => {
    await createUser("admin", ["admin"]);
    await createEvaluationModel();
    await mockSession("admin", ["admin"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      answerGenerator: async ({ prompt, scenario }) => ({
        ok: true,
        answer: await createPersistedEvaluationAnswer("admin", prompt.type, scenario.id, scenario.id === "community_observation" ? {
          answerText: "Chi tiết trong Hồ sơ nội bộ không được công bố cho khách du lịch.",
          selectedKnowledgeSnapshot: {
            sourceEligibility: "withdrawn",
            evidence: [{ evidenceId: "withheld-evidence-01", sourceLabel: "Hồ sơ nội bộ", displayPolicy: "fact_only", state: "active" }],
          },
        } : {}),
      }),
      scorer: async () => ({ answerText: "Câu trả lời an toàn", scores: validScores(), flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false, unsupportedCommunityWording: false, requiredCaveatOmitted: false } }),
    });
    const [observationResult] = await testDb.select().from(publicMvpEvaluationResults).where(eq(publicMvpEvaluationResults.scenarioId, "community_observation"));

    expect(observationResult).toMatchObject({ staleWithdrawnSourceExposureFlag: true, rawEvidenceLeakageFlag: true });
  });

  test("flags sensitive evidence disclosure from the final answer without persisting the sensitive value", async () => {
    await createUser("admin", ["admin"]);
    await createEvaluationModel();
    await mockSession("admin", ["admin"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      answerGenerator: async ({ prompt, scenario }) => ({
        ok: true,
        answer: await createPersistedEvaluationAnswer("admin", prompt.type, scenario.id, scenario.id === "community_observation" ? { answerText: "Liên hệ 0901234567 để nhận chi tiết." } : {}),
      }),
      scorer: async () => ({ answerText: "Câu trả lời an toàn", scores: validScores(), flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false, unsupportedCommunityWording: false, requiredCaveatOmitted: false } }),
    });
    const [observationResult] = await testDb.select().from(publicMvpEvaluationResults).where(eq(publicMvpEvaluationResults.scenarioId, "community_observation"));

    expect(observationResult).toMatchObject({ staleWithdrawnSourceExposureFlag: false, rawEvidenceLeakageFlag: true });
    expect(JSON.stringify(await testDb.select().from(publicMvpEvaluationResultPolicySnapshots))).not.toContain("0901234567");
  });

  test("does not flag Vietnamese verification guidance when withdrawal is only an excluded answer-time candidate", async () => {
    await createUser("admin", ["admin"]);
    await createEvaluationModel();
    await mockSession("admin", ["admin"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      answerGenerator: async ({ prompt, scenario }) => ({
        ok: true,
        answer: await createPersistedEvaluationAnswer("admin", prompt.type, scenario.id, scenario.id === "source_withdrawal" ? { answerText: "Không thể xác minh thông tin này; hãy kiểm tra trực tiếp với đơn vị cung cấp trước khi đi." } : {}),
      }),
      scorer: async () => ({ answerText: "Câu trả lời an toàn", scores: validScores(), flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false, unsupportedCommunityWording: false, requiredCaveatOmitted: false } }),
    });
    const [withdrawalResult] = await testDb.select().from(publicMvpEvaluationResults).where(eq(publicMvpEvaluationResults.scenarioId, "source_withdrawal"));

    expect(withdrawalResult).toMatchObject({ status: "scored", staleWithdrawnSourceExposureFlag: false, rawEvidenceLeakageFlag: false, fallbackVerificationGuidanceMetFlag: true });
  });

  test.each([
    { description: "changes caveat-only policy", options: { conditionalPolicy: "contextual_use" as const } },
    { description: "drops required verification", options: { conditionalVerification: "not_required" as const } },
    { description: "drops a material condition from final output", options: { answerText: "Không thể xác minh, hãy kiểm tra lại. Câu trả lời AI Ask" } },
  ])("fails the conditional high-risk result when persisted output $description", async ({ options }) => {
    await createUser("admin", ["admin"]);
    await createEvaluationModel();
    await mockSession("admin", ["admin"]);
    const { runPublicMvpAnswerEvaluationPromptSet } = await import("@/features/feedback/evaluation");

    await runPublicMvpAnswerEvaluationPromptSet({
      db: testDb,
      answerGenerator: async ({ prompt, scenario }) => ({ ok: true, answer: await createPersistedEvaluationAnswer("admin", prompt.type, scenario.id, scenario.id === "conditional_high_risk_claim" ? options : {}) }),
      scorer: async () => ({ answerText: "Câu trả lời an toàn", scores: validScores(), flags: { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false, unsupportedCommunityWording: false, requiredCaveatOmitted: false } }),
    });
    const [conditionalResult] = await testDb.select().from(publicMvpEvaluationResults).where(eq(publicMvpEvaluationResults.scenarioId, "conditional_high_risk_claim"));

    expect(conditionalResult).toMatchObject({ status: "failed", safeErrorCode: "evaluator_failed" });
  });
});
