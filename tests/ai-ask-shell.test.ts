import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { conversations, messages, users } from "@/db/schema";

import { testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

async function countConversations() {
  return (await testDb.select().from(conversations)).length;
}

async function countMessages() {
  return (await testDb.select().from(messages)).length;
}

async function renderAuthenticatedAiAskShell() {
  vi.doMock("@/server/auth", () => ({
    getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
  }));
  vi.doMock("@/features/auth/actions", () => ({
    signOutCurrentUser: vi.fn(),
  }));

  const { default: AiAskPage } = await import("@/app/ai-ask/page");
  const element = await AiAskPage({ searchParams: Promise.resolve({}) });

  return renderToStaticMarkup(element);
}

describe("AI Ask authenticated shell", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("renders the visible Story 2.1 shell contract", async () => {
    const html = await renderAuthenticatedAiAskShell();

    expect(html).toContain("Hỏi trợ lý chuyến đi Việt Nam");
    expect(html).toContain("tony@example.com");
    expect(html).toContain("Đăng xuất");
    expect(html).toContain("Bạn đang muốn đi đâu?");
    expect(html).toContain("Hà Nội đi Đà Nẵng 7 ngày cùng gia đình");
    expect(html).toContain("Lưu trữ hội thoại");
    expect(html).toContain("Khu vực hội thoại");
    expect(html).toContain("Câu hỏi của bạn");
    expect(html).toContain("Gửi câu hỏi");
    expect(html).toContain('aria-describedby="ai-ask-status ai-ask-shortcuts"');
    expect(html).toContain('id="ai-ask-status"');
  });

  test("does not render fake citations, source chips, or assistant answers", async () => {
    const html = await renderAuthenticatedAiAskShell();

    expect(html).not.toContain("Nguồn:");
    expect(html).not.toContain("[1]");
    expect(html).not.toContain("source-chip");
    expect(html).not.toContain("assistant answer");
  });
});

describe("AI Ask action gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("rejects empty questions", async () => {
    await createTestUser("user-1");
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    await expect(submitAiAsk({ question: "   " })).rejects.toThrow("AI Ask question must be between 1 and 2000 characters.");
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
  });

  test("rejects malformed question payloads", async () => {
    await createTestUser("user-1");
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    await expect(submitAiAsk({} as { question: string })).rejects.toThrow("AI Ask question must be between 1 and 2000 characters.");
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
  });

  test("rejects over-2000-character questions", async () => {
    await createTestUser("user-1");
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    await expect(submitAiAsk({ question: "a".repeat(2_001) })).rejects.toThrow(
      "AI Ask question must be between 1 and 2000 characters.",
    );
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
  });

  test("creates an owned conversation and first user message for valid questions", async () => {
    await createTestUser("user-1");
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    const result = await submitAiAsk({ question: "  Hà Nội đi Huế 5 ngày nên dừng ở đâu?  " });
    const savedConversations = await testDb.select().from(conversations).where(eq(conversations.userId, "user-1"));
    const savedMessages = await testDb.select().from(messages).where(eq(messages.conversationId, result.conversationId));

    expect(result.status).toBe("conversation-created");
    expect(result.conversationId).toBeTruthy();
    expect(result.messageId).toBeTruthy();
    expect(savedConversations).toHaveLength(1);
    expect(savedConversations[0].id).toBe(result.conversationId);
    expect(savedConversations[0].createdAt).toBeInstanceOf(Date);
    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0]).toMatchObject({
      id: result.messageId,
      userId: "user-1",
      role: "user",
      content: "Hà Nội đi Huế 5 ngày nên dừng ở đâu?",
    });
    expect(savedMessages[0].createdAt).toBeInstanceOf(Date);
  });

  test("rejects unauthenticated submissions", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    await expect(submitAiAsk({ question: "Hà Nội đi Đà Nẵng?" })).rejects.toThrow(
      "Authentication required for this server mutation.",
    );
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
  });

  test("returns owned conversations only", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const getAuthenticatedSession = vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession,
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");
    const { getOwnedConversation } = await import("@/features/chat-trips/conversations");
    const result = await submitAiAsk({ question: "Hà Nội đi Đà Nẵng?" });

    await expect(getOwnedConversation(result.conversationId)).resolves.toMatchObject({
      id: result.conversationId,
      userId: "user-1",
      messages: [{ id: result.messageId, role: "user", content: "Hà Nội đi Đà Nẵng?" }],
    });
    getAuthenticatedSession.mockResolvedValue({ userId: "user-2", email: "user-2@example.com" });
    await expect(getOwnedConversation(result.conversationId)).resolves.toBeNull();
  });
});
