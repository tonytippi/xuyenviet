import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, conversations, messageImageAttachments, messages, users } from "@/db/schema";

import { testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

async function createDefaultAiAskModel(values: Partial<typeof aiGatewayModels.$inferInsert> = {}) {
  await testDb.insert(aiGatewayModels).values({
    id: values.id ?? `model-${crypto.randomUUID()}`,
    gatewayModelName: values.gatewayModelName ?? "cx/gpt-5.5-test",
    displayLabel: values.displayLabel ?? "Test AI Ask model",
    purpose: "ai_ask_initial_answer",
    active: values.active ?? true,
    defaultForPurpose: values.defaultForPurpose ?? true,
    supportsTextInput: values.supportsTextInput ?? true,
    supportsImageInput: values.supportsImageInput ?? false,
    supportsImageOutput: values.supportsImageOutput ?? false,
    supportsEmbeddings: values.supportsEmbeddings ?? false,
    supportsExtraction: values.supportsExtraction ?? false,
    supportsEvaluation: values.supportsEvaluation ?? false,
    supportsStreaming: values.supportsStreaming ?? false,
    supportsCachePricing: values.supportsCachePricing ?? false,
    pricingCurrency: values.pricingCurrency ?? "USD",
    inputTokenPriceMicros: values.inputTokenPriceMicros ?? 2_000_000,
    outputTokenPriceMicros: values.outputTokenPriceMicros ?? 4_000_000,
    cacheReadTokenPriceMicros: values.cacheReadTokenPriceMicros ?? null,
    cacheWriteTokenPriceMicros: values.cacheWriteTokenPriceMicros ?? null,
    pricingUnitTokens: values.pricingUnitTokens ?? 1_000_000,
    pricingVersion: values.pricingVersion ?? "test-pricing-v1",
    pricingEffectiveAt: values.pricingEffectiveAt ?? new Date("2026-07-07T00:00:00.000Z"),
  });
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

async function renderAuthenticatedAiAskShell(searchParams: Record<string, string> = {}) {
  vi.doMock("@/server/auth", () => ({
    getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
  }));
  vi.doMock("@/features/auth/actions", () => ({
    signOutCurrentUser: vi.fn(),
  }));

  const { default: AiAskPage } = await import("@/app/ai-ask/page");
  const element = await AiAskPage({ searchParams: Promise.resolve(searchParams) });

  return renderToStaticMarkup(element);
}

function getGatewayRequestMessages(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) {
  const request = fetchMock.mock.calls[callIndex][1] as RequestInit;
  const body = JSON.parse(String(request.body)) as { messages: { role: string; content: string }[] };

  return body.messages;
}

describe("AI Ask authenticated shell", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.AI_GATEWAY_TIMEOUT_MS;
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

  test("renders persisted owned conversation history in chronological order", async () => {
    await createTestUser("user-1");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    await testDb.insert(messages).values([
      { conversationId: conversation.id, userId: "user-1", role: "user", content: "Tôi đi Hà Nội đến Huế 5 ngày.", createdAt: new Date("2026-07-06T01:00:00.000Z") },
      { conversationId: conversation.id, userId: "user-1", role: "assistant", content: "Kế hoạch gợi ý:\nNên chia chặng nhẹ.", createdAt: new Date("2026-07-06T01:01:00.000Z") },
      { conversationId: conversation.id, userId: "user-1", role: "user", content: "Ngày thứ 3 nên nghỉ ở đâu?", createdAt: new Date("2026-07-06T01:02:00.000Z") },
    ]);

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id });
    const firstIndex = html.indexOf("Tôi đi Hà Nội đến Huế 5 ngày.");
    const secondIndex = html.indexOf("Nên chia chặng nhẹ.");
    const thirdIndex = html.indexOf("Ngày thứ 3 nên nghỉ ở đâu?");

    expect(html).toContain("Tin nhắn đã lưu được tải theo thứ tự thời gian");
    expect(html).toContain("Đã tải hội thoại. Bạn có thể tiếp tục kế hoạch.");
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(thirdIndex).toBeGreaterThan(secondIndex);
  });

  test("does not expose another user's conversation history on the AI Ask page", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-2" }).returning({ id: conversations.id });
    await testDb.insert(messages).values({
      conversationId: conversation.id,
      userId: "user-2",
      role: "user",
      content: "Tin nhắn riêng của user-2",
    });

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id });

    expect(html).not.toContain("Tin nhắn riêng của user-2");
    expect(html).toContain("Chưa có tin nhắn.");
  });
});

