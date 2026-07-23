import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, answerUsefulnessFeedback, assistantResponseProvenance, assistantRetrievalDecisions, conversations, messageImageAttachments, messages, tripProjects, users } from "@/db/schema";
import type { AnswerAnnotation } from "@/features/ai/answer-annotations";
import type { AnswerEntityDescriptor } from "@/features/ai/ai-ask-composer";

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

function findUsageEvent(rows: Array<typeof aiUsageEvents.$inferSelect>, purpose: string, provider?: string) {
  return rows.find((row) => row.purpose === purpose && (!provider || row.provider === provider));
}

async function renderAuthenticatedAiAskShell(searchParams: Record<string, string> = {}, roles: string[] = []) {
  vi.doMock("@/server/auth", () => ({
    getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    getAuthenticatedSessionWithRoles: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com", roles }),
    hasAdminAccess: vi.fn((roles: string[]) => roles.includes("admin") || roles.includes("operator")),
  }));
  vi.doMock("@/features/auth/actions", () => ({
    signOutCurrentUser: vi.fn(),
  }));

  const { default: AiAskPage } = await import("@/app/ai-ask/page");
  const element = await AiAskPage({ searchParams: Promise.resolve(searchParams) });

  return renderToStaticMarkup(element);
}

async function getAuthenticatedAiAskRedirect(searchParams: Record<string, string | string[]> = {}) {
  const redirect = vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  });
  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/server/auth", () => ({
    getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    getAuthenticatedSessionWithRoles: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com", roles: [] }),
    hasAdminAccess: vi.fn().mockReturnValue(false),
  }));
  vi.doMock("@/features/auth/actions", () => ({ signOutCurrentUser: vi.fn() }));
  vi.resetModules();

  const { default: AiAskPage } = await import("@/app/ai-ask/page");

  await expect(AiAskPage({ searchParams: Promise.resolve(searchParams) })).rejects.toThrow(/^redirect:/);
  return redirect.mock.calls[0]?.[0];
}

function getGatewayRequestMessages(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) {
  const request = fetchMock.mock.calls[callIndex][1] as RequestInit;
  const body = JSON.parse(String(request.body)) as { messages: { role: string; content: string }[] };

  return body.messages;
}

function makeAnnotation(id: string, content: string, text: string, type: AnswerAnnotation["type"], provenanceId: string, detailType: AnswerEntityDescriptor["type"]): AnswerAnnotation {
  const start = content.indexOf(text);

  return {
    id,
    start,
    end: start + text.length,
    text,
    type,
    detail: {
      type: detailType,
      label: text,
      owner: { table: "assistant_response_provenance", id: provenanceId },
      provenanceIds: [provenanceId],
    },
  };
}

