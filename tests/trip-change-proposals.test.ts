import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, tripChangeProposals, tripPlanChangeHistory, tripPlanItems, tripProjects, users } from "@/db/schema";

import { testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

// Story 7.5: the system-trip-planning reserved user is created by migration
// 0064, but other test files that call resetTestDatabase() truncate the users
// table. Ensure the reserved system actor exists before expire tests run so
// the audit_events.actorUserId FK is satisfied. Check-then-insert to avoid
// depending on conflict-target syntax.
async function ensureSystemTripPlanningActor() {
  const [existing] = await testDb.select({ id: users.id }).from(users).where(eq(users.id, "system-trip-planning")).limit(1);
  if (!existing) {
    try {
      await testDb.insert(users).values({ id: "system-trip-planning", email: "system-trip-planning@xuyenviet.invalid" });
    } catch (error) {
      console.error("ensureSystemTripPlanningActor insert failed", error instanceof Error ? error.message : String(error));
    }
  }
}

type KnownPlanItem = {
  id: string;
  kind: "anchor" | "leg" | "activity";
  anchorRole: "origin" | "destination" | "region" | "required_stop" | "accommodation" | null;
  type: "transport" | "visit" | "food" | "rest" | "accommodation" | null;
  state: "idea" | "planned" | "confirmed" | "backup";
  parentItemId: string | null;
  backupTargetItemId: string | null;
};

function makeKnownItem(overrides: Partial<KnownPlanItem> & { id: string }): KnownPlanItem {
  return {
    kind: "leg",
    anchorRole: null,
    type: "transport",
    state: "idea",
    parentItemId: null,
    backupTargetItemId: null,
    ...overrides,
  };
}

describe("validateProposalOperations pure unit tests", () => {
  const knownItems: KnownPlanItem[] = [
    makeKnownItem({ id: "anchor-1", kind: "anchor", anchorRole: "origin", type: null, state: "idea" }),
    makeKnownItem({ id: "leg-1", kind: "leg", type: "transport", state: "planned" }),
    makeKnownItem({ id: "leg-2", kind: "leg", type: "visit", state: "confirmed" }),
    makeKnownItem({ id: "activity-1", kind: "activity", type: "visit", state: "idea", parentItemId: "leg-1" }),
  ];
  const context = { knownItems, tripProjectId: "project-1" };

  async function validate(operations: unknown) {
    vi.resetModules();
    const { validateProposalOperations } = await import("@/features/chat-trips/trip-change-proposals");
    return validateProposalOperations(operations, context);
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("rejects non-array, empty array, and over-limit arrays", async () => {
    expect((await validate(null)).rejected).toHaveLength(1);
    expect((await validate([])).rejected).toHaveLength(1);
    const tooMany = Array.from({ length: 21 }, () => ({ kind: "remove-item", itemId: "leg-1" }));
    expect((await validate(tooMany)).rejected).toHaveLength(1);
  });

  test("accepts a valid create-item anchor operation", async () => {
    const result = await validate([
      { kind: "create-item", item: { kind: "anchor", anchorRole: "destination", type: null, state: "idea", label: "Đà Nẵng" }, ordinal: 0 },
    ]);
    expect(result.rejected).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
  });

  test("accepts a valid create-item leg with transport fields", async () => {
    const result = await validate([
      { kind: "create-item", item: { kind: "leg", type: "transport", anchorRole: null, state: "planned", label: "Chạy xe", transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" }, ordinal: 1 },
    ]);
    expect(result.rejected).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
  });

  test("accepts a valid create-item activity with a parent leg", async () => {
    const result = await validate([
      { kind: "create-item", item: { kind: "activity", type: "visit", anchorRole: null, state: "idea", label: "Đại Nội" }, parentItemId: "leg-1", ordinal: 0 },
    ]);
    expect(result.rejected).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
  });

  test("accepts a valid create-item activity without a parentItemId (optional per system prompt)", async () => {
    const result = await validate([
      { kind: "create-item", item: { kind: "activity", type: "visit", anchorRole: null, state: "idea", label: "Đại Nội" }, ordinal: 0 },
    ]);
    expect(result.rejected).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
  });

  test("rejects create-item activity whose parent is not a leg", async () => {
    const result = await validate([
      { kind: "create-item", item: { kind: "activity", type: "visit", anchorRole: null, state: "idea", label: "Đại Nội" }, parentItemId: "anchor-1", ordinal: 0 },
    ]);
    expect(result.rejected).toHaveLength(1);
  });

  test("rejects create-item anchor that carries a type", async () => {
    const result = await validate([
      { kind: "create-item", item: { kind: "anchor", anchorRole: "origin", type: "transport", state: "idea", label: "Hà Nội" }, ordinal: 0 },
    ]);
    expect(result.rejected).toHaveLength(1);
  });

  test("rejects create-item leg that carries an anchorRole", async () => {
    const result = await validate([
      { kind: "create-item", item: { kind: "leg", type: "transport", anchorRole: "origin", state: "idea", label: "Chạy xe" }, ordinal: 0 },
    ]);
    expect(result.rejected).toHaveLength(1);
  });

  test("rejects invalid kind, anchorRole, type, and state", async () => {
    expect((await validate([{ kind: "create-item", item: { kind: "hotel" as never, state: "idea", label: "x" }, ordinal: 0 }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "create-item", item: { kind: "anchor", anchorRole: "parking" as never, type: null, state: "idea", label: "x" }, ordinal: 0 }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "create-item", item: { kind: "leg", type: "flight" as never, anchorRole: null, state: "idea", label: "x" }, ordinal: 0 }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "create-item", item: { kind: "leg", type: "transport", anchorRole: null, state: "draft" as never, label: "x" }, ordinal: 0 }])).rejected).toHaveLength(1);
  });

  test("rejects backup state without backupTargetItemId and vice versa", async () => {
    expect((await validate([{ kind: "create-item", item: { kind: "leg", type: "transport", anchorRole: null, state: "backup", label: "Phương án B" }, ordinal: 0 }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "create-item", item: { kind: "leg", type: "transport", anchorRole: null, state: "planned", label: "Chặng", backupTargetItemId: "leg-1" }, ordinal: 0 }])).rejected).toHaveLength(1);
  });

  test("rejects backupTargetItemId referencing an unknown (cross-project) item", async () => {
    const result = await validate([
      { kind: "create-item", item: { kind: "leg", type: "transport", anchorRole: null, state: "backup", label: "Phương án B", backupTargetItemId: "missing-item" }, ordinal: 0 },
    ]);
    expect(result.rejected).toHaveLength(1);
  });

  test("rejects transport fields on a non-transport type and accommodation area on a non-accommodation type", async () => {
    expect((await validate([{ kind: "create-item", item: { kind: "leg", type: "visit", anchorRole: null, state: "idea", label: "Tham quan", transportOriginLabel: "Hà Nội" }, ordinal: 0 }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "create-item", item: { kind: "leg", type: "visit", anchorRole: null, state: "idea", label: "Tham quan", accommodationPlaceAreaLabel: "Phố cổ" }, ordinal: 0 }])).rejected).toHaveLength(1);
  });

  test("rejects unbounded label (>160) and notes (>1000) and multi-line content", async () => {
    expect((await validate([{ kind: "create-item", item: { kind: "anchor", anchorRole: "origin", type: null, state: "idea", label: "x".repeat(161) }, ordinal: 0 }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "create-item", item: { kind: "anchor", anchorRole: "origin", type: null, state: "idea", label: "multi\nline" }, ordinal: 0 }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "create-item", item: { kind: "anchor", anchorRole: "origin", type: null, state: "idea", label: "ok", notes: "x".repeat(1001) }, ordinal: 0 }])).rejected).toHaveLength(1);
  });

  test("rejects executable SQL, arbitrary URLs, and JSON provider payloads in content", async () => {
    expect((await validate([{ kind: "create-item", item: { kind: "anchor", anchorRole: "origin", type: null, state: "idea", label: "'; DROP TABLE trip_projects;--" }, ordinal: 0 }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "create-item", item: { kind: "anchor", anchorRole: "origin", type: null, state: "idea", label: "https://evil.example/path" }, ordinal: 0 }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "create-item", item: { kind: "anchor", anchorRole: "origin", type: null, state: "idea", label: '{"provider":"payload"}' }, ordinal: 0 }])).rejected).toHaveLength(1);
  });

  test("accepts valid update-item, remove-item, reorder-item, and change-item-state operations", async () => {
    const result = await validate([
      { kind: "update-item", itemId: "leg-1", changes: { state: "confirmed" } },
      { kind: "remove-item", itemId: "activity-1" },
      { kind: "reorder-item", itemId: "leg-2", ordinal: 0 },
      { kind: "change-item-state", itemId: "leg-1", state: "confirmed" },
    ]);
    expect(result.rejected).toHaveLength(0);
    expect(result.valid).toHaveLength(4);
  });

  test("rejects update-item, remove-item, reorder-item, change-item-state referencing unknown/cross-project item ids", async () => {
    expect((await validate([{ kind: "update-item", itemId: "missing", changes: { label: "x" } }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "remove-item", itemId: "missing" }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "reorder-item", itemId: "missing", ordinal: 0 }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "change-item-state", itemId: "missing", state: "planned" }])).rejected).toHaveLength(1);
  });

  test("rejects update-item with a disallowed changes field", async () => {
    const result = await validate([{ kind: "update-item", itemId: "leg-1", changes: { evil: "payload" } as never }]);
    expect(result.rejected).toHaveLength(1);
  });

  test("rejects update-item setting transport fields on a non-transport item", async () => {
    const result = await validate([{ kind: "update-item", itemId: "leg-2", changes: { transportOriginLabel: "Hà Nội" } }]);
    expect(result.rejected).toHaveLength(1);
  });

  test("rejects reorder-item activity whose parent is not a leg", async () => {
    const result = await validate([{ kind: "reorder-item", itemId: "activity-1", parentItemId: "anchor-1", ordinal: 0 }]);
    expect(result.rejected).toHaveLength(1);
  });

  test("accepts change-item-state to backup with a valid backupTargetItemId", async () => {
    const result = await validate([{ kind: "change-item-state", itemId: "leg-2", state: "backup", backupTargetItemId: "leg-1" }]);
    expect(result.rejected).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
  });

  test("rejects change-item-state to backup without a backupTargetItemId", async () => {
    expect((await validate([{ kind: "change-item-state", itemId: "leg-2", state: "backup" }])).rejected).toHaveLength(1);
  });

  test("accepts a valid upsert-constraints operation", async () => {
    const result = await validate([
      { kind: "upsert-constraints", constraints: { adultCount: 2, childCount: 1, vehicleType: "ev", evChargingNeed: "required" } },
    ]);
    expect(result.rejected).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
  });

  test("rejects upsert-constraints with a disallowed field", async () => {
    const result = await validate([{ kind: "upsert-constraints", constraints: { adultCount: 2, secret: "x" } as never }]);
    expect(result.rejected).toHaveLength(1);
  });

  test("rejects upsert-constraints with invalid vehicle/ev/budget/driving/preference rules", async () => {
    expect((await validate([{ kind: "upsert-constraints", constraints: { adultCount: 2, vehicleType: "truck" as never } }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "upsert-constraints", constraints: { adultCount: 2, vehicleType: "car", evChargingNeed: "required" } }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "upsert-constraints", constraints: { adultCount: 2, budgetCurrency: "USD" as never, budgetMinVnd: 1, budgetMaxVnd: 2 } }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "upsert-constraints", constraints: { adultCount: 2, drivingToleranceHours: 20 } }])).rejected).toHaveLength(1);
    expect((await validate([{ kind: "upsert-constraints", constraints: { adultCount: 2, preferenceTags: ["unknown_tag"] } }])).rejected).toHaveLength(1);
  });

  test("rejects upsert-constraints with no travelers", async () => {
    expect((await validate([{ kind: "upsert-constraints", constraints: { adultCount: null, childCount: null } }])).rejected).toHaveLength(1);
  });

  test("rejects unknown operation kind", async () => {
    const result = await validate([{ kind: "merge-item", itemId: "leg-1" } as never]);
    expect(result.rejected).toHaveLength(1);
    expect(result.valid).toHaveLength(0);
  });

  test("returns valid and rejected split when mixing valid and invalid operations", async () => {
    const result = await validate([
      { kind: "remove-item", itemId: "leg-1" },
      { kind: "remove-item", itemId: "missing" },
    ]);
    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].index).toBe(1);
  });
});