describe("AI Ask structured answer rendering", () => {
  test("composer source includes explicit pending and long-running progress contracts", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain("const progressDelayMs = 4_000");
    expect(source).toContain("Đang gửi câu hỏi và chuẩn bị luồng trả lời");
    expect(source).toContain("Trợ lý vẫn đang xử lý câu hỏi");
    expect(source).toContain("Quá trình đang lâu hơn bình thường một chút");
    expect(source).toContain("chưa tạo nội dung trợ lý tạm thời");
    expect(source).toContain("Vui lòng không gửi lặp lại trong lúc chờ");
    expect(source).toContain("Đang nhận từng phần");
    expect(source).toContain("aria-live=\"polite\"");
  });

  test("composer source accepts removable validated traveler images", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain("Ảnh tham khảo tuỳ chọn");
    expect(source).toContain("accept=\"image/jpeg,image/png,image/webp\"");
    expect(source).toContain("maxImageByteSize = 5 * 1024 * 1024");
    expect(source).toContain("Bỏ ảnh");
    expect(source).toContain("model đã bật khả năng nhận ảnh");
  });

  test("composer source keeps duplicate-send controls guarded while pending", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain("if (isSubmittingRef.current)");
    expect(source).toContain("disabled={isPending}");
    expect(source).toContain("Đang gửi, vui lòng chờ");
  });

  test("composer source presents provider failure without an assistant bubble", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain("getUnansweredUserMessageIds(initialMessages)");
    expect(source).toContain("setFailedQuestionIds((currentIds) => [...currentIds, failedUserMessage.id])");
    expect(source).toContain("Chưa có câu trả lời trợ lý nào được lưu cho lượt này");
    expect(source).toContain("Trợ lý chưa tạo được câu trả lời cho lượt này");
    expect(source).not.toContain("clientAssistant");
    expect(source).not.toContain("optimisticAssistant");
  });

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

  test("renders persisted failed user-only turns so refreshed history matches storage", async () => {
    const { AiAskComposer } = await import("@/features/ai/ai-ask-composer");
    const html = renderToStaticMarkup(
      createElement(AiAskComposer, {
        initialConversationId: "conversation-1",
        initialMessages: [
          { id: "user-1", role: "user", content: "Hà Nội đi Huế?" },
          { id: "assistant-1", role: "assistant", content: "Kế hoạch gợi ý:\nNên đi Huế trước." },
          { id: "user-2", role: "user", content: "Vậy ngày thứ 2 thì sao?" },
        ],
      }),
    );

    expect(html).toContain("Hà Nội đi Huế?");
    expect(html).toContain("Nên đi Huế trước.");
    expect(html).toContain("Vậy ngày thứ 2 thì sao?");
    expect(html).toContain("Trợ lý chưa tạo được câu trả lời cho lượt này");
    expect(html).not.toContain("clientAssistant");
  });
});

