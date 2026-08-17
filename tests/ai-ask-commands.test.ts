import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { aiAskCommands, conversations, domainOutbox, messages, schema, tripAnswerContextSnapshots, tripProjects, users } from "@/db/schema";
import { acquireAiAskCommand, aiAskRefreshRequiredMessage, discardAiAskCommandsForDeletedConversations, finalizeAiAskCommand, maxAiAskConsumerStatusMessageIds, readAiAskCommandTerminalResult, readOwnedCompletedAiAskConsumerStatuses, terminalizeAiAskCommand, terminalResultsEqual, validateAiAskIdempotencyKey } from "@/features/ai/ai-ask-commands";

import { resetTestDatabase, testDb } from "./helpers/db";
import { saveOwnedPlanningContextSession } from "@xuyenviet/database";

const key = "idempotency_key_123";

let concurrencySql: ReturnType<typeof postgres> | null = null;

beforeAll(() => {
  const databaseUrl = process.env.DATABASE_URL_TEST;
  if (!databaseUrl) throw new Error("DATABASE_URL_TEST is required for AI Ask command concurrency tests");
  concurrencySql = postgres(databaseUrl, { max: 2 });
});

afterAll(async () => {
  await concurrencySql?.end();
});

async function loadCommandsWithDatabase(database: ReturnType<typeof drizzle<typeof schema>>) {
  vi.resetModules();
  vi.doMock("@/db/client", () => ({ getDb: () => database }));
  return import("@/features/ai/ai-ask-commands");
}

