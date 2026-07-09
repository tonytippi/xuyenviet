import { beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { knowledgeCards, knowledgeCardSearchDocuments, knowledgeCardSources, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";

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
  const hasUrl = Object.hasOwn(values, "url");
  const hasCanonicalUrl = Object.hasOwn(values, "canonicalUrl");
  const [source] = await testDb
    .insert(sources)
    .values({
      id: values.id ?? `source-${crypto.randomUUID()}`,
      kind: values.kind ?? "url",
      url: hasUrl ? values.url : "https://example.com/approved-safe-page",
      canonicalUrl: hasCanonicalUrl ? values.canonicalUrl : "https://example.com/approved-safe-page",
      label: values.label ?? "Nguồn an toàn đã chuẩn hóa",
      publisher: values.publisher ?? "Example Travel",
      collectedDate: values.collectedDate ?? "2026-07-08",
      sourceType: values.sourceType ?? "curated",
      verificationStatus: values.verificationStatus ?? "verified",
      official: values.official ?? false,
      partner: values.partner ?? false,
      submittedByUserId: userId,
    })
    .returning();

  await testDb.insert(rawSourceMaterial).values({
    sourceId: source.id,
    rawText: values.id === "raw-file-source" ? null : "Nội dung thô bí mật có số 0901234567 không được index.",
    fileName: values.id === "raw-file-source" ? "anh-raw-rieng-tu.jpg" : null,
    mimeType: values.id === "raw-file-source" ? "image/jpeg" : null,
    byteSize: values.id === "raw-file-source" ? 2048 : null,
    storageKey: values.id === "raw-file-source" ? "private/raw/file.jpg" : null,
    rawMetadata: { provider_payload: "hidden-provider-data", raw_source: "operator-only" },
  });

  return source;
}

async function createCard(userId: string, values: Partial<typeof knowledgeCards.$inferInsert> = {}) {
  const [card] = await testDb
    .insert(knowledgeCards)
    .values({
      id: values.id ?? `card-${crypto.randomUUID()}`,
      status: values.status ?? "approved",
      type: values.type ?? "place",
      title: values.title ?? "Điểm dừng an toàn ở Huế",
      locationName: values.locationName ?? "Huế",
      routeSegment: values.routeSegment ?? "Đà Nẵng - Huế",
      summary: values.summary ?? "Bãi đỗ rộng, dễ nghỉ chân cho gia đình trên cung đường xuyên Việt.",
      practicalDetails: values.practicalDetails ?? { private: "Không được đưa vào search text" },
      tags: values.tags ?? ["hue", "family-stop"],
      confidence: values.confidence ?? "curated",
      freshnessSensitive: values.freshnessSensitive ?? false,
      needsReview: values.needsReview ?? false,
      aiPromptVersion: values.aiPromptVersion ?? "source_knowledge_draft_extraction_v1",
      createdByUserId: userId,
    })
    .returning();

  return card;
}

describe("approved knowledge search documents", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test("indexes one active safe search document for an eligible approved source-linked card", async () => {
    await createUser("search-operator", ["operator"]);
    const card = await createCard("search-operator", { id: "eligible-search-card", title: "Bãi đỗ an toàn gần Huế", confidence: "curated", freshnessSensitive: true });
    const source = await createSource("search-operator", { id: "eligible-search-source", label: "Trang địa phương", official: true });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "primary" });
    const { indexApprovedKnowledgeCard } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toMatchObject({ cardId: card.id, indexed: true });

    const documents = await testDb.select().from(knowledgeCardSearchDocuments);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ knowledgeCardId: card.id, status: "active", sourceCount: 1, confidence: "curated", freshnessSensitive: true });
    expect(documents[0]?.textHash).toMatch(/^[a-f0-9]{64}$/);
    expect(documents[0]?.searchableText).toContain("Bãi đỗ an toàn gần Huế");
    expect(documents[0]?.searchableText).toContain("Trang địa phương");
    expect(documents[0]?.searchableText).not.toContain("0901234567");
    expect(documents[0]?.searchableText).not.toContain("hidden-provider-data");
    expect(documents[0]?.searchableText).not.toContain("Không được đưa vào search text");
  });

  test("disables active documents for ineligible lifecycle, review-needed, and source-orphaned cards", async () => {
    await createUser("ineligible-operator", ["operator"]);
    const source = await createSource("ineligible-operator");
    const approved = await createCard("ineligible-operator", { id: "approved-indexed" });
    const draft = await createCard("ineligible-operator", { id: "draft-hidden", status: "draft", needsReview: true });
    const needsReview = await createCard("ineligible-operator", { id: "approved-needs-review-hidden", needsReview: true });
    const orphaned = await createCard("ineligible-operator", { id: "approved-orphan-hidden" });
    await testDb.insert(knowledgeCardSources).values([
      { knowledgeCardId: approved.id, sourceId: source.id, supportLevel: "primary" },
      { knowledgeCardId: draft.id, sourceId: source.id, supportLevel: "primary" },
      { knowledgeCardId: needsReview.id, sourceId: source.id, supportLevel: "primary" },
    ]);
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await indexApprovedKnowledgeCard(approved.id);
    await testDb.update(knowledgeCards).set({ status: "archived" }).where(eq(knowledgeCards.id, approved.id));
    await indexApprovedKnowledgeCard(approved.id);
    await indexApprovedKnowledgeCard(draft.id);
    await indexApprovedKnowledgeCard(needsReview.id);
    await indexApprovedKnowledgeCard(orphaned.id);

    const documents = await testDb.select().from(knowledgeCardSearchDocuments);
    expect(documents).toMatchObject([{ knowledgeCardId: approved.id, status: "disabled" }]);
    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
  });

  test("search returns bounded safe DTOs with source metadata and no raw fields", async () => {
    await createUser("search-result-operator", ["operator"]);
    const source = await createSource("search-result-operator", { id: "raw-file-source", kind: "screenshot", url: null, canonicalUrl: null, label: "Ảnh chụp bảng chỉ dẫn", publisher: null });
    const cards = await Promise.all(
      ["Một", "Hai", "Ba"].map((suffix) =>
        createCard("search-result-operator", {
          id: `bounded-card-${suffix}`,
          title: `Điểm nghỉ Huế ${suffix}`,
          summary: "Có chỗ đỗ xe và khu vực nghỉ ngắn cho gia đình.",
        }),
      ),
    );
    await testDb.insert(knowledgeCardSources).values(cards.map((card) => ({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "primary" as const })));
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge, searchApprovedKnowledgeWithCandidateCount } = await import("@/features/knowledge/search");
    for (const card of cards) {
      await indexApprovedKnowledgeCard(card.id);
    }

    const results = await searchApprovedKnowledge("Huế chỗ đỗ", { limit: 2 });
    const countedResults = await searchApprovedKnowledgeWithCandidateCount("Huế chỗ đỗ", { limit: 2 });

    expect(results).toHaveLength(2);
    expect(countedResults.results).toHaveLength(2);
    expect(countedResults.candidateCount).toBe(3);
    expect(Object.keys(results[0] ?? {}).sort()).toEqual([
      "confidence",
      "createdAt",
      "freshnessSensitive",
      "id",
      "locationName",
      "routeSegment",
      "score",
      "sources",
      "summary",
      "tags",
      "title",
      "type",
      "updatedAt",
    ]);
    expect(Object.keys(results[0]?.sources[0] ?? {}).sort()).toEqual([
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
    expect(results[0]).toMatchObject({ score: expect.any(Number), sources: [expect.objectContaining({ kind: "screenshot", label: "Ảnh chụp bảng chỉ dẫn" })] });
    expect(await searchApprovedKnowledge("   ")).toEqual([]);
    expect(await searchApprovedKnowledge(null)).toEqual([]);
    expect(await searchApprovedKnowledge(undefined)).toEqual([]);
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain("anh-raw-rieng-tu.jpg");
    expect(serialized).not.toContain("private/raw/file.jpg");
    expect(serialized).not.toContain("provider_payload");
    expect(serialized).not.toContain("rawMetadata");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("practicalDetails");
    expect(serialized).not.toContain("createdByUserId");
    expect(serialized).not.toContain("aiPromptVersion");
  });

  test("reindex updates active text and hash without duplicate active documents", async () => {
    await createUser("reindex-operator", ["operator"]);
    const card = await createCard("reindex-operator", { id: "reindex-card", title: "Điểm nghỉ cũ ở Huế" });
    const source = await createSource("reindex-operator", { id: "reindex-source" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "primary" });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await indexApprovedKnowledgeCard(card.id);
    const [initial] = await testDb.select().from(knowledgeCardSearchDocuments);
    await testDb.update(knowledgeCards).set({ title: "Điểm nghỉ mới ở Huế", summary: "Thông tin mới đã được duyệt." }).where(eq(knowledgeCards.id, card.id));
    await indexApprovedKnowledgeCard(card.id);

    const documents = await testDb.select().from(knowledgeCardSearchDocuments);
    expect(documents).toHaveLength(1);
    expect(documents[0]?.id).toBe(initial?.id);
    expect(documents[0]?.textHash).not.toBe(initial?.textHash);
    expect(documents[0]?.searchableText).toContain("Điểm nghỉ mới ở Huế");
    expect(documents[0]?.searchableText).not.toContain("Điểm nghỉ cũ ở Huế");
    await expect(searchApprovedKnowledge("mới Huế")).resolves.toMatchObject([{ id: card.id }]);
  });

  test("ignores malformed tag values while indexing approved cards", async () => {
    await createUser("malformed-tags-operator", ["operator"]);
    const card = await createCard("malformed-tags-operator", {
      id: "malformed-tags-card",
      tags: ["safe-tag", 42, null] as unknown as string[],
    });
    const source = await createSource("malformed-tags-operator", { id: "malformed-tags-source" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "primary" });
    const { indexApprovedKnowledgeCard } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toMatchObject({ cardId: card.id, indexed: true });

    const [document] = await testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id));
    expect(document?.searchableText).toContain("safe-tag");
    expect(document?.searchableText).not.toContain("42");
    expect(document?.searchableText).not.toContain("null");
  });

  test("bounds long search queries before matching documents", async () => {
    await createUser("long-query-operator", ["operator"]);
    const source = await createSource("long-query-operator", { id: "long-query-source" });
    const card = await createCard("long-query-operator", {
      id: "long-query-card",
      title: "Điểm nghỉ Huế với truy vấn dài",
      summary: "Có chỗ đỗ xe và khu vực nghỉ ngắn cho gia đình.",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "primary" });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");
    await indexApprovedKnowledgeCard(card.id);

    const results = await searchApprovedKnowledge(`Huế ${"x".repeat(5_000)}`, { limit: 1 });

    expect(results).toMatchObject([{ id: card.id }]);
  });

  test("continues filling bounded results when active documents become ineligible between document and card loads", async () => {
    await createUser("stale-fill-operator", ["operator"]);
    const source = await createSource("stale-fill-operator", { id: "stale-fill-source" });
    const cards = await Promise.all(
      ["A", "B", "C", "D"].map((suffix) =>
        createCard("stale-fill-operator", {
          id: `stale-fill-card-${suffix}`,
          title: `Điểm nghỉ Huế stale ${suffix}`,
          summary: "Có chỗ đỗ xe và khu vực nghỉ ngắn cho gia đình.",
        }),
      ),
    );
    await testDb.insert(knowledgeCardSources).values(cards.map((card) => ({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "primary" as const })));
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");
    for (const card of cards) {
      await indexApprovedKnowledgeCard(card.id);
    }
    await testDb.delete(knowledgeCardSources).where(eq(knowledgeCardSources.knowledgeCardId, cards[0]!.id));

    const results = await searchApprovedKnowledge("Huế stale", { limit: 4 });

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.id)).not.toContain(cards[0]!.id);
    const [disabledDocument] = await testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, cards[0]!.id));
    expect(disabledDocument).toMatchObject({ status: "disabled", disabledAt: expect.any(Date) });
  });
});
