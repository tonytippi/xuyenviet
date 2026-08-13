import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { claimReadyClarificationInstances, completeOrAbandonClarificationClaims, createOrReadClarificationAttempt, evolveClarificationPlan, initializeClarificationSession, insertConversationMessage, persistClarificationAssumptions, planningClarificationAttempts, planningClarificationClaims, planningClarificationFieldStates, planningClarificationInstances, planningClarificationSessions, planningClarificationValues, reduceClarificationMessage } from "@xuyenviet/database";
import { aiAskCommands, conversations, messages, tripChangeProposals, tripProjects, users } from "@/db/schema";
import { resolvePlanningContext } from "../packages/database/src/planning-context-profiles";
import { clar01, clar21 } from "./fixtures/planning-context-v6";
import { resetTestDatabase, testDb } from "./helpers/db";

const context = resolvePlanningContext(clar01.proposal)!;

describe("planning clarification persistence", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("persists one owner-bound plan session idempotently and cascades it on conversation deletion", async () => {
    const seeded = await seed("owner", "one");
    const attempt = await planAttempt(seeded);
    const attemptReplay = await planAttempt(seeded);
    expect(attemptReplay?.id).toBe(attempt?.id);
    const first = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: attempt!.id, context });
    const replay = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: attempt!.id, context });
    expect(replay?.id).toBe(first?.id);
    expect(await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, first!.id))).toHaveLength(1);
    await testDb.delete(conversations).where(eq(conversations.id, seeded.conversationId));
    expect(await testDb.select().from(planningClarificationSessions)).toEqual([]);
    expect(await testDb.select().from(planningClarificationAttempts)).toEqual([]);
  });

  test("rejects foreign owners, stale reductions, and duplicate evidence without mutation", async () => {
    const seeded = await seed("owner", "two");
    await testDb.insert(users).values({ id: "other", email: "other@example.com" });
    const attempt = await planAttempt(seeded);
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: attempt!.id, context });
    await testDb.update(conversations).set({ contentRevision: 1 }).where(eq(conversations.id, seeded.conversationId));
    const [reply] = await testDb.insert(messages).values({ conversationId: seeded.conversationId, userId: "owner", role: "user", content: "Hai vợ chồng, car", ordinal: 2 }).returning();
    await testDb.update(conversations).set({ contentRevision: 2 }).where(eq(conversations.id, seeded.conversationId));
    const replyCommand = await commandForMessage("owner", seeded.conversationId, reply!.id, "reply-two");
    const values = [evidence(reply!.content, "party", "Hai vợ chồng", "party:v1"), evidence(reply!.content, "vehicle", "car", "vehicle:v1")];
    const extraction = await createOrReadClarificationAttempt({ commandId: replyCommand.id, sourceMessageId: reply!.id, userId: "owner", expectedSessionRevision: 1, promptVersion: "extract:v1", kind: "extraction", payload: { values } });
    const result = await reduceClarificationMessage({ userId: "owner", sessionId: session!.id, sourceMessageId: reply!.id, expectedSessionRevision: 1, expectedContentRevision: 1, extractionAttemptId: extraction!.id, values });
    expect(result?.revision).toBe(2);
    expect(await reduceClarificationMessage({ userId: "owner", sessionId: session!.id, sourceMessageId: reply!.id, expectedSessionRevision: 1, expectedContentRevision: 1, extractionAttemptId: extraction!.id, values: [evidence(reply!.content, "party", "Hai vợ chồng", "party:v1")] })).toBeNull();
    expect(await reduceClarificationMessage({ userId: "other", sessionId: session!.id, sourceMessageId: reply!.id, expectedSessionRevision: 2, expectedContentRevision: 2, extractionAttemptId: extraction!.id, values: [] })).toBeNull();
    expect(await testDb.select().from(planningClarificationValues).where(eq(planningClarificationValues.sessionId, session!.id))).toHaveLength(2);
  });

  test("supersedes an active session only through a current plan attempt", async () => {
    const seeded = await seed("owner", "three");
    const firstAttempt = await planAttempt(seeded);
    const first = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: firstAttempt!.id, context });
    const freshCommand = await commandForMessage("owner", seeded.conversationId, seeded.messageId, "evolve-command");
    const second = await createOrReadClarificationAttempt({ commandId: freshCommand.id, sourceMessageId: seeded.messageId, userId: "owner", expectedSessionRevision: 1, promptVersion: "plan:v2", kind: "plan", payload: planPayload() });
    const evolved = await evolveClarificationPlan({ userId: "owner", sessionId: first!.id, planAttemptId: second!.id, expectedSessionRevision: 1, expectedContentRevision: 1, context });
    expect(evolved?.id).not.toBe(first?.id);
    expect(evolved?.commandId).toBe(freshCommand.id);
    expect((await evolveClarificationPlan({ userId: "owner", sessionId: first!.id, planAttemptId: second!.id, expectedSessionRevision: 1, expectedContentRevision: 1, context }))?.id).toBe(evolved?.id);
    expect((await testDb.select({ state: planningClarificationSessions.state }).from(planningClarificationSessions).where(eq(planningClarificationSessions.id, first!.id)))[0]?.state).toBe("superseded");
  });

  test("evolution preserves compatible resolved values and leaves the replacement claimable", async () => {
    const seeded = await seed("owner", "evolve-values");
    const first = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded))!.id, context });
    const reply = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "Hà Nội đến Đà Nẵng, Hai vợ chồng, car" }));
    const replyCommand = await commandForMessage("owner", seeded.conversationId, reply.message.id, "reply-evolve");
    const values = [evidence(reply.message.content, "direction", "Hà Nội đến Đà Nẵng", "direction:v1"), evidence(reply.message.content, "party", "Hai vợ chồng", "party:v1"), evidence(reply.message.content, "vehicle", "car", "vehicle:v1")];
    const extract = await createOrReadClarificationAttempt({ commandId: replyCommand.id, sourceMessageId: reply.message.id, userId: "owner", expectedSessionRevision: 1, promptVersion: "evolve:extract", kind: "extraction", payload: { values } });
    const reduced = await reduceClarificationMessage({ userId: "owner", sessionId: first!.id, sourceMessageId: reply.message.id, expectedSessionRevision: 1, expectedContentRevision: 1, extractionAttemptId: extract!.id, values });
    const plan = await createOrReadClarificationAttempt({ commandId: replyCommand.id, sourceMessageId: reply.message.id, userId: "owner", expectedSessionRevision: reduced!.revision, promptVersion: "evolve:plan", kind: "plan", payload: planPayload() });
    const evolved = await evolveClarificationPlan({ userId: "owner", sessionId: first!.id, planAttemptId: plan!.id, expectedSessionRevision: reduced!.revision, expectedContentRevision: reply.contentRevision, context });
    const [instance] = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, evolved!.id));
    expect(instance?.state).toBe("ready");
    expect(await claimReadyClarificationInstances({ userId: "owner", sessionId: evolved!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: reply.contentRevision, instanceIds: [instance!.id] })).toHaveLength(1);
  });

  test("claims only exact ready instances and atomically completes the session when terminal", async () => {
    const seeded = await seed("owner", "four");
    const attempt = await planAttempt(seeded);
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: attempt!.id, context });
    const [instance] = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.id, instance!.id));
    const [left, right] = await Promise.all([claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instance!.id] }), claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instance!.id] })]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    const complete = await completeOrAbandonClarificationClaims({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instance!.id], outcome: "completed" });
    expect(complete?.state).toBe("completed");
    expect(await testDb.select().from(planningClarificationClaims).where(and(eq(planningClarificationClaims.sessionId, session!.id), eq(planningClarificationClaims.state, "completed")))).toHaveLength(1);
  });

  test("CLAR-02 and CLAR-11 allocate production ordinals and preserve omitted direction", async () => {
    const seeded = await seed("owner", "allocator");
    const attempt = await planAttempt(seeded);
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: attempt!.id, context });
    const reply = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "assistant", content: "Hãy cho biết hướng đi." }).then(() => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "Hai vợ chồng, car" })));
    expect(reply.ordinal).toBe(3);
    expect(reply.contentRevision).toBe(3);
    const replyCommand = await commandForMessage("owner", seeded.conversationId, reply.message.id, "reply-allocator");
    const values = [evidence(reply.message.content, "party", "Hai vợ chồng", "party:v1"), evidence(reply.message.content, "vehicle", "car", "vehicle:v1")];
    const extraction = await createOrReadClarificationAttempt({ commandId: replyCommand.id, sourceMessageId: reply.message.id, userId: "owner", expectedSessionRevision: 1, promptVersion: "extract:v2", kind: "extraction", payload: { values } });
    const reduced = await reduceClarificationMessage({ userId: "owner", sessionId: session!.id, sourceMessageId: reply.message.id, expectedSessionRevision: 1, expectedContentRevision: 1, extractionAttemptId: extraction!.id, values });
    expect(reduced?.contentRevision).toBe(3);
    expect(await testDb.select({ state: planningClarificationFieldStates.state }).from(planningClarificationFieldStates).where(and(eq(planningClarificationFieldStates.sessionId, session!.id), eq(planningClarificationFieldStates.key, "direction")))).toEqual([{ state: "missing" }]);
  });

  test("CLAR-24 through CLAR-26 allow disjoint ready claims but reject overlap and complete only after all terminal", async () => {
    const seeded = await seed("owner", "mixed");
    const mixed = resolvePlanningContext({ ...clar01.proposal, deliverables: [{ id: "one", kind: "itinerary", scopeId: "delivery" }, { id: "two", kind: "food", scopeId: "delivery" }] })!;
    const attempt = await planAttempt(seeded, mixed);
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: attempt!.id, context: mixed });
    const instances = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.sessionId, session!.id));
    const first = await claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instances[0]!.id] });
    const second = await claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instances[1]!.id] });
    expect(first).toHaveLength(1); expect(second).toHaveLength(1);
    expect(await claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instances[0]!.id] })).toBeNull();
    expect((await completeOrAbandonClarificationClaims({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instances[0]!.id], outcome: "completed" }))?.state).toBe("active");
    expect((await completeOrAbandonClarificationClaims({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 2, expectedContentRevision: 1, instanceIds: [instances[1]!.id], outcome: "abandoned" }))?.state).toBe("completed");
  });

  test("rejects delayed reductions and claims when a newer conversation message exists", async () => {
    const seeded = await seed("owner", "delayed");
    const attempt = await planAttempt(seeded);
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: attempt!.id, context });
    const oldReply = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "Hai vợ chồng, car" }));
    const replyCommand = await commandForMessage("owner", seeded.conversationId, oldReply.message.id, "reply-delayed");
    const oldValues = [evidence(oldReply.message.content, "party", "Hai vợ chồng", "party:v1"), evidence(oldReply.message.content, "vehicle", "car", "vehicle:v1")];
    const extraction = await createOrReadClarificationAttempt({ commandId: replyCommand.id, sourceMessageId: oldReply.message.id, userId: "owner", expectedSessionRevision: 1, promptVersion: "extract:delayed", kind: "extraction", payload: { values: oldValues } });
    await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "assistant", content: "Mới hơn" }));
    expect(await reduceClarificationMessage({ userId: "owner", sessionId: session!.id, sourceMessageId: oldReply.message.id, expectedSessionRevision: 1, expectedContentRevision: 1, extractionAttemptId: extraction!.id, values: oldValues })).toBeNull();
    expect(await testDb.select().from(planningClarificationValues).where(eq(planningClarificationValues.sessionId, session!.id))).toEqual([]);
  });

  test("rejects terminal attempts, mismatched payload retries, and stale evolution without mutation", async () => {
    const seeded = await seed("owner", "fences");
    const attempt = await planAttempt(seeded);
    expect(await createOrReadClarificationAttempt({ commandId: seeded.commandId, sourceMessageId: seeded.messageId, userId: "owner", expectedSessionRevision: 0, promptVersion: "plan:v1", kind: "extraction", payload: planPayload() })).toBeNull();
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: attempt!.id, context });
    await testDb.update(aiAskCommands).set({ status: "failed", terminalAt: new Date(), terminalResult: { type: "error" } }).where(eq(aiAskCommands.id, seeded.commandId));
    const next = await createOrReadClarificationAttempt({ commandId: seeded.commandId, sourceMessageId: seeded.messageId, userId: "owner", expectedSessionRevision: 1, promptVersion: "plan:v2", kind: "plan", payload: planPayload() });
    expect(next).toBeNull();
    expect(await evolveClarificationPlan({ userId: "owner", sessionId: session!.id, planAttemptId: attempt!.id, expectedSessionRevision: 1, expectedContentRevision: 1, context })).toBeNull();
  });

  test("accepts a fresh same-fenced reply command but rejects lifecycle changes", async () => {
    const seeded = await seed("owner", "foreign-extract");
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded))!.id, context });
    const reply = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "Hai vợ chồng, car" }));
    const [other] = await testDb.insert(aiAskCommands).values({ userId: "owner", scopeKind: "conversation", scopeId: seeded.conversationId, idempotencyKey: "other-command-extract", requestDigest: "c".repeat(64), selectedScopeDigest: "d".repeat(64), normalizedQuestion: "Khác", conversationId: seeded.conversationId, conversationLifecycleVersion: 1, userMessageId: reply.message.id, expiresAt: new Date(Date.now() + 60_000) }).returning();
    const values = [evidence(reply.message.content, "party", "Hai vợ chồng", "party:v1")];
    const extraction = await createOrReadClarificationAttempt({ commandId: other!.id, sourceMessageId: reply.message.id, userId: "owner", expectedSessionRevision: 1, promptVersion: "foreign:extract", kind: "extraction", payload: { values } });
    expect((await reduceClarificationMessage({ userId: "owner", sessionId: session!.id, sourceMessageId: reply.message.id, expectedSessionRevision: 1, expectedContentRevision: 1, extractionAttemptId: extraction!.id, values }))?.revision).toBe(2);
    await testDb.update(conversations).set({ lifecycleVersion: 2 }).where(eq(conversations.id, seeded.conversationId));
    expect(await claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 2, expectedContentRevision: 2, instanceIds: [] })).toBeNull();
  });

  test("persists only disclosed permitted assumptions for collecting current instances", async () => {
    const seeded = await seed("owner", "assumption");
    const accommodation = resolvePlanningContext({ ...clar01.proposal, scopes: [{ id: "journey", kind: "journey", parentId: null, overlapWith: [] }, { id: "stay", kind: "transit_stay", parentId: "journey", overlapWith: [] }], deliverables: [{ id: "stay", kind: "accommodation", scopeId: "stay" }] })!;
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded, accommodation))!.id, context: accommodation });
    const [instance] = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    expect(await persistClarificationAssumptions({ userId: "owner", sessionId: session!.id, expectedSessionRevision: 1, expectedContentRevision: 1, assumptions: [{ instanceId: instance!.id, key: "transit_style", value: "ngủ đơn giản", scopeId: "stay", schemaVersion: "transit-style:v1", disclosed: true }] })).toBeTruthy();
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.id, instance!.id));
    await claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 2, expectedContentRevision: 1, instanceIds: [instance!.id] });
    expect(await persistClarificationAssumptions({ userId: "owner", sessionId: session!.id, expectedSessionRevision: 2, expectedContentRevision: 1, assumptions: [{ instanceId: instance!.id, key: "transit_style", value: "khác", scopeId: "stay", schemaVersion: "transit-style:v1", disclosed: true }] })).toBeNull();
  });

  test("database rejects cross-owner attempt command pairing", async () => {
    const owner = await seed("owner", "owner-pair");
    await testDb.insert(users).values({ id: "other", email: "other@example.com" });
    const [otherConversation] = await testDb.insert(conversations).values({ id: "other-conversation", userId: "other", contentRevision: 1 }).returning();
    const [otherMessage] = await testDb.insert(messages).values({ conversationId: otherConversation!.id, userId: "other", role: "user", content: "Khác", ordinal: 1 }).returning();
    await expect(testDb.insert(planningClarificationAttempts).values({ commandId: owner.commandId, sourceMessageId: otherMessage!.id, userId: "other", expectedSessionRevision: 0, promptVersion: "cross-owner", kind: "plan", payload: {}, digest: "a".repeat(64) })).rejects.toThrow();
  });

  test("database rejects same-owner claims that cross session and command conversations", async () => {
    const seeded = await seed("owner", "cross-conversation-claim");
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded))!.id, context });
    const [instance] = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    const [otherConversation] = await testDb.insert(conversations).values({ id: "cross-conversation-other", userId: "owner", contentRevision: 1 }).returning();
    const [otherMessage] = await testDb.insert(messages).values({ conversationId: otherConversation!.id, userId: "owner", role: "user", content: "Khác", ordinal: 1 }).returning();
    const otherCommand = await commandForMessage("owner", otherConversation!.id, otherMessage!.id, "cross-conversation-command");
    await expect(testDb.insert(planningClarificationClaims).values({ userId: "owner", conversationId: otherConversation!.id, sessionId: session!.id, instanceId: instance!.id, commandId: otherCommand.id, sessionRevision: 1, contentRevision: 1 })).rejects.toThrow();
  });

  test("database rejects direct session completion until every instance is terminal", async () => {
    const seeded = await seed("owner", "terminal-transition");
    const mixed = resolvePlanningContext({ ...clar01.proposal, deliverables: [{ id: "one", kind: "itinerary", scopeId: "delivery" }, { id: "two", kind: "food", scopeId: "delivery" }] })!;
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded, mixed))!.id, context: mixed });
    await expect(testDb.execute(sql`UPDATE planning_clarification_sessions SET state = 'completed' WHERE id = ${session!.id}`)).rejects.toThrow();
    await testDb.update(planningClarificationInstances).set({ state: "abandoned" }).where(eq(planningClarificationInstances.sessionId, session!.id));
    await expect(testDb.execute(sql`UPDATE planning_clarification_sessions SET state = 'completed' WHERE id = ${session!.id}`)).resolves.toBeDefined();
  });

  test("attempt admission rejects stale source content and active-session revision before persistence", async () => {
    const seeded = await seed("owner", "attempt-fences");
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded))!.id, context });
    const staleCommand = await commandForMessage("owner", seeded.conversationId, seeded.messageId, "stale-attempt");
    await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "assistant", content: "Mới hơn" }));
    expect(await createOrReadClarificationAttempt({ commandId: staleCommand.id, sourceMessageId: seeded.messageId, userId: "owner", expectedSessionRevision: 1, promptVersion: "stale:ordinal", kind: "extraction", payload: { values: [] } })).toBeNull();
    const latest = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "Hai vợ chồng" }));
    const latestCommand = await commandForMessage("owner", seeded.conversationId, latest.message.id, "stale-revision");
    expect(await createOrReadClarificationAttempt({ commandId: latestCommand.id, sourceMessageId: latest.message.id, userId: "owner", expectedSessionRevision: session!.revision + 1, promptVersion: "stale:revision", kind: "extraction", payload: { values: [] } })).toBeNull();
    expect(await testDb.select().from(planningClarificationAttempts).where(eq(planningClarificationAttempts.commandId, latestCommand.id))).toEqual([]);
  });

  test("initialization requires exact null-or-Trip command scope equality", async () => {
    const seeded = await seed("owner", "trip-scope");
    const attempt = await planAttempt(seeded);
    const [project] = await testDb.insert((await import("@/db/schema")).tripProjects).values({ userId: "owner", title: "Trip" }).returning();
    await testDb.update(aiAskCommands).set({ tripProjectId: project!.id, tripProjectAggregateVersion: project!.aggregateVersion }).where(eq(aiAskCommands.id, seeded.commandId));
    expect(await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: attempt!.id, context })).toBeNull();
    expect(await testDb.select().from(planningClarificationSessions)).toEqual([]);
  });

  test("initialization rejects fabricated or cyclic validated-context input without persistence", async () => {
    const seeded = await seed("owner", "invalid-context");
    const attempt = await planAttempt(seeded);
    const fabricated = { ...context, graphDigest: "0".repeat(64) };
    expect(await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: attempt!.id, context: fabricated })).toBeNull();
    expect(await testDb.select().from(planningClarificationSessions)).toEqual([]);
  });

  test("lifecycle change prevents a newer matching command from claiming old session work", async () => {
    const seeded = await seed("owner", "claim-lifecycle");
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded))!.id, context });
    const [instance] = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.id, instance!.id));
    await testDb.update(conversations).set({ lifecycleVersion: 2 }).where(eq(conversations.id, seeded.conversationId));
    const later = await commandForMessage("owner", seeded.conversationId, seeded.messageId, "claim-lifecycle-later", 2);
    expect(await claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: later.id, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instance!.id] })).toBeNull();
  });

  test("evolution rejects an old plan attempt after newer conversation content", async () => {
    const seeded = await seed("owner", "evolve-stale-message");
    const first = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded))!.id, context });
    const second = await createOrReadClarificationAttempt({ commandId: seeded.commandId, sourceMessageId: seeded.messageId, userId: "owner", expectedSessionRevision: 1, promptVersion: "stale-plan", kind: "plan", payload: planPayload() });
    await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "assistant", content: "Nội dung mới" }));
    expect(await evolveClarificationPlan({ userId: "owner", sessionId: first!.id, planAttemptId: second!.id, expectedSessionRevision: 1, expectedContentRevision: 1, context })).toBeNull();
  });

  test("dedupes same-turn evidence and never rewrites claimed instance field state", async () => {
    const seeded = await seed("owner", "dedupe");
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded))!.id, context });
    const [instance] = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.id, instance!.id));
    await claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instance!.id] });
    const reply = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "Hai vợ chồng" }));
    const command = await commandForMessage("owner", seeded.conversationId, reply.message.id, "dedupe-reply");
    const party = evidence(reply.message.content, "party", "Hai vợ chồng", "party:v1");
    const attempt = await createOrReadClarificationAttempt({ commandId: command.id, sourceMessageId: reply.message.id, userId: "owner", expectedSessionRevision: 1, promptVersion: "dedupe:extract", kind: "extraction", payload: { values: [party, party] } });
    const reduced = await reduceClarificationMessage({ userId: "owner", sessionId: session!.id, sourceMessageId: reply.message.id, expectedSessionRevision: 1, expectedContentRevision: 1, extractionAttemptId: attempt!.id, values: [party, party] });
    expect(reduced?.revision).toBe(2);
    expect(await testDb.select().from(planningClarificationValues).where(eq(planningClarificationValues.sessionId, session!.id))).toHaveLength(1);
    expect((await testDb.select({ state: planningClarificationInstances.state }).from(planningClarificationInstances).where(eq(planningClarificationInstances.id, instance!.id)))[0]?.state).toBe("claimed");
  });

  test("reduction leaves an unaffected sibling field projection untouched", async () => {
    const seeded = await seed("owner", "siblings");
    const mixed = resolvePlanningContext({ ...clar01.proposal, deliverables: [{ id: "itinerary", kind: "itinerary", scopeId: "delivery" }, { id: "food", kind: "food", scopeId: "delivery" }] })!;
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded, mixed))!.id, context: mixed });
    const food = (await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id))).find((item) => item.kind === "food")!;
    const before = await testDb.select().from(planningClarificationFieldStates).where(and(eq(planningClarificationFieldStates.instanceId, food.id), eq(planningClarificationFieldStates.key, "food_style")));
    const reply = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "car" }));
    const command = await commandForMessage("owner", seeded.conversationId, reply.message.id, "siblings-reply");
    const vehicle = evidence(reply.message.content, "vehicle", "car", "vehicle:v1");
    const attempt = await createOrReadClarificationAttempt({ commandId: command.id, sourceMessageId: reply.message.id, userId: "owner", expectedSessionRevision: 1, promptVersion: "siblings:extract", kind: "extraction", payload: { values: [vehicle] } });
    await reduceClarificationMessage({ userId: "owner", sessionId: session!.id, sourceMessageId: reply.message.id, expectedSessionRevision: 1, expectedContentRevision: 1, extractionAttemptId: attempt!.id, values: [vehicle] });
    expect(await testDb.select().from(planningClarificationFieldStates).where(and(eq(planningClarificationFieldStates.instanceId, food.id), eq(planningClarificationFieldStates.key, "food_style")))).toEqual(before);
  });

  test("field projections exclude a narrow sibling value outside the instance scope", async () => {
    const seeded = await seed("owner", "narrow-projection");
    const accommodation = resolvePlanningContext({ ...clar21.proposal, deliverables: [{ id: "danang", kind: "accommodation", scopeId: "danang" }, { id: "transit", kind: "accommodation", scopeId: "transit" }] })!;
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded, accommodation))!.id, context: accommodation });
    const instances = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    const danang = instances.find((item) => item.scopeId === "danang")!;
    const transit = instances.find((item) => item.scopeId === "transit")!;
    const reply = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "khách sạn đẹp" }));
    const command = await commandForMessage("owner", seeded.conversationId, reply.message.id, "narrow-projection");
    const stayStyle = { ...evidence(reply.message.content, "stay_style", "khách sạn đẹp", "stay-style:v1"), scopeId: "danang", precedence: "explicit_compatible" as const };
    const attempt = await createOrReadClarificationAttempt({ commandId: command.id, sourceMessageId: reply.message.id, userId: "owner", expectedSessionRevision: 1, promptVersion: "narrow:extract", kind: "extraction", payload: { values: [stayStyle] } });
    await reduceClarificationMessage({ userId: "owner", sessionId: session!.id, sourceMessageId: reply.message.id, expectedSessionRevision: 1, expectedContentRevision: 1, extractionAttemptId: attempt!.id, values: [stayStyle] });
    expect((await testDb.select({ candidates: planningClarificationFieldStates.candidates }).from(planningClarificationFieldStates).where(and(eq(planningClarificationFieldStates.instanceId, danang.id), eq(planningClarificationFieldStates.key, "stay_style"))))[0]?.candidates).toEqual([{ value: "khách sạn đẹp", scopeId: "danang" }]);
    expect((await testDb.select({ candidates: planningClarificationFieldStates.candidates }).from(planningClarificationFieldStates).where(and(eq(planningClarificationFieldStates.instanceId, transit.id), eq(planningClarificationFieldStates.key, "transit_style"))))[0]?.candidates).toEqual([]);
  });

  test("direct durable transition and stale Trip aggregate claim are rejected", async () => {
    const seeded = await seed("owner", "trip-claim");
    const [project] = await testDb.insert((await import("@/db/schema")).tripProjects).values({ userId: "owner", title: "Trip" }).returning();
    await testDb.update(conversations).set({ tripProjectId: project!.id }).where(eq(conversations.id, seeded.conversationId));
    await testDb.update(aiAskCommands).set({ tripProjectId: project!.id, tripProjectAggregateVersion: project!.aggregateVersion }).where(eq(aiAskCommands.id, seeded.commandId));
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, tripProjectId: project!.id, planAttemptId: (await planAttempt(seeded))!.id, context });
    const [instance] = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.id, instance!.id));
    await testDb.update((await import("@/db/schema")).tripProjects).set({ aggregateVersion: 2 }).where(eq((await import("@/db/schema")).tripProjects.id, project!.id));
    expect(await claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instance!.id] })).toBeNull();
    await expect(testDb.update(planningClarificationInstances).set({ state: "completed" }).where(eq(planningClarificationInstances.id, instance!.id))).rejects.toThrow();
  });

  test("rejects extraction payload evidence that differs from submitted reduction", async () => {
    const seeded = await seed("owner", "payload-mismatch");
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded))!.id, context });
    const reply = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "Hai vợ chồng" }));
    const command = await commandForMessage("owner", seeded.conversationId, reply.message.id, "payload-mismatch-reply");
    const party = evidence(reply.message.content, "party", "Hai vợ chồng", "party:v1");
    const attempt = await createOrReadClarificationAttempt({ commandId: command.id, sourceMessageId: reply.message.id, userId: "owner", expectedSessionRevision: 1, promptVersion: "mismatch:extract", kind: "extraction", payload: { values: [] } });
    expect(await reduceClarificationMessage({ userId: "owner", sessionId: session!.id, sourceMessageId: reply.message.id, expectedSessionRevision: 1, expectedContentRevision: 1, extractionAttemptId: attempt!.id, values: [party] })).toBeNull();
    expect(await testDb.select().from(planningClarificationValues).where(eq(planningClarificationValues.sessionId, session!.id))).toEqual([]);
  });

  test("deleting evidence recomputes only instances that depended on its exact value", async () => {
    const seeded = await seed("owner", "delete-mixed");
    const mixed = resolvePlanningContext({ ...clar01.proposal, deliverables: [{ id: "itinerary", kind: "itinerary", scopeId: "delivery" }, { id: "food", kind: "food", scopeId: "delivery" }] })!;
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded, mixed))!.id, context: mixed });
    const instances = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    const itinerary = instances.find((item) => item.kind === "itinerary")!;
    const food = instances.find((item) => item.kind === "food")!;
    const deleted = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "car" }));
    const retained = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "ăn chay" }));
    const vehicle = evidence(deleted.message.content, "vehicle", "car", "vehicle:v1");
    const foodStyle = evidence(retained.message.content, "food_style", "ăn chay", "food-style:v1");
    await testDb.insert(planningClarificationValues).values([
      { sessionId: session!.id, ...vehicle, sourceMessageId: deleted.message.id, sourceMessageOrdinal: deleted.ordinal, evidenceDigest: vehicle.digest },
      { sessionId: session!.id, ...foodStyle, sourceMessageId: retained.message.id, sourceMessageOrdinal: retained.ordinal, evidenceDigest: foodStyle.digest },
    ]);
    await testDb.update(planningClarificationFieldStates).set({ state: "resolved", candidates: [{ value: "car", scopeId: "journey" }] }).where(and(eq(planningClarificationFieldStates.instanceId, itinerary.id), eq(planningClarificationFieldStates.key, "vehicle")));
    await testDb.update(planningClarificationFieldStates).set({ state: "resolved", candidates: [{ value: "ăn chay", scopeId: "journey" }] }).where(and(eq(planningClarificationFieldStates.instanceId, food.id), eq(planningClarificationFieldStates.key, "food_style")));
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.id, itinerary.id));
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.id, food.id));
    await testDb.delete(messages).where(eq(messages.id, deleted.message.id));
    expect((await testDb.select({ state: planningClarificationInstances.state }).from(planningClarificationInstances).where(eq(planningClarificationInstances.id, itinerary.id)))[0]?.state).toBe("collecting");
    expect((await testDb.select({ state: planningClarificationInstances.state }).from(planningClarificationInstances).where(eq(planningClarificationInstances.id, food.id)))[0]?.state).toBe("ready");
    expect(await testDb.select({ state: planningClarificationFieldStates.state }).from(planningClarificationFieldStates).where(and(eq(planningClarificationFieldStates.instanceId, food.id), eq(planningClarificationFieldStates.key, "food_style")))).toEqual([{ state: "resolved" }]);
  });

  test("deleting one duplicate evidence retains a ready instance when remaining projections are complete", async () => {
    const seeded = await seed("owner", "delete-retains-ready");
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded))!.id, context });
    const [instance] = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    const first = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "car" }));
    const second = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "Hà Nội đến Đà Nẵng, Hai vợ chồng, car" }));
    const vehicle = evidence(first.message.content, "vehicle", "car", "vehicle:v1");
    const retainedVehicle = evidence(second.message.content, "vehicle", "car", "vehicle:v1");
    const direction = evidence(second.message.content, "direction", "Hà Nội đến Đà Nẵng", "direction:v1");
    const party = evidence(second.message.content, "party", "Hai vợ chồng", "party:v1");
    await testDb.insert(planningClarificationValues).values([
      { sessionId: session!.id, ...vehicle, sourceMessageId: first.message.id, sourceMessageOrdinal: first.ordinal, evidenceDigest: vehicle.digest },
      { sessionId: session!.id, ...retainedVehicle, sourceMessageId: second.message.id, sourceMessageOrdinal: second.ordinal, evidenceDigest: retainedVehicle.digest },
      { sessionId: session!.id, ...direction, sourceMessageId: second.message.id, sourceMessageOrdinal: second.ordinal, evidenceDigest: direction.digest },
      { sessionId: session!.id, ...party, sourceMessageId: second.message.id, sourceMessageOrdinal: second.ordinal, evidenceDigest: party.digest },
    ]);
    await testDb.update(planningClarificationFieldStates).set({ state: "resolved", candidates: [{ value: "car", scopeId: "journey" }] }).where(and(eq(planningClarificationFieldStates.instanceId, instance!.id), eq(planningClarificationFieldStates.key, "vehicle")));
    await testDb.update(planningClarificationFieldStates).set({ state: "resolved", candidates: [{ value: direction.value, scopeId: "journey" }] }).where(and(eq(planningClarificationFieldStates.instanceId, instance!.id), eq(planningClarificationFieldStates.key, "direction")));
    await testDb.update(planningClarificationFieldStates).set({ state: "resolved", candidates: [{ value: party.value, scopeId: "journey" }] }).where(and(eq(planningClarificationFieldStates.instanceId, instance!.id), eq(planningClarificationFieldStates.key, "party")));
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.id, instance!.id));
    await testDb.delete(messages).where(eq(messages.id, first.message.id));
    expect((await testDb.select({ state: planningClarificationInstances.state }).from(planningClarificationInstances).where(eq(planningClarificationInstances.id, instance!.id)))[0]?.state).toBe("ready");
  });

  test("evidence deletion completes a session when it abandons its final claimed instance", async () => {
    const seeded = await seed("owner", "delete-terminal");
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, planAttemptId: (await planAttempt(seeded))!.id, context });
    const [instance] = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    const reply = await testDb.transaction((transaction) => insertConversationMessage(transaction, { conversationId: seeded.conversationId, userId: "owner", role: "user", content: "car" }));
    const vehicle = evidence(reply.message.content, "vehicle", "car", "vehicle:v1");
    await testDb.insert(planningClarificationValues).values({ sessionId: session!.id, ...vehicle, sourceMessageId: reply.message.id, sourceMessageOrdinal: reply.ordinal, evidenceDigest: vehicle.digest });
    await testDb.update(planningClarificationFieldStates).set({ state: "resolved", candidates: [{ value: "car", scopeId: "journey" }] }).where(and(eq(planningClarificationFieldStates.instanceId, instance!.id), eq(planningClarificationFieldStates.key, "vehicle")));
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.id, instance!.id));
    await testDb.update(planningClarificationInstances).set({ state: "claimed" }).where(eq(planningClarificationInstances.id, instance!.id));
    await testDb.delete(messages).where(eq(messages.id, reply.message.id));
    expect((await testDb.select({ state: planningClarificationInstances.state }).from(planningClarificationInstances).where(eq(planningClarificationInstances.id, instance!.id)))[0]?.state).toBe("abandoned");
    expect((await testDb.select({ state: planningClarificationSessions.state }).from(planningClarificationSessions).where(eq(planningClarificationSessions.id, session!.id)))[0]?.state).toBe("completed");
  });

  test("rejects proposal-pinned sessions after the proposal changes or is deleted", async () => {
    const seeded = await seed("owner", "proposal-pin");
    const [project] = await testDb.insert(tripProjects).values({ userId: "owner", title: "Trip" }).returning();
    await testDb.update(conversations).set({ tripProjectId: project!.id }).where(eq(conversations.id, seeded.conversationId));
    await testDb.update(aiAskCommands).set({ tripProjectId: project!.id, tripProjectAggregateVersion: project!.aggregateVersion }).where(eq(aiAskCommands.id, seeded.commandId));
    const [proposal] = await testDb.insert(tripChangeProposals).values({ id: "proposal-pin", userId: "owner", tripProjectId: project!.id, creatorClass: "owner_command", rationale: "Cập nhật", operations: [{ op: "add" }], expectedAggregateVersion: project!.aggregateVersion }).returning();
    const session = await initializeClarificationSession({ userId: "owner", conversationId: seeded.conversationId, tripProjectId: project!.id, proposalId: proposal!.id, proposalVersion: proposal!.version, planAttemptId: (await planAttempt(seeded))!.id, context });
    expect(session?.proposalId).toBe(proposal!.id);
    await testDb.update(tripChangeProposals).set({ rationale: "Đã sửa" }).where(eq(tripChangeProposals.id, proposal!.id));
    const [instance] = await testDb.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    await testDb.update(planningClarificationInstances).set({ state: "ready" }).where(eq(planningClarificationInstances.id, instance!.id));
    expect(await claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instance!.id] })).toBeNull();
    await testDb.delete(tripChangeProposals).where(eq(tripChangeProposals.id, proposal!.id));
    expect(await claimReadyClarificationInstances({ userId: "owner", sessionId: session!.id, commandId: seeded.commandId, expectedSessionRevision: 1, expectedContentRevision: 1, instanceIds: [instance!.id] })).toBeNull();
  });
});