describe("persistAiTripChangeProposalDraft DB-backed tests", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupProject(userId: string, projectId: string, aggregateVersion = 1) {
    await testDb.insert(tripProjects).values({ id: projectId, userId, title: "Huế", aggregateVersion });
    await testDb.insert(tripPlanItems).values({ id: "leg-1", tripProjectId: projectId, userId, kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
  }

  function validOperations() {
    return [{ kind: "change-item-state", itemId: "leg-1", state: "confirmed" }];
  }

  async function loadModule() {
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    return await import("@/features/chat-trips/trip-change-proposals");
  }

  test("returns unauthenticated without a session and writes no row", async () => {
    await createTestUser("user-1");
    await setupProject("user-1", "project-1");
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue(null) }));
    const { persistAiTripChangeProposalDraft } = await import("@/features/chat-trips/trip-change-proposals");

    const result = await persistAiTripChangeProposalDraft({
      tripProjectId: "project-1",
      expectedAggregateVersion: 1,
      expectedItemVersions: { "leg-1": 1 },
      operations: validOperations(),
      rationale: "Nên chốt chặng xe sớm.",
    });

    expect(result).toEqual({ success: false, reason: "unauthenticated" });
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(0);
  });

  test("returns not_found for a cross-owner project and writes no row", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    await setupProject("user-2", "project-2");
    const { persistAiTripChangeProposalDraft } = await loadModule();

    const result = await persistAiTripChangeProposalDraft({
      tripProjectId: "project-2",
      expectedAggregateVersion: 1,
      operations: validOperations(),
      rationale: "Sai chủ.",
    });

    expect(result).toEqual({ success: false, reason: "not_found" });
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(0);
  });

  test("returns refresh_required when the aggregate version is stale and writes no row", async () => {
    await createTestUser("user-1");
    await setupProject("user-1", "project-1", 3);
    const { persistAiTripChangeProposalDraft } = await loadModule();

    const result = await persistAiTripChangeProposalDraft({
      tripProjectId: "project-1",
      expectedAggregateVersion: 1,
      operations: validOperations(),
      rationale: "Bản nháp cũ.",
    });

    expect(result).toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(0);
  });

  test("returns invalid for an invalid operation set and writes no row", async () => {
    await createTestUser("user-1");
    await setupProject("user-1", "project-1");
    const { persistAiTripChangeProposalDraft } = await loadModule();

    const result = await persistAiTripChangeProposalDraft({
      tripProjectId: "project-1",
      expectedAggregateVersion: 1,
      operations: [{ kind: "remove-item", itemId: "missing-item" }],
      rationale: "Sai mục.",
    });

    expect(result).toEqual({ success: false, reason: "invalid" });
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "trip_change_proposal"))).resolves.toHaveLength(0);
  });

  test("persists a pending proposal with version fences captured at draft time and writes a create audit", async () => {
    await createTestUser("user-1");
    await setupProject("user-1", "project-1");
    const { persistAiTripChangeProposalDraft } = await loadModule();

    const expiresAt = new Date("2026-08-01T00:00:00.000Z");
    const result = await persistAiTripChangeProposalDraft({
      tripProjectId: "project-1",
      expectedAggregateVersion: 1,
      expectedItemVersions: { "leg-1": 1 },
      operations: validOperations(),
      rationale: "Nên chốt chặng xe sớm.",
      alternatives: [{ summary: "Đợi thêm thông tin" }],
      expiresAt,
      sourceAssistantMessageId: "assistant-1",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.proposal.status).toBe("pending");
    expect(result.proposal.rationale).toBe("Nên chốt chặng xe sớm.");
    expect(result.proposal.expiresAt).toEqual(expiresAt);
    expect(result.proposal.hasAlternatives).toBe(true);

    const [row] = await testDb.select().from(tripChangeProposals);
    expect(row).toMatchObject({
      tripProjectId: "project-1",
      userId: "user-1",
      creatorClass: "ai_orchestration",
      status: "pending",
      expectedAggregateVersion: 1,
      sourceAssistantMessageId: "assistant-1",
    });
    expect(row.expectedItemVersions).toEqual({ "leg-1": 1 });
    const [audit] = await testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "trip_change_proposal"));
    expect(audit).toMatchObject({ operation: "create", actorUserId: "user-1", actorClass: "user" });
    expect(audit.afterSummary).not.toContain("Nên chốt chặng xe sớm.");
  });

  test("does not mutate plan items or advance the aggregate version when persisting a proposal", async () => {
    await createTestUser("user-1");
    await setupProject("user-1", "project-1");
    const { persistAiTripChangeProposalDraft } = await loadModule();

    await persistAiTripChangeProposalDraft({
      tripProjectId: "project-1",
      expectedAggregateVersion: 1,
      operations: validOperations(),
      rationale: "Đề xuất đổi trạng thái.",
    });

    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, "project-1"));
    const [savedItem] = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.id, "leg-1"));
    expect(savedProject.aggregateVersion).toBe(1);
    expect(savedItem.state).toBe("planned");
    expect(savedItem.version).toBe(1);
  });

  test("cascade-deletes proposals when the owning trip project is deleted", async () => {
    await createTestUser("user-1");
    await setupProject("user-1", "project-1");
    const { persistAiTripChangeProposalDraft } = await loadModule();

    await persistAiTripChangeProposalDraft({
      tripProjectId: "project-1",
      expectedAggregateVersion: 1,
      operations: validOperations(),
      rationale: "Đề xuất sẽ bị xoá theo dự án.",
    });
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(1);

    await testDb.delete(tripProjects).where(eq(tripProjects.id, "project-1"));
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(0);
  });
});

