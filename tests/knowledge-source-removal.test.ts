import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, knowledgeCardEvidence, knowledgeCardSearchDocuments, knowledgeCards, knowledgeIndexDirtyMarkers, knowledgeCardSources, sourceCaptureVersions, sources, users } from "@/db/schema";
import { removeKnowledgeSource } from "@/features/knowledge/source-removal";

import { resetTestDatabase, testDb } from "./helpers/db";
import { seedKnowledgeCardEvidence, seedSourceCaptureVersion } from "./helpers/source-captures";

async function source(id: string) {
  await testDb.insert(sources).values({ id, kind: "url", url: `https://example.com/${id}`, canonicalUrl: `https://example.com/${id}`, label: id, sourceType: "curated", verificationStatus: "verified", submittedByUserId: "operator" });
}

async function card(id: string) {
  await testDb.insert(knowledgeCards).values({ id, status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: id, locationName: "Huế", summary: "Điểm dừng hợp lệ.", confidence: "curated", needsReview: false, aiPromptVersion: "test", createdByUserId: "operator" });
}

describe("knowledge source removal", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
  });

  test("withdraws evidence, suppresses unsupported cards, disables projections, and tombstones payloads atomically", async () => {
    await source("removed-source"); await card("removed-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "removed-card", sourceId: "removed-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "removed-source", captureKind: "url", rawText: "Bằng chứng bị gỡ." });
    await seedKnowledgeCardEvidence({ cardId: "removed-card", sourceId: "removed-source", captureVersionId: capture.id, quoteText: "Bằng chứng bị gỡ." });
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: "removed-card", status: "active", searchableText: "Huế", textHash: "a".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false });

    await expect(removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "completed", sourceId: "removed-source", changedCardIds: ["removed-card"] });
    await expect(testDb.select({ eligibility: sources.eligibility, removalReason: sources.removalReason, current: sources.currentCaptureVersionId }).from(sources).where(eq(sources.id, "removed-source"))).resolves.toEqual([{ eligibility: "withdrawn", removalReason: "withdrawn", current: null }]);
    await expect(testDb.select({ state: knowledgeCardEvidence.state }).from(knowledgeCardEvidence)).resolves.toEqual([{ state: "removed" }]);
    await expect(testDb.select({ publicationState: knowledgeCards.publicationState, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, "removed-card"))).resolves.toEqual([{ publicationState: "suppressed", evidenceSetRevision: 2 }]);
    await expect(testDb.select({ status: knowledgeCardSearchDocuments.status }).from(knowledgeCardSearchDocuments)).resolves.toEqual([{ status: "disabled" }]);
    await expect(testDb.select({ rawText: sourceCaptureVersions.rawText, rawMetadata: sourceCaptureVersions.rawMetadata }).from(sourceCaptureVersions)).resolves.toEqual([{ rawText: null, rawMetadata: null }]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers)).resolves.toHaveLength(1);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_source_removal"))).resolves.toHaveLength(1);
    await expect(removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "already_completed" });
  });

  test("does not reactivate the disabled projection when indexing runs after source removal", async () => {
    await source("reindexed-removed-source"); await card("reindexed-removed-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "reindexed-removed-card", sourceId: "reindexed-removed-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "reindexed-removed-source", captureKind: "url", rawText: "Bằng chứng cần được xóa khỏi index." });
    await seedKnowledgeCardEvidence({ cardId: "reindexed-removed-card", sourceId: "reindexed-removed-source", captureVersionId: capture.id, quoteText: "Bằng chứng cần được xóa khỏi index." });
    const { indexApprovedKnowledgeCard } = await import("@/features/knowledge/search");

    await expect(indexApprovedKnowledgeCard("reindexed-removed-card")).resolves.toMatchObject({ indexed: true });
    await removeKnowledgeSource({ sourceId: "reindexed-removed-source", reason: "removed", actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await expect(indexApprovedKnowledgeCard("reindexed-removed-card")).resolves.toEqual({ cardId: "reindexed-removed-card", indexed: false });
    await expect(testDb.select({ status: knowledgeCardSearchDocuments.status }).from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, "reindexed-removed-card"))).resolves.toEqual([{ status: "disabled" }]);
  });

  test("keeps a card active when an eligible independent source still supports it", async () => {
    await source("removed-source"); await source("remaining-source"); await card("supported-card");
    await testDb.insert(knowledgeCardSources).values([{ knowledgeCardId: "supported-card", sourceId: "removed-source", supportLevel: "primary" }, { knowledgeCardId: "supported-card", sourceId: "remaining-source", supportLevel: "supporting" }]);
    const removed = await seedSourceCaptureVersion({ sourceId: "removed-source", captureKind: "url", rawText: "Bằng chứng bị gỡ." });
    const remaining = await seedSourceCaptureVersion({ sourceId: "remaining-source", captureKind: "url", rawText: "Bằng chứng còn hiệu lực." });
    await seedKnowledgeCardEvidence({ cardId: "supported-card", sourceId: "removed-source", captureVersionId: removed.id, quoteText: "Bằng chứng bị gỡ." });
    await seedKnowledgeCardEvidence({ cardId: "supported-card", sourceId: "remaining-source", captureVersionId: remaining.id, quoteText: "Bằng chứng còn hiệu lực." });

    await removeKnowledgeSource({ sourceId: "removed-source", reason: "inaccessible", actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await expect(testDb.select({ publicationState: knowledgeCards.publicationState, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, "supported-card"))).resolves.toEqual([{ publicationState: "active", evidenceSetRevision: 2 }]);
  });

  test("downgrades a pattern when removal leaves only one independent supporting source", async () => {
    await source("removed-source"); await source("remaining-source"); await card("pattern-card");
    await testDb.update(knowledgeCards).set({ knowledgeState: "community_pattern" }).where(eq(knowledgeCards.id, "pattern-card"));
    await testDb.insert(knowledgeCardSources).values([{ knowledgeCardId: "pattern-card", sourceId: "removed-source", supportLevel: "primary" }, { knowledgeCardId: "pattern-card", sourceId: "remaining-source", supportLevel: "supporting" }]);
    const removed = await seedSourceCaptureVersion({ sourceId: "removed-source", captureKind: "url", rawText: "Bằng chứng bị gỡ." });
    const remaining = await seedSourceCaptureVersion({ sourceId: "remaining-source", captureKind: "url", rawText: "Bằng chứng còn hiệu lực." });
    await seedKnowledgeCardEvidence({ cardId: "pattern-card", sourceId: "removed-source", captureVersionId: removed.id, quoteText: "Bằng chứng bị gỡ.", independenceKey: "removed" });
    await seedKnowledgeCardEvidence({ cardId: "pattern-card", sourceId: "remaining-source", captureVersionId: remaining.id, quoteText: "Bằng chứng còn hiệu lực.", independenceKey: "remaining" });

    await removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await expect(testDb.select({ knowledgeState: knowledgeCards.knowledgeState, contentVersion: knowledgeCards.contentVersion }).from(knowledgeCards).where(eq(knowledgeCards.id, "pattern-card"))).resolves.toEqual([{ knowledgeState: "community_observation", contentVersion: 2 }]);
  });
});
