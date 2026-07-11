import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  answerUsefulnessFeedback,
  assistantResponseProvenance,
  assistantRetrievalDecisions,
  conversations,
  messages,
  publicMvpEvaluationPromptSets,
  publicMvpEvaluationResultScores,
  publicMvpEvaluationResults,
  publicMvpEvaluationRuns,
  userRoles,
  users,
  type PublicMvpEvaluationPromptType,
  type PublicMvpEvaluationScoreDimension,
  type UserRole,
} from "@/db/schema";

import { testDb } from "./helpers/db";

const sessionWithRolesMock = vi.fn();

vi.mock("@/server/auth", () => ({
  getAuthenticatedSessionWithRoles: sessionWithRolesMock,
  hasAdminAccess: (roles: UserRole[]) => roles.includes("admin") || roles.includes("operator"),
}));

const scoreDimensions = ["user_context_use", "practical_specificity", "source_grounding", "uncertainty_handling", "family_awareness", "vietnamese_clarity"] as const satisfies readonly PublicMvpEvaluationScoreDimension[];

async function createUser(userId: string, roles: UserRole[] = []) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });

  if (roles.length > 0) {
    await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
  }
}

async function mockSession(userId: string | null, roles: UserRole[] = []) {
  sessionWithRolesMock.mockResolvedValue(userId ? { userId, email: `${userId}@example.com`, roles } : null);
}

async function seedAssistantAnswer(userId: string) {
  const [conversation] = await testDb.insert(conversations).values({ userId }).returning({ id: conversations.id });
  const [userMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId, role: "user", content: "Đi Đà Lạt với trẻ nhỏ." }).returning({ id: messages.id });
  const [assistantMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId, role: "assistant", content: "Nên chia chặng và kiểm tra thời tiết." }).returning({ id: messages.id });

  return { conversation, userMessage, assistantMessage };
}

async function seedEvaluationResult({
  userId,
  promptType,
  score = 8,
  createdAt = new Date(),
  flags = {},
  withRetrieval = true,
}: {
  userId: string;
  promptType: PublicMvpEvaluationPromptType;
  score?: number;
  createdAt?: Date;
  flags?: Partial<{ unsupportedClaim: boolean; missingUncertainty: boolean; noBetterThanGeneric: boolean }>;
  withRetrieval?: boolean;
}) {
  const [promptSet] = await testDb
    .insert(publicMvpEvaluationPromptSets)
    .values({ version: "public_mvp_v1", rubricVersion: "epic_6_quality_rubric_v1" })
    .onConflictDoUpdate({ target: publicMvpEvaluationPromptSets.version, set: { rubricVersion: "epic_6_quality_rubric_v1" } })
    .returning();
  const [run] = await testDb
    .insert(publicMvpEvaluationRuns)
    .values({ promptSetId: promptSet.id, promptSetVersion: promptSet.version, actorUserId: userId, modelVersion: "cx/evaluator", status: "completed", completedAt: createdAt, startedAt: createdAt })
    .returning();
  const answer = await seedAssistantAnswer(userId);
  const [decision] = withRetrieval
    ? await testDb
        .insert(assistantRetrievalDecisions)
        .values({
          userId,
          conversationId: answer.conversation.id,
          userMessageId: answer.userMessage.id,
          assistantMessageId: answer.assistantMessage.id,
          approvedKnowledgeCandidateCount: 3,
          approvedKnowledgeSelectedCount: 1,
          approvedKnowledgeTargetCount: 3,
          approvedKnowledgeRelevanceThreshold: 0.6,
          broadPlanningQuestion: false,
          freshnessRequired: Boolean(flags.missingUncertainty),
          conflictDetected: false,
          webSearchTriggered: true,
          webSearchTriggerReasons: ["freshness_sensitive_request"],
          generalReasoningUsed: true,
          warnings: ["verify_freshness"],
        })
        .returning()
    : [undefined];
  const [knowledgeProvenance] = await testDb
    .insert(assistantResponseProvenance)
    .values([
      { userId, conversationId: answer.conversation.id, userMessageId: answer.userMessage.id, assistantMessageId: answer.assistantMessage.id, sourceCategory: "knowledge", rank: 1, sourceType: "knowledge_card", verificationStatus: "verified", sourceSnapshot: { title: "safe metadata" } },
      { userId, conversationId: answer.conversation.id, userMessageId: answer.userMessage.id, assistantMessageId: answer.assistantMessage.id, sourceCategory: "web", rank: 2, sourceType: "web_search", verificationStatus: "unverified", sourceSnapshot: { title: "safe web metadata" } },
      { userId, conversationId: answer.conversation.id, userMessageId: answer.userMessage.id, assistantMessageId: answer.assistantMessage.id, sourceCategory: "chat_context", rank: 3, sourceType: "chat_context", verificationStatus: "verified", sourceSnapshot: { field: "children" } },
    ])
    .returning();
  const [result] = await testDb
    .insert(publicMvpEvaluationResults)
    .values({
      runId: run.id,
      promptSetId: promptSet.id,
      promptSetVersion: promptSet.version,
      promptType,
      promptVersion: `${promptType}_v1`,
      modelVersion: "cx/ai-ask",
      status: "scored",
      answerText: "Safe stored answer text that must not be exposed by dashboard tests.",
      unsupportedClaimFlag: Boolean(flags.unsupportedClaim),
      missingUncertaintyFlag: Boolean(flags.missingUncertainty),
      noBetterThanGenericFlag: Boolean(flags.noBetterThanGeneric),
      assistantMessageId: answer.assistantMessage.id,
      retrievalDecisionId: decision?.id ?? null,
      provenanceId: knowledgeProvenance.id,
      createdAt,
    })
    .returning();

  await testDb.insert(publicMvpEvaluationResultScores).values(scoreDimensions.map((dimension) => ({ resultId: result.id, dimension, score })));

  return { ...result, conversationId: answer.conversation.id };
}