describe("proposal read model owner-scope and safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function persistAs(userId: string, email: string, tripProjectId: string, itemId: string, rationale: string) {
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId, email }) }));
    const { persistAiTripChangeProposalDraft } = await import("@/features/chat-trips/trip-change-proposals");
    return persistAiTripChangeProposalDraft({
      tripProjectId,
      expectedAggregateVersion: 1,
      operations: [{ kind: "change-item-state", itemId, state: "confirmed" }],
      rationale,
    });
  }

  async function loadReadsAs(userId: string, email: string) {
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId, email }) }));
    return await import("@/features/chat-trips/trip-change-proposals");
  }

  test("listPendingProposalsForTripProject returns only the owner's pending proposals", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    await testDb.insert(tripProjects).values({ id: "p1", userId: "user-1", title: "Huế" });
    await testDb.insert(tripProjects).values({ id: "p2", userId: "user-2", title: "Đà Lạt" });
    await testDb.insert(tripPlanItems).values({ id: "leg-a", tripProjectId: "p1", userId: "user-1", kind: "leg", type: "transport", state: "idea", label: "A", ordinal: 0 });
    await testDb.insert(tripPlanItems).values({ id: "leg-b", tripProjectId: "p2", userId: "user-2", kind: "leg", type: "transport", state: "idea", label: "B", ordinal: 0 });

    await persistAs("user-1", "user-1@example.com", "p1", "leg-a", "Của user-1");
    await persistAs("user-2", "user-2@example.com", "p2", "leg-b", "Của user-2");

    const { listPendingProposalsForTripProject } = await loadReadsAs("user-1", "user-1@example.com");
    const proposals = await listPendingProposalsForTripProject("p1");

    expect(proposals).toHaveLength(1);
    expect(proposals?.[0].rationale).toBe("Của user-1");
  });

  test("getProposalForOwnerReview returns null for a cross-owner proposal without leaking existence", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    await testDb.insert(tripProjects).values({ id: "p2", userId: "user-2", title: "Riêng" });
    await testDb.insert(tripPlanItems).values({ id: "leg-b", tripProjectId: "p2", userId: "user-2", kind: "leg", type: "transport", state: "idea", label: "B", ordinal: 0 });

    const persisted = await persistAs("user-2", "user-2@example.com", "p2", "leg-b", "Riêng user-2");
    const proposalId = persisted.success ? persisted.proposal.id : "";

    const { getProposalForOwnerReview } = await loadReadsAs("user-1", "user-1@example.com");
    const leaked = await getProposalForOwnerReview("p2", proposalId);

    expect(leaked).toBeNull();
  });

  test("the owner review projection never exposes raw model prompts or responses", async () => {
    await createTestUser("user-1");
    await testDb.insert(tripProjects).values({ id: "p1", userId: "user-1", title: "Huế" });
    await testDb.insert(tripPlanItems).values({ id: "leg-a", tripProjectId: "p1", userId: "user-1", kind: "leg", type: "transport", state: "idea", label: "A", ordinal: 0 });

    const persisted = await persistAs("user-1", "user-1@example.com", "p1", "leg-a", "Đề xuất an toàn");
    if (!persisted.success) throw new Error("persist failed");
    const { getProposalForOwnerReview } = await loadReadsAs("user-1", "user-1@example.com");
    const proposal = await getProposalForOwnerReview("p1", persisted.proposal.id);
    if (!proposal) throw new Error("proposal missing");

    const serialized = JSON.stringify(proposal);
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("model");
    expect(serialized).not.toContain("response");
    expect(serialized).not.toContain("provider");
  });
});

