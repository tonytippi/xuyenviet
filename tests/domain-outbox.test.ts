import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { aiAskCommands, aiUsageEvents, assistantResponseProvenance, conversations, domainOutbox, domainOutboxEffects, messages, schema, tripProjects, users } from "@/db/schema";
import { acquireAiAskCommand, finalizeAiAskCommand } from "@/features/ai/ai-ask-commands";
import { acknowledgeDomainOutboxEvent, aiAskOutboxDedupeKey, claimDueDomainOutboxEvents, completeDomainOutboxClaimInTransaction, enqueueAiAskFollowUpInTransaction, failDomainOutboxClaimInTransaction, failDomainOutboxEvent, getDomainOutboxBatchSize, getDomainOutboxLeaseMs, parseAiAskOutboxEnvelope, retryDelayMs } from "@/features/ai/domain-outbox";
import { appendTripChangeProposalActionAnnotation, findAvailableActionMarkerRange, processAiAskDomainOutboxBatch } from "@/features/ai/domain-outbox-worker";
import { tripChangeProposalActionAnnotationIds } from "@/features/ai/answer-annotations";

import { resetTestDatabase, testDb } from "./helpers/db";

let staleWorkerSql: ReturnType<typeof postgres> | null = null;
let reclaimWorkerSql: ReturnType<typeof postgres> | null = null;

beforeAll(() => {
  const databaseUrl = process.env.DATABASE_URL_TEST;
  if (!databaseUrl) throw new Error("DATABASE_URL_TEST is required for domain outbox concurrency tests");
  // Separate max:1 clients ensure reclaim and stale completion use physical connections.
  staleWorkerSql = postgres(databaseUrl, { max: 1 });
  reclaimWorkerSql = postgres(databaseUrl, { max: 1 });
});

afterAll(async () => {
  await staleWorkerSql?.end();
  await reclaimWorkerSql?.end();
});

const base = {
  version: 1 as const,
  commandId: "command-1",
  userId: "user-1",
  conversationId: "conversation-1",
  userMessageId: "message-1",
  conversationLifecycleVersion: 1,
};

