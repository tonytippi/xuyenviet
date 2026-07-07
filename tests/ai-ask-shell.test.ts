import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, conversations, messageImageAttachments, messages, tripProjects, users } from "@/db/schema";

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

  test("renders only owned trip projects and selected project scope on the AI Ask page", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [ownProject] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Nẵng gia đình", origin: "Hà Nội", destination: "Đà Nẵng" }).returning({ id: tripProjects.id });
    await testDb.insert(tripProjects).values({ userId: "user-2", title: "Dự án riêng user-2" });

    const html = await renderAuthenticatedAiAskShell({ tripProjectId: ownProject.id });

    expect(html).toContain("Phạm vi lập kế hoạch");
    expect(html).toContain("Dự án: Đà Nẵng gia đình (Hà Nội → Đà Nẵng)");
    expect(html).toContain("Tạo dự án chuyến đi mới");
    expect(html).not.toContain("Dự án riêng user-2");
  });

  test("falls back to ordinary chat when opening another user's trip project", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Dự án riêng user-2" }).returning({ id: tripProjects.id });

    const html = await renderAuthenticatedAiAskShell({ tripProjectId: otherProject.id });

    expect(html).toContain("Trò chuyện thường");
    expect(html).not.toContain("Dự án riêng user-2");
  });

  test("infers project scope when opening a linked project conversation", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế", origin: "Hà Nội", destination: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Tin trong dự án Huế" });

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id });

    expect(html).toContain("Dự án: Huế (Hà Nội → Huế)");
    expect(html).toContain("Tin trong dự án Huế");
  });

  test("does not render a conversation under a mismatched selected project", async () => {
    await createTestUser("user-1");
    const [projectA] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [projectB] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: projectA.id }).returning({ id: conversations.id });
    await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Tin chỉ thuộc dự án Huế" });

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id, tripProjectId: projectB.id });

    expect(html).toContain("Dự án: Đà Lạt");
    expect(html).not.toContain("Tin chỉ thuộc dự án Huế");
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

describe("AI Ask conversation data layer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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

  test("returns null for conversations owned by another user", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-2" }).returning({ id: conversations.id });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { getOwnedConversation } = await import("@/features/chat-trips/conversations");

    await expect(getOwnedConversation(conversation.id)).resolves.toBeNull();
  });
});