describe("Story 7.5 applyApprovedTripChange DB-backed tests", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupProjectWithItem(userId: string, projectId: string) {
    await testDb.insert(tripProjects).values({ id: projectId, userId, title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "leg-1", tripProjectId: projectId, userId, kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
  }

  async function loadModuleAs(userId: string, email: string) {
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId, email }) }));
    return await import("@/features/chat-trips/trip-change-proposals");
  }

  async function persistProposalAs(userId: string, email: string, projectId: string, operations: unknown[], expectedItemVersions?: Record<string, number>) {
    const { persistAiTripChangeProposalDraft } = await loadModuleAs(userId, email);
    return persistAiTripChangeProposalDraft({
      tripProjectId: projectId,
      expectedAggregateVersion: 1,
      expectedItemVersions: expectedItemVersions ?? { "leg-1": 1 },
      operations,
      rationale: "Áp dụng thay đổi.",
    });
  }

  test("applies a change-item-state proposal atomically: mutates plan, advances aggregate + item version, writes one apply history + audit row", async () => {
    await createTestUser("apply-user-1");
    await setupProjectWithItem("apply-user-1", "apply-project-1");
    const persisted = await persistProposalAs("apply-user-1", "apply-user-1@example.com", "apply-project-1", [
      { kind: "change-item-state", itemId: "leg-1", state: "confirmed" },
    ]);
    if (!persisted.success) throw new Error("persist failed");
    const proposalId = persisted.proposal.id;
    const { applyApprovedTripChange } = await loadModuleAs("apply-user-1", "apply-user-1@example.com");

    const result = await applyApprovedTripChange({ tripProjectId: "apply-project-1", proposalId });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.aggregateVersion).toBe(2);
    expect(result.proposal.status).toBe("applied");
    expect(result.proposal.terminalTimestamp).toBeInstanceOf(Date);

    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, "apply-project-1"));
    const [savedItem] = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.id, "leg-1"));
    expect(savedProject.aggregateVersion).toBe(2);
    expect(savedItem.state).toBe("confirmed");
    expect(savedItem.version).toBe(2);

    const historyRows = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, proposalId));
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]).toMatchObject({ operationClass: "apply", actorClass: "user", actorUserId: "apply-user-1" });

    const applyAudits = await testDb.select().from(auditEvents).where(and(eq(auditEvents.operation, "apply"), eq(auditEvents.targetId, proposalId)));
    expect(applyAudits).toHaveLength(1);
    expect(applyAudits[0]).toMatchObject({ actorClass: "user", actorUserId: "apply-user-1" });
  });

  test("idempotent re-apply on an already-applied proposal is a no-op returning not_found (no second history row, no plan mutation)", async () => {
    await createTestUser("apply-user-2");
    await setupProjectWithItem("apply-user-2", "apply-project-2");
    const persisted = await persistProposalAs("apply-user-2", "apply-user-2@example.com", "apply-project-2", [
      { kind: "change-item-state", itemId: "leg-1", state: "confirmed" },
    ]);
    if (!persisted.success) throw new Error("persist failed");
    const proposalId = persisted.proposal.id;
    const { applyApprovedTripChange } = await loadModuleAs("apply-user-2", "apply-user-2@example.com");

    await applyApprovedTripChange({ tripProjectId: "apply-project-2", proposalId });
    const second = await applyApprovedTripChange({ tripProjectId: "apply-project-2", proposalId });

    expect(second).toEqual({ success: false, reason: "not_found" });
    const historyRows = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, proposalId));
    expect(historyRows).toHaveLength(1);
  });

  test("returns refresh_required when the aggregate version is stale and applies nothing", async () => {
    await createTestUser("apply-user-3");
    await setupProjectWithItem("apply-user-3", "apply-project-3");
    // Bump the aggregate version after the proposal was drafted.
    const persisted = await persistProposalAs("apply-user-3", "apply-user-3@example.com", "apply-project-3", [
      { kind: "change-item-state", itemId: "leg-1", state: "confirmed" },
    ]);
    if (!persisted.success) throw new Error("persist failed");
    await testDb.update(tripProjects).set({ aggregateVersion: 5 }).where(eq(tripProjects.id, "apply-project-3"));
    const { applyApprovedTripChange } = await loadModuleAs("apply-user-3", "apply-user-3@example.com");

    const result = await applyApprovedTripChange({ tripProjectId: "apply-project-3", proposalId: persisted.proposal.id });
    expect(result).toEqual({ success: false, reason: "refresh_required" });

    const [savedItem] = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.id, "leg-1"));
    expect(savedItem.state).toBe("planned");
    expect(savedItem.version).toBe(1);
    const historyRows = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, persisted.proposal.id));
    expect(historyRows).toHaveLength(0);
  });

  test("returns expired when expiresAt <= now and applies nothing (no history row)", async () => {
    await createTestUser("apply-user-4");
    await setupProjectWithItem("apply-user-4", "apply-project-4");
    const { persistAiTripChangeProposalDraft } = await loadModuleAs("apply-user-4", "apply-user-4@example.com");
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "apply-project-4",
      expectedAggregateVersion: 1,
      expectedItemVersions: { "leg-1": 1 },
      operations: [{ kind: "change-item-state", itemId: "leg-1", state: "confirmed" }],
      rationale: "Đã hết hạn.",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    if (!persisted.success) throw new Error("persist failed");
    const { applyApprovedTripChange } = await loadModuleAs("apply-user-4", "apply-user-4@example.com");

    const result = await applyApprovedTripChange({ tripProjectId: "apply-project-4", proposalId: persisted.proposal.id });
    expect(result).toEqual({ success: false, reason: "expired" });

    const [savedItem] = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.id, "leg-1"));
    expect(savedItem.state).toBe("planned");
    const historyRows = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, persisted.proposal.id));
    expect(historyRows).toHaveLength(0);
  });

  test("cross-owner apply returns not_found without leaking existence and applies nothing", async () => {
    await createTestUser("apply-owner");
    await createTestUser("apply-attacker");
    await setupProjectWithItem("apply-owner", "apply-owner-project");
    const persisted = await persistProposalAs("apply-owner", "apply-owner@example.com", "apply-owner-project", [
      { kind: "change-item-state", itemId: "leg-1", state: "confirmed" },
    ]);
    if (!persisted.success) throw new Error("persist failed");
    const { applyApprovedTripChange } = await loadModuleAs("apply-attacker", "apply-attacker@example.com");

    const result = await applyApprovedTripChange({ tripProjectId: "apply-owner-project", proposalId: persisted.proposal.id });
    expect(result).toEqual({ success: false, reason: "not_found" });

    const [savedItem] = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.id, "leg-1"));
    expect(savedItem.state).toBe("planned");
    expect(savedItem.version).toBe(1);
  });

  test("returns refresh_required when the affected item version is stale and applies nothing", async () => {
    await createTestUser("apply-user-5");
    await setupProjectWithItem("apply-user-5", "apply-project-5");
    // Draft the proposal against item version 1, then bump the item version.
    const persisted = await persistProposalAs("apply-user-5", "apply-user-5@example.com", "apply-project-5", [
      { kind: "change-item-state", itemId: "leg-1", state: "confirmed" },
    ]);
    if (!persisted.success) throw new Error("persist failed");
    await testDb.update(tripPlanItems).set({ version: 9 }).where(eq(tripPlanItems.id, "leg-1"));
    const { applyApprovedTripChange } = await loadModuleAs("apply-user-5", "apply-user-5@example.com");

    const result = await applyApprovedTripChange({ tripProjectId: "apply-project-5", proposalId: persisted.proposal.id });
    expect(result).toEqual({ success: false, reason: "refresh_required" });
  });
});

