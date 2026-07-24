import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { knowledgeCardEvidence, knowledgeCardSearchDocuments, knowledgeCards, knowledgeCardSources, knowledgeIndexDirtyMarkers, rawSourceMaterial, sourceCaptureVersions, sources, userRoles, users, type UserRole } from "@/db/schema";

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

async function enqueueIndexWork(cardId: string, reason = "test") {
  const [card] = await testDb.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, cardId));
  if (!card) throw new Error("Expected card");
  await testDb.insert(knowledgeIndexDirtyMarkers).values({ knowledgeCardId: cardId, contentVersion: card.contentVersion, evidenceSetRevision: card.evidenceSetRevision, reason, nextRunAt: new Date(0) });
}

async function enqueueAndProcessIndexWork(cardId: string) {
  const { indexApprovedKnowledgeCard } = await import("@/features/knowledge/search");
  const { processNextApprovedKnowledgeIndexingBatch } = await import("@/features/knowledge/indexing-worker");
  await indexApprovedKnowledgeCard(cardId);
  return processNextApprovedKnowledgeIndexingBatch({}, testDb);
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

    await expect(enqueueAndProcessIndexWork(card.id)).resolves.toMatchObject({ indexedCount: 1 });
    const results = await searchApprovedKnowledge("Huế");
    expect(results).toHaveLength(1);
    expect(JSON.stringify(results)).not.toContain("Bãi đỗ xe có mái che");
    expect(JSON.stringify(results)).not.toContain("Nội dung nguồn chỉ dành cho vận hành");
  });

  test.each(["copied_post", "pasted_text", "screenshot"] as const)("does not index or retrieve evidence captured from a %s", async (kind) => {
    await createUser(`${kind}-evidence-operator`, ["operator"]);
    const card = await createApprovedCardWithSource(`${kind}-evidence-operator`, `${kind}-evidence-card`);
    await testDb.update(sources).set({ kind, url: null, canonicalUrl: null }).where(eq(sources.id, `${card.id}-source`));
    const capture = await seedSourceCaptureVersion({ sourceId: `${card.id}-source`, captureKind: kind, rawText: `Bằng chứng ${kind} không đủ điều kiện.` });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: `${card.id}-source`, captureVersionId: capture.id, quoteText: `Bằng chứng ${kind} không đủ điều kiện.` });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toEqual({ cardId: card.id, indexed: false });
    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id))).resolves.toEqual([]);
  });

  test("rejects evidence from a source not linked to its card", async () => {
    await createUser("unlinked-evidence-operator", ["operator"]);
    const card = await createApprovedCardWithSource("unlinked-evidence-operator", "unlinked-evidence-card");
    const [unlinkedSource] = await testDb.insert(sources).values({ id: "unlinked-evidence-source", kind: "url", url: "https://example.com/unlinked", canonicalUrl: "https://example.com/unlinked", label: "Nguồn không liên kết", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "unlinked-evidence-operator" }).returning();
    const capture = await seedSourceCaptureVersion({ sourceId: unlinkedSource.id, captureKind: "url", rawText: "Bằng chứng không thuộc thẻ." });

    await expect(seedKnowledgeCardEvidence({ cardId: card.id, sourceId: unlinkedSource.id, captureVersionId: capture.id, quoteText: "Bằng chứng không thuộc thẻ." })).rejects.toMatchObject({ cause: expect.objectContaining({ constraint_name: "knowledge_card_evidence_card_source_fk" }) });
  });

  test("does not let legacy status or needs-review fields change a valid state-aware result", async () => {
    await createUser("legacy-lifecycle-operator", ["operator"]);
    const cards = await Promise.all(["draft", "rejected", "needs-review"].map((suffix) => createApprovedCardWithSource("legacy-lifecycle-operator", `legacy-${suffix}-card`)));
    await testDb.update(knowledgeCards).set({ status: "draft", needsReview: true }).where(eq(knowledgeCards.id, cards[0]!.id));
    await testDb.update(knowledgeCards).set({ status: "rejected", needsReview: false }).where(eq(knowledgeCards.id, cards[1]!.id));
    await testDb.update(knowledgeCards).set({ needsReview: true }).where(eq(knowledgeCards.id, cards[2]!.id));

    for (const card of cards) {
      const sourceId = `${card.id}-source`;
      const capture = await seedSourceCaptureVersion({ sourceId, captureKind: "url", rawText: "Bằng chứng hợp lệ nhưng lifecycle không hợp lệ." });
      await seedKnowledgeCardEvidence({ cardId: card.id, sourceId, captureVersionId: capture.id, quoteText: "Bằng chứng hợp lệ nhưng lifecycle không hợp lệ." });
      await expect(enqueueAndProcessIndexWork(card.id)).resolves.toMatchObject({ indexedCount: 1 });
    }
    await expect((await import("@/features/knowledge/search")).searchApprovedKnowledge("Huế")).resolves.toHaveLength(3);
  });

  test.each([
    { description: "conflicted knowledge", update: { knowledgeState: "conflicted" as const } },
    { description: "superseded knowledge", update: { knowledgeState: "superseded" as const } },
    { description: "failed verification", update: { verificationState: "failed" as const } },
  ])("fails closed for $description despite valid evidence", async ({ description, update }) => {
    const id = description.replaceAll(" ", "-");
    await createUser(`ineligible-${id}`, ["operator"]);
    const card = await createApprovedCardWithSource(`ineligible-${id}`, `ineligible-${id}-card`);
    const sourceId = `${card.id}-source`;
    const capture = await seedSourceCaptureVersion({ sourceId, captureKind: "url", rawText: "Bằng chứng hợp lệ nhưng trạng thái không đủ điều kiện." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId, captureVersionId: capture.id, quoteText: "Bằng chứng hợp lệ nhưng trạng thái không đủ điều kiện." });
    await testDb.update(knowledgeCards).set(update).where(eq(knowledgeCards.id, card.id));
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toEqual({ cardId: card.id, indexed: false });
    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
  });

  test("excludes operator-only evidence from traveler eligibility and disables its projection", async () => {
    await createUser("policy-operator", ["operator"]);
    const card = await createApprovedCardWithSource("policy-operator", "policy-card");
    const capture = await seedSourceCaptureVersion({ sourceId: "policy-card-source", captureKind: "url", rawText: "Chi tiết evidence chỉ dành cho vận hành." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "policy-card-source", captureVersionId: capture.id, quoteText: "Chi tiết evidence chỉ dành cho vận hành.", displayPolicy: "operator_only" });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toEqual({ cardId: card.id, indexed: false });
    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
  });

  test("does not serialize operator-only sources when fact-only evidence independently supports the card", async () => {
    await createUser("multi-policy-operator", ["operator"]);
    const card = await createApprovedCardWithSource("multi-policy-operator", "multi-policy-card");
    const [operatorSource] = await testDb.insert(sources).values({ id: "multi-policy-operator-source", kind: "url", url: "https://private.example/operator-token", canonicalUrl: "https://private.example/operator-canonical-token", label: "Nguồn nội bộ", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "multi-policy-operator" }).returning();
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: operatorSource!.id, supportLevel: "supporting" });
    const factCapture = await seedSourceCaptureVersion({ sourceId: "multi-policy-card-source", captureKind: "url", rawText: "Bằng chứng công khai." });
    const operatorCapture = await seedSourceCaptureVersion({ sourceId: operatorSource!.id, captureKind: "url", rawText: "Bằng chứng nội bộ." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "multi-policy-card-source", captureVersionId: factCapture.id, quoteText: "Bằng chứng công khai.", displayPolicy: "fact_only" });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: operatorSource!.id, captureVersionId: operatorCapture.id, quoteText: "Bằng chứng nội bộ.", displayPolicy: "operator_only" });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await enqueueAndProcessIndexWork(card.id);
    const [result] = await searchApprovedKnowledge("Huế");
    expect(result?.sources).toEqual([expect.objectContaining({ id: "multi-policy-card-source", url: "https://example.com/card", canonicalUrl: "https://example.com/card" })]);
    expect(JSON.stringify(result)).not.toContain("operator-token");
  });

  test("includes only linked sources with valid evidence in citations and searchable text", async () => {
    await createUser("validated-source-operator", ["operator"]);
    const card = await createApprovedCardWithSource("validated-source-operator", "validated-source-card");
    const [unvalidatedSource] = await testDb.insert(sources).values({ id: "unvalidated-linked-source", kind: "url", url: "https://example.com/unvalidated-citation-token", canonicalUrl: "https://example.com/unvalidated-canonical-token", label: "Nguồn chưa xác minh", publisher: "Unvalidated Publisher", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "validated-source-operator" }).returning();
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: unvalidatedSource!.id, supportLevel: "supporting" });
    const capture = await seedSourceCaptureVersion({ sourceId: "validated-source-card-source", captureKind: "url", rawText: "Bằng chứng fact-only hợp lệ." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "validated-source-card-source", captureVersionId: capture.id, quoteText: "Bằng chứng fact-only hợp lệ.", displayPolicy: "fact_only" });
    const { searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(enqueueAndProcessIndexWork(card.id)).resolves.toMatchObject({ indexedCount: 1 });
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
    const { searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(enqueueAndProcessIndexWork(card.id)).resolves.toMatchObject({ indexedCount: 1 });
    const [result] = await searchApprovedKnowledge("Huế");
    expect(result?.sources).toEqual([expect.objectContaining({ id: "historical-capture-card-source", url: null, canonicalUrl: null })]);
  });

  test("selects evidence deterministically and never projects Facebook or sensitive traveler-visible content", async () => {
    await createUser("deterministic-evidence-operator", ["operator"]);
    const card = await createApprovedCardWithSource("deterministic-evidence-operator", "deterministic-evidence-card");
    const [facebookSource] = await testDb.insert(sources).values({ id: "deterministic-facebook-source", kind: "facebook", url: "https://facebook.com/deterministic-private", canonicalUrl: "https://facebook.com/deterministic-private", label: "Facebook", sourceType: "community", verificationStatus: "unverified", submittedByUserId: "deterministic-evidence-operator" }).returning();
    const [laterPrimarySource] = await testDb.insert(sources).values({ id: "deterministic-later-primary-source", kind: "url", url: "https://example.com/later-primary", canonicalUrl: "https://example.com/later-primary", label: "Nguồn chính muộn", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "deterministic-evidence-operator" }).returning();
    const [supportingSource] = await testDb.insert(sources).values({ id: "deterministic-supporting-source", kind: "url", url: "https://example.com/supporting", canonicalUrl: "https://example.com/supporting", label: "Nguồn hỗ trợ", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "deterministic-evidence-operator" }).returning();
    await testDb.insert(knowledgeCardSources).values([{ knowledgeCardId: card.id, sourceId: facebookSource!.id, supportLevel: "primary" }, { knowledgeCardId: card.id, sourceId: laterPrimarySource!.id, supportLevel: "primary" }, { knowledgeCardId: card.id, sourceId: supportingSource!.id, supportLevel: "supporting" }]);
    const baseCapture = await seedSourceCaptureVersion({ sourceId: `${card.id}-source`, captureKind: "url", rawText: "Nguồn chính sớm." });
    const facebookCapture = await seedSourceCaptureVersion({ sourceId: facebookSource!.id, captureKind: "facebook", rawText: "Liên hệ 0901234567 qua Facebook." });
    const laterPrimaryCapture = await seedSourceCaptureVersion({ sourceId: laterPrimarySource!.id, captureKind: "url", rawText: "Nguồn chính muộn." });
    const supportingCapture = await seedSourceCaptureVersion({ sourceId: supportingSource!.id, captureKind: "url", rawText: "Nguồn hỗ trợ." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: `${card.id}-source`, captureVersionId: baseCapture.id, quoteText: "Nguồn chính sớm.", displayPolicy: "traveler_visible", supportLevel: "primary", observedAt: new Date("2026-07-01T00:00:00.000Z") });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: facebookSource!.id, captureVersionId: facebookCapture.id, quoteText: "Liên hệ 0901234567 qua Facebook.", displayPolicy: "traveler_visible", supportLevel: "primary", observedAt: new Date("2026-07-03T00:00:00.000Z") });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: laterPrimarySource!.id, captureVersionId: laterPrimaryCapture.id, quoteText: "Nguồn chính muộn.", displayPolicy: "traveler_visible", supportLevel: "primary", observedAt: new Date("2026-07-02T00:00:00.000Z") });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: supportingSource!.id, captureVersionId: supportingCapture.id, quoteText: "Nguồn hỗ trợ.", displayPolicy: "traveler_visible", supportLevel: "supporting", observedAt: new Date("2026-07-04T00:00:00.000Z") });
    const { searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await enqueueAndProcessIndexWork(card.id);
    const [first] = await searchApprovedKnowledge("Huế");
    const [second] = await searchApprovedKnowledge("Huế");

    expect(first?.evidence?.map((evidence) => evidence.sourceId)).toEqual([facebookSource!.id, laterPrimarySource!.id, `${card.id}-source`, supportingSource!.id]);
    expect(second?.evidence).toEqual(first?.evidence);
    expect(JSON.stringify(first?.evidence)).not.toContain("facebook.com/deterministic-private");
    expect(JSON.stringify(first?.evidence)).not.toContain("0901234567");
  });

  test("does not add operator-only source URLs to the lexical search projection", async () => {
    await createUser("lexical-policy-operator", ["operator"]);
    const card = await createApprovedCardWithSource("lexical-policy-operator", "lexical-policy-card");
    await testDb.update(sources).set({ url: "https://private.example/lexical-secret-token", canonicalUrl: "https://private.example/lexical-canonical-secret-token" }).where(eq(sources.id, "lexical-policy-card-source"));
    const capture = await seedSourceCaptureVersion({ sourceId: "lexical-policy-card-source", captureKind: "url", rawText: "Bằng chứng nội bộ chỉ dành cho vận hành." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "lexical-policy-card-source", captureVersionId: capture.id, quoteText: "Bằng chứng nội bộ chỉ dành cho vận hành.", displayPolicy: "operator_only" });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toEqual({ cardId: card.id, indexed: false });
    const [document] = await testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id));
    expect(document).toBeUndefined();
    await expect(searchApprovedKnowledge("lexical-secret-token")).resolves.toEqual([]);
  });

  test("does not project credential-bearing traveler-visible evidence URLs", async () => {
    await createUser("credential-url-operator", ["operator"]);
    const card = await createApprovedCardWithSource("credential-url-operator", "credential-url-card");
    await testDb.update(sources).set({ url: "https://api-user:api-token@example.com/notice", canonicalUrl: "https://api-user:api-token@example.com/notice" }).where(eq(sources.id, "credential-url-card-source"));
    const capture = await seedSourceCaptureVersion({ sourceId: "credential-url-card-source", captureKind: "url", rawText: "Bằng chứng công khai không được lộ thông tin đăng nhập." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "credential-url-card-source", captureVersionId: capture.id, quoteText: "Bằng chứng công khai không được lộ thông tin đăng nhập.", displayPolicy: "traveler_visible" });

    await enqueueAndProcessIndexWork(card.id);
    const [result] = await (await import("@/features/knowledge/search")).searchApprovedKnowledge("Huế");

    expect(result?.evidence).toEqual([expect.objectContaining({ displayPolicy: "fact_only", url: null, quote: null })]);
    expect(JSON.stringify(result?.evidence)).not.toContain("api-user");
    expect(JSON.stringify(result?.evidence)).not.toContain("api-token");
  });

  test("refreshes an active projection after evidence becomes operator-only", async () => {
    await createUser("policy-refresh-operator", ["operator"]);
    const card = await createApprovedCardWithSource("policy-refresh-operator", "policy-refresh-card");
    await testDb.update(sources).set({ url: "https://private.example/refresh-secret-token", canonicalUrl: "https://private.example/refresh-canonical-secret-token" }).where(eq(sources.id, "policy-refresh-card-source"));
    const capture = await seedSourceCaptureVersion({ sourceId: "policy-refresh-card-source", captureKind: "url", rawText: "Bằng chứng thay đổi chính sách hiển thị." });
    const evidence = await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "policy-refresh-card-source", captureVersionId: capture.id, quoteText: "Bằng chứng thay đổi chính sách hiển thị." });
    const { indexApprovedKnowledgeCard, searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await enqueueAndProcessIndexWork(card.id);
    await expect(searchApprovedKnowledge("refresh-secret-token")).resolves.toEqual([]);
    await testDb.update(knowledgeCardEvidence).set({ displayPolicy: "operator_only" }).where(eq(knowledgeCardEvidence.id, evidence.id));

    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
    const [document] = await testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id));
    expect(document).toMatchObject({ status: "active", disabledAt: null });
    await expect(searchApprovedKnowledge("refresh-secret-token")).resolves.toEqual([]);
  });

  test("uses PostgreSQL character offsets for Unicode evidence spans", async () => {
    await createUser("unicode-evidence-operator", ["operator"]);
    const card = await createApprovedCardWithSource("unicode-evidence-operator", "unicode-evidence-card");
    const capture = await seedSourceCaptureVersion({ sourceId: "unicode-evidence-card-source", captureKind: "url", rawText: "🚗 Bãi đỗ xe có mái che." });
    await expect(seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "unicode-evidence-card-source", captureVersionId: capture.id, quoteText: "🚗 Bãi đỗ xe có mái che." })).resolves.toMatchObject({ spanEnd: 23 });

    await expect(enqueueAndProcessIndexWork(card.id)).resolves.toMatchObject({ indexedCount: 1 });
  });

  test("indexes when a valid evidence row exists after an invalid active row", async () => {
    await createUser("mixed-evidence-operator", ["operator"]);
    const card = await createApprovedCardWithSource("mixed-evidence-operator", "mixed-evidence-card");
    const capture = await seedSourceCaptureVersion({ sourceId: "mixed-evidence-card-source", captureKind: "url", rawText: "Bằng chứng hợp lệ sau cùng." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "mixed-evidence-card-source", captureVersionId: capture.id, quoteText: "Bằng chứng không khớp.", independenceKey: "invalid-evidence" });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "mixed-evidence-card-source", captureVersionId: capture.id, quoteText: "Bằng chứng hợp lệ sau cùng.", independenceKey: "valid-evidence" });
    const { searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(enqueueAndProcessIndexWork(card.id)).resolves.toMatchObject({ indexedCount: 1 });
    await expect(searchApprovedKnowledge("Huế")).resolves.toHaveLength(1);
  });

  test("returns typed caveat-only policy for uncertain and verification-required cards", async () => {
    await createUser("caveat-operator", ["operator"]);
    const uncertain = await createApprovedCardWithSource("caveat-operator", "uncertain-caveat-card");
    const required = await createApprovedCardWithSource("caveat-operator", "required-caveat-card");
    await testDb.update(knowledgeCards).set({ knowledgeState: "community_observation", verificationState: "required" }).where(eq(knowledgeCards.id, required.id));
    for (const card of [uncertain, required]) {
      const capture = await seedSourceCaptureVersion({ sourceId: `${card.id}-source`, captureKind: "url", rawText: "Bằng chứng an toàn có điều kiện." });
      await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: `${card.id}-source`, captureVersionId: capture.id, quoteText: "Bằng chứng an toàn có điều kiện." });
      await enqueueAndProcessIndexWork(card.id);
    }

    const results = await (await import("@/features/knowledge/search")).searchApprovedKnowledge("Huế");
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: uncertain.id, policy: "caveat_only" }),
      expect.objectContaining({ id: required.id, policy: "caveat_only" }),
    ]));
  });

  test("requires two distinct traveler-safe independence keys for a community pattern", async () => {
    await createUser("pattern-operator", ["operator"]);
    const card = await createApprovedCardWithSource("pattern-operator", "pattern-card");
    await testDb.update(knowledgeCards).set({ knowledgeState: "community_pattern" }).where(eq(knowledgeCards.id, card.id));
    const [secondSource] = await testDb.insert(sources).values({ id: "pattern-second-source", kind: "url", url: "https://example.com/pattern-second", canonicalUrl: "https://example.com/pattern-second", label: "Nguồn pattern thứ hai", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "pattern-operator" }).returning();
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: secondSource!.id, supportLevel: "supporting" });
    const firstCapture = await seedSourceCaptureVersion({ sourceId: `${card.id}-source`, captureKind: "url", rawText: "Bằng chứng pattern một." });
    const secondCapture = await seedSourceCaptureVersion({ sourceId: secondSource!.id, captureKind: "url", rawText: "Bằng chứng pattern hai." });
    const first = await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: `${card.id}-source`, captureVersionId: firstCapture.id, quoteText: "Bằng chứng pattern một.", independenceKey: "independent-one" });
    await expect((await import("@/features/knowledge/search")).indexApprovedKnowledgeCard(card.id)).resolves.toEqual({ cardId: card.id, indexed: false });
    const second = await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: secondSource!.id, captureVersionId: secondCapture.id, quoteText: "Bằng chứng pattern hai.", independenceKey: "independent-two" });
    await testDb.update(knowledgeCards).set({ contentVersion: 2 }).where(eq(knowledgeCards.id, card.id));
    await expect(enqueueAndProcessIndexWork(card.id)).resolves.toMatchObject({ indexedCount: 1 });
    await testDb.update(knowledgeCardEvidence).set({ state: "removed" }).where(eq(knowledgeCardEvidence.id, second.id));
    await expect((await import("@/features/knowledge/search")).searchApprovedKnowledge("Huế")).resolves.toEqual([]);
    expect(first.id).toBeTruthy();
  });

  test("indexing worker disables a stale community-pattern projection after independent support is withdrawn", async () => {
    await createUser("worker-pattern-operator", ["operator"]);
    const card = await createApprovedCardWithSource("worker-pattern-operator", "worker-pattern-card");
    await testDb.update(knowledgeCards).set({ knowledgeState: "community_pattern" }).where(eq(knowledgeCards.id, card.id));
    const [secondSource] = await testDb.insert(sources).values({ id: "worker-pattern-second-source", kind: "url", url: "https://example.com/worker-pattern-second", canonicalUrl: "https://example.com/worker-pattern-second", label: "Nguồn pattern thứ hai", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "worker-pattern-operator" }).returning();
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: card.id, sourceId: secondSource!.id, supportLevel: "supporting" });
    const firstCapture = await seedSourceCaptureVersion({ sourceId: "worker-pattern-card-source", captureKind: "url", rawText: "Bằng chứng pattern worker một." });
    const secondCapture = await seedSourceCaptureVersion({ sourceId: secondSource!.id, captureKind: "url", rawText: "Bằng chứng pattern worker hai." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "worker-pattern-card-source", captureVersionId: firstCapture.id, quoteText: "Bằng chứng pattern worker một.", independenceKey: "worker-independent-one" });
    const secondEvidence = await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: secondSource!.id, captureVersionId: secondCapture.id, quoteText: "Bằng chứng pattern worker hai.", independenceKey: "worker-independent-two" });
    await expect(enqueueAndProcessIndexWork(card.id)).resolves.toMatchObject({ indexedCount: 1 });
    await testDb.update(knowledgeCardEvidence).set({ state: "removed" }).where(eq(knowledgeCardEvidence.id, secondEvidence.id));
    await testDb.update(knowledgeIndexDirtyMarkers).set({ status: "pending", nextRunAt: new Date(0) }).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, card.id));
    const { processNextApprovedKnowledgeIndexingBatch } = await import("@/features/knowledge/indexing-worker");

    await expect(processNextApprovedKnowledgeIndexingBatch({}, testDb)).resolves.toEqual({ status: "indexed", indexedCount: 0, skippedCount: 1, cardIds: [card.id] });
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id))).resolves.toMatchObject([{ status: "disabled" }]);
  });

  test.each([
    { description: "more than 12 conditions", conditions: Array.from({ length: 13 }, (_, index) => `điều kiện ${index + 1}`) },
    { description: "a condition longer than 160 characters", conditions: ["x".repeat(161)] },
  ])("excludes cards with $description", async ({ conditions }) => {
    await createUser(`condition-${conditions.length}-operator`, ["operator"]);
    const card = await createApprovedCardWithSource(`condition-${conditions.length}-operator`, `condition-${conditions.length}-card`);
    const capture = await seedSourceCaptureVersion({ sourceId: `${card.id}-source`, captureKind: "url", rawText: "Bằng chứng điều kiện hợp lệ." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: `${card.id}-source`, captureVersionId: capture.id, quoteText: "Bằng chứng điều kiện hợp lệ." });
    await testDb.update(knowledgeCards).set({ conditions }).where(eq(knowledgeCards.id, card.id));
    const { indexApprovedKnowledgeCard } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard(card.id)).resolves.toEqual({ cardId: card.id, indexed: false });
  });

  test("disables a projection when supporting evidence is removed", async () => {
    await createUser("invalid-evidence-operator", ["operator"]);
    const card = await createApprovedCardWithSource("invalid-evidence-operator", "invalid-evidence-card");
    const capture = await seedSourceCaptureVersion({ sourceId: "invalid-evidence-card-source", captureKind: "url", rawText: "Dữ liệu xác minh chính xác." });
    const evidence = await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: "invalid-evidence-card-source", captureVersionId: capture.id, quoteText: "Dữ liệu xác minh chính xác." });
    const { searchApprovedKnowledge } = await import("@/features/knowledge/search");
    await enqueueAndProcessIndexWork(card.id);
    await testDb.update(knowledgeCardEvidence).set({ state: "removed" }).where(eq(knowledgeCardEvidence.id, evidence.id));

    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id))).resolves.toMatchObject([{ status: "active" }]);
    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.id, capture.id))).resolves.toHaveLength(1);
  });

  test("disables a stale active projection after owner-row eligibility recheck", async () => {
    await createUser("stale-operator", ["operator"]);
    const card = await createApprovedCardWithSource("stale-operator", "stale-projection-card");
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: card.id, status: "active", searchableText: "Điểm dừng tại Huế", textHash: "a".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false });
    const { searchApprovedKnowledge } = await import("@/features/knowledge/search");

    await expect(searchApprovedKnowledge("Huế")).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id))).resolves.toMatchObject([{ status: "active", disabledAt: null }]);
  });

  test("indexing worker disables an active document when its active card becomes state-ineligible", async () => {
    await createUser("worker-state-operator", ["operator"]);
    const card = await createApprovedCardWithSource("worker-state-operator", "worker-superseded-card");
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: card.id, status: "active", searchableText: "Điểm dừng tại Huế", textHash: "d".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false });
    await testDb.update(knowledgeCards).set({ knowledgeState: "superseded" }).where(eq(knowledgeCards.id, card.id));
    await enqueueIndexWork(card.id, "superseded");
    const { processNextApprovedKnowledgeIndexingBatch } = await import("@/features/knowledge/indexing-worker");

    await expect(processNextApprovedKnowledgeIndexingBatch({}, testDb)).resolves.toEqual({ status: "indexed", indexedCount: 0, skippedCount: 1, cardIds: [card.id] });
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id))).resolves.toMatchObject([{ status: "disabled" }]);
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
    await enqueueIndexWork(stale.id, "legacy_stale");
    const { processNextApprovedKnowledgeIndexingBatch } = await import("@/features/knowledge/indexing-worker");

    await expect(processNextApprovedKnowledgeIndexingBatch({}, testDb)).resolves.toEqual({ status: "indexed", indexedCount: 0, skippedCount: 1, cardIds: [stale.id] });
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, missing.id))).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, disabled.id))).resolves.toMatchObject([{ status: "disabled" }]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, stale.id))).resolves.toMatchObject([{ status: "disabled" }]);
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
    await enqueueAndProcessIndexWork(current.id);
    await enqueueIndexWork(pending.id, "pending");
    const { processNextApprovedKnowledgeIndexingBatch } = await import("@/features/knowledge/indexing-worker");

    await expect(processNextApprovedKnowledgeIndexingBatch({ batchSize: 1 }, testDb)).resolves.toMatchObject({ cardIds: [pending.id], indexedCount: 1 });
  });

  test.each([
    { id: "active-confirmed", update: { knowledgeState: "community_observation" as const }, expectedPolicy: "contextual_use" },
    { id: "active-conditional", update: { knowledgeState: "conditional" as const, conditions: ["Chỉ đi khi trời khô"] }, expectedPolicy: "contextual_use" },
    { id: "active-uncertain", update: { knowledgeState: "uncertain" as const }, expectedPolicy: "caveat_only" },
    { id: "verification-required", update: { knowledgeState: "community_observation" as const, verificationState: "required" as const }, expectedPolicy: "caveat_only" },
    { id: "conflicted", update: { knowledgeState: "conflicted" as const }, expectedPolicy: null },
    { id: "superseded", update: { knowledgeState: "superseded" as const }, expectedPolicy: null },
    { id: "archived", update: { knowledgeState: "confirmed" as const, publicationState: "archived" as const }, expectedPolicy: null },
  ])("applies the traveler policy matrix for $id without exposing raw source material", async ({ id, update, expectedPolicy }) => {
    await createUser(`${id}-operator`, ["operator"]);
    const card = await createApprovedCardWithSource(`${id}-operator`, `${id}-card`);
    const capture = await seedSourceCaptureVersion({ sourceId: `${card.id}-source`, captureKind: "url", rawText: `Raw material for ${id} must not reach travelers.` });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: `${card.id}-source`, captureVersionId: capture.id, quoteText: `Raw material for ${id} must not reach travelers.` });
    await testDb.update(knowledgeCards).set(update).where(eq(knowledgeCards.id, card.id));

    await enqueueAndProcessIndexWork(card.id);
    const results = await (await import("@/features/knowledge/search")).searchApprovedKnowledge("Huế");
    const result = results.find((item) => item.id === card.id);

    if (expectedPolicy) {
      expect(result).toMatchObject({ policy: expectedPolicy });
      expect(JSON.stringify(result)).not.toContain("Raw material for");
    } else {
      expect(result).toBeUndefined();
    }
  });

  test("a claimed old version cannot reactivate a projection after source withdrawal", async () => {
    await createUser("withdrawal-race-operator", ["operator"]);
    const card = await createApprovedCardWithSource("withdrawal-race-operator", "withdrawal-race-card");
    const capture = await seedSourceCaptureVersion({ sourceId: `${card.id}-source`, captureKind: "url", rawText: "Evidence that will be withdrawn." });
    await seedKnowledgeCardEvidence({ cardId: card.id, sourceId: `${card.id}-source`, captureVersionId: capture.id, quoteText: "Evidence that will be withdrawn." });
    await enqueueAndProcessIndexWork(card.id);
    await testDb.update(knowledgeCards).set({ contentVersion: 2 }).where(eq(knowledgeCards.id, card.id));
    await enqueueIndexWork(card.id, "race-before-withdrawal");
    const { claimNextKnowledgeIndexWork, completeKnowledgeIndexWork } = await import("@/features/knowledge/indexing-worker");
    const claim = await claimNextKnowledgeIndexWork({ workerId: "withdrawal-race-worker" }, testDb);
    if (!claim) throw new Error("Expected indexing claim");
    const { removeKnowledgeSource } = await import("@/features/knowledge/source-removal");

    await removeKnowledgeSource({ sourceId: `${card.id}-source`, reason: "withdrawn", actor: { userId: "withdrawal-race-operator", email: "withdrawal-race-operator@example.com" } }, testDb);
    const result = await (await import("@/features/knowledge/search")).projectClaimedKnowledgeIndexWork(claim, testDb);

    expect(result).toMatchObject({ indexed: false, outcome: "superseded" });
    await completeKnowledgeIndexWork(claim, result.outcome, testDb);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id))).resolves.toMatchObject([{ status: "disabled" }]);
  });

  test("index worker retry records keep failure details safe and bounded", async () => {
    await createUser("safe-retry-operator", ["operator"]);
    const card = await createApprovedCardWithSource("safe-retry-operator", "safe-retry-card");
    await enqueueIndexWork(card.id, "safe-retry");
    const { claimNextKnowledgeIndexWork, retryKnowledgeIndexWork } = await import("@/features/knowledge/indexing-worker");
    const claim = await claimNextKnowledgeIndexWork({ workerId: "safe-retry-worker" }, testDb);
    if (!claim) throw new Error("Expected indexing claim");

    await expect(retryKnowledgeIndexWork(claim, "projection_failed", testDb)).resolves.toBe(true);
    const [marker] = await testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.id, claim.markerId));

    expect(marker).toMatchObject({ status: "pending", failureCode: "projection_failed", failureReason: "Projection worker failed; retry is scheduled.", claimedBy: null, fencingToken: null });
    expect(marker?.failureReason).not.toContain(card.id);
    expect(marker?.failureReason?.length).toBeLessThanOrEqual(200);
  });
});