async function createCompletedCommandSnapshot() {
  await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
  const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_completed_snapshot", question: "Cho tôi lời khuyên an toàn." });
  if (admitted.kind !== "admitted") throw new Error("Expected command admission");
  const finalized = await finalizeAiAskCommand(admitted.commandId, async (transaction, command) => {
    const [assistant] = await transaction.insert(messages).values({ conversationId: command.conversationId, userId: command.userId, role: "assistant", content: "Gợi ý Huế đã hoàn tất." }).returning({ id: messages.id, content: messages.content });
    await transaction.insert(assistantResponseProvenance).values({ userId: command.userId, conversationId: command.conversationId, userMessageId: command.userMessageId, assistantMessageId: assistant.id, sourceCategory: "general", rank: 1, verificationStatus: "unverified", usedInPrompt: true, citedInAnswer: false, sourceSnapshot: { title: "Nguồn chung" } });
    await transaction.insert(aiUsageEvents).values({ initiatedByUserId: command.userId, executorSystem: "system-ai-orchestration", conversationId: command.conversationId, userMessageId: command.userMessageId, assistantMessageId: assistant.id, purpose: "ai_ask_initial_answer", provider: "ai_gateway", model: "test", promptVersion: "test-v1", status: "success" });
    return { assistantMessageId: assistant.id, result: { type: "done" as const, conversationId: command.conversationId, userMessage: admitted.userMessage, assistantMessage: assistant } };
  });
  if ("discarded" in finalized) throw new Error("Expected completed command");
  await testDb.update(domainOutbox).set({ availableAt: new Date("2099-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));
  const snapshot = async () => ({
    command: await testDb.select({ status: aiAskCommands.status, terminalResult: aiAskCommands.terminalResult, terminalAt: aiAskCommands.terminalAt }).from(aiAskCommands).where(eq(aiAskCommands.id, admitted.commandId)),
    assistant: await testDb.select({ content: messages.content }).from(messages).where(eq(messages.id, finalized.assistantMessageId)),
    provenance: await testDb.select({ sourceSnapshot: assistantResponseProvenance.sourceSnapshot, usedInPrompt: assistantResponseProvenance.usedInPrompt }).from(assistantResponseProvenance).where(eq(assistantResponseProvenance.assistantMessageId, finalized.assistantMessageId)),
    initialUsage: await testDb.select({ purpose: aiUsageEvents.purpose, status: aiUsageEvents.status }).from(aiUsageEvents).where(eq(aiUsageEvents.assistantMessageId, finalized.assistantMessageId)),
  });
  return { admitted, finalized, snapshot };
}

describe("AI Ask domain outbox contract", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  test("chooses the first deterministic free final-answer marker when provider annotations occupy the final marker", () => {
    const answer = "Đề xuất";
    const annotations = [{ id: "provider", start: 1, end: answer.length, text: answer.slice(1), type: "warning" as const, detail: { type: "warning" as const, label: answer.slice(1) } }];

    expect(findAvailableActionMarkerRange(answer, annotations)).toEqual({ start: 0, end: 1 });
    expect(findAvailableActionMarkerRange(answer, [{ ...annotations[0], start: 0, end: answer.length, text: answer }])).toBeNull();
  });

  test("selects astral markers on UTF-16 code point boundaries", () => {
    const answer = "🚗Đề xuất";

    expect(findAvailableActionMarkerRange(answer, [])).toEqual({ start: 0, end: 2 });
    expect(findAvailableActionMarkerRange(answer, [{ id: "occupied", start: 0, end: 2, text: "🚗", type: "warning", detail: { type: "warning", label: "🚗" } }])).toEqual({ start: 2, end: 3 });
  });

  test("evicts provider descriptors to reserve two action slots when 20 valid provider annotations already exist", () => {
    const answerText = "01234567890123456789X";
    const providerAnnotations = Array.from({ length: 20 }, (_, index) => ({
      id: `provider-${index}`,
      start: index,
      end: index + 1,
      text: answerText.slice(index, index + 1),
      type: "warning" as const,
      detail: { type: "warning" as const, label: answerText.slice(index, index + 1) },
    }));

    const attached = appendTripChangeProposalActionAnnotation({ answerText, annotations: providerAnnotations });

    expect(attached).toHaveLength(20);
    expect(attached.filter((annotation) => annotation.type === "warning")).toHaveLength(18);
    expect(attached.filter((annotation) => annotation.type === "action")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: tripChangeProposalActionAnnotationIds[0], detail: expect.objectContaining({ action: expect.objectContaining({ command: "trip_change_proposal.apply", arguments: {} }) }) }),
      expect.objectContaining({ id: tripChangeProposalActionAnnotationIds[1], detail: expect.objectContaining({ action: expect.objectContaining({ command: "trip_change_proposal.dismiss", arguments: {} }) }) }),
    ]));
  });

  test("evicts enough provider descriptors when they cover every answer code point", () => {
    const answerText = "🚗AB";
    const providerAnnotations = [
      { id: "provider-all", start: 0, end: answerText.length, text: answerText, type: "warning" as const, detail: { type: "warning" as const, label: answerText } },
    ];

    const attached = appendTripChangeProposalActionAnnotation({ answerText, annotations: providerAnnotations });

    expect(attached).toHaveLength(2);
    expect(attached.map((annotation) => [annotation.id, annotation.start, annotation.end])).toEqual([
      [tripChangeProposalActionAnnotationIds[0], 0, 2],
      [tripChangeProposalActionAnnotationIds[1], 2, 3],
    ]);
  });

  test("discards hostile provider marker IDs before attaching both feature actions", () => {
    const answerText = "ABC";
    const attached = appendTripChangeProposalActionAnnotation({
      answerText,
      annotations: tripChangeProposalActionAnnotationIds.map((id, index) => ({ id, start: index, end: index + 1, text: answerText.slice(index, index + 1), type: "warning" as const, detail: { type: "warning" as const, label: answerText.slice(index, index + 1) } })),
    });

    expect(attached).toHaveLength(2);
    expect(attached.map((annotation) => annotation.id)).toEqual(tripChangeProposalActionAnnotationIds);
  });

  test("accepts only the exact context v1 ID-and-fence envelope", () => {
    expect(parseAiAskOutboxEnvelope(base, "ai_ask.context_extraction.v1")).toEqual(base);
    expect(parseAiAskOutboxEnvelope({ ...base, question: "unsafe" }, "ai_ask.context_extraction.v1")).toBeNull();
    expect(parseAiAskOutboxEnvelope({ ...base, assistantMessageId: "assistant-1" }, "ai_ask.context_extraction.v1")).toBeNull();
    expect(parseAiAskOutboxEnvelope({ ...base, conversationLifecycleVersion: 0 }, "ai_ask.context_extraction.v1")).toBeNull();
  });

  test("requires final assistant and project fences for finalization events", () => {
    const finalEnvelope = { ...base, assistantMessageId: "assistant-1" };
    expect(parseAiAskOutboxEnvelope(finalEnvelope, "ai_ask.answer_annotation.v1")).toEqual(finalEnvelope);
    expect(parseAiAskOutboxEnvelope(finalEnvelope, "ai_ask.trip_proposal_draft.v1")).toBeNull();
    const proposal = { ...finalEnvelope, tripProjectId: "project-1", tripProjectAggregateVersion: 3 };
    expect(parseAiAskOutboxEnvelope(proposal, "ai_ask.trip_proposal_draft.v1")).toEqual(proposal);
    expect(parseAiAskOutboxEnvelope({ ...proposal, tripProjectAggregateVersion: undefined }, "ai_ask.trip_proposal_draft.v1")).toBeNull();
  });

  test("derives deterministic event keys without accepting mutable payload data", () => {
    expect(aiAskOutboxDedupeKey("ai_ask.context_extraction.v1", "command-1")).toBe("ai-ask:command-1:context-extraction:v1");
    expect(aiAskOutboxDedupeKey("ai_ask.answer_annotation.v1", "command-1")).toBe("ai-ask:command-1:answer-annotation:v1");
    expect(aiAskOutboxDedupeKey("ai_ask.trip_proposal_draft.v1", "command-1")).toBe("ai-ask:command-1:trip-proposal-draft:v1");
  });

  test("defaults only absent worker settings and rejects malformed configuration", () => {
    expect(getDomainOutboxLeaseMs(undefined)).toBe(15 * 60_000);
    expect(getDomainOutboxBatchSize(undefined)).toBe(10);
    expect(getDomainOutboxLeaseMs("1")).toBeNull();
    expect(getDomainOutboxLeaseMs(String(99 * 60_000))).toBeNull();
    expect(getDomainOutboxBatchSize("0")).toBeNull();
    expect(getDomainOutboxBatchSize("99")).toBeNull();
    expect(retryDelayMs(1, () => 0)).toBe(60_000);
    expect(retryDelayMs(99, () => 0)).toBe(15 * 60_000);
    expect(retryDelayMs(99, () => 1)).toBeLessThanOrEqual(15 * 60_000 + 30_000);
  });

  test("dedupes an enqueue without resetting the existing event", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_dedupe_key_123", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const [existing] = await testDb.select().from(domainOutbox).where(eq(domainOutbox.originatingCommandId, admitted.commandId));
    if (!existing) throw new Error("Expected context outbox event");
    await testDb.update(domainOutbox).set({ attemptCount: 2, lastErrorCode: "temporary_failure" }).where(eq(domainOutbox.id, existing.id));

    const replayed = await testDb.transaction((transaction) => enqueueAiAskFollowUpInTransaction(transaction, {
      eventType: "ai_ask.context_extraction.v1",
      envelope: { ...base, commandId: admitted.commandId, conversationId: admitted.conversationId, userMessageId: admitted.userMessage.id, userId: "owner" },
    }));

    expect(replayed).toMatchObject({ id: existing.id, attemptCount: 2, lastErrorCode: "temporary_failure" });
    await expect(testDb.select().from(domainOutbox).where(eq(domainOutbox.originatingCommandId, admitted.commandId))).resolves.toHaveLength(1);
  });

  test("claims disjoint due rows through independent PostgreSQL connections", async () => {
    if (!staleWorkerSql || !reclaimWorkerSql) throw new Error("outbox concurrency clients were not initialized");
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const first = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_disjoint_key_1", question: "Cho tôi lời khuyên an toàn." });
    const second = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_disjoint_key_2", question: "Lái xe an toàn cần gì?" });
    if (first.kind !== "admitted" || second.kind !== "admitted") throw new Error("Expected command admissions");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") });
    const firstDb = drizzle(staleWorkerSql, { schema });
    const secondDb = drizzle(reclaimWorkerSql, { schema });

    const now = new Date(Date.now() + 60_000);
    const [firstClaims, secondClaims] = await Promise.all([
      claimDueDomainOutboxEvents({ workerId: "worker-one", batchSize: 1, now }, firstDb),
      claimDueDomainOutboxEvents({ workerId: "worker-two", batchSize: 1, now }, secondDb),
    ]);

    expect(firstClaims).toHaveLength(1);
    expect(secondClaims).toHaveLength(1);
    expect(firstClaims[0].id).not.toBe(secondClaims[0].id);
  });

  test("releases retryable failures and terminalizes exhausted, invalid failures", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_retry_key_123", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") });
    const now = new Date(Date.now() + 60_000);
    const [claim] = await claimDueDomainOutboxEvents({ workerId: "retry-worker", now });
    if (!claim) throw new Error("Expected claim");

    const retry = await failDomainOutboxEvent({ id: claim.id, fencingToken: claim.fencingToken, eventVersion: claim.eventVersion, code: "provider_unavailable", retryable: true, now, random: () => 0 });
    expect(retry).toMatchObject({ status: "pending", attemptCount: 1, lastErrorCode: "provider_unavailable", failureCode: null });
    expect(retry?.availableAt.getTime()).toBe(now.getTime() + 60_000);

    const [secondClaim] = await claimDueDomainOutboxEvents({ workerId: "retry-worker", now: retry!.availableAt });
    if (!secondClaim) throw new Error("Expected retry claim");
    await testDb.update(domainOutbox).set({ maxAttempts: 2 }).where(eq(domainOutbox.id, secondClaim.id));
    const exhausted = await failDomainOutboxEvent({ id: secondClaim.id, fencingToken: secondClaim.fencingToken, eventVersion: secondClaim.eventVersion, code: "provider_unavailable", retryable: true, now: new Date(secondClaim.leaseExpiresAt.getTime() - 1) });
    expect(exhausted).toMatchObject({ status: "failed", failureCode: "retry_exhausted", lastErrorCode: "retry_exhausted" });

    const admittedInvalid = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_invalid_key_123", question: "Lái xe an toàn cần gì?" });
    if (admittedInvalid.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(eq(domainOutbox.originatingCommandId, admittedInvalid.commandId));
    const [invalidClaim] = await claimDueDomainOutboxEvents({ workerId: "invalid-worker", now: new Date(Date.now() + 60_000) });
    if (!invalidClaim) throw new Error("Expected invalid claim");
    const invalid = await failDomainOutboxEvent({ id: invalidClaim.id, fencingToken: invalidClaim.fencingToken, eventVersion: invalidClaim.eventVersion, code: "invalid_envelope", retryable: false, now: new Date(invalidClaim.leaseExpiresAt.getTime() - 1) });
    expect(invalid).toMatchObject({ status: "failed", failureCode: "invalid_envelope", lastErrorCode: "invalid_envelope" });
  });

  test("terminalizes a claimed invalid payload instead of stranding it in processing", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_worker_invalid_key", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ payload: { ...base, commandId: admitted.commandId, userId: "owner", conversationId: admitted.conversationId, userMessageId: admitted.userMessage.id, assistantMessageId: "forbidden" }, availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(eq(domainOutbox.originatingCommandId, admitted.commandId));

    await expect(processAiAskDomainOutboxBatch({ workerId: "invalid-envelope-worker" })).resolves.toEqual({ kind: "processed", count: 1 });
    await expect(testDb.select({ status: domainOutbox.status, failureCode: domainOutbox.failureCode, claimedBy: domainOutbox.claimedBy }).from(domainOutbox).where(eq(domainOutbox.originatingCommandId, admitted.commandId))).resolves.toEqual([{ status: "failed", failureCode: "invalid_envelope", claimedBy: null }]);
  });

  test("keeps a completed command snapshot immutable when invalid-envelope delivery is terminalized", async () => {
    const { admitted, finalized, snapshot } = await createCompletedCommandSnapshot();
    const before = await snapshot();
    await testDb.update(domainOutbox).set({ payload: { ...base, commandId: admitted.commandId, userId: "owner", conversationId: admitted.conversationId, userMessageId: admitted.userMessage.id, assistantMessageId: finalized.assistantMessageId, unexpected: true }, availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.answer_annotation.v1"));

    await expect(processAiAskDomainOutboxBatch({ workerId: "invalid-completed-snapshot-worker" })).resolves.toEqual({ kind: "processed", count: 1 });
    await expect(snapshot()).resolves.toEqual(before);
    await expect(testDb.select({ effectType: domainOutboxEffects.effectType }).from(domainOutboxEffects)).resolves.toEqual([]);
  });

  test("releases an active provider failure atomically after its one failure usage write", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_atomic_retry_key", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") });
    const now = new Date(Date.now() + 60_000);
    const [claim] = await claimDueDomainOutboxEvents({ workerId: "atomic-retry-worker", now });
    if (!claim) throw new Error("Expected claim");
    let writes = 0;

    await testDb.transaction((transaction) => failDomainOutboxClaimInTransaction(transaction, { ...claim, code: "proposal_gateway_failed", retryable: true, now, random: () => 0 }, async () => { writes += 1; }));

    expect(writes).toBe(1);
    await expect(testDb.select({ status: domainOutbox.status, attemptCount: domainOutbox.attemptCount, lastErrorCode: domainOutbox.lastErrorCode, failureCode: domainOutbox.failureCode }).from(domainOutbox).where(eq(domainOutbox.id, claim.id))).resolves.toEqual([{ status: "pending", attemptCount: 1, lastErrorCode: "proposal_gateway_failed", failureCode: null }]);
  });

  test("safely completes a fenced-out claim with a durable fenced effect", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_fenced_effect_key", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") });
    const now = new Date(Date.now() + 60_000);
    const [claim] = await claimDueDomainOutboxEvents({ workerId: "fenced-effect-worker", now });
    if (!claim) throw new Error("Expected claim");

    await testDb.transaction((transaction) => completeDomainOutboxClaimInTransaction(transaction, claim, async () => {
      await transaction.insert(domainOutboxEffects).values({ outboxEventId: claim.id, effectType: "fenced_out" });
    }, now));

    await expect(testDb.select({ status: domainOutbox.status }).from(domainOutbox).where(eq(domainOutbox.id, claim.id))).resolves.toEqual([{ status: "completed" }]);
    await expect(testDb.select({ effectType: domainOutboxEffects.effectType }).from(domainOutboxEffects).where(eq(domainOutboxEffects.outboxEventId, claim.id))).resolves.toEqual([{ effectType: "fenced_out" }]);
  });

  test("scrubs the retained command and cascades operational rows when a source message is deleted", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_delete_key_123", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") });
    const [claim] = await claimDueDomainOutboxEvents({ workerId: "ack-worker", now: new Date(Date.now() + 60_000) });
    if (!claim) throw new Error("Expected claim");
    await expect(acknowledgeDomainOutboxEvent({ id: claim.id, fencingToken: "0".repeat(64), eventVersion: claim.eventVersion })).resolves.toBeNull();
    await testDb.insert(domainOutboxEffects).values({ outboxEventId: claim.id, effectType: "fenced_out" });
    await testDb.delete(messages).where(eq(messages.id, admitted.userMessage.id));
    await expect(testDb.select().from(domainOutbox).where(eq(domainOutbox.id, claim.id))).resolves.toEqual([]);
    await expect(testDb.select().from(domainOutboxEffects).where(eq(domainOutboxEffects.outboxEventId, claim.id))).resolves.toEqual([]);
    await expect(testDb.select({ userId: aiAskCommands.userId, status: aiAskCommands.status, conversationId: aiAskCommands.conversationId, userMessageId: aiAskCommands.userMessageId }).from(aiAskCommands).where(eq(aiAskCommands.id, admitted.commandId))).resolves.toEqual([{ userId: "owner", status: "discarded", conversationId: null, userMessageId: null }]);
  });

  test("retains scrubbed commands while conversation and project deletion cascade operational rows", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [project] = await testDb.insert(tripProjects).values({ id: "project", userId: "owner", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner", tripProjectId: project.id }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_project_delete_key", question: "Cho tôi lời khuyên an toàn.", tripProjectId: project.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const [event] = await testDb.select({ id: domainOutbox.id }).from(domainOutbox).where(eq(domainOutbox.originatingCommandId, admitted.commandId));
    if (!event) throw new Error("Expected context outbox event");
    await testDb.insert(domainOutboxEffects).values({ outboxEventId: event.id, effectType: "fenced_out" });

    await testDb.delete(tripProjects).where(eq(tripProjects.id, project.id));

    await expect(testDb.select().from(domainOutbox).where(eq(domainOutbox.id, event.id))).resolves.toEqual([]);
    await expect(testDb.select().from(domainOutboxEffects).where(eq(domainOutboxEffects.outboxEventId, event.id))).resolves.toEqual([]);
    await expect(testDb.select({ userId: aiAskCommands.userId, status: aiAskCommands.status, conversationId: aiAskCommands.conversationId, tripProjectId: aiAskCommands.tripProjectId }).from(aiAskCommands).where(eq(aiAskCommands.id, admitted.commandId))).resolves.toEqual([{ userId: "owner", status: "discarded", conversationId: null, tripProjectId: null }]);
  });

  test("rejects a stale claimant before it can create an effect after lease reclaim", async () => {
    if (!staleWorkerSql || !reclaimWorkerSql) throw new Error("outbox concurrency clients were not initialized");
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_stale_claim_key", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const [event] = await testDb.select({ id: domainOutbox.id }).from(domainOutbox).where(eq(domainOutbox.originatingCommandId, admitted.commandId));
    if (!event) throw new Error("Expected context outbox event");

    const now = new Date();
    const staleClaim = { id: event.id, fencingToken: "a".repeat(64), eventVersion: 1 };
    await testDb.update(domainOutbox).set({
      status: "processing",
      claimedBy: "stale-worker",
      claimedAt: new Date(now.getTime() - 20 * 60_000),
      leaseExpiresAt: new Date(now.getTime() - 60_000),
      fencingToken: staleClaim.fencingToken,
      attemptCount: 1,
    }).where(eq(domainOutbox.id, event.id));

    const reclaimDb = drizzle(reclaimWorkerSql, { schema });
    const [reclaimed] = await claimDueDomainOutboxEvents({ workerId: "reclaim-worker", now, leaseMs: 10 * 60_000 }, reclaimDb);
    expect(reclaimed).toMatchObject({ id: event.id });
    expect(reclaimed.fencingToken).not.toBe(staleClaim.fencingToken);

    const staleDb = drizzle(staleWorkerSql, { schema });
    const staleCompletion = await staleDb.transaction((transaction) => completeDomainOutboxClaimInTransaction(transaction, staleClaim, async () => {
      await transaction.insert(domainOutboxEffects).values({ outboxEventId: event.id, effectType: "context_extraction" });
      await transaction.update(messages).set({ content: "stale claimant write" }).where(eq(messages.id, admitted.userMessage.id));
    }, now));
    expect(staleCompletion).toEqual({ completed: false });
    await expect(testDb.select().from(domainOutboxEffects).where(eq(domainOutboxEffects.outboxEventId, event.id))).resolves.toEqual([]);
    await expect(testDb.select({ content: messages.content }).from(messages).where(eq(messages.id, admitted.userMessage.id))).resolves.toEqual([{ content: "Cho tôi lời khuyên an toàn." }]);

    const activeCompletion = await reclaimDb.transaction((transaction) => completeDomainOutboxClaimInTransaction(transaction, reclaimed, async () => {
      await transaction.insert(domainOutboxEffects).values({ outboxEventId: event.id, effectType: "context_extraction" });
    }, now));
    expect(activeCompletion.completed).toBe(true);
    await expect(testDb.select({ status: domainOutbox.status }).from(domainOutbox).where(and(eq(domainOutbox.id, event.id), eq(domainOutbox.status, "completed")))).resolves.toEqual([{ status: "completed" }]);
    await expect(testDb.select({ effectType: domainOutboxEffects.effectType }).from(domainOutboxEffects).where(eq(domainOutboxEffects.outboxEventId, event.id))).resolves.toEqual([{ effectType: "context_extraction" }]);
  });

  test("keeps a completed command snapshot immutable when stale fencing-token or event-version delivery is rejected", async () => {
    if (!staleWorkerSql || !reclaimWorkerSql) throw new Error("outbox concurrency clients were not initialized");
    const { finalized, snapshot } = await createCompletedCommandSnapshot();
    const before = await snapshot();
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.answer_annotation.v1"));
    const [claim] = await claimDueDomainOutboxEvents({ workerId: "completed-snapshot-worker", now: new Date(Date.now() + 60_000) });
    if (!claim) throw new Error("Expected claim");
    const staleDb = drizzle(staleWorkerSql, { schema });

    await expect(staleDb.transaction((transaction) => completeDomainOutboxClaimInTransaction(transaction, { ...claim, fencingToken: "0".repeat(64) }, async () => {
      await transaction.insert(domainOutboxEffects).values({ outboxEventId: claim.id, effectType: "answer_annotation" });
      await transaction.update(messages).set({ content: "stale write" }).where(eq(messages.id, finalized.assistantMessageId));
    }))).resolves.toEqual({ completed: false });
    await expect(staleDb.transaction((transaction) => completeDomainOutboxClaimInTransaction(transaction, { ...claim, eventVersion: claim.eventVersion + 1 }, async () => {
      await transaction.insert(domainOutboxEffects).values({ outboxEventId: claim.id, effectType: "answer_annotation" });
    }))).resolves.toEqual({ completed: false });

    await expect(snapshot()).resolves.toEqual(before);
    await expect(testDb.select({ effectType: domainOutboxEffects.effectType }).from(domainOutboxEffects).where(eq(domainOutboxEffects.outboxEventId, claim.id))).resolves.toEqual([]);
  });

  test("does not claim rows when explicit worker configuration is invalid", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_invalid_worker_config", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") });

    await expect(claimDueDomainOutboxEvents({ workerId: "invalid-config-worker", batchSize: 0 })).resolves.toEqual([]);
    await expect(testDb.select({ status: domainOutbox.status }).from(domainOutbox).where(eq(domainOutbox.originatingCommandId, admitted.commandId))).resolves.toEqual([{ status: "pending" }]);
  });

  test("requires a failure code when terminalizing an event as failed", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_failed_code_required", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");

    await expect(testDb.update(domainOutbox).set({ status: "failed", failedAt: new Date() }).where(eq(domainOutbox.originatingCommandId, admitted.commandId))).rejects.toThrow();
  });

  test("rejects unknown statuses and any claim field on a non-processing event", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_status_and_claim_checks", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");

    await expect(testDb.update(domainOutbox).set({ status: "unknown" as "pending" }).where(eq(domainOutbox.originatingCommandId, admitted.commandId))).rejects.toThrow();
    await expect(testDb.update(domainOutbox).set({ claimedBy: "stranded-worker" }).where(eq(domainOutbox.originatingCommandId, admitted.commandId))).rejects.toThrow();
  });

  test("writes failure work before a nonretryable claim terminalization", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_atomic_nonretryable_key", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") });
    const now = new Date(Date.now() + 60_000);
    const [claim] = await claimDueDomainOutboxEvents({ workerId: "atomic-nonretryable-worker", now });
    if (!claim) throw new Error("Expected claim");
    let writes = 0;

    const terminalized = await testDb.transaction((transaction) => failDomainOutboxClaimInTransaction(transaction, { ...claim, code: "invalid_gateway_response", retryable: false, now }, async () => { writes += 1; }));

    expect(writes).toBe(1);
    expect(terminalized).toMatchObject({ status: "failed", failureCode: "invalid_gateway_response", lastErrorCode: "invalid_gateway_response" });
  });

  test("terminalizes an expired exhausted lease with the standard safe failure signal", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_expired_exhausted_signal", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const now = new Date(Date.now() + 60_000);
    await testDb.update(domainOutbox).set({
      status: "processing",
      attemptCount: 1,
      maxAttempts: 1,
      claimedBy: "expired-worker",
      claimedAt: new Date(now.getTime() - 20 * 60_000),
      leaseExpiresAt: new Date(now.getTime() - 60_000),
      fencingToken: "a".repeat(64),
    }).where(eq(domainOutbox.originatingCommandId, admitted.commandId));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(claimDueDomainOutboxEvents({ workerId: "recovery-worker", now })).resolves.toEqual([]);
    await expect(testDb.select({ status: domainOutbox.status, failureCode: domainOutbox.failureCode, claimedBy: domainOutbox.claimedBy }).from(domainOutbox).where(eq(domainOutbox.originatingCommandId, admitted.commandId))).resolves.toEqual([{ status: "failed", failureCode: "retry_exhausted", claimedBy: null }]);
    expect(error).toHaveBeenCalledWith("AI Ask outbox terminal failure", expect.objectContaining({ commandId: admitted.commandId, code: "retry_exhausted" }));
    error.mockRestore();
  });

  test("rejects completion and retry when the event version fence changes", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_event_version_fence", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") });
    const [claim] = await claimDueDomainOutboxEvents({ workerId: "version-fence-worker", now: new Date(Date.now() + 60_000) });
    if (!claim) throw new Error("Expected claim");
    const staleEventVersion = claim.eventVersion + 1;
    await expect(acknowledgeDomainOutboxEvent({ id: claim.id, fencingToken: claim.fencingToken, eventVersion: staleEventVersion })).resolves.toBeNull();
    await expect(failDomainOutboxEvent({ id: claim.id, fencingToken: claim.fencingToken, eventVersion: staleEventVersion, code: "provider_unavailable", retryable: true })).resolves.toBeNull();
  });

  test("uses the database clock after locking, not a stale worker timestamp", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: "outbox_db_clock_claim", question: "Cho tôi lời khuyên an toàn." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") });
    const [claim] = await claimDueDomainOutboxEvents({ workerId: "db-clock-worker", now: new Date() });
    if (!claim) throw new Error("Expected claim");
    await testDb.update(domainOutbox).set({ claimedAt: new Date(Date.now() - 2_000), leaseExpiresAt: new Date(Date.now() - 1_000) }).where(eq(domainOutbox.id, claim.id));
    const staleWorkerNow = new Date(Date.now() - 60_000);
    let completionWrites = 0;
    let failureWrites = 0;

    await expect(testDb.transaction((transaction) => completeDomainOutboxClaimInTransaction(transaction, claim, async () => {
      completionWrites += 1;
    }, staleWorkerNow))).resolves.toEqual({ completed: false });
    await expect(testDb.transaction((transaction) => failDomainOutboxClaimInTransaction(transaction, { ...claim, code: "provider_unavailable", retryable: true, now: staleWorkerNow }, async () => {
      failureWrites += 1;
    }))).resolves.toBeNull();

    expect(completionWrites).toBe(0);
    expect(failureWrites).toBe(0);
  });
});
