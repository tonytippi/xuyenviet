import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { aiAskCommands, aiGatewayModels, aiUsageEvents, assistantResponseProvenance, auditEvents, chatContext, conversations, domainOutbox, domainOutboxEffects, messages, tripChangeProposals, tripProjects, users } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";
import { acquireAiAskCommand } from "@/features/ai/ai-ask-commands";
import { processAiAskDomainOutboxBatch, setDomainOutboxWorkerTestDependencies } from "@/features/ai/domain-outbox-worker";
import { issueCsrfToken } from "@/server/csrf";

const legacyBffTransport = {
  privateApiUrl: "https://api.railway.internal",
  bffOrigin: "https://xuyenviet.test",
  csrfSigningSecret: "a".repeat(32),
  csrfLifetimeSeconds: 300,
  requestTimeoutMs: 100,
};

function createAiAskStreamRequest(formData: FormData, idempotencyKey = crypto.randomUUID().replaceAll("-", "")) {
  const token = issueCsrfToken(legacyBffTransport);
  const request = new Request("https://xuyenviet.test/api/ai-ask/stream", {
    method: "POST",
    body: formData,
    headers: {
      "Idempotency-Key": idempotencyKey,
      origin: legacyBffTransport.bffOrigin,
      "sec-fetch-site": "same-origin",
      "X-XuyenViet-CSRF": token,
    },
  });
  Object.assign(request, { cookies: { get: (name: string) => name === "xv_bff_csrf" ? { value: token } : undefined } });
  return request;
}

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

