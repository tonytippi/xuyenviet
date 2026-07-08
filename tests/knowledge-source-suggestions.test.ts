import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, auditEvents, knowledgeCards, knowledgeCardSources, knowledgeSourceSuggestions, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";

import { testDb } from "./helpers/db";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

async function createUser(userId: string, roles: UserRole[] = []) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
  if (roles.length > 0) await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
}

async function createExtractionModel(values: Partial<typeof aiGatewayModels.$inferInsert> = {}) {
  const [model] = await testDb
    .insert(aiGatewayModels)
    .values({
      id: values.id ?? "suggest-model",
      gatewayModelName: values.gatewayModelName ?? "cx/suggest",
      displayLabel: values.displayLabel ?? "Suggest model",
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
      pricingCurrency: "USD",
      inputTokenPriceMicros: 1_000_000,
      outputTokenPriceMicros: 2_000_000,
      pricingUnitTokens: 1_000_000,
      pricingVersion: "test-v1",
      pricingEffectiveAt: new Date("2026-07-08T00:00:00.000Z"),
    })
    .returning();
  return model;
}

async function createUrlSource(userId: string, rawText = "Nguồn URL mô tả điểm dừng an toàn cho gia đình trên cung Huế - Đà Nẵng.") {
  const [source] = await testDb
    .insert(sources)
    .values({
      id: `source-${crypto.randomUUID()}`,
      kind: "url",
      url: "https://example.com/travel-note",
      canonicalUrl: "https://example.com/travel-note",
      label: "Nguồn URL du lịch",
      publisher: "Example Travel",
      collectedDate: "2026-07-08",
      sourceType: "curated",
      verificationStatus: "unverified",
      official: false,
      partner: false,
      submittedByUserId: userId,
    })
    .returning();
  await testDb.insert(rawSourceMaterial).values({ sourceId: source.id, rawText, rawMetadata: { provider_payload: "hidden-provider" } });
  return source;
}

async function createCandidate(userId: string, values: Partial<typeof knowledgeCards.$inferInsert> = {}) {
  const [card] = await testDb
    .insert(knowledgeCards)
    .values({
      id: values.id ?? `card-${crypto.randomUUID()}`,
      status: values.status ?? "approved",
      type: values.type ?? "place",
      title: values.title ?? "Điểm dừng cũ ở Huế",
      locationName: values.locationName ?? "Huế",
      routeSegment: values.routeSegment ?? "Huế - Đà Nẵng",
      summary: values.summary ?? "Thông tin cũ cần được so sánh với URL mới.",
      practicalDetails: values.practicalDetails ?? {},
      tags: values.tags ?? ["hue"],
      confidence: values.confidence ?? "curated",
      freshnessSensitive: values.freshnessSensitive ?? false,
      needsReview: values.needsReview ?? false,
      aiPromptVersion: values.aiPromptVersion ?? "seed",
      createdByUserId: userId,
    })
    .returning();
  return card;
}

function mockGatewayJson(content: string, usage = { prompt_tokens: 130, completion_tokens: 70, total_tokens: 200 }) {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ model: "cx/suggest", choices: [{ message: { content } }], usage }), { status: 200, headers: { "content-type": "application/json" } }));
}

