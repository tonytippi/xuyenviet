import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { knowledgeCardSearchDocuments, knowledgeCards, knowledgeCardSources, knowledgeIndexBackfillState, knowledgeIndexDirtyMarkers, sources, users } from "@/db/schema";
import { backfillKnowledgeIndexWork, claimNextKnowledgeIndexWork, completeKnowledgeIndexWork, processNextApprovedKnowledgeIndexingBatch, recoverExpiredKnowledgeIndexWork, runKnowledgeIndexBackfill } from "@/features/knowledge/indexing-worker";
import { projectClaimedKnowledgeIndexWork } from "@/features/knowledge/search";
import { testDb } from "./helpers/db";
import { seedKnowledgeCardEvidence, seedSourceCaptureVersion } from "./helpers/source-captures";

async function createMarker(id: string) {
  await testDb.insert(users).values({ id: "index-worker-user", email: "index-worker@example.com" }).onConflictDoNothing();
  await testDb.insert(knowledgeCards).values({ id, type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Tóm tắt an toàn.", aiPromptVersion: "test", createdByUserId: "index-worker-user" });
  await testDb.insert(knowledgeIndexDirtyMarkers).values({ knowledgeCardId: id, contentVersion: 1, evidenceSetRevision: 1, reason: "test", nextRunAt: new Date(0) });
}

async function makeMarkerProjectable(id: string) {
  await createMarker(id);
  await testDb.update(knowledgeCards).set({ status: "approved", publicationState: "active", knowledgeState: "uncertain", reviewState: "reviewed", verificationState: "not_required", needsReview: false }).where(eq(knowledgeCards.id, id));
  await testDb.insert(sources).values({ id: `${id}-source`, kind: "url", url: `https://example.com/${id}`, canonicalUrl: `https://example.com/${id}`, label: "Nguồn chuẩn hóa", sourceType: "curated", verificationStatus: "verified", submittedByUserId: "index-worker-user" });
  await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: id, sourceId: `${id}-source`, supportLevel: "primary" });
  const capture = await seedSourceCaptureVersion({ sourceId: `${id}-source`, captureKind: "url", rawText: "Bằng chứng có thể lập chỉ mục." });
  await seedKnowledgeCardEvidence({ cardId: id, sourceId: `${id}-source`, captureVersionId: capture.id, quoteText: "Bằng chứng có thể lập chỉ mục." });
}

describe("versioned knowledge indexing work", () => {
  test("reclaims an expired lease with a new fence and rejects the old worker completion", async () => {
    await createMarker("fenced-marker");
    const first = await claimNextKnowledgeIndexWork({ workerId: "old-worker" }, testDb);
    expect(first?.fencingToken).toMatch(/^[a-f0-9]{64}$/);
    if (!first) throw new Error("Expected first claim");
    await testDb.update(knowledgeIndexDirtyMarkers).set({ leaseExpiresAt: new Date(0) }).where(eq(knowledgeIndexDirtyMarkers.id, first.markerId));
    await recoverExpiredKnowledgeIndexWork(testDb);
    const second = await claimNextKnowledgeIndexWork({ workerId: "new-worker" }, testDb);
    expect(second?.fencingToken).toMatch(/^[a-f0-9]{64}$/);
    expect(second?.fencingToken).not.toBe(first.fencingToken);
    expect(await completeKnowledgeIndexWork(first, "indexed", testDb)).toBe(false);
    const [marker] = await testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.id, second?.markerId ?? ""));
    expect(marker).toMatchObject({ status: "claimed", claimedBy: "new-worker" });
  });

  test("does not let a reclaimed stale claim insert a first active projection", async () => {
    await makeMarkerProjectable("stale-first-insert");
    const first = await claimNextKnowledgeIndexWork({ workerId: "old-worker" }, testDb);
    if (!first) throw new Error("Expected first claim");
    await testDb.update(knowledgeIndexDirtyMarkers).set({ leaseExpiresAt: new Date(0) }).where(eq(knowledgeIndexDirtyMarkers.id, first.markerId));
    await recoverExpiredKnowledgeIndexWork(testDb);
    const second = await claimNextKnowledgeIndexWork({ workerId: "new-worker" }, testDb);
    if (!second) throw new Error("Expected reclaimed claim");

    await expect(projectClaimedKnowledgeIndexWork(first, testDb)).resolves.toMatchObject({ outcome: "lost_claim", indexed: false });
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, first.cardId))).resolves.toEqual([]);
  });

  test("uses a fresh database clock when completing a later batch claim", async () => {
    await createMarker("fresh-completion");
    const claim = await claimNextKnowledgeIndexWork({ workerId: "worker" }, testDb);
    if (!claim) throw new Error("Expected claim");
    await expect(completeKnowledgeIndexWork(claim, "disabled", testDb)).resolves.toBe(true);
  });

  test("backfill queues only policy-eligible cards and disables an ineligible current projection", async () => {
    await createMarker("backfill-ineligible");
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: "backfill-ineligible", contentVersion: 1, acceptedFence: "legacy", status: "active", searchableText: "safe", textHash: "a".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false });
    await backfillKnowledgeIndexWork({}, testDb);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, "backfill-ineligible"))).resolves.toMatchObject([{ status: "disabled" }]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "backfill-ineligible"))).resolves.toMatchObject([{ status: "pending" }]);
    await expect(processNextApprovedKnowledgeIndexingBatch({}, testDb)).resolves.toMatchObject({ status: "indexed" });
  });

  test("persists a bounded backfill cursor and completes without restarting from the first card", async () => {
    const previousBatchSize = process.env.KNOWLEDGE_INDEXING_WORKER_BATCH_SIZE;
    process.env.KNOWLEDGE_INDEXING_WORKER_BATCH_SIZE = "1";
    try {
      await createMarker("backfill-cursor-a");
      await createMarker("backfill-cursor-b");
      const first = await runKnowledgeIndexBackfill(testDb);
      expect(first.processed).toBe(1);
      const [checkpoint] = await testDb.select().from(knowledgeIndexBackfillState);
      expect(checkpoint?.cursor).toBe("backfill-cursor-a");
      expect(checkpoint?.completedAt).toBeNull();

      const second = await runKnowledgeIndexBackfill(testDb);
      expect(second).toMatchObject({ processed: 1, cursor: "backfill-cursor-b" });
      const third = await runKnowledgeIndexBackfill(testDb);
      expect(third).toMatchObject({ processed: 0, cursor: null });
      await expect(testDb.select().from(knowledgeIndexBackfillState)).resolves.toMatchObject([{ cursor: null, completedAt: expect.any(Date) }]);
    } finally {
      if (previousBatchSize === undefined) delete process.env.KNOWLEDGE_INDEXING_WORKER_BATCH_SIZE;
      else process.env.KNOWLEDGE_INDEXING_WORKER_BATCH_SIZE = previousBatchSize;
    }
  });
});