describe("Story 7.5 dismissTripChangeProposal DB-backed tests", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function loadModuleAs(userId: string, email: string) {
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId, email }) }));
    return await import("@/features/chat-trips/trip-change-proposals");
  }

  test("dismisses a pending proposal: writes one dismiss history + audit row, no plan mutation, no aggregate version change", async () => {
    await createTestUser("dismiss-user-1");
    await testDb.insert(tripProjects).values({ id: "dismiss-project-1", userId: "dismiss-user-1", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "dismiss-leg-1", tripProjectId: "dismiss-project-1", userId: "dismiss-user-1", kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
    const { persistAiTripChangeProposalDraft } = await loadModuleAs("dismiss-user-1", "dismiss-user-1@example.com");
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "dismiss-project-1",
      expectedAggregateVersion: 1,
      expectedItemVersions: { "dismiss-leg-1": 1 },
      operations: [{ kind: "change-item-state", itemId: "dismiss-leg-1", state: "confirmed" }],
      rationale: "Giữ kế hoạch.",
    });
    if (!persisted.success) throw new Error("persist failed");
    const { dismissTripChangeProposal } = await loadModuleAs("dismiss-user-1", "dismiss-user-1@example.com");

    const result = await dismissTripChangeProposal({ tripProjectId: "dismiss-project-1", proposalId: persisted.proposal.id });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.proposal.status).toBe("dismissed");
    expect(result.proposal.terminalTimestamp).toBeInstanceOf(Date);

    const [savedItem] = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.id, "dismiss-leg-1"));
    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, "dismiss-project-1"));
    expect(savedItem.state).toBe("planned");
    expect(savedItem.version).toBe(1);
    expect(savedProject.aggregateVersion).toBe(1);

    const historyRows = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, persisted.proposal.id));
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]).toMatchObject({ operationClass: "dismiss", actorClass: "user", actorUserId: "dismiss-user-1" });

    const dismissAudits = await testDb.select().from(auditEvents).where(and(eq(auditEvents.operation, "dismiss"), eq(auditEvents.targetId, persisted.proposal.id)));
    expect(dismissAudits).toHaveLength(1);
    expect(dismissAudits[0]).toMatchObject({ actorClass: "user" });
  });

  test("idempotent dismiss on an already-dismissed proposal: no second history row", async () => {
    await createTestUser("dismiss-user-2");
    await testDb.insert(tripProjects).values({ id: "dismiss-project-2", userId: "dismiss-user-2", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "dismiss-leg-2", tripProjectId: "dismiss-project-2", userId: "dismiss-user-2", kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
    const { persistAiTripChangeProposalDraft, dismissTripChangeProposal } = await loadModuleAs("dismiss-user-2", "dismiss-user-2@example.com");
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "dismiss-project-2",
      expectedAggregateVersion: 1,
      operations: [{ kind: "change-item-state", itemId: "dismiss-leg-2", state: "confirmed" }],
      rationale: "Giữ kế hoạch.",
    });
    if (!persisted.success) throw new Error("persist failed");

    await dismissTripChangeProposal({ tripProjectId: "dismiss-project-2", proposalId: persisted.proposal.id });
    await dismissTripChangeProposal({ tripProjectId: "dismiss-project-2", proposalId: persisted.proposal.id });

    const historyRows = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, persisted.proposal.id));
    expect(historyRows).toHaveLength(1);
  });

  test("cross-owner dismiss returns not_found without leaking existence", async () => {
    await createTestUser("dismiss-owner");
    await createTestUser("dismiss-attacker");
    await testDb.insert(tripProjects).values({ id: "dismiss-owner-project", userId: "dismiss-owner", title: "Riêng", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "dismiss-owner-leg", tripProjectId: "dismiss-owner-project", userId: "dismiss-owner", kind: "leg", type: "transport", state: "planned", label: "X", ordinal: 0, version: 1 });
    const { persistAiTripChangeProposalDraft } = await loadModuleAs("dismiss-owner", "dismiss-owner@example.com");
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "dismiss-owner-project",
      expectedAggregateVersion: 1,
      operations: [{ kind: "change-item-state", itemId: "dismiss-owner-leg", state: "confirmed" }],
      rationale: "Riêng chủ.",
    });
    if (!persisted.success) throw new Error("persist failed");
    const { dismissTripChangeProposal } = await loadModuleAs("dismiss-attacker", "dismiss-attacker@example.com");

    const result = await dismissTripChangeProposal({ tripProjectId: "dismiss-owner-project", proposalId: persisted.proposal.id });
    expect(result).toEqual({ success: false, reason: "not_found" });
  });
});

