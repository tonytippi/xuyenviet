import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, tripChangeProposals, tripPlanChangeHistory, tripPlanItems, tripProjects, users } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";
async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

beforeEach(async () => {
  await resetTestDatabase();
});

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

  test("the package worker expires elapsed pending proposals", async () => {
    await createTestUser("worker-user-1");
    const past = new Date("2026-01-01T00:00:00.000Z");
    await seedExpiredProposal("worker-project-1", "worker-user-1", "worker-proposal-1", "worker-leg-1", past);
    await seedExpiredProposal("worker-project-1b", "worker-user-1", "worker-proposal-1b", "worker-leg-1b", past);

    const { runTripChangeProposalExpiryWorkerLoop } = await import("@worker/features/chat-trips/trip-proposal-expiry-worker");
    const result = await runTripChangeProposalExpiryWorkerLoop({ once: true });

    expect(result).toMatchObject({ status: "processed", processed: 2 });
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

  test("the package worker reports no work for pending proposals that have not expired", async () => {
    await createTestUser("worker-user-2");
    // A pending proposal that is NOT expired (future expiry).
    await seedExpiredProposal("worker-project-2", "worker-user-2", "worker-proposal-2", "worker-leg-2", new Date("2026-12-01T00:00:00.000Z"));

    const { runTripChangeProposalExpiryWorkerLoop } = await import("@worker/features/chat-trips/trip-proposal-expiry-worker");
    await expect(runTripChangeProposalExpiryWorkerLoop({ once: true })).resolves.toEqual({ status: "no_work" });

    const rows = await testDb.select().from(tripChangeProposals).where(eq(tripChangeProposals.id, "worker-proposal-2"));
    expect(rows[0]?.status).toBe("pending");
  });

  test("runTripChangeProposalExpiryWorkerLoop with once: true processes once and exits", async () => {
    await createTestUser("worker-user-3");
    await seedExpiredProposal("worker-project-3", "worker-user-3", "worker-proposal-3", "worker-leg-3", new Date("2026-01-01T00:00:00.000Z"));

    const { runTripChangeProposalExpiryWorkerLoop } = await import("@worker/features/chat-trips/trip-proposal-expiry-worker");
    const result = await runTripChangeProposalExpiryWorkerLoop({ once: true });

    expect(result.status).toBe("processed");
    if (result.status === "processed") {
      expect(result.processed).toBeGreaterThanOrEqual(1);
    }
    const rows = await testDb.select().from(tripChangeProposals).where(eq(tripChangeProposals.id, "worker-proposal-3"));
    expect(rows[0]?.status).toBe("expired");
  });

});
