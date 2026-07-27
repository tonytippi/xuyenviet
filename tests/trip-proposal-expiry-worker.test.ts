import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, tripChangeProposals, tripPlanChangeHistory, tripPlanItems, tripProjects, users } from "@/db/schema";

import { testDb } from "./helpers/db";
async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

async function seedExpiredProposal(projectId: string, userId: string, proposalId: string, itemId: string, expiresAt: Date) {
  await testDb.insert(tripProjects).values({ id: projectId, userId, title: "Huế", aggregateVersion: 1 });
  await testDb.insert(tripPlanItems).values({ id: itemId, tripProjectId: projectId, userId, kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
  await testDb.insert(tripChangeProposals).values({
    id: proposalId,
    tripProjectId: projectId,
    userId,
    creatorClass: "ai_orchestration",
    status: "pending",
    rationale: "Hết hạn.",
    operations: [{ kind: "change-item-state", itemId, state: "confirmed" }],
    expectedAggregateVersion: 1,
    expiresAt,
  });
}

describe("Story 7.5 trip-proposal-expiry-worker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("processNextExpiredTripChangeProposal expires elapsed pending proposals and returns the count", async () => {
    await createTestUser("worker-user-1");
    const past = new Date("2026-01-01T00:00:00.000Z");
    await seedExpiredProposal("worker-project-1", "worker-user-1", "worker-proposal-1", "worker-leg-1", past);
    await seedExpiredProposal("worker-project-1b", "worker-user-1", "worker-proposal-1b", "worker-leg-1b", past);

    const { processNextExpiredTripChangeProposal } = await import("@/features/chat-trips/trip-proposal-expiry-worker");
    const result = await processNextExpiredTripChangeProposal({ now: new Date("2026-07-25T00:00:00.000Z") });

    expect(result.processed).toBe(2);
    const rows = await testDb.select().from(tripChangeProposals).where(eq(tripChangeProposals.tripProjectId, "worker-project-1"));
    expect(rows[0]?.status).toBe("expired");
    const historyRows = await testDb.select().from(tripPlanChangeHistory);
    expect(historyRows.filter((row) => row.operationClass === "expire")).toHaveLength(2);
    expect(historyRows.filter((row) => row.operationClass === "expire")).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorClass: "system", actorSystem: "system-trip-planning", actorUserId: null }),
    ]));
    const audits = await testDb.select().from(auditEvents).where(eq(auditEvents.operation, "expire"));
    expect(audits).toHaveLength(2);
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorClass: "system", actorSystem: "system-trip-planning", actorUserId: null, actorEmail: null }),
    ]));
  });

  test("a second call with no elapsed rows returns processed: 0", async () => {
    await createTestUser("worker-user-2");
    // A pending proposal that is NOT expired (future expiry).
    await seedExpiredProposal("worker-project-2", "worker-user-2", "worker-proposal-2", "worker-leg-2", new Date("2026-12-01T00:00:00.000Z"));

    const { processNextExpiredTripChangeProposal } = await import("@/features/chat-trips/trip-proposal-expiry-worker");
    const first = await processNextExpiredTripChangeProposal({ now: new Date("2026-07-25T00:00:00.000Z") });
    expect(first.processed).toBe(0);

    const rows = await testDb.select().from(tripChangeProposals).where(eq(tripChangeProposals.id, "worker-proposal-2"));
    expect(rows[0]?.status).toBe("pending");
  });

  test("runTripChangeProposalExpiryWorkerLoop with once: true processes once and exits", async () => {
    await createTestUser("worker-user-3");
    await seedExpiredProposal("worker-project-3", "worker-user-3", "worker-proposal-3", "worker-leg-3", new Date("2026-01-01T00:00:00.000Z"));

    const { runTripChangeProposalExpiryWorkerLoop } = await import("@/features/chat-trips/trip-proposal-expiry-worker");
    const result = await runTripChangeProposalExpiryWorkerLoop({ once: true });

    expect(result.status).toBe("processed");
    if (result.status === "processed") {
      expect(result.processed).toBeGreaterThanOrEqual(1);
    }
    const rows = await testDb.select().from(tripChangeProposals).where(eq(tripChangeProposals.id, "worker-proposal-3"));
    expect(rows[0]?.status).toBe("expired");
  });

  test("concurrent workers do not double-process the same row (FOR UPDATE SKIP LOCKED)", async () => {
    await createTestUser("worker-user-4");
    const past = new Date("2026-01-01T00:00:00.000Z");
    // Seed three elapsed proposals.
    await seedExpiredProposal("worker-project-4a", "worker-user-4", "worker-proposal-4a", "worker-leg-4a", past);
    await seedExpiredProposal("worker-project-4b", "worker-user-4", "worker-proposal-4b", "worker-leg-4b", past);
    await seedExpiredProposal("worker-project-4c", "worker-user-4", "worker-proposal-4c", "worker-leg-4c", past);

    const { processNextExpiredTripChangeProposal } = await import("@/features/chat-trips/trip-proposal-expiry-worker");
    // Run two workers concurrently. SKIP LOCKED ensures they claim disjoint
    // rows; the total processed across both never exceeds the number of elapsed
    // rows, and each row is expired exactly once (one history row per proposal).
    const [a, b] = await Promise.all([
      processNextExpiredTripChangeProposal({ workerId: "worker-a", now: new Date("2026-07-25T00:00:00.000Z") }),
      processNextExpiredTripChangeProposal({ workerId: "worker-b", now: new Date("2026-07-25T00:00:00.000Z") }),
    ]);

    expect(a.processed + b.processed).toBeGreaterThan(0);

    // The key invariant: FOR UPDATE SKIP LOCKED ensures no double-processing.
    // Each of the three seeded proposals is expired exactly once — exactly one
    // history row per proposal, never two. (The global worker may also process
    // elapsed rows seeded by other test files; that is expected and safe.)
    const seededIds = ["worker-proposal-4a", "worker-proposal-4b", "worker-proposal-4c"];
    const allRows = await testDb.select().from(tripChangeProposals).where(eq(tripChangeProposals.userId, "worker-user-4"));
    expect(allRows.length).toBe(3);
    expect(allRows.every((row) => row.status === "expired")).toBe(true);
    for (const seededId of seededIds) {
      const historyForRow = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, seededId));
      expect(historyForRow).toHaveLength(1);
      expect(historyForRow[0]).toMatchObject({ actorClass: "system", actorSystem: "system-trip-planning", actorUserId: null });
      const auditsForRow = await testDb.select().from(auditEvents).where(eq(auditEvents.targetId, seededId));
      expect(auditsForRow).toHaveLength(1);
      expect(auditsForRow[0]).toMatchObject({ actorClass: "system", actorSystem: "system-trip-planning", actorUserId: null, actorEmail: null });
    }
  });
});

