import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, auditEvents, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";

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

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "success" }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCardSources)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
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

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "success" }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("model output without route or location is rejected", async () => {
    await createUser("missing-location-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "missing-location-operator", email: "missing-location-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("missing-location-operator");
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

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
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

    await expect(extractKnowledgeDraftsFromSource(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("non-review linked cards do not block a new extraction", async () => {
    await createUser("reextract-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "reextract-operator", email: "reextract-operator@example.com" } });
    await createExtractionModel();
    const source = await createTextSource("reextract-operator");
    const [rejectedCard] = await testDb
      .insert(knowledgeCards)
      .values({ status: "rejected", needsReview: false, type: "food", title: "Rejected", locationName: "Huế", summary: "Rejected summary", aiPromptVersion: "source_knowledge_draft_extraction_v1", createdByUserId: "reextract-operator" })
      .returning();
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: rejectedCard.id, sourceId: source.id });
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "food",
            title: "Quán ăn mới để duyệt",
            location_name: "Huế",
            summary: "Bản nháp mới cần được duyệt lại từ nguồn đã từng bị từ chối.",
            practical_details: { tips: ["Duyệt lại trước khi dùng"] },
            tags: ["an-uong"],
            confidence: "community",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromSource(source.id)).resolves.toMatchObject({ sourceId: source.id, draftCount: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(2);
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
