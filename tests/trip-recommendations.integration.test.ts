import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { acceptTripCreationRecommendation, choosePrivateTripRecommendation, continueInTrip, createPostgresTripRecommendationReadRepository, declineTripCreationRecommendation } from "../packages/database/src/trip-recommendations";
import { createPostgresTravelerCommandPort, createPostgresTripProjectSidebarReadRepository } from "../packages/database/src";
import { aiAskCommands, chatContext, conversations, domainOutbox, messages, tripProjects, tripRecommendationContexts, users } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";

async function readyConversation(owner = "owner", id = "conversation") {
  await testDb.insert(users).values({ id: owner, email: `${owner}@example.com` });
  const [conversation] = await testDb.insert(conversations).values({ id, userId: owner }).returning();
  const [message] = await testDb.insert(messages).values({ id: `${id}-message`, conversationId: conversation!.id, userId: owner, role: "user", content: "Tôi muốn đi Đà Lạt" }).returning();
  const [command] = await testDb.insert(aiAskCommands).values({ userId: owner, scopeKind: "conversation", scopeId: conversation!.id, idempotencyKey: `${id}-idempotency-key`, requestDigest: "a".repeat(64), normalizedQuestion: "Tôi muốn đi Đà Lạt", selectedScopeDigest: "b".repeat(64), status: "completed", conversationId: conversation!.id, terminalAt: new Date(), terminalResult: { type: "done" }, expiresAt: new Date(Date.now() + 60_000) }).returning();
  await testDb.insert(domainOutbox).values({ originatingCommandId: command!.id, eventType: "ai_ask.context_extraction.v1", eventVersion: 1, aggregateType: "ai_ask_command", aggregateId: command!.id, userId: owner, conversationId: conversation!.id, userMessageId: message!.id, conversationLifecycleVersion: 1, dedupeKey: `${id}-context-extraction`, payload: {}, status: "completed", completedAt: new Date() });
  await testDb.insert(chatContext).values({ userId: owner, conversationId: conversation!.id, sourceMessageId: message!.id, field: "destination", scope: "conversation", value: "  Đà   Lạt " });
  return conversation!;
}

