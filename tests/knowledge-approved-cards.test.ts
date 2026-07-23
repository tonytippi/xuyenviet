import { beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { auditEvents, knowledgeCards, knowledgeCardSearchDocuments, knowledgeCardSources, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";

import { testDb } from "./helpers/db";
import { seedKnowledgeCardEvidence, seedSourceCaptureVersion } from "./helpers/source-captures";

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
      eligibility: values.eligibility ?? "eligible",
      submittedByUserId: userId,
    })
    .returning();

  await testDb.insert(rawSourceMaterial).values({
    sourceId: source.id,
    rawText: values.id === "raw-file-source" ? null : "Số điện thoại riêng 0901234567 không được xuất hiện trong approved UI.",
    fileName: values.id === "raw-file-source" ? "anh-chup-rieng-tu.jpg" : null,
    mimeType: values.id === "raw-file-source" ? "image/jpeg" : null,
    byteSize: values.id === "raw-file-source" ? 1234 : null,
    storageKey: values.id === "raw-file-source" ? "private/storage/key.jpg" : null,
    rawMetadata: { provider_payload: "hidden-provider-data", raw_source: "operator-only" },
  });

  return source;
}

async function createCard(userId: string, values: Partial<typeof knowledgeCards.$inferInsert> = {}) {
  const [card] = await testDb
    .insert(knowledgeCards)
    .values({
      id: values.id ?? `card-${crypto.randomUUID()}`,
      status: values.status ?? "draft",
      type: values.type ?? "food",
      title: values.title ?? "Quán ăn gia đình ở Huế",
      locationName: values.locationName ?? "Huế",
      routeSegment: values.routeSegment ?? "Đà Nẵng - Huế",
      summary: values.summary ?? "Nội dung đã được biên tập an toàn để kiểm tra provenance sau phê duyệt.",
      practicalDetails: values.practicalDetails ?? { tips: ["Kiểm tra giờ mở cửa"] },
      tags: values.tags ?? ["hue", "food"],
      confidence: values.confidence ?? "community",
      freshnessSensitive: values.freshnessSensitive ?? true,
      needsReview: values.needsReview ?? true,
      publicationState: values.publicationState,
      knowledgeState: values.knowledgeState,
      reviewState: values.reviewState,
      verificationState: values.verificationState,
      aiPromptVersion: values.aiPromptVersion ?? "source_knowledge_draft_extraction_v1",
      createdByUserId: userId,
    })
    .returning();

  return card;
}

