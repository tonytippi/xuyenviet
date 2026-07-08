import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sources, userRoles, users, type KnowledgeConfidence, type UserRole } from "@/db/schema";

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

async function createSource(userId: string, values: Partial<typeof sources.$inferInsert> = {}) {
  const [source] = await testDb
    .insert(sources)
    .values({
      id: values.id ?? `source-${crypto.randomUUID()}`,
      kind: values.kind ?? "copied_post",
      url: values.url,
      canonicalUrl: values.canonicalUrl,
      label: values.label ?? "Nguồn cộng đồng an toàn",
      publisher: values.publisher ?? "Nhóm du lịch",
      collectedDate: values.collectedDate ?? "2026-07-08",
      sourceType: values.sourceType ?? "community",
      verificationStatus: values.verificationStatus ?? "unverified",
      official: values.official ?? false,
      partner: values.partner ?? false,
      submittedByUserId: userId,
    })
    .returning();

  await testDb.insert(rawSourceMaterial).values({
    sourceId: source.id,
    rawText: "Số điện thoại riêng 0901234567 và ghi chú thô không được xuất hiện trong review UI.",
    rawMetadata: { provider_payload: "hidden-provider-data" },
  });

  return source;
}

async function createDraft(userId: string, values: Partial<typeof knowledgeCards.$inferInsert> = {}, sourceValues: Partial<typeof sources.$inferInsert> = {}) {
  const source = await createSource(userId, sourceValues);
  const [draft] = await testDb
    .insert(knowledgeCards)
    .values({
      id: values.id ?? `draft-${crypto.randomUUID()}`,
      status: values.status ?? "draft",
      type: values.type ?? "food",
      title: values.title ?? "Quán ăn gia đình ở Huế",
      locationName: values.locationName ?? "Huế",
      routeSegment: values.routeSegment ?? "Đà Nẵng - Huế",
      summary: values.summary ?? "Bản nháp cần được vận hành kiểm tra trước khi phê duyệt ở story sau.",
      practicalDetails: values.practicalDetails ?? { tips: ["Kiểm tra giờ mở cửa"] },
      tags: values.tags ?? ["hue", "food"],
      confidence: values.confidence ?? "community",
      freshnessSensitive: values.freshnessSensitive ?? true,
      needsReview: values.needsReview ?? true,
      aiPromptVersion: values.aiPromptVersion ?? "source_knowledge_draft_extraction_v1",
      createdByUserId: userId,
    })
    .returning();
  await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: draft.id, sourceId: source.id, supportLevel: "primary" });

  return { draft, source };
}