async function completedAnswerSnapshot() {
  return {
    command: await testDb.select({ status: aiAskCommands.status, terminalResult: aiAskCommands.terminalResult, terminalAt: aiAskCommands.terminalAt }).from(aiAskCommands).where(eq(aiAskCommands.status, "completed")),
    assistants: await testDb.select({ id: messages.id, content: messages.content }).from(messages).where(eq(messages.role, "assistant")),
    provenance: await testDb.select({ id: assistantResponseProvenance.id, sourceSnapshot: assistantResponseProvenance.sourceSnapshot }).from(assistantResponseProvenance),
    initialUsage: await testDb.select({ id: aiUsageEvents.id, status: aiUsageEvents.status, purpose: aiUsageEvents.purpose }).from(aiUsageEvents).where(and(eq(aiUsageEvents.purpose, "ai_ask_initial_answer"), isNull(aiUsageEvents.providerRequestId))),
  };
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("chat/trip context extraction", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setDomainOutboxWorkerTestDependencies(undefined);
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("XV_AI_ASK_API_ENABLED", "false");
    vi.stubEnv("XV_PRIVATE_API_URL", legacyBffTransport.privateApiUrl);
    vi.stubEnv("XV_WEB_BFF_ORIGIN", legacyBffTransport.bffOrigin);
    vi.stubEnv("XV_BFF_CSRF_SIGNING_SECRET", legacyBffTransport.csrfSigningSecret);
    vi.stubEnv("XV_BFF_CSRF_LIFETIME_SECONDS", String(legacyBffTransport.csrfLifetimeSeconds));
    vi.stubEnv("XV_BFF_REQUEST_TIMEOUT_MS", String(legacyBffTransport.requestTimeoutMs));
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
    await expect(testDb.select({ tripProjectId: aiUsageEvents.tripProjectId }).from(aiUsageEvents)).resolves.toEqual([
      { tripProjectId: project.id },
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

  test("stores safe family travel facts using existing fields", async () => {
    await createTestUser("user-1");
    await createModel();
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Gia đình đi Huế" }).returning({ id: tripProjects.id });
    const { conversation, message } = await createConversationWithUserMessage({ userId: "user-1", tripProjectId: project.id });
    mockExtractionResponse({ facts: [
      { field: "children", value: "2", scope: "trip_project", confidence: 95 },
      { field: "children_ages", value: "5 và 8 tuổi", scope: "trip_project", confidence: 94 },
      { field: "driving_tolerance", value: "mỗi chặng lái tối đa khoảng 2 giờ", scope: "trip_project", confidence: 90 },
      { field: "activity_preferences", value: "ưu tiên hoạt động nhẹ, có chỗ nghỉ cho trẻ", scope: "trip_project", confidence: 88 },
      { field: "itinerary_constraints", value: "cần điểm dừng dễ ăn và vệ sinh sạch", scope: "trip_project", confidence: 86 },
      { field: "hotel_style", value: "khách sạn gần trung tâm, tiện đi bộ", scope: "trip_project", confidence: 82 },
      { field: "food_preferences", value: "món dễ ăn cho trẻ", scope: "trip_project", confidence: 80 },
    ] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await expect(extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      tripProjectId: project.id,
      userMessage: { id: message.id, content: "Nhà tôi có 2 bé 5 và 8 tuổi, cần chặng lái ngắn và điểm dừng dễ ăn." },
      history: [],
    })).resolves.toEqual({ attemptedProviderCall: true, persistedFacts: 7 });

    await expect(testDb.select().from(chatContext).orderBy(asc(chatContext.field))).resolves.toMatchObject([
      { field: "activity_preferences", value: "ưu tiên hoạt động nhẹ, có chỗ nghỉ cho trẻ", scope: "trip_project", tripProjectId: project.id },
      { field: "children", value: "2", scope: "trip_project", tripProjectId: project.id },
      { field: "children_ages", value: "5 và 8 tuổi", scope: "trip_project", tripProjectId: project.id },
      { field: "driving_tolerance", value: "mỗi chặng lái tối đa khoảng 2 giờ", scope: "trip_project", tripProjectId: project.id },
      { field: "food_preferences", value: "món dễ ăn cho trẻ", scope: "trip_project", tripProjectId: project.id },
      { field: "hotel_style", value: "khách sạn gần trung tâm, tiện đi bộ", scope: "trip_project", tripProjectId: project.id },
      { field: "itinerary_constraints", value: "cần điểm dừng dễ ăn và vệ sinh sạch", scope: "trip_project", tripProjectId: project.id },
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

  test("rejects sensitive child details while preserving safe family facts", async () => {
    await createTestUser("user-1");
    await createModel();
    const { conversation, message } = await createConversationWithUserMessage();
    mockExtractionResponse({ facts: [
      { field: "children", value: "1", scope: "conversation", confidence: 95 },
      { field: "children_ages", value: "7 tuổi", scope: "conversation", confidence: 90 },
      { field: "notes", value: "bé Minh 7 tuổi", scope: "conversation", confidence: 80 },
      { field: "notes", value: "bé minh 7 tuổi", scope: "conversation", confidence: 80 },
      { field: "notes", value: "con tôi tên An 8 tuổi", scope: "conversation", confidence: 80 },
      { field: "notes", value: "trẻ bị dị ứng hải sản", scope: "conversation", confidence: 80 },
      { field: "notes", value: "CCCD của con là 012345678901", scope: "conversation", confidence: 80 },
      { field: "food_preferences", value: "ưu tiên món đơn giản, ít cay", scope: "conversation", confidence: 75 },
    ] });
    const { extractChatTripContext } = await import("@/features/chat-trips/context-extraction");

    await expect(extractChatTripContext({
      session: { userId: "user-1", email: "user-1@example.com" },
      conversationId: conversation.id,
      userMessage: { id: message.id, content: "Tôi đi với một bé 7 tuổi, cần món ít cay." },
      history: [],
    })).resolves.toEqual({ attemptedProviderCall: true, persistedFacts: 3 });

    await expect(testDb.select().from(chatContext).orderBy(asc(chatContext.field))).resolves.toMatchObject([
      { field: "children", value: "1", scope: "conversation" },
      { field: "children_ages", value: "7 tuổi", scope: "conversation" },
      { field: "food_preferences", value: "ưu tiên món đơn giản, ít cay", scope: "conversation" },
    ]);
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

  test("stream route commits durable follow-up events without invoking extraction", async () => {
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
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Tôi muốn đi Huế 5 ngày.");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(createAiAskStreamRequest(formData) as never);
    const responseText = await response.text();

    expect(responseText).toContain('"type":"done"');
    expect(fetchMock.mock.calls.some((call) => {
      const init = Reflect.get(call, "1") as RequestInit | undefined;
      return JSON.parse(String(init?.body))?.stream === false;
    })).toBe(false);
    await expect(testDb.select({ role: messages.role }).from(messages).orderBy(asc(messages.createdAt))).resolves.toEqual([
      { role: "user" },
      { role: "assistant" },
    ]);
    expect(fetchMock.mock.calls.some(([, init]) => JSON.parse(String(init?.body))?.stream === false)).toBe(false);
    await expect(testDb.select({ eventType: domainOutbox.eventType }).from(domainOutbox).orderBy(asc(domainOutbox.eventType))).resolves.toEqual([
      { eventType: "ai_ask.answer_annotation.v1" },
      { eventType: "ai_ask.context_extraction.v1" },
    ]);
    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
  });

  test("stream route does not schedule extraction when finalization discards a stale fence", async () => {
    await createTestUser("user-1");
    await createModel({ id: "extract-model", gatewayModelName: "cx/extract" });
    await createModel({ id: "answer-model", gatewayModelName: "cx/answer", purpose: "ai_ask_initial_answer", supportsExtraction: false, supportsStreaming: true });
    const fetchMock = vi.fn(async () => new Response([
      'data: {"model":"cx/answer","choices":[{"delta":{"content":"Nên đi 5 ngày."}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Tôi muốn đi Huế 5 ngày.");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(createAiAskStreamRequest(formData) as never);
    await vi.waitFor(async () => {
      const [conversation] = await testDb.select({ id: conversations.id }).from(conversations);
      expect(conversation).toBeDefined();
      await testDb.update(conversations).set({ lifecycleVersion: 2 }).where(eq(conversations.id, conversation!.id));
    });
    const responseText = await response.text();

    expect(responseText).toContain('"type":"error"');
    expect(responseText).toContain('"code":"refresh_required"');
    expect(fetchMock.mock.calls.some((call) => {
      const init = Reflect.get(call, "1") as RequestInit | undefined;
      return JSON.parse(String(init?.body))?.stream === false;
    })).toBe(false);
    await expect(testDb.select().from(domainOutbox)).resolves.toHaveLength(1);
    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
  });

  test("stream route sends done without waiting for an extraction consumer", async () => {
    await createTestUser("user-1");
    await createModel({ id: "extract-model", gatewayModelName: "cx/extract" });
    await createModel({ id: "answer-model", gatewayModelName: "cx/answer", purpose: "ai_ask_initial_answer", supportsExtraction: false, supportsStreaming: true });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean };

      if (body.stream === false) {
        throw new Error("The route must not invoke extraction.");
      }

      return new Response([
        'data: {"model":"cx/answer","choices":[{"delta":{"content":"Xong."}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Tôi muốn đi Huế 5 ngày.");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(createAiAskStreamRequest(formData) as never);
    const responseText = await response.text();

    expect(responseText).toContain('"type":"done"');
    await expect(testDb.select().from(chatContext)).resolves.toHaveLength(0);
    expect(fetchMock.mock.calls.some(([, init]) => JSON.parse(String(init?.body))?.stream === false)).toBe(false);
  });

  test("atomically records one context provider failure usage before releasing the retry", async () => {
    await createTestUser("user-1");
    await createModel({ id: "extract-model", gatewayModelName: "cx/extract" });
    await createModel({ id: "answer-model", gatewayModelName: "cx/answer", purpose: "ai_ask_initial_answer", supportsExtraction: false, supportsStreaming: true });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean };
      if (body.stream === false) return new Response("unavailable", { status: 503 });
      return new Response([
        'data: {"model":"cx/answer","choices":[{"delta":{"content":"Xong."}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    }));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Tôi muốn đi Huế 5 ngày.");
    const { POST } = await import("@/app/api/ai-ask/stream/route");
    await (await POST(createAiAskStreamRequest(formData) as never)).text();
    const terminalSnapshot = await completedAnswerSnapshot();
    await testDb.update(domainOutbox).set({ availableAt: new Date("2099-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.answer_annotation.v1"));
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));

    await expect(processAiAskDomainOutboxBatch({ workerId: "context-failure-worker" })).resolves.toEqual({ kind: "error", count: 1 });
    const [event] = await testDb.select({ status: domainOutbox.status, lastErrorCode: domainOutbox.lastErrorCode }).from(domainOutbox).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));
    expect(event).toMatchObject({ status: "pending", lastErrorCode: "context_provider_failed" });
    await expect(completedAnswerSnapshot()).resolves.toEqual(terminalSnapshot);
    await expect(testDb.select({ status: aiUsageEvents.status, errorCode: aiUsageEvents.errorCode }).from(aiUsageEvents).where(eq(aiUsageEvents.purpose, "extraction"))).resolves.toEqual([{ status: "failure", errorCode: "gateway_http_error" }]);

    await testDb.update(domainOutbox).set({ maxAttempts: 1, availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));
    await expect(processAiAskDomainOutboxBatch({ workerId: "context-failure-worker" })).resolves.toEqual({ kind: "processed", count: 1 });
    await expect(testDb.select({ status: domainOutbox.status, failureCode: domainOutbox.failureCode }).from(domainOutbox).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"))).resolves.toEqual([{ status: "failed", failureCode: "retry_exhausted" }]);
    await expect(completedAnswerSnapshot()).resolves.toEqual(terminalSnapshot);
    await expect(testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.purpose, "extraction"))).resolves.toHaveLength(1);
  });

  test("revalidates context authority after its active claim check and before the provider call", async () => {
    await createTestUser("user-1");
    await createModel({ id: "extract-model", gatewayModelName: "cx/extract" });
    const admitted = await acquireAiAskCommand({ userId: "user-1", idempotencyKey: "context-revalidation-race", question: "Tôi đi Huế." });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") });
    const fetchMock = mockExtractionResponse({ facts: [] });

    vi.resetModules();
    vi.doMock("../packages/worker-domain/src/features/ai/domain-outbox", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../packages/worker-domain/src/features/ai/domain-outbox")>();
      return {
        ...actual,
        hasActiveDomainOutboxClaim: async (...args: Parameters<typeof actual.hasActiveDomainOutboxClaim>) => {
          const active = await actual.hasActiveDomainOutboxClaim(...args);
          await testDb.update(conversations).set({ lifecycleVersion: 2 }).where(eq(conversations.id, admitted.conversationId));
          return active;
        },
      };
    });
    const { processAiAskDomainOutboxBatch: processIsolatedBatch } = await import("@xuyenviet/worker-domain");

    await expect(processIsolatedBatch({ workerId: "context-revalidation-worker" })).resolves.toEqual({ kind: "processed", count: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(testDb.select({ effectType: domainOutboxEffects.effectType }).from(domainOutboxEffects)).resolves.toEqual([{ effectType: "fenced_out" }]);
  });

  test("revalidates annotation authority after its active claim check and before the provider call", async () => {
    await createTestUser("user-1");
    await createModel({ id: "answer-model", gatewayModelName: "cx/answer", purpose: "ai_ask_initial_answer", supportsExtraction: false, supportsStreaming: true });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean };
      if (!body.stream) throw new Error("The annotation provider must not be called.");
      return new Response([
        'data: {"model":"cx/answer","choices":[{"delta":{"content":"Huế"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { POST } = await import("@/app/api/ai-ask/stream/route");
    const formData = new FormData();
    formData.set("question", "Đi Huế.");
    await (await POST(createAiAskStreamRequest(formData, "annotation-revalidation-race") as never)).text();
    const terminalSnapshot = await completedAnswerSnapshot();
    await testDb.update(domainOutbox).set({ availableAt: new Date("2099-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.answer_annotation.v1"));
    const callsBeforeDelivery = fetchMock.mock.calls.length;

    vi.resetModules();
    vi.doMock("../packages/worker-domain/src/features/ai/domain-outbox", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../packages/worker-domain/src/features/ai/domain-outbox")>();
      return {
        ...actual,
        hasActiveDomainOutboxClaim: async (...args: Parameters<typeof actual.hasActiveDomainOutboxClaim>) => {
          const active = await actual.hasActiveDomainOutboxClaim(...args);
          await testDb.update(conversations).set({ lifecycleVersion: 2 });
          return active;
        },
      };
    });
    const { processAiAskDomainOutboxBatch: processIsolatedBatch } = await import("@xuyenviet/worker-domain");

    await expect(processIsolatedBatch({ workerId: "annotation-revalidation-worker" })).resolves.toEqual({ kind: "processed", count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeDelivery);
    await expect(testDb.select({ effectType: domainOutboxEffects.effectType }).from(domainOutboxEffects)).resolves.toEqual([{ effectType: "fenced_out" }]);
    await expect(completedAnswerSnapshot()).resolves.toEqual(terminalSnapshot);
  });

  test.each([
    ["final assistant content changes", async (assistantId: string) => {
      await testDb.update(messages).set({ content: "Huế đã được cập nhật." }).where(eq(messages.id, assistantId));
    }],
    ["referenced provenance is withdrawn", async (_assistantId: string, provenanceId: string) => {
      await testDb.update(assistantResponseProvenance).set({ availability: "withdrawn", withdrawnAt: new Date(), withdrawalReason: "withdrawn", sourceSnapshot: { unavailable: true } }).where(eq(assistantResponseProvenance.id, provenanceId));
    }],
  ])("does not persist annotations when %s after the provider returns", async (_scenario, changeFinalState) => {
    await createTestUser("user-1");
    await createModel({ id: "answer-model", gatewayModelName: "cx/answer", purpose: "ai_ask_initial_answer", supportsExtraction: false, supportsStreaming: true });
    let assistantId = "";
    let provenanceId = "";
    let releaseFinalPersistence: (() => void) | undefined;
    const finalPersistenceGate = new Promise<void>((resolve) => {
      releaseFinalPersistence = resolve;
    });
    let providerResponseResolved: (() => void) | undefined;
    const providerResponse = new Promise<void>((resolve) => {
      providerResponseResolved = resolve;
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean; messages?: Array<{ content: string }> };
      if (body.stream) return new Response([
        'data: {"model":"cx/answer","choices":[{"delta":{"content":"Huế"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
      if (body.messages?.[0]?.content.includes("annotation nội bộ")) {
        return new Response(JSON.stringify({ model: "cx/answer", choices: [{ message: { content: JSON.stringify({ annotations: [{ id: "hue", start: 0, end: 3, quote: "Huế", type: "source", provenanceIds: [provenanceId] }] }) } }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }), { status: 200, headers: { "x-request-id": "annotation-race", "content-type": "application/json" } });
      }
      throw new Error("Unexpected provider call");
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { POST } = await import("@/app/api/ai-ask/stream/route");
    const formData = new FormData();
    formData.set("question", "Đi Huế.");
    await (await POST(createAiAskStreamRequest(formData, "annotation-provider-return-race") as never)).text();
    const [assistant] = await testDb.select({ id: messages.id }).from(messages).where(eq(messages.role, "assistant"));
    if (!assistant) throw new Error("Expected finalized assistant message");
    assistantId = assistant.id;
    const [provenance] = await testDb.select({ id: assistantResponseProvenance.id }).from(assistantResponseProvenance).where(eq(assistantResponseProvenance.assistantMessageId, assistant.id));
    if (!provenance) throw new Error("Expected assistant provenance");
    provenanceId = provenance.id;
    await testDb.update(assistantResponseProvenance).set({ sourceCategory: "knowledge", sourceType: "knowledge_card", verificationStatus: "verified", usedInPrompt: true, sourceSnapshot: { title: "Huế" } }).where(eq(assistantResponseProvenance.id, provenance.id));
    await testDb.update(domainOutbox).set({ availableAt: new Date("2099-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.answer_annotation.v1"));

    setDomainOutboxWorkerTestDependencies({
      afterAnnotationProviderResponse: async () => {
        providerResponseResolved?.();
        await finalPersistenceGate;
      },
    });
    const delivery = processAiAskDomainOutboxBatch({ workerId: "annotation-provider-return-race-worker" });
    await providerResponse;
    await changeFinalState(assistantId, provenanceId);
    const [contentAfterMutation] = await testDb.select({ content: messages.content }).from(messages).where(eq(messages.id, assistant.id));
    releaseFinalPersistence?.();

    await expect(delivery).resolves.toEqual({ kind: "processed", count: 1 });
    const [finalAssistant] = await testDb.select({ content: messages.content, answerAnnotations: messages.answerAnnotations }).from(messages).where(eq(messages.id, assistant.id));
    expect(finalAssistant?.answerAnnotations).toEqual([]);
    expect(finalAssistant?.content).toBe(contentAfterMutation?.content);
    await expect(testDb.select({ status: aiAskCommands.status }).from(aiAskCommands).where(eq(aiAskCommands.assistantMessageId, assistant.id))).resolves.toEqual([{ status: "completed" }]);
  });

  test("delivers annotation and proposal effects with one success usage each across redelivery", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await createModel({ id: "answer-model", gatewayModelName: "cx/answer", purpose: "ai_ask_initial_answer", supportsExtraction: false, supportsStreaming: true });
    await createModel({ id: "proposal-model", gatewayModelName: "cx/proposal" });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean; messages?: Array<{ content: string }> };
      if (body.stream) return new Response([
        'data: {"model":"cx/answer","choices":[{"delta":{"content":"Huế"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
      if (body.messages?.[0]?.content.includes("annotation nội bộ")) {
        return new Response(JSON.stringify({ model: "cx/answer", choices: [{ message: { content: JSON.stringify({ annotations: [{ id: "hue", start: 0, end: 3, quote: "Huế", type: "warning", provenanceIds: [] }] }) } }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }), { status: 200, headers: { "x-request-id": "annotation-request", "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ model: "cx/proposal", choices: [{ message: { content: JSON.stringify({ rationale: "Thêm điểm đến Huế.", operations: [{ kind: "create-item", item: { kind: "anchor", anchorRole: "destination", type: null, state: "idea", label: "Huế" }, ordinal: 0 }], alternatives: [], ordering_preconditions: null }) } }], usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 } }), { status: 200, headers: { "x-request-id": "proposal-request", "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const formData = new FormData();
    formData.set("question", "Lên kế hoạch Huế.");
    formData.set("tripProjectId", project.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    await (await POST(createAiAskStreamRequest(formData) as never)).text();
    const [assistant] = await testDb.select({ id: messages.id, conversationId: messages.conversationId }).from(messages).where(eq(messages.role, "assistant"));
    const [userMessage] = await testDb.select({ id: messages.id }).from(messages).where(eq(messages.role, "user"));
    if (!assistant || !userMessage) throw new Error("Expected finalized messages");
    const [provenance] = await testDb.select({ id: assistantResponseProvenance.id }).from(assistantResponseProvenance).where(eq(assistantResponseProvenance.assistantMessageId, assistant.id));
    if (!provenance) throw new Error("Expected assistant provenance");
    await testDb.update(assistantResponseProvenance).set({ sourceCategory: "knowledge", sourceType: "knowledge_card", verificationStatus: "verified", usedInPrompt: true, sourceSnapshot: { title: "Huế" } }).where(eq(assistantResponseProvenance.id, provenance.id));
    const terminalSnapshot = await completedAnswerSnapshot();
    await testDb.update(domainOutbox).set({ availableAt: new Date("2099-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(inArray(domainOutbox.eventType, ["ai_ask.answer_annotation.v1", "ai_ask.trip_proposal_draft.v1"]));

    await expect(processAiAskDomainOutboxBatch({ workerId: "final-delivery-worker", batchSize: 2 })).resolves.toEqual({ kind: "processed", count: 2 });
    await expect(testDb.select({ purpose: aiUsageEvents.purpose, status: aiUsageEvents.status, providerRequestId: aiUsageEvents.providerRequestId }).from(aiUsageEvents).where(inArray(aiUsageEvents.purpose, ["ai_ask_initial_answer", "trip_proposal_draft"])).orderBy(asc(aiUsageEvents.providerRequestId))).resolves.toEqual([
      { purpose: "ai_ask_initial_answer", status: "success", providerRequestId: "annotation-request" },
      { purpose: "trip_proposal_draft", status: "success", providerRequestId: "proposal-request" },
      { purpose: "ai_ask_initial_answer", status: "success", providerRequestId: null },
    ]);
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(1);

    await testDb.update(domainOutbox).set({ status: "pending", completedAt: null, availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(inArray(domainOutbox.eventType, ["ai_ask.answer_annotation.v1", "ai_ask.trip_proposal_draft.v1"]));
    await expect(processAiAskDomainOutboxBatch({ workerId: "redelivery-worker", batchSize: 2 })).resolves.toEqual({ kind: "processed", count: 2 });
    await expect(testDb.select().from(domainOutboxEffects).where(inArray(domainOutboxEffects.effectType, ["answer_annotation", "trip_proposal_draft"]))).resolves.toHaveLength(2);
    await expect(testDb.select().from(aiUsageEvents).where(inArray(aiUsageEvents.purpose, ["ai_ask_initial_answer", "trip_proposal_draft"]))).resolves.toHaveLength(3);
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(1);
    await expect(completedAnswerSnapshot()).resolves.toEqual(terminalSnapshot);
  });

  test("does not deliver final effects after deleting the assistant message fences out the outbox rows", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await createModel({ id: "answer-model", gatewayModelName: "cx/answer", purpose: "ai_ask_initial_answer", supportsExtraction: false, supportsStreaming: true });
    const fetchMock = vi.fn(async () => new Response([
      'data: {"model":"cx/answer","choices":[{"delta":{"content":"Huế"}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const formData = new FormData();
    formData.set("question", "Lên kế hoạch Huế.");
    formData.set("tripProjectId", project.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    await (await POST(createAiAskStreamRequest(formData) as never)).text();
    const [assistant] = await testDb.select({ id: messages.id }).from(messages).where(eq(messages.role, "assistant"));
    if (!assistant) throw new Error("Expected finalized assistant message");
    await testDb.update(domainOutbox).set({ availableAt: new Date("2099-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));
    await testDb.delete(messages).where(eq(messages.id, assistant.id));
    const callsBeforeDelivery = fetchMock.mock.calls.length;

    await expect(processAiAskDomainOutboxBatch({ workerId: "deleted-final-worker" })).resolves.toEqual({ kind: "no_work" });
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeDelivery);
    await expect(testDb.select().from(domainOutboxEffects)).resolves.toHaveLength(0);
    await expect(testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.purpose, "trip_proposal_draft"))).resolves.toHaveLength(0);
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(0);
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

    const response = await POST(createAiAskStreamRequest(formData) as never);

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