describe("Story 7.5 expireTripChangeProposal DB-backed tests", () => {
  beforeAll(async () => {
    await ensureSystemTripPlanningActor();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("expires a pending proposal with the system-trip-planning actor: one expire history + audit row, no plan mutation", async () => {
    await ensureSystemTripPlanningActor();
    await createTestUser("expire-user-1");
    await testDb.insert(tripProjects).values({ id: "expire-project-1", userId: "expire-user-1", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "expire-leg-1", tripProjectId: "expire-project-1", userId: "expire-user-1", kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "expire-user-1", email: "expire-user-1@example.com" }) }));
    const { persistAiTripChangeProposalDraft, expireTripChangeProposal } = await import("@/features/chat-trips/trip-change-proposals");
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "expire-project-1",
      expectedAggregateVersion: 1,
      operations: [{ kind: "change-item-state", itemId: "expire-leg-1", state: "confirmed" }],
      rationale: "Hết hạn.",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    if (!persisted.success) throw new Error("persist failed");

    const result = await expireTripChangeProposal({ tripProjectId: "expire-project-1", proposalId: persisted.proposal.id, now: new Date("2026-07-25T00:00:00.000Z") });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.proposal.status).toBe("expired");
    expect(result.proposal.terminalTimestamp).toBeInstanceOf(Date);

    const [savedItem] = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.id, "expire-leg-1"));
    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, "expire-project-1"));
    expect(savedItem.state).toBe("planned");
    expect(savedItem.version).toBe(1);
    expect(savedProject.aggregateVersion).toBe(1);

    const historyRows = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, persisted.proposal.id));
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]).toMatchObject({ operationClass: "expire", actorClass: "system", actorSystem: "system-trip-planning", actorUserId: null });

    const expireAudits = await testDb.select().from(auditEvents).where(and(eq(auditEvents.operation, "expire"), eq(auditEvents.targetId, persisted.proposal.id)));
    expect(expireAudits).toHaveLength(1);
    expect(expireAudits[0]).toMatchObject({ actorClass: "system", actorSystem: "system-trip-planning", actorUserId: "system-trip-planning" });
  });

  test("idempotent expire on an already-expired proposal: no second history row", async () => {
    await ensureSystemTripPlanningActor();
    await createTestUser("expire-user-2");
    await testDb.insert(tripProjects).values({ id: "expire-project-2", userId: "expire-user-2", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "expire-leg-2", tripProjectId: "expire-project-2", userId: "expire-user-2", kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "expire-user-2", email: "expire-user-2@example.com" }) }));
    const { persistAiTripChangeProposalDraft, expireTripChangeProposal } = await import("@/features/chat-trips/trip-change-proposals");
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "expire-project-2",
      expectedAggregateVersion: 1,
      operations: [{ kind: "change-item-state", itemId: "expire-leg-2", state: "confirmed" }],
      rationale: "Hết hạn.",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    if (!persisted.success) throw new Error("persist failed");

    await expireTripChangeProposal({ tripProjectId: "expire-project-2", proposalId: persisted.proposal.id });
    await expireTripChangeProposal({ tripProjectId: "expire-project-2", proposalId: persisted.proposal.id });

    const historyRows = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, persisted.proposal.id));
    expect(historyRows).toHaveLength(1);
  });

  test("expire returns not_found for a missing proposal without leaking existence (system command, no user auth)", async () => {
    await ensureSystemTripPlanningActor();
    await createTestUser("expire-attacker");
    await testDb.insert(tripProjects).values({ id: "expire-attacker-project", userId: "expire-attacker", title: "Riêng", aggregateVersion: 1 });
    const { expireTripChangeProposal } = await import("@/features/chat-trips/trip-change-proposals");

    // expire is a system-only command (no session); a missing proposal returns
    // not_found. It is never exposed as a user action — cross-owner protection
    // comes from the owner-scoped read paths that invoke expire-on-read.
    const result = await expireTripChangeProposal({ tripProjectId: "expire-attacker-project", proposalId: "nonexistent-proposal" });
    expect(result).toEqual({ success: false, reason: "not_found" });
  });
});

