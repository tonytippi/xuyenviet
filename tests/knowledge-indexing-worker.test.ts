import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { knowledgeCards, knowledgeIndexDirtyMarkers, users } from "@/db/schema";
import { claimNextKnowledgeIndexWork, completeKnowledgeIndexWork, recoverExpiredKnowledgeIndexWork } from "@/features/knowledge/indexing-worker";
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
});
