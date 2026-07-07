import { asc, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, auditEvents, chatContext, conversations, messages, tripProjects, users } from "@/db/schema";

import { testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

async function createModel(values: Partial<typeof aiGatewayModels.$inferInsert> = {}) {
  await testDb.insert(aiGatewayModels).values({
    id: values.id ?? `model-${crypto.randomUUID()}`,
    gatewayModelName: values.gatewayModelName ?? "cx/test-extraction",
    displayLabel: values.displayLabel ?? "Test model",
    purpose: values.purpose ?? "extraction",
    active: values.active ?? true,
    defaultForPurpose: values.defaultForPurpose ?? true,
    supportsTextInput: values.supportsTextInput ?? true,
    supportsImageInput: values.supportsImageInput ?? false,
    supportsImageOutput: values.supportsImageOutput ?? false,
    supportsEmbeddings: values.supportsEmbeddings ?? false,
    supportsExtraction: values.supportsExtraction ?? true,
    supportsEvaluation: values.supportsEvaluation ?? false,
    supportsStreaming: values.supportsStreaming ?? false,
    supportsCachePricing: values.supportsCachePricing ?? false,
    pricingCurrency: values.pricingCurrency ?? "USD",
    inputTokenPriceMicros: values.inputTokenPriceMicros ?? 1_000_000,
    outputTokenPriceMicros: values.outputTokenPriceMicros ?? 2_000_000,
    cacheReadTokenPriceMicros: values.cacheReadTokenPriceMicros ?? null,
    cacheWriteTokenPriceMicros: values.cacheWriteTokenPriceMicros ?? null,
    pricingUnitTokens: values.pricingUnitTokens ?? 1_000_000,
    pricingVersion: values.pricingVersion ?? "test-v1",
    pricingEffectiveAt: values.pricingEffectiveAt ?? new Date("2026-07-07T00:00:00.000Z"),
  });
}

async function createConversationWithUserMessage({ userId = "user-1", tripProjectId }: { userId?: string; tripProjectId?: string | null } = {}) {
  const [conversation] = await testDb.insert(conversations).values({ userId, tripProjectId: tripProjectId ?? null }).returning({ id: conversations.id });
  const [message] = await testDb.insert(messages).values({ conversationId: conversation.id, userId, role: "user", content: "Tôi đi Hà Nội đến Huế 5 ngày." }).returning({ id: messages.id });

  return { conversation, message };
}

function mockExtractionResponse(content: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    model: "cx/test-extraction",
    choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
  }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

describe("chat/trip context extraction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  test("stores allowed facts as conversation-scoped context for ordinary chat", async () => {
    await createTestUser("user-1");
    await createModel();
    const { conversation, message } = await createConversationWithUserMessage();
    const fetchMock = mockExtractionResponse({ facts: [
      { field: "origin", value: "Hà Nội", scope: "trip_project", confidence: 95 },
      { field: "destination", value: "Huế", scope: "conversation", confidence: 88 },
    ] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await expect(extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      userMessage: { id: message.id, content: "Tôi đi Hà Nội đến Huế 5 ngày." },
      history: [],
    })).resolves.toEqual({ attemptedProviderCall: true, persistedFacts: 2 });

    const savedContext = await testDb.select().from(chatContext).orderBy(asc(chatContext.field));
    const savedUsage = await testDb.select().from(aiUsageEvents);
    const savedAudit = await testDb.select().from(auditEvents);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(savedContext).toMatchObject([
      { userId: "user-1", conversationId: conversation.id, tripProjectId: null, sourceMessageId: message.id, field: "destination", value: "Huế", scope: "conversation", confidence: 88 },
      { userId: "user-1", conversationId: conversation.id, tripProjectId: null, sourceMessageId: message.id, field: "origin", value: "Hà Nội", scope: "conversation", confidence: 95 },
    ]);
    expect(savedUsage).toMatchObject([{ purpose: "extraction", status: "success", promptTokens: 20, completionTokens: 10, totalTokens: 30 }]);
    expect(savedAudit).toHaveLength(1);
    expect(savedAudit[0].afterSummary).toContain('"persistedFacts":2');
    expect(savedAudit[0].afterSummary).not.toContain("Hà Nội");
  });

  test("stores durable project facts as project-scoped and temporary facts as conversation-scoped", async () => {
    await createTestUser("user-1");
    await createModel();
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const { conversation, message } = await createConversationWithUserMessage({ userId: "user-1", tripProjectId: project.id });
    mockExtractionResponse({ facts: [
      { field: "destination", value: "Huế", scope: "trip_project", confidence: 90 },
      { field: "notes", value: "Hỏi riêng về quán ăn tối nay", scope: "conversation", confidence: 70 },
    ] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      tripProjectId: project.id,
      userMessage: { id: message.id, content: "Tôi chốt đi Huế, tối nay hỏi quán ăn." },
      history: [],
    });

    await expect(testDb.select().from(chatContext).orderBy(asc(chatContext.field))).resolves.toMatchObject([
      { field: "destination", value: "Huế", scope: "trip_project", tripProjectId: project.id },
      { field: "notes", value: "Hỏi riêng về quán ăn tối nay", scope: "conversation", tripProjectId: null },
    ]);
  });

  test("stores conversation corrections as a new active latest fact", async () => {
    await createTestUser("user-1");
    await createModel();
    const { conversation, message } = await createConversationWithUserMessage();
    await testDb.insert(chatContext).values({
      userId: "user-1",
      conversationId: conversation.id,
      sourceMessageId: message.id,
      field: "children_ages",
      value: "6 tuổi",
      scope: "conversation",
      createdAt: new Date("2026-07-07T01:00:00.000Z"),
    });
    mockExtractionResponse({ facts: [{ field: "children_ages", value: "8 tuổi", scope: "conversation", confidence: 92 }] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await expect(extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      userMessage: { id: message.id, content: "Không phải 6 tuổi, bé 8 tuổi." },
      history: [{ role: "user", content: "Bé 6 tuổi." }],
    })).resolves.toEqual({ attemptedProviderCall: true, persistedFacts: 1 });

    await expect(testDb.select().from(chatContext).orderBy(asc(chatContext.createdAt))).resolves.toMatchObject([
      { field: "children_ages", value: "6 tuổi", scope: "conversation", tripProjectId: null, status: "active" },
      { field: "children_ages", value: "8 tuổi", scope: "conversation", tripProjectId: null, status: "active", confidence: 92 },
    ]);
  });

  test("stores project corrections as a new active project-scoped fact for the selected owned project", async () => {
    await createTestUser("user-1");
    await createModel();
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const { conversation, message } = await createConversationWithUserMessage({ tripProjectId: project.id });
    await testDb.insert(chatContext).values({
      userId: "user-1",
      conversationId: conversation.id,
      tripProjectId: project.id,
      sourceMessageId: message.id,
      field: "destination",
      value: "Huế",
      scope: "trip_project",
      createdAt: new Date("2026-07-07T01:00:00.000Z"),
    });
    mockExtractionResponse({ facts: [{ field: "destination", value: "Đà Nẵng", scope: "trip_project", confidence: 90 }] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      tripProjectId: project.id,
      userMessage: { id: message.id, content: "Sửa điểm đến của chuyến này thành Đà Nẵng." },
      history: [{ role: "user", content: "Chuyến này đi Huế." }],
    });

    await expect(testDb.select().from(chatContext).orderBy(asc(chatContext.createdAt))).resolves.toMatchObject([
      { field: "destination", value: "Huế", scope: "trip_project", tripProjectId: project.id, status: "active" },
      { field: "destination", value: "Đà Nẵng", scope: "trip_project", tripProjectId: project.id, status: "active", confidence: 90 },
    ]);
  });

  test("keeps project-scope correction proposals conversation-scoped when no project is selected", async () => {
    await createTestUser("user-1");
    await createModel();
    const { conversation, message } = await createConversationWithUserMessage();
    mockExtractionResponse({ facts: [{ field: "children_ages", value: "8 tuổi", scope: "trip_project", confidence: 88 }] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      userMessage: { id: message.id, content: "Không phải 6 tuổi, bé 8 tuổi." },
      history: [],
    });

    await expect(testDb.select().from(chatContext)).resolves.toMatchObject([
      { field: "children_ages", value: "8 tuổi", scope: "conversation", tripProjectId: null, confidence: 88 },
    ]);
  });

  test("does not overwrite remembered context for ambiguous corrections", async () => {
    await createTestUser("user-1");
    await createModel();
    const { conversation, message } = await createConversationWithUserMessage();
    await testDb.insert(chatContext).values({
      userId: "user-1",
      conversationId: conversation.id,
      sourceMessageId: message.id,
      field: "children_ages",
      value: "6 tuổi",
      scope: "conversation",
    });
    mockExtractionResponse({ facts: [{ field: "children_ages", value: "8 tuổi", scope: "conversation", confidence: 80 }] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await expect(extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      userMessage: { id: message.id, content: "Sửa lại thành 8 nhé." },
      history: [],
    })).resolves.toEqual({ attemptedProviderCall: true, persistedFacts: 0 });

    await expect(testDb.select().from(chatContext)).resolves.toMatchObject([
      { field: "children_ages", value: "6 tuổi", scope: "conversation", status: "active" },
    ]);
  });

  test("stores ordinary corrections when the model infers the field from history", async () => {
    await createTestUser("user-1");
    await createModel();
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const { conversation, message } = await createConversationWithUserMessage({ tripProjectId: project.id });
    mockExtractionResponse({ facts: [{ field: "destination", value: "Đà Nẵng", scope: "trip_project", confidence: 91 }] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await expect(extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      tripProjectId: project.id,
      userMessage: { id: message.id, content: "Không phải Huế, Đà Nẵng nhé." },
      history: [{ role: "user", content: "Chuyến này đi Huế." }],
    })).resolves.toEqual({ attemptedProviderCall: true, persistedFacts: 1 });

    await expect(testDb.select().from(chatContext)).resolves.toMatchObject([
      { field: "destination", value: "Đà Nẵng", scope: "trip_project", tripProjectId: project.id, confidence: 91 },
    ]);
  });

  test("does not treat scope-only words as a correction field target", async () => {
    await createTestUser("user-1");
    await createModel();
    const { conversation, message } = await createConversationWithUserMessage();
    mockExtractionResponse({ facts: [{ field: "children_ages", value: "8", scope: "conversation", confidence: 80 }] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await expect(extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      userMessage: { id: message.id, content: "Sửa chuyến này thành 8 nhé." },
      history: [],
    })).resolves.toEqual({ attemptedProviderCall: true, persistedFacts: 0 });

    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
  });

  test("rejects accented vague corrections without a field target", async () => {
    await createTestUser("user-1");
    await createModel();
    const { conversation, message } = await createConversationWithUserMessage();
    mockExtractionResponse({ facts: [{ field: "children_ages", value: "8", scope: "conversation", confidence: 80 }] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await expect(extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      userMessage: { id: message.id, content: "Đổi lại thành 8 nhé." },
      history: [],
    })).resolves.toEqual({ attemptedProviderCall: true, persistedFacts: 0 });

    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
  });

  test("keeps clear facts from mixed messages with an unrelated ambiguous correction", async () => {
    await createTestUser("user-1");
    await createModel();
    const { conversation, message } = await createConversationWithUserMessage();
    mockExtractionResponse({ facts: [
      { field: "children_ages", value: "8", scope: "conversation", confidence: 70 },
      { field: "destination", value: "Huế", scope: "conversation", confidence: 90 },
    ] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await expect(extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      userMessage: { id: message.id, content: "Sửa lại thành 8 nhé. Tôi đi Huế." },
      history: [],
    })).resolves.toEqual({ attemptedProviderCall: true, persistedFacts: 1 });

    await expect(testDb.select().from(chatContext)).resolves.toMatchObject([
      { field: "destination", value: "Huế", scope: "conversation", confidence: 90 },
    ]);
  });

  test("ignores unsafe, unknown, blank, and malformed extraction content without blocking usage recording", async () => {
    await createTestUser("user-1");
    await createModel();
    const { conversation, message } = await createConversationWithUserMessage();
    mockExtractionResponse({ facts: [
      { field: "destination", value: "", scope: "conversation" },
      { field: "phone", value: "0901234567", scope: "conversation" },
      { field: "notes", value: "Số điện thoại 0901234567", scope: "conversation" },
      { field: "children_ages", value: "con tên An 8 tuổi", scope: "conversation" },
      { field: "children_ages", value: "bé An 8 tuổi", scope: "conversation" },
      { field: "notes", value: "vợ tên Lan làm ở ngân hàng", scope: "conversation" },
      { field: "destination", value: "Đà Nẵng", scope: "global" },
      { field: "budget", value: "15 triệu", scope: "conversation", confidence: 82 },
    ] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      userMessage: { id: message.id, content: "Ngân sách 15 triệu." },
      history: [],
    });

    await expect(testDb.select().from(chatContext)).resolves.toMatchObject([{ field: "budget", value: "15 triệu" }]);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(1);
  });

  test("does not call the provider or write context when no extraction-capable model exists", async () => {
    await createTestUser("user-1");
    await createModel({ supportsExtraction: false });
    const { conversation, message } = await createConversationWithUserMessage();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await expect(extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      userMessage: { id: message.id, content: "Đi Huế." },
      history: [],
    })).resolves.toEqual({ attemptedProviderCall: false, persistedFacts: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(0);
  });

  test("does not call the provider for project/conversation mismatch", async () => {
    await createTestUser("user-1");
    await createModel();
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const { conversation, message } = await createConversationWithUserMessage({ tripProjectId: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      tripProjectId: project.id,
      userMessage: { id: message.id, content: "Đi Huế." },
      history: [],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
  });

  test("stream route triggers extraction only after validated message persistence", async () => {
    await createTestUser("user-1");
    await createModel({ id: "extract-model", gatewayModelName: "cx/extract" });
    await createModel({ id: "answer-model", gatewayModelName: "cx/answer", purpose: "ai_ask_initial_answer", supportsExtraction: false, supportsStreaming: true });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean };

      if (body.stream === false) {
        return new Response(JSON.stringify({ model: "cx/extract", choices: [{ message: { content: JSON.stringify({ facts: [{ field: "destination", value: "Huế", scope: "conversation" }] }) } }] }), { status: 200 });
      }

      return new Response([
        'data: {"model":"cx/answer","choices":[{"delta":{"content":"Nên đi 5 ngày."}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("next/server", () => ({
      after: (callback: () => Promise<void> | void) => {
        void Promise.resolve(callback()).catch(() => undefined);
      },
    }));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Tôi muốn đi Huế 5 ngày.");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const responseText = await response.text();

    expect(responseText).toContain('"type":"done"');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.waitFor(async () => {
      await expect(testDb.select().from(chatContext)).resolves.toMatchObject([{ field: "destination", value: "Huế", scope: "conversation" }]);
    });
    await vi.waitFor(async () => {
      await expect(testDb.select().from(aiUsageEvents).orderBy(asc(aiUsageEvents.purpose))).resolves.toMatchObject([
        { purpose: "ai_ask_initial_answer", status: "success" },
        { purpose: "extraction", status: "success" },
      ]);
    });
  });

  test("stream route does not delay final answer event for slow extraction", async () => {
    await createTestUser("user-1");
    await createModel({ id: "extract-model", gatewayModelName: "cx/extract" });
    await createModel({ id: "answer-model", gatewayModelName: "cx/answer", purpose: "ai_ask_initial_answer", supportsExtraction: false, supportsStreaming: true });
    let resolveExtraction: (response: Response) => void = () => undefined;
    const extractionResponse = new Promise<Response>((resolve) => {
      resolveExtraction = resolve;
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean };

      if (body.stream === false) {
        return extractionResponse;
      }

      return new Response([
        'data: {"model":"cx/answer","choices":[{"delta":{"content":"Xong."}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("next/server", () => ({
      after: (callback: () => Promise<void> | void) => {
        void Promise.resolve(callback()).catch(() => undefined);
      },
    }));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Tôi muốn đi Huế 5 ngày.");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const responseText = await response.text();

    expect(responseText).toContain('"type":"done"');
    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);

    resolveExtraction(new Response(JSON.stringify({ model: "cx/extract", choices: [{ message: { content: JSON.stringify({ facts: [{ field: "destination", value: "Huế", scope: "conversation" }] }) } }] }), { status: 200 }));
    await vi.waitFor(async () => {
      await expect(testDb.select().from(chatContext)).resolves.toHaveLength(1);
    });
  });

  test("stream route rejects cross-user project before extraction provider calls", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    await createModel({ id: "extract-model" });
    await createModel({ id: "answer-model", purpose: "ai_ask_initial_answer", supportsExtraction: false, supportsStreaming: true });
    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Riêng" }).returning({ id: tripProjects.id });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("next/server", () => ({
      after: (callback: () => Promise<void> | void) => {
        void Promise.resolve(callback()).catch(() => undefined);
      },
    }));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Đi Huế.");
    formData.set("tripProjectId", otherProject.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(testDb.select().from(messages)).resolves.toHaveLength(0);
    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
  });

  test("database rejects invalid chat context scopes and owner/source mismatches", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const { conversation, message } = await createConversationWithUserMessage({ userId: "user-1", tripProjectId: project.id });
    const { conversation: otherConversation } = await createConversationWithUserMessage({ userId: "user-2" });

    await expect(testDb.insert(chatContext).values({
      userId: "user-1",
      conversationId: conversation.id,
      sourceMessageId: message.id,
      field: "destination",
      value: "Huế",
      scope: "conversation",
      tripProjectId: project.id,
    })).rejects.toThrow();

    await expect(testDb.execute(sql`
      insert into chat_context (id, user_id, conversation_id, source_message_id, field, value, scope)
      values ('bad-field', 'user-1', ${conversation.id}, ${message.id}, 'phone', '0901234567', 'conversation')
    `)).rejects.toThrow();

    await expect(testDb.insert(chatContext).values({
      userId: "user-1",
      conversationId: otherConversation.id,
      sourceMessageId: message.id,
      field: "destination",
      value: "Huế",
      scope: "conversation",
    })).rejects.toThrow();

    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Nẵng" }).returning({ id: tripProjects.id });

    await expect(testDb.insert(chatContext).values({
      userId: "user-1",
      conversationId: conversation.id,
      tripProjectId: otherProject.id,
      sourceMessageId: message.id,
      field: "destination",
      value: "Đà Nẵng",
      scope: "trip_project",
    })).rejects.toThrow();
  });
});