describe("Story 7.5 expire-on-read and plan history read", () => {
  beforeAll(async () => {
    await ensureSystemTripPlanningActor();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("listPendingProposalsForTripProject expires elapsed pending proposals before returning so they drop out of the pending list", async () => {
    await ensureSystemTripPlanningActor();
    await createTestUser("expire-read-user-1");
    await testDb.insert(tripProjects).values({ id: "expire-read-project-1", userId: "expire-read-user-1", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "expire-read-leg-1", tripProjectId: "expire-read-project-1", userId: "expire-read-user-1", kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "expire-read-user-1", email: "expire-read-user-1@example.com" }) }));
    const { persistAiTripChangeProposalDraft, listPendingProposalsForTripProject, listPlanHistoryForTripProject } = await import("@/features/chat-trips/trip-change-proposals");
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "expire-read-project-1",
      expectedAggregateVersion: 1,
      operations: [{ kind: "change-item-state", itemId: "expire-read-leg-1", state: "confirmed" }],
      rationale: "Hết hạn trên read.",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    if (!persisted.success) throw new Error("persist failed");

    const pending = await listPendingProposalsForTripProject("expire-read-project-1");
    expect(pending).toHaveLength(0);

    const history = await listPlanHistoryForTripProject("expire-read-project-1");
    expect(history).toHaveLength(1);
    expect(history?.[0].operationClass).toBe("expire");
    expect(history?.[0].actorClass).toBe("system");
    expect(history?.[0].actorSystem).toBe("system-trip-planning");
  });

  test("listPlanHistoryForTripProject is owner-scoped and never exposes raw model prompts/responses", async () => {
    await createTestUser("history-user-1");
    await createTestUser("history-attacker");
    await testDb.insert(tripProjects).values({ id: "history-project-1", userId: "history-user-1", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanChangeHistory).values({
      tripProjectId: "history-project-1",
      userId: "history-user-1",
      proposalId: "history-proposal-1",
      actorUserId: "history-user-1",
      actorClass: "user",
      operationClass: "apply",
      affectedItemReferences: [{ itemId: "leg-1", kind: "leg", label: "Chạy xe", change: "change-state" }],
      safeBeforeAfterSummary: { entries: [{ operation: "Đổi trạng thái · Chạy xe", before: "Ý tưởng", after: "Đã chốt" }] },
    });

    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "history-user-1", email: "history-user-1@example.com" }) }));
    const { listPlanHistoryForTripProject } = await import("@/features/chat-trips/trip-change-proposals");
    const history = await listPlanHistoryForTripProject("history-project-1");
    expect(history).toHaveLength(1);
    const serialized = JSON.stringify(history);
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("model");
    expect(serialized).not.toContain("provider");

    // Cross-owner returns null (no existence leak).
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "history-attacker", email: "history-attacker@example.com" }) }));
    const { listPlanHistoryForTripProject: crossOwnerRead } = await import("@/features/chat-trips/trip-change-proposals");
    const leaked = await crossOwnerRead("history-project-1");
    expect(leaked).toEqual([]);
  });

  test("formatPlanHistoryRow produces Vietnamese operation/actor/timestamp labels", async () => {
    const { formatPlanHistoryRow } = await import("@/features/chat-trips/trip-change-proposals");
    const view = formatPlanHistoryRow({
      id: "row-1",
      proposalId: "proposal-1",
      operationClass: "apply",
      actorClass: "user",
      actorSystem: null,
      actorUserId: "user-1",
      createdAt: new Date("2026-07-25T03:00:00.000Z"),
      affectedItemReferences: [{ itemId: "leg-1", kind: "leg", label: "Chạy xe", change: "change-state" }],
      safeBeforeAfterSummary: [{ operation: "Đổi trạng thái", before: null, after: "Đã chốt" }],
    });
    expect(view.operationLabel).toBe("Áp dụng");
    expect(view.actorLabel).toBe("Bạn");
    expect(view.timestampLabel).toContain("2026-07-25");
    expect(view.timestampLabel).toContain("giờ Việt Nam");
    expect(view.affectedItemLabels).toEqual(["Chạy xe"]);

    const systemView = formatPlanHistoryRow({
      id: "row-2",
      proposalId: null,
      operationClass: "expire",
      actorClass: "system",
      actorSystem: "system-trip-planning",
      actorUserId: null,
      createdAt: new Date("2026-07-25T03:00:00.000Z"),
      affectedItemReferences: [],
      safeBeforeAfterSummary: [],
    });
    expect(systemView.operationLabel).toBe("Đã hết hạn");
    expect(systemView.actorLabel).toBe("Hệ thống");
  });
});
