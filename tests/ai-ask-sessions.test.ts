import { beforeEach, describe, expect, test, vi } from "vitest";

import { conversations, messages, users } from "@/db/schema";

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
