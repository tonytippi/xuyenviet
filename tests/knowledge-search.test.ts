import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { knowledgeCardEvidence, knowledgeCardSearchDocuments, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sourceCaptureVersions, sources, userRoles, users, type UserRole } from "@/db/schema";

import { testDb } from "./helpers/db";
import { seedKnowledgeCardEvidence, seedSourceCaptureVersion } from "./helpers/source-captures";

const authMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock, signIn: vi.fn(), signOut: vi.fn() }));

async function createUser(userId: string, roles: UserRole[] = []) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
  if (roles.length > 0) await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
}

async function createApprovedCardWithSource(userId: string, id: string) {
  const [source] = await testDb
    .insert(sources)
    .values({ id: `${id}-source`, kind: "url", url: "https://example.com/card", canonicalUrl: "https://example.com/card", label: "Nguồn đã chuẩn hóa", sourceType: "curated", verificationStatus: "verified", submittedByUserId: userId })
    .returning();
  await testDb.insert(rawSourceMaterial).values({ sourceId: source.id, rawText: "Nội dung nguồn chỉ dành cho vận hành." });
  const [card] = await testDb
    .insert(knowledgeCards)
    .values({ id, status: "approved", publicationState: "active", knowledgeState: "uncertain", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm dừng tại Huế", locationName: "Huế", summary: "Điểm dừng cho hành trình gia đình.", confidence: "curated", needsReview: false, aiPromptVersion: "test", createdByUserId: userId })
    .returning();
  await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: source.id, supportLevel: "primary" });
  return card;
}

