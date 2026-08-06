import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createAiAskStreamExecutionPort, setAiAskStreamTestDependencies } from "../packages/database/src/ai-ask-stream-execution";
import { assembleContextPrioritySourceBundle } from "../packages/database/src/source-bundle";
import { choosePrivateTripRecommendation, createPostgresTripRecommendationReadRepository } from "../packages/database/src/trip-recommendations";
import { aiAskCommands, aiGatewayModels, assistantResponseProvenance, chatContext, conversations, domainOutbox, messages, tripAnswerContextSnapshots, tripProjects, users } from "../packages/database/src/schema";
import { resetTestDatabase, testDb } from "./helpers/db";

describe("private recommendation next-turn answer context", () => {
  beforeEach(async () => { await resetTestDatabase(); });
  afterEach(() => { setAiAskStreamTestDependencies(undefined); vi.unstubAllGlobals(); });

  test("keeps the next private turn unscoped while retaining ordinary conversation facts", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await testDb.insert(conversations).values({ id: "ordinary-conversation", userId: "owner" });
    await testDb.insert(messages).values({ id: "recommendation-message", conversationId: "ordinary-conversation", userId: "owner", role: "user", content: "Tôi muốn đi Đà Lạt" });
    const [historicalCommand] = await testDb.insert(aiAskCommands).values({ userId: "owner", scopeKind: "conversation", scopeId: "ordinary-conversation", idempotencyKey: "recommendation-source-key", requestDigest: "a".repeat(64), normalizedQuestion: "Tôi muốn đi Đà Lạt", selectedScopeDigest: "b".repeat(64), status: "completed", conversationId: "ordinary-conversation", terminalAt: new Date(), terminalResult: { type: "done" }, expiresAt: new Date(Date.now() + 60_000) }).returning({ id: aiAskCommands.id });
    await testDb.insert(domainOutbox).values({ originatingCommandId: historicalCommand!.id, eventType: "ai_ask.context_extraction.v1", eventVersion: 1, aggregateType: "ai_ask_command", aggregateId: historicalCommand!.id, userId: "owner", conversationId: "ordinary-conversation", userMessageId: "recommendation-message", conversationLifecycleVersion: 1, dedupeKey: "private-recommendation-extraction", payload: {}, status: "completed", completedAt: new Date() });
    await testDb.insert(chatContext).values({ userId: "owner", conversationId: "ordinary-conversation", sourceMessageId: "recommendation-message", field: "destination", scope: "conversation", value: "Đà Lạt" });
    await testDb.insert(tripProjects).values({ id: "existing-project", userId: "owner", title: "Chuyến đi đã lưu" });

    const recommendation = await createPostgresTripRecommendationReadRepository().loadOwnedTripRecommendations("owner", "ordinary-conversation");
    if (recommendation.tripCreationRecommendation.kind !== "offer") throw new Error("Expected a production private-answer recommendation.");
    await expect(choosePrivateTripRecommendation("owner", { decisionId: recommendation.tripCreationRecommendation.decisionId })).resolves.toEqual({ success: true });
    if (recommendation.tripContextRecommendation.kind !== "single") throw new Error("Expected an existing-project private-answer recommendation.");
    await expect(choosePrivateTripRecommendation("owner", { decisionId: recommendation.tripContextRecommendation.decisionId })).resolves.toEqual({ success: true });
    await expect(testDb.select({ tripProjectId: conversations.tripProjectId }).from(conversations).where(eq(conversations.id, "ordinary-conversation"))).resolves.toEqual([{ tripProjectId: null }]);

    await testDb.insert(aiGatewayModels).values({ id: "answer-model", gatewayModelName: "test/answer", displayLabel: "Test answer model", purpose: "ai_ask_initial_answer", defaultForPurpose: true, supportsTextInput: true, supportsStreaming: true });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "https://api.tavily.com/search") return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response('data: {"model":"test/answer","choices":[{"delta":{"content":"Bạn nên chuẩn bị hành lý phù hợp."}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { "content-type": "text/event-stream" } });
    }));
    const assemble = vi.fn(assembleContextPrioritySourceBundle);
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: assemble });

    const admission = await createAiAskStreamExecutionPort().admit({ question: "Tôi cần chuẩn bị gì?", idempotencyKey: "private-next-turn-key-001", conversationId: "ordinary-conversation" }, { userId: "owner", sessionId: "session-1", roles: ["traveler"], authorizationVersion: 1 }, "private-turn-context-test", new AbortController().signal);
    if (admission.kind !== "admitted") throw new Error("Expected next turn to be admitted.");
    const events = [];
    for await (const event of admission.execution) events.push(event);
    const terminal = events.at(-1);
    if (!terminal || terminal.type !== "done") throw new Error("Expected completed private next turn.");

    expect(assemble).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "ordinary-conversation", tripProjectId: undefined }));
    const sourceBundle = await assemble.mock.results[0]!.value;
    expect(sourceBundle.tripAnswerContext).toMatchObject({ hasProjectScope: false, tripProjectId: null, anchors: [], planItems: [], constraints: null });
    expect(sourceBundle.chatTripContext.tripProjectFacts).toEqual([]);

    const [snapshot] = await testDb.select().from(tripAnswerContextSnapshots).where(eq(tripAnswerContextSnapshots.assistantMessageId, terminal.assistantMessage.id));
    const provenance = await testDb.select({ sourceCategory: assistantResponseProvenance.sourceCategory, tripAnswerContextSnapshotId: assistantResponseProvenance.tripAnswerContextSnapshotId }).from(assistantResponseProvenance).where(eq(assistantResponseProvenance.assistantMessageId, terminal.assistantMessage.id));

    expect(snapshot).toMatchObject({ tripProjectId: null, aggregateVersion: null, conflicts: [] });
    expect(JSON.parse(snapshot!.serialization)).toMatchObject({ anchors: [], planItems: [], constraints: null, currentConversationFacts: [{ field: "destination", value: "Đà Lạt", source: "conversation" }] });
    expect(provenance.some((row) => row.sourceCategory === "trip_context")).toBe(false);
    expect(provenance.every((row) => row.tripAnswerContextSnapshotId === snapshot!.id)).toBe(true);
  });
});
