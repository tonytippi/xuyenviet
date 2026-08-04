import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import * as workerDatabase from "@xuyenviet/database";
import type { WorkerPollObservation } from "@xuyenviet/contracts";
import { knowledgeCardSearchDocuments, knowledgeCards, knowledgeCardSources, knowledgeIndexBackfillState, knowledgeIndexDirtyMarkers, sources, userRoles, users } from "@/db/schema";
import { backfillKnowledgeIndexWork, claimNextKnowledgeIndexWork, completeKnowledgeIndexWork, processNextApprovedKnowledgeIndexingBatch, recoverExpiredKnowledgeIndexWork, runApprovedKnowledgeIndexingWorkerLoop, runKnowledgeIndexBackfill } from "@/features/knowledge/indexing-worker";
import { projectClaimedKnowledgeIndexWork } from "@/features/knowledge/search";
import { enqueueKnowledgeIndexWork } from "@/features/knowledge/indexing-queue";
import { resetTestDatabase, testDb } from "./helpers/db";
import { seedKnowledgeCardEvidence, seedSourceCaptureVersion } from "./helpers/source-captures";

async function createMarker(id: string) {
  await testDb.insert(users).values({ id: "index-worker-user", email: "index-worker@example.com" }).onConflictDoNothing();
  await testDb.insert(userRoles).values({ userId: "index-worker-user", role: "operator" }).onConflictDoNothing();
  await testDb.insert(knowledgeCards).values({ id, lifecycleState: "draft", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Tóm tắt an toàn.", aiPromptVersion: "test", createdByUserId: "index-worker-user" });
  await testDb.insert(knowledgeIndexDirtyMarkers).values({ knowledgeCardId: id, contentVersion: 1, evidenceSetRevision: 1, reason: "test", nextRunAt: new Date(0) });
}

beforeEach(async () => {
  await resetTestDatabase();
});

async function makeMarkerProjectable(id: string) {
  await createMarker(id);
  await testDb.update(knowledgeCards).set({ lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none" }).where(eq(knowledgeCards.id, id));
  await testDb.insert(sources).values({ id: `${id}-source`, kind: "url", url: `https://example.com/${id}`, canonicalUrl: `https://example.com/${id}`, label: "Nguồn chuẩn hóa", sourceType: "curated", verificationStatus: "verified", eligibility: "eligible", submittedByUserId: "index-worker-user" });
  await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: id, sourceId: `${id}-source`, supportLevel: "primary" });
  const capture = await seedSourceCaptureVersion({ sourceId: `${id}-source`, captureKind: "url", rawText: "Bằng chứng có thể lập chỉ mục." });
  await seedKnowledgeCardEvidence({ cardId: id, sourceId: `${id}-source`, captureVersionId: capture.id, quoteText: "Bằng chứng có thể lập chỉ mục." });
}

describe("versioned knowledge indexing work", () => {
  test("removes the idle poll abort listener when the timeout completes", async () => {
    const controller = new AbortController();
    const originalRemoveEventListener = controller.signal.removeEventListener.bind(controller.signal);
    let shutdownStarted = false;
    let removedOnTimeout = false;
    const removeEventListener = vi.spyOn(controller.signal, "removeEventListener").mockImplementation((...args) => {
      const result = originalRemoveEventListener(...args);
      if (!shutdownStarted) {
        removedOnTimeout = true;
        controller.abort();
      }
      return result;
    });
    const fallbackShutdown = setTimeout(() => {
      shutdownStarted = true;
      controller.abort();
    }, 1_000);

    try {
      await expect(runApprovedKnowledgeIndexingWorkerLoop({ workerId: "listener-cleanup-worker", pollIntervalMs: 10, signal: controller.signal })).resolves.toEqual({ status: "stopped" });
      expect(removeEventListener).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(removedOnTimeout).toBe(true);
    } finally {
      clearTimeout(fallbackShutdown);
      controller.abort();
      removeEventListener.mockRestore();
    }
  });

  test("reports idle polling before the worker sleeps", async () => {
    const controller = new AbortController();
    const onIdle = vi.fn(() => controller.abort());

    await expect(runApprovedKnowledgeIndexingWorkerLoop({ workerId: "idle-worker", pollIntervalMs: 10, signal: controller.signal, onIdle })).resolves.toEqual({ status: "stopped" });

    expect(onIdle).toHaveBeenCalledWith(10);
  });

  test("reclaims an expired lease with a new fence and rejects the old worker completion", async () => {
    await createMarker("fenced-marker");
    const first = await claimNextKnowledgeIndexWork({ workerId: "old-worker" }, testDb);
    expect(first?.fencingToken).toMatch(/^[a-f0-9]{64}$/);
    if (!first) throw new Error("Expected first claim");
    await testDb.update(knowledgeIndexDirtyMarkers).set({ leaseExpiresAt: sql`${knowledgeIndexDirtyMarkers.claimedAt} + interval '1 microsecond'` }).where(eq(knowledgeIndexDirtyMarkers.id, first.markerId));
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
    await testDb.update(knowledgeIndexDirtyMarkers).set({ leaseExpiresAt: sql`${knowledgeIndexDirtyMarkers.claimedAt} + interval '1 microsecond'` }).where(eq(knowledgeIndexDirtyMarkers.id, first.markerId));
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

  test("keeps human enqueues unattributed until a worker transition and projects with the pipeline executor", async () => {
    await makeMarkerProjectable("executor-attribution");
    await enqueueKnowledgeIndexWork(testDb, { cardId: "executor-attribution", contentVersion: 1, evidenceSetRevision: 1, reason: "executor" });
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "executor-attribution"))).resolves.toMatchObject([{ executorSystem: null, status: "pending" }]);
    const claim = await claimNextKnowledgeIndexWork({ workerId: "executor-worker" }, testDb);
    if (!claim) throw new Error("Expected claim");
    expect(claim.executorSystem).toBe("system-knowledge-pipeline");

    await expect(projectClaimedKnowledgeIndexWork(claim, testDb)).resolves.toMatchObject({ indexed: true });
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, "executor-attribution"))).resolves.toMatchObject([{ executorSystem: "system-knowledge-pipeline" }]);
  });

  test("emits each indexing marker's persisted outcome without attributing a later retry to the first marker", async () => {
    await createMarker("indexing-telemetry-success");
    await createMarker("indexing-telemetry-retry");
    await testDb.update(knowledgeIndexDirtyMarkers).set({ nextRunAt: new Date(1) }).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "indexing-telemetry-retry"));
    const markers = await testDb.select({ id: knowledgeIndexDirtyMarkers.id, cardId: knowledgeIndexDirtyMarkers.knowledgeCardId }).from(knowledgeIndexDirtyMarkers).where(sql`${knowledgeIndexDirtyMarkers.knowledgeCardId} in ('indexing-telemetry-success', 'indexing-telemetry-retry')`);
    const markerIdFor = (cardId: string) => markers.find((marker) => marker.cardId === cardId)?.id;
    const project = workerDatabase.projectClaimedKnowledgeIndexWork;
    const projection = vi.spyOn(workerDatabase, "projectClaimedKnowledgeIndexWork").mockImplementation(async (claim, db) => {
      if (claim.cardId === "indexing-telemetry-retry") throw new Error("projection unavailable");
      return project(claim, db);
    });
    const observations: WorkerPollObservation[] = [];

    try {
      await runApprovedKnowledgeIndexingWorkerLoop({ once: true, batchSize: 2, workerId: "indexing-telemetry-worker", onObservation(observation) { observations.push(observation); } });
    } finally {
      projection.mockRestore();
    }

    expect(observations).toEqual([
      expect.objectContaining({ capability: "knowledge.indexing", resultCode: "success", durableId: markerIdFor("indexing-telemetry-success"), retryCount: 1 }),
      expect.objectContaining({ capability: "knowledge.indexing", resultCode: "retry", durableId: markerIdFor("indexing-telemetry-retry"), retryCount: 1 }),
    ]);
  });

  test("emits recovered indexing markers separately from a newly claimed marker", async () => {
    await createMarker("indexing-telemetry-pending");
    await createMarker("indexing-telemetry-recovered-a");
    await createMarker("indexing-telemetry-recovered-b");
    const markers = await testDb.select({ id: knowledgeIndexDirtyMarkers.id, cardId: knowledgeIndexDirtyMarkers.knowledgeCardId }).from(knowledgeIndexDirtyMarkers).where(sql`${knowledgeIndexDirtyMarkers.knowledgeCardId} in ('indexing-telemetry-pending', 'indexing-telemetry-recovered-a', 'indexing-telemetry-recovered-b')`);
    const markerIdFor = (cardId: string) => markers.find((marker) => marker.cardId === cardId)?.id;
    await testDb.update(knowledgeIndexDirtyMarkers).set({ status: "claimed", attemptCount: 1, claimedBy: "stale-indexer", claimedAt: new Date(0), leaseExpiresAt: new Date(1), fencingToken: "a".repeat(64) }).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "indexing-telemetry-recovered-a"));
    await testDb.update(knowledgeIndexDirtyMarkers).set({ status: "claimed", attemptCount: 2, maxAttempts: 2, claimedBy: "stale-indexer", claimedAt: new Date(0), leaseExpiresAt: new Date(1), fencingToken: "b".repeat(64) }).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "indexing-telemetry-recovered-b"));
    const observations: WorkerPollObservation[] = [];

    await runApprovedKnowledgeIndexingWorkerLoop({ once: true, batchSize: 1, workerId: "indexing-recovery-telemetry-worker", onObservation(observation) { observations.push(observation); } });

    expect(observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ resultCode: "retry", durableId: markerIdFor("indexing-telemetry-recovered-a"), retryCount: 1, leaseRecovery: "recovered", leaseRecoveryCount: 1 }),
      expect.objectContaining({ resultCode: "failure", durableId: markerIdFor("indexing-telemetry-recovered-b"), retryCount: 2, leaseRecovery: "recovered", leaseRecoveryCount: 1 }),
      expect.objectContaining({ resultCode: "success", durableId: markerIdFor("indexing-telemetry-pending"), leaseRecovery: "none" }),
    ]));
  });

  test("rejects a non-catalog indexing executor at the persistence boundary", async () => {
    await createMarker("invalid-executor");
    await expect(enqueueKnowledgeIndexWork(testDb, { cardId: "invalid-executor", contentVersion: 1, evidenceSetRevision: 1, reason: "invalid", executorSystem: "worker-42" })).rejects.toThrow("Invalid audit actor.");
  });

  test("backfill queues only policy-eligible cards and disables an ineligible current projection", async () => {
    await createMarker("backfill-ineligible");
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: "backfill-ineligible", contentVersion: 1, acceptedFence: "legacy", executorSystem: "system-knowledge-pipeline", status: "active", searchableText: "safe", textHash: "a".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false });
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