// Q2: the worker loop must survive a transient DB error (connection blip,
// deadlock, serialization failure) without dying. A transient error rolls back
// the whole batch atomically (no partial writes); the loop catch logs and keeps
// polling so the next iteration re-claims and retries the same rows.
describe("Story 7.5 Q2 worker loop survives transient DB errors", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("runTripChangeProposalExpiryWorkerLoop with once: true exits immediately on a transient batch error instead of retrying infinitely", async () => {
    // E7R-2 / E7R2-F5: with once: true, a transient DB error must NOT sleep+continue
    // (infinite loop on persistent error). The catch must check the once flag
    // and return immediately so the caller can decide to retry.
    // E7R2-F5: the returned status must be `error` (not `no_work`) so a caller
    // can distinguish a failed batch from a genuinely empty poll. A caller
    // treating `no_work` as "clean idle" would silently swallow DB errors.
    let transactionCallCount = 0;
    vi.doMock("@/db/client", () => ({
      getDb: () => ({
        transaction: async () => {
          transactionCallCount += 1;
          throw new Error("simulated transient connection error");
        },
      }),
    }));

    const { runTripChangeProposalExpiryWorkerLoop } = await import("@/features/chat-trips/trip-proposal-expiry-worker");
    const result = await runTripChangeProposalExpiryWorkerLoop({ once: true, pollIntervalMs: 1 });

    expect(result.status).toBe("error");
    expect(transactionCallCount).toBe(1);
  });

  test("runTripChangeProposalExpiryWorkerLoop keeps polling after a persistent transient error until the signal aborts", async () => {
    // Mock getDb so EVERY transaction throws. Without the loop catch the loop
    // would die on the first iteration. With the catch it logs, sleeps, and
    // keeps polling until the abort signal stops it.
    let transactionCallCount = 0;
    vi.doMock("@/db/client", () => ({
      getDb: () => ({
        transaction: async () => {
          transactionCallCount += 1;
          throw new Error("simulated persistent connection error");
        },
      }),
    }));

    const controller = new AbortController();
    // Abort after the first sleep so the loop does not run indefinitely.
    setTimeout(() => controller.abort(), 30);

    const { runTripChangeProposalExpiryWorkerLoop } = await import("@/features/chat-trips/trip-proposal-expiry-worker");
    const result = await runTripChangeProposalExpiryWorkerLoop({ once: false, pollIntervalMs: 5, signal: controller.signal });

    // The loop survived multiple transient errors and stopped cleanly via the
    // abort signal (it did not throw/die).
    expect(result.status).toBe("stopped");
    expect(transactionCallCount).toBeGreaterThanOrEqual(1);
  });
});