describe("knowledge source suggestions", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test("operator persists create suggestion as review-needed source-linked draft", async () => {
    await createUser("create-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "create-operator", email: "create-operator@example.com" } });
    await createExtractionModel();
    const source = await createUrlSource("create-operator");
    mockGatewayJson(JSON.stringify({ suggestions: [{ action: "create", rationale: "Nguồn có một điểm dừng mới.", draft: { type: "place", title: "Điểm dừng gia đình ở Huế", location_name: "Huế", route_segment: "Huế - Đà Nẵng", summary: "Điểm dừng phù hợp để gia đình kiểm tra trước khi đưa vào lịch trình.", practical_details: { tips: ["Duyệt lại tiện ích trước khi dùng"] }, tags: ["family"], confidence: "curated", freshness_sensitive: false } }] }));
    const { suggestKnowledgeFromSourceUrl } = await import("@/features/knowledge/actions");

    const result = await suggestKnowledgeFromSourceUrl(source.id);

    expect(result).toMatchObject({ sourceId: source.id, suggestionCount: 1, actions: ["create"] });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ status: "draft", needsReview: true, confidence: "unverified", aiPromptVersion: "source_knowledge_suggestion_v1" }]);
    await expect(testDb.select().from(knowledgeCardSources)).resolves.toMatchObject([{ sourceId: source.id, supportLevel: "primary" }]);
    await expect(testDb.select().from(knowledgeSourceSuggestions)).resolves.toMatchObject([{ sourceId: source.id, action: "create" }]);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "success", promptVersion: "source_knowledge_suggestion_v1" }]);
    const audits = await testDb.select().from(auditEvents);
    expect(audits).toMatchObject([{ targetType: "knowledge_source_suggestion", targetId: source.id }]);
    expect(JSON.stringify(audits)).not.toContain("hidden-provider");
  });

  test("update and conflict suggestions create drafts without mutating target cards", async () => {
    await createUser("update-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "update-operator", email: "update-operator@example.com" } });
    await createExtractionModel();
    const source = await createUrlSource("update-operator");
    const target = await createCandidate("update-operator", { title: "Bãi đậu xe cũ" });
    mockGatewayJson(JSON.stringify({ suggestions: [{ action: "update", target_card_id: target.id, before_summary: "Thông tin cũ về bãi xe.", after_summary: "Đề xuất bổ sung tiện ích mới.", rationale: "Nguồn mới phong phú hơn.", draft: { type: "parking", title: "Bãi đậu xe cập nhật ở Huế", location_name: "Huế", summary: "Bản nháp cập nhật tiện ích bãi xe để vận hành kiểm tra.", practical_details: { parking_notes: ["Kiểm tra lại sức chứa"] }, tags: ["parking"], confidence: "curated", freshness_sensitive: true } }, { action: "conflict", target_card_id: target.id, conflict_summary: "Nguồn mới khác với ghi chú cũ về bãi xe.", draft: { type: "parking", title: "Xung đột thông tin bãi xe Huế", location_name: "Huế", summary: "Bản nháp ghi nhận xung đột cần vận hành đối chiếu.", practical_details: { warnings: ["Không dùng cho khách trước khi duyệt"] }, tags: ["conflict"], confidence: "unverified", freshness_sensitive: true } }] }));
    const { suggestKnowledgeFromSourceUrl } = await import("@/features/knowledge/actions");

    await suggestKnowledgeFromSourceUrl(source.id);

    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, target.id))).resolves.toMatchObject([{ title: "Bãi đậu xe cũ", status: "approved" }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(3);
    await expect(testDb.select().from(knowledgeSourceSuggestions)).resolves.toMatchObject([{ action: "update", targetCardId: target.id }, { action: "conflict", targetCardId: target.id }]);
    await expect(testDb.select().from(knowledgeCardSources).where(eq(knowledgeCardSources.supportLevel, "primary"))).resolves.toHaveLength(2);
  });

  test("duplicate and no_action persist non-retrievable trace records without card changes", async () => {
    await createUser("trace-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "trace-operator", email: "trace-operator@example.com" } });
    await createExtractionModel();
    const source = await createUrlSource("trace-operator");
    const target = await createCandidate("trace-operator");
    mockGatewayJson(JSON.stringify({ suggestions: [{ action: "duplicate", target_card_id: target.id, rationale: "Nguồn trùng với thẻ hiện có." }, { action: "no_action", rationale: "Không có tri thức road-trip đủ rõ." }] }));
    const { suggestKnowledgeFromSourceUrl } = await import("@/features/knowledge/actions");

    const result = await suggestKnowledgeFromSourceUrl(source.id);

    expect(result).toMatchObject({ suggestionCount: 2, draftIds: [], actions: ["duplicate", "no_action"] });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeSourceSuggestions)).resolves.toMatchObject([{ action: "duplicate", targetCardId: target.id }, { action: "no_action", targetCardId: null }]);

    const { listKnowledgeSourceSuggestionTraces } = await import("@/features/knowledge/suggestions");
    await expect(listKnowledgeSourceSuggestionTraces(source.id)).resolves.toMatchObject([
      { action: "duplicate", targetCardId: target.id, suggestedCardId: null },
      { action: "no_action", targetCardId: null, suggestedCardId: null },
    ]);

    mockGatewayJson(JSON.stringify({ suggestions: [{ action: "no_action", rationale: "Vẫn chưa có tri thức mới." }] }));
    await expect(suggestKnowledgeFromSourceUrl(source.id)).resolves.toMatchObject({ suggestionCount: 1, draftIds: [], actions: ["no_action"] });
  });

  test("invalid action relationships, missing summaries, and raw metadata leaks are rejected", async () => {
    await createUser("invalid-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "invalid-operator", email: "invalid-operator@example.com" } });
    await createExtractionModel();
    const source = await createUrlSource("invalid-operator");
    const target = await createCandidate("invalid-operator");
    const { suggestKnowledgeFromSourceUrl } = await import("@/features/knowledge/actions");

    mockGatewayJson(JSON.stringify({ suggestions: [{ action: "update", target_card_id: target.id, before_summary: "Thông tin cũ.", draft: { type: "place", title: "Thiếu after summary", location_name: "Huế", summary: "Bản nháp thiếu tóm tắt sau cập nhật.", practical_details: {}, tags: [], confidence: "curated", freshness_sensitive: false } }] }));
    await expect(suggestKnowledgeFromSourceUrl(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "success" }]);

    mockGatewayJson(JSON.stringify({ suggestions: [{ action: "create", target_card_id: target.id, rationale: "hidden-provider", draft: { type: "place", title: "Rò rỉ metadata", location_name: "Huế", summary: "Bản nháp có rationale không an toàn.", practical_details: {}, tags: [], confidence: "curated", freshness_sensitive: false } }] }));
    await expect(suggestKnowledgeFromSourceUrl(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });

    mockGatewayJson(JSON.stringify({ suggestions: [{ action: "no_action", target_card_id: target.id, rationale: "Không có tri thức mới." }] }));
    const result = await suggestKnowledgeFromSourceUrl(source.id);

    expect(result).toMatchObject({ actions: ["no_action"], draftIds: [] });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeSourceSuggestions)).resolves.toMatchObject([{ action: "no_action", targetCardId: null, suggestedCardId: null }]);
  });

  test("over-limit suggestions and copied raw snippets are rejected without partial persistence", async () => {
    await createUser("privacy-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "privacy-operator", email: "privacy-operator@example.com" } });
    await createExtractionModel();
    const source = await createUrlSource("privacy-operator", "Hue-Da Nang parking tip needs operator review before traveler use.");
    const validDraft = { type: "place", title: "Điểm dừng kiểm tra", location_name: "Huế", summary: "Bản nháp an toàn để vận hành kiểm tra.", practical_details: {}, tags: [], confidence: "curated", freshness_sensitive: false };
    const { suggestKnowledgeFromSourceUrl } = await import("@/features/knowledge/actions");

    mockGatewayJson(JSON.stringify({ suggestions: Array.from({ length: 13 }, () => ({ action: "create", draft: validDraft })) }));
    await expect(suggestKnowledgeFromSourceUrl(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeSourceSuggestions)).resolves.toHaveLength(0);

    mockGatewayJson(JSON.stringify({ suggestions: [{ action: "create", draft: { ...validDraft, summary: "Gợi ý này chép Hue Da Nang parking tip needs operator review từ nguồn thô." } }] }));
    await expect(suggestKnowledgeFromSourceUrl(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeSourceSuggestions)).resolves.toHaveLength(0);
  });

  test("unsupported source, unavailable model, invalid output, and provider failure do not mutate cards", async () => {
    await createUser("failure-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "failure-operator", email: "failure-operator@example.com" } });
    const [textSource] = await testDb.insert(sources).values({ kind: "copied_post", label: "Copied", sourceType: "community", submittedByUserId: "failure-operator" }).returning();
    await testDb.insert(rawSourceMaterial).values({ sourceId: textSource.id, rawText: "raw" });
    const { suggestKnowledgeFromSourceUrl } = await import("@/features/knowledge/actions");

    await expect(suggestKnowledgeFromSourceUrl(textSource.id)).rejects.toMatchObject({ code: "unsupported_material" });
    expect(fetch).not.toHaveBeenCalled();

    const source = await createUrlSource("failure-operator");
    await expect(suggestKnowledgeFromSourceUrl(source.id)).rejects.toMatchObject({ code: "model_unavailable" });
    await createExtractionModel();
    mockGatewayJson(JSON.stringify({ suggestions: [{ action: "create", draft: { type: "place", title: "Thiếu dữ liệu" } }] }));
    await expect(suggestKnowledgeFromSourceUrl(source.id)).rejects.toMatchObject({ code: "invalid_model_output" });
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "success" }]);

    const otherSource = await createUrlSource("failure-operator");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "provider failure" } }), { status: 200 }));
    await expect(suggestKnowledgeFromSourceUrl(otherSource.id)).rejects.toMatchObject({ code: "provider_failed" });
    await expect(testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.status, "failure"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeSourceSuggestions)).resolves.toHaveLength(0);
  });

  test("traveler is denied before lookup, provider call, usage, audit, or mutation", async () => {
    await createUser("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    const { suggestKnowledgeFromSourceUrl } = await import("@/features/knowledge/actions");

    await expect(suggestKnowledgeFromSourceUrl("missing-source")).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });
});
