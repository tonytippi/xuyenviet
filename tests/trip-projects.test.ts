import { asc, eq, sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiUsageEvents, answerUsefulnessFeedback, assistantResponseProvenance, assistantRetrievalDecisions, auditEvents, chatContext, conversations, messageImageAttachments, messages, tripPlanItems, tripProjectConstraints, tripProjects, users, webSearchResults } from "@/db/schema";

import { testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

describe("Trip project helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("throws a safe error when unauthenticated create is attempted", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
    }));
    const { createTripProject } = await import("@/features/chat-trips/trip-projects");

    await expect(createTripProject({ title: "Đà Nẵng" })).rejects.toThrow("Authentication required");
    await expect(testDb.select().from(tripProjects)).resolves.toHaveLength(0);
  });

  test("creates an owned trip project with trimmed fields and an audit event", async () => {
    await createTestUser("user-1");
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { createTripProject } = await import("@/features/chat-trips/trip-projects");

    const project = await createTripProject({
      title: "  Đà Nẵng 7 ngày  ",
      origin: " Hà Nội ",
      destination: " Đà Nẵng ",
      startDate: " 2026-08-01 ",
      endDate: " ",
      travelers: " 2 người lớn ",
      notes: "  Đi chậm  ",
    });
    const audits = await testDb.select().from(auditEvents);

    expect(project).toMatchObject({ title: "Đà Nẵng 7 ngày", origin: "Hà Nội", destination: "Đà Nẵng", startDate: "2026-08-01", endDate: null, travelers: "2 người lớn", notes: "Đi chậm" });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorUserId: "user-1", actorEmail: "user-1@example.com", operation: "create", targetType: "trip_project", targetId: project.id });
    expect(audits[0].afterSummary).toContain("titleLength");
    expect(audits[0].afterSummary).not.toContain("Đà Nẵng 7 ngày");
    expect(audits[0].afterSummary).not.toContain("Hà Nội");
    expect(audits[0].afterSummary).not.toContain("2026-08-01");
  });

  test("rejects blank project titles before insert", async () => {
    await createTestUser("user-1");
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { createTripProject } = await import("@/features/chat-trips/trip-projects");

    await expect(createTripProject({ title: "   " })).rejects.toThrow("Trip project title is required");
    await expect(testDb.select().from(tripProjects)).resolves.toHaveLength(0);
  });

  test("lists and reads only projects owned by the authenticated user", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [ownOld] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế", updatedAt: new Date("2026-07-01T00:00:00.000Z") }).returning({ id: tripProjects.id });
    const [ownNew] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt", updatedAt: new Date("2026-07-03T00:00:00.000Z") }).returning({ id: tripProjects.id });
    const [other] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Riêng tư", updatedAt: new Date("2026-07-04T00:00:00.000Z") }).returning({ id: tripProjects.id });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { getOwnedTripProject, listOwnedTripProjects } = await import("@/features/chat-trips/trip-projects");

    const projects = await listOwnedTripProjects();

    expect(projects?.map((project) => project.id)).toEqual([ownNew.id, ownOld.id]);
    await expect(getOwnedTripProject(ownNew.id)).resolves.toMatchObject({ id: ownNew.id, title: "Đà Lạt" });
    await expect(getOwnedTripProject(other.id)).resolves.toBeNull();
  });

  test("returns related chat summaries only for the selected owned project", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Hà Giang" }).returning({ id: tripProjects.id });
    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt" }).returning({ id: tripProjects.id });
    const [related] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    const [unrelated] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: otherProject.id }).returning({ id: conversations.id });
    await testDb.insert(messages).values([
      { conversationId: related.id, userId: "user-1", role: "user", content: "Lịch trình Hà Giang 4 ngày" },
      { conversationId: unrelated.id, userId: "user-1", role: "user", content: "Tin của dự án khác" },
    ]);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);
    const savedConversations = await testDb.select().from(conversations).orderBy(asc(conversations.createdAt));

    expect(savedConversations).toHaveLength(2);
    expect(summary?.primaryConversation).toEqual({ id: related.id, updatedAt: expect.any(Date), preview: "Lịch trình Hà Giang 4 ngày" });
    expect(summary?.historicChats).toEqual([]);
  });

  test("resolves one deterministic primary without changing the aggregate version", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Hà Giang" }).returning();
    await testDb.insert(conversations).values({ id: "older", userId: "user-1", tripProjectId: project.id, updatedAt: new Date("2026-07-01T00:00:00.000Z") });
    await testDb.insert(conversations).values({ id: "newer", userId: "user-1", tripProjectId: project.id, updatedAt: new Date("2026-07-02T00:00:00.000Z") });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { resolveOwnedPrimaryConversation } = await import("@/features/chat-trips/trip-projects");

    await expect(resolveOwnedPrimaryConversation(project.id)).resolves.toMatchObject({ id: "newer" });
    await expect(resolveOwnedPrimaryConversation(project.id)).resolves.toMatchObject({ id: "newer" });
    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));
    expect(savedProject).toMatchObject({ primaryConversationId: "newer", aggregateVersion: 1 });
  });

  test("serializes concurrent first primary resolution without duplicate conversations", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Concurrent Huế" }).returning();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { resolveOwnedPrimaryConversation } = await import("@/features/chat-trips/trip-projects");

    const resolved = await Promise.all(Array.from({ length: 8 }, () => resolveOwnedPrimaryConversation(project.id)));
    const rows = await testDb.select().from(conversations).where(eq(conversations.tripProjectId, project.id));
    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));

    expect(new Set(resolved.map((conversation) => conversation?.id)).size).toBe(1);
    expect(rows).toHaveLength(1);
    expect(savedProject).toMatchObject({ primaryConversationId: rows[0].id, aggregateVersion: 1 });
  });

  test("database pointer rejects cross-project and cross-owner conversations", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning();
    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt" }).returning();
    const [otherOwnerProject] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Riêng" }).returning();
    const [wrongProject] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: otherProject.id }).returning();
    const [wrongOwner] = await testDb.insert(conversations).values({ userId: "user-2", tripProjectId: otherOwnerProject.id }).returning();

    await expect(testDb.update(tripProjects).set({ primaryConversationId: wrongProject.id }).where(eq(tripProjects.id, project.id))).rejects.toThrow();
    await expect(testDb.update(tripProjects).set({ primaryConversationId: wrongOwner.id }).where(eq(tripProjects.id, project.id))).rejects.toThrow();
  });

  test("applies the actual 0062 migration to legacy zero, one, and multiple-chat projects without losing history", async () => {
    const migrationSql = readFileSync("drizzle/migrations/0062_faithful_mysterio.sql", "utf8").replaceAll("--> statement-breakpoint", "");

    await testDb.transaction(async (transaction) => {
      await transaction.execute(sql.raw(`
        create temp table trip_projects (id text primary key, user_id text not null, title text not null);
        create temp table conversations (id text primary key, user_id text not null, trip_project_id text, created_at timestamp not null default now(), updated_at timestamp not null default now(), unique (id, trip_project_id, user_id));
        create temp table messages (id text primary key, conversation_id text not null, content text not null);
        create temp table chat_context (id text primary key, conversation_id text not null, value text not null);
        insert into trip_projects (id, user_id, title) values ('zero', 'user-1', 'Zero'), ('one', 'user-1', 'One'), ('many', 'user-1', 'Many');
        insert into conversations (id, user_id, trip_project_id, updated_at) values ('one-chat', 'user-1', 'one', '2026-07-01'), ('old-chat', 'user-1', 'many', '2026-07-01'), ('new-chat', 'user-1', 'many', '2026-07-02');
        insert into messages (id, conversation_id, content) values ('message-old', 'old-chat', 'historic message');
        insert into chat_context (id, conversation_id, value) values ('context-old', 'old-chat', 'historic context');
      `));
      await transaction.execute(sql.raw("set local search_path to pg_temp, public"));
      await transaction.execute(sql.raw(migrationSql));

      const projects = await transaction.execute<{ id: string; primary_conversation_id: string }>(sql.raw("select id, primary_conversation_id from trip_projects order by id"));
      const conversationsAfterFirstRun = await transaction.execute<{ id: string }>(sql.raw("select id from conversations order by id"));
      await transaction.execute(sql.raw(`
        with ranked_conversations as (
          select id, trip_project_id, user_id, row_number() over (partition by trip_project_id, user_id order by updated_at desc, id desc) as rank
          from conversations where trip_project_id is not null
        )
        update trip_projects as project set primary_conversation_id = ranked.id
        from ranked_conversations as ranked
        where project.id = ranked.trip_project_id and project.user_id = ranked.user_id and ranked.rank = 1 and project.primary_conversation_id is null;
      `));
      const conversationsAfterSecondRun = await transaction.execute<{ id: string }>(sql.raw("select id from conversations order by id"));
      const preserved = await transaction.execute<{ messages: number; contexts: number }>(sql.raw("select (select count(*)::int from messages) as messages, (select count(*)::int from chat_context) as contexts"));

      expect(projects).toEqual(expect.arrayContaining([
        { id: "many", primary_conversation_id: "new-chat" },
        { id: "one", primary_conversation_id: "one-chat" },
      ]));
      const zeroPrimary = projects.find((project) => project.id === "zero")?.primary_conversation_id;
      expect(zeroPrimary).toMatch(/^[a-f0-9]{32}$/);
      expect(conversationsAfterFirstRun).toEqual(conversationsAfterSecondRun);
      expect(conversationsAfterFirstRun.map((row) => row.id)).toEqual([zeroPrimary, "new-chat", "old-chat", "one-chat"].sort());
      expect(preserved).toEqual([{ messages: 1, contexts: 1 }]);
      await transaction.execute(sql.raw("drop table chat_context, messages, conversations, trip_projects"));
    });
  });

  test("deleting a trip project detaches related conversations without clearing ownership", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Hà Giang" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.update(tripProjects).set({ primaryConversationId: conversation.id }).where(eq(tripProjects.id, project.id));

    await testDb.delete(tripProjects).where(eq(tripProjects.id, project.id));
    const [savedConversation] = await testDb.select().from(conversations).where(eq(conversations.id, conversation.id));

    expect(savedConversation).toMatchObject({ id: conversation.id, userId: "user-1", tripProjectId: null });
  });

  test("returns unauthenticated and does not delete a trip project without a session", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
    }));
    const { deleteOwnedTripProject } = await import("@/features/chat-trips/trip-projects");

    await expect(deleteOwnedTripProject(project.id)).resolves.toEqual({ success: false, reason: "unauthenticated" });
    await expect(testDb.select().from(tripProjects)).resolves.toHaveLength(1);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("returns not_found and does not delete another user's trip project", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Riêng tư user-2" }).returning({ id: tripProjects.id });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { deleteOwnedTripProject } = await import("@/features/chat-trips/trip-projects");

    await expect(deleteOwnedTripProject(project.id)).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(testDb.select().from(tripProjects)).resolves.toHaveLength(1);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("deletes an owned trip project, its linked chats, and project context with an auditable summary", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Nẵng bí mật", notes: "Không ghi vào audit" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    const [message] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Gia đình thích biển" }).returning({ id: messages.id });
    const [assistantMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "assistant", content: "Nên đi biển." }).returning({ id: messages.id });
    await testDb.insert(messageImageAttachments).values({ conversationId: conversation.id, messageId: message.id, userId: "user-1", mimeType: "image/png", byteSize: 12 });
    await testDb.insert(aiUsageEvents).values({ userId: "user-1", conversationId: conversation.id, userMessageId: message.id, assistantMessageId: assistantMessage.id, purpose: "ai_ask_initial_answer", provider: "ai_gateway", model: "test", promptVersion: "test", status: "success" });
    await testDb.insert(assistantRetrievalDecisions).values({ userId: "user-1", conversationId: conversation.id, userMessageId: message.id, assistantMessageId: assistantMessage.id, approvedKnowledgeCandidateCount: 1, approvedKnowledgeSelectedCount: 1, approvedKnowledgeTargetCount: 1, approvedKnowledgeRelevanceThreshold: 1, broadPlanningQuestion: false, freshnessRequired: false, conflictDetected: false, webSearchTriggered: false, webSearchTriggerReasons: [], generalReasoningUsed: true, warnings: [] });
    await testDb.insert(assistantResponseProvenance).values({ userId: "user-1", conversationId: conversation.id, userMessageId: message.id, assistantMessageId: assistantMessage.id, sourceCategory: "general", rank: 1, verificationStatus: "unverified", usedInPrompt: true, citedInAnswer: false, sourceSnapshot: {} });
    await testDb.insert(answerUsefulnessFeedback).values({ userId: "user-1", conversationId: conversation.id, assistantMessageId: assistantMessage.id, rating: "useful" });
    await testDb.insert(webSearchResults).values({ userId: "user-1", conversationId: conversation.id, userMessageId: message.id, query: "Đà Nẵng", title: "Nguồn", url: "https://example.com", snippet: "Thông tin", provider: "test", checkedAt: new Date(), sourceType: "general", confidence: "unverified", triggerReason: "no_approved_knowledge", rank: 1 });
    await testDb.insert(chatContext).values({
      userId: "user-1",
      conversationId: conversation.id,
      tripProjectId: project.id,
      sourceMessageId: message.id,
      field: "destination",
      scope: "trip_project",
      value: "Đà Nẵng bí mật",
      confidence: 90,
    });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { deleteOwnedTripProject } = await import("@/features/chat-trips/trip-projects");

    await expect(deleteOwnedTripProject(project.id)).resolves.toEqual({ success: true });
    await expect(testDb.select().from(tripProjects)).resolves.toHaveLength(0);
    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
    const savedConversations = await testDb.select().from(conversations).where(eq(conversations.id, conversation.id));
    const savedMessages = await testDb.select().from(messages).where(eq(messages.conversationId, conversation.id));
    const attachments = await testDb.select().from(messageImageAttachments).where(eq(messageImageAttachments.conversationId, conversation.id));
    const retrieval = await testDb.select().from(assistantRetrievalDecisions).where(eq(assistantRetrievalDecisions.conversationId, conversation.id));
    const provenance = await testDb.select().from(assistantResponseProvenance).where(eq(assistantResponseProvenance.conversationId, conversation.id));
    const feedback = await testDb.select().from(answerUsefulnessFeedback).where(eq(answerUsefulnessFeedback.conversationId, conversation.id));
    const searchRows = await testDb.select().from(webSearchResults).where(eq(webSearchResults.conversationId, conversation.id));
    const [usage] = await testDb.select().from(aiUsageEvents);
    const [audit] = await testDb.select().from(auditEvents);

    expect(savedConversations).toHaveLength(0);
    expect(savedMessages).toHaveLength(0);
    expect(attachments).toHaveLength(0);
    expect(retrieval).toHaveLength(0);
    expect(provenance).toHaveLength(0);
    expect(feedback).toHaveLength(0);
    expect(searchRows).toHaveLength(0);
    expect(usage).toMatchObject({ conversationId: null, userMessageId: null, assistantMessageId: null });
    expect(audit).toMatchObject({ actorUserId: "user-1", operation: "delete", targetType: "trip_project", targetId: project.id });
    expect(audit.beforeSummary).toContain('"linkedConversationCount":1');
    expect(audit.beforeSummary).toContain('"chatContextCount":1');
    expect(audit.afterSummary).toContain("linkedConversationsDeleted");
    expect(audit.beforeSummary).not.toContain("Đà Nẵng bí mật");
    expect(audit.beforeSummary).not.toContain("Gia đình thích biển");
  });

  test("creates versioned plan items only for the authenticated owner and writes content-free audits", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Quảng Bình" }).returning({ id: tripProjects.id });
    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Riêng tư" }).returning({ id: tripProjects.id });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { createInternalTripPlanItem } = await import("@/features/chat-trips/trip-projects");

    const result = await createInternalTripPlanItem(project.id, 1, { kind: "leg", type: "transport", state: "planned", label: "  Chạy xe bí mật  ", ordinal: 0, transportOriginLabel: "Hà Nội", transportDestinationLabel: "Phong Nha" });
    const denied = await createInternalTripPlanItem(otherProject.id, 1, { kind: "leg", type: "transport", state: "planned", label: "Không được tạo", ordinal: 0 });
    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));
    const [item] = await testDb.select().from(tripPlanItems);
    const audits = await testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "trip_plan_item"));

    expect(result).toMatchObject({ success: true, aggregateVersion: 2 });
    expect(denied).toEqual({ success: false, reason: "not_found" });
    expect(savedProject.aggregateVersion).toBe(2);
    expect(item).toMatchObject({ version: 1, label: "Chạy xe bí mật", userId: "user-1" });
    expect(audits).toHaveLength(1);
    expect(audits[0].afterSummary).not.toContain("bí mật");
    expect(audits[0]).toMatchObject({ actorUserId: "user-1", operation: "create" });
  });

  test("rejects stale, invalid, and cross-project aggregate writes without partial state", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Hà Giang" }).returning({ id: tripProjects.id });
    const [other] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Sa Pa" }).returning({ id: tripProjects.id });
    const [otherItem] = await testDb.insert(tripPlanItems).values({ tripProjectId: other.id, userId: "user-1", kind: "leg", type: "transport", state: "idea", label: "Khác", ordinal: 0 }).returning({ id: tripPlanItems.id });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { createInternalTripPlanItem } = await import("@/features/chat-trips/trip-projects");

    await expect(createInternalTripPlanItem(project.id, 2, { kind: "anchor", anchorRole: "origin", state: "idea", label: "Hà Nội", ordinal: 0 })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(createInternalTripPlanItem(project.id, 1, { kind: "activity", type: "visit", state: "idea", label: "Sai cha", ordinal: 0, parentItemId: otherItem.id })).resolves.toEqual({ success: false, reason: "invalid" });
    await expect(testDb.select().from(tripPlanItems).where(eq(tripPlanItems.tripProjectId, project.id))).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "trip_plan_item"))).resolves.toHaveLength(0);
  });

  test("persists one versioned allowlisted constraints record and cascades structured state on project deletion", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt" }).returning({ id: tripProjects.id });
    await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "anchor", anchorRole: "origin", state: "confirmed", label: "Hà Nội", ordinal: 0 });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { deleteOwnedTripProject, upsertInternalTripProjectConstraints } = await import("@/features/chat-trips/trip-projects");

    await expect(upsertInternalTripProjectConstraints(project.id, 1, null, { adultCount: 2, childCount: 1, vehicleType: "ev", evChargingNeed: "required", budgetCurrency: "VND", budgetMinVnd: 1_000_000, budgetMaxVnd: 2_000_000, preferenceTags: ["nature"] })).resolves.toMatchObject({ success: true, aggregateVersion: 2 });
    await expect(upsertInternalTripProjectConstraints(project.id, 2, 1, { adultCount: 2, unknown: "sensitive" } as never)).resolves.toEqual({ success: false, reason: "invalid" });
    const [constraints] = await testDb.select().from(tripProjectConstraints);
    expect(constraints).toMatchObject({ version: 1, adultCount: 2, evChargingNeed: "required" });
    await expect(deleteOwnedTripProject(project.id)).resolves.toEqual({ success: true });
    await expect(testDb.select().from(tripPlanItems)).resolves.toHaveLength(0);
    await expect(testDb.select().from(tripProjectConstraints)).resolves.toHaveLength(0);
  });

  test("rejects malformed or sensitive constraints before creating rows, audits, or partial updates", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Quy Nhơn" }).returning({ id: tripProjects.id });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { upsertInternalTripProjectConstraints } = await import("@/features/chat-trips/trip-projects");

    await expect(upsertInternalTripProjectConstraints(project.id, 1, null, { adultCount: 2, children: false } as never)).resolves.toEqual({ success: false, reason: "invalid" });
    await expect(upsertInternalTripProjectConstraints(project.id, 1, null, { adultCount: 2, children: [{ ageMin: 4, ageMax: 6, comfortTags: [], preferenceTags: [], fullName: "Sensitive child" }] } as never)).resolves.toEqual({ success: false, reason: "invalid" });
    await expect(testDb.select().from(tripProjectConstraints)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "trip_project_constraints"))).resolves.toHaveLength(0);

    await expect(upsertInternalTripProjectConstraints(project.id, 1, null, { adultCount: 2, preferenceTags: ["nature"] })).resolves.toMatchObject({ success: true, aggregateVersion: 2 });
    const [before] = await testDb.select().from(tripProjectConstraints);
    const [beforeProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));
    const auditsBefore = await testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "trip_project_constraints"));

    await expect(upsertInternalTripProjectConstraints(project.id, 2, 1, { adultCount: 3, vehicleType: "truck" } as never)).resolves.toEqual({ success: false, reason: "invalid" });
    const [after] = await testDb.select().from(tripProjectConstraints);
    const [afterProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));
    const auditsAfter = await testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "trip_project_constraints"));

    expect(after).toMatchObject({ tripProjectId: before.tripProjectId, userId: before.userId, version: 1, adultCount: 2, preferenceTags: ["nature"] });
    expect(afterProject.aggregateVersion).toBe(beforeProject.aggregateVersion);
    expect(auditsAfter).toHaveLength(auditsBefore.length);
  });

  test("enforces aggregate database checks, owner FKs, and null-inclusive ordinal uniqueness", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "anchor", type: "transport", state: "idea", label: "Sai", ordinal: 0 })).rejects.toThrow();
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "idea", label: "\n", ordinal: 0 })).rejects.toThrow();
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-2", kind: "leg", type: "visit", state: "idea", label: "Không thuộc chủ", ordinal: 0 })).rejects.toThrow();
    const [leg] = await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "transport", state: "confirmed", label: "Đi Huế", ordinal: 0, transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" }).returning({ id: tripPlanItems.id });
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "idea", label: "Trùng gốc", ordinal: 0 })).rejects.toThrow();
    await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "activity", type: "visit", state: "idea", label: "Đại Nội", parentItemId: leg.id, ordinal: 0 });
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "activity", type: "food", state: "idea", label: "Trùng con", parentItemId: leg.id, ordinal: 0 })).rejects.toThrow();
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "idea", label: "Sai vị trí", ordinal: 1, accommodationPlaceAreaLabel: "Huế" })).rejects.toThrow();
    await expect(testDb.insert(tripProjectConstraints).values({ tripProjectId: project.id, userId: "user-1", adultCount: 1, vehicleType: "car", evChargingNeed: "required" })).rejects.toThrow();
    await expect(testDb.insert(tripProjectConstraints).values({ tripProjectId: project.id, userId: "user-1", adultCount: 1, budgetCurrency: "VND", budgetMinVnd: 2, budgetMaxVnd: 1 })).rejects.toThrow();
  });

  test("defers plan-item self references to commit while retaining foreign-key integrity", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Phú Yên" }).returning({ id: tripProjects.id });
    const constraints = await testDb.execute(sql`
      select conname, condeferrable, condeferred
      from pg_constraint
      where conname in (
        'trip_plan_items_parent_item_id_trip_plan_items_id_fk',
        'trip_plan_items_backup_target_item_id_trip_plan_items_id_fk'
      )
      order by conname
    `);

    expect(constraints).toEqual([
      { conname: "trip_plan_items_backup_target_item_id_trip_plan_items_id_fk", condeferrable: true, condeferred: true },
      { conname: "trip_plan_items_parent_item_id_trip_plan_items_id_fk", condeferrable: true, condeferred: true },
    ]);

    await testDb.transaction(async (transaction) => {
      await transaction.insert(tripPlanItems).values({ id: "deferred-activity", tripProjectId: project.id, userId: "user-1", kind: "activity", type: "visit", state: "idea", label: "Gành Đá Đĩa", parentItemId: "deferred-leg", ordinal: 0 });
      await transaction.insert(tripPlanItems).values({ id: "deferred-backup", tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "backup", label: "Phương án dự phòng", backupTargetItemId: "deferred-leg", ordinal: 0 });
      await transaction.insert(tripPlanItems).values({ id: "deferred-leg", tripProjectId: project.id, userId: "user-1", kind: "leg", type: "transport", state: "planned", label: "Tuyến chính", ordinal: 1 });
    });

    await expect(testDb.transaction(async (transaction) => {
      await transaction.insert(tripPlanItems).values({ id: "unresolved-activity", tripProjectId: project.id, userId: "user-1", kind: "activity", type: "visit", state: "idea", label: "Không hợp lệ", parentItemId: "missing-leg", ordinal: 1 });
    })).rejects.toThrow();
    await expect(testDb.select().from(tripPlanItems).where(eq(tripPlanItems.id, "unresolved-activity"))).resolves.toHaveLength(0);
  });

  test("updates, reorders, and deletes plan items with row and aggregate version fences", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Ninh Bình" }).returning({ id: tripProjects.id });
    const [first] = await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "transport", state: "idea", label: "Xe", ordinal: 0 }).returning();
    const [second] = await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "idea", label: "Thăm", ordinal: 1 }).returning();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { deleteInternalTripPlanItem, reorderInternalTripPlanItem, updateInternalTripPlanItem } = await import("@/features/chat-trips/trip-projects");

    await expect(updateInternalTripPlanItem(project.id, 1, first.id, 1, { kind: "leg", type: "transport", state: "confirmed", label: "  Xe mới  ", ordinal: 0, transportOriginLabel: "Hà Nội", transportDestinationLabel: "Ninh Bình" })).resolves.toMatchObject({ success: true, aggregateVersion: 2 });
    await expect(updateInternalTripPlanItem(project.id, 2, first.id, 1, { kind: "leg", type: "transport", state: "idea", label: "Stale", ordinal: 0 })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(reorderInternalTripPlanItem(project.id, 2, { itemId: second.id, expectedItemVersion: 1, ordinal: 0, expectedChangedItemVersions: { [first.id]: 2, [second.id]: 1 } })).resolves.toMatchObject({ success: true, aggregateVersion: 3 });
    const rows = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.tripProjectId, project.id));
    const savedFirst = rows.find((row) => row.id === first.id)!;
    const savedSecond = rows.find((row) => row.id === second.id)!;
    expect([savedFirst.ordinal, savedSecond.ordinal].sort()).toEqual([0, 1]);
    expect(savedFirst.version).toBe(3);
    expect(savedSecond.version).toBe(2);
    await expect(deleteInternalTripPlanItem(project.id, 3, second.id, 1)).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(deleteInternalTripPlanItem(project.id, 3, second.id, 2)).resolves.toMatchObject({ success: true, aggregateVersion: 4 });
    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));
    const mutationAudits = await testDb.select().from(auditEvents);
    expect(savedProject.aggregateVersion).toBe(4);
    expect(mutationAudits).toHaveLength(3);
    expect(mutationAudits.every((audit) => !audit.afterSummary?.includes("Xe mới"))).toBe(true);
  });

  test("getOwnedTripProjectSummary returns the workspace read model with plan items, constraints, and Trip Home focus for the owner", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế", origin: "Hà Nội", destination: "Huế", startDate: "2026-08-01", endDate: "2026-08-05", travelers: "2 người lớn" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id });
    await testDb.insert(tripPlanItems).values([
      { tripProjectId: project.id, userId: "user-1", kind: "anchor", anchorRole: "origin", state: "idea", label: "Hà Nội", ordinal: 0 },
      { tripProjectId: project.id, userId: "user-1", kind: "leg", type: "transport", state: "confirmed", label: "Chạy xe Hà Nội - Huế", ordinal: 1, plannedAt: new Date("2026-08-01T06:00:00.000Z"), transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" },
      { tripProjectId: project.id, userId: "user-1", kind: "leg", type: "accommodation", state: "confirmed", label: "Khách sạn Huế", ordinal: 2, accommodationPlaceAreaLabel: null },
    ]);
    await testDb.insert(tripProjectConstraints).values({
      tripProjectId: project.id,
      userId: "user-1",
      adultCount: 2,
      childCount: 1,
      vehicleType: "car",
      drivingToleranceHours: 4,
      budgetCurrency: "VND",
      budgetMinVnd: 5_000_000,
      budgetMaxVnd: 10_000_000,
      preferenceTags: ["nature", "culture"],
    });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);
    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));
    const savedPlanItems = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.tripProjectId, project.id));
    const [savedConstraints] = await testDb.select().from(tripProjectConstraints).where(eq(tripProjectConstraints.tripProjectId, project.id));

    expect(summary?.planItems).toHaveLength(3);
    expect(summary?.planItems.map((item) => item.label)).toEqual(["Hà Nội", "Chạy xe Hà Nội - Huế", "Khách sạn Huế"]);
    expect(summary?.constraints).toMatchObject({ adultCount: 2, childCount: 1, vehicleType: "car", drivingToleranceHours: 4, budgetCurrency: "VND", budgetMinVnd: 5_000_000, budgetMaxVnd: 10_000_000, preferenceTags: ["Thiên nhiên", "Văn hoá"] });
    expect(summary?.tripHome.kind).toBe("confirmed-item-gap");
    // Read-only: aggregate version, item versions, and constraints version must not change.
    expect(savedProject.aggregateVersion).toBe(1);
    expect(savedPlanItems.every((item) => item.version === 1)).toBe(true);
    expect(savedConstraints.version).toBe(1);
  });

  test("getOwnedTripProjectSummary returns preparation focus when no plan items exist", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);

    expect(summary?.planItems).toEqual([]);
    expect(summary?.constraints).toBeNull();
    expect(summary?.tripHome.kind).toBe("preparation");
  });

  test("getOwnedTripProjectSummary returns preparation focus when only idea items exist", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id });
    await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "idea", label: "Đại Nội", ordinal: 0 });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);

    expect(summary?.tripHome.kind).toBe("preparation");
  });

  test("getOwnedTripProjectSummary returns null for a cross-owner project without leaking workspace data", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Dự án riêng user-2" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-2", tripProjectId: project.id });
    await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-2", kind: "leg", type: "transport", state: "confirmed", label: "Chạy xe riêng", ordinal: 0, transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);

    expect(summary).toBeNull();
  });

  test("getOwnedTripProjectSummary does not write any audit event or advance any version when reading the workspace", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const auditsBefore = await testDb.select().from(auditEvents);
    await getOwnedTripProjectSummary(project.id);
    await getOwnedTripProjectSummary(project.id);
    const auditsAfter = await testDb.select().from(auditEvents);
    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));

    expect(auditsAfter).toHaveLength(auditsBefore.length);
    expect(savedProject.aggregateVersion).toBe(1);
  });
});