describe("AI Ask streaming route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.AI_GATEWAY_TIMEOUT_MS;
    vi.doMock("next/server", () => ({
      after: (callback: () => Promise<void> | void) => {
        void Promise.resolve(callback()).catch(() => undefined);
      },
    }));
  });

  test("rejects empty stream questions before persistence or provider calls", async () => {
    await createTestUser("user-1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "   ");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });

  test("rejects over-2000-character stream questions before persistence or provider calls", async () => {
    await createTestUser("user-1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "a".repeat(2_001));
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });

  test("rejects unauthenticated stream submissions before side effects", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
    }));
    const formData = new FormData();
    formData.set("question", "Hà Nội đi Đà Nẵng?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });

  test("rejects text submissions when no streaming-capable model is configured before side effects", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Hà Nội đi Huế?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);

    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });

  test("records failed usage and creates no assistant message when the gateway returns HTTP 500", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ id: "ai-ask-500-model", gatewayModelName: "cx/gpt-5.5-500", supportsStreaming: true });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Hà Nội đi Đà Nẵng?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const body = await response.text();
    const savedMessages = await testDb.select().from(messages).orderBy(asc(messages.createdAt), asc(messages.id));
    const savedUsageEvents = await testDb.select().from(aiUsageEvents);

    expect(body).toContain('{"type":"error"');
    expect(savedMessages.map((message) => message.role)).toEqual(["user"]);
    expect(savedUsageEvents).toHaveLength(1);
    expect(savedUsageEvents[0]).toMatchObject({ status: "failure", errorCode: "gateway_http_error", model: "cx/gpt-5.5-500", aiGatewayModelId: "ai-ask-500-model" });
  });

  test("records failed usage and creates no assistant message when the gateway network call fails", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:443")));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Đi Phú Yên 4 ngày?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const body = await response.text();
    const savedMessages = await testDb.select().from(messages);
    const savedUsageEvents = await testDb.select().from(aiUsageEvents);

    expect(body).toContain('{"type":"error"');
    expect(savedMessages.map((message) => message.role)).toEqual(["user"]);
    expect(savedUsageEvents).toHaveLength(1);
    expect(savedUsageEvents[0]).toMatchObject({ status: "failure", errorCode: "gateway_network_error" });
  });

  test("returns 400 for malformed multipart bodies without side effects", async () => {
    await createTestUser("user-1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", {
      method: "POST",
      body: "not-a-valid-multipart-body",
      headers: { "content-type": "multipart/form-data; boundary=bad" },
    }) as never);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });

  test("continues an owned conversation with prior messages in the gateway prompt", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const seededHistoryTime = new Date("2026-07-01T00:00:00.000Z");
    await testDb.insert(messages).values([
      { conversationId: conversation.id, userId: "user-1", role: "user", content: "Hà Nội đi Huế 5 ngày?", createdAt: seededHistoryTime },
      { conversationId: conversation.id, userId: "user-1", role: "assistant", content: "Kế hoạch gợi ý:\nNên chia chặng.", createdAt: new Date(seededHistoryTime.getTime() + 60_000) },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"model":"stream-model","choices":[{"delta":{"content":"Bước tiếp theo:"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Ngày 3 nghỉ Huế."}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Ngày thứ 3 nên nghỉ ở đâu?");
    formData.set("conversationId", conversation.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    await response.text();
    const savedMessages = await testDb.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(asc(messages.createdAt), asc(messages.id));
    const gatewayMessages = getGatewayRequestMessages(fetchMock, 0);

    expect(response.status).toBe(200);
    expect(savedMessages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: "user", content: "Hà Nội đi Huế 5 ngày?" },
      { role: "assistant", content: "Kế hoạch gợi ý:\nNên chia chặng." },
      { role: "user", content: "Ngày thứ 3 nên nghỉ ở đâu?" },
      { role: "assistant", content: "Bước tiếp theo:Ngày 3 nghỉ Huế." },
    ]);
    expect(gatewayMessages).toMatchObject([
      { role: "system" },
      { role: "user", content: "Hà Nội đi Huế 5 ngày?" },
      { role: "assistant", content: "Kế hoạch gợi ý:\nNên chia chặng." },
      { role: "user", content: "Ngày thứ 3 nên nghỉ ở đâu?" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("rejects cross-user conversation continuation without side effects", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-2" }).returning({ id: conversations.id });
    await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-2", role: "user", content: "Tin nhắn riêng của user-2" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Cho tôi hỏi tiếp");
    formData.set("conversationId", conversation.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const body = await response.text();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).toContain('{"type":"error"');
    expect(await countMessages()).toBe(1);
    expect(await countUsageEvents()).toBe(0);
  });

  test("links a new conversation to the selected owned trip project", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế 5 ngày" }).returning({ id: tripProjects.id });
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"choices":[{"delta":{"content":"Nên chia chặng."}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Hà Nội đi Huế thế nào?");
    formData.set("tripProjectId", project.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    await response.text();
    const savedConversations = await testDb.select().from(conversations);

    expect(response.status).toBe(200);
    expect(savedConversations).toHaveLength(1);
    expect(savedConversations[0]).toMatchObject({ userId: "user-1", tripProjectId: project.id });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("rejects cross-user selected trip project before provider calls or messages", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Riêng tư" }).returning({ id: tripProjects.id });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Cho tôi lập kế hoạch");
    formData.set("tripProjectId", otherProject.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countConversations()).toBe(0);
    expect(await countMessages()).toBe(0);
    expect(await countUsageEvents()).toBe(0);
  });

  test("rejects conversation and selected project mismatch before provider calls or new messages", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const [projectA] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [projectB] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: projectA.id }).returning({ id: conversations.id });
    await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Tin cũ" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Hỏi tiếp");
    formData.set("conversationId", conversation.id);
    formData.set("tripProjectId", projectB.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('{"type":"error"');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countMessages()).toBe(1);
    expect(await countUsageEvents()).toBe(0);
  });

  test("rejects continuing a project-linked conversation without project scope", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Tin cũ" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Hỏi tiếp");
    formData.set("conversationId", conversation.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('{"type":"error"');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countMessages()).toBe(1);
    expect(await countUsageEvents()).toBe(0);
  });

  test("continues an existing project-scoped conversation when the matching trip project is selected", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế 5 ngày" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    const seededHistoryTime = new Date("2026-07-01T00:00:00.000Z");
    await testDb.insert(messages).values([
      { conversationId: conversation.id, userId: "user-1", role: "user", content: "Lịch trình Huế 5 ngày?", createdAt: seededHistoryTime },
      { conversationId: conversation.id, userId: "user-1", role: "assistant", content: "Nên chia chặng nhẹ.", createdAt: new Date(seededHistoryTime.getTime() + 60_000) },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"choices":[{"delta":{"content":"Ngày 3 nghỉ Huế."}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Ngày thứ 3 nên nghỉ ở đâu?");
    formData.set("conversationId", conversation.id);
    formData.set("tripProjectId", project.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    await response.text();
    const savedConversation = (await testDb.select().from(conversations).where(eq(conversations.id, conversation.id)))[0];
    const savedMessages = await testDb.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(asc(messages.createdAt), asc(messages.id));
    const gatewayMessages = getGatewayRequestMessages(fetchMock, 0);

    expect(response.status).toBe(200);
    expect(savedConversation).toMatchObject({ id: conversation.id, userId: "user-1", tripProjectId: project.id });
    expect(savedMessages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: "user", content: "Lịch trình Huế 5 ngày?" },
      { role: "assistant", content: "Nên chia chặng nhẹ." },
      { role: "user", content: "Ngày thứ 3 nên nghỉ ở đâu?" },
      { role: "assistant", content: "Ngày 3 nghỉ Huế." },
    ]);
    expect(gatewayMessages).toMatchObject([
      { role: "system" },
      { role: "user", content: "Lịch trình Huế 5 ngày?" },
      { role: "assistant", content: "Nên chia chặng nhẹ." },
      { role: "user", content: "Ngày thứ 3 nên nghỉ ở đâu?" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await countConversations()).toBe(1);
  });

  test("sends bounded streaming gateway requests with max_tokens 900", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"model":"stream-model","choices":[{"delta":{"content":"Nên đi nhẹ."}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Đi Quy Nhơn 3 ngày?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    await response.text();
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { max_tokens?: number; stream?: boolean };

    expect(requestBody.max_tokens).toBe(900);
    expect(requestBody.stream).toBe(true);
  });

  test("persists a truncated assistant message when finish_reason is length", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"choices":[{"delta":{"content":"Kế hoạch"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" dài"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":40,"completion_tokens":900,"total_tokens":940}}\n\n',
      'data: {"choices":[{"finish_reason":"length"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Kể cho tôi nghe lịch trình chi tiết 30 ngày?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const body = await response.text();
    const savedMessages = await testDb.select().from(messages).orderBy(asc(messages.createdAt), asc(messages.id));
    const savedUsageEvents = await testDb.select().from(aiUsageEvents);

    expect(response.status).toBe(200);
    expect(body).toContain('{"type":"done"');
    expect(savedMessages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: "user", content: "Kể cho tôi nghe lịch trình chi tiết 30 ngày?" },
      { role: "assistant", content: "Kế hoạch dài" },
    ]);
    expect(savedUsageEvents[0]).toMatchObject({ status: "success", completionTokens: 900 });
  });

  test("persists the assistant message when the stream ends with finish_reason stop but no DONE marker", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"choices":[{"delta":{"content":"Gợi ý chặng nhẹ."}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Đi Tây Bắc 3 ngày?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const body = await response.text();
    const savedMessages = await testDb.select().from(messages).orderBy(asc(messages.createdAt), asc(messages.id));

    expect(response.status).toBe(200);
    expect(body).toContain('{"type":"done"');
    expect(savedMessages).toHaveLength(2);
    expect(savedMessages[1]).toMatchObject({ role: "assistant", content: "Gợi ý chặng nhẹ." });
  });

  test("ignores SSE event keepalive lines without failing the stream", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      "event: ping\n\n",
      'data: {"choices":[{"delta":{"content":"Kế hoạch gợi ý."}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Đi Hà Giang?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const body = await response.text();
    const savedMessages = await testDb.select().from(messages).orderBy(asc(messages.createdAt), asc(messages.id));

    expect(response.status).toBe(200);
    expect(body).toContain('{"type":"done"');
    expect(savedMessages[1]).toMatchObject({ role: "assistant", content: "Kế hoạch gợi ý." });
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

  test("does not persist assistant messages for truncated streams without a terminal signal", async () => {
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