describe("AI Ask authenticated shell", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.AI_GATEWAY_TIMEOUT_MS;
  });

  test("renders the authenticated empty AI Ask shell contract", async () => {
    const html = await renderAuthenticatedAiAskShell();

    expect(html).toContain("Hỏi trợ lý chuyến đi Việt Nam");
    expect(html).toContain("tony@example.com");
    expect(html).toContain("XuyenViet");
    expect(html).toContain("Danh sách trò chuyện và dự án chuyến đi");
    expect(html).toContain("Tài khoản và quyền riêng tư");
    expect(html).toContain("Tìm hiểu thêm về quyền riêng tư");
    expect(html).toContain("Mình sẽ đi đâu?");
    expect(html).toContain("Bắt đầu bằng một câu hỏi tự nhiên");
    expect(html).toContain("Hà Nội đi Đà Nẵng 7 ngày cùng gia đình");
    expect(html).toContain("Lên route");
    expect(html).toContain("Tìm nơi ở");
    expect(html).toContain("Điểm dừng");
    expect(html).toContain("Kiểm tra nguồn");
    expect(html).toContain("Lưu trữ hội thoại");
    expect(html).toContain("Câu hỏi của bạn");
    expect(html).toContain("Gửi câu hỏi");
    expect(html).not.toContain("Gợi ý câu hỏi</h2>");
    expect(html).not.toContain("Bảng chi tiết đã chọn");
    expect(html).not.toContain("Bảng ngữ cảnh hội thoại");
    expect(html).not.toContain("Chưa có chi tiết được chọn");
    expect(html).not.toContain("right detail panel");
    expect(html).toContain('aria-describedby="ai-ask-status"');
    expect(html).toContain('id="ai-ask-status"');
  });

  test("renders the active desktop shell without a blank contextual placeholder", async () => {
    await createTestUser("user-1");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    await testDb.insert(messages).values([
      { conversationId: conversation.id, userId: "user-1", role: "user", content: "Hà Nội đi Huế 5 ngày." },
      { conversationId: conversation.id, userId: "user-1", role: "assistant", content: "Kế hoạch gợi ý:\nNên đi nhẹ và nghỉ sớm." },
    ]);

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id });

    expect(html).toContain("Danh sách trò chuyện và dự án chuyến đi");
    expect(html).toContain("Lịch sử hội thoại");
    expect(html).toContain("Hà Nội đi Huế 5 ngày.");
    expect(html).not.toContain("Bảng ngữ cảnh hội thoại");
    expect(html).not.toContain("Chọn chi tiết trong câu trả lời");
    expect(html).not.toContain("Chưa có chi tiết được chọn");
    expect(html).not.toContain("Bảng chi tiết đã chọn");
    expect(html).not.toContain("source-chip");
  });

  test("renders assistant answer usefulness feedback controls and persisted state", async () => {
    await createTestUser("user-1");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Hà Nội đi Huế 5 ngày." });
    const [assistantMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "assistant", content: "Kế hoạch gợi ý:\nNên chia chặng." }).returning({ id: messages.id });
    await testDb.insert(answerUsefulnessFeedback).values({
      userId: "user-1",
      conversationId: conversation.id,
      assistantMessageId: assistantMessage.id,
      rating: "useful",
      comment: "Đúng nhu cầu gia đình.",
    });

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id });

    expect(html).toContain("Câu trả lời này hữu ích không?");
    expect(html).toContain("Đánh giá là tuỳ chọn và không ảnh hưởng việc tiếp tục chat hoặc mở nguồn.");
    expect(html).toContain("Hữu ích");
    expect(html).toContain("Chưa hữu ích");
    expect(html).toContain("Đúng nhu cầu gia đình.");
    expect(html).toContain('aria-pressed="true"');
  });

  test("keeps the right context panel hidden for an empty existing conversation", async () => {
    await createTestUser("user-1");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id });

    expect(html).toContain("Mình sẽ đi đâu?");
    expect(html).not.toContain("Bảng ngữ cảnh hội thoại");
    expect(html).not.toContain("Chưa có chi tiết được chọn");
  });

  test("keeps trip project controls in the desktop sidebar and mobile sheet contract", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");
    const navStart = source.indexOf('<nav aria-label="Danh sách trò chuyện và dự án chuyến đi"');
    const navEnd = source.indexOf("</nav>", navStart);
    const mainStart = source.indexOf('<div className="flex min-h-[34rem]', navEnd);
    const contextPanelStart = source.indexOf('aria-label="Bảng ngữ cảnh hội thoại"', mainStart);
    const sheetStart = source.indexOf('role="dialog" aria-modal="true" aria-label="Danh sách trò chuyện và dự án chuyến đi"');
    const sheetEnd = source.indexOf("</div>", source.indexOf("<ConversationList", sheetStart));
    const navMarkup = source.slice(navStart, navEnd);
    const mainOpening = source.slice(mainStart, mainStart + 300);
    const sheetMarkup = source.slice(sheetStart, sheetEnd);

    expect(navStart).toBeGreaterThan(-1);
    expect(navMarkup).toContain("<ConversationList");
    expect(navMarkup).toContain("{planningScope}");
    expect(mainOpening).not.toContain("{planningScope}");
    expect(contextPanelStart).toBeGreaterThan(mainStart);
    expect(sheetMarkup).toContain("{planningScope}");
    expect(sheetMarkup).toContain("<ConversationList");
    expect(source).toContain("sessionSheetPreviousFocusRef.current?.focus()");
    expect(source).toContain("sessionSheetPanelRef.current?.focus()");
    expect(source).toContain("sessionSheetPreviousFocusRef.current = textareaRef.current");
    expect(source).toContain("aria-label=\"Mở danh sách trò chuyện, dự án chuyến đi và tài khoản\"");
    expect(source).toContain("aria-label=\"Tài khoản và quyền riêng tư\"");
    expect(source).toContain("canAccessAdmin ?");
  });

  test("renders admin sidebar entry only for authorized roles", async () => {
    const nonAdminHtml = await renderAuthenticatedAiAskShell();

    expect(nonAdminHtml).not.toContain("Vào khu vực quản trị");
    expect(nonAdminHtml).not.toContain('href="/admin"');

    vi.resetModules();

    const adminHtml = await renderAuthenticatedAiAskShell({}, ["operator"]);

    expect(adminHtml).toContain("Vào khu vực quản trị");
    expect(adminHtml).toContain('href="/admin"');
  });

  test("composer source keeps mobile sidebar and selected detail as separate accessible drawers", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");
    const sheetStart = source.indexOf('role="dialog" aria-modal="true" aria-label="Danh sách trò chuyện và dự án chuyến đi"');
    const detailStart = source.indexOf('role="dialog" aria-modal="true" aria-label="Bảng chi tiết đã chọn"');
    const detailMarkup = source.slice(detailStart, source.indexOf("</div>", detailStart));

    expect(sheetStart).toBeGreaterThan(-1);
    expect(detailStart).toBeGreaterThan(-1);
    expect(detailStart).toBeGreaterThan(sheetStart);
    expect(source).toContain("selectedAnswerEntity && !isSessionSheetOpen");
    expect(source).toContain("handleSelectAnswerEntity");
    expect(source).toContain("Mở chi tiết annotation");
    expect(source).toContain("Đóng bảng chi tiết đã chọn");
    expect(source).toContain("mobileAnswerDetailDialogRef");
    expect(source).toContain("getFocusableElements(dialog)");
    expect(source).toContain("document.body.style.overflow = \"hidden\"");
    expect(detailMarkup).toContain("bottom-0 left-0 right-0");
    expect(detailMarkup).not.toContain("<ConversationList");
  });

  test("starter cards preserve an existing public ask draft", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");
    const starterClickStart = source.indexOf("setStatus(\"Ô nhập đã có nội dung");
    const setQuestionStart = source.indexOf("setQuestion(card.description)");

    expect(starterClickStart).toBeGreaterThan(-1);
    expect(starterClickStart).toBeLessThan(setQuestionStart);
    expect(source).toContain("if (question.trim())");
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

    expect(html).toContain("Đã tải hội thoại. Bạn có thể tiếp tục kế hoạch.");
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(thirdIndex).toBeGreaterThan(secondIndex);
  });

  test("renders source and confidence section from stored provenance, not answer text", async () => {
    await createTestUser("user-1");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const [userMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Bãi đỗ ở Huế?" }).returning({ id: messages.id });
    const [assistantMessage] = await testDb.insert(messages).values({
      conversationId: conversation.id,
      userId: "user-1",
      role: "assistant",
      content: "Kế hoạch gợi ý:\nNên dừng sớm. Nguồn giả trong chữ: Fake Parking Blog.",
    }).returning({ id: messages.id });
    await testDb.insert(assistantResponseProvenance).values([
      {
        userId: "user-1",
        conversationId: conversation.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        sourceCategory: "knowledge",
        rank: 1,
        sourceType: "parking",
        verificationStatus: "verified",
        usedInPrompt: true,
        citedInAnswer: false,
        sourceSnapshot: { title: "Bãi đỗ chính thức Huế", confidence: "official", freshnessSensitive: true, sources: [{ canonicalUrl: "https://xuyenviet.example/hue-parking", collectedDate: "2026-07-08" }] },
      },
      {
        userId: "user-1",
        conversationId: conversation.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        sourceCategory: "web",
        rank: 2,
        sourceType: "official",
        verificationStatus: "unverified",
        usedInPrompt: true,
        citedInAnswer: false,
        sourceSnapshot: { title: "Nguồn web cập nhật", url: "https://hue.gov.vn/ticket", checkedAt: "2026-07-09T10:00:00.000Z", confidence: "official", triggerReason: "freshness_sensitive_request" },
      },
      {
        userId: "user-1",
        conversationId: conversation.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        sourceCategory: "web",
        rank: 3,
        sourceType: "community",
        verificationStatus: "unverified",
        usedInPrompt: true,
        citedInAnswer: false,
        sourceSnapshot: { title: "Nguồn không an toàn", url: "javascript:alert(1)", checkedAt: "2026-07-09T10:00:00.000Z", confidence: "unverified" },
      },
    ]);

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id });

    expect(html).toContain("Nguồn và độ tin cậy");
    expect(html).toContain("Bãi đỗ chính thức Huế");
    expect(html).toContain("Nguồn web cập nhật");
    expect(html).toContain("Nguồn không an toàn");
    expect(html).toContain("Xem chi tiết cảnh báo: Bãi đỗ chính thức Huế");
    expect(html).toContain("Xem chi tiết cảnh báo: Nguồn web cập nhật");
    expect(html).toContain("Xem chi tiết nguồn: Nguồn không an toàn");
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('role="option"');
    expect(html).not.toContain('aria-selected="false"');
    expect(html).toContain("https://xuyenviet.example/hue-parking");
    expect(html).toContain("hue.gov.vn/ticket");
    expect(html).toContain("8/7/2026");
    expect(html).toContain("Mở nguồn tham khảo");
    expect(html).toContain("Thông tin có thể thay đổi");
    expect(html).toContain("chưa xác minh");
    expect(html).toContain("Nguồn web tự ghi official, vẫn chưa được XuyenViet duyệt");
    expect(html).toContain("Nguồn cộng đồng bên ngoài, chưa xác minh");
    expect(html).toContain("Fake Parking Blog");
    expect(html).not.toContain("official</span><span>Loại: official");
    expect(html).not.toContain("Loại: community");
    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain("source-chip");
    expect(html).not.toContain("[1]");
  });

  test("renders backend annotations as inline accessible highlights while preserving section cards", async () => {
    const { AssistantMessageContent } = await import("@/features/ai/ai-ask-composer");
    const content = "Kế hoạch gợi ý:\nNên dừng ở Bãi đỗ chính thức Huế.\nCảnh báo cần kiểm tra:\nGiá xem Nguồn web cập nhật.";
    const annotations: AnswerAnnotation[] = [
      makeAnnotation("ann-knowledge", content, "Bãi đỗ chính thức Huế", "source", "knowledge-1", "source"),
      makeAnnotation("ann-web", content, "Nguồn web cập nhật", "warning", "web-1", "warning"),
    ];

    const html = renderToStaticMarkup(createElement(AssistantMessageContent, { content, annotations, selectedEntityId: "web-1", detailPanelIds: "mobile desktop" }));

    expect(html).toContain("Kế hoạch gợi ý");
    expect(html).toContain("Cảnh báo cần kiểm tra");
    expect(html).toContain("Mở chi tiết annotation: Bãi đỗ chính thức Huế");
    expect(html).toContain("Mở chi tiết annotation: Nguồn web cập nhật");
    expect(html).toContain('aria-controls="mobile desktop"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Nên dừng ở ");
    expect(html).not.toContain("source-chip");
    expect(html).not.toContain("[1]");
  });

  test("ignores invalid and overlapping inline annotations without hiding the answer", async () => {
    const { AssistantMessageContent } = await import("@/features/ai/ai-ask-composer");
    const content = "Nên dừng ở Huế và kiểm tra giá.";
    const annotations: AnswerAnnotation[] = [
      makeAnnotation("valid", content, "Huế", "source", "knowledge-1", "source"),
      makeAnnotation("overlap", content, "Huế và", "warning", "web-1", "warning"),
      { ...makeAnnotation("bad-text", content, "giá", "warning", "web-2", "warning"), text: "giá vé" },
      { ...makeAnnotation("missing-detail", content, "kiểm tra", "action", "action-1", "action"), detail: undefined as never },
    ];

    const html = renderToStaticMarkup(createElement(AssistantMessageContent, { content, annotations }));

    expect(html).toContain("Nên dừng ở ");
    expect(html).toContain("Mở chi tiết annotation: Huế");
    expect(html).not.toContain("Mở chi tiết annotation: Huế và");
    expect(html).not.toContain("giá vé");
    expect(html).not.toContain("Mở chi tiết annotation: kiểm tra");
  });

  test("keeps unannotated assistant answers readable with fallback provenance available", async () => {
    const { AssistantMessageContent } = await import("@/features/ai/ai-ask-composer");
    const html = renderToStaticMarkup(createElement(AssistantMessageContent, { content: "Kế hoạch gợi ý:\nNên đi nhẹ." }));

    expect(html).toContain("Kế hoạch gợi ý");
    expect(html).toContain("Nên đi nhẹ.");
    expect(html).not.toContain("Mở chi tiết annotation");
  });

  test("does not synthesize persisted provenance title matches into inline annotations", async () => {
    await createTestUser("user-1");
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const [userMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Bãi đỗ ở Huế?" }).returning({ id: messages.id });
    const [assistantMessage] = await testDb.insert(messages).values({
      conversationId: conversation.id,
      userId: "user-1",
      role: "assistant",
      content: "Kế hoạch gợi ý:\nBãi đỗ chính thức Huế phù hợp để kiểm tra trước khi vào trung tâm.",
    }).returning({ id: messages.id });
    await testDb.insert(assistantResponseProvenance).values({
      userId: "user-1",
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      sourceCategory: "knowledge",
      rank: 1,
      sourceType: "parking",
      verificationStatus: "verified",
      usedInPrompt: true,
      citedInAnswer: false,
      sourceSnapshot: { title: "Bãi đỗ chính thức Huế", confidence: "official", sourceSnapshot: "unsafe", providerScore: 1, raw_source_material: "raw" },
    });

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id });

    expect(html).not.toContain("Mở chi tiết annotation: Bãi đỗ chính thức Huế");
    expect(html).toContain("Bãi đỗ chính thức Huế");
    expect(html).toContain("Nguồn và độ tin cậy");
    expect(html).not.toContain("raw_source_material");
    expect(html).not.toContain("providerScore");
  });

  test("renders persisted answer annotations when reopening conversation history", async () => {
    await createTestUser("user-1");
    const content = "Kế hoạch gợi ý:\nBãi đỗ chính thức Huế phù hợp để kiểm tra trước khi vào trung tâm.";
    const annotations = [makeAnnotation("ann-knowledge", content, "Bãi đỗ chính thức Huế", "source", "knowledge-1", "source")];
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const [userMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Bãi đỗ ở Huế?" }).returning({ id: messages.id });
    const [assistantMessage] = await testDb.insert(messages).values({
      conversationId: conversation.id,
      userId: "user-1",
      role: "assistant",
      content,
      answerAnnotations: annotations,
    }).returning({ id: messages.id });
    await testDb.insert(assistantResponseProvenance).values({
      id: "knowledge-1",
      userId: "user-1",
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      sourceCategory: "knowledge",
      rank: 1,
      verificationStatus: "verified",
      usedInPrompt: true,
      citedInAnswer: false,
      sourceSnapshot: { title: "Bãi đỗ chính thức Huế" },
    });

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id });

    expect(html).toContain("Mở chi tiết annotation: Bãi đỗ chính thức Huế");
    expect(html).toContain("aria-controls=\"ai-ask-selected-answer-detail-mobile ai-ask-selected-answer-detail-desktop\"");
  });

  test("renders a legacy action alongside current persisted annotations when reopening history", async () => {
    await createTestUser("user-1");
    const content = "Kế hoạch gợi ý:\nBãi đỗ chính thức Huế phù hợp. Kiểm tra chỗ đỗ trước khi đi.";
    const actionText = "Kiểm tra chỗ đỗ";
    const annotations = [
      makeAnnotation("ann-knowledge", content, "Bãi đỗ chính thức Huế", "source", "knowledge-1", "source"),
      {
        id: "legacy-action",
        start: content.indexOf(actionText),
        end: content.indexOf(actionText) + actionText.length,
        text: actionText,
        type: "action",
        detail: {
          type: "action",
          label: actionText,
          section: "Gợi ý hành động",
          detail: {
            "Nhãn": "Hành động gợi ý",
            "Giải thích": "Gợi ý thao tác tiếp theo từ câu trả lời, không phải nguồn đã xác minh.",
          },
        },
      },
    ];
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const [userMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Bãi đỗ ở Huế?" }).returning({ id: messages.id });
    const [assistantMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "assistant", content, answerAnnotations: annotations }).returning({ id: messages.id });
    await testDb.insert(assistantResponseProvenance).values({ id: "knowledge-1", userId: "user-1", conversationId: conversation.id, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id, sourceCategory: "knowledge", rank: 1, verificationStatus: "verified", usedInPrompt: true, citedInAnswer: false, sourceSnapshot: { title: "Bãi đỗ chính thức Huế" } });

    const html = await renderAuthenticatedAiAskShell({ conversationId: conversation.id });

    expect(html).toContain("Mở chi tiết annotation: Bãi đỗ chính thức Huế");
    expect(html).toContain("Mở chi tiết annotation: Kiểm tra chỗ đỗ");
    expect(html).not.toContain("Giải thích");
  });

  test("renders annotation ranges in headings and does not mark provenance-less actions selected by default", async () => {
    const { AssistantMessageContent } = await import("@/features/ai/ai-ask-composer");
    const content = "Nguồn và độ tin cậy\nBước tiếp theo";
    const annotations: AnswerAnnotation[] = [
      makeAnnotation("heading-source", content, "Nguồn và độ tin cậy", "source", "source-1", "source"),
      {
        id: "action-heading",
        start: content.indexOf("Bước tiếp theo"),
        end: content.indexOf("Bước tiếp theo") + "Bước tiếp theo".length,
        text: "Bước tiếp theo",
        type: "action",
        detail: { type: "action", label: "Bước tiếp theo", section: "Gợi ý hành động", detail: { "Nhãn": "Hành động" } },
      },
    ];

    const html = renderToStaticMarkup(createElement(AssistantMessageContent, { content, annotations }));

    expect(html).toContain("Mở chi tiết annotation: Nguồn và độ tin cậy");
    expect(html).toContain("Mở chi tiết annotation: Bước tiếp theo");
    expect(html).not.toContain('aria-pressed="true"');
  });

  test("renders selected answer detail panel from a transient safe descriptor", async () => {
    const { AnswerDetailPanel } = await import("@/features/ai/ai-ask-composer");
    const selectedEntity: AnswerEntityDescriptor = {
      type: "source",
      label: "Nguồn web cập nhật",
      section: "Nguồn và độ tin cậy",
      sourceCategory: "web",
      owner: { table: "assistant_response_provenance", id: "provenance-1" },
      detail: {
        "Loại": "Web chưa xác minh",
        "URL": "https://hue.gov.vn/ticket",
        "Ngày kiểm tra": "9/7/2026",
        "Độ tin cậy": "chưa xác minh",
        "Độ mới": "Thông tin có thể thay đổi, cần kiểm tra lại trước khi đi hoặc đặt dịch vụ.",
      },
      provenanceIds: ["provenance-1"],
    };

    const html = renderToStaticMarkup(createElement(AnswerDetailPanel, { selectedEntity, onClose: () => undefined }));

    expect(html).toContain("Chi tiết đã chọn");
    expect(html).toContain("Nguồn web cập nhật");
    expect(html).toContain("Đây là nguồn web bên ngoài và vẫn chưa xác minh");
    expect(html).toContain("Thông tin nhanh");
    expect(html).toContain("Web chưa xác minh");
    expect(html).toContain("https://hue.gov.vn/ticket");
    expect(html).toContain("9/7/2026");
    expect(html).toContain("Thông tin có thể thay đổi");
    expect(html).toContain("Cơ sở gợi ý");
    expect(html).toContain("Nguồn 1");
    expect(html).not.toContain("#provenance-1");
    expect(html).toContain("Đóng bảng chi tiết");
    expect(html).not.toContain("raw_source_material");
    expect(html).not.toContain("providerScore");
    expect(html).not.toContain("operator");
  });

  test("labels selected general reasoning as unverified without a fake source URL", async () => {
    const { AnswerDetailPanel } = await import("@/features/ai/ai-ask-composer");
    const selectedEntity: AnswerEntityDescriptor = {
      type: "source",
      label: "Suy luận tổng quát của AI",
      section: "Nguồn và độ tin cậy",
      sourceCategory: "general",
      detail: {
        "Loại": "Suy luận",
        "Độ tin cậy": "suy luận chưa xác minh",
        "Nhãn nguồn": "Không phải nguồn đã xác minh",
      },
      provenanceIds: ["general-1"],
    };

    const html = renderToStaticMarkup(createElement(AnswerDetailPanel, { selectedEntity, onClose: () => undefined }));

    expect(html).toContain("Suy luận tổng quát của AI");
    expect(html).toContain("chưa được xác minh");
    expect(html).toContain("Không phải nguồn đã xác minh");
    expect(html).not.toContain("Mở nguồn tham khảo");
    expect(html).not.toContain("https://");
  });

  test("composer source keeps answer entity selection transient, accessible, and provenance-only", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain("type AnswerEntityDescriptor");
    expect(source).toContain("const [selectedAnswerEntity, setSelectedAnswerEntity] = useState<AnswerEntityDescriptor | null>(null)");
    expect(source).toContain("createProvenanceAnswerEntityDescriptor(item)");
    expect(source).toContain("owner: { table: \"assistant_response_provenance\", id: item.id }");
    expect(source).toContain("aria-pressed={isSelected}");
    expect(source).toContain("aria-controls={detailPanelIds}");
    expect(source).toContain("aria-expanded={isSelected}");
    expect(source).toContain("panel?.focus({ preventScroll: true })");
    expect(source).toContain("trigger?.isConnected");
    expect(source).toContain("Xem chi tiết suy luận AI");
    expect(source).toContain("showContextPanel && selectedAnswerEntity");
    expect(source).toContain("Bảng chi tiết đã chọn");
    expect(source).toContain("focus:ring-4 focus:ring-[#8fb59f]/45");
    expect(source).toContain("event.key !== \"Escape\"");
    expect(source).toContain("isSessionSheetOpen || isTyping");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("sourceSnapshot");
    expect(source).not.toContain("raw_source_material");
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

    await expect(getAuthenticatedAiAskRedirect({ conversationId: conversation.id })).resolves.toBe("/ai-ask");
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

  test("renders selected trip project delete affordance and cascading deletion copy", async () => {
    await createTestUser("user-1");
    const [ownProject] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Nẵng gia đình", origin: "Hà Nội", destination: "Đà Nẵng" }).returning({ id: tripProjects.id });

    const html = await renderAuthenticatedAiAskShell({ tripProjectId: ownProject.id });

    expect(html).toContain("Xoá dự án chuyến đi");
    expect(html).toContain("các cuộc trò chuyện liên kết và thông tin ngữ cảnh đã lưu sẽ bị xoá");
  });

  test("redirects to ordinary chat when opening another user's trip project", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Dự án riêng user-2" }).returning({ id: tripProjects.id });

    await expect(getAuthenticatedAiAskRedirect({ tripProjectId: otherProject.id })).resolves.toBe("/ai-ask");
  });

  test("redirects an owned linked project conversation to its project scope", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế", origin: "Hà Nội", destination: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    await expect(getAuthenticatedAiAskRedirect({ conversationId: conversation.id })).resolves.toBe(`/ai-ask?conversationId=${conversation.id}&tripProjectId=${project.id}`);
  });

  test("redirects a direct owned project conversation to its canonical project scope while preserving ref and normalized draft", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });

    const redirectUrl = await getAuthenticatedAiAskRedirect({ conversationId: conversation.id, ref: "ROAD-7", draft: "  Đi Huế  " });

    expect(redirectUrl).toBe(`/ai-ask?conversationId=${conversation.id}&tripProjectId=${project.id}&ref=ROAD-7&draft=%C4%90i+Hu%E1%BA%BF`);
  });

  test("redirects stale or unauthorized selection to the safe owned fallback", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [ownedProject] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [otherConversation] = await testDb.insert(conversations).values({ userId: "user-2" }).returning({ id: conversations.id });

    await expect(getAuthenticatedAiAskRedirect({ conversationId: otherConversation.id, tripProjectId: ownedProject.id })).resolves.toBe(`/ai-ask?tripProjectId=${ownedProject.id}`);
    vi.resetModules();
    await expect(getAuthenticatedAiAskRedirect({ conversationId: "stale-conversation", tripProjectId: "stale-project" })).resolves.toBe("/ai-ask");
  });

  test("removes unsupported and empty selection parameters from the canonical URL", async () => {
    await expect(getAuthenticatedAiAskRedirect({ ref: "   ", legacy: "ignored" } as Record<string, string>)).resolves.toBe("/ai-ask");
  });

  test("redirects a mismatched owned conversation and project to the resolved project only", async () => {
    await createTestUser("user-1");
    const [projectA] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [projectB] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: projectA.id }).returning({ id: conversations.id });

    await expect(getAuthenticatedAiAskRedirect({ conversationId: conversation.id, tripProjectId: projectB.id })).resolves.toBe(`/ai-ask?tripProjectId=${projectB.id}`);
  });

  test("composer source exposes the active mobile workspace, direct account access, and safe-area composer", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain("const activeWorkspaceTitle");
    expect(source).toContain("Không gian đang mở:");
    expect(source).toContain('aria-label="Tài khoản và quyền riêng tư"');
    expect(source).toContain('href="/#quyen-rieng-tu"');
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain("function reconcileSelection");
    expect(source).toContain("router.refresh()");
  });

});

