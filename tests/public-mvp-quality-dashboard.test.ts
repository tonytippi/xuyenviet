import { beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

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
  knowledgeCardEvidence,
  knowledgeCardSources,
  knowledgeIngestionJobs,
  knowledgeRecommendations,
  knowledgeSamplingCandidateLedger,
  knowledgeSamplingCohortMembers,
  knowledgeSamplingPolicies,
  knowledgeVerifyFirstSamplingObligations,
  sources,
  userRoles,
  users,
  type PublicMvpEvaluationPromptType,
  type PublicMvpEvaluationScoreDimension,
  type UserRole,
} from "@/db/schema";

import { testDb } from "./helpers/db";
import { seedKnowledgeCardEvidence, seedSourceCaptureVersion } from "./helpers/source-captures";

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

async function seedCanonicalEvaluationRun(input: { userId: string; completedAt: Date; omitScenario?: string; missingScoreScenario?: string; highSeverity?: boolean; qualityGap?: boolean }) {
  const { publicMvpEvaluationPromptSetVersion, publicMvpEvaluationScenarios } = await import("@/features/feedback/evaluation");
  const [promptSet] = await testDb.insert(publicMvpEvaluationPromptSets).values({ version: publicMvpEvaluationPromptSetVersion, rubricVersion: "epic_6_quality_rubric_ai_first_v2" }).onConflictDoNothing().returning();
  const persistedPromptSet = promptSet ?? (await testDb.select().from(publicMvpEvaluationPromptSets).where(eq(publicMvpEvaluationPromptSets.version, publicMvpEvaluationPromptSetVersion)))[0];
  if (!persistedPromptSet) throw new Error("expected prompt set");
  const [run] = await testDb.insert(publicMvpEvaluationRuns).values({ promptSetId: persistedPromptSet.id, promptSetVersion: persistedPromptSet.version, actorUserId: input.userId, modelVersion: "cx/evaluator", status: "completed", startedAt: input.completedAt, completedAt: input.completedAt }).returning();
  const scenarios = publicMvpEvaluationScenarios.filter((scenario) => scenario.id !== input.omitScenario);
  for (const scenario of scenarios) {
    const [result] = await testDb.insert(publicMvpEvaluationResults).values({ runId: run.id, promptSetId: persistedPromptSet.id, promptSetVersion: persistedPromptSet.version, promptType: scenario.prompt.type, promptVersion: scenario.prompt.version, scenarioId: scenario.id, scenarioVersion: scenario.version, modelVersion: "cx/evaluator", status: "scored", answerText: "Canonical evaluation answer.", staleWithdrawnSourceExposureFlag: input.highSeverity === true && scenario.id === "source_withdrawal", unsupportedClaimFlag: input.qualityGap === true && scenario.id === "community_observation" }).returning();
    await testDb.insert(publicMvpEvaluationResultPolicySnapshots).values({ resultId: result.id, scenarioId: scenario.id, scenarioVersion: scenario.version, selectedKnowledge: [], excludedCandidateCounts: {}, excludedReasonCodes: [], targetCandidateExcluded: false, sourceOrEvidenceOutcome: "eligible", webFallback: {}, finalizationOutcome: "complete" });
    await testDb.insert(publicMvpEvaluationResultScores).values(scoreDimensions.filter((dimension) => input.missingScoreScenario !== scenario.id || dimension !== "user_context_use").map((dimension) => ({ resultId: result.id, dimension, score: 8 })));
  }
  return run;
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

async function seedSamplingFence(input: { id: string; userId: string; publicationState?: "active" | "suppressed"; contentVersion?: number; evidenceSetRevision?: number; validEvidence?: boolean }) {
  const contentVersion = input.contentVersion ?? 1;
  const evidenceSetRevision = input.evidenceSetRevision ?? 1;
  const rawText = `Evidence ${input.id}.`;
  await testDb.insert(sources).values({ id: `source-${input.id}`, kind: "url", url: `https://example.com/${input.id}`, label: `Source ${input.id}`, sourceType: "community", submittedByUserId: input.userId });
  const capture = await seedSourceCaptureVersion({ id: `capture-${input.id}`, sourceId: `source-${input.id}`, captureKind: "url", rawText });
  await testDb.insert(knowledgeCards).values({ id: input.id, status: "approved", publicationState: input.publicationState ?? "active", knowledgeState: input.publicationState === "suppressed" ? "uncertain" : "community_observation", reviewState: input.publicationState === "suppressed" ? "ai_recommended" : "reviewed", verificationState: input.publicationState === "suppressed" ? "required" : "not_required", type: "place", title: `Card ${input.id}`, summary: "Safe summary", locationName: "Huế", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: input.userId, contentVersion, evidenceSetRevision });
  await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: input.id, sourceId: `source-${input.id}`, supportLevel: "primary" });
  await seedKnowledgeCardEvidence({ cardId: input.id, sourceId: `source-${input.id}`, captureVersionId: capture.id, quoteText: rawText, state: input.validEvidence === false ? "removed" : "active" });
  await testDb.insert(knowledgeIngestionJobs).values({ id: `job-${input.id}`, sourceId: `source-${input.id}`, captureVersionId: capture.id, submittedByUserId: input.userId, submittedByEmail: `${input.userId}@example.com`, stage: "published" });
  return { contentVersion, evidenceSetRevision, jobId: `job-${input.id}` };
}