describe("trip recommendation aggregate", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("projects only an owner's linked primary conversation and omits stale pointers", async () => {
    await testDb.insert(users).values([
      { id: "owner", email: "owner@example.com" },
      { id: "other", email: "other@example.com" },
    ]);
    const commands = createPostgresTravelerCommandPort();
    const ownerProject = await commands.createTripProject("owner", { title: "Chuyến đi của tôi" });
    const otherProject = await commands.createTripProject("other", { title: "Không được lộ" });
    expect(ownerProject).toMatchObject({ success: true });
    expect(otherProject).toMatchObject({ success: true });
    if (!ownerProject.success || !otherProject.success) throw new Error("Expected project creation");

    const sidebar = createPostgresTripProjectSidebarReadRepository();
    await expect(sidebar.listOwnedTripProjectSidebarSummaries("owner")).resolves.toEqual([
      expect.objectContaining({ id: ownerProject.project.id, title: "Chuyến đi của tôi", conversationId: expect.any(String) }),
    ]);

    const [{ conversationId }] = await sidebar.listOwnedTripProjectSidebarSummaries("owner");
    await testDb.update(tripProjects).set({ primaryConversationId: null }).where(eq(tripProjects.id, ownerProject.project.id));
    await testDb.update(conversations).set({ tripProjectId: null }).where(eq(conversations.id, conversationId));
    await expect(sidebar.listOwnedTripProjectSidebarSummaries("owner")).resolves.toEqual([]);
  });

  test("is non-actionable until the owner-scoped extraction effect completes", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await testDb.insert(conversations).values({ id: "conversation", userId: "owner" });
    await expect(createPostgresTripRecommendationReadRepository().loadOwnedTripRecommendations("owner", "conversation")).resolves.toEqual({ tripCreationRecommendation: { kind: "none" }, tripContextRecommendation: { kind: "none" } });
  });

  test("does not make a failed extraction actionable", async () => {
    const conversation = await readyConversation();
    await testDb.update(domainOutbox).set({ status: "failed", completedAt: null, failureCode: "failed", failedAt: new Date() }).where(eq(domainOutbox.conversationId, conversation.id));
    await expect(createPostgresTripRecommendationReadRepository().loadOwnedTripRecommendations("owner", "conversation")).resolves.toEqual({ tripCreationRecommendation: { kind: "none" }, tripContextRecommendation: { kind: "none" } });
  });

  test("waits for the latest extraction instead of a completed earlier turn", async () => {
    const conversation = await readyConversation();
    const [pendingCommand] = await testDb.insert(aiAskCommands).values({ userId: "owner", scopeKind: "conversation", scopeId: "pending-command", idempotencyKey: "pending-extraction-key", requestDigest: "c".repeat(64), normalizedQuestion: "Tôi đi cùng hai bé", selectedScopeDigest: "d".repeat(64), status: "completed", conversationId: conversation.id, terminalAt: new Date(), terminalResult: { type: "done" }, expiresAt: new Date(Date.now() + 60_000) }).returning();
    await testDb.insert(domainOutbox).values({ originatingCommandId: pendingCommand!.id, eventType: "ai_ask.context_extraction.v1", eventVersion: 1, aggregateType: "ai_ask_command", aggregateId: pendingCommand!.id, userId: "owner", conversationId: conversation.id, userMessageId: `${conversation.id}-message`, conversationLifecycleVersion: 1, dedupeKey: "pending-context-extraction", payload: {}, status: "pending", createdAt: new Date(Date.now() + 86_400_000) });
    await expect(createPostgresTripRecommendationReadRepository().loadOwnedTripRecommendations("owner", conversation.id)).resolves.toEqual({ tripCreationRecommendation: { kind: "none" }, tripContextRecommendation: { kind: "none" } });
  });

  test("offers an owner-bound creation decision, persists a decline fence, and advances revision on material change", async () => {
    const conversation = await readyConversation();
    const repository = createPostgresTripRecommendationReadRepository();
    const offered = await repository.loadOwnedTripRecommendations("owner", conversation.id);
    expect(offered.tripCreationRecommendation).toMatchObject({ kind: "offer" });
    if (offered.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation offer");
    await expect(declineTripCreationRecommendation("owner", { decisionId: offered.tripCreationRecommendation.decisionId })).resolves.toEqual({ success: true });
    await expect(repository.loadOwnedTripRecommendations("owner", conversation.id)).resolves.toMatchObject({ tripCreationRecommendation: { kind: "none" } });
    await testDb.insert(chatContext).values({ userId: "owner", conversationId: conversation.id, sourceMessageId: `${conversation.id}-message`, field: "adults", scope: "conversation", value: "2" });
    const changed = await repository.loadOwnedTripRecommendations("owner", conversation.id);
    expect(changed.tripCreationRecommendation).toMatchObject({ kind: "offer" });
    await expect(testDb.select({ revision: tripRecommendationContexts.revision }).from(tripRecommendationContexts).where(and(eq(tripRecommendationContexts.userId, "owner"), eq(tripRecommendationContexts.conversationId, conversation.id)))).resolves.toEqual([{ revision: 2 }]);
    await testDb.update(chatContext).set({ status: "deleted" }).where(and(eq(chatContext.conversationId, conversation.id), eq(chatContext.field, "adults"), eq(chatContext.status, "active")));
    await repository.loadOwnedTripRecommendations("owner", conversation.id);
    await expect(testDb.select({ revision: tripRecommendationContexts.revision }).from(tripRecommendationContexts).where(and(eq(tripRecommendationContexts.userId, "owner"), eq(tripRecommendationContexts.conversationId, conversation.id)))).resolves.toEqual([{ revision: 3 }]);
  });

  test("keeps a declined current decision available for an explicit save", async () => {
    const conversation = await readyConversation();
    const repository = createPostgresTripRecommendationReadRepository();
    const offered = await repository.loadOwnedTripRecommendations("owner", conversation.id);
    if (offered.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation offer");
    await declineTripCreationRecommendation("owner", { decisionId: offered.tripCreationRecommendation.decisionId });
    await expect(repository.loadOwnedTripRecommendations("owner", conversation.id)).resolves.toMatchObject({ tripCreationRecommendation: { kind: "none" } });
    await expect(acceptTripCreationRecommendation("owner", { decisionId: offered.tripCreationRecommendation.decisionId, idempotencyKey: "explicit-save-key-001" })).resolves.toMatchObject({ success: true });
  });

  test("projects one owned project as a canonical destination and multiple projects without disclosing candidates", async () => {
    const conversation = await readyConversation();
    const repository = createPostgresTripRecommendationReadRepository();
    const [first] = await testDb.insert(tripProjects).values({ userId: "owner", title: "Đà Lạt riêng" }).returning();
    const single = await repository.loadOwnedTripRecommendations("owner", conversation.id);
    expect(single.tripContextRecommendation).toMatchObject({ kind: "single", tripProjectId: first!.id, title: "Đà Lạt riêng" });
    if (single.tripContextRecommendation.kind !== "single") throw new Error("Expected a single project");
    await expect(continueInTrip("owner", { decisionId: single.tripContextRecommendation.decisionId, tripProjectId: first!.id })).resolves.toMatchObject({ success: true, destination: { tripProjectId: first!.id } });
    await testDb.insert(tripProjects).values({ userId: "owner", title: "Nha Trang riêng" });
    const multiple = await repository.loadOwnedTripRecommendations("owner", conversation.id);
    expect(multiple.tripContextRecommendation).toEqual(expect.objectContaining({ kind: "multiple", actions: ["private_answer"] }));
    expect(multiple.tripContextRecommendation).not.toHaveProperty("tripProjectId");
    await testDb.insert(users).values({ id: "other-owner", email: "other-owner@example.com" });
    await testDb.insert(tripProjects).values({ userId: "other-owner", title: "Không được lộ" });
    const privateDecision = await repository.loadOwnedTripRecommendations("owner", conversation.id);
    if (privateDecision.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation offer");
    await expect(choosePrivateTripRecommendation("owner", { decisionId: privateDecision.tripCreationRecommendation.decisionId })).resolves.toEqual({ success: true });
    await expect(testDb.select({ tripProjectId: conversations.tripProjectId }).from(conversations).where(eq(conversations.id, conversation.id))).resolves.toEqual([{ tripProjectId: null }]);
  });

  test("atomically creates one fresh project and primary conversation, replaying the same accepted request", async () => {
    const original = await readyConversation();
    const recommendation = await createPostgresTripRecommendationReadRepository().loadOwnedTripRecommendations("owner", original.id);
    if (recommendation.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation offer");
    const input = { decisionId: recommendation.tripCreationRecommendation.decisionId, idempotencyKey: "accept-creation-key-0001" };
    const first = await acceptTripCreationRecommendation("owner", input);
    const replay = await acceptTripCreationRecommendation("owner", input);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({ success: true });
    if (!first.success) return;
    await expect(testDb.select({ id: tripProjects.id, primaryConversationId: tripProjects.primaryConversationId }).from(tripProjects).where(eq(tripProjects.id, first.destination.tripProjectId))).resolves.toEqual([{ id: first.destination.tripProjectId, primaryConversationId: first.destination.conversationId }]);
    await expect(testDb.select({ tripProjectId: conversations.tripProjectId }).from(conversations).where(eq(conversations.id, original.id))).resolves.toEqual([{ tripProjectId: null }]);
  });

  test("scrubs an accepted replay after its created project is deleted", async () => {
    const original = await readyConversation();
    const recommendation = await createPostgresTripRecommendationReadRepository().loadOwnedTripRecommendations("owner", original.id);
    if (recommendation.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation offer");
    const input = { decisionId: recommendation.tripCreationRecommendation.decisionId, idempotencyKey: "deleted-project-replay" };
    const accepted = await acceptTripCreationRecommendation("owner", input);
    if (!accepted.success) throw new Error("Expected acceptance");
    await expect(createPostgresTravelerCommandPort().deleteTripProject("owner", accepted.destination.tripProjectId)).resolves.toEqual({ success: true });
    await expect(acceptTripCreationRecommendation("owner", input)).resolves.toEqual({ success: false, reason: "refresh_required" });
  });

  test("serializes concurrent accepted creation and safely replays the winner", async () => {
    const original = await readyConversation();
    const recommendation = await createPostgresTripRecommendationReadRepository().loadOwnedTripRecommendations("owner", original.id);
    if (recommendation.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation offer");
    const input = { decisionId: recommendation.tripCreationRecommendation.decisionId, idempotencyKey: "concurrent-creation-1" };
    const [left, right] = await Promise.all([acceptTripCreationRecommendation("owner", input), acceptTripCreationRecommendation("owner", input)]);
    expect(left).toEqual(right);
    expect(left).toMatchObject({ success: true });
    await expect(testDb.select({ id: tripProjects.id }).from(tripProjects).where(eq(tripProjects.userId, "owner"))).resolves.toHaveLength(1);
  });

  test("rejects a changed-context or deleted-conversation decision without creating a project", async () => {
    const original = await readyConversation();
    const repository = createPostgresTripRecommendationReadRepository();
    const changed = await repository.loadOwnedTripRecommendations("owner", original.id);
    if (changed.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation offer");
    await testDb.insert(chatContext).values({ userId: "owner", conversationId: original.id, sourceMessageId: `${original.id}-message`, field: "adults", scope: "conversation", value: "4" });
    await expect(acceptTripCreationRecommendation("owner", { decisionId: changed.tripCreationRecommendation.decisionId, idempotencyKey: "changed-context-key1" })).resolves.toEqual({ success: false, reason: "refresh_required" });
    expect(await testDb.select().from(tripProjects)).toEqual([]);
    const refreshed = await repository.loadOwnedTripRecommendations("owner", original.id);
    if (refreshed.tripCreationRecommendation.kind !== "offer") throw new Error("Expected refreshed offer");
    await expect(createPostgresTravelerCommandPort().deleteConversation("owner", original.id)).resolves.toEqual({ success: true });
    await expect(acceptTripCreationRecommendation("owner", { decisionId: refreshed.tripCreationRecommendation.decisionId, idempotencyKey: "deleted-conversation" })).resolves.toEqual({ success: false, reason: "refresh_required" });
    expect(await testDb.select().from(tripProjects)).toEqual([]);
  });

  test("rejects creation when the formerly ordinary conversation becomes scoped", async () => {
    const original = await readyConversation();
    const recommendation = await createPostgresTripRecommendationReadRepository().loadOwnedTripRecommendations("owner", original.id);
    if (recommendation.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation offer");
    const [project] = await testDb.insert(tripProjects).values({ userId: "owner", title: "Đã chọn" }).returning();
    await testDb.update(conversations).set({ tripProjectId: project!.id }).where(eq(conversations.id, original.id));
    await expect(acceptTripCreationRecommendation("owner", { decisionId: recommendation.tripCreationRecommendation.decisionId, idempotencyKey: "scoped-conversation-key" })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select({ id: tripProjects.id }).from(tripProjects).where(eq(tripProjects.userId, "owner"))).resolves.toHaveLength(1);
  });

  test("does not disclose or accept another owner's decision", async () => {
    const conversation = await readyConversation();
    const recommendation = await createPostgresTripRecommendationReadRepository().loadOwnedTripRecommendations("owner", conversation.id);
    if (recommendation.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation offer");
    await testDb.insert(users).values({ id: "other", email: "other@example.com" });
    await expect(acceptTripCreationRecommendation("other", { decisionId: recommendation.tripCreationRecommendation.decisionId, idempotencyKey: "foreign-creation-key-1" })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select().from(tripProjects)).resolves.toEqual([]);
  });

  test("rejects foreign, mismatched, and creation decisions for continue without attaching anything", async () => {
    const conversation = await readyConversation();
    const repository = createPostgresTripRecommendationReadRepository();
    const [project] = await testDb.insert(tripProjects).values({ userId: "owner", title: "Đà Lạt" }).returning();
    const recommendation = await repository.loadOwnedTripRecommendations("owner", conversation.id);
    if (recommendation.tripContextRecommendation.kind !== "single") throw new Error("Expected a single project");
    await testDb.insert(users).values({ id: "other", email: "other@example.com" });
    await expect(continueInTrip("owner", { decisionId: recommendation.tripContextRecommendation.decisionId, tripProjectId: "other-project" })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(continueInTrip("other", { decisionId: recommendation.tripContextRecommendation.decisionId, tripProjectId: project!.id })).resolves.toEqual({ success: false, reason: "refresh_required" });
    if (recommendation.tripCreationRecommendation.kind !== "offer") throw new Error("Expected creation offer");
    await expect(continueInTrip("owner", { decisionId: recommendation.tripCreationRecommendation.decisionId, tripProjectId: project!.id })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select({ tripProjectId: conversations.tripProjectId }).from(conversations).where(eq(conversations.id, conversation.id))).resolves.toEqual([{ tripProjectId: null }]);
  });
});