describe("approved knowledge cards", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test("approved read helpers return preserved source, confidence, freshness, and no raw material", async () => {
    await createUser("approved-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "approved-operator", email: "approved-operator@example.com" } });
    const card = await createCard("approved-operator", {
      id: "approved-card",
      title: "Điểm ăn đã kiểm tra ở Huế",
      confidence: "community",
      freshnessSensitive: true,
    });
    const primary = await createSource("approved-operator", { id: "approved-primary", label: "Bài cộng đồng", kind: "copied_post" });
    const supporting = await createSource("approved-operator", {
      id: "approved-supporting",
      kind: "url",
      url: "https://example.com/place?utm_source=test",
      canonicalUrl: "https://example.com/place",
      label: "Trang tham khảo",
      publisher: "Example Travel",
      sourceType: "curated",
      verificationStatus: "verified",
    });
    const conflicting = await createSource("approved-operator", {
      id: "approved-conflicting",
      kind: "url",
      url: "https://official.example/place",
      label: "Nguồn official đang mâu thuẫn",
      sourceType: "curated",
      verificationStatus: "verified",
      official: true,
    });
    await testDb.insert(knowledgeCardSources).values([
      { knowledgeCardId: card.id, sourceId: primary.id, supportLevel: "primary" },
      { knowledgeCardId: card.id, sourceId: supporting.id, supportLevel: "supporting" },
      { knowledgeCardId: card.id, sourceId: conflicting.id, supportLevel: "conflicting" },
    ]);
    await seedSourceCaptureVersion({ sourceId: primary.id, captureKind: "copied_post", rawText: "Nội dung nguồn đã giữ lại để duyệt thẻ." });
    const { approveKnowledgeDraft, getApprovedKnowledgeCard, listApprovedKnowledgeCards } = await import("@/features/knowledge/review");

    await approveKnowledgeDraft(card.id);

    const approved = await getApprovedKnowledgeCard(card.id);
    expect(Object.keys(approved ?? {}).sort()).toEqual([
      "confidence",
      "createdAt",
      "freshnessSensitive",
      "id",
      "locationName",
      "needsReview",
      "practicalDetails",
      "routeSegment",
      "sources",
      "status",
      "summary",
      "tags",
      "title",
      "type",
      "updatedAt",
    ]);
    expect(Object.keys(approved?.sources[0] ?? {}).sort()).toEqual([
      "canonicalUrl",
      "collectedDate",
      "id",
      "kind",
      "label",
      "official",
      "partner",
      "publisher",
      "sourceType",
      "supportLevel",
      "url",
      "verificationStatus",
    ]);
    expect(approved).toMatchObject({
      id: card.id,
      status: "approved",
      needsReview: false,
      confidence: "community",
      freshnessSensitive: true,
      sources: expect.arrayContaining([
        expect.objectContaining({ id: primary.id, supportLevel: "primary", label: "Bài cộng đồng", sourceType: "community", verificationStatus: "unverified" }),
        expect.objectContaining({ id: supporting.id, supportLevel: "supporting", canonicalUrl: "https://example.com/place", sourceType: "curated", verificationStatus: "verified" }),
        expect.objectContaining({ id: conflicting.id, supportLevel: "conflicting", official: true }),
      ]),
    });
    expect(approved?.sources).toHaveLength(3);
    await expect(listApprovedKnowledgeCards()).resolves.toMatchObject([{ id: card.id, status: "approved", sources: expect.any(Array) }]);

    const serialized = JSON.stringify(approved);
    expect(serialized).not.toContain("0901234567");
    expect(serialized).not.toContain("hidden-provider-data");
    expect(serialized).not.toContain("raw_source");
    expect(serialized).not.toContain("rawText");
    expect(serialized).not.toContain("rawMetadata");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("createdByUserId");
    expect(serialized).not.toContain("aiPromptVersion");
    expect(serialized).not.toContain("aiGatewayModelId");
  });

  test("approved reads partition evidence-less legacy cards instead of presenting them as indexable", async () => {
    await createUser("lifecycle-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "lifecycle-operator", email: "lifecycle-operator@example.com" } });
    const source = await createSource("lifecycle-operator");
    const approved = await createCard("lifecycle-operator", { id: "approved-visible", status: "approved", needsReview: false });
    const archived = await createCard("lifecycle-operator", { id: "archived-hidden", status: "archived", needsReview: false });
    const rejected = await createCard("lifecycle-operator", { id: "rejected-hidden", status: "rejected", needsReview: false });
    const orphaned = await createCard("lifecycle-operator", { id: "approved-orphan-hidden", status: "approved", needsReview: false });
    const inconsistent = await createCard("lifecycle-operator", { id: "approved-still-needs-review-hidden", status: "approved", needsReview: true });
    await testDb.insert(knowledgeCardSources).values([
      { knowledgeCardId: approved.id, sourceId: source.id, supportLevel: "primary" },
      { knowledgeCardId: archived.id, sourceId: source.id, supportLevel: "primary" },
      { knowledgeCardId: rejected.id, sourceId: source.id, supportLevel: "primary" },
      { knowledgeCardId: inconsistent.id, sourceId: source.id, supportLevel: "primary" },
    ]);
    const { getApprovedKnowledgeCard, listApprovedKnowledgeCards } = await import("@/features/knowledge/review");

    const { getApprovedKnowledgeIndexStatuses, listApprovedKnowledgeCardsWithIndexStatus } = await import("@/features/knowledge/review");

    await expect(listApprovedKnowledgeCards()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: approved.id }), expect.objectContaining({ id: orphaned.id })]));
    await expect(getApprovedKnowledgeCard(approved.id)).resolves.toMatchObject({ id: approved.id, status: "approved" });
    await expect(getApprovedKnowledgeCard(archived.id)).resolves.toBeNull();
    await expect(getApprovedKnowledgeCard(rejected.id)).resolves.toBeNull();
    await expect(getApprovedKnowledgeCard(orphaned.id)).resolves.toMatchObject({ id: orphaned.id, sources: [] });
    await expect(getApprovedKnowledgeCard(inconsistent.id)).resolves.toBeNull();
    const cards = await listApprovedKnowledgeCardsWithIndexStatus();
    expect(cards.find((card) => card.id === orphaned.id)?.indexStatus).toMatchObject({ state: "evidence_pending", documentStatus: null });
    await expect(getApprovedKnowledgeIndexStatuses([orphaned.id])).resolves.toEqual(new Map([[orphaned.id, expect.objectContaining({ state: "evidence_pending" })]]));
  });

  test("approved list reports worker-owned index status", async () => {
    await createUser("index-status-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "index-status-operator", email: "index-status-operator@example.com" } });
    const source = await createSource("index-status-operator", { id: "index-status-source", kind: "url", url: "https://example.com/index-status" });
    const eligibleState = { status: "approved" as const, needsReview: false, publicationState: "active" as const, knowledgeState: "uncertain" as const, reviewState: "reviewed" as const, verificationState: "not_required" as const };
    const indexed = await createCard("index-status-operator", { id: "index-status-indexed", title: "Đã có index", ...eligibleState });
    const missing = await createCard("index-status-operator", { id: "index-status-missing", title: "Chưa có index", ...eligibleState });
    const stale = await createCard("index-status-operator", { id: "index-status-stale", title: "Index cũ", ...eligibleState });
    await testDb.insert(knowledgeCardSources).values([indexed, missing, stale].map((card) => ({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "primary" as const })));
    const capture = await seedSourceCaptureVersion({ sourceId: source.id, captureKind: "url", rawText: "Evidence an toàn cho trạng thái index." });
    for (const card of [indexed, missing, stale]) {
      await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: source.id, captureVersionId: capture.id, quoteText: "Evidence an toàn cho trạng thái index.", independenceKey: `${card.id}:${capture.id}` });
    }
    const { indexApprovedKnowledgeCard } = await import("@/features/knowledge/search");
    const { processNextApprovedKnowledgeIndexingBatch } = await import("@/features/knowledge/indexing-worker");
    await indexApprovedKnowledgeCard(indexed.id);
    await processNextApprovedKnowledgeIndexingBatch({}, testDb);
    await indexApprovedKnowledgeCard(stale.id);
    await processNextApprovedKnowledgeIndexingBatch({}, testDb);
    const [staleDocument] = await testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, stale.id));
    await testDb.update(knowledgeCards).set({ updatedAt: new Date((staleDocument?.updatedAt.getTime() ?? Date.now()) + 10_000) }).where(eq(knowledgeCards.id, stale.id));
    const { getApprovedKnowledgeIndexStatuses, listApprovedKnowledgeCardsWithIndexStatus } = await import("@/features/knowledge/review");

    const cards = await listApprovedKnowledgeCardsWithIndexStatus();
    const statuses = new Map(cards.map((card) => [card.id, card.indexStatus.state]));

    expect(statuses.get(indexed.id)).toBe("indexed");
    expect(statuses.get(missing.id)).toBe("needs_indexing");
    expect(statuses.get(stale.id)).toBe("stale_index");
    const selectedStatuses = await getApprovedKnowledgeIndexStatuses([indexed.id, missing.id]);
    expect(selectedStatuses.get(indexed.id)).toMatchObject({ state: "indexed", documentStatus: "active" });
    expect(selectedStatuses.get(missing.id)).toMatchObject({ state: "needs_indexing", documentStatus: null });
  });

  test("index status lookup evaluates canonical state without legacy approval filters", async () => {
    await createUser("state-aware-index-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "state-aware-index-operator", email: "state-aware-index-operator@example.com" } });
    const source = await createSource("state-aware-index-operator", { id: "state-aware-index-source", kind: "url", url: "https://example.com/state-aware-index" });
    const card = await createCard("state-aware-index-operator", { id: "state-aware-index-card", status: "draft", needsReview: true, publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: source.id, captureKind: "url", rawText: "Evidence an toàn cho trạng thái canonical." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: source.id, captureVersionId: capture.id, quoteText: "Evidence an toàn cho trạng thái canonical." });
    const { getApprovedKnowledgeIndexStatuses } = await import("@/features/knowledge/review");

    await expect(getApprovedKnowledgeIndexStatuses([card.id])).resolves.toEqual(new Map([[card.id, expect.objectContaining({ state: "needs_indexing", documentStatus: null })]]));
  });

  test("approved reads authorize before lookup and do not leak existence", async () => {
    await createUser("traveler-approved-reader", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-approved-reader", email: "traveler-approved-reader@example.com" } });
    const { getApprovedKnowledgeCard, listApprovedKnowledgeCards } = await import("@/features/knowledge/review");

    await expect(listApprovedKnowledgeCards()).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(getApprovedKnowledgeCard("maybe-real-card")).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("approved read omits screenshot file metadata and storage keys", async () => {
    await createUser("screenshot-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "screenshot-operator", email: "screenshot-operator@example.com" } });
    const source = await createSource("screenshot-operator", { id: "raw-file-source", kind: "screenshot", label: "Ảnh chụp màn hình" });
    const card = await createCard("screenshot-operator", { id: "approved-screenshot-card", status: "approved", needsReview: false, confidence: "unverified" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "primary" });
    const { getApprovedKnowledgeCard } = await import("@/features/knowledge/review");

    const approved = await getApprovedKnowledgeCard(card.id);

    expect(approved).toMatchObject({ id: card.id, sources: [expect.objectContaining({ kind: "screenshot", label: "Ảnh chụp màn hình" })] });
    expect(Object.keys(approved?.sources[0] ?? {}).sort()).not.toEqual(expect.arrayContaining(["fileName", "mimeType", "byteSize", "storageKey", "rawMetadata"]));
    const serialized = JSON.stringify(approved);
    expect(serialized).not.toContain("anh-chup-rieng-tu.jpg");
    expect(serialized).not.toContain("private/storage/key.jpg");
    expect(serialized).not.toContain("provider_payload");
  });
});