async function seedFeedback(userId: string, count: number, usefulCount: number, createdAt = new Date()) {
  for (let index = 0; index < count; index += 1) {
    const answer = await seedAssistantAnswer(userId);
    await testDb.insert(answerUsefulnessFeedback).values({
      userId,
      conversationId: answer.conversation.id,
      assistantMessageId: answer.assistantMessage.id,
      rating: index < usefulCount ? "useful" : "not_useful",
      comment: index === 0 ? " Rất hữu ích cho gia đình, không chứa raw source. " : null,
      createdAt,
      updatedAt: createdAt,
    });
  }
}

async function seedFeedbackForAssistantMessage(userId: string, conversationId: string, assistantMessageId: string, rating: "useful" | "not_useful" = "useful") {
  await testDb.insert(answerUsefulnessFeedback).values({
    userId,
    conversationId,
    assistantMessageId,
    rating,
    comment: "Feedback gắn với eval prompt cụ thể.",
  });
}

describe("public MVP quality dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("rejects unauthenticated and traveler access before returning aggregates", async () => {
    await createUser("traveler", ["traveler"]);
    await mockSession(null);
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    await expect(getPublicMvpQualityDashboard({ db: testDb })).resolves.toEqual({ success: false, reason: "unauthorized" });

    await mockSession("traveler", ["traveler"]);
    await expect(getPublicMvpQualityDashboard({ db: testDb })).resolves.toEqual({ success: false, reason: "unauthorized" });
  });

  test("aggregates feedback, scores, counter metrics, readiness, and safe diagnostics", async () => {
    await createUser("admin", ["admin"]);
    await mockSession("admin", ["admin"]);
    await seedFeedback("admin", 10, 8);
    await seedEvaluationResult({ userId: "admin", promptType: "magic_moment_family_trip", score: 9 });
    await seedEvaluationResult({ userId: "admin", promptType: "freshness_sensitive", score: 7, flags: { missingUncertainty: true } });
    await seedEvaluationResult({ userId: "admin", promptType: "service_activity", score: 6, flags: { unsupportedClaim: true, noBetterThanGeneric: true } });
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    const dashboard = await getPublicMvpQualityDashboard({ db: testDb, range: "all" });

    expect(dashboard.success).toBe(true);
    if (!dashboard.success) return;
    expect(dashboard.feedback).toMatchObject({ total: 10, useful: 8, notUseful: 2, usefulRate: 0.8 });
    expect(dashboard.feedback.recentComments).toEqual(["Rất hữu ích cho gia đình, không chứa raw source."]);
    expect(dashboard.evaluation).toMatchObject({ totalResults: 3, scoredResults: 3, failedResults: 0 });
    expect(dashboard.evaluation.averageScore).toBeCloseTo(7.3, 1);
    expect(dashboard.evaluation.counterMetrics).toEqual({ unsupportedClaims: 1, missingUncertainty: 1, noBetterThanGeneric: 1 });
    expect(dashboard.readiness.status).toBe("not_ready");
    expect(dashboard.readiness.missingSignals).toContain("Cần thêm 7 kết quả eval được chấm điểm đầy đủ.");
    expect(dashboard.recentResults[0].retrieval.available).toBe(true);
    expect(dashboard.recentResults[0].provenance.knowledge).toBe(true);
    expect(dashboard.recentResults[0].provenance.web).toBe(true);
    expect(JSON.stringify(dashboard)).not.toMatch(/Safe stored answer text|raw_source_material|providerPayload|operatorOnlyNotes/);
  });

  test("filters evaluation and linked feedback by prompt type and falls back from invalid filters", async () => {
    await createUser("operator", ["operator"]);
    await mockSession("operator", ["operator"]);
    const magicMomentResult = await seedEvaluationResult({ userId: "operator", promptType: "magic_moment_family_trip", score: 9 });
    const routeResult = await seedEvaluationResult({ userId: "operator", promptType: "route_logistics", score: 5, flags: { noBetterThanGeneric: true } });
    await seedFeedbackForAssistantMessage("operator", magicMomentResult.conversationId, magicMomentResult.assistantMessageId ?? "", "useful");
    await seedFeedbackForAssistantMessage("operator", routeResult.conversationId, routeResult.assistantMessageId ?? "", "not_useful");
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    const filtered = await getPublicMvpQualityDashboard({ db: testDb, promptType: "route_logistics", range: "all" });
    const fallback = await getPublicMvpQualityDashboard({ db: testDb, promptType: "bad", range: "bad" });

    expect(filtered.success ? filtered.filters.promptType : null).toBe("route_logistics");
    expect(filtered.success ? filtered.evaluation.totalResults : null).toBe(1);
    expect(filtered.success ? filtered.evaluation.averageScore : null).toBe(5);
    expect(filtered.success ? filtered.feedback : null).toMatchObject({ total: 1, useful: 0, notUseful: 1 });
    expect(fallback.success ? fallback.filters : null).toMatchObject({ promptType: "all", range: "30d" });
  });

  test("applies time-range filters to feedback, evaluation, recent diagnostics, and readiness", async () => {
    await createUser("admin", ["admin"]);
    await mockSession("admin", ["admin"]);
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    await seedFeedback("admin", 1, 1, oldDate);
    await seedEvaluationResult({ userId: "admin", promptType: "magic_moment_family_trip", score: 9, createdAt: oldDate });
    await seedFeedback("admin", 1, 0);
    await seedEvaluationResult({ userId: "admin", promptType: "route_logistics", score: 5 });
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    const dashboard = await getPublicMvpQualityDashboard({ db: testDb, range: "7d" });

    expect(dashboard.success).toBe(true);
    if (!dashboard.success) return;
    expect(dashboard.feedback).toMatchObject({ total: 1, useful: 0, notUseful: 1 });
    expect(dashboard.evaluation).toMatchObject({ totalResults: 1, scoredResults: 1 });
    expect(dashboard.recentResults).toHaveLength(1);
    expect(dashboard.recentResults[0].promptType).toBe("route_logistics");
    expect(dashboard.readiness.missingSignals).toContain("Chưa có kết quả magic-moment được chấm điểm.");
  });

  test("reports missing signals and unavailable retrieval/provenance links explicitly", async () => {
    await createUser("admin", ["admin"]);
    await mockSession("admin", ["admin"]);
    await seedEvaluationResult({ userId: "admin", promptType: "sparse_data", score: 6, flags: { noBetterThanGeneric: true }, withRetrieval: false });
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    const dashboard = await getPublicMvpQualityDashboard({ db: testDb, range: "all" });

    expect(dashboard.success).toBe(true);
    if (!dashboard.success) return;
    expect(dashboard.feedback.total).toBe(0);
    expect(dashboard.readiness.status).toBe("not_ready");
    expect(dashboard.readiness.missingSignals).toContain("Cần thêm 10 phản hồi usefulness.");
    expect(dashboard.recentResults[0].retrieval.available).toBe(false);
    expect(dashboard.recentResults[0].likelyIssues).toContain("retrieval_decision_unavailable");
  });
});
