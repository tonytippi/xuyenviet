import { beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { aiUsageEvents, auditEvents, chatContext, conversations, messageImageAttachments, messages, tripProjects, users } from "@/db/schema";

import { testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

describe("AI Ask owned conversation listing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("returns null when unauthenticated", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
    }));
    const { listOwnedConversations } = await import("@/features/chat-trips/conversations");

    await expect(listOwnedConversations()).resolves.toBeNull();
  });

  test("returns only the caller's conversations ordered by updatedAt desc and excludes other users", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [convA] = await testDb.insert(conversations).values({ userId: "user-1", updatedAt: new Date("2026-07-01T00:00:00.000Z") }).returning({ id: conversations.id });
    const [convB] = await testDb.insert(conversations).values({ userId: "user-1", updatedAt: new Date("2026-07-06T00:00:00.000Z") }).returning({ id: conversations.id });
    const [convC] = await testDb.insert(conversations).values({ userId: "user-1", updatedAt: new Date("2026-07-03T00:00:00.000Z") }).returning({ id: conversations.id });
    const [otherUserConv] = await testDb.insert(conversations).values({ userId: "user-2", updatedAt: new Date("2026-07-07T00:00:00.000Z") }).returning({ id: conversations.id });

    await testDb.insert(messages).values([
      { conversationId: convA.id, userId: "user-1", role: "user", content: "Câu hỏi đầu tiên của convA" },
      { conversationId: convB.id, userId: "user-1", role: "user", content: "Câu hỏi đầu tiên của convB" },
      { conversationId: convC.id, userId: "user-1", role: "user", content: "Câu hỏi đầu tiên của convC" },
      { conversationId: otherUserConv.id, userId: "user-2", role: "user", content: "Tin nhắn riêng của user-2" },
    ]);

    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { listOwnedConversations } = await import("@/features/chat-trips/conversations");

    const result = await listOwnedConversations();
    const summaries = result ?? [];

    expect(result).not.toBeNull();
    expect(summaries.map((row) => row.id)).toEqual([convB.id, convC.id, convA.id]);
    expect(summaries.map((row) => row.id)).not.toContain(otherUserConv.id);
    expect(summaries).toHaveLength(3);
    expect(summaries[0].updatedAt).toBeInstanceOf(Date);
  });

  test("uses the first user message as preview and a localized placeholder when no user message exists", async () => {
    await createTestUser("user-1");
    const [convWithMessage] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const [convWithoutUserMessage] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });

    await testDb.insert(messages).values([
      { conversationId: convWithMessage.id, userId: "user-1", role: "user", content: "Kế hoạch đi Hà Giang 3 ngày" },
      { conversationId: convWithMessage.id, userId: "user-1", role: "assistant", content: "Kế hoạch gợi ý:\nNên đi nhẹ." },
      { conversationId: convWithoutUserMessage.id, userId: "user-1", role: "assistant", content: "Chào bạn, mình có thể giúp gì?" },
    ]);

    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { listOwnedConversations } = await import("@/features/chat-trips/conversations");

    const result = await listOwnedConversations();
    const previewById = new Map((result ?? []).map((row) => [row.id, row.preview]));

    expect(previewById.get(convWithMessage.id)).toBe("Kế hoạch đi Hà Giang 3 ngày");
    expect(previewById.get(convWithoutUserMessage.id)).toBe("Hội thoại mới");
  });

  test("truncates long first user message previews", async () => {
    await createTestUser("user-1");
    const longQuestion = "Đi".repeat(100);
    const [conv] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    await testDb.insert(messages).values({ conversationId: conv.id, userId: "user-1", role: "user", content: longQuestion });

    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { listOwnedConversations } = await import("@/features/chat-trips/conversations");

    const result = await listOwnedConversations();
    const summaries = result ?? [];

    expect(summaries).toHaveLength(1);
    expect(summaries[0].preview.endsWith("…")).toBe(true);
    expect(summaries[0].preview.length).toBeLessThanOrEqual(61);
  });
});

