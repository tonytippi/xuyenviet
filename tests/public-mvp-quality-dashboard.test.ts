import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  answerUsefulnessFeedback,
  assistantResponseProvenance,
  assistantRetrievalDecisions,
  conversations,
  messages,
  publicMvpEvaluationPromptSets,
  publicMvpEvaluationResultPolicySnapshots,
  publicMvpEvaluationResultScores,
  publicMvpEvaluationResults,
  publicMvpEvaluationRuns,
  knowledgeCards,
  knowledgeRecommendations,
  knowledgeSamplingCohortMembers,
  knowledgeSamplingPolicies,
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
  provenanceUsed = true,
}: {
  userId: string;
  promptType: PublicMvpEvaluationPromptType;
  score?: number;
  createdAt?: Date;
  flags?: Partial<{
    unsupportedClaim: boolean;
    missingUncertainty: boolean;
    noBetterThanGeneric: boolean;
    unsupportedCommunityWording: boolean;
    requiredCaveatOmitted: boolean;
    conflictedKnowledgeExcluded: boolean;
    staleWithdrawnSourceExposure: boolean;
    rawEvidenceLeakage: boolean;
    fallbackVerificationGuidanceMet: boolean;
  }>;
  withRetrieval?: boolean;
  provenanceUsed?: boolean;
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
      { userId, conversationId: answer.conversation.id, userMessageId: answer.userMessage.id, assistantMessageId: answer.assistantMessage.id, sourceCategory: "knowledge", rank: 1, sourceType: "knowledge_card", verificationStatus: "verified", usedInPrompt: provenanceUsed, citedInAnswer: false, sourceSnapshot: { title: "safe metadata" } },
      { userId, conversationId: answer.conversation.id, userMessageId: answer.userMessage.id, assistantMessageId: answer.assistantMessage.id, sourceCategory: "web", rank: 2, sourceType: "web_search", verificationStatus: "unverified", usedInPrompt: provenanceUsed, citedInAnswer: false, sourceSnapshot: { title: "safe web metadata" } },
      { userId, conversationId: answer.conversation.id, userMessageId: answer.userMessage.id, assistantMessageId: answer.assistantMessage.id, sourceCategory: "chat_context", rank: 3, sourceType: "chat_context", verificationStatus: "verified", usedInPrompt: provenanceUsed, citedInAnswer: false, sourceSnapshot: { field: "children" } },
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
      scenarioId: "community_observation",
      scenarioVersion: "v1",
      modelVersion: "cx/ai-ask",
      status: "scored",
      answerText: "Safe stored answer text that must not be exposed by dashboard tests.",
      unsupportedClaimFlag: Boolean(flags.unsupportedClaim),
      missingUncertaintyFlag: Boolean(flags.missingUncertainty),
      noBetterThanGenericFlag: Boolean(flags.noBetterThanGeneric),
      unsupportedCommunityWordingFlag: Boolean(flags.unsupportedCommunityWording),
      requiredCaveatOmittedFlag: Boolean(flags.requiredCaveatOmitted),
      conflictedKnowledgeExcludedFlag: flags.conflictedKnowledgeExcluded ?? true,
      staleWithdrawnSourceExposureFlag: Boolean(flags.staleWithdrawnSourceExposure),
      rawEvidenceLeakageFlag: Boolean(flags.rawEvidenceLeakage),
      fallbackVerificationGuidanceMetFlag: flags.fallbackVerificationGuidanceMet ?? true,
      assistantMessageId: answer.assistantMessage.id,
      retrievalDecisionId: decision?.id ?? null,
      provenanceId: knowledgeProvenance.id,
      createdAt,
    })
    .returning();

  await testDb.insert(publicMvpEvaluationResultScores).values(scoreDimensions.map((dimension) => ({ resultId: result.id, dimension, score })));

  return { ...result, conversationId: answer.conversation.id };
}