async function seed(owner: string, suffix: string) {
  await testDb.insert(users).values({ id: owner, email: `${owner}@example.com` });
  const [conversation] = await testDb.insert(conversations).values({ id: `conversation-${suffix}`, userId: owner, contentRevision: 1 }).returning();
  const [message] = await testDb.insert(messages).values({ id: `message-${suffix}`, conversationId: conversation!.id, userId: owner, role: "user", content: "Lập kế hoạch", ordinal: 1 }).returning();
  const [command] = await testDb.insert(aiAskCommands).values({ id: `command-${suffix}`, userId: owner, scopeKind: "conversation", scopeId: conversation!.id, idempotencyKey: `clarification-key-${suffix}`.padEnd(16, "x"), requestDigest: "a".repeat(64), selectedScopeDigest: "b".repeat(64), normalizedQuestion: "Lập kế hoạch", conversationId: conversation!.id, conversationLifecycleVersion: 1, userMessageId: message!.id, expiresAt: new Date(Date.now() + 60_000) }).returning();
  return { conversationId: conversation!.id, messageId: message!.id, commandId: command!.id };
}

async function planAttempt(input: { commandId: string; messageId: string }, selected = context) { return createOrReadClarificationAttempt({ commandId: input.commandId, sourceMessageId: input.messageId, userId: "owner", expectedSessionRevision: 0, promptVersion: "plan:v1", kind: "plan", payload: planPayload(selected) }); }
function planPayload(selected = context) { return { graphDigest: selected.graphDigest, profileVersion: selected.versions.profileVersion, policyVersion: selected.versions.policyVersion, comparatorVersion: selected.versions.comparatorVersion, valueSchemaVersions: selected.versions.valueSchemaVersions }; }
function evidence(content: string, key: string, value: string, schemaVersion: string) { const startOffset = content.indexOf(value); return { key, value, scopeId: "journey", schemaVersion, precedence: "nearest_ancestor" as const, startOffset, endOffset: startOffset + value.length, digest: createHash("sha256").update(value).digest("hex") }; }
async function commandForMessage(userId: string, conversationId: string, userMessageId: string, suffix: string, conversationLifecycleVersion = 1) { const [command] = await testDb.insert(aiAskCommands).values({ userId, scopeKind: "conversation", scopeId: `${conversationId}-${suffix}`, idempotencyKey: `clarification-${suffix}`.padEnd(16, "x"), requestDigest: "e".repeat(64), selectedScopeDigest: "f".repeat(64), normalizedQuestion: "Lượt mới", conversationId, conversationLifecycleVersion, userMessageId, expiresAt: new Date(Date.now() + 60_000) }).returning(); return command!; }