describe("knowledge draft review", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test("operator review queue lists draft fields and safe source metadata without raw source material", async () => {
    await createUser("review-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "review-operator", email: "review-operator@example.com" } });
    await createDraft("review-operator");
    const { listKnowledgeDraftsForReview } = await import("@/features/knowledge/review");

    const drafts = await listKnowledgeDraftsForReview();

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      status: "draft",
      needsReview: true,
      title: "Quán ăn gia đình ở Huế",
      sources: [{ label: "Nguồn cộng đồng an toàn", kind: "copied_post", collectedDate: "2026-07-08" }],
    });
    const serialized = JSON.stringify(drafts);
    expect(serialized).not.toContain("0901234567");
    expect(serialized).not.toContain("hidden-provider-data");
    expect(serialized).not.toContain("rawText");
    expect(serialized).not.toContain("rawMetadata");
  });

  test("valid edit keeps draft review-needed, preserves source link, clamps community confidence, and records safe audit", async () => {
    await createUser("edit-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "edit-operator", email: "edit-operator@example.com" } });
    const { draft, source } = await createDraft("edit-operator");
    const { updateKnowledgeDraft } = await import("@/features/knowledge/review");

    await updateKnowledgeDraft(draft.id, {
      type: "warning",
      title: "Cảnh báo dừng xe ở Huế",
      locationName: "Huế",
      routeSegment: "Đà Nẵng - Huế",
      summary: "Nội dung đã được biên tập thành bản nháp an toàn để vận hành duyệt tiếp.",
      practicalDetails: { warnings: ["Kiểm tra lại trước khi dùng"] },
      tags: ["hue", "warning"],
      confidence: "official",
      freshnessSensitive: false,
    });

    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, draft.id))).resolves.toMatchObject([
      {
        status: "draft",
        type: "warning",
        title: "Cảnh báo dừng xe ở Huế",
        confidence: "community",
        freshnessSensitive: false,
        needsReview: true,
      },
    ]);
    await expect(testDb.select().from(knowledgeCardSources).where(eq(knowledgeCardSources.knowledgeCardId, draft.id))).resolves.toMatchObject([{ sourceId: source.id }]);
    const audits = await testDb.select().from(auditEvents);
    expect(audits).toMatchObject([{ operation: "update", targetType: "knowledge_draft", targetId: draft.id }]);
    expect(audits[0]?.afterSummary).toContain("Operator edited review-needed draft fields");
    expect(audits[0]?.afterSummary).not.toContain("0901234567");
  });

  test("verified curated source allows curated confidence but not partner or official", async () => {
    await createUser("curated-reviewer", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "curated-reviewer", email: "curated-reviewer@example.com" } });
    const { draft } = await createDraft("curated-reviewer", { confidence: "curated" }, { kind: "url", url: "https://example.com", sourceType: "curated", verificationStatus: "verified" });
    const { updateKnowledgeDraft } = await import("@/features/knowledge/review");

    await updateKnowledgeDraft(draft.id, {
      type: "service",
      title: "Điểm dừng đã kiểm tra",
      locationName: "Huế",
      summary: "Nguồn đã xác minh chỉ cho phép confidence curated trong bước review này.",
      practicalDetails: {},
      tags: [],
      confidence: "partner" satisfies KnowledgeConfidence,
      freshnessSensitive: false,
    });

    await expect(testDb.select({ confidence: knowledgeCards.confidence }).from(knowledgeCards).where(eq(knowledgeCards.id, draft.id))).resolves.toEqual([{ confidence: "curated" }]);
  });

  test("reject sets non-retrievable rejected state, removes draft from default queue, preserves source link, and audits", async () => {
    await createUser("reject-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "reject-operator", email: "reject-operator@example.com" } });
    const { draft, source } = await createDraft("reject-operator");
    const { listKnowledgeDraftsForReview, rejectKnowledgeDraft } = await import("@/features/knowledge/review");

    await rejectKnowledgeDraft(draft.id);

    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, draft.id))).resolves.toMatchObject([{ status: "rejected", needsReview: false }]);
    await expect(listKnowledgeDraftsForReview()).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCardSources).where(eq(knowledgeCardSources.knowledgeCardId, draft.id))).resolves.toMatchObject([{ sourceId: source.id }]);
    await expect(testDb.select().from(auditEvents)).resolves.toMatchObject([{ operation: "update", targetType: "knowledge_draft", targetId: draft.id }]);
  });

  test("invalid edit does not mutate draft or write audit", async () => {
    await createUser("invalid-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "invalid-operator", email: "invalid-operator@example.com" } });
    const { draft } = await createDraft("invalid-operator");
    const { updateKnowledgeDraft } = await import("@/features/knowledge/review");

    await expect(
      updateKnowledgeDraft(draft.id, {
        type: "food",
        title: "",
        locationName: "",
        routeSegment: "",
        summary: "Valid summary but no title or route/location.",
        practicalDetails: "not-json",
        tags: Array.from({ length: 13 }, (_, index) => `tag-${index}`),
        confidence: "community",
        freshnessSensitive: false,
      }),
    ).rejects.toMatchObject({ name: "KnowledgeDraftReviewError", code: "invalid_input" });

    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, draft.id))).resolves.toMatchObject([{ title: draft.title, status: "draft", needsReview: true }]);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("oversized optional route and structured detail fields are rejected without lossy truncation", async () => {
    await createUser("detail-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "detail-operator", email: "detail-operator@example.com" } });
    const { draft } = await createDraft("detail-operator");
    const { updateKnowledgeDraft } = await import("@/features/knowledge/review");

    await expect(
      updateKnowledgeDraft(draft.id, {
        type: "food",
        title: "Bản nháp hợp lệ",
        locationName: "Huế",
        routeSegment: "x".repeat(161),
        summary: "Tóm tắt hợp lệ nhưng cung đường quá dài không được âm thầm xóa.",
        practicalDetails: {},
        tags: [],
        confidence: "community",
        freshnessSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await expect(
      updateKnowledgeDraft(draft.id, {
        type: "food",
        title: "Bản nháp hợp lệ",
        locationName: "Huế",
        summary: "Tóm tắt hợp lệ nhưng chi tiết vượt giới hạn không được cắt bớt.",
        practicalDetails: Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`key-${index}`, "value"])),
        tags: [],
        confidence: "community",
        freshnessSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await expect(
      updateKnowledgeDraft(draft.id, {
        type: "food",
        title: "Bản nháp hợp lệ",
        locationName: "Huế",
        summary: "Tóm tắt hợp lệ nhưng danh sách chi tiết chứa phần tử không hợp lệ.",
        practicalDetails: { tips: ["valid", 42] },
        tags: [],
        confidence: "community",
        freshnessSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, draft.id))).resolves.toMatchObject([{ title: draft.title, practicalDetails: draft.practicalDetails }]);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("unsafe edited safe fields and invalid tags are rejected", async () => {
    await createUser("privacy-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "privacy-operator", email: "privacy-operator@example.com" } });
    const { draft } = await createDraft("privacy-operator");
    const { updateKnowledgeDraft } = await import("@/features/knowledge/review");

    await expect(
      updateKnowledgeDraft(draft.id, {
        type: "service",
        title: "Điểm dừng an toàn",
        locationName: "Huế",
        summary: "Liên hệ 0901234567 để nhận hỗ trợ tại điểm dừng.",
        practicalDetails: {},
        tags: [],
        confidence: "community",
        freshnessSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await expect(
      updateKnowledgeDraft(draft.id, {
        type: "service",
        title: "Điểm dừng an toàn",
        locationName: "Huế",
        summary: "Số điện thoại riêng 0901234567 và ghi chú thô không được xuất hiện trong review UI.",
        practicalDetails: {},
        tags: [],
        confidence: "community",
        freshnessSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await expect(
      updateKnowledgeDraft(draft.id, {
        type: "service",
        title: "Điểm dừng an toàn",
        locationName: "Huế",
        summary: "Tóm tắt hợp lệ để kiểm tra tag quá dài.",
        practicalDetails: {},
        tags: ["valid", "x".repeat(41)],
        confidence: "community",
        freshnessSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, draft.id))).resolves.toMatchObject([{ title: draft.title, summary: draft.summary }]);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("unsafe practical detail keys and raw metadata values are rejected", async () => {
    await createUser("metadata-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "metadata-operator", email: "metadata-operator@example.com" } });
    const { draft } = await createDraft("metadata-operator");
    const { updateKnowledgeDraft } = await import("@/features/knowledge/review");

    await expect(
      updateKnowledgeDraft(draft.id, {
        type: "service",
        title: "Điểm dừng an toàn",
        locationName: "Huế",
        summary: "Tóm tắt hợp lệ để kiểm tra khóa metadata thô.",
        practicalDetails: { provider_payload: "không được lưu" },
        tags: [],
        confidence: "community",
        freshnessSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await expect(
      updateKnowledgeDraft(draft.id, {
        type: "service",
        title: "Điểm dừng an toàn",
        locationName: "Huế",
        summary: "hidden-provider-data",
        practicalDetails: {},
        tags: [],
        confidence: "community",
        freshnessSensitive: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, draft.id))).resolves.toMatchObject([{ title: draft.title, summary: draft.summary }]);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("direct detail lookup excludes drafts without valid source links", async () => {
    await createUser("orphan-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "orphan-operator", email: "orphan-operator@example.com" } });
    const [draft] = await testDb
      .insert(knowledgeCards)
      .values({
        id: "orphan-draft",
        status: "draft",
        type: "food",
        title: "Bản nháp thiếu nguồn",
        locationName: "Huế",
        summary: "Không được mở trực tiếp vì thiếu nguồn an toàn liên kết.",
        practicalDetails: {},
        tags: [],
        confidence: "unverified",
        freshnessSensitive: false,
        needsReview: true,
        aiPromptVersion: "source_knowledge_draft_extraction_v1",
        createdByUserId: "orphan-operator",
      })
      .returning();
    const { getKnowledgeDraftForReview, listKnowledgeDraftsForReview } = await import("@/features/knowledge/review");

    await expect(listKnowledgeDraftsForReview()).resolves.toHaveLength(0);
    await expect(getKnowledgeDraftForReview(draft.id)).resolves.toBeNull();
  });

  test("review detail excludes rejected cards and conflicting sources do not raise confidence ceiling", async () => {
    await createUser("edge-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "edge-operator", email: "edge-operator@example.com" } });
    const { draft, source } = await createDraft("edge-operator");
    const officialSource = await createSource("edge-operator", { id: "official-source", kind: "url", url: "https://official.example", sourceType: "curated", verificationStatus: "verified", official: true });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: draft.id, sourceId: officialSource.id, supportLevel: "conflicting" });
    const { getKnowledgeDraftForReview, rejectKnowledgeDraft, updateKnowledgeDraft } = await import("@/features/knowledge/review");

    await updateKnowledgeDraft(draft.id, {
      type: "warning",
      title: "Cảnh báo từ nguồn cộng đồng",
      locationName: "Huế",
      summary: "Nguồn official chỉ đang conflicting nên không được nâng confidence.",
      practicalDetails: {},
      tags: [],
      confidence: "official",
      freshnessSensitive: false,
    });

    await expect(testDb.select({ confidence: knowledgeCards.confidence }).from(knowledgeCards).where(eq(knowledgeCards.id, draft.id))).resolves.toEqual([{ confidence: "community" }]);
    await expect(testDb.select().from(knowledgeCardSources).where(eq(knowledgeCardSources.knowledgeCardId, draft.id))).resolves.toHaveLength(2);
    await rejectKnowledgeDraft(draft.id);
    await expect(getKnowledgeDraftForReview(draft.id)).resolves.toBeNull();
    await expect(testDb.select().from(knowledgeCardSources).where(eq(knowledgeCardSources.sourceId, source.id))).resolves.toHaveLength(1);
  });

  test("traveler is denied before review lookup, mutation, or audit side effects", async () => {
    await createUser("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    const { listKnowledgeDraftsForReview, updateKnowledgeDraft, rejectKnowledgeDraft } = await import("@/features/knowledge/review");

    await expect(listKnowledgeDraftsForReview()).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(
      updateKnowledgeDraft("missing-draft", {
        type: "food",
        title: "Denied",
        locationName: "Huế",
        summary: "Denied before lookup.",
        practicalDetails: {},
        tags: [],
        confidence: "community",
        freshnessSensitive: false,
      }),
    ).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(rejectKnowledgeDraft("missing-draft")).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });
});
