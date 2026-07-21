import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { knowledgeCardSearchDocuments, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";

import { testDb } from "./helpers/db";

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
});
