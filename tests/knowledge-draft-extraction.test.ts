import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, auditEvents, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";
import { buildSourceKnowledgeDraftExtractionMessages, buildSourceKnowledgeSuggestionMessages } from "@/features/ai/prompts";

import { testDb } from "./helpers/db";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

async function createUser(userId: string, roles: UserRole[] = []) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });

  if (roles.length > 0) {
    await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
  }
}

async function createExtractionModel(values: Partial<typeof aiGatewayModels.$inferInsert> = {}) {
  const [model] = await testDb
    .insert(aiGatewayModels)
    .values({
      id: values.id ?? "extract-model",
      gatewayModelName: values.gatewayModelName ?? "cx/extract",
      displayLabel: values.displayLabel ?? "Extract model",
      purpose: "extraction",
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
      pricingCurrency: values.pricingCurrency === undefined ? "USD" : values.pricingCurrency,
      inputTokenPriceMicros: values.inputTokenPriceMicros === undefined ? 1_000_000 : values.inputTokenPriceMicros,
      outputTokenPriceMicros: values.outputTokenPriceMicros === undefined ? 2_000_000 : values.outputTokenPriceMicros,
      pricingUnitTokens: values.pricingUnitTokens ?? 1_000_000,
      pricingVersion: values.pricingVersion ?? "test-v1",
      pricingEffectiveAt: values.pricingEffectiveAt ?? new Date("2026-07-08T00:00:00.000Z"),
    })
    .returning();

  return model;
}

async function createTextSource(userId: string, rawText = "Quán ăn gia đình ở Huế có bãi đậu xe rộng, giá khoảng 80.000đ một món.") {
  const [source] = await testDb
    .insert(sources)
    .values({
      id: `source-${crypto.randomUUID()}`,
      kind: "copied_post",
      label: "Bài cộng đồng",
      sourceType: "community",
      verificationStatus: "unverified",
      official: false,
      partner: false,
      submittedByUserId: userId,
    })
    .returning();
  await testDb.insert(rawSourceMaterial).values({ sourceId: source.id, rawText });

  return source;
}

async function createCuratedTextSource(userId: string, rawText = "Điểm dừng có bãi xe rộng và nhà vệ sinh sạch trên tuyến quốc lộ.") {
  const [source] = await testDb
    .insert(sources)
    .values({
      id: `source-${crypto.randomUUID()}`,
      kind: "url",
      url: "https://example.com/source",
      canonicalUrl: "https://example.com/source",
      label: "Nguồn URL",
      sourceType: "curated",
      verificationStatus: "unverified",
      official: false,
      partner: false,
      submittedByUserId: userId,
    })
    .returning();
  await testDb.insert(rawSourceMaterial).values({ sourceId: source.id, rawText });

  return source;
}

function mockGatewayJson(content: string, usage = { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 }) {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        model: "cx/extract",
        choices: [{ message: { content } }],
        usage,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
}

const orderedStops = Array.from({ length: 32 }, (_, index) => `Điểm dừng ${index + 1}`);

