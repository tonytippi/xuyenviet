import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createPostgresTravelerCommandPort } from "@xuyenviet/database";
import { createAiAskStreamExecutionPort, setAiAskStreamTestDependencies } from "../packages/database/src/ai-ask-stream-execution";
import { acceptTripCreationRecommendation, createPostgresTripRecommendationReadRepository } from "../packages/database/src/trip-recommendations";
import {
  aiAskCommands,
  aiUsageEvents,
  assistantResponseProvenance,
  assistantRetrievalDecisions,
  auditEvents,
  conversations,
  messages,
  planningContextSessions,
  tripAnswerContextSnapshots,
  tripChangeProposals,
  tripProjects,
  tripRecommendationAcceptances,
  tripRecommendationContexts,
  tripRecommendationDecisions,
  tripRecommendationDeclines,
  users,
} from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";

async function seedCompletedPlanningConversation(userId: string, conversationId: string, existing = false) {
  if (!existing) await testDb.insert(conversations).values({ id: conversationId, userId });
  await testDb.insert(messages).values([
    { id: `${conversationId}-user`, conversationId, userId, role: "user", content: "Tôi đi từ Hà Nội đến Đà Lạt" },
    { id: `${conversationId}-assistant`, conversationId, userId, role: "assistant", content: "Tôi sẽ giúp bạn lập kế hoạch." },
  ]);
  await testDb.insert(tripAnswerContextSnapshots).values({
    id: `${conversationId}-snapshot`,
    userId,
    conversationId,
    assistantMessageId: `${conversationId}-assistant`,
    contextVersion: 1,
    aggregateVersion: null,
    includedReferences: [],
    excludedReferences: [],
    conflicts: [],
    serialization: "planning snapshot",
    promptDigest: "a".repeat(64),
  });
  await testDb.insert(aiAskCommands).values({
    id: `${conversationId}-command`,
    userId,
    scopeKind: "conversation",
    scopeId: conversationId,
    idempotencyKey: `${conversationId}-idempotency`,
    requestDigest: "b".repeat(64),
    normalizedQuestion: "Tôi đi từ Hà Nội đến Đà Lạt",
    selectedScopeDigest: "c".repeat(64),
    status: "completed",
    conversationId,
    conversationLifecycleVersion: 1,
    userMessageId: `${conversationId}-user`,
    assistantMessageId: `${conversationId}-assistant`,
    tripAnswerContextSnapshotId: `${conversationId}-snapshot`,
    terminalResult: { type: "done" },
    terminalAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  await testDb.insert(planningContextSessions).values({
    userId,
    conversationId,
    revision: 1,
    payload: {
      intent: "trip_planning",
      slots: { origin: "Hà Nội", destination: "Đà Lạt", adults: "2" },
      slotSourceMessageIds: { origin: `${conversationId}-user`, destination: `${conversationId}-user`, adults: `${conversationId}-user` },
      missingSlots: [],
      status: "ready",
      sourceMessageIds: [`${conversationId}-user`],
      revision: 1,
    },
  });
  await testDb.insert(assistantRetrievalDecisions).values({
    id: `${conversationId}-retrieval`,
    userId,
    conversationId,
    userMessageId: `${conversationId}-user`,
    assistantMessageId: `${conversationId}-assistant`,
    tripAnswerContextSnapshotId: `${conversationId}-snapshot`,
    approvedKnowledgeCandidateCount: 0,
    approvedKnowledgeSelectedCount: 0,
    approvedKnowledgeTargetCount: 1,
    approvedKnowledgeRelevanceThreshold: 0.1,
    broadPlanningQuestion: false,
    freshnessRequired: false,
    conflictDetected: false,
    webSearchTriggered: false,
    webSearchTriggerReasons: [],
    generalReasoningUsed: true,
    warnings: [],
    selectedKnowledgeCardIds: [],
    knowledgePolicySnapshot: { version: "required-needs-v1", needs: [] },
  });
  await testDb.insert(assistantResponseProvenance).values({
    id: `${conversationId}-provenance`,
    userId,
    conversationId,
    userMessageId: `${conversationId}-user`,
    assistantMessageId: `${conversationId}-assistant`,
    tripAnswerContextSnapshotId: `${conversationId}-snapshot`,
    sourceCategory: "general",
    rank: 1,
    verificationStatus: "unverified",
    sourceSnapshot: {},
  });
}

async function acceptRecommendation(userId: string, conversationId: string, key: string) {
  const recommendation = await createPostgresTripRecommendationReadRepository().loadOwnedTripRecommendations(userId, conversationId);
  if (recommendation.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation recommendation");
  const input = { decisionId: recommendation.tripCreationRecommendation.decisionId, idempotencyKey: key };
  const accepted = await acceptTripCreationRecommendation(userId, input);
  if (!accepted.success) throw new Error("Expected accepted recommendation");
  return { input, accepted };
}

describe("planning deletion clean break", () => {
  beforeEach(async () => { await resetTestDatabase(); });
  afterEach(() => { setAiAskStreamTestDependencies(undefined); vi.unstubAllGlobals(); });

  test.each(["conversation", "Trip project"] as const)("discards an admitted AI Ask without answer-side writes when owner deletes its %s", async (deletedResource) => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const tripProjectId = "deletion-race-trip";
    const conversationId = "deletion-race-conversation";
    if (deletedResource === "Trip project") {
      await testDb.insert(tripProjects).values({ id: tripProjectId, userId: "owner", title: "Deletion race" });
      await testDb.insert(conversations).values({ id: conversationId, userId: "owner", tripProjectId });
      await testDb.update(tripProjects).set({ primaryConversationId: conversationId }).where(eq(tripProjects.id, tripProjectId));
    } else {
      await testDb.insert(conversations).values({ id: conversationId, userId: "owner" });
    }
    let releaseFinalization!: () => void;
    const finalizationPaused = new Promise<void>((resolve) => { releaseFinalization = resolve; });
    setAiAskStreamTestDependencies({
      prepareOwnedPlanningClarification: vi.fn().mockImplementation(async () => {
        await finalizationPaused;
        return { kind: "question", session: {} as never, question: "Bạn sẽ xuất phát từ đâu?" };
      }),
    });

    const admission = await createAiAskStreamExecutionPort().admit({
      question: "Tôi muốn đi Huế",
      idempotencyKey: `deletion-race-${deletedResource === "Trip project" ? "project" : "conversation"}`.padEnd(24, "x"),
      conversationId,
      ...(deletedResource === "Trip project" ? { tripProjectId } : {}),
    }, { userId: "owner", sessionId: "session-1", roles: ["traveler"], authorizationVersion: 1 }, "planning-deletion-race", new AbortController().signal);
    if (admission.kind !== "admitted") throw new Error("Expected admitted AI Ask execution.");
    const iterator = admission.execution[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "preparing" } });

    const command = createPostgresTravelerCommandPort();
    if (deletedResource === "Trip project") await expect(command.deleteTripProject("owner", tripProjectId)).resolves.toEqual({ success: true });
    else await expect(command.deleteConversation("owner", conversationId)).resolves.toEqual({ success: true });
    releaseFinalization();

    const terminal = await iterator.next();
    expect(terminal).toMatchObject({ done: false, value: { type: "error", code: "refresh_required" } });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
    await expect(testDb.select({ status: aiAskCommands.status, terminalResult: aiAskCommands.terminalResult }).from(aiAskCommands)).resolves.toEqual([
      { status: "discarded", terminalResult: expect.objectContaining({ type: "error", code: "refresh_required" }) },
    ]);
    await expect(testDb.select().from(messages).where(eq(messages.role, "assistant"))).resolves.toEqual([]);
    await expect(testDb.select().from(tripAnswerContextSnapshots)).resolves.toEqual([]);
    await expect(testDb.select().from(assistantRetrievalDecisions)).resolves.toEqual([]);
    await expect(testDb.select().from(assistantResponseProvenance)).resolves.toEqual([]);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toEqual([]);
  });

  test("deletes a conversation graph through the owner command, scrubs replay, and preserves another owner", async () => {
    await testDb.insert(users).values([{ id: "owner", email: "owner@example.com" }, { id: "other", email: "other@example.com" }]);
    await seedCompletedPlanningConversation("owner", "owner-conversation");
    await seedCompletedPlanningConversation("other", "other-conversation");
    const accepted = await acceptRecommendation("owner", "owner-conversation", "delete-conversation-replay");

    await expect(createPostgresTravelerCommandPort().deleteConversation("owner", "owner-conversation")).resolves.toEqual({ success: true });
    await expect(acceptTripCreationRecommendation("owner", accepted.input)).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select({ id: tripProjects.id }).from(tripProjects).where(eq(tripProjects.id, accepted.accepted.destination.tripProjectId))).resolves.toEqual([{ id: accepted.accepted.destination.tripProjectId }]);
    await expect(testDb.select().from(conversations).where(eq(conversations.id, "owner-conversation"))).resolves.toEqual([]);
    await expect(testDb.select().from(planningContextSessions).where(eq(planningContextSessions.conversationId, "owner-conversation"))).resolves.toEqual([]);
    await expect(testDb.select().from(assistantRetrievalDecisions).where(eq(assistantRetrievalDecisions.conversationId, "owner-conversation"))).resolves.toEqual([]);
    await expect(testDb.select().from(assistantResponseProvenance).where(eq(assistantResponseProvenance.conversationId, "owner-conversation"))).resolves.toEqual([]);
    await expect(testDb.select().from(tripAnswerContextSnapshots).where(eq(tripAnswerContextSnapshots.conversationId, "owner-conversation"))).resolves.toEqual([]);
    await expect(testDb.select().from(tripRecommendationContexts).where(eq(tripRecommendationContexts.conversationId, "owner-conversation"))).resolves.toEqual([]);
    await expect(testDb.select().from(tripRecommendationDecisions).where(eq(tripRecommendationDecisions.conversationId, "owner-conversation"))).resolves.toEqual([]);
    await expect(testDb.select().from(tripRecommendationDeclines).where(eq(tripRecommendationDeclines.conversationId, "owner-conversation"))).resolves.toEqual([]);
    await expect(testDb.select({ terminalResult: tripRecommendationAcceptances.terminalResult }).from(tripRecommendationAcceptances).where(eq(tripRecommendationAcceptances.userId, "owner"))).resolves.toEqual([{ terminalResult: { success: false, reason: "refresh_required" } }]);
    await expect(testDb.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, "other-conversation"))).resolves.toEqual([{ id: "other-conversation" }]);
    await expect(testDb.select({ conversationId: planningContextSessions.conversationId }).from(planningContextSessions).where(eq(planningContextSessions.conversationId, "other-conversation"))).resolves.toEqual([{ conversationId: "other-conversation" }]);
  });

  test("deletes a Trip's linked primary conversation and proposal graph without reconstructable audit data", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await seedCompletedPlanningConversation("owner", "source-conversation");
    const accepted = await acceptRecommendation("owner", "source-conversation", "delete-trip-project-replay");
    const tripId = accepted.accepted.destination.tripProjectId;
    const primaryConversationId = accepted.accepted.destination.conversationId;
    await seedCompletedPlanningConversation("owner", primaryConversationId, true);
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.tripProjectId, tripId))).resolves.toEqual([{ status: "pending" }]);

    await expect(createPostgresTravelerCommandPort().deleteTripProject("owner", tripId)).resolves.toEqual({ success: true });
    await expect(acceptTripCreationRecommendation("owner", accepted.input)).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select().from(tripProjects).where(eq(tripProjects.id, tripId))).resolves.toEqual([]);
    await expect(testDb.select().from(conversations).where(eq(conversations.id, primaryConversationId))).resolves.toEqual([]);
    await expect(testDb.select().from(tripChangeProposals).where(eq(tripChangeProposals.tripProjectId, tripId))).resolves.toEqual([]);
    await expect(testDb.select().from(planningContextSessions).where(eq(planningContextSessions.conversationId, primaryConversationId))).resolves.toEqual([]);
    await expect(testDb.select().from(assistantRetrievalDecisions).where(eq(assistantRetrievalDecisions.conversationId, primaryConversationId))).resolves.toEqual([]);
    await expect(testDb.select().from(assistantResponseProvenance).where(eq(assistantResponseProvenance.conversationId, primaryConversationId))).resolves.toEqual([]);
    await expect(testDb.select().from(tripAnswerContextSnapshots).where(eq(tripAnswerContextSnapshots.conversationId, primaryConversationId))).resolves.toEqual([]);
    await expect(testDb.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, "source-conversation"))).resolves.toEqual([{ id: "source-conversation" }]);

    await expect(testDb.select({ afterSummary: auditEvents.afterSummary }).from(auditEvents).where(and(eq(auditEvents.targetId, tripId), eq(auditEvents.operation, "delete")))).resolves.toEqual([
      { afterSummary: JSON.stringify({ deleted: true, linkedConversationCount: 1 }) },
    ]);
  });

  test("replaces a surviving Trip's primary conversation through the owner command and scrubs its replay", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await seedCompletedPlanningConversation("owner", "source-conversation");
    const accepted = await acceptRecommendation("owner", "source-conversation", "replace-primary-conversation");
    const tripId = accepted.accepted.destination.tripProjectId;
    const deletedPrimaryConversationId = accepted.accepted.destination.conversationId;

    await expect(createPostgresTravelerCommandPort().deleteConversation("owner", deletedPrimaryConversationId)).resolves.toEqual({ success: true });
    await expect(acceptTripCreationRecommendation("owner", accepted.input)).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, deletedPrimaryConversationId))).resolves.toEqual([]);

    const [trip] = await testDb.select({ id: tripProjects.id, primaryConversationId: tripProjects.primaryConversationId }).from(tripProjects).where(eq(tripProjects.id, tripId));
    expect(trip).toEqual({ id: tripId, primaryConversationId: expect.any(String) });
    expect(trip!.primaryConversationId).not.toBe(deletedPrimaryConversationId);
    await expect(testDb.select({ id: conversations.id, userId: conversations.userId, tripProjectId: conversations.tripProjectId }).from(conversations).where(eq(conversations.id, trip!.primaryConversationId!))).resolves.toEqual([
      { id: trip!.primaryConversationId, userId: "owner", tripProjectId: tripId },
    ]);
  });
});