async function seedPolicySnapshot(resultId: string) {
  await testDb.insert(publicMvpEvaluationResultPolicySnapshots).values({
    resultId,
    scenarioId: "conditional_high_risk_claim",
    scenarioVersion: "v1",
    selectedKnowledge: [{ cardId: "safe-card", contentVersion: 1, knowledgeState: "conditional", verificationState: "required", usePolicy: "caveat_only", conditions: ["Xác minh trước khi dùng"] }],
    excludedCandidateCounts: { conflict: 0, verificationRequired: 1, other: 0 },
    excludedReasonCodes: ["verification_required"],
    targetCandidateExcluded: true,
    sourceOrEvidenceOutcome: "withdrawn_or_ineligible",
    webFallback: { triggered: true, guidanceMet: false },
    finalizationOutcome: "verification_guidance_missing",
  });
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

async function seedFeedbackForAssistantMessages(userId: string, results: Array<{ conversationId: string; assistantMessageId: string | null }>, usefulCount: number) {
  for (const [index, result] of results.entries()) {
    if (!result.assistantMessageId) {
      continue;
    }

    await testDb.insert(answerUsefulnessFeedback).values({
      userId,
      conversationId: result.conversationId,
      assistantMessageId: result.assistantMessageId,
      rating: index < usefulCount ? "useful" : "not_useful",
      comment: index === 0 ? "Feedback magic-moment." : null,
    });
  }
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
    expect(dashboard.readiness.missingSignals).toContain("Cần thêm 10 phản hồi usefulness cho magic-moment.");
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
    expect(dashboard.readiness.missingSignals).toContain("Cần thêm 10 phản hồi usefulness cho magic-moment.");
    expect(dashboard.recentResults[0].retrieval.available).toBe(false);
    expect(dashboard.recentResults[0].likelyIssues).toContain("retrieval_decision_unavailable");
  });

  test("requires magic-moment-linked feedback for readiness instead of global feedback", async () => {
    await createUser("admin", ["admin"]);
    await mockSession("admin", ["admin"]);
    await seedFeedback("admin", 10, 10);
    const magicMomentResults = [];

    for (let index = 0; index < 10; index += 1) {
      magicMomentResults.push(await seedEvaluationResult({ userId: "admin", promptType: "magic_moment_family_trip", score: 8 }));
    }

    await seedFeedbackForAssistantMessages("admin", magicMomentResults, 7);
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    const withoutLinkedFeedback = await getPublicMvpQualityDashboard({ db: testDb, range: "all", promptType: "route_logistics" });
    const withLinkedFeedback = await getPublicMvpQualityDashboard({ db: testDb, range: "all" });

    expect(withoutLinkedFeedback.success ? withoutLinkedFeedback.readiness.status : null).toBe("not_ready");
    expect(withoutLinkedFeedback.success ? withoutLinkedFeedback.readiness.missingSignals : []).toContain("Cần thêm 10 phản hồi usefulness cho magic-moment.");
    expect(withLinkedFeedback.success ? withLinkedFeedback.readiness.status : null).toBe("ready");
  });

  test("does not report provenance categories that were stored but not used or cited", async () => {
    await createUser("admin", ["admin"]);
    await mockSession("admin", ["admin"]);
    await seedEvaluationResult({ userId: "admin", promptType: "service_activity", score: 6, flags: { unsupportedClaim: true }, provenanceUsed: false });
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    const dashboard = await getPublicMvpQualityDashboard({ db: testDb, range: "all" });

    expect(dashboard.success).toBe(true);
    if (!dashboard.success) return;
    expect(dashboard.recentResults[0].provenance.knowledge).toBe(false);
    expect(dashboard.recentResults[0].provenance.web).toBe(false);
    expect(dashboard.recentResults[0].provenance.chat_context).toBe(false);
    expect(dashboard.recentResults[0].likelyIssues).toContain("unsupported_without_source_signal");
    expect(dashboard.recentResults[0].likelyIssues).toContain("provenance_unavailable");
  });

  test("projects bounded policy failures and version-fenced sampling cohorts without raw content", async () => {
    await createUser("admin", ["admin"]);
    await createUser("author");
    await mockSession("admin", ["admin"]);
    const result = await seedEvaluationResult({
      userId: "admin",
      promptType: "freshness_sensitive",
      flags: {
        unsupportedClaim: true,
        unsupportedCommunityWording: true,
        requiredCaveatOmitted: true,
        conflictedKnowledgeExcluded: false,
        staleWithdrawnSourceExposure: true,
        rawEvidenceLeakage: true,
        fallbackVerificationGuidanceMet: false,
      },
    });
    await seedPolicySnapshot(result.id);
    await testDb.insert(knowledgeCards).values([
      { id: "sampled", status: "approved", publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "reviewed", verificationState: "required", type: "warning", title: "Safe sampled card", summary: "Safe summary", confidence: "community", needsReview: true, aiPromptVersion: "test", createdByUserId: "author", contentVersion: 2, evidenceSetRevision: 2 },
      { id: "unselected", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Safe unselected card", summary: "Safe summary", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" },
      { id: "verify-first", status: "approved", publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "reviewed", verificationState: "required", type: "service", title: "Safe verify card", summary: "Safe summary", confidence: "community", needsReview: true, aiPromptVersion: "test", createdByUserId: "author" },
    ]);
    const [policy] = await testDb.insert(knowledgeSamplingPolicies).values({ cohortKey: "initial:2026-07-24", windowStartsAt: new Date("2026-07-24T00:00:00.000Z"), windowEndsAt: new Date("2026-08-21T00:00:00.000Z"), samplingPercent: 15, escalatedAt: new Date(), suppressedAt: new Date() }).returning();
    await testDb.insert(knowledgeSamplingCohortMembers).values([
      { policyId: policy.id, knowledgeCardId: "sampled", contentVersion: 1, evidenceSetRevision: 1 },
      { policyId: policy.id, knowledgeCardId: "unselected", contentVersion: 1, evidenceSetRevision: 1 },
    ]);
    await testDb.insert(knowledgeRecommendations).values([
      { knowledgeCardId: "sampled", contentVersion: 1, evidenceSetRevision: 1, status: "resolved", reason: "sampling", priority: 50, policyId: policy.id, resolution: "sampling_failed", samplingDispositionReason: "safety_risk", resolvedByUserId: "admin", resolvedAt: new Date(), samplingRationale: "SAMPLING_RATIONALE_MUST_NOT_LEAK" },
      { knowledgeCardId: "sampled", contentVersion: 2, evidenceSetRevision: 2, status: "resolved", reason: "sampling", priority: 50, policyId: policy.id, resolution: "sampling_passed", samplingDispositionReason: "confirmed", resolvedByUserId: "admin", resolvedAt: new Date() },
      { knowledgeCardId: "verify-first", contentVersion: 1, evidenceSetRevision: 1, status: "open", reason: "verification", priority: 50, policyId: policy.id },
    ]);
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    const dashboard = await getPublicMvpQualityDashboard({ db: testDb, promptType: "route_logistics", range: "all" });

    expect(dashboard.success).toBe(true);
    if (!dashboard.success) return;
    expect(dashboard.policySignals.evaluation.scope).toBe("filtered_evaluations");
    expect(dashboard.policySignals.evaluation.totalResults).toBe(0);
    expect(dashboard.policySignals.sampling.scope).toBe("all_sampling_policies");
    expect(dashboard.policySignals.sampling).toMatchObject({ cohortMembers: 2, sampledFailed: 1, sampledPassed: 0, pendingMembers: 0, unselectedMembers: 1, verificationRequiredCurrentCards: 2, escalatedCohorts: 1, suppressedCohorts: 1 });
    expect(dashboard.policySignals.cohorts).toMatchObject([{ cohortKey: "initial:2026-07-24", state: "suppressed", category: "mixed_current_categories", recommendedSafeAction: "suppress_or_escalate" }]);
    expect(dashboard.policySignals.sampling.members).toMatchObject([
      { samplingOutcome: "failed", category: "current_warning", recommendedSafeAction: "suppress_or_escalate" },
      { samplingOutcome: "unselected", category: "current_place", recommendedSafeAction: "suppress_or_escalate" },
    ]);
    const evaluationDashboard = await getPublicMvpQualityDashboard({ db: testDb, range: "all" });
    expect(evaluationDashboard.success).toBe(true);
    if (!evaluationDashboard.success) return;
    expect(evaluationDashboard.policySignals.evaluation).toMatchObject({
      totalResults: 1,
      evidenceGroundingFailures: 1,
      caveatViolations: 1,
      verificationFailures: 1,
      diagnostics: [{ promptType: "freshness_sensitive", modelVersion: "cx/ai-ask", category: "community_observation", severity: "unavailable", recommendedSafeAction: "suppress_or_escalate" }],
    });
    expect(JSON.stringify(dashboard)).not.toMatch(/Safe stored answer text|SAMPLING_RATIONALE_MUST_NOT_LEAK|safe-card|sourceSnapshot|providerPayload|raw_source_material/);
    expect(dashboard.policySignals.sampling.members.every((member) => !("knowledgeCardId" in member))).toBe(true);
  });

  test("fails closed for missing snapshots and pending sampling while selecting the latest fenced disposition deterministically", async () => {
    await createUser("admin", ["admin"]);
    await createUser("author");
    await mockSession("admin", ["admin"]);
    await seedEvaluationResult({ userId: "admin", promptType: "service_activity", flags: { unsupportedClaim: true } });
    await testDb.insert(knowledgeCards).values([
      { id: "deterministic", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "service", title: "Safe deterministic card", summary: "Safe summary", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" },
      { id: "pending", status: "approved", publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "reviewed", verificationState: "required", type: "warning", title: "Safe pending card", summary: "Safe summary", confidence: "community", needsReview: true, aiPromptVersion: "test", createdByUserId: "author" },
    ]);
    const [policy] = await testDb.insert(knowledgeSamplingPolicies).values({ cohortKey: "initial:2026-07-25", windowStartsAt: new Date("2026-07-25T00:00:00.000Z"), windowEndsAt: new Date("2026-08-22T00:00:00.000Z"), samplingPercent: 15, suppressedAt: new Date() }).returning();
    await testDb.insert(knowledgeSamplingCohortMembers).values([
      { policyId: policy.id, knowledgeCardId: "deterministic", contentVersion: 1, evidenceSetRevision: 1 },
      { policyId: policy.id, knowledgeCardId: "pending", contentVersion: 1, evidenceSetRevision: 1 },
    ]);
    await testDb.insert(knowledgeRecommendations).values([
      { knowledgeCardId: "deterministic", contentVersion: 1, evidenceSetRevision: 1, status: "resolved", reason: "sampling", priority: 50, policyId: policy.id, resolution: "sampling_passed", samplingDispositionReason: "confirmed", resolvedByUserId: "admin", resolvedAt: new Date("2026-07-25T01:00:00.000Z"), updatedAt: new Date("2026-07-25T01:00:00.000Z") },
      { knowledgeCardId: "deterministic", contentVersion: 1, evidenceSetRevision: 1, status: "resolved", reason: "sampling", priority: 50, policyId: policy.id, resolution: "sampling_failed", samplingDispositionReason: "safety_risk", resolvedByUserId: "admin", resolvedAt: new Date("2026-07-25T02:00:00.000Z"), updatedAt: new Date("2026-07-25T02:00:00.000Z") },
      { knowledgeCardId: "pending", contentVersion: 1, evidenceSetRevision: 1, status: "open", reason: "sampling", priority: 50, policyId: policy.id },
    ]);
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    const dashboard = await getPublicMvpQualityDashboard({ db: testDb, range: "all" });

    expect(dashboard.success).toBe(true);
    if (!dashboard.success) return;
    expect(dashboard.policySignals.evaluation.missingSignal).toBe(true);
    expect(dashboard.policySignals.sampling).toMatchObject({ sampledPassed: 0, sampledFailed: 1, pendingMembers: 1, unselectedMembers: 0, verificationRequiredCurrentCards: 1, missingSignal: true });
    expect(dashboard.policySignals.sampling.members).toMatchObject([
      { samplingOutcome: "failed", category: "current_service" },
      { samplingOutcome: "pending", category: "current_warning" },
    ]);
  });

  test("reserves bounded diagnostics for actionable cohorts and excludes verification recommendations from sampling outcomes", async () => {
    await createUser("admin", ["admin"]);
    await createUser("author");
    await mockSession("admin", ["admin"]);
    const activeCards = Array.from({ length: 51 }, (_, index) => ({
      id: `active-${String(index).padStart(2, "0")}`,
      status: "approved" as const,
      publicationState: "active" as const,
      knowledgeState: "community_observation" as const,
      reviewState: "reviewed" as const,
      verificationState: "not_required" as const,
      type: "place" as const,
      title: `Active ${index}`,
      summary: "Safe summary",
      confidence: "community" as const,
      needsReview: false,
      aiPromptVersion: "test",
      createdByUserId: "author",
    }));
    await testDb.insert(knowledgeCards).values([
      ...activeCards,
      { id: "actionable", status: "approved", publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "reviewed", verificationState: "required", type: "warning", title: "Actionable", summary: "Safe summary", confidence: "community", needsReview: true, aiPromptVersion: "test", createdByUserId: "author" },
    ]);
    await testDb.insert(knowledgeSamplingPolicies).values([
      { id: "a-active", cohortKey: "active:2026-07-26", windowStartsAt: new Date("2026-07-26T00:00:00.000Z"), windowEndsAt: new Date("2026-08-23T00:00:00.000Z"), samplingPercent: 15 },
      { id: "z-suppressed", cohortKey: "suppressed:2026-07-26", windowStartsAt: new Date("2026-07-26T00:00:00.000Z"), windowEndsAt: new Date("2026-08-23T00:00:00.000Z"), samplingPercent: 15, escalatedAt: new Date(), suppressedAt: new Date() },
    ]);
    await testDb.insert(knowledgeSamplingCohortMembers).values([
      ...activeCards.map((card) => ({ policyId: "a-active", knowledgeCardId: card.id, contentVersion: 1, evidenceSetRevision: 1 })),
      { policyId: "z-suppressed", knowledgeCardId: "actionable", contentVersion: 1, evidenceSetRevision: 1 },
    ]);
    await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "actionable", contentVersion: 1, evidenceSetRevision: 1, status: "open", reason: "verification", priority: 50, policyId: "z-suppressed" });
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    const dashboard = await getPublicMvpQualityDashboard({ db: testDb, range: "all" });

    expect(dashboard.success).toBe(true);
    if (!dashboard.success) return;
    expect(dashboard.policySignals.cohorts).toMatchObject([
      { cohortKey: "suppressed:2026-07-26", state: "suppressed", recommendedSafeAction: "suppress_or_escalate" },
      { cohortKey: "active:2026-07-26", state: "active", recommendedSafeAction: "stricter_sampling" },
    ]);
    expect(dashboard.policySignals.sampling.missingSignal).toBe(true);
    expect(dashboard.policySignals.sampling.members).toContainEqual(expect.objectContaining({ samplingOutcome: "unselected", recommendedSafeAction: "suppress_or_escalate" }));
    expect(JSON.stringify(dashboard.policySignals.sampling.members)).not.toMatch(/actionable|active-00/);
  });
});
