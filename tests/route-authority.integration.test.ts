import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { applyTripChangeProposal } from "@xuyenviet/database";
import { tripChangeProposals, tripPlanItems, tripProjects, users } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";

describe("canonical route path Apply", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("atomically sets and clears an owner-confirmed path which persists after reload", async () => {
    await testDb.insert(users).values([{ id: "owner", email: "owner@example.com" }, { id: "other", email: "other@example.com" }]);
    await testDb.insert(tripProjects).values({ id: "trip", userId: "owner", title: "Đà Nẵng" });
    await testDb.insert(tripPlanItems).values({ id: "leg", tripProjectId: "trip", userId: "owner", kind: "leg", type: "transport", state: "planned", label: "Chặng chính", ordinal: 0, version: 1 });
    await testDb.insert(tripChangeProposals).values({ id: "set", tripProjectId: "trip", userId: "owner", creatorClass: "owner_command", rationale: "Chọn cung đường", operations: [{ kind: "set-leg-path", itemId: "leg", pathId: "hanoi-da-nang-national-1a" }], expectedAggregateVersion: 1, expectedItemVersions: { leg: 1 } });

    await expect(applyTripChangeProposal("other", { tripProjectId: "trip", proposalId: "set" })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(applyTripChangeProposal("owner", { tripProjectId: "trip", proposalId: "set" })).resolves.toMatchObject({ success: true, aggregateVersion: 2 });
    await expect(testDb.select({ pathId: tripPlanItems.canonicalRoutePathId, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "leg"))).resolves.toEqual([{ pathId: "hanoi-da-nang-national-1a", version: 2 }]);

    await testDb.insert(tripChangeProposals).values({ id: "clear", tripProjectId: "trip", userId: "owner", creatorClass: "owner_command", rationale: "Bỏ chọn cung đường", operations: [{ kind: "clear-leg-path", itemId: "leg" }], expectedAggregateVersion: 2, expectedItemVersions: { leg: 2 } });
    await expect(applyTripChangeProposal("owner", { tripProjectId: "trip", proposalId: "clear" })).resolves.toMatchObject({ success: true, aggregateVersion: 3 });
    await expect(testDb.select({ pathId: tripPlanItems.canonicalRoutePathId, version: tripPlanItems.version }).from(tripPlanItems).where(and(eq(tripPlanItems.id, "leg"), eq(tripPlanItems.userId, "owner")))).resolves.toEqual([{ pathId: null, version: 3 }]);
  });

  test("rejects an unknown path without applying any proposal state", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await testDb.insert(tripProjects).values({ id: "trip", userId: "owner", title: "Đà Nẵng" });
    await testDb.insert(tripPlanItems).values({ id: "leg", tripProjectId: "trip", userId: "owner", kind: "leg", type: "transport", state: "planned", label: "Chặng chính", ordinal: 0, version: 1 });
    await testDb.insert(tripChangeProposals).values({ id: "invalid", tripProjectId: "trip", userId: "owner", creatorClass: "owner_command", rationale: "Chọn cung đường", operations: [{ kind: "set-leg-path", itemId: "leg", pathId: "unknown" }], expectedAggregateVersion: 1, expectedItemVersions: { leg: 1 } });

    await expect(applyTripChangeProposal("owner", { tripProjectId: "trip", proposalId: "invalid" })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, "invalid"))).resolves.toEqual([{ status: "pending" }]);
  });

  test("rejects a stale set-path fence without changing the stored route or proposal", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await testDb.insert(tripProjects).values({ id: "trip", userId: "owner", title: "Đà Nẵng", aggregateVersion: 2 });
    await testDb.insert(tripPlanItems).values({ id: "leg", tripProjectId: "trip", userId: "owner", kind: "leg", type: "transport", state: "planned", label: "Chặng chính", ordinal: 0, version: 2, canonicalRoutePathId: "hanoi-da-nang-national-1a" });
    await testDb.insert(tripChangeProposals).values({ id: "stale", tripProjectId: "trip", userId: "owner", creatorClass: "owner_command", rationale: "Đổi cung đường", operations: [{ kind: "set-leg-path", itemId: "leg", pathId: "hanoi-da-nang-ho-chi-minh-road" }], expectedAggregateVersion: 2, expectedItemVersions: { leg: 1 } });

    await expect(applyTripChangeProposal("owner", { tripProjectId: "trip", proposalId: "stale" })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select({ pathId: tripPlanItems.canonicalRoutePathId, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "leg"))).resolves.toEqual([{ pathId: "hanoi-da-nang-national-1a", version: 2 }]);
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, "stale"))).resolves.toEqual([{ status: "pending" }]);
  });

  test("rejects a set-path operation for a non-transport item without applying it", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await testDb.insert(tripProjects).values({ id: "trip", userId: "owner", title: "Đà Nẵng" });
    await testDb.insert(tripPlanItems).values({ id: "visit", tripProjectId: "trip", userId: "owner", kind: "activity", type: "visit", state: "planned", label: "Điểm tham quan", ordinal: 0, version: 1 });
    await testDb.insert(tripChangeProposals).values({ id: "non-transport", tripProjectId: "trip", userId: "owner", creatorClass: "owner_command", rationale: "Chọn cung đường", operations: [{ kind: "set-leg-path", itemId: "visit", pathId: "hanoi-da-nang-national-1a" }], expectedAggregateVersion: 1, expectedItemVersions: { visit: 1 } });

    await expect(applyTripChangeProposal("owner", { tripProjectId: "trip", proposalId: "non-transport" })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select({ pathId: tripPlanItems.canonicalRoutePathId, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "visit"))).resolves.toEqual([{ pathId: null, version: 1 }]);
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, "non-transport"))).resolves.toEqual([{ status: "pending" }]);
  });
});