describe("AI Ask prompt construction", () => {
  test("bounds continuation history by recent messages and character budget", async () => {
    const { buildAiAskMessages } = await import("@/features/ai/prompts");
    const gatewayMessages = buildAiAskMessages({
      question: "Câu hỏi mới",
      history: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? "user" as const : "assistant" as const,
        content: `${index}: ${"x".repeat(2_000)}`,
      })),
    });

    expect(gatewayMessages.length).toBeLessThanOrEqual(12);
    expect(gatewayMessages.length).toBeGreaterThan(2);
    expect(gatewayMessages[1].content).not.toContain("0:");
    expect(gatewayMessages[1].content).not.toContain("1:");
    expect(gatewayMessages.slice(1, -1).reduce((total, message) => total + message.content.length, 0)).toBeLessThanOrEqual(12_000);
    expect(gatewayMessages.at(-1)).toMatchObject({ role: "user", content: "Câu hỏi mới" });
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
    await createDefaultAiAskModel({ id: "ai-ask-model-1", gatewayModelName: "cx/gpt-5.5-test" });
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
            prompt_tokens_details: {
              cached_tokens: 25,
              cache_creation_tokens: 10,
            },
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
      aiGatewayModelId: "ai-ask-model-1",
      promptVersion: "ai_ask_initial_v3",
      status: "success",
      errorCode: null,
      promptTokens: 100,
      completionTokens: 80,
      totalTokens: 180,
      cachedPromptTokens: 25,
      cacheWritePromptTokens: 10,
      estimatedInputCostMicros: 150,
      estimatedOutputCostMicros: 320,
      estimatedTotalCostMicros: null,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 2_000_000,
      outputTokenPriceMicros: 4_000_000,
      cacheReadTokenPriceMicros: null,
      cacheWriteTokenPriceMicros: null,
      pricingUnitTokens: 1_000_000,
      pricingVersion: "test-pricing-v1",
      pricingEffectiveAt: new Date("2026-07-07T00:00:00.000Z"),
    });
    expect(savedUsageEvents[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://test-gateway.example/chat/completions");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ model: "cx/gpt-5.5-test" });
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
    expect(getGatewayRequestMessages(fetchMock)).toMatchObject([
      { role: "system" },
      { role: "user", content: "Hà Nội đi Huế 5 ngày nên dừng ở đâu?" },
    ]);
  });

  test("continues an owned conversation with prior messages in the gateway prompt", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "test-model",
            choices: [{ message: { content: "Kế hoạch gợi ý:\nNên chia chặng Hà Nội - Đồng Hới - Huế." } }],
            usage: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "test-model",
            choices: [{ message: { content: "Bước tiếp theo:\nNgày thứ 3 nên nghỉ ở Huế để lịch lái nhẹ hơn." } }],
            usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    const firstResult = await submitAiAsk({ question: "Hà Nội đi Huế 5 ngày?" });
    if (firstResult.status !== "answer-created") {
      throw new Error("Expected first answer-created result");
    }
    const secondResult = await submitAiAsk({ question: "Ngày thứ 3 nên nghỉ ở đâu?", conversationId: firstResult.conversationId });
    const savedConversations = await testDb.select().from(conversations).where(eq(conversations.userId, "user-1"));
    const savedMessages = await testDb
      .select()
      .from(messages)
      .where(eq(messages.conversationId, firstResult.conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    const savedUsageEvents = await testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.conversationId, firstResult.conversationId));

    expect(secondResult.status).toBe("answer-created");
    expect(secondResult.conversationId).toBe(firstResult.conversationId);
    expect(savedConversations).toHaveLength(1);
    expect(savedMessages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: "user", content: "Hà Nội đi Huế 5 ngày?" },
      { role: "assistant", content: "Kế hoạch gợi ý:\nNên chia chặng Hà Nội - Đồng Hới - Huế." },
      { role: "user", content: "Ngày thứ 3 nên nghỉ ở đâu?" },
      { role: "assistant", content: "Bước tiếp theo:\nNgày thứ 3 nên nghỉ ở Huế để lịch lái nhẹ hơn." },
    ]);
    expect(savedUsageEvents).toHaveLength(2);
    expect(getGatewayRequestMessages(fetchMock, 1)).toMatchObject([
      { role: "system" },
      { role: "user", content: "Hà Nội đi Huế 5 ngày?" },
      { role: "assistant", content: "Kế hoạch gợi ý:\nNên chia chặng Hà Nội - Đồng Hới - Huế." },
      { role: "user", content: "Ngày thứ 3 nên nghỉ ở đâu?" },
    ]);
  });

  test("rejects cross-user conversation continuation without side effects", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-2" }).returning({ id: conversations.id });
    await testDb.insert(messages).values({
      conversationId: conversation.id,
      userId: "user-2",
      role: "user",
      content: "Tin nhắn riêng của user-2",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    await expect(submitAiAsk({ question: "Cho tôi hỏi tiếp", conversationId: conversation.id })).rejects.toThrow(
      "Conversation not found or access denied.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(1);
    expect(await countMessages()).toBe(1);
    expect(await countUsageEvents()).toBe(0);
  });

  test("keeps follow-up user message, records failed usage, and creates no assistant message when continuation provider fails", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Kế hoạch gợi ý:\nNên đi Huế trước." } }],
            usage: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    const firstResult = await submitAiAsk({ question: "Hà Nội đi Huế?" });
    if (firstResult.status !== "answer-created") {
      throw new Error("Expected first answer-created result");
    }
    const failedResult = await submitAiAsk({ question: "Vậy ngày thứ 2 thì sao?", conversationId: firstResult.conversationId });
    const savedMessages = await testDb
      .select()
      .from(messages)
      .where(eq(messages.conversationId, firstResult.conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    const savedUsageEvents = await testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.conversationId, firstResult.conversationId));

    expect(failedResult.status).toBe("answer-failed");
    expect(failedResult.conversationId).toBe(firstResult.conversationId);
    expect(savedMessages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: "user", content: "Hà Nội đi Huế?" },
      { role: "assistant", content: "Kế hoạch gợi ý:\nNên đi Huế trước." },
      { role: "user", content: "Vậy ngày thứ 2 thì sao?" },
    ]);
    expect(savedUsageEvents).toHaveLength(2);
    expect(savedUsageEvents[1]).toMatchObject({
      conversationId: firstResult.conversationId,
      userMessageId: failedResult.userMessage.id,
      assistantMessageId: null,
      status: "failure",
      errorCode: "gateway_http_error",
    });
  });

  test("keeps the user message, records failed usage, and creates no assistant message when provider fails", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ id: "ai-ask-failure-model", gatewayModelName: "cx/gpt-5.5-failure" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

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
    expect("assistantMessage" in result).toBe(false);
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
      model: "cx/gpt-5.5-failure",
      aiGatewayModelId: "ai-ask-failure-model",
      promptVersion: "ai_ask_initial_v3",
      status: "failure",
      errorCode: "gateway_http_error",
    });
    expect(warnSpy).toHaveBeenCalledWith("AI Gateway answer generation failed", expect.objectContaining({
      errorCode: "gateway_http_error",
      model: "cx/gpt-5.5-failure",
      status: 500,
      timeoutMs: 30_000,
    }));
  });

  test("uses configured AI Gateway timeout for slow model debugging", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel();
    process.env.AI_GATEWAY_TIMEOUT_MS = "45000";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    const result = await submitAiAsk({ question: "Hà Nội đi Đà Nẵng?" });

    delete process.env.AI_GATEWAY_TIMEOUT_MS;
    expect(result.status).toBe("answer-failed");
    expect(warnSpy).toHaveBeenCalledWith("AI Gateway answer generation failed", expect.objectContaining({
      errorCode: "gateway_http_error",
      timeoutMs: 45_000,
    }));
  });

  test("records invalid gateway responses without creating assistant messages", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

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
    expect(warnSpy).toHaveBeenCalledWith("AI Gateway answer generation failed", expect.objectContaining({
      errorCode: "invalid_gateway_response",
      reason: "json_parse_failed",
    }));
  });

  test("logs network and environment gateway failures without request bodies or secrets", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:443")));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    const result = await submitAiAsk({ question: "Đi Phú Yên 4 ngày?" });
    const loggedDetails = warnSpy.mock.calls[0][1] as Record<string, unknown>;

    expect(result.status).toBe("answer-failed");
    expect(warnSpy).toHaveBeenCalledWith("AI Gateway answer generation failed", expect.objectContaining({
      errorCode: "gateway_network_error",
      reason: "Error",
    }));
    expect(JSON.stringify(loggedDetails)).not.toContain("test-ai-gateway-key");
    expect(JSON.stringify(loggedDetails)).not.toContain("messages");
    expect(JSON.stringify(loggedDetails)).not.toContain("Đi Phú Yên");
  });

  test("sends bounded gateway requests", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Nên chia lịch trình nhẹ và hỏi thêm thời gian xuất phát." } }],
          usage: { prompt_tokens: 3_000_000_000, completion_tokens: 10, total_tokens: 9 },
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
    await createDefaultAiAskModel();
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

  test("loads owned image attachment metadata with conversation history", async () => {
    await createTestUser("user-1");
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const [message] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Xem ảnh này" }).returning({ id: messages.id });
    await testDb.insert(messageImageAttachments).values({
      conversationId: conversation.id,
      messageId: message.id,
      userId: "user-1",
      originalFileName: "road.png",
      mimeType: "image/png",
      byteSize: 16,
    });
    const { getOwnedConversation } = await import("@/features/chat-trips/conversations");

    await expect(getOwnedConversation(conversation.id)).resolves.toMatchObject({
      id: conversation.id,
      messages: [
        {
          id: message.id,
          imageAttachments: [
            { originalFileName: "road.png", mimeType: "image/png", byteSize: 16 },
          ],
        },
      ],
    });
  });

  test("records no-model failure without calling the gateway", async () => {
    await createTestUser("user-1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    const result = await submitAiAsk({ question: "Hà Nội đi Huế?" });
    const savedMessages = await testDb.select().from(messages).where(eq(messages.conversationId, result.conversationId));
    const savedUsageEvents = await testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.conversationId, result.conversationId));

    expect(result.status).toBe("answer-failed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(savedMessages).toHaveLength(1);
    expect(savedUsageEvents).toHaveLength(1);
    expect(savedUsageEvents[0]).toMatchObject({
      model: "unconfigured",
      aiGatewayModelId: null,
      status: "failure",
      errorCode: "no_active_ai_gateway_model",
      estimatedTotalCostMicros: null,
    });
  });

  test("streams text and image input through the route before persisting the final assistant message", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({
      id: "ai-ask-stream-model",
      gatewayModelName: "cx/gpt-5.5-stream",
      supportsStreaming: true,
      supportsImageInput: true,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"model":"stream-model","choices":[{"delta":{"content":"Kế hoạch "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"gợi ý"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":50,"completion_tokens":20,"total_tokens":70}}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Ảnh này có phù hợp cho chuyến Hà Giang không?");
    formData.set("image", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "ha-giang.png", { type: "image/png" }));
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const body = await response.text();
    const savedMessages = await testDb.select().from(messages).orderBy(asc(messages.createdAt), asc(messages.id));
    const savedAttachments = await testDb.select().from(messageImageAttachments);
    const savedUsageEvents = await testDb.select().from(aiUsageEvents);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { stream?: boolean; messages: Array<{ role: string; content: unknown }> };
    const finalUserContent = requestBody.messages.at(-1)?.content;

    expect(response.status).toBe(200);
    expect(body).toContain('{"type":"delta","content":"Kế hoạch "}');
    expect(body).toContain('{"type":"done"');
    expect(savedMessages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: "user", content: "Ảnh này có phù hợp cho chuyến Hà Giang không?" },
      { role: "assistant", content: "Kế hoạch gợi ý" },
    ]);
    expect(savedAttachments).toHaveLength(1);
    expect(savedAttachments[0]).toMatchObject({
      userId: "user-1",
      conversationId: savedMessages[0].conversationId,
      messageId: savedMessages[0].id,
      originalFileName: "ha-giang.png",
      mimeType: "image/png",
      byteSize: 11,
      storageKey: null,
    });
    expect(savedUsageEvents).toHaveLength(1);
    expect(savedUsageEvents[0]).toMatchObject({
      status: "success",
      model: "stream-model",
      aiGatewayModelId: "ai-ask-stream-model",
      promptTokens: 50,
      completionTokens: 20,
      totalTokens: 70,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBody.stream).toBe(true);
    expect(JSON.stringify(finalUserContent)).toContain("data:image/png;base64,iVBORw0KGgoBAgM=");
  });

  test("does not persist assistant messages for malformed or incomplete streams", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ id: "ai-ask-bad-stream-model", gatewayModelName: "cx/gpt-5.5-stream", supportsStreaming: true });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"choices":[{"delta":{"content":"Một phần"}}]}\n\n',
      "data: {bad-json}\n\n",
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Đi Hà Giang thế nào?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const body = await response.text();
    const savedMessages = await testDb.select().from(messages).orderBy(asc(messages.createdAt), asc(messages.id));
    const savedUsageEvents = await testDb.select().from(aiUsageEvents);

    expect(response.status).toBe(200);
    expect(body).toContain('{"type":"delta","content":"Một phần"}');
    expect(body).toContain('{"type":"error"');
    expect(savedMessages.map((message) => message.role)).toEqual(["user"]);
    expect(savedUsageEvents).toHaveLength(1);
    expect(savedUsageEvents[0]).toMatchObject({ status: "failure", errorCode: "gateway_stream_failed" });
    expect(warnSpy).toHaveBeenCalledWith("AI Gateway answer generation failed", expect.objectContaining({ reason: "stream_parse_failed" }));
  });

  test("does not persist assistant messages for truncated streams without done", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ gatewayModelName: "cx/gpt-5.5-stream", supportsStreaming: true });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"Một phần"}}]}\n\n', { status: 200, headers: { "content-type": "text/event-stream" } })));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Đi Hà Giang thế nào?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    await response.text();
    const savedMessages = await testDb.select().from(messages);
    const savedUsageEvents = await testDb.select().from(aiUsageEvents);

    expect(savedMessages.map((message) => message.role)).toEqual(["user"]);
    expect(savedUsageEvents[0]).toMatchObject({ status: "failure", errorCode: "invalid_gateway_response" });
  });

  test("rejects invalid stream image submissions before persistence or provider calls", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true, supportsImageInput: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Xem ảnh giúp tôi");
    formData.set("image", new File([new Uint8Array([1])], "note.txt", { type: "text/plain" }));
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });

  test("rejects zero-byte stream images before treating the request as text-only", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true, supportsImageInput: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Xem ảnh giúp tôi");
    formData.set("image", new File([], "empty.png", { type: "image/png" }));
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });

  test("rejects oversized stream submissions before parsing multipart body", async () => {
    await createTestUser("user-1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", {
      method: "POST",
      body: "oversized",
      headers: { "content-length": String(7 * 1024 * 1024) },
    }) as never);

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });

  test("rejects spoofed image MIME bytes before persistence or provider calls", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true, supportsImageInput: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Xem ảnh giúp tôi");
    formData.set("image", new File([new Uint8Array([1, 2, 3])], "fake.png", { type: "image/png" }));
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });

  test("rejects image streaming when the selected model lacks image capability before side effects", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true, supportsImageInput: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Ảnh này nên đi cung nào?");
    formData.set("image", new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])], "road.webp", { type: "image/webp" }));
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);

    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });
});
