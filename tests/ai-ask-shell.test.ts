import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiUsageEvents, conversations, messages, users } from "@/db/schema";

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

async function countUsageEvents() {
  return (await testDb.select().from(aiUsageEvents)).length;
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
    expect(html).toContain("Chưa có tin nhắn. Câu trả lời thật và nguồn tham chiếu sẽ xuất hiện ở các story sau");
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

describe("AI Ask structured answer rendering", () => {
  test("renders recognized assistant headings as scannable sections without source chips", async () => {
    const { AssistantMessageContent } = await import("@/features/ai/ai-ask-composer");
    const assistantContent = ["## Kế hoạch gợi ý:", "- Ngày 1: đi nhẹ và nghỉ sớm.", "", "**Nguồn và độ tin cậy:**", "Đây là gợi ý tổng quát, chưa dùng nguồn tuyển chọn.", "", "1. Câu hỏi tiếp theo:", "Bạn đi cùng trẻ nhỏ không?"].join("\n");
    const html = renderToStaticMarkup(
      AssistantMessageContent({
        content: assistantContent,
      }),
    );

    expect(html).toContain("## Kế hoạch gợi ý:");
    expect(html).toContain("**Nguồn và độ tin cậy:**");
    expect(html).toContain("1. Câu hỏi tiếp theo:");
    expect(html).toContain("Đây là gợi ý tổng quát, chưa dùng nguồn tuyển chọn.");
    expect(html).not.toContain("source-chip");
    expect(html).not.toContain("[1]");
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
    expect(await countUsageEvents()).toBe(0);
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
    expect(await countUsageEvents()).toBe(0);
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
    expect(await countUsageEvents()).toBe(0);
  });

  test("creates an owned conversation, first user message, assistant answer, and successful usage event", async () => {
    await createTestUser("user-1");
    const assistantContent = [
      "Kế hoạch gợi ý:",
      "Bạn có thể đi theo trục Hà Nội - Huế trong 5 ngày và nên chừa thời gian nghỉ giữa chặng.",
      "",
      "Nguồn và độ tin cậy:",
      "Đây là gợi ý tổng quát, chưa dùng nguồn tuyển chọn.",
      "",
      "Câu hỏi tiếp theo:",
      "Bạn muốn lái tối đa bao nhiêu giờ mỗi ngày?",
    ].join("\n");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "test-model",
          choices: [
            {
              message: {
                content: assistantContent,
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 80,
            total_tokens: 180,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    const result = await submitAiAsk({ question: "  Hà Nội đi Huế 5 ngày nên dừng ở đâu?  " });
    const savedConversations = await testDb.select().from(conversations).where(eq(conversations.userId, "user-1"));
    const savedMessages = await testDb.select().from(messages).where(eq(messages.conversationId, result.conversationId));
    const savedUsageEvents = await testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.conversationId, result.conversationId));

    expect(result.status).toBe("answer-created");
    if (result.status !== "answer-created") {
      throw new Error("Expected answer-created result");
    }
    expect(result.conversationId).toBeTruthy();
    expect(result.userMessage.id).toBeTruthy();
    expect(result.assistantMessage.id).toBeTruthy();
    expect(result.assistantMessage.content).toBe(assistantContent);
    expect(savedConversations).toHaveLength(1);
    expect(savedConversations[0].id).toBe(result.conversationId);
    expect(savedConversations[0].createdAt).toBeInstanceOf(Date);
    expect(savedMessages).toHaveLength(2);
    expect(savedMessages[0]).toMatchObject({
      id: result.userMessage.id,
      userId: "user-1",
      role: "user",
      content: "Hà Nội đi Huế 5 ngày nên dừng ở đâu?",
    });
    expect(savedMessages[0].createdAt).toBeInstanceOf(Date);
    expect(savedMessages[1]).toMatchObject({
      id: result.assistantMessage.id,
      userId: "user-1",
      role: "assistant",
      content: assistantContent,
    });
    expect(savedUsageEvents).toHaveLength(1);
    expect(savedUsageEvents[0]).toMatchObject({
      userId: "user-1",
      conversationId: result.conversationId,
      userMessageId: result.userMessage.id,
      assistantMessageId: result.assistantMessage.id,
      purpose: "ai_ask_initial_answer",
      provider: "ai_gateway",
      model: "test-model",
      promptVersion: "ai_ask_initial_v2",
      status: "success",
      errorCode: null,
      promptTokens: 100,
      completionTokens: 80,
      totalTokens: 180,
    });
    expect(savedUsageEvents[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://test-gateway.example/chat/completions");
    const requestJson = JSON.stringify(fetchMock.mock.calls[0][1]);
    expect(requestJson).toContain("Tiếng Việt");
    expect(requestJson).toContain("Kế hoạch gợi ý");
    expect(requestJson).toContain("Vì sao nên đi như vậy");
    expect(requestJson).toContain("Lưu ý thực tế");
    expect(requestJson).toContain("Cảnh báo cần kiểm tra");
    expect(requestJson).toContain("Nguồn và độ tin cậy");
    expect(requestJson).toContain("Bước tiếp theo");
    expect(requestJson).toContain("1-3 câu hỏi tiếp theo ngắn gọn");
    expect(requestJson).toContain("không tạo citation như [1]");
    expect(requestJson).toContain("tránh khẳng định XuyenViet có dữ liệu địa phương đã kiểm chứng");
  });

  test("keeps the user message, records failed usage, and creates no assistant message when provider fails", async () => {
    await createTestUser("user-1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    const result = await submitAiAsk({ question: "Hà Nội đi Đà Nẵng?" });
    const savedMessages = await testDb.select().from(messages).where(eq(messages.conversationId, result.conversationId));
    const savedUsageEvents = await testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.conversationId, result.conversationId));

    expect(result.status).toBe("answer-failed");
    if (result.status !== "answer-failed") {
      throw new Error("Expected answer-failed result");
    }
    expect(result.userMessage.content).toBe("Hà Nội đi Đà Nẵng?");
    expect(result.errorMessage).toBe("Mình chưa tạo được câu trả lời lúc này. Nội dung của bạn vẫn còn trong ô nhập để gửi lại.");
    expect(savedMessages).toHaveLength(1);
    expect(savedMessages[0]).toMatchObject({ role: "user", content: "Hà Nội đi Đà Nẵng?" });
    expect(savedUsageEvents).toHaveLength(1);
    expect(savedUsageEvents[0]).toMatchObject({
      userId: "user-1",
      conversationId: result.conversationId,
      userMessageId: result.userMessage.id,
      assistantMessageId: null,
      purpose: "ai_ask_initial_answer",
      provider: "ai_gateway",
      model: "xuyenviet-roadtrip-v1",
      promptVersion: "ai_ask_initial_v2",
      status: "failure",
      errorCode: "gateway_http_error",
    });
  });

  test("records invalid gateway responses without creating assistant messages", async () => {
    await createTestUser("user-1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    const result = await submitAiAsk({ question: "Đi Phú Yên 4 ngày?" });
    const savedMessages = await testDb.select().from(messages).where(eq(messages.conversationId, result.conversationId));
    const savedUsageEvents = await testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.conversationId, result.conversationId));

    expect(result.status).toBe("answer-failed");
    expect(savedMessages).toHaveLength(1);
    expect(savedUsageEvents).toHaveLength(1);
    expect(savedUsageEvents[0].errorCode).toBe("invalid_gateway_response");
  });

  test("sends bounded gateway requests", async () => {
    await createTestUser("user-1");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Nên chia lịch trình nhẹ và hỏi thêm thời gian xuất phát." } }],
          usage: { prompt_tokens: -1, completion_tokens: 10, total_tokens: 9 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    const result = await submitAiAsk({ question: "Đi Quy Nhơn 3 ngày?" });
    const savedUsageEvents = await testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.conversationId, result.conversationId));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { max_tokens?: number };

    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(body.max_tokens).toBe(900);
    expect(savedUsageEvents[0]).toMatchObject({ promptTokens: null, completionTokens: 10, totalTokens: 9 });
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
    expect(await countUsageEvents()).toBe(0);
  });

  test("returns owned conversations only", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const getAuthenticatedSession = vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "test-model",
            choices: [{ message: { content: "Nên chia chặng và giữ lịch trình nhẹ để lái xe an toàn." } }],
            usage: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const { submitAiAsk } = await import("@/features/ai/ask-gate");
    const { getOwnedConversation } = await import("@/features/chat-trips/conversations");
    const result = await submitAiAsk({ question: "Hà Nội đi Đà Nẵng?" });

    if (result.status !== "answer-created") {
      throw new Error("Expected answer-created result");
    }

    await expect(getOwnedConversation(result.conversationId)).resolves.toMatchObject({
      id: result.conversationId,
      userId: "user-1",
      messages: [
        { id: result.userMessage.id, role: "user", content: "Hà Nội đi Đà Nẵng?" },
        { id: result.assistantMessage.id, role: "assistant" },
      ],
    });
    getAuthenticatedSession.mockResolvedValue({ userId: "user-2", email: "user-2@example.com" });
    await expect(getOwnedConversation(result.conversationId)).resolves.toBeNull();
  });
});
