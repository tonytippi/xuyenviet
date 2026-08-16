import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { loadAnswerContext, resolveOwnedPlanningMode } from "../packages/database/src/answer-context";
import { chatContext, conversations, messages, tripChangeProposals, tripProjects, users } from "../packages/database/src/schema";
import { resetTestDatabase, testDb } from "./helpers/db";

describe("planning mode owner authority", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("keeps foreign or mismatched selected scope unscoped without loading private proposal data", async () => {
    await testDb.insert(users).values([{ id: "owner", email: "owner@example.com" }, { id: "other", email: "other@example.com" }]);
    const [privateTrip] = await testDb.insert(tripProjects).values({ userId: "other", title: "Riêng tư", destination: "Bí mật" }).returning({ id: tripProjects.id });
    const [ownerConversation] = await testDb.insert(conversations).values({ userId: "owner" }).returning({ id: conversations.id });
    await testDb.insert(tripChangeProposals).values({ userId: "other", tripProjectId: privateTrip.id, creatorClass: "owner_command", rationale: "Riêng tư", operations: [{ kind: "create-item" }], expectedAggregateVersion: 1 });

    await expect(resolveOwnedPlanningMode({ userId: "owner", conversationId: ownerConversation.id, tripProjectId: privateTrip.id, question: "Xem đề xuất này", sessionRevision: null })).resolves.toMatchObject({ kind: "resolved", executionRef: { mode: "unscoped_answer", tripProjectId: null, proposalId: null }, proposal: null });
  });

  test("uses applied Trip fields but never project-scoped chat as current-plan authority", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [trip] = await testDb.insert(tripProjects).values({ userId: "owner", title: "Huế", destination: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "owner", tripProjectId: trip.id }).returning({ id: conversations.id });
    const [message] = await testDb.insert(messages).values({ userId: "owner", conversationId: conversation.id, role: "user", content: "Đổi sang Đà Lạt" }).returning({ id: messages.id });
    await testDb.insert(chatContext).values({ userId: "owner", conversationId: conversation.id, tripProjectId: trip.id, sourceMessageId: message.id, field: "destination", scope: "trip_project", value: "Đà Lạt" });

    const context = await loadAnswerContext({ userId: "owner", conversationId: conversation.id, tripProjectId: trip.id });
    expect(context.anchors).toEqual(expect.arrayContaining([{ field: "destination", value: "Huế", source: "trip_project" }]));
    expect(context.anchors).not.toEqual(expect.arrayContaining([{ field: "destination", value: "Đà Lạt", source: "trip_project" }]));
  });

  test("re-resolves dismissed and applied proposals without retaining proposal authority", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [trip] = await testDb.insert(tripProjects).values({ userId: "owner", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "owner", tripProjectId: trip.id }).returning({ id: conversations.id });
    const [proposal] = await testDb.insert(tripChangeProposals).values({ userId: "owner", tripProjectId: trip.id, creatorClass: "owner_command", rationale: "Đổi điểm dừng", operations: [{ kind: "create-item" }], expectedAggregateVersion: 1 }).returning({ id: tripChangeProposals.id });

    await expect(resolveOwnedPlanningMode({ userId: "owner", conversationId: conversation.id, tripProjectId: trip.id, question: "Xem đề xuất này", sessionRevision: null })).resolves.toMatchObject({ kind: "resolved", executionRef: { mode: "validate_proposal", proposalId: proposal.id } });
    await testDb.update(tripChangeProposals).set({ status: "dismissed", terminalTimestamp: new Date() }).where(eq(tripChangeProposals.id, proposal.id));
    await expect(resolveOwnedPlanningMode({ userId: "owner", conversationId: conversation.id, tripProjectId: trip.id, question: "Xem đề xuất này", sessionRevision: null })).resolves.toMatchObject({ kind: "clarification" });
    await testDb.update(tripProjects).set({ aggregateVersion: 2 }).where(eq(tripProjects.id, trip.id));
    await expect(resolveOwnedPlanningMode({ userId: "owner", conversationId: conversation.id, tripProjectId: trip.id, question: "Kế hoạch hiện tại", sessionRevision: null })).resolves.toMatchObject({ kind: "resolved", executionRef: { mode: "current_plan", proposalId: null, tripAggregateVersion: 2 } });
  });

  test("does not validate an expired pending proposal", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [trip] = await testDb.insert(tripProjects).values({ userId: "owner", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "owner", tripProjectId: trip.id }).returning({ id: conversations.id });
    await testDb.insert(tripChangeProposals).values({ userId: "owner", tripProjectId: trip.id, creatorClass: "owner_command", rationale: "Đổi điểm dừng", operations: [{ kind: "create-item" }], expectedAggregateVersion: 1, expiresAt: new Date(Date.now() - 1_000) });

    await expect(resolveOwnedPlanningMode({ userId: "owner", conversationId: conversation.id, tripProjectId: trip.id, question: "Xem đề xuất này", sessionRevision: null })).resolves.toMatchObject({ kind: "clarification", question: expect.stringContaining("chưa có") });
  });
});