describe("AI Ask structured answer rendering", () => {
  test("composer source includes explicit pending and long-running progress contracts", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain("const [isPreparing, setIsPreparing] = useState(false)");
    expect(source).toContain('if (event.type === "preparing")');
    expect(source).toContain("Đang gửi câu hỏi và chuẩn bị luồng trả lời");
    expect(source).toContain("Trợ lý đang chuẩn bị ngữ cảnh cho câu hỏi của bạn.");
    expect(source).toContain("Nội dung đang nhận chỉ là tạm thời cho đến khi được lưu hoàn chỉnh.");
    expect(source).toContain("Đang nhận từng phần");
    expect(source).toContain("aria-live=\"polite\"");
    expect(source).toContain("setIsPreparing(true);\n        setStreamingContent");
  });

  test("composer source accepts removable validated traveler images", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain("Đính kèm ảnh tham khảo");
    expect(source).toContain("accept=\"image/jpeg,image/png,image/webp\"");
    expect(source).toContain("maxImageByteSize = 5 * 1024 * 1024");
    expect(source).toContain("Bỏ ảnh");
    expect(source).toContain("AttachmentIcon");
    expect(source).toContain("{supportsImageInput ? (");
    expect(source).toContain("supportsImageInput?: boolean");
    expect(source).toContain("setRecoveryMessage");
    expect(source).toContain("setRecoveryMessage(null);\n    setSelectedImage(file);");
    expect(source).toContain("function clearSelectedImage() {\n    setSelectedImage(null);\n    setRecoveryMessage(null);");
    expect(readFileSync("src/app/ai-ask/page.tsx", "utf8")).toContain("supportsImageInput={Boolean(imageInputModel)}");
  });

  test("composer source keeps duplicate-send controls guarded while pending", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain("if (isSubmittingRef.current)");
    expect(source).toContain("const askFormDisabled = isPending || Boolean(deletingTripProjectId)");
    expect(source).toContain("disabled={askFormDisabled}");
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

  test("renders answer-scoped navigation and uncertainty sections without source chips", async () => {
    const { AssistantMessageContent } = await import("@/features/ai/ai-ask-composer");
    const assistantContent = ["## Kế hoạch gợi ý:", "- Ngày 1: đi nhẹ và nghỉ sớm.", "", "**Điều chưa chắc chắn:**", "Cần xác minh giờ mở cửa.", "", "**Nguồn và độ tin cậy:**", "Đây là gợi ý tổng quát, chưa dùng nguồn tuyển chọn.", "", "1. Câu hỏi tiếp theo:", "Bạn đi cùng trẻ nhỏ không?"].join("\n");
    const html = renderToStaticMarkup(
      AssistantMessageContent({
        messageId: "assistant-1",
        content: assistantContent,
      }),
    );

    expect(html).toContain('aria-label="Các mục trong câu trả lời"');
    expect(html).toContain('href="#answer-assistant-1-section-0"');
    expect(html).toContain('href="#answer-assistant-1-section-1"');
    expect(html).toContain('id="answer-assistant-1-section-0"');
    expect(html).toContain('id="answer-assistant-1-section-1"');
    expect(html).toContain("## Kế hoạch gợi ý:");
    expect(html).toContain("**Điều chưa chắc chắn:**");
    expect(html).toContain("**Nguồn và độ tin cậy:**");
    expect(html).toContain("1. Câu hỏi tiếp theo:");
    expect(html).toContain("Đây là gợi ý tổng quát, chưa dùng nguồn tuyển chọn.");
    expect(html).not.toContain("source-chip");
    expect(html).not.toContain("[1]");
  });

  test("omits answer navigation for unstructured content and namespaces repeated headings", async () => {
    const { AssistantMessageContent } = await import("@/features/ai/ai-ask-composer");
    const unstructuredHtml = renderToStaticMarkup(createElement(AssistantMessageContent, { messageId: "assistant-1", content: "Một câu trả lời không có tiêu đề được nhận diện." }));
    const firstAnswerHtml = renderToStaticMarkup(createElement(AssistantMessageContent, { messageId: "assistant-1", content: "Kế hoạch gợi ý:\nĐi nhẹ." }));
    const secondAnswerHtml = renderToStaticMarkup(createElement(AssistantMessageContent, { messageId: "assistant-2", content: "Kế hoạch gợi ý:\nĐi sớm." }));

    expect(unstructuredHtml).not.toContain("Các mục trong câu trả lời");
    expect(unstructuredHtml).not.toContain("answer-assistant-1-section");
    expect(firstAnswerHtml).toContain('href="#answer-assistant-1-section-0"');
    expect(firstAnswerHtml).toContain('id="answer-assistant-1-section-0"');
    expect(secondAnswerHtml).toContain('href="#answer-assistant-2-section-0"');
    expect(secondAnswerHtml).toContain('id="answer-assistant-2-section-0"');
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

  test("renders delete affordance and confirmation copy for chat sessions", async () => {
    const { AiAskComposer } = await import("@/features/ai/ai-ask-composer");
    const html = renderToStaticMarkup(
      createElement(AiAskComposer, {
        initialConversationId: "conversation-1",
        initialSessions: [{ id: "conversation-1", preview: "Hà Nội đi Huế?", updatedAt: new Date("2026-07-07T00:00:00.000Z") }],
        deleteConversationAction: async () => ({ success: true }),
      }),
    );

    expect(html).toContain("Xoá");
    expect(html).toContain("Xoá cuộc trò chuyện: Hà Nội đi Huế?");
  });

  test("does not render delete affordance without a delete action", async () => {
    const { AiAskComposer } = await import("@/features/ai/ai-ask-composer");
    const html = renderToStaticMarkup(
      createElement(AiAskComposer, {
        initialConversationId: "conversation-1",
        initialSessions: [{ id: "conversation-1", preview: "Hà Nội đi Huế?", updatedAt: new Date("2026-07-07T00:00:00.000Z") }],
      }),
    );

    expect(html).not.toContain("Xoá cuộc trò chuyện: Hà Nội đi Huế?");
  });

  test("composer source keeps delete pending, failure, and active-session clearing contracts", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");
    const listSource = readFileSync("src/features/chat-trips/conversation-list.tsx", "utf8");

    expect(listSource).toContain("window.confirm");
    expect(listSource).toContain("Tin nhắn, ảnh đính kèm và các chi tiết chuyến đi đã ghi nhớ");
    expect(source).toContain("sessionActionsDisabled = isPending || Boolean(deletingConversationId)");
    expect(source).toContain("deletingConversationIdRef.current");
    expect(source).toContain("Vui lòng chờ câu trả lời hiện tại hoàn tất trước khi xoá cuộc trò chuyện");
    expect(source).toContain("Vui lòng chờ thao tác xoá cuộc trò chuyện hoàn tất trước khi đổi hội thoại.");
    expect(source).toContain("Không thể xoá cuộc trò chuyện lúc này. Vui lòng thử lại.");
    expect(source).toContain("if (result.reason === \"not_found\")");
    expect(source).toContain("function clearActiveConversation()");
    expect(source).toContain("setSessions((currentSessions) => currentSessions.filter((session) => session.id !== id))");
    expect(source).toContain("if (id === conversationId)");
    expect(source).toContain("router.push(buildCanonicalAiAskUrl(undefined, activeTripProjectId))");
  });

  test("composer source keeps delete trip project pending, failure, and active-project cleanup contracts", () => {
    const source = readFileSync("src/features/ai/ai-ask-composer.tsx", "utf8");
    const pageSource = readFileSync("src/app/ai-ask/page.tsx", "utf8");

    expect(pageSource).toContain("deleteTripProjectAction={deleteTripProjectAction}");
    expect(source).toContain("deleteTripProjectAction?: DeleteTripProjectAction");
    expect(source).toContain("window.confirm(`Xoá dự án chuyến đi");
    expect(source).toContain("các cuộc trò chuyện liên kết và thông tin ngữ cảnh đã lưu sẽ bị xóa");
    expect(source).toContain("projectActionsDisabled = isPending || Boolean(deletingConversationId) || Boolean(deletingTripProjectId)");
    expect(source).toContain("deletingTripProjectIdRef.current");
    expect(source).toContain("Vui lòng chờ câu trả lời hiện tại hoàn tất trước khi xoá dự án chuyến đi.");
    expect(source).toContain("Không thể xoá dự án chuyến đi lúc này. Vui lòng thử lại.");
    expect(source).toContain("setTripProjects((currentProjects) => currentProjects.filter((project) => project.id !== projectId))");
    expect(source).toContain("setMessages([])");
    expect(source).toContain("setConversationId(undefined)");
    expect(source).toContain("setSessionSheetOpen(false)");
    expect(source).toContain("reconcileSelection();");
  });

  test("conversation deletion source locks before counting cascade audit rows", () => {
    const source = readFileSync("src/features/chat-trips/conversations.ts", "utf8");
    const deleteSource = source.slice(source.indexOf("export async function deleteOwnedConversation"));

    expect(deleteSource).toContain(".for(\"update\")");
    expect(deleteSource.indexOf(".for(\"update\")")).toBeLessThan(deleteSource.indexOf("const conversationMessages"));
  });

  test("trip project deletion source locks before counting and deleting linked conversation rows", () => {
    const source = readFileSync("src/features/chat-trips/trip-projects.ts", "utf8");
    const deleteSource = source.slice(source.indexOf("export async function deleteOwnedTripProject"));

    expect(deleteSource).toContain(".for(\"update\")");
    expect(deleteSource.indexOf(".for(\"update\")")).toBeLessThan(deleteSource.indexOf("const [linkedConversationCount]"));
    expect(deleteSource.indexOf("const [linkedConversationCount]")).toBeLessThan(deleteSource.indexOf(".delete(conversations)"));
    expect(deleteSource).toContain("linkedConversationsDeleted");
    expect(deleteSource).not.toContain("linkedConversationsDetached");
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

  test("loads ordered assistant provenance for owned conversation history only", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const [otherConversation] = await testDb.insert(conversations).values({ userId: "user-2" }).returning({ id: conversations.id });
    const [userMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "user", content: "Huế?" }).returning({ id: messages.id });
    const [assistantMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "assistant", content: "Nên đi." }).returning({ id: messages.id });
    const [otherUserMessage] = await testDb.insert(messages).values({ conversationId: otherConversation.id, userId: "user-2", role: "user", content: "Private" }).returning({ id: messages.id });
    const [otherAssistantMessage] = await testDb.insert(messages).values({ conversationId: otherConversation.id, userId: "user-2", role: "assistant", content: "Private answer" }).returning({ id: messages.id });
    await testDb.insert(assistantResponseProvenance).values([
      { userId: "user-1", conversationId: conversation.id, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id, sourceCategory: "web", rank: 2, verificationStatus: "unverified", usedInPrompt: true, citedInAnswer: false, sourceSnapshot: { title: "Web Huế", url: "https://hue.example" } },
      { userId: "user-1", conversationId: conversation.id, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id, sourceCategory: "knowledge", rank: 1, verificationStatus: "verified", usedInPrompt: true, citedInAnswer: false, sourceSnapshot: { title: "Nguồn duyệt Huế", confidence: "curated" } },
      { userId: "user-2", conversationId: otherConversation.id, userMessageId: otherUserMessage.id, assistantMessageId: otherAssistantMessage.id, sourceCategory: "knowledge", rank: 1, verificationStatus: "verified", usedInPrompt: true, citedInAnswer: false, sourceSnapshot: { title: "Nguồn riêng user-2" } },
    ]);
    const { getOwnedConversation } = await import("@/features/chat-trips/conversations");

    const result = await getOwnedConversation(conversation.id);
    const assistant = result?.messages.find((message) => message.role === "assistant");

    expect(assistant?.provenance.map((item) => item.title)).toEqual(["Nguồn duyệt Huế", "Web Huế"]);
    expect(assistant?.provenance.map((item) => item.sourceCategory)).toEqual(["knowledge", "web"]);
    expect(JSON.stringify(result)).not.toContain("Nguồn riêng user-2");
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
    vi.doMock("@/features/retrieval/web-search", () => ({
      searchWebForSourceBundle: vi.fn().mockResolvedValue({
        ok: false,
        code: "low_quality_results",
        attempt: { provider: "tavily", mechanism: "search", latencyMs: 12, status: "failure", errorCode: "low_quality_results" },
      }),
      captureWebSearchResults: vi.fn().mockResolvedValue(undefined),
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
    expect(await response.text()).not.toContain('"type":"preparing"');
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
    expect(savedUsageEvents).toHaveLength(2);
    expect(findUsageEvent(savedUsageEvents, "web_search_fallback", "tavily")).toMatchObject({ status: "failure", model: "search", errorCode: "low_quality_results" });
    expect(findUsageEvent(savedUsageEvents, "ai_ask_initial_answer", "ai_gateway")).toMatchObject({ status: "failure", errorCode: "gateway_http_error", model: "cx/gpt-5.5-500", aiGatewayModelId: "ai-ask-500-model" });
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
    expect(savedUsageEvents).toHaveLength(2);
    expect(findUsageEvent(savedUsageEvents, "web_search_fallback", "tavily")).toMatchObject({ status: "failure", model: "search", errorCode: "low_quality_results" });
    expect(findUsageEvent(savedUsageEvents, "ai_ask_initial_answer", "ai_gateway")).toMatchObject({ status: "failure", errorCode: "gateway_network_error" });
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
    const body = await response.text();
    const savedMessages = await testDb.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(asc(messages.createdAt), asc(messages.id));
    const gatewayMessages = getGatewayRequestMessages(fetchMock, 0);

    expect(response.status).toBe(200);
    expect(body.indexOf('{"type":"preparing"')).toBeGreaterThan(-1);
    expect(body.indexOf('{"type":"preparing"')).toBeLessThan(body.indexOf('{"type":"delta"'));
    expect(savedMessages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: "user", content: "Hà Nội đi Huế 5 ngày?" },
      { role: "assistant", content: "Kế hoạch gợi ý:\nNên chia chặng." },
      { role: "user", content: "Ngày thứ 3 nên nghỉ ở đâu?" },
      { role: "assistant", content: expect.stringContaining("chưa thể xác minh thông tin hiện tại từ nguồn bên ngoài") },
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
      { role: "assistant", content: expect.stringContaining("chưa thể xác minh thông tin hiện tại từ nguồn bên ngoài") },
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
      { role: "assistant", content: expect.stringContaining("chưa thể xác minh thông tin hiện tại từ nguồn bên ngoài") },
    ]);
    expect(savedUsageEvents).toHaveLength(2);
    expect(findUsageEvent(savedUsageEvents, "web_search_fallback", "tavily")).toMatchObject({ status: "failure", model: "search", errorCode: "low_quality_results" });
    expect(findUsageEvent(savedUsageEvents, "ai_ask_initial_answer", "ai_gateway")).toMatchObject({ status: "success", completionTokens: 900 });
  });

  test("records safe Tavily success usage during AI Ask without raw web content in usage rows", async () => {
    await createTestUser("user-1");
    await createDefaultAiAskModel({ supportsStreaming: true });
    vi.doMock("@/features/retrieval/web-search", () => ({
      searchWebForSourceBundle: vi.fn().mockResolvedValue({
        ok: true,
        attempt: { provider: "tavily", mechanism: "search", latencyMs: 34, status: "success", errorCode: null },
        results: [{
          query: "Giá vé Huế hiện tại?",
          title: "Official Hue Ticket",
          url: "https://hue.gov.vn/ticket",
          snippet: "Giá vé chính thức",
          provider: "tavily",
          providerScore: 0.8,
          checkedAt: new Date("2026-07-09T10:00:00.000Z"),
          sourceType: "official",
          confidence: "unverified",
          triggerReason: "freshness_sensitive_request",
          rank: 1,
        }],
      }),
      captureWebSearchResults: vi.fn().mockResolvedValue(undefined),
    }));
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"choices":[{"delta":{"content":"Cần kiểm tra nguồn chính thức."}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const formData = new FormData();
    formData.set("question", "Giá vé Huế hiện tại?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    await response.text();
    const savedUsageEvents = await testDb.select().from(aiUsageEvents);
    const webUsage = findUsageEvent(savedUsageEvents, "web_search_fallback", "tavily");

    expect(response.status).toBe(200);
    expect(webUsage).toMatchObject({
      userId: "user-1",
      purpose: "web_search_fallback",
      provider: "tavily",
      model: "search",
      promptVersion: "web_search_fallback_v1",
      status: "success",
      latencyMs: 34,
      errorCode: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      estimatedTotalCostMicros: null,
    });
    expect(JSON.stringify(webUsage)).not.toContain("Giá vé Huế hiện tại");
    expect(JSON.stringify(webUsage)).not.toContain("Giá vé chính thức");
    expect(JSON.stringify(webUsage)).not.toContain("Official Hue Ticket");
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
    expect(savedMessages[1]).toMatchObject({ role: "assistant", content: expect.stringContaining("chưa thể xác minh thông tin hiện tại từ nguồn bên ngoài") });
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
    expect(savedMessages[1]).toMatchObject({ role: "assistant", content: expect.stringContaining("chưa thể xác minh thông tin hiện tại từ nguồn bên ngoài") });
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
    expect(body).not.toContain('{"type":"delta","content":"Kế hoạch "}');
    expect(body).toContain("chưa thể xác minh thông tin hiện tại từ nguồn bên ngoài");
    expect(body).toContain('{"type":"done"');
    expect(savedMessages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: "user", content: "Ảnh này có phù hợp cho chuyến Hà Giang không?" },
      { role: "assistant", content: expect.stringContaining("chưa thể xác minh thông tin hiện tại từ nguồn bên ngoài") },
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
    expect(savedUsageEvents).toHaveLength(2);
    expect(findUsageEvent(savedUsageEvents, "web_search_fallback", "tavily")).toMatchObject({ status: "failure", model: "search", errorCode: "low_quality_results" });
    expect(findUsageEvent(savedUsageEvents, "ai_ask_initial_answer", "ai_gateway")).toMatchObject({
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
    expect(body).not.toContain('{"type":"delta","content":"Một phần"}');
    expect(body).toContain('{"type":"error"');
    expect(savedMessages.map((message) => message.role)).toEqual(["user"]);
    expect(savedUsageEvents).toHaveLength(2);
    expect(findUsageEvent(savedUsageEvents, "web_search_fallback", "tavily")).toMatchObject({ status: "failure", model: "search", errorCode: "low_quality_results" });
    expect(findUsageEvent(savedUsageEvents, "ai_ask_initial_answer", "ai_gateway")).toMatchObject({ status: "failure", errorCode: "gateway_stream_failed" });
    await expect(testDb.select().from(assistantRetrievalDecisions)).resolves.toHaveLength(0);
    await expect(testDb.select().from(assistantResponseProvenance)).resolves.toHaveLength(0);
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
    expect(savedUsageEvents).toHaveLength(2);
    expect(findUsageEvent(savedUsageEvents, "web_search_fallback", "tavily")).toMatchObject({ status: "failure", model: "search", errorCode: "low_quality_results" });
    expect(findUsageEvent(savedUsageEvents, "ai_ask_initial_answer", "ai_gateway")).toMatchObject({ status: "failure", errorCode: "invalid_gateway_response" });
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