describe("knowledge card state-model retrieval safety", () => {
  beforeEach(() => authMock.mockReset());

  test("does not index or retrieve an active legacy-approved card without bounded evidence", async () => {
    await createUser("search-operator", ["operator"]);
    const card = await createApprovedCardWithSource("search-operator", "legacy-active-card");
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toEqual({ cardId: card.id, indexed: false });
    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments)).resolves.toEqual([]);
  });

  test("indexes only exact active evidence tied to its immutable capture without exposing raw text", async () => {
    await createUser("evidence-operator", ["operator"]);
    const card = await createApprovedCardWithSource("evidence-operator", "evidence-backed-card");
    const [source] = await testDb.select().from(sources).where(eq(sources.id, "evidence-backed-card-source"));
    const capture = await seedSourceCaptureVersion({ sourceId: source!.id, captureKind: "url", rawText: "Bãi đỗ xe có mái che tại Huế." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: source!.id, captureVersionId: capture.id, quoteText: "Bãi đỗ xe có mái che tại Huế." });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toMatchObject({ cardId: card.id, indexed: true });
    const results = await searchApprovedKnowledge("Huế");
    expect(results).toHaveLength(1);
    expect(JSON.stringify(results)).not.toContain("Bãi đỗ xe có mái che");
    expect(JSON.stringify(results)).not.toContain("Nội dung nguồn chỉ dành cho vận hành");
  });

  test("rejects evidence from a source not linked to its card", async () => {
    await createUser("unlinked-evidence-operator", ["operator"]);
    const card = await createApprovedCardWithSource("unlinked-evidence-operator", "unlinked-evidence-card");
    const [unlinkedSource] = await testDb.insert(sources).values({ id: "unlinked-evidence-source", kind: "url", url: "https://example.com/unlinked", canonicalUrl: "https://example.com/unlinked", label: "Nguồn không liên kết", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "unlinked-evidence-operator" }).returning();
    const capture = await seedSourceCaptureVersion({ sourceId: unlinkedSource.id, captureKind: "url", rawText: "Bằng chứng không thuộc thẻ." });

    await expect(seedKnowledgeCardEvidence({ cardId: card.id, sourceId: unlinkedSource.id, captureVersionId: capture.id, quoteText: "Bằng chứng không thuộc thẻ." })).rejects.toMatchObject({ cause: expect.objectContaining({ constraint_name: "knowledge_card_evidence_card_source_fk" }) });
  });

  test("does not retrieve draft, rejected, or needs-review cards even with valid evidence", async () => {
    await createUser("legacy-lifecycle-operator", ["operator"]);
    const cards = await Promise.all(["draft", "rejected", "needs-review"].map((suffix) => createApprovedCardWithSource("legacy-lifecycle-operator", `legacy-${suffix}-card`)));
    await testDb.update(knowledgeCards).set({ status: "draft", needsReview: true }).where(eq(knowledgeCards.id, cards[0]!.id));
    await testDb.update(knowledgeCards).set({ status: "rejected", needsReview: false }).where(eq(knowledgeCards.id, cards[1]!.id));
    await testDb.update(knowledgeCards).set({ needsReview: true }).where(eq(knowledgeCards.id, cards[2]!.id));

    for (const card of cards) {
      const sourceId = `${card.id}-source`;
      const capture = await seedSourceCaptureVersion({ sourceId, captureKind: "url", rawText: "Bằng chứng hợp lệ nhưng lifecycle không hợp lệ." });
      await seedKnowledgeCardEvidence({ cardId: card.id, sourceId, captureVersionId: capture.id, quoteText: "Bằng chứng hợp lệ nhưng lifecycle không hợp lệ." });
      await expect((await import("@/features/knowledge/search")).indexApprovedKnowledgeCard(card.id)).resolves.toMatchObject({ indexed: false });
    }
  });

  test.each([
    { description: "conflicted knowledge", update: { knowledgeState: "conflicted" as const } },
    { description: "superseded knowledge", update: { knowledgeState: "superseded" as const } },
    { description: "failed verification", update: { verificationState: "failed" as const } },
  ])("fails closed for $description despite valid evidence", async ({ update }) => {
    await createUser(`ineligible-${update.knowledgeState ?? update.verificationState}`, ["operator"]);
    const card = await createApprovedCardWithSource(`ineligible-${update.knowledgeState ?? update.verificationState}`, `ineligible-${update.knowledgeState ?? update.verificationState}-card`);
    const sourceId = `${card.id}-source`;
    const capture = await seedSourceCaptureVersion({ sourceId, captureKind: "url", rawText: "Bằng chứng hợp lệ nhưng trạng thái không đủ điều kiện." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId, captureVersionId: capture.id, quoteText: "Bằng chứng hợp lệ nhưng trạng thái không đủ điều kiện." });
    await testDb.update(knowledgeCards).set(update).where(eq(knowledgeCards.id, card.id));
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toEqual({ cardId: card.id, indexed: false });
    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
  });

  test("hides URLs for operator-only evidence while fact-only evidence exposes no quote", async () => {
    await createUser("policy-operator", ["operator"]);
    const card = await createApprovedCardWithSource("policy-operator", "policy-card");
    const capture = await seedSourceCaptureVersion({ sourceId: "policy-card-source", captureKind: "url", rawText: "Chi tiết evidence chỉ dành cho vận hành." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "policy-card-source", captureVersionId: capture.id, quoteText: "Chi tiết evidence chỉ dành cho vận hành.", displayPolicy: "operator_only" });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await indexApprovedKnowledgeCard(card.id);
    const [result] = await searchApprovedKnowledge("Huế");
    expect(result?.sources).toMatchObject([{ id: "policy-card-source", url: null, canonicalUrl: null }]);
    expect(JSON.stringify(result)).not.toContain("Chi tiết evidence chỉ dành cho vận hành");
  });

  test("redacts every operator-only source URL while retaining URLs for fact-only sources", async () => {
    await createUser("multi-policy-operator", ["operator"]);
    const card = await createApprovedCardWithSource("multi-policy-operator", "multi-policy-card");
    const [operatorSource] = await testDb.insert(sources).values({ id: "multi-policy-operator-source", kind: "url", url: "https://private.example/operator-token", canonicalUrl: "https://private.example/operator-canonical-token", label: "Nguồn nội bộ", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "multi-policy-operator" }).returning();
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: operatorSource!.id, supportLevel: "supporting" });
    const factCapture = await seedSourceCaptureVersion({ sourceId: "multi-policy-card-source", captureKind: "url", rawText: "Bằng chứng công khai." });
    const operatorCapture = await seedSourceCaptureVersion({ sourceId: operatorSource!.id, captureKind: "url", rawText: "Bằng chứng nội bộ." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "multi-policy-card-source", captureVersionId: factCapture.id, quoteText: "Bằng chứng công khai.", displayPolicy: "fact_only" });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: operatorSource!.id, captureVersionId: operatorCapture.id, quoteText: "Bằng chứng nội bộ.", displayPolicy: "operator_only" });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await indexApprovedKnowledgeCard(card.id);
    const [result] = await searchApprovedKnowledge("Huế");
    expect(result?.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "multi-policy-card-source", url: "https://example.com/card", canonicalUrl: "https://example.com/card" }),
      expect.objectContaining({ id: operatorSource!.id, url: null, canonicalUrl: null }),
    ]));
  });

  test("includes only linked sources with valid evidence in citations and searchable text", async () => {
    await createUser("validated-source-operator", ["operator"]);
    const card = await createApprovedCardWithSource("validated-source-operator", "validated-source-card");
    const [unvalidatedSource] = await testDb.insert(sources).values({ id: "unvalidated-linked-source", kind: "url", url: "https://example.com/unvalidated-citation-token", canonicalUrl: "https://example.com/unvalidated-canonical-token", label: "Nguồn chưa xác minh", publisher: "Unvalidated Publisher", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "validated-source-operator" }).returning();
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: unvalidatedSource!.id, supportLevel: "supporting" });
    const capture = await seedSourceCaptureVersion({ sourceId: "validated-source-card-source", captureKind: "url", rawText: "Bằng chứng fact-only hợp lệ." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "validated-source-card-source", captureVersionId: capture.id, quoteText: "Bằng chứng fact-only hợp lệ.", displayPolicy: "fact_only" });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toMatchObject({ indexed: true });
    const [document] = await testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id));
    expect(document?.sourceCount).toBe(1);
    expect(document?.searchableText).not.toContain("unvalidated-citation-token");
    expect(document?.searchableText).not.toContain("unvalidated-canonical-token");
    expect(document?.searchableText).not.toContain("Nguồn chưa xác minh");
    await expect(searchApprovedKnowledge("unvalidated-citation-token")).resolves.toEqual([]);
    const [result] = await searchApprovedKnowledge("Huế");
    expect(result?.sources).toEqual([expect.objectContaining({ id: "validated-source-card-source", url: "https://example.com/card" })]);
  });

  test("keeps evidence valid against its historical capture after a source recapture and redacts Facebook links", async () => {
    await createUser("historical-capture-operator", ["operator"]);
    const card = await createApprovedCardWithSource("historical-capture-operator", "historical-capture-card");
    await testDb.update(sources).set({ kind: "facebook", url: "https://facebook.com/historical-capture-token", canonicalUrl: "https://facebook.com/historical-canonical-token" }).where(eq(sources.id, "historical-capture-card-source"));
    const originalCapture = await seedSourceCaptureVersion({ sourceId: "historical-capture-card-source", captureKind: "facebook", rawText: "Bằng chứng từ capture lịch sử." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "historical-capture-card-source", captureVersionId: originalCapture.id, quoteText: "Bằng chứng từ capture lịch sử.", displayPolicy: "fact_only" });
    await seedSourceCaptureVersion({ sourceId: "historical-capture-card-source", captureKind: "facebook", rawText: "Capture mới không làm mất provenance cũ.", id: "historical-recapture", versionSequence: 2 });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toMatchObject({ indexed: true });
    const [result] = await searchApprovedKnowledge("Huế");
    expect(result?.sources).toEqual([expect.objectContaining({ id: "historical-capture-card-source", url: null, canonicalUrl: null })]);
  });

  test("does not add operator-only source URLs to the lexical search projection", async () => {
    await createUser("lexical-policy-operator", ["operator"]);
    const card = await createApprovedCardWithSource("lexical-policy-operator", "lexical-policy-card");
    await testDb.update(sources).set({ url: "https://private.example/lexical-secret-token", canonicalUrl: "https://private.example/lexical-canonical-secret-token" }).where(eq(sources.id, "lexical-policy-card-source"));
    const capture = await seedSourceCaptureVersion({ sourceId: "lexical-policy-card-source", captureKind: "url", rawText: "Bằng chứng nội bộ chỉ dành cho vận hành." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "lexical-policy-card-source", captureVersionId: capture.id, quoteText: "Bằng chứng nội bộ chỉ dành cho vận hành.", displayPolicy: "operator_only" });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await indexApprovedKnowledgeCard(card.id);
    const [document] = await testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id));
    expect(document?.searchableText).not.toContain("lexical-secret-token");
    expect(document?.searchableText).not.toContain("lexical-canonical-secret-token");
    await expect(searchApprovedKnowledge("lexical-secret-token")).resolves.toEqual([]);
  });

  test("indexes when a valid evidence row exists after an invalid active row", async () => {
    await createUser("mixed-evidence-operator", ["operator"]);
    const card = await createApprovedCardWithSource("mixed-evidence-operator", "mixed-evidence-card");
    const capture = await seedSourceCaptureVersion({ sourceId: "mixed-evidence-card-source", captureKind: "url", rawText: "Bằng chứng hợp lệ sau cùng." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "mixed-evidence-card-source", captureVersionId: capture.id, quoteText: "Bằng chứng không khớp.", independenceKey: "invalid-evidence" });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "mixed-evidence-card-source", captureVersionId: capture.id, quoteText: "Bằng chứng hợp lệ sau cùng.", independenceKey: "valid-evidence" });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toMatchObject({ indexed: true });
    await expect(searchApprovedKnowledge("Huế")).resolves.toHaveLength(1);
  });

  test("disables a projection when supporting evidence is removed", async () => {
    await createUser("invalid-evidence-operator", ["operator"]);
    const card = await createApprovedCardWithSource("invalid-evidence-operator", "invalid-evidence-card");
    const capture = await seedSourceCaptureVersion({ sourceId: "invalid-evidence-card-source", captureKind: "url", rawText: "Dữ liệu xác minh chính xác." });
    const evidence = await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "invalid-evidence-card-source", captureVersionId: capture.id, quoteText: "Dữ liệu xác minh chính xác." });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");
    await indexApprovedKnowledgeCard(card.id);
    await testDb.update(knowledgeCardEvidence).set({ state: "removed" }).where(eq(knowledgeCardEvidence.id, evidence.id));

    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id))).resolves.toMatchObject([{ status: "disabled" }]);
    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.id, capture.id))).resolves.toHaveLength(1);
  });

  test("disables a stale active projection after owner-row eligibility recheck", async () => {
    await createUser("stale-operator", ["operator"]);
    const card = await createApprovedCardWithSource("stale-operator", "stale-projection-card");
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: card.id, status: "active", searchableText: "Điểm dừng tại Huế", textHash: "a".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false });
    const { searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id))).resolves.toMatchObject([{ status: "disabled", disabledAt: expect.any(Date) }]);
  });

  test("indexing worker disables an active document when its active card becomes state-ineligible", async () => {
    await createUser("worker-state-operator", ["operator"]);
    const card = await createApprovedCardWithSource("worker-state-operator", "worker-superseded-card");
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: card.id, status: "active", searchableText: "Điểm dừng tại Huế", textHash: "d".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false });
    await testDb.update(knowledgeCards).set({ knowledgeState: "superseded" }).where(eq(knowledgeCards.id, card.id));
    const { processNextApprovedKnowledgeIndexingBatch } = await import("@/features/knowledge/indexing-worker");

    await expect(processNextApprovedKnowledgeIndexingBatch()).resolves.toEqual({ status: "indexed", indexedCount: 0, skippedCount: 1, cardIds: [card.id] });
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id))).resolves.toMatchObject([{ status: "disabled", disabledAt: expect.any(Date) }]);
  });

  test("indexing worker disables active evidence-less projections while leaving other ineligible candidates untouched", async () => {
    await createUser("worker-operator", ["operator"]);
    const missing = await createApprovedCardWithSource("worker-operator", "worker-missing-document-card");
    const disabled = await createApprovedCardWithSource("worker-operator", "worker-disabled-document-card");
    const stale = await createApprovedCardWithSource("worker-operator", "worker-stale-document-card");
    await testDb.insert(knowledgeCardSearchDocuments).values([
      { knowledgeCardId: disabled.id, status: "disabled", searchableText: "disabled", textHash: "b".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false, disabledAt: new Date() },
      { knowledgeCardId: stale.id, status: "active", searchableText: "stale", textHash: "c".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false, updatedAt: new Date(0) },
    ]);
    const { processNextApprovedKnowledgeIndexingBatch } = await import("@/features/knowledge/indexing-worker");

    await expect(processNextApprovedKnowledgeIndexingBatch()).resolves.toEqual({ status: "indexed", indexedCount: 0, skippedCount: 1, cardIds: [stale.id] });
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, missing.id))).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, disabled.id))).resolves.toMatchObject([{ status: "disabled" }]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, stale.id))).resolves.toMatchObject([{ status: "disabled", disabledAt: expect.any(Date) }]);
  });

  test("indexing worker leaves current active documents out of a bounded batch", async () => {
    await createUser("worker-fairness-operator", ["operator"]);
    const current = await createApprovedCardWithSource("worker-fairness-operator", "worker-current-card");
    const pending = await createApprovedCardWithSource("worker-fairness-operator", "worker-pending-card");
    for (const card of [current, pending]) {
      const sourceId = `${card.id}-source`;
      const capture = await seedSourceCaptureVersion({ sourceId, captureKind: "url", rawText: "Evidence đầy đủ cho worker." });
      await seedKnowledgeCardEvidence({ cardId: card.id, sourceId, captureVersionId: capture.id, quoteText: "Evidence đầy đủ cho worker." });
    }
    const { indexApprovedKnowledgeCard } = await import("@/features/knowledge/search");
    await indexApprovedKnowledgeCard(current.id);
    const { processNextApprovedKnowledgeIndexingBatch } = await import("@/features/knowledge/indexing-worker");

    await expect(processNextApprovedKnowledgeIndexingBatch({ batchSize: 1 })).resolves.toMatchObject({ cardIds: [pending.id], indexedCount: 1 });
  });
});