function enrollmentEntry(id: string, contentVersion = 1, evidenceSetRevision = 1, selectedForSampling = true) {
  return `${id}:${contentVersion}:${evidenceSetRevision}:Huế:false:${selectedForSampling}`;
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
    expect(dashboard.readiness.missingSignals).toContain("Chưa có một run eval hiện hành đầy đủ sáu scenario, snapshot và rubric score; readiness bị chặn.");
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
    const allRange = await getPublicMvpQualityDashboard({ db: testDb, range: "all" });
    expect(dashboard.readiness).toEqual(allRange.success ? allRange.readiness : null);
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
    expect(withoutLinkedFeedback.success ? withoutLinkedFeedback.readiness : null).toEqual(withLinkedFeedback.success ? withLinkedFeedback.readiness : null);
    expect(withLinkedFeedback.success ? withLinkedFeedback.readiness.status : null).toBe("not_ready");
    expect(withLinkedFeedback.success ? withLinkedFeedback.readiness.missingSignals : []).toContain("Còn thiếu 100 thẻ hiện hành có evidence hợp lệ; phê duyệt lịch sử không được tính.");
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

  test("fails readiness for 99 active cards and accepts the 100-card corpus threshold", async () => {
    await createUser("threshold-admin", ["admin"]);
    await mockSession("threshold-admin", ["admin"]);
    const { getActiveEvidenceGroundedSeedCoverageForReadiness } = await import("@/features/knowledge/batch-intake");
    for (let index = 0; index < 100; index += 1) {
      await seedSamplingFence({ id: `threshold-${index}`, userId: "threshold-admin" });
    }
    await testDb.update(knowledgeCards).set({ publicationState: "suppressed" }).where(eq(knowledgeCards.id, "threshold-99"));
    await expect(getActiveEvidenceGroundedSeedCoverageForReadiness(testDb)).resolves.toMatchObject({ activeEvidenceGroundedCards: 99, remainingActiveCards: 1, isComplete: false });
    await testDb.update(knowledgeCards).set({ publicationState: "active" }).where(eq(knowledgeCards.id, "threshold-99"));
    await expect(getActiveEvidenceGroundedSeedCoverageForReadiness(testDb)).resolves.toMatchObject({ activeEvidenceGroundedCards: 100, remainingActiveCards: 0, isComplete: true });
    const capture = await seedSourceCaptureVersion({ id: "replacement-capture", sourceId: "source-threshold-0", captureKind: "url", rawText: "Replacement evidence." , versionSequence: 2 });
    await expect(getActiveEvidenceGroundedSeedCoverageForReadiness(testDb)).resolves.toMatchObject({ activeEvidenceGroundedCards: 99, remainingActiveCards: 1, isComplete: false });
    await testDb.update(knowledgeCardEvidence).set({ captureVersionId: capture.id, quoteText: "Replacement evidence.", spanEnd: "Replacement evidence.".length }).where(eq(knowledgeCardEvidence.knowledgeCardId, "threshold-0"));
    await expect(getActiveEvidenceGroundedSeedCoverageForReadiness(testDb)).resolves.toMatchObject({ activeEvidenceGroundedCards: 100, isComplete: true });
  });

  test("keeps readiness corpus-wide across dashboard filters and includes suppressed unresolved work", async () => {
    await createUser("diagnostic-admin", ["admin"]);
    await mockSession("diagnostic-admin", ["admin"]);
    await seedSamplingFence({ id: "suppressed-remediation", userId: "diagnostic-admin", publicationState: "suppressed" });
    const { getActiveEvidenceGroundedSeedCoverageForReadiness } = await import("@/features/knowledge/batch-intake");
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    await expect(getActiveEvidenceGroundedSeedCoverageForReadiness(testDb)).resolves.toMatchObject({ pendingReviewCards: 1, pendingVerificationCards: 1 });
    const [all, filtered] = await Promise.all([
      getPublicMvpQualityDashboard({ db: testDb, range: "all" }),
      getPublicMvpQualityDashboard({ db: testDb, promptType: "route_logistics", range: "7d" }),
    ]);
    expect(all.success && filtered.success ? filtered.readiness : null).toEqual(all.success ? all.readiness : null);
  });

  test("excludes a fully non-corridor policy from the corridor sampling gate", async () => {
    await createUser("outside-admin", ["admin"]);
    const outside = await seedSamplingFence({ id: "outside-fence", userId: "outside-admin" });
    const { enrollmentDigest, getPublicMvpSamplingReadinessEvidence } = await import("@/features/knowledge/recommendations");
    const [policy] = await testDb.insert(knowledgeSamplingPolicies).values({ cohortKey: "outside-policy", windowStartsAt: new Date("2026-01-01"), windowEndsAt: new Date("2026-01-29"), samplingPercent: 15, suppressedAt: new Date(), enrollmentCandidateCount: 1, enrollmentSelectedCount: 1, enrollmentDigest: enrollmentDigest(["outside-fence:1:1::true:true"]), enrollmentSealedAt: new Date() }).returning();
    await testDb.insert(knowledgeSamplingCandidateLedger).values({ terminalIngestionJobId: outside.jobId, policyId: policy.id, knowledgeCardId: "outside-fence", contentVersion: 1, evidenceSetRevision: 1, corridorBucket: "", outsideCorridor: true, selectedForSampling: true });
    await testDb.insert(knowledgeSamplingCohortMembers).values({ policyId: policy.id, knowledgeCardId: "outside-fence", contentVersion: 1, evidenceSetRevision: 1, corridorBucket: null, outsideCorridor: true, selectedForSampling: true });
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: true, policies: 0, zeroApplicablePolicies: 1, highSeverity: 0 });
  });

  test("selects only the newest complete canonical evaluation run and distinguishes high from non-high gaps", async () => {
    await createUser("selector-admin", ["admin"]);
    const { getCurrentReadinessEvaluationEvidence } = await import("@/features/feedback/quality-dashboard");
    const older = await seedCanonicalEvaluationRun({ userId: "selector-admin", completedAt: new Date("2026-01-01") });
    const incomplete = await seedCanonicalEvaluationRun({ userId: "selector-admin", completedAt: new Date("2026-01-02"), omitScenario: "web_fallback_unavailable" });
    const incompleteScores = await seedCanonicalEvaluationRun({ userId: "selector-admin", completedAt: new Date("2026-01-03"), missingScoreScenario: "community_observation" });
    const newer = await seedCanonicalEvaluationRun({ userId: "selector-admin", completedAt: new Date("2026-01-04"), qualityGap: true });
    await expect(getCurrentReadinessEvaluationEvidence(testDb)).resolves.toMatchObject({ complete: true, runId: newer.id, highSeverity: 0, qualityGaps: 1 });
    await testDb.update(publicMvpEvaluationRuns).set({ status: "failed" }).where(eq(publicMvpEvaluationRuns.id, newer.id));
    await expect(getCurrentReadinessEvaluationEvidence(testDb)).resolves.toMatchObject({ complete: true, runId: older.id, highSeverity: 0, qualityGaps: 0 });
    const high = await seedCanonicalEvaluationRun({ userId: "selector-admin", completedAt: new Date("2026-01-05"), highSeverity: true });
    await expect(getCurrentReadinessEvaluationEvidence(testDb)).resolves.toMatchObject({ complete: true, runId: high.id, highSeverity: 1, qualityGaps: 0 });
    expect([incomplete.id, incompleteScores.id]).not.toContain(older.id);
  });

  test("fails closed when a canonical run contains a result from another prompt set", async () => {
    await createUser("mixed-prompt-set-admin", ["admin"]);
    const { publicMvpEvaluationPromptSetVersion } = await import("@/features/feedback/evaluation");
    const { getCurrentReadinessEvaluationEvidence } = await import("@/features/feedback/quality-dashboard");
    const run = await seedCanonicalEvaluationRun({ userId: "mixed-prompt-set-admin", completedAt: new Date("2026-01-10") });
    const [otherPromptSet] = await testDb.insert(publicMvpEvaluationPromptSets).values({ version: `${publicMvpEvaluationPromptSetVersion}-other`, rubricVersion: "test" }).returning();
    await testDb.update(publicMvpEvaluationResults).set({ promptSetId: otherPromptSet!.id, promptSetVersion: otherPromptSet!.version }).where(eq(publicMvpEvaluationResults.runId, run.id));

    await expect(getCurrentReadinessEvaluationEvidence(testDb)).resolves.toMatchObject({ complete: false, runId: null });
  });

  test("uses only the newest canonical run for baseline checks and keeps non-high gaps diagnostic", async () => {
    await createUser("baseline-admin", ["admin"]);
    await mockSession("baseline-admin", ["admin"]);
    const older = await seedCanonicalEvaluationRun({ userId: "baseline-admin", completedAt: new Date("2026-01-01") });
    const newer = await seedCanonicalEvaluationRun({ userId: "baseline-admin", completedAt: new Date("2026-01-02"), qualityGap: true });
    await testDb.update(publicMvpEvaluationResults).set({ noBetterThanGenericFlag: true }).where(eq(publicMvpEvaluationResults.runId, older.id));
    const { getPublicMvpQualityDashboard } = await import("@/features/feedback/quality-dashboard");

    const dashboard = await getPublicMvpQualityDashboard({ db: testDb, range: "all" });

    expect(dashboard.success).toBe(true);
    if (!dashboard.success) return;
    expect(dashboard.readiness.checks.find((check) => check.key === "generic_comparison_sample")).toMatchObject({ current: 0 });
    expect(dashboard.readiness.checks.find((check) => check.key === "evaluation_quality_gaps")).toBeUndefined();
    expect(dashboard.readiness.diagnostics.evaluationQualityGaps).toBe(1);
    expect(dashboard.readiness.checks.find((check) => check.key === "current_evaluation_evidence")).toMatchObject({ passed: true });
    expect(newer.id).toBeDefined();
  });

  test("prevents deletion of cards retained by immutable sampling ledgers and obligations", async () => {
    await createUser("retention-admin", ["admin"]);
    const autoActive = await seedSamplingFence({ id: "retained-auto-active", userId: "retention-admin" });
    const verifyFirst = await seedSamplingFence({ id: "retained-verify-first", userId: "retention-admin", publicationState: "suppressed" });
    const [policy] = await testDb.insert(knowledgeSamplingPolicies).values({ cohortKey: "retention-policy", windowStartsAt: new Date("2026-01-01"), windowEndsAt: new Date("2026-01-29"), samplingPercent: 15 }).returning();
    await testDb.insert(knowledgeSamplingCandidateLedger).values({ terminalIngestionJobId: autoActive.jobId, policyId: policy.id, knowledgeCardId: "retained-auto-active", contentVersion: 1, evidenceSetRevision: 1, corridorBucket: "Huế", outsideCorridor: false, selectedForSampling: true });
    await testDb.insert(knowledgeSamplingCohortMembers).values({ policyId: policy.id, knowledgeCardId: "retained-auto-active", contentVersion: 1, evidenceSetRevision: 1, corridorBucket: "Huế", outsideCorridor: false, selectedForSampling: true });
    await testDb.insert(knowledgeVerifyFirstSamplingObligations).values({ terminalIngestionJobId: verifyFirst.jobId, policyId: policy.id, knowledgeCardId: "retained-verify-first", contentVersion: 1, evidenceSetRevision: 1, corridorBucket: "Huế", outsideCorridor: false });

    await expect(testDb.delete(knowledgeCards).where(eq(knowledgeCards.id, "retained-auto-active"))).rejects.toThrow();
    await expect(testDb.delete(knowledgeCards).where(eq(knowledgeCards.id, "retained-verify-first"))).rejects.toThrow();
  });

  test("requires current valid evidence and one unambiguous disposition for selected and verify-first fences", async () => {
    await createUser("fence-admin", ["admin"]);
    const selected = await seedSamplingFence({ id: "selected-fence", userId: "fence-admin" });
    const verifyFirst = await seedSamplingFence({ id: "verify-fence", userId: "fence-admin", publicationState: "suppressed" });
    const { enrollmentDigest, getPublicMvpSamplingReadinessEvidence } = await import("@/features/knowledge/recommendations");
    const [policy] = await testDb.insert(knowledgeSamplingPolicies).values({ cohortKey: "fence-policy", windowStartsAt: new Date("2026-01-01"), windowEndsAt: new Date("2026-01-29"), samplingPercent: 15, enrollmentCandidateCount: 1, enrollmentSelectedCount: 1, enrollmentDigest: enrollmentDigest([enrollmentEntry("selected-fence")]), enrollmentSealedAt: new Date() }).returning();
    await testDb.insert(knowledgeSamplingCandidateLedger).values({ terminalIngestionJobId: selected.jobId, policyId: policy.id, knowledgeCardId: "selected-fence", contentVersion: selected.contentVersion, evidenceSetRevision: selected.evidenceSetRevision, corridorBucket: "Huế", outsideCorridor: false, selectedForSampling: true });
    await testDb.insert(knowledgeSamplingCohortMembers).values({ policyId: policy.id, knowledgeCardId: "selected-fence", contentVersion: selected.contentVersion, evidenceSetRevision: selected.evidenceSetRevision, corridorBucket: "Huế", outsideCorridor: false, selectedForSampling: true });
    await testDb.insert(knowledgeVerifyFirstSamplingObligations).values({ terminalIngestionJobId: verifyFirst.jobId, policyId: policy.id, knowledgeCardId: "verify-fence", contentVersion: verifyFirst.contentVersion, evidenceSetRevision: verifyFirst.evidenceSetRevision, corridorBucket: "Huế", outsideCorridor: false });
    await testDb.insert(knowledgeRecommendations).values([
      { knowledgeCardId: "selected-fence", contentVersion: 1, evidenceSetRevision: 1, policyId: policy.id, reason: "sampling", priority: 9, status: "resolved", resolution: "sampling_passed", samplingDispositionReason: "confirmed", resolvedByUserId: "fence-admin", resolvedAt: new Date() },
      { knowledgeCardId: "verify-fence", contentVersion: 1, evidenceSetRevision: 1, policyId: policy.id, reason: "sampling", priority: 9, requiredForSampling: true, status: "resolved", resolution: "sampling_passed", samplingDispositionReason: "confirmed", resolvedByUserId: "fence-admin", resolvedAt: new Date() },
    ]);
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: true, pending: 0, failed: 0 });

    await testDb.update(knowledgeCards).set({ contentVersion: 2 }).where(eq(knowledgeCards.id, "selected-fence"));
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, pending: 1 });
    await testDb.update(knowledgeCards).set({ contentVersion: 1 }).where(eq(knowledgeCards.id, "selected-fence"));
    await testDb.update(knowledgeCards).set({ evidenceSetRevision: 2 }).where(eq(knowledgeCards.id, "selected-fence"));
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, pending: 1 });
    await testDb.update(knowledgeCards).set({ evidenceSetRevision: 1 }).where(eq(knowledgeCards.id, "selected-fence"));
    await testDb.update(knowledgeCards).set({ contentVersion: 2 }).where(eq(knowledgeCards.id, "verify-fence"));
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, pending: 1 });
    await testDb.update(knowledgeCards).set({ contentVersion: 1, evidenceSetRevision: 2 }).where(eq(knowledgeCards.id, "verify-fence"));
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, pending: 1 });
    await testDb.update(knowledgeCards).set({ evidenceSetRevision: 1 }).where(eq(knowledgeCards.id, "verify-fence"));
    await testDb.update(knowledgeCardEvidence).set({ state: "removed" }).where(eq(knowledgeCardEvidence.knowledgeCardId, "verify-fence"));
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, pending: 1 });
  });

  test("fails closed for sealed count, selection, and digest mismatches plus duplicate sampling dispositions", async () => {
    await createUser("proof-admin", ["admin"]);
    const selected = await seedSamplingFence({ id: "proof-selected", userId: "proof-admin" });
    const verifyFirst = await seedSamplingFence({ id: "proof-verify", userId: "proof-admin", publicationState: "suppressed" });
    const { enrollmentDigest, getPublicMvpSamplingReadinessEvidence } = await import("@/features/knowledge/recommendations");
    const [policy] = await testDb.insert(knowledgeSamplingPolicies).values({ cohortKey: "proof-policy", windowStartsAt: new Date("2026-02-01"), windowEndsAt: new Date("2026-03-01"), samplingPercent: 15, enrollmentCandidateCount: 1, enrollmentSelectedCount: 1, enrollmentDigest: enrollmentDigest([enrollmentEntry("proof-selected")]), enrollmentSealedAt: new Date() }).returning();
    await testDb.insert(knowledgeSamplingCandidateLedger).values({ terminalIngestionJobId: selected.jobId, policyId: policy.id, knowledgeCardId: "proof-selected", contentVersion: 1, evidenceSetRevision: 1, corridorBucket: "Huế", outsideCorridor: false, selectedForSampling: true });
    await testDb.insert(knowledgeSamplingCohortMembers).values({ policyId: policy.id, knowledgeCardId: "proof-selected", contentVersion: 1, evidenceSetRevision: 1, corridorBucket: "Huế", outsideCorridor: false, selectedForSampling: true });
    await testDb.insert(knowledgeVerifyFirstSamplingObligations).values({ terminalIngestionJobId: verifyFirst.jobId, policyId: policy.id, knowledgeCardId: "proof-verify", contentVersion: 1, evidenceSetRevision: 1, corridorBucket: "Huế", outsideCorridor: false });
    const recommendation = { knowledgeCardId: "proof-verify", contentVersion: 1, evidenceSetRevision: 1, policyId: policy.id, reason: "sampling" as const, priority: 9, requiredForSampling: true, status: "resolved" as const, resolution: "sampling_passed" as const, samplingDispositionReason: "confirmed" as const, resolvedByUserId: "proof-admin", resolvedAt: new Date() };
    await testDb.insert(knowledgeRecommendations).values([{ knowledgeCardId: "proof-selected", contentVersion: 1, evidenceSetRevision: 1, policyId: policy.id, reason: "sampling", priority: 9, status: "resolved", resolution: "sampling_passed", samplingDispositionReason: "confirmed", resolvedByUserId: "proof-admin", resolvedAt: new Date() }, recommendation]);
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: true });
    await testDb.update(knowledgeSamplingPolicies).set({ enrollmentCandidateCount: 2 }).where(eq(knowledgeSamplingPolicies.id, policy.id));
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, incompletePolicies: 1 });
    await testDb.update(knowledgeSamplingPolicies).set({ enrollmentCandidateCount: 1, enrollmentSelectedCount: 0 }).where(eq(knowledgeSamplingPolicies.id, policy.id));
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, incompletePolicies: 1 });
    await testDb.update(knowledgeSamplingPolicies).set({ enrollmentSelectedCount: 1, enrollmentDigest: "a".repeat(64) }).where(eq(knowledgeSamplingPolicies.id, policy.id));
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, incompletePolicies: 1 });
    await testDb.update(knowledgeSamplingPolicies).set({ enrollmentDigest: enrollmentDigest([enrollmentEntry("proof-selected")]) }).where(eq(knowledgeSamplingPolicies.id, policy.id));
    await testDb.update(knowledgeSamplingPolicies).set({ enrollmentCandidateCount: null, enrollmentSelectedCount: null, enrollmentDigest: null, enrollmentSealedAt: null }).where(eq(knowledgeSamplingPolicies.id, policy.id));
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, incompletePolicies: 1 });
    await testDb.update(knowledgeSamplingPolicies).set({ enrollmentCandidateCount: 1, enrollmentSelectedCount: 1, enrollmentDigest: enrollmentDigest([enrollmentEntry("proof-selected")]), enrollmentSealedAt: new Date() }).where(eq(knowledgeSamplingPolicies.id, policy.id));
    await testDb.insert(knowledgeRecommendations).values({ ...recommendation, id: "duplicate-required-disposition" });
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, pending: 1 });
    await testDb.delete(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, "duplicate-required-disposition"));
    await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "proof-selected", contentVersion: 1, evidenceSetRevision: 1, policyId: policy.id, reason: "sampling", priority: 9, status: "resolved", resolution: "sampling_failed", samplingDispositionReason: "safety_risk", resolvedByUserId: "proof-admin", resolvedAt: new Date() });
    await expect(getPublicMvpSamplingReadinessEvidence(testDb)).resolves.toMatchObject({ complete: false, pending: 1 });
  });
});
