import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { knowledgeCardSearchDocuments, knowledgeCards, knowledgeIndexDirtyMarkers, users } from "@/db/schema";
import { backfillKnowledgeIndexWork, claimNextKnowledgeIndexWork, completeKnowledgeIndexWork, processNextApprovedKnowledgeIndexingBatch, recoverExpiredKnowledgeIndexWork } from "@/features/knowledge/indexing-worker";
import { testDb } from "./helpers/db";

async function createMarker(id: string) {
  await testDb.insert(users).values({ id: "index-worker-user", email: "index-worker@example.com" }).onConflictDoNothing();
  await testDb.insert(knowledgeCards).values({ id, type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Tóm tắt an toàn.", aiPromptVersion: "test", createdByUserId: "index-worker-user" });
  await testDb.insert(knowledgeIndexDirtyMarkers).values({ knowledgeCardId: id, contentVersion: 1, evidenceSetRevision: 1, reason: "test", nextRunAt: new Date(0) });
}

describe("versioned knowledge indexing work", () => {
  test("reclaims an expired lease with a new fence and rejects the old worker completion", async () => {
    await createMarker("fenced-marker");
    const first = await claimNextKnowledgeIndexWork({ workerId: "old-worker" }, testDb);
    expect(first?.fencingToken).toMatch(/^[a-f0-9]{64}$/);
    if (!first) throw new Error("Expected first claim");
    const expiredAt = new Date(first.leaseExpiresAt.getTime() + 1);
    await recoverExpiredKnowledgeIndexWork(testDb, expiredAt);
    const second = await claimNextKnowledgeIndexWork({ workerId: "new-worker", now: expiredAt }, testDb);
    expect(second?.fencingToken).toMatch(/^[a-f0-9]{64}$/);
    expect(second?.fencingToken).not.toBe(first.fencingToken);
    expect(await completeKnowledgeIndexWork(first, "indexed", testDb, expiredAt)).toBe(false);
    const [marker] = await testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.id, second?.markerId ?? ""));
    expect(marker).toMatchObject({ status: "claimed", claimedBy: "new-worker" });
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
});