describe("AI Ask command ledger", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  test("accepts only strict URL-safe idempotency keys", () => {
    expect(validateAiAskIdempotencyKey("a".repeat(16))).toBe(true);
    expect(validateAiAskIdempotencyKey("a".repeat(128))).toBe(true);
    expect(validateAiAskIdempotencyKey("a".repeat(15))).toBe(false);
    expect(validateAiAskIdempotencyKey("a".repeat(129))).toBe(false);
    expect(validateAiAskIdempotencyKey("contains spaces here")).toBe(false);
  });

  test("compares terminal json projections structurally without changing array order", () => {
    expect(terminalResultsEqual(
      { type: "done", assistantMessage: { id: "assistant", content: "Gợi ý" }, proposal: { rationale: "An toàn", affectedItems: ["a", "b"] } },
      { proposal: { affectedItems: ["a", "b"], rationale: "An toàn" }, assistantMessage: { content: "Gợi ý", id: "assistant" }, type: "done" },
    )).toBe(true);
    expect(terminalResultsEqual({ items: ["a", "b"] }, { items: ["b", "a"] })).toBe(false);
  });

  test("creates one turn and replays pending then terminal commands", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });

    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "  Đi   Huế  ", conversationId: conversation.id });
    expect(admitted.kind).toBe("admitted");
    if (admitted.kind !== "admitted") return;

    const pending = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    expect(pending).toMatchObject({ kind: "pending_replay", conversationId: conversation.id, userMessage: admitted.userMessage });
    expect(await testDb.select().from(messages)).toHaveLength(1);

    const result = { type: "error" as const, conversationId: conversation.id, userMessage: admitted.userMessage, errorMessage: "Lỗi an toàn" };
    await terminalizeAiAskCommand(admitted.commandId, "failed", result);
    const terminal = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    expect(terminal).toEqual({ kind: "terminal_replay", result });
    expect(await testDb.select().from(messages)).toHaveLength(1);
  });

  test("does not enqueue context extraction for an explicit partial reply while collecting", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    await saveOwnedPlanningContextSession("owner", conversation.id, null, { intent: "trip_planning", slots: { destination: "Đà Nẵng" }, slotSourceMessageIds: { destination: "message-1" }, missingSlots: ["origin", "start_date", "adults"], status: "collecting", sourceMessageIds: ["message-1"], revision: 1 });

    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: "clarification_partial_key", question: "Xuất phát từ Hà Nội", conversationId: conversation.id })).resolves.toMatchObject({ kind: "admitted" });
    await expect(testDb.select().from(domainOutbox)).resolves.toEqual([]);
  });

  test("replays a completed command without another user or assistant message", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const [assistant] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "owner", role: "assistant", content: "Gợi ý an toàn" }).returning({ id: messages.id });
    const result = { type: "done" as const, conversationId: conversation.id, userMessage: admitted.userMessage, assistantMessage: { id: assistant.id, content: "Gợi ý an toàn" } };

    await terminalizeAiAskCommand(admitted.commandId, "completed", result, assistant.id);
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toEqual({ kind: "terminal_replay", result });
    expect(await testDb.select().from(messages)).toHaveLength(2);
  });

  test("accepts an ambiguous completed terminalization already committed with reordered jsonb keys", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const [assistant] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "owner", role: "assistant", content: "Gợi ý an toàn" }).returning({ id: messages.id });
    const result = { type: "done" as const, conversationId: conversation.id, userMessage: admitted.userMessage, assistantMessage: { id: assistant.id, content: "Gợi ý an toàn" }, proposal: { rationale: "An toàn", affectedItems: ["first", "second"] } };

    await testDb.update(aiAskCommands).set({
      status: "completed",
      terminalAt: new Date(),
      assistantMessageId: assistant.id,
      terminalResult: { proposal: { affectedItems: ["first", "second"], rationale: "An toàn" }, assistantMessage: { content: "Gợi ý an toàn", id: assistant.id }, userMessage: admitted.userMessage, conversationId: conversation.id, type: "done" },
    }).where(eq(aiAskCommands.id, admitted.commandId));

    await expect(terminalizeAiAskCommand(admitted.commandId, "completed", result, assistant.id)).resolves.toEqual(result);
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toEqual({ kind: "terminal_replay", result });
  });

  test("atomically completes a matching fenced command", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const finalized = await finalizeAiAskCommand(admitted.commandId, async (transaction, command) => {
      const [assistant] = await transaction.insert(messages).values({ conversationId: command.conversationId, userId: command.userId, role: "assistant", content: "Gợi ý đã lưu" }).returning({ id: messages.id });
      const result = { type: "done" as const, conversationId: command.conversationId, userMessage: admitted.userMessage, assistantMessage: { id: assistant.id, content: "Gợi ý đã lưu" } };
      return { assistantMessageId: assistant.id, result };
    });
    expect(finalized).toMatchObject({ result: { type: "done" } });
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toEqual({ kind: "terminal_replay", result: finalized.result });
  });

  test("keeps the terminal projection stable after finalization", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const finalized = await finalizeAiAskCommand(admitted.commandId, async (transaction, command) => {
      const [assistant] = await transaction.insert(messages).values({ conversationId: command.conversationId, userId: command.userId, role: "assistant", content: "Gợi ý đã lưu" }).returning({ id: messages.id });
      return { assistantMessageId: assistant.id, result: { type: "done" as const, conversationId: command.conversationId, userMessage: admitted.userMessage, assistantMessage: { id: assistant.id, content: "Gợi ý đã lưu" } } };
    });
    if ("discarded" in finalized) throw new Error("Expected completed command");
    await expect(readAiAskCommandTerminalResult(admitted.commandId)).resolves.toEqual(finalized.result);
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toEqual({ kind: "terminal_replay", result: finalized.result });
  });

  test("projects only one safe owner-scoped optional state per category without changing a completed result", async () => {
    await testDb.insert(users).values([
      { id: "owner", email: "owner@example.com" },
      { id: "other", email: "other@example.com" },
    ]);
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const finalized = await finalizeAiAskCommand(admitted.commandId, async (transaction, command) => {
      const [assistant] = await transaction.insert(messages).values({ conversationId: command.conversationId, userId: command.userId, role: "assistant", content: "Gợi ý đã lưu" }).returning({ id: messages.id });
      return { assistantMessageId: assistant.id, result: { type: "done" as const, conversationId: command.conversationId, userMessage: admitted.userMessage, assistantMessage: { id: assistant.id, content: "Gợi ý đã lưu" } } };
    });
    if ("discarded" in finalized) throw new Error("Expected completed command");
    const terminalSnapshot = await testDb.select({ status: aiAskCommands.status, terminalResult: aiAskCommands.terminalResult, terminalAt: aiAskCommands.terminalAt }).from(aiAskCommands).where(eq(aiAskCommands.id, admitted.commandId));
    await testDb.update(domainOutbox).set({ status: "processing", claimedBy: "worker", claimedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000), fencingToken: "a".repeat(64) }).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));
    await testDb.update(domainOutbox).set({ status: "failed", failedAt: new Date(), failureCode: "provider_internal", lastErrorCode: "provider_internal" }).where(eq(domainOutbox.eventType, "ai_ask.answer_annotation.v1"));
    await testDb.insert(domainOutbox).values({ originatingCommandId: admitted.commandId, eventType: "ai_ask.trip_proposal_draft.v1", eventVersion: 1, aggregateType: "ai_ask_command", aggregateId: admitted.commandId, userId: "owner", conversationId: conversation.id, assistantMessageId: finalized.assistantMessageId, conversationLifecycleVersion: 1, dedupeKey: "projectless-proposal", payload: {}, status: "pending" });
    const [duplicateCommand] = await testDb.insert(aiAskCommands).values({
      userId: "owner",
      scopeKind: "conversation",
      scopeId: conversation.id,
      idempotencyKey: "duplicate_status_key",
      requestDigest: "c".repeat(64),
      normalizedQuestion: "Đi Huế",
      selectedScopeDigest: "d".repeat(64),
      status: "completed",
      conversationId: conversation.id,
      assistantMessageId: finalized.assistantMessageId,
      terminalAt: new Date(),
      terminalResult: { type: "done" },
      expiresAt: new Date(Date.now() + 60_000),
    }).returning({ id: aiAskCommands.id });
    await testDb.insert(domainOutbox).values([
      { originatingCommandId: duplicateCommand.id, eventType: "ai_ask.context_extraction.v1", eventVersion: 1, aggregateType: "ai_ask_command", aggregateId: duplicateCommand.id, userId: "owner", conversationId: conversation.id, assistantMessageId: finalized.assistantMessageId, conversationLifecycleVersion: 1, dedupeKey: "duplicate-context-pending", payload: {}, status: "pending" },
      { originatingCommandId: duplicateCommand.id, eventType: "ai_ask.answer_annotation.v1", eventVersion: 1, aggregateType: "ai_ask_command", aggregateId: duplicateCommand.id, userId: "owner", conversationId: conversation.id, assistantMessageId: finalized.assistantMessageId, conversationLifecycleVersion: 1, dedupeKey: "duplicate-annotation-pending", payload: {}, status: "pending" },
    ]);

    await expect(readOwnedCompletedAiAskConsumerStatuses("owner", [finalized.assistantMessageId])).resolves.toEqual([
      { assistantMessageId: finalized.assistantMessageId, category: "context_extraction", state: "pending" },
      { assistantMessageId: finalized.assistantMessageId, category: "answer_annotation", state: "failed" },
    ]);
    await expect(readOwnedCompletedAiAskConsumerStatuses("other", [finalized.assistantMessageId])).resolves.toEqual([]);
    const safeProjection = JSON.stringify(await readOwnedCompletedAiAskConsumerStatuses("owner", [finalized.assistantMessageId]));
    expect(safeProjection).not.toContain("provider_internal");
    expect(safeProjection).not.toContain("worker");
    await expect(testDb.select({ status: aiAskCommands.status, terminalResult: aiAskCommands.terminalResult, terminalAt: aiAskCommands.terminalAt }).from(aiAskCommands).where(eq(aiAskCommands.id, admitted.commandId))).resolves.toEqual(terminalSnapshot);
  });

  test("maps an owned project proposal follow-up to its dedicated display category", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [project] = await testDb.insert(tripProjects).values({ id: "project", userId: "owner", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.update(tripProjects).set({ primaryConversationId: conversation.id }).where(eq(tripProjects.id, project.id));
    const [assistant] = await testDb.insert(messages).values({ id: "assistant", conversationId: conversation.id, userId: "owner", role: "assistant", content: "Gợi ý đã lưu" }).returning({ id: messages.id });
    const [command] = await testDb.insert(aiAskCommands).values({
      userId: "owner", scopeKind: "trip_project", scopeId: project.id, idempotencyKey: "project_proposal_status", requestDigest: "a".repeat(64), normalizedQuestion: "Đi Huế", selectedScopeDigest: "b".repeat(64), status: "completed", conversationId: conversation.id, tripProjectId: project.id, assistantMessageId: assistant.id, terminalAt: new Date(), terminalResult: { type: "done" }, expiresAt: new Date(Date.now() + 60_000),
    }).returning({ id: aiAskCommands.id });
    await testDb.insert(domainOutbox).values({ originatingCommandId: command.id, eventType: "ai_ask.trip_proposal_draft.v1", eventVersion: 1, aggregateType: "ai_ask_command", aggregateId: command.id, userId: "owner", conversationId: conversation.id, tripProjectId: project.id, assistantMessageId: assistant.id, conversationLifecycleVersion: 1, tripProjectAggregateVersion: 1, dedupeKey: "project-proposal-status", payload: {}, status: "pending" });

    await expect(readOwnedCompletedAiAskConsumerStatuses("owner", [assistant.id])).resolves.toEqual([
      { assistantMessageId: assistant.id, category: "trip_proposal_draft", state: "pending" },
    ]);
  });

  test("caps and deduplicates shell-derived IDs before projecting owner-safe consumer statuses", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const [acceptedAssistant, excludedAssistant] = await testDb.insert(messages).values([
      { id: "assistant-accepted", conversationId: conversation.id, userId: "owner", role: "assistant", content: "Included" },
      { id: "assistant-excluded", conversationId: conversation.id, userId: "owner", role: "assistant", content: "Excluded" },
    ]).returning({ id: messages.id });
    const [acceptedCommand, excludedCommand] = await testDb.insert(aiAskCommands).values([
      { userId: "owner", scopeKind: "conversation", scopeId: conversation.id, idempotencyKey: "accepted_consumer_status", requestDigest: "a".repeat(64), normalizedQuestion: "Đi Huế", selectedScopeDigest: "b".repeat(64), status: "completed", conversationId: conversation.id, assistantMessageId: acceptedAssistant.id, terminalAt: new Date(), terminalResult: { type: "done" }, expiresAt: new Date(Date.now() + 60_000) },
      { userId: "owner", scopeKind: "conversation", scopeId: conversation.id, idempotencyKey: "excluded_consumer_status", requestDigest: "c".repeat(64), normalizedQuestion: "Đi Huế", selectedScopeDigest: "d".repeat(64), status: "completed", conversationId: conversation.id, assistantMessageId: excludedAssistant.id, terminalAt: new Date(), terminalResult: { type: "done" }, expiresAt: new Date(Date.now() + 60_000) },
    ]).returning({ id: aiAskCommands.id });
    await testDb.insert(domainOutbox).values([
      { originatingCommandId: acceptedCommand.id, eventType: "ai_ask.answer_annotation.v1", eventVersion: 1, aggregateType: "ai_ask_command", aggregateId: acceptedCommand.id, userId: "owner", conversationId: conversation.id, assistantMessageId: acceptedAssistant.id, conversationLifecycleVersion: 1, dedupeKey: "accepted-consumer-status", payload: {}, status: "pending" },
      { originatingCommandId: excludedCommand.id, eventType: "ai_ask.answer_annotation.v1", eventVersion: 1, aggregateType: "ai_ask_command", aggregateId: excludedCommand.id, userId: "owner", conversationId: conversation.id, assistantMessageId: excludedAssistant.id, conversationLifecycleVersion: 1, dedupeKey: "excluded-consumer-status", payload: {}, status: "pending" },
    ]);
    const shellIds = [acceptedAssistant.id, acceptedAssistant.id, ...Array.from({ length: maxAiAskConsumerStatusMessageIds - 1 }, (_, index) => `filler-${index}`), excludedAssistant.id];

    const statuses = await readOwnedCompletedAiAskConsumerStatuses("owner", shellIds);

    expect(statuses).toEqual([{ assistantMessageId: acceptedAssistant.id, category: "answer_annotation", state: "pending" }]);
    expect(statuses).not.toContainEqual(expect.objectContaining({ assistantMessageId: excludedAssistant.id }));
    expect(statuses).toHaveLength(1);
  });

  test("removes owner status projections after source message, conversation, and project scrubbing", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });

    async function createCompletedProposalFixture(suffix: string) {
      const [project] = await testDb.insert(tripProjects).values({ id: `project-${suffix}`, userId: "owner", title: "Huế" }).returning({ id: tripProjects.id });
      const [conversation] = await testDb.insert(conversations).values({ id: `conversation-${suffix}`, userId: "owner", tripProjectId: project.id }).returning({ id: conversations.id });
      await testDb.update(tripProjects).set({ primaryConversationId: conversation.id }).where(eq(tripProjects.id, project.id));
      const [assistant] = await testDb.insert(messages).values({ id: `assistant-${suffix}`, conversationId: conversation.id, userId: "owner", role: "assistant", content: "Gợi ý đã lưu" }).returning({ id: messages.id });
      const [command] = await testDb.insert(aiAskCommands).values({
        userId: "owner", scopeKind: "trip_project", scopeId: project.id, idempotencyKey: `scrub_status_${suffix}`, requestDigest: "a".repeat(64), normalizedQuestion: "Đi Huế", selectedScopeDigest: "b".repeat(64), status: "completed", conversationId: conversation.id, tripProjectId: project.id, assistantMessageId: assistant.id, terminalAt: new Date(), terminalResult: { type: "done" }, expiresAt: new Date(Date.now() + 60_000),
      }).returning({ id: aiAskCommands.id });
      await testDb.insert(domainOutbox).values({ originatingCommandId: command.id, eventType: "ai_ask.trip_proposal_draft.v1", eventVersion: 1, aggregateType: "ai_ask_command", aggregateId: command.id, userId: "owner", conversationId: conversation.id, tripProjectId: project.id, assistantMessageId: assistant.id, conversationLifecycleVersion: 1, tripProjectAggregateVersion: 1, dedupeKey: `scrub-status-${suffix}`, payload: {}, status: "pending" });
      return { project, conversation, assistant, command };
    }

    const sourceMessage = await createCompletedProposalFixture("message");
    const [messageSnapshot] = await testDb.insert(tripAnswerContextSnapshots).values({
      userId: "owner",
      conversationId: sourceMessage.conversation.id,
      assistantMessageId: sourceMessage.assistant.id,
      contextVersion: 1,
      aggregateVersion: 1,
      serialization: "{}",
      promptDigest: "a".repeat(64),
    }).returning({ id: tripAnswerContextSnapshots.id });
    await testDb.update(aiAskCommands).set({ tripAnswerContextSnapshotId: messageSnapshot.id }).where(eq(aiAskCommands.id, sourceMessage.command.id));
    await testDb.delete(messages).where(eq(messages.id, sourceMessage.assistant.id));
    await expect(readOwnedCompletedAiAskConsumerStatuses("owner", [sourceMessage.assistant.id])).resolves.toEqual([]);
    await expect(testDb.select({ status: aiAskCommands.status, assistantMessageId: aiAskCommands.assistantMessageId, tripAnswerContextSnapshotId: aiAskCommands.tripAnswerContextSnapshotId }).from(aiAskCommands).where(eq(aiAskCommands.id, sourceMessage.command.id))).resolves.toEqual([{ status: "discarded", assistantMessageId: null, tripAnswerContextSnapshotId: null }]);

    const sourceConversation = await createCompletedProposalFixture("conversation");
    await testDb.delete(conversations).where(eq(conversations.id, sourceConversation.conversation.id));
    await expect(readOwnedCompletedAiAskConsumerStatuses("owner", [sourceConversation.assistant.id])).resolves.toEqual([]);
    await expect(testDb.select({ status: aiAskCommands.status, conversationId: aiAskCommands.conversationId }).from(aiAskCommands).where(eq(aiAskCommands.id, sourceConversation.command.id))).resolves.toEqual([{ status: "discarded", conversationId: null }]);

    const sourceProject = await createCompletedProposalFixture("project");
    await testDb.delete(tripProjects).where(eq(tripProjects.id, sourceProject.project.id));
    await expect(readOwnedCompletedAiAskConsumerStatuses("owner", [sourceProject.assistant.id])).resolves.toEqual([]);
    await expect(testDb.select({ status: aiAskCommands.status, tripProjectId: aiAskCommands.tripProjectId }).from(aiAskCommands).where(eq(aiAskCommands.id, sourceProject.command.id))).resolves.toEqual([{ status: "discarded", tripProjectId: null }]);
  });

  test("omits completed and scrubbed command consumer work", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const finalized = await finalizeAiAskCommand(admitted.commandId, async (transaction, command) => {
      const [assistant] = await transaction.insert(messages).values({ conversationId: command.conversationId, userId: command.userId, role: "assistant", content: "Gợi ý đã lưu" }).returning({ id: messages.id });
      return { assistantMessageId: assistant.id, result: { type: "done" as const, conversationId: command.conversationId, userMessage: admitted.userMessage, assistantMessage: { id: assistant.id, content: "Gợi ý đã lưu" } } };
    });
    if ("discarded" in finalized) throw new Error("Expected completed command");
    await testDb.update(domainOutbox).set({ status: "completed", completedAt: new Date() }).where(eq(domainOutbox.originatingCommandId, admitted.commandId));
    await expect(readOwnedCompletedAiAskConsumerStatuses("owner", [finalized.assistantMessageId])).resolves.toEqual([]);
    await testDb.transaction((transaction) => discardAiAskCommandsForDeletedConversations(transaction, "owner", [conversation.id]));
    await expect(readOwnedCompletedAiAskConsumerStatuses("owner", [finalized.assistantMessageId])).resolves.toEqual([]);
  });

  test("publishes the scrubbed projection when deletion wins after completion and optional follow-up", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const finalized = await finalizeAiAskCommand(admitted.commandId, async (transaction, command) => {
      const [assistant] = await transaction.insert(messages).values({ conversationId: command.conversationId, userId: command.userId, role: "assistant", content: "Gợi ý đã lưu" }).returning({ id: messages.id });
      return { assistantMessageId: assistant.id, result: { type: "done" as const, conversationId: command.conversationId, userMessage: admitted.userMessage, assistantMessage: { id: assistant.id, content: "Gợi ý đã lưu" } } };
    });
    if ("discarded" in finalized) throw new Error("Expected completed command");
    await testDb.transaction((transaction) => discardAiAskCommandsForDeletedConversations(transaction, "owner", [conversation.id]));

    await expect(readAiAskCommandTerminalResult(admitted.commandId)).resolves.toEqual({
      type: "error",
      code: "refresh_required",
      errorMessage: aiAskRefreshRequiredMessage,
    });
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toEqual({
      kind: "terminal_replay",
      result: { type: "error", code: "refresh_required", errorMessage: aiAskRefreshRequiredMessage },
    });
  });

  test("rolls back assistant and command completion when final persistence fails", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");

    await expect(finalizeAiAskCommand(admitted.commandId, async (transaction, command) => {
      await transaction.insert(messages).values({ conversationId: command.conversationId, userId: command.userId, role: "assistant", content: "Must roll back" });
      throw new Error("injected finalization failure");
    })).rejects.toThrow("injected finalization failure");

    await expect(testDb.select({ role: messages.role }).from(messages)).resolves.toEqual([{ role: "user" }]);
    await expect(testDb.select({ status: aiAskCommands.status, terminalResult: aiAskCommands.terminalResult }).from(aiAskCommands)).resolves.toEqual([{ status: "pending", terminalResult: null }]);
  });

  test("discards a stale fence without invoking final persistence", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(conversations).set({ lifecycleVersion: 2 }).where(eq(conversations.id, conversation.id));
    const persist = vi.fn();

    const finalized = await finalizeAiAskCommand(admitted.commandId, persist);

    expect(finalized).toMatchObject({ discarded: true, result: { type: "error", code: "refresh_required", conversationId: conversation.id } });
    expect(persist).not.toHaveBeenCalled();
    const [command] = await testDb.select().from(aiAskCommands).where(eq(aiAskCommands.id, admitted.commandId));
    expect(command).toMatchObject({ status: "discarded", conversationId: null, userMessageId: null, assistantMessageId: null });
    expect(command.terminalResult).toMatchObject({ type: "error", code: "refresh_required", errorMessage: aiAskRefreshRequiredMessage });
    expect(await testDb.select({ id: messages.id, role: messages.role, content: messages.content }).from(messages)).toEqual([{ id: admitted.userMessage.id, role: "user", content: admitted.userMessage.content }]);
  });

  test("serializes and replays only the safe terminal browser projection", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const result = { type: "error" as const, conversationId: conversation.id, userMessage: admitted.userMessage, errorMessage: "Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau." };

    await terminalizeAiAskCommand(admitted.commandId, "failed", result);
    const [stored] = await testDb.select({ terminalResult: aiAskCommands.terminalResult }).from(aiAskCommands).where(eq(aiAskCommands.id, admitted.commandId));

    expect(JSON.parse(JSON.stringify(stored.terminalResult))).toEqual(result);
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toEqual({ kind: "terminal_replay", result });
  });

  test("rejects a changed digest without another turn", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });

    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Đà Nẵng", conversationId: conversation.id })).resolves.toEqual({ kind: "key_reused" });
    expect(await testDb.select().from(messages)).toHaveLength(1);
  });

  test("rejects changed image bytes with identical attachment metadata without another turn", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const image = { fileName: "road.png", mimeType: "image/png", byteSize: 3, bytes: new Uint8Array([1, 2, 3]) };

    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id, image })).resolves.toMatchObject({ kind: "admitted" });
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id, image: { ...image, bytes: new Uint8Array([3, 2, 1]) } })).resolves.toEqual({ kind: "key_reused" });
    expect(await testDb.select().from(messages)).toHaveLength(1);
  });

  test("allows the same key for another owner and rejects cross-owner references", async () => {
    await testDb.insert(users).values([
      { id: "owner-a", email: "owner-a@example.com" },
      { id: "owner-b", email: "owner-b@example.com" },
    ]);
    const [conversation] = await testDb.insert(conversations).values({ id: "owner-b-conversation", userId: "owner-b" }).returning({ id: conversations.id });

    await expect(acquireAiAskCommand({ userId: "owner-a", idempotencyKey: key, question: "Đi Huế" })).resolves.toMatchObject({ kind: "admitted" });
    await expect(acquireAiAskCommand({ userId: "owner-b", idempotencyKey: key, question: "Đi Huế" })).resolves.toMatchObject({ kind: "admitted" });
    await expect(testDb.insert(aiAskCommands).values({
      userId: "owner-a",
      scopeKind: "conversation",
      scopeId: conversation.id,
      idempotencyKey: "another_valid_key_1",
      requestDigest: "a".repeat(64),
      normalizedQuestion: "Đi Huế",
      selectedScopeDigest: "b".repeat(64),
      conversationId: conversation.id,
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow();
  });

  test("rejects same-owner message references from another conversation", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [commandConversation] = await testDb.insert(conversations).values({ id: "command-conversation", userId: "owner" }).returning({ id: conversations.id });
    const [otherConversation] = await testDb.insert(conversations).values({ id: "other-conversation", userId: "owner" }).returning({ id: conversations.id });
    const [otherMessage] = await testDb.insert(messages).values({ conversationId: otherConversation.id, userId: "owner", role: "user", content: "Không thuộc hội thoại lệnh" }).returning({ id: messages.id });

    await expect(testDb.insert(aiAskCommands).values({
      userId: "owner",
      scopeKind: "conversation",
      scopeId: commandConversation.id,
      idempotencyKey: "another_valid_key_1",
      requestDigest: "a".repeat(64),
      normalizedQuestion: "Đi Huế",
      selectedScopeDigest: "b".repeat(64),
      conversationId: commandConversation.id,
      userMessageId: otherMessage.id,
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow();
  });

  test("replays the same key for a selected Trip Project primary conversation", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [project] = await testDb.insert(tripProjects).values({ id: "project", userId: "owner", title: "Huế" }).returning({ id: tripProjects.id });
    const [primary] = await testDb.insert(conversations).values({ id: "project-primary", userId: "owner", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.update(tripProjects).set({ primaryConversationId: primary.id }).where(eq(tripProjects.id, project.id));

    const first = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", tripProjectId: project.id });
    const second = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", tripProjectId: project.id });

    expect(first).toMatchObject({ kind: "admitted", conversationId: primary.id, tripProjectId: project.id });
    expect(second).toMatchObject({ kind: "pending_replay", conversationId: primary.id });
    expect(await testDb.select().from(messages)).toHaveLength(1);
  });

  test("retains expired commands and requires a new key for a later request", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const first = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (first.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(aiAskCommands).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(aiAskCommands.id, first.commandId));

    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toEqual({ kind: "key_reused" });
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: "another_valid_key_2", question: "Đi Huế", conversationId: conversation.id })).resolves.toMatchObject({ kind: "admitted" });
    expect(await testDb.select().from(aiAskCommands)).toHaveLength(2);
  });

  test("retains a command after direct conversation deletion", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toMatchObject({ kind: "admitted" });

    await testDb.delete(conversations).where(eq(conversations.id, conversation.id));

    const retained = await testDb.select().from(aiAskCommands);
    expect(retained).toHaveLength(1);
    expect(retained[0]).toMatchObject({ status: "discarded", conversationId: null, tripProjectId: null, userMessageId: null, assistantMessageId: null, normalizedQuestion: "[discarded]", attachmentMetadata: null });
    expect(retained[0].terminalResult).toEqual({ type: "error", code: "refresh_required", errorMessage: aiAskRefreshRequiredMessage });
    expect(JSON.stringify(retained[0].terminalResult)).not.toContain("Huế");
  });

  test("direct Trip Project deletion retains a scrubbed discarded replay", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [project] = await testDb.insert(tripProjects).values({ id: "project", userId: "owner", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.update(tripProjects).set({ primaryConversationId: conversation.id }).where(eq(tripProjects.id, project.id));
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", tripProjectId: project.id })).resolves.toMatchObject({ kind: "admitted" });

    await testDb.delete(tripProjects).where(eq(tripProjects.id, project.id));

    const [retained] = await testDb.select().from(aiAskCommands);
    expect(retained).toMatchObject({ status: "discarded", conversationId: null, tripProjectId: null, userMessageId: null, assistantMessageId: null, normalizedQuestion: "[discarded]" });
    expect(retained.terminalResult).toEqual({ type: "error", code: "refresh_required", errorMessage: aiAskRefreshRequiredMessage });
  });

  test("replays a retained discarded command after its conversation was deleted before scope validation", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.transaction((transaction) => discardAiAskCommandsForDeletedConversations(transaction, "owner", [conversation.id]));
    await testDb.delete(conversations).where(eq(conversations.id, conversation.id));

    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toEqual({
      kind: "terminal_replay",
      result: { type: "error", code: "refresh_required", errorMessage: aiAskRefreshRequiredMessage },
    });
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Đà Nẵng", conversationId: conversation.id })).resolves.toEqual({ kind: "key_reused" });
  });

  test("replays the authoritative discarded terminal projection when failure terminalization races deletion", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.transaction((transaction) => discardAiAskCommandsForDeletedConversations(transaction, "owner", [conversation.id]));

    await expect(terminalizeAiAskCommand(admitted.commandId, "failed", { type: "error", errorMessage: "Provider failed" })).resolves.toEqual({
      type: "error",
      code: "refresh_required",
      errorMessage: aiAskRefreshRequiredMessage,
    });
  });

  test("replays an adopted unscoped command without another user turn", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const first = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế" });
    if (first.kind !== "admitted") throw new Error("Expected command admission");

    // The route exposes this conversation to the browser, but an exact retry must
    // retain its original unscoped request shape to target the new-conversation key.
    const replay = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế" });
    expect(replay).toMatchObject({ kind: "pending_replay", conversationId: first.conversationId, userMessage: first.userMessage });
    const rows = await testDb.select().from(aiAskCommands).where(eq(aiAskCommands.userId, "owner"));
    expect(rows).toHaveLength(1);
    expect(rows[0].scopeKind).toBe("new_conversation");
    expect(rows[0].scopeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await testDb.select().from(messages)).toHaveLength(1);
  });

  test("uses independent connections to admit only one concurrent first delivery", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    if (!concurrencySql) throw new Error("concurrency database is not initialized");
    const concurrencyDb = drizzle(concurrencySql, { schema });
    const { acquireAiAskCommand: acquire } = await loadCommandsWithDatabase(concurrencyDb);

    const outcomes = await Promise.all([
      acquire({ userId: "owner", idempotencyKey: "concurrent_key_123", question: "Đi Huế" }),
      acquire({ userId: "owner", idempotencyKey: "concurrent_key_123", question: "Đi Huế" }),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === "admitted")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "pending_replay")).toHaveLength(1);
    expect(await testDb.select().from(aiAskCommands)).toHaveLength(1);
    expect(await testDb.select().from(messages)).toHaveLength(1);
  });
});