describe("knowledge draft extraction", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test("operator extracts raw source text into draft cards linked to the source", async () => {
    await createUser("operator-user", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("operator-user");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "food",
            title: "Quán ăn gia đình ở Huế",
            location_name: "Huế",
            route_segment: "Đà Nẵng - Huế",
            summary: "Quán phù hợp dừng ăn gia đình, có bãi đậu xe rộng và mức giá cần kiểm tra lại.",
            practical_details: { tips: ["Phù hợp gia đình đi ô tô"], cost_notes: ["Khoảng 80.000đ một món"] },
            tags: ["hue", "family", "parking"],
            confidence: "official",
            freshness_sensitive: true,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    const result = await extractKnowledgeDraftsFromSource(source.id);

    expect(result).toMatchObject({ sourceId: source.id, draftCount: 1 });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([
      {
        status: "draft",
        type: "food",
        title: "Quán ăn gia đình ở Huế",
        confidence: "unverified",
        freshnessSensitive: true,
        needsReview: true,
      },
    ]);
    await expect(testDb.select().from(knowledgeCardSources)).resolves.toMatchObject([{ sourceId: source.id, supportLevel: "primary" }]);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "success", purpose: "extraction", promptVersion: "source_knowledge_draft_extraction_v1" }]);
    const audits = await testDb.select().from(auditEvents);
    expect(audits).toMatchObject([{ targetType: "knowledge_draft_extraction", targetId: source.id }]);
    expect(audits[0]?.afterSummary).not.toContain("80.000đ");
  });

  test("source extraction prompt asks for Vietnamese draft content by default", () => {
    const messages = buildSourceKnowledgeDraftExtractionMessages({
      source: {
        kind: "facebook",
        label: "Bài Facebook cộng đồng",
        publisher: null,
        collectedDate: null,
        sourceType: "community",
        verificationStatus: "unverified",
        official: false,
        partner: false,
      },
      rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh, cần kiểm tra chỗ đậu xe trước khi duyệt.",
    });

    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";
    const userMessage = messages.find((message) => message.role === "user")?.content ?? "";

    expect(systemMessage).toContain("Write all user-facing draft values in natural Vietnamese by default");
    expect(systemMessage).toContain("Keep JSON keys and enum values exactly as specified in English");
    expect(systemMessage).toContain("Paraphrase aggressively");
    expect(systemMessage).toContain("do not copy any phrase");
    expect(systemMessage).toContain("exactly one route_note draft");
    expect(systemMessage).toContain("practical_details.ordered_stops");
    expect(systemMessage).toContain("at most 40 short normalized place or stop labels");
    expect(userMessage).toContain("Tiêu đề ngắn an toàn");
    expect(userMessage).toContain("Tóm tắt sự kiện cần duyệt");
    expect(userMessage).toContain("the_ngan");
    expect(userMessage).toContain('"type":"place"');
    expect(userMessage).not.toContain('"ordered_stops"');
    expect(userMessage).not.toContain("Short safe title");
    expect(userMessage).not.toContain("Reviewable fact summary");
  });

  test("persists all 32 ordered route stops in one community route note", async () => {
    await createUser("route-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "route-operator", email: "route-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("route-operator", "Danh sách điểm dừng ven biển từ Đà Nẵng đến Phú Yên.");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "route_note",
            title: "Tuyến ven biển Đà Nẵng - Phú Yên",
            route_segment: "Đà Nẵng - Phú Yên",
            summary: "Lộ trình cộng đồng cần được operator kiểm tra trước khi dùng.",
            practical_details: { ordered_stops: orderedStops },
            tags: ["ven-bien"],
            confidence: "community",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).resolves.toMatchObject({ draftCount: 1 });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ type: "route_note", practicalDetails: { ordered_stops: orderedStops }, confidence: "community" }]);
  });

  test("normalizes common source list numbering from ordered stops", async () => {
    await createUser("numbered-route-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "numbered-route-operator", email: "numbered-route-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("numbered-route-operator", "33. Bãi Môn 34. Mũi Điện (34) là các điểm ghim ven biển.");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "route_note",
            title: "Tuyến ven biển Phú Yên",
            route_segment: "Tuy Hòa - Vũng Rô",
            summary: "Lộ trình cộng đồng cần được operator kiểm tra trước khi dùng.",
            practical_details: { ordered_stops: ["33. Bãi Môn", "Mũi Điện (34)", "Trạm Y Tế xã Mỹ An (rẽ đường này để tránh đường xấu)", "3.14 Cafe"] },
            tags: ["ven-bien"],
            confidence: "community",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).resolves.toMatchObject({ draftCount: 1 });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ practicalDetails: { ordered_stops: ["Bãi Môn", "Mũi Điện", "Trạm Y Tế xã Mỹ An", "3.14 Cafe"] } }]);
  });

  test("rejects a route note with more than 40 ordered stops without persistence", async () => {
    await createUser("long-route-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "long-route-operator", email: "long-route-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("long-route-operator");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "route_note",
            title: "Tuyến quá dài",
            route_segment: "Đà Nẵng - Phú Yên",
            summary: "Lộ trình vượt giới hạn cần bị từ chối an toàn.",
            practical_details: { ordered_stops: Array.from({ length: 41 }, (_, index) => `Điểm ${index + 1}`) },
            tags: ["ven-bien"],
            confidence: "community",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output", safeDetail: "invalid_practical_details" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("rejects numbered or sentence-like ordered stop labels without persistence", async () => {
    await createUser("unsafe-route-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "unsafe-route-operator", email: "unsafe-route-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("unsafe-route-operator");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "route_note",
            title: "Tuyến không an toàn",
            route_segment: "Đà Nẵng - Phú Yên",
            summary: "Lộ trình cần bị từ chối khi danh sách điểm dừng không phải nhãn ngắn.",
            practical_details: { ordered_stops: ["Rẽ trái tại cầu rồi đi tiếp 5 km"] },
            tags: ["ven-bien"],
            confidence: "community",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output", safeDetail: "invalid_practical_details" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("source suggestion prompt asks for Vietnamese suggestion and draft content by default", () => {
    const messages = buildSourceKnowledgeSuggestionMessages({
      source: {
        kind: "url",
        label: "Nguồn URL du lịch",
        publisher: null,
        collectedDate: null,
        sourceType: "curated",
        verificationStatus: "unverified",
        official: false,
        partner: false,
        canonicalUrl: "https://example.com/source",
      },
      rawText: "Bãi xe phía bắc Huế có điểm dừng phù hợp gia đình, cần kiểm tra sức chứa.",
      candidates: [
        {
          id: "existing-card",
          status: "approved",
          type: "parking",
          title: "Bãi xe cũ ở Huế",
          locationName: "Huế",
          routeSegment: null,
          summary: "Thông tin đã duyệt trước đó.",
          confidence: "curated",
          freshnessSensitive: true,
          tags: ["hue"],
        },
      ],
    });

    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";
    const userMessage = messages.find((message) => message.role === "user")?.content ?? "";

    expect(systemMessage).toContain("Write all user-facing suggestion and draft values in natural Vietnamese by default");
    expect(systemMessage).toContain("Keep JSON keys and enum values exactly as specified in English");
    expect(systemMessage).toContain("Paraphrase aggressively");
    expect(systemMessage).toContain("do not copy any phrase");
    expect(userMessage).toContain("Tóm tắt ngắn trạng thái hiện tại");
    expect(userMessage).toContain("Lý do đề xuất action này");
    expect(userMessage).toContain("Tiêu đề ngắn an toàn");
    expect(userMessage).toContain("the_ngan");
    expect(userMessage).not.toContain("Short safe current-state summary");
    expect(userMessage).not.toContain("Why this action is suggested");
  });

  test("provider failure records safe usage failure and stores no drafts", async () => {
    await createUser("provider-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "provider-operator", email: "provider-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("provider-operator");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "raw provider failure" } }), { status: 200 }));
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ name: "KnowledgeExtractionError", code: "provider_failed" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCardSources)).resolves.toHaveLength(0);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "failure", errorCode: "invalid_gateway_response" }]);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("no active capable model fails before provider calls or side effects", async () => {
    await createUser("no-model-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "no-model-operator", email: "no-model-operator@example.com" } });
    await createExtractionModel({ id: "bad-model", supportsExtraction: false });
    const source = await createTextSource("no-model-operator");
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "model_unavailable" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("screenshot-only source fails safely without provider calls", async () => {
    await createUser("image-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "image-operator", email: "image-operator@example.com" } });
    await createExtractionModel();
    const [source] = await testDb
      .insert(sources)
      .values({ kind: "screenshot", label: "Ảnh chụp nguồn du lịch", sourceType: "curated", verificationStatus: "unverified", submittedByUserId: "image-operator" })
      .returning();
    await testDb.insert(rawSourceMaterial).values({ sourceId: source.id, fileName: "source.png", mimeType: "image/png", byteSize: 1000 });
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "unsupported_material" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(0);
  });

  test("traveler is denied before source lookup, model selection, provider call, usage, draft, or audit side effects", async () => {
    await createUser("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource("missing-source")).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("malformed model output records usage but rolls back draft persistence", async () => {
    await createUser("bad-json-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "bad-json-operator", email: "bad-json-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("bad-json-operator");
    mockGatewayJson(JSON.stringify({ drafts: [{ type: "food", title: "Missing summary" }] }));
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output", safeDetail: "missing_or_invalid_required_field" });
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "success" }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCardSources)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("logs rejected model output only when explicitly enabled for local diagnostics", async () => {
    await createUser("debug-output-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "debug-output-operator", email: "debug-output-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("debug-output-operator");
    const rawOutput = JSON.stringify({ drafts: [{ type: "route_note", title: "Thiếu thông tin" }] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const originalAppEnv = process.env.APP_ENV;
    const originalDebugFlag = process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT;
    process.env.APP_ENV = "local";
    process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT = "true";
    mockGatewayJson(rawOutput);
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    try {
      await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });
      expect(warn).toHaveBeenCalledWith("Knowledge extraction rejected model output", expect.objectContaining({ sourceId: source.id, reason: "missing_or_invalid_required_field", modelOutput: rawOutput }));
    } finally {
      if (originalAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = originalAppEnv;
      if (originalDebugFlag === undefined) delete process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT;
      else process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT = originalDebugFlag;
      warn.mockRestore();
    }
  });

  test("does not log rejected model output outside explicit local diagnostics", async () => {
    await createUser("no-debug-output-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "no-debug-output-operator", email: "no-debug-output-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("no-debug-output-operator");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const originalAppEnv = process.env.APP_ENV;
    const originalDebugFlag = process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT;
    process.env.APP_ENV = "local";
    process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT = "false";
    mockGatewayJson(JSON.stringify({ drafts: [{ type: "route_note", title: "Thiếu thông tin" }] }));
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    try {
      await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });
      expect(warn).not.toHaveBeenCalledWith("Knowledge extraction rejected model output", expect.anything());
    } finally {
      if (originalAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = originalAppEnv;
      if (originalDebugFlag === undefined) delete process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT;
      else process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT = originalDebugFlag;
      warn.mockRestore();
    }
  });

  test("unverified curated source cannot be upgraded to curated confidence by model output", async () => {
    await createUser("curated-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "curated-operator", email: "curated-operator@example.com" } });
    await createExtractionModel();
    const source = await createCuratedTextSource("curated-operator");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "service",
            title: "Trạm dừng tiện ích ven quốc lộ",
            route_segment: "Quốc lộ 1A",
            summary: "Điểm dừng ven tuyến cần được kiểm tra lại tiện ích trước khi duyệt thành tri thức chính thức.",
            practical_details: { tips: ["Kiểm tra lại tiện ích trước khi duyệt"] },
            tags: ["diem-dung"],
            confidence: "curated",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await extractKnowledgeDraftsFromSource(source.id);

    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ confidence: "unverified" }]);
  });

  test("duplicate extraction for the same source fails before a second provider call", async () => {
    await createUser("duplicate-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "duplicate-operator", email: "duplicate-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("duplicate-operator");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "food",
            title: "Quán ăn dừng chân",
            location_name: "Huế",
            summary: "Quán phù hợp để tạo bản nháp đầu tiên cho nguồn này.",
            practical_details: { tips: ["Duyệt lại trước khi dùng"] },
            tags: ["an-uong"],
            confidence: "community",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await extractKnowledgeDraftsFromSource(source.id);
    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "already_extracted" });

    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(1);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(1);
  });

  test("model output with non-boolean freshness or raw source overlap is rejected without draft persistence", async () => {
    await createUser("overlap-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "overlap-operator", email: "overlap-operator@example.com" } });
    await createExtractionModel();
    const rawSnippet = "Đây là một đoạn ghi chú cộng đồng rất dài có số điện thoại 0901234567 và nội dung riêng tư không được sao chép nguyên văn vào trường an toàn.";
    const source = await createTextSource("overlap-operator", rawSnippet);
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "warning",
            title: "Cảnh báo nguồn cộng đồng",
            summary: rawSnippet,
            practical_details: { warnings: [rawSnippet] },
            tags: ["canh-bao"],
            confidence: "community",
            freshness_sensitive: "yes",
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output", safeDetail: "missing_or_invalid_required_field" });
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "success" }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("model output without route or location is rejected", async () => {
    await createUser("missing-location-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "missing-location-operator", email: "missing-location-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("missing-location-operator", "Mẹo chuẩn bị đồ dùng chung cho chuyến đi dài, không nêu địa điểm hoặc cung đường cụ thể.");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "general_travel_tip",
            title: "Mẹo chuẩn bị chuyến đi",
            summary: "Mẹo cần được gắn với một địa điểm hoặc cung đường trước khi lưu thành bản nháp.",
            practical_details: { tips: ["Duyệt lại trước khi dùng"] },
            tags: ["meo-di-duong"],
            confidence: "community",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output", safeDetail: "missing_location_or_route" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("central Vietnam Facebook drafts can infer a safe location fallback when model omits route fields", async () => {
    await createUser("fallback-location-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "fallback-location-operator", email: "fallback-location-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("fallback-location-operator", "Bài chia sẻ kinh nghiệm đi Đà Nẵng và phố cổ Hội An, có nhắc cung Lăng Cô qua đèo Hải Vân.");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "route_note",
            title: "Gợi ý cung miền Trung",
            summary: "Bản nháp cần operator kiểm tra lại trước khi dùng cho lịch trình xuyên Việt.",
            practical_details: { tips: ["Soát lại điều kiện đường trước khi đi"] },
            tags: ["mien-trung"],
            confidence: "community",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).resolves.toMatchObject({ draftCount: 1 });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ locationName: "Đà Nẵng - Hội An", routeSegment: "Đà Nẵng - Hội An" }]);
  });

  test("short raw snippets and phone-like values are rejected from safe draft fields", async () => {
    await createUser("short-snippet-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "short-snippet-operator", email: "short-snippet-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("short-snippet-operator", "Liên hệ 0901234567 khi tới bãi xe phía bắc Huế.");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "parking",
            title: "Bãi xe phía bắc Huế",
            location_name: "Huế",
            summary: "Liên hệ 0901234567 khi tới bãi xe.",
            practical_details: { contact: "0901234567" },
            tags: ["bai-xe"],
            confidence: "community",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output", safeDetail: "unsafe_raw_overlap_or_sensitive_value" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("hotel public contact details are allowed in explicit contact detail fields", async () => {
    await createUser("hotel-contact-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "hotel-contact-operator", email: "hotel-contact-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("hotel-contact-operator", "Khách sạn ven biển Đà Nẵng công bố hotline 0901234567 và email booking@hotel.example cho đặt phòng.");
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "hotel_area",
            title: "Khu khách sạn ven biển Đà Nẵng",
            location_name: "Đà Nẵng",
            summary: "Khu lưu trú ven biển cần operator kiểm tra lại tình trạng phòng và điều kiện đặt trước khi dùng cho khách.",
            practical_details: { booking_contact: ["0901234567", "booking@hotel.example"] },
            tags: ["khach-san"],
            confidence: "community",
            freshness_sensitive: true,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).resolves.toMatchObject({ draftCount: 1 });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([
      { type: "hotel_area", practicalDetails: { booking_contact: ["0901234567", "booking@hotel.example"] } },
    ]);
  });

  test("previous extraction cards block re-extraction even after review is closed", async () => {
    await createUser("reextract-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "reextract-operator", email: "reextract-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("reextract-operator");
    const [rejectedCard] = await testDb
      .insert(knowledgeCards)
      .values({ status: "rejected", needsReview: false, type: "food", title: "Rejected", locationName: "Huế", summary: "Rejected summary", aiPromptVersion: "source_knowledge_draft_extraction_v1", createdByUserId: "reextract-operator" })
      .returning();
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: rejectedCard.id, sourceId: source.id });
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "already_extracted" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(1);
  });

  test("database rejects non-draft review and invalid knowledge linkage constraints", async () => {
    await createUser("constraint-user", ["operator"]);
    const source = await createTextSource("constraint-user");

    await expect(
      testDb.insert(knowledgeCards).values({
        id: "bad-card",
        status: "draft",
        type: "food",
        title: "Bad card",
        summary: "Bad summary",
        needsReview: false,
        aiPromptVersion: "source_knowledge_draft_extraction_v1",
        createdByUserId: "constraint-user",
      }),
    ).rejects.toThrow();

    const [card] = await testDb
      .insert(knowledgeCards)
      .values({ type: "food", title: "Good card", summary: "Good summary", aiPromptVersion: "source_knowledge_draft_extraction_v1", createdByUserId: "constraint-user" })
      .returning();

    await expect(testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "invalid" as "primary" })).rejects.toThrow();
    await expect(
      testDb.insert(knowledgeCards).values({ type: "food", title: "Bad details", summary: "Bad details", practicalDetails: [] as unknown as Record<string, unknown>, aiPromptVersion: "source_knowledge_draft_extraction_v1", createdByUserId: "constraint-user" }),
    ).rejects.toThrow();
    await expect(
      testDb.insert(knowledgeCards).values({ type: "food", title: "Bad tags", summary: "Bad tags", tags: {} as unknown as string[], aiPromptVersion: "source_knowledge_draft_extraction_v1", createdByUserId: "constraint-user" }),
    ).rejects.toThrow();
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, card.id))).resolves.toHaveLength(1);
  });
});