describe("AI Ask owned conversation deletion", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("returns an unauthenticated failure without deleting data", async () => {
    await createTestUser("user-1");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
    }));
    const { deleteOwnedConversation } = await import("@/features/chat-trips/conversations");

    await expect(deleteOwnedConversation(conversation.id)).resolves.toEqual({ success: false, reason: "unauthenticated" });
    await expect(testDb.select().from(conversations)).resolves.toHaveLength(1);
  });

  test("does not delete or reveal another user's conversation", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-2" }).returning({ id: conversations.id });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { deleteOwnedConversation } = await import("@/features/chat-trips/conversations");

    await expect(deleteOwnedConversation(conversation.id)).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(testDb.select().from(conversations)).resolves.toHaveLength(1);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("deletes an owned ordinary chat, cascades content rows, preserves usage metadata with nulled references, and records audit counts", async () => {
    await createTestUser("user-1");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const [userMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Hà Nội đi Huế?" }).returning({ id: messages.id });
    const [assistantMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "assistant", content: "Nên chia chặng." }).returning({ id: messages.id });
    await testDb.insert(messageImageAttachments).values({ conversationId: conversation.id, messageId: userMessage.id, userId: "user-1", originalFileName: "road.png", mimeType: "image/png", byteSize: 16 });
    await testDb.insert(chatContext).values({ conversationId: conversation.id, sourceMessageId: userMessage.id, userId: "user-1", field: "destination", scope: "conversation", value: "Huế", confidence: 90 });
    await testDb.insert(aiUsageEvents).values({ userId: "user-1", conversationId: conversation.id, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id, purpose: "ai_ask_initial_answer", provider: "ai_gateway", model: "test-model", promptVersion: "test-v1", status: "success" });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { deleteOwnedConversation } = await import("@/features/chat-trips/conversations");

    await expect(deleteOwnedConversation(conversation.id)).resolves.toEqual({ success: true });

    await expect(testDb.select().from(conversations)).resolves.toHaveLength(0);
    await expect(testDb.select().from(messages)).resolves.toHaveLength(0);
    await expect(testDb.select().from(messageImageAttachments)).resolves.toHaveLength(0);
    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
    const usageRows = await testDb.select().from(aiUsageEvents);
    const auditRows = await testDb.select().from(auditEvents);

    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]).toMatchObject({ userId: "user-1", conversationId: null, userMessageId: null, assistantMessageId: null, status: "success" });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ actorUserId: "user-1", operation: "delete", targetType: "conversation", targetId: conversation.id });
    expect(auditRows[0].beforeSummary).toContain('"messageCount":2');
    expect(auditRows[0].beforeSummary).toContain('"imageAttachmentCount":1');
    expect(auditRows[0].beforeSummary).toContain('"chatContextCount":1');
    expect(auditRows[0].beforeSummary).toContain('"aiUsageEventCount":1');
  });

  test("counts usage events by deleted conversation even if usage ownership metadata is inconsistent", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    await testDb.insert(aiUsageEvents).values({ userId: "user-2", conversationId: conversation.id, purpose: "ai_ask_initial_answer", provider: "ai_gateway", model: "test-model", promptVersion: "test-v1", status: "success" });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { deleteOwnedConversation } = await import("@/features/chat-trips/conversations");

    await expect(deleteOwnedConversation(conversation.id)).resolves.toEqual({ success: true });

    const [auditRow] = await testDb.select().from(auditEvents);

    expect(auditRow.beforeSummary).toContain('"aiUsageEventCount":1');
  });

  test("deletes an owned project chat and removes project-scoped context without deleting the project", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    const [message] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Lịch trình Huế" }).returning({ id: messages.id });
    await testDb.insert(chatContext).values({ conversationId: conversation.id, tripProjectId: project.id, sourceMessageId: message.id, userId: "user-1", field: "destination", scope: "trip_project", value: "Huế" });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { deleteOwnedConversation } = await import("@/features/chat-trips/conversations");

    await expect(deleteOwnedConversation(conversation.id)).resolves.toEqual({ success: true });

    await expect(testDb.select().from(conversations)).resolves.toHaveLength(0);
    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
    await expect(testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id))).resolves.toHaveLength(1);
  });
});
