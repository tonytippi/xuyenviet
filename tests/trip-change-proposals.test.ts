import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, conversations, messages, tripChangeProposals, tripPlanChangeHistory, tripPlanItems, tripProjects, users } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
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

beforeEach(async () => {
  await resetTestDatabase();
});

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

    const expiresAt = new Date(Date.now() + 86_400_000); // tomorrow — strictly future (E7R2-F4)
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

  // E7R2-F4: a past-date expires_at is dead-on-arrival — expire-on-read would
  // flip the proposal to expired on first view before the owner ever sees it as
  // pending. persistAiTripChangeProposalDraft must reject a past/present
  // expires_at with `invalid` and write no row. A future expiry is still
  // accepted (covered by the "persists a pending proposal" test above).
  test("(E7R2-F4) rejects a past-date expiresAt with invalid and writes no row", async () => {
    await createTestUser("user-1");
    await setupProject("user-1", "project-1");
    const { persistAiTripChangeProposalDraft } = await loadModule();

    const result = await persistAiTripChangeProposalDraft({
      tripProjectId: "project-1",
      expectedAggregateVersion: 1,
      expectedItemVersions: { "leg-1": 1 },
      operations: validOperations(),
      rationale: "Hết hạn ngay.",
      expiresAt: new Date(Date.now() - 60_000), // 1 minute in the past
    });

    expect(result).toEqual({ success: false, reason: "invalid" });
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(0);
  });

  test("(E7R2-F4) rejects a present-date (now) expiresAt with invalid and writes no row", async () => {
    await createTestUser("user-1");
    await setupProject("user-1", "project-1");
    const { persistAiTripChangeProposalDraft } = await loadModule();

    const result = await persistAiTripChangeProposalDraft({
      tripProjectId: "project-1",
      expectedAggregateVersion: 1,
      expectedItemVersions: { "leg-1": 1 },
      operations: validOperations(),
      rationale: "Hết hạn ngay.",
      expiresAt: new Date(), // exactly now — not strictly future
    });

    expect(result).toEqual({ success: false, reason: "invalid" });
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(0);
  });

  test("(E7R2-F4) rejects an invalid (NaN) expiresAt Date with invalid and writes no row", async () => {
    await createTestUser("user-1");
    await setupProject("user-1", "project-1");
    const { persistAiTripChangeProposalDraft } = await loadModule();

    const invalidDate = new Date("not-a-date");
    const result = await persistAiTripChangeProposalDraft({
      tripProjectId: "project-1",
      expectedAggregateVersion: 1,
      expectedItemVersions: { "leg-1": 1 },
      operations: validOperations(),
      rationale: "Ngày sai.",
      expiresAt: invalidDate,
    });

    expect(result).toEqual({ success: false, reason: "invalid" });
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

  test("terminalizes elapsed proposals as system expiry before returning expired and applies nothing", async () => {
    await createTestUser("apply-user-4");
    await setupProjectWithItem("apply-user-4", "apply-project-4");
    const { persistAiTripChangeProposalDraft } = await loadModuleAs("apply-user-4", "apply-user-4@example.com");
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "apply-project-4",
      expectedAggregateVersion: 1,
      expectedItemVersions: { "leg-1": 1 },
      operations: [{ kind: "change-item-state", itemId: "leg-1", state: "confirmed" }],
      rationale: "Đã hết hạn.",
      expiresAt: new Date(Date.now() + 60_000),
    });
    if (!persisted.success) throw new Error("persist failed");
    await testDb
      .update(tripChangeProposals)
      .set({ expiresAt: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(tripChangeProposals.id, persisted.proposal.id));
    const { applyApprovedTripChange } = await loadModuleAs("apply-user-4", "apply-user-4@example.com");

    const result = await applyApprovedTripChange({ tripProjectId: "apply-project-4", proposalId: persisted.proposal.id });
    expect(result).toEqual({ success: false, reason: "expired" });

    const [savedItem] = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.id, "leg-1"));
    expect(savedItem.state).toBe("planned");
    const historyRows = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, persisted.proposal.id));
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]).toMatchObject({ operationClass: "expire", actorClass: "system", actorSystem: "system-trip-planning", actorUserId: null });
    const audits = await testDb.select().from(auditEvents).where(and(eq(auditEvents.operation, "expire"), eq(auditEvents.targetId, persisted.proposal.id)));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorClass: "system", actorSystem: "system-trip-planning", actorUserId: null, actorEmail: null });
    const [project] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, "apply-project-4"));
    expect(project.aggregateVersion).toBe(1);
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

describe("Story 11.4 annotation action binding DB-backed tests", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupBoundProposal() {
    await createTestUser("binding-owner");
    await createTestUser("binding-other");
    await testDb.insert(tripProjects).values({ id: "binding-project", userId: "binding-owner", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "binding-leg", tripProjectId: "binding-project", userId: "binding-owner", kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
    const [conversation] = await testDb.insert(conversations).values({ id: "binding-conversation", userId: "binding-owner", tripProjectId: "binding-project" }).returning({ id: conversations.id });
    const [assistant] = await testDb.insert(messages).values({ id: "binding-assistant", conversationId: conversation.id, userId: "binding-owner", role: "assistant", content: "Đề xuất này." }).returning({ id: messages.id });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "binding-owner", email: "binding-owner@example.com" }) }));
    const { persistAiTripChangeProposalDraft } = await import("@/features/chat-trips/trip-change-proposals");
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "binding-project",
      expectedAggregateVersion: 1,
      expectedItemVersions: { "binding-leg": 1 },
      operations: [{ kind: "change-item-state", itemId: "binding-leg", state: "confirmed" }],
      rationale: "Xác nhận chặng xe.",
      sourceAssistantMessageId: assistant.id,
    });
    if (!persisted.success) throw new Error("Expected proposal persistence");
    const annotationId = "trip-change-proposal-apply";
    await testDb.update(messages).set({
      answerAnnotations: [{
        id: annotationId,
        start: 0,
        end: 1,
        text: "Đ",
        type: "action",
        detail: { type: "action", label: "Đ", action: { command: "trip_change_proposal.apply", label: "Đ", arguments: {}, anchor: "trip-change-proposal-action.v1" } },
      }],
    }).where(eq(messages.id, assistant.id));
    return { assistant, conversation, proposal: persisted.proposal, annotationId };
  }

  test("rejects substituted annotation IDs and commands without applying the proposal", async () => {
    const fixture = await setupBoundProposal();
    const { applyApprovedTripChange } = await import("@/features/chat-trips/trip-change-proposals");

    await expect(applyApprovedTripChange({
      tripProjectId: "binding-project",
      proposalId: fixture.proposal.id,
      annotationBinding: { conversationId: fixture.conversation.id, assistantMessageId: fixture.assistant.id, annotationId: "other-annotation", command: "trip_change_proposal.apply" },
    })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(applyApprovedTripChange({
      tripProjectId: "binding-project",
      proposalId: fixture.proposal.id,
      annotationBinding: { conversationId: fixture.conversation.id, assistantMessageId: fixture.assistant.id, annotationId: fixture.annotationId, command: "trip_change_proposal.dismiss" },
    })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(testDb.select({ state: tripPlanItems.state }).from(tripPlanItems).where(eq(tripPlanItems.id, "binding-leg"))).resolves.toEqual([{ state: "planned" }]);
  });

  test("rejects removed descriptors and cross-owner bindings without disclosing or mutating", async () => {
    const fixture = await setupBoundProposal();
    await testDb.update(messages).set({ answerAnnotations: [] }).where(eq(messages.id, fixture.assistant.id));
    const { applyApprovedTripChange } = await import("@/features/chat-trips/trip-change-proposals");

    await expect(applyApprovedTripChange({
      tripProjectId: "binding-project",
      proposalId: fixture.proposal.id,
      annotationBinding: { conversationId: fixture.conversation.id, assistantMessageId: fixture.assistant.id, annotationId: fixture.annotationId, command: "trip_change_proposal.apply" },
    })).resolves.toEqual({ success: false, reason: "not_found" });
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "binding-other", email: "binding-other@example.com" }) }));
    const { applyApprovedTripChange: applyAsOther } = await import("@/features/chat-trips/trip-change-proposals");
    await expect(applyAsOther({ tripProjectId: "binding-project", proposalId: fixture.proposal.id })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(testDb.select({ state: tripPlanItems.state }).from(tripPlanItems).where(eq(tripPlanItems.id, "binding-leg"))).resolves.toEqual([{ state: "planned" }]);
  });

  test("requires an annotation binding to name the proposal's source assistant at lock time", async () => {
    const fixture = await setupBoundProposal();
    const [otherAssistant] = await testDb.insert(messages).values({ id: "binding-other-assistant", conversationId: fixture.conversation.id, userId: "binding-owner", role: "assistant", content: "Đề xuất khác." }).returning({ id: messages.id });
    await testDb.update(messages).set({
      answerAnnotations: [{
        id: fixture.annotationId,
        start: 0,
        end: 1,
        text: "Đ",
        type: "action",
        detail: { type: "action", label: "Đ", action: { command: "trip_change_proposal.apply", label: "Đ", arguments: {}, anchor: "trip-change-proposal-action.v1" } },
      }],
    }).where(eq(messages.id, otherAssistant.id));
    const { applyApprovedTripChange, dismissTripChangeProposal } = await import("@/features/chat-trips/trip-change-proposals");
    const binding = { conversationId: fixture.conversation.id, assistantMessageId: otherAssistant.id, annotationId: fixture.annotationId, command: "trip_change_proposal.apply" as const };

    await expect(applyApprovedTripChange({ tripProjectId: "binding-project", proposalId: fixture.proposal.id, annotationBinding: binding })).resolves.toEqual({ success: false, reason: "not_found" });
    await testDb.update(messages).set({ answerAnnotations: [{ id: fixture.annotationId, start: 0, end: 1, text: "Đ", type: "action", detail: { type: "action", label: "Đ", action: { command: "trip_change_proposal.dismiss", label: "Đ", arguments: {}, anchor: "trip-change-proposal-action.v1" } } }] }).where(eq(messages.id, otherAssistant.id));
    await expect(dismissTripChangeProposal({ tripProjectId: "binding-project", proposalId: fixture.proposal.id, annotationBinding: { ...binding, command: "trip_change_proposal.dismiss" } })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(testDb.select({ state: tripPlanItems.state }).from(tripPlanItems).where(eq(tripPlanItems.id, "binding-leg"))).resolves.toEqual([{ state: "planned" }]);
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, fixture.proposal.id))).resolves.toEqual([{ status: "pending" }]);
  });

  test("fails closed when dismissal wins the action race", async () => {
    const fixture = await setupBoundProposal();
    const { dismissTripChangeProposal, applyApprovedTripChange } = await import("@/features/chat-trips/trip-change-proposals");
    await expect(dismissTripChangeProposal({ tripProjectId: "binding-project", proposalId: fixture.proposal.id })).resolves.toMatchObject({ success: true });

    await expect(applyApprovedTripChange({
      tripProjectId: "binding-project",
      proposalId: fixture.proposal.id,
      annotationBinding: { conversationId: fixture.conversation.id, assistantMessageId: fixture.assistant.id, annotationId: fixture.annotationId, command: "trip_change_proposal.apply" },
    })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(testDb.select({ state: tripPlanItems.state }).from(tripPlanItems).where(eq(tripPlanItems.id, "binding-leg"))).resolves.toEqual([{ state: "planned" }]);
    await expect(testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, fixture.proposal.id))).resolves.toHaveLength(1);
  });

  test("expires instead of dismissing when the bound annotation action reaches an elapsed proposal", async () => {
    const fixture = await setupBoundProposal();
    await testDb.update(messages).set({
      answerAnnotations: [{
        id: "trip-change-proposal-dismiss",
        start: 0,
        end: 1,
        text: "Đ",
        type: "action",
        detail: { type: "action", label: "Đ", action: { command: "trip_change_proposal.dismiss", label: "Đ", arguments: {}, anchor: "trip-change-proposal-action.v1" } },
      }],
    }).where(eq(messages.id, fixture.assistant.id));
    await testDb.update(tripChangeProposals)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(tripChangeProposals.id, fixture.proposal.id));
    const { dismissTripChangeProposal } = await import("@/features/chat-trips/trip-change-proposals");

    await expect(dismissTripChangeProposal({
      tripProjectId: "binding-project",
      proposalId: fixture.proposal.id,
      annotationBinding: {
        conversationId: fixture.conversation.id,
        assistantMessageId: fixture.assistant.id,
        annotationId: "trip-change-proposal-dismiss",
        command: "trip_change_proposal.dismiss",
      },
    })).resolves.toEqual({ success: false, reason: "expired" });

    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, fixture.proposal.id))).resolves.toEqual([{ status: "expired" }]);
    await expect(testDb.select({ operationClass: tripPlanChangeHistory.operationClass }).from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, fixture.proposal.id))).resolves.toEqual([{ operationClass: "expire" }]);
  });

  async function loadAnnotationActionsAs(userId = "binding-owner") {
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId, email: `${userId}@example.com` }) }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
    return await import("@/features/chat-trips/actions");
  }

  async function expectNoAnnotationActionMutation(proposalId: string) {
    await expect(testDb.select({ state: tripPlanItems.state, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "binding-leg"))).resolves.toEqual([{ state: "planned", version: 1 }]);
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, proposalId))).resolves.toEqual([{ status: "pending" }]);
    await expect(testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, proposalId))).resolves.toHaveLength(0);
  }

  test("public action boundary rejects malformed and additional browser input without mutation", async () => {
    const fixture = await setupBoundProposal();
    const { executeAnnotationAction } = await loadAnnotationActionsAs();
    const validInput = { conversationId: fixture.conversation.id, assistantMessageId: fixture.assistant.id, annotationId: fixture.annotationId, command: "trip_change_proposal.apply" as const };

    await expect(executeAnnotationAction({ ...validInput, proposalId: fixture.proposal.id } as never)).resolves.toMatchObject({ success: false, reason: "not_found" });
    await expect(executeAnnotationAction({ ...validInput, command: "unknown" } as never)).resolves.toMatchObject({ success: false, reason: "not_found" });
    await expect(executeAnnotationAction({ ...validInput, annotationId: " " })).resolves.toMatchObject({ success: false, reason: "not_found" });
    await expectNoAnnotationActionMutation(fixture.proposal.id);
  });

  test("public action boundary applies its one current four-field capability", async () => {
    const fixture = await setupBoundProposal();
    const { executeAnnotationAction } = await loadAnnotationActionsAs();

    await expect(executeAnnotationAction({
      conversationId: fixture.conversation.id,
      assistantMessageId: fixture.assistant.id,
      annotationId: fixture.annotationId,
      command: "trip_change_proposal.apply",
    })).resolves.toEqual({ success: true, aggregateVersion: 2, proposalStatus: "applied" });

    await expect(testDb.select({ state: tripPlanItems.state, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "binding-leg"))).resolves.toEqual([{ state: "confirmed", version: 2 }]);
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, fixture.proposal.id))).resolves.toEqual([{ status: "applied" }]);
    await expect(testDb.select({ operationClass: tripPlanChangeHistory.operationClass }).from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, fixture.proposal.id))).resolves.toEqual([{ operationClass: "apply" }]);
  });

  test("public action boundary rejects cross-user and cross-conversation bindings without mutation", async () => {
    const fixture = await setupBoundProposal();
    const ownerActions = await loadAnnotationActionsAs();
    const [otherConversation] = await testDb.insert(conversations).values({ id: "binding-owner-other-conversation", userId: "binding-owner", tripProjectId: "binding-project" }).returning({ id: conversations.id });

    await expect(ownerActions.executeAnnotationAction({ conversationId: otherConversation.id, assistantMessageId: fixture.assistant.id, annotationId: fixture.annotationId, command: "trip_change_proposal.apply" })).resolves.toMatchObject({ success: false, reason: "not_found" });
    const otherActions = await loadAnnotationActionsAs("binding-other");
    await expect(otherActions.executeAnnotationAction({ conversationId: fixture.conversation.id, assistantMessageId: fixture.assistant.id, annotationId: fixture.annotationId, command: "trip_change_proposal.apply" })).resolves.toMatchObject({ success: false, reason: "not_found" });
    await expectNoAnnotationActionMutation(fixture.proposal.id);
  });

  test("public action boundary requires exactly one pending source-message proposal", async () => {
    const fixture = await setupBoundProposal();
    const { executeAnnotationAction } = await loadAnnotationActionsAs();
    const input = { conversationId: fixture.conversation.id, assistantMessageId: fixture.assistant.id, annotationId: fixture.annotationId, command: "trip_change_proposal.apply" as const };

    await testDb.delete(tripChangeProposals).where(eq(tripChangeProposals.id, fixture.proposal.id));
    await expect(executeAnnotationAction(input)).resolves.toMatchObject({ success: false, reason: "not_found" });
    await testDb.insert(tripChangeProposals).values({
      id: "binding-matching-one", tripProjectId: "binding-project", userId: "binding-owner", creatorClass: "ai_orchestration", status: "pending", rationale: "Một", operations: [{ kind: "change-item-state", itemId: "binding-leg", state: "confirmed" }], expectedAggregateVersion: 1, expectedItemVersions: { "binding-leg": 1 }, sourceAssistantMessageId: fixture.assistant.id,
    });
    await testDb.insert(tripChangeProposals).values({
      id: "binding-matching-two", tripProjectId: "binding-project", userId: "binding-owner", creatorClass: "ai_orchestration", status: "pending", rationale: "Hai", operations: [{ kind: "change-item-state", itemId: "binding-leg", state: "confirmed" }], expectedAggregateVersion: 1, expectedItemVersions: { "binding-leg": 1 }, sourceAssistantMessageId: fixture.assistant.id,
    });
    await expect(executeAnnotationAction(input)).resolves.toMatchObject({ success: false, reason: "not_found" });
    await expect(testDb.select({ state: tripPlanItems.state, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "binding-leg"))).resolves.toEqual([{ state: "planned", version: 1 }]);
    await expect(testDb.select().from(tripPlanChangeHistory).where(inArray(tripPlanChangeHistory.proposalId, ["binding-matching-one", "binding-matching-two"]))).resolves.toHaveLength(0);
  });

  test("public action boundary fails closed for stale or deleted resolved capability", async () => {
    const fixture = await setupBoundProposal();
    const { executeAnnotationAction } = await loadAnnotationActionsAs();
    const input = { conversationId: fixture.conversation.id, assistantMessageId: fixture.assistant.id, annotationId: fixture.annotationId, command: "trip_change_proposal.apply" as const };

    await testDb.update(tripChangeProposals).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(tripChangeProposals.id, fixture.proposal.id));
    await expect(executeAnnotationAction(input)).resolves.toMatchObject({ success: false, reason: "not_found" });
    await testDb.update(messages).set({ answerAnnotations: [] }).where(eq(messages.id, fixture.assistant.id));
    await expect(executeAnnotationAction(input)).resolves.toMatchObject({ success: false, reason: "not_found" });
    await expectNoAnnotationActionMutation(fixture.proposal.id);
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
    // P17: assert the second call returns { success: true, proposal } (the
    // no-op success contract), not just that no second history row was written.
    const secondResult = await dismissTripChangeProposal({ tripProjectId: "dismiss-project-2", proposalId: persisted.proposal.id });
    expect(secondResult.success).toBe(true);

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
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("expires a pending proposal with the system-trip-planning actor: one expire history + audit row, no plan mutation", async () => {
    await createTestUser("expire-user-1");
    await testDb.insert(tripProjects).values({ id: "expire-project-1", userId: "expire-user-1", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "expire-leg-1", tripProjectId: "expire-project-1", userId: "expire-user-1", kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "expire-user-1", email: "expire-user-1@example.com" }) }));
    const { persistAiTripChangeProposalDraft, expireTripChangeProposal } = await import("@/features/chat-trips/trip-change-proposals");
    const futureExpiry = new Date(Date.now() + 60_000);
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "expire-project-1",
      expectedAggregateVersion: 1,
      operations: [{ kind: "change-item-state", itemId: "expire-leg-1", state: "confirmed" }],
      rationale: "Hết hạn.",
      expiresAt: futureExpiry,
    });
    if (!persisted.success) throw new Error("persist failed");

    const result = await expireTripChangeProposal({ tripProjectId: "expire-project-1", proposalId: persisted.proposal.id, now: new Date(futureExpiry.getTime() + 60_000) });
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
    expect(expireAudits[0]).toMatchObject({ actorClass: "system", actorSystem: "system-trip-planning", actorUserId: null, actorEmail: null });
  });

  test("idempotent expire on an already-expired proposal: no second history row", async () => {
    await createTestUser("expire-user-2");
    await testDb.insert(tripProjects).values({ id: "expire-project-2", userId: "expire-user-2", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "expire-leg-2", tripProjectId: "expire-project-2", userId: "expire-user-2", kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "expire-user-2", email: "expire-user-2@example.com" }) }));
    const { persistAiTripChangeProposalDraft, expireTripChangeProposal } = await import("@/features/chat-trips/trip-change-proposals");
    // E7R2-F4: persist rejects a past-date expiry. Persist a near-future
    // expiry (1 ms ahead) that has elapsed by the time the idempotent expire
    // calls run (default now = real clock, past the persisted expiry).
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "expire-project-2",
      expectedAggregateVersion: 1,
      operations: [{ kind: "change-item-state", itemId: "expire-leg-2", state: "confirmed" }],
      rationale: "Hết hạn.",
      expiresAt: new Date(Date.now() + 60_000),
    });
    if (!persisted.success) throw new Error("persist failed");
    await testDb
      .update(tripChangeProposals)
      .set({ expiresAt: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(tripChangeProposals.id, persisted.proposal.id));

    await expireTripChangeProposal({ tripProjectId: "expire-project-2", proposalId: persisted.proposal.id });
    await expireTripChangeProposal({ tripProjectId: "expire-project-2", proposalId: persisted.proposal.id });

    const historyRows = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, persisted.proposal.id));
    expect(historyRows).toHaveLength(1);
  });

  test("expire returns not_found for a missing proposal without leaking existence (system command, no user auth)", async () => {
    await createTestUser("expire-attacker");
    await testDb.insert(tripProjects).values({ id: "expire-attacker-project", userId: "expire-attacker", title: "Riêng", aggregateVersion: 1 });
    const { expireTripChangeProposal } = await import("@/features/chat-trips/trip-change-proposals");

    // expire is a system-only command (no session); a missing proposal returns
    // not_found. It is never exposed as a user action — cross-owner protection
    // comes from the owner-scoped read paths that invoke expire-on-read.
    const result = await expireTripChangeProposal({ tripProjectId: "expire-attacker-project", proposalId: "nonexistent-proposal" });
    expect(result).toEqual({ success: false, reason: "not_found" });
  });

  test("leaves future and non-expiring pending proposals unchanged without terminal records", async () => {
    await createTestUser("expire-user-3");
    await testDb.insert(tripProjects).values({ id: "expire-project-3", userId: "expire-user-3", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripChangeProposals).values([
      { id: "expire-future", tripProjectId: "expire-project-3", userId: "expire-user-3", creatorClass: "ai_orchestration", status: "pending", rationale: "Tương lai", operations: [{ kind: "change-item-state", itemId: "missing", state: "confirmed" }], expectedAggregateVersion: 1, expiresAt: new Date("2026-12-01T00:00:00.000Z") },
      { id: "expire-none", tripProjectId: "expire-project-3", userId: "expire-user-3", creatorClass: "ai_orchestration", status: "pending", rationale: "Không hạn", operations: [{ kind: "change-item-state", itemId: "missing", state: "confirmed" }], expectedAggregateVersion: 1, expiresAt: null },
    ]);
    const { expireTripChangeProposal } = await import("@/features/chat-trips/trip-change-proposals");
    const now = new Date("2026-07-25T00:00:00.000Z");

    for (const proposalId of ["expire-future", "expire-none"]) {
      const result = await expireTripChangeProposal({ tripProjectId: "expire-project-3", proposalId, now });
      expect(result.success).toBe(true);
      if (result.success) expect(result.proposal.status).toBe("pending");
    }

    await expect(testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.tripProjectId, "expire-project-3"))).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "trip_change_proposal"))).resolves.toHaveLength(0);
  });
});

describe("Story 7.5 expire-on-read and plan history read", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("listPendingProposalsForTripProject expires elapsed pending proposals before returning so they drop out of the pending list", async () => {
    await createTestUser("expire-read-user-1");
    await testDb.insert(tripProjects).values({ id: "expire-read-project-1", userId: "expire-read-user-1", title: "Huế", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "expire-read-leg-1", tripProjectId: "expire-read-project-1", userId: "expire-read-user-1", kind: "leg", type: "transport", state: "planned", label: "Chạy xe", ordinal: 0, version: 1 });
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "expire-read-user-1", email: "expire-read-user-1@example.com" }) }));
    const { persistAiTripChangeProposalDraft, listPendingProposalsForTripProject, listPlanHistoryForTripProject } = await import("@/features/chat-trips/trip-change-proposals");
    // E7R2-F4: persist rejects a past-date expiry. Persist a near-future
    // expiry (1 ms ahead) that has elapsed by the time the read runs, so
    // expire-on-read flips it to expired before the pending list returns.
    const persisted = await persistAiTripChangeProposalDraft({
      tripProjectId: "expire-read-project-1",
      expectedAggregateVersion: 1,
      operations: [{ kind: "change-item-state", itemId: "expire-read-leg-1", state: "confirmed" }],
      rationale: "Hết hạn trên read.",
      expiresAt: new Date(Date.now() + 1),
    });
    if (!persisted.success) throw new Error("persist failed");
    // Yield so the near-future expiry elapses before the read expires it.
    await new Promise((resolve) => setTimeout(resolve, 5));

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
    expect(leaked).toBeNull();
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
    expect(systemView.actorLabel).toBe("Lập kế hoạch chuyến đi");

    expect(formatPlanHistoryRow({
      id: "row-3",
      proposalId: null,
      operationClass: "expire",
      actorClass: "system",
      actorSystem: "untrusted-system",
      actorUserId: null,
      createdAt: new Date("2026-07-25T03:00:00.000Z"),
      affectedItemReferences: [],
      safeBeforeAfterSummary: [],
    }).actorLabel).toBe("Hệ thống");
  });
});

// P7: Pure unit tests for the apply orchestrator (mocked *InTransaction helpers
// via vi.doMock, no DB). Covers operation→helper routing, first-failed-op-
// aborts-subsequent, version-fence failures, expired, cross-owner, missing
// item, and the cross-operation backup-cycle case (P8).
describe("Story 7.5 applyApprovedTripChange pure unit tests (mocked helpers)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  type MockTransaction = {
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };

  function buildMockTransaction(scenario: {
    project?: { id: string; aggregateVersion: number; userId: string } | null;
    proposal?: {
      id: string;
      status: string;
      rationale: string;
      operations: unknown[];
      alternatives: unknown;
      expiresAt: Date | null;
      createdAt: Date;
      expectedAggregateVersion: number;
      expectedItemVersions: Record<string, number> | null;
      orderingPreconditions: unknown;
    } | null;
    items?: Array<Record<string, unknown>>;
    constraintsVersion?: number | null;
    onProposalLock?: () => void;
  }): MockTransaction {
    const selectMock = vi.fn();
    const updateMock = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) }));
    const insertMock = vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) }));

    selectMock.mockImplementation((selection?: Record<string, unknown>) => {
      const isProjectQuery = Boolean(selection && "aggregateVersion" in selection);
      const isProposalQuery = Boolean(selection && "status" in selection && "operations" in selection);
      const isConstraintsQuery = Boolean(selection && "version" in selection && !("aggregateVersion" in selection) && !("status" in selection));

      const resolveResult = () =>
        isProjectQuery ? (scenario.project ? [scenario.project] : []) :
        isProposalQuery ? (scenario.proposal ? [scenario.proposal] : []) :
        isConstraintsQuery ? (scenario.constraintsVersion !== null && scenario.constraintsVersion !== undefined ? [{ version: scenario.constraintsVersion }] : []) :
        (scenario.items ?? []);

      // Items query (select * — no limit/for, ends at where)
      if (!isProjectQuery && !isProposalQuery && !isConstraintsQuery) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(scenario.items ?? [])),
          })),
        };
      }
      // Project/proposal/constraints queries chain .limit(1)[.for("update")]
      // Make limit return a Promise that also has a .for method so both
      // `await ....limit(1)` (constraints) and `await ....limit(1).for("update")`
      // (project/proposal) resolve to the array.
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => {
            const promise = Promise.resolve(resolveResult()) as Promise<unknown> & { for: ReturnType<typeof vi.fn> };
             promise.for = vi.fn(() => {
               if (isProposalQuery) scenario.onProposalLock?.();
               return promise;
             });
            return { limit: vi.fn(() => promise) };
          }),
        })),
      };
    });

    return { select: selectMock, update: updateMock, insert: insertMock };
  }

  async function setupApplyMocks(scenario: Parameters<typeof buildMockTransaction>[0], helperMocks: Record<string, ReturnType<typeof vi.fn>>) {
    vi.resetModules();
    vi.clearAllMocks();
    const tx = buildMockTransaction(scenario);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    vi.doMock("@/db/client", () => ({
      getDb: () => ({
        select: tx.select,
        transaction: async (callback: (t: MockTransaction) => Promise<unknown>) => callback(tx),
      }),
    }));
    vi.doMock("@/features/chat-trips/trip-projects", () => helperMocks);
    vi.doMock("@/features/audit/events", () => ({
      recordAuditEvent: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/features/audit/history", () => ({
      recordPlanHistory: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/features/chat-trips/trip-home-labels", () => ({
      tripPlanItemStateLabels: { idea: "Ý tưởng", planned: "Đã lên kế hoạch", confirmed: "Đã chốt", backup: "Dự phòng" },
      tripChangeProposalLabels: {
        badge: "Đề xuất", apply: "Áp dụng", keepPlan: "Giữ kế hoạch", expired: "Đã hết hạn",
        refresh: "Làm mới đề xuất", refreshHint: "Làm mới", suggestionNote: "", beforeAfter: "",
        rationale: "", affectedItems: "", alternatives: "", viewAlternatives: "", planHistory: "",
        applied: "Đã áp dụng", dismissed: "Đã giữ kế hoạch", applying: "Đang áp dụng...", keepingPlan: "Đang giữ...",
      },
    }));
    return await import("@/features/chat-trips/trip-change-proposals");
  }

  function makeHelperMocks() {
    return {
      createTripPlanItemInTransaction: vi.fn().mockResolvedValue({ success: true, aggregateVersion: 2, itemId: "new-item" }),
      updateTripPlanItemInTransaction: vi.fn().mockResolvedValue({ success: true, aggregateVersion: 2 }),
      deleteTripPlanItemInTransaction: vi.fn().mockResolvedValue({ success: true, aggregateVersion: 2 }),
      reorderTripPlanItemInTransaction: vi.fn().mockResolvedValue({ success: true, aggregateVersion: 2 }),
      changeInternalTripPlanItemStateInTransaction: vi.fn().mockResolvedValue({ success: true, aggregateVersion: 2 }),
      upsertInternalTripProjectConstraintsInTransaction: vi.fn().mockResolvedValue({ success: true, aggregateVersion: 2 }),
      normalizePlanItem: vi.fn((input: Record<string, unknown>) => ({ ...input, anchorRole: input.anchorRole ?? null, type: input.type ?? null, parentItemId: input.parentItemId ?? null, backupTargetItemId: input.backupTargetItemId ?? null, plannedAt: input.plannedAt ?? null })),
      normalizeConstraints: vi.fn((input: Record<string, unknown>) => input),
    };
  }

  const baseProject = { id: "project-1", aggregateVersion: 1, userId: "user-1" };
  const baseItem = { id: "leg-1", version: 1, kind: "leg", state: "planned", label: "Chạy xe", notes: null, ordinal: 0, parentItemId: null, backupTargetItemId: null, type: "transport", anchorRole: null, plannedAt: null, transportOriginLabel: null, transportDestinationLabel: null, accommodationPlaceAreaLabel: null };

  test("(a) every operation kind routes to the correct helper", async () => {
    const helpers = makeHelperMocks();
    const ops = [
      { kind: "create-item", item: { kind: "leg", type: "transport", state: "idea", label: "New", ordinal: 0 }, ordinal: 0 },
      { kind: "update-item", itemId: "leg-1", changes: { label: "Updated" } },
      { kind: "remove-item", itemId: "leg-1" },
      { kind: "reorder-item", itemId: "leg-1", ordinal: 1 },
      { kind: "change-item-state", itemId: "leg-1", state: "confirmed" },
      { kind: "upsert-constraints", constraints: { adultCount: 2 } },
    ];
    // Initial setup call to warm the mocks; the loop below re-imports per op.
    await setupApplyMocks({
      project: baseProject,
      proposal: { id: "prop-1", status: "pending", rationale: "Test", operations: ops, alternatives: [], expiresAt: null, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: { "leg-1": 1 }, orderingPreconditions: null },
      items: [baseItem],
      constraintsVersion: 1,
    }, helpers);

    // remove-item deletes leg-1; subsequent ops referencing leg-1 would fail
    // the fence. So test each op independently instead.
    for (const op of ops) {
      const helpersSingle = makeHelperMocks();
      const { applyApprovedTripChange: apply } = await setupApplyMocks({
        project: baseProject,
        proposal: { id: "prop-1", status: "pending", rationale: "Test", operations: [op], alternatives: [], expiresAt: null, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: { "leg-1": 1 }, orderingPreconditions: null },
        items: [baseItem],
        constraintsVersion: 1,
      }, helpersSingle);
      await apply({ tripProjectId: "project-1", proposalId: "prop-1" });
      if (op.kind === "create-item") expect(helpersSingle.createTripPlanItemInTransaction).toHaveBeenCalled();
      if (op.kind === "update-item") expect(helpersSingle.updateTripPlanItemInTransaction).toHaveBeenCalled();
      if (op.kind === "remove-item") expect(helpersSingle.deleteTripPlanItemInTransaction).toHaveBeenCalled();
      if (op.kind === "reorder-item") expect(helpersSingle.reorderTripPlanItemInTransaction).toHaveBeenCalled();
      if (op.kind === "change-item-state") expect(helpersSingle.changeInternalTripPlanItemStateInTransaction).toHaveBeenCalled();
      if (op.kind === "upsert-constraints") expect(helpersSingle.upsertInternalTripProjectConstraintsInTransaction).toHaveBeenCalled();
    }
  });

  test("(b) first failed operation aborts all subsequent ones", async () => {
    const helpers = makeHelperMocks();
    helpers.updateTripPlanItemInTransaction.mockResolvedValueOnce({ success: false, reason: "invalid" });
    const ops = [
      { kind: "update-item", itemId: "leg-1", changes: { label: "Updated" } },
      { kind: "change-item-state", itemId: "leg-1", state: "confirmed" },
    ];
    const { applyApprovedTripChange } = await setupApplyMocks({
      project: { ...baseProject, aggregateVersion: 1 },
      proposal: { id: "prop-1", status: "pending", rationale: "Test", operations: ops, alternatives: [], expiresAt: null, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: { "leg-1": 1 }, orderingPreconditions: null },
      items: [{ ...baseItem, version: 1 }],
      constraintsVersion: null,
    }, helpers);

    const result = await applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("refresh_required");
    // Second op's helper was never called (P1: the orchestrator throws on
    // first failure, aborting the transaction).
    expect(helpers.changeInternalTripPlanItemStateInTransaction).not.toHaveBeenCalled();
  });

  test("(c) version-fence mismatch on aggregate returns refresh_required", async () => {
    const helpers = makeHelperMocks();
    const { applyApprovedTripChange } = await setupApplyMocks({
      project: { ...baseProject, aggregateVersion: 2 },
      proposal: { id: "prop-1", status: "pending", rationale: "Test", operations: [], alternatives: [], expiresAt: null, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: null, orderingPreconditions: null },
      items: [],
      constraintsVersion: null,
    }, helpers);

    const result = await applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" });
    expect(result).toEqual({ success: false, reason: "refresh_required" });
  });

  test("(d) expired proposal returns expired", async () => {
    const helpers = makeHelperMocks();
    const past = new Date(Date.now() - 60_000);
    const { applyApprovedTripChange } = await setupApplyMocks({
      project: baseProject,
      proposal: { id: "prop-1", status: "pending", rationale: "Test", operations: [], alternatives: [], expiresAt: past, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: null, orderingPreconditions: null },
      items: [],
      constraintsVersion: null,
    }, helpers);

    const result = await applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" });
    expect(result).toEqual({ success: false, reason: "expired" });
    expect(helpers.createTripPlanItemInTransaction).not.toHaveBeenCalled();
  });

  test("(d) rechecks expiry after acquiring the proposal lock", async () => {
    vi.useFakeTimers();
    try {
      const lockTime = new Date("2026-07-27T12:00:00.000Z");
      vi.setSystemTime(lockTime);
      const helpers = makeHelperMocks();
      const { applyApprovedTripChange } = await setupApplyMocks({
        project: baseProject,
        proposal: {
          id: "prop-1",
          status: "pending",
          rationale: "Test",
          operations: [],
          alternatives: [],
          expiresAt: new Date(lockTime.getTime() + 1),
          createdAt: lockTime,
          expectedAggregateVersion: 1,
          expectedItemVersions: null,
          orderingPreconditions: null,
        },
        items: [],
        constraintsVersion: null,
        onProposalLock: () => vi.setSystemTime(lockTime.getTime() + 2),
      }, helpers);

      await expect(applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" }))
        .resolves.toEqual({ success: false, reason: "expired" });
      expect(helpers.createTripPlanItemInTransaction).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("(e) cross-owner (missing project) returns not_found", async () => {
    const helpers = makeHelperMocks();
    const { applyApprovedTripChange } = await setupApplyMocks({
      project: null,
      proposal: null,
      items: [],
      constraintsVersion: null,
    }, helpers);

    const result = await applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" });
    expect(result).toEqual({ success: false, reason: "not_found" });
  });

  test("(f) missing item returns refresh_required", async () => {
    const helpers = makeHelperMocks();
    const { applyApprovedTripChange } = await setupApplyMocks({
      project: baseProject,
      proposal: { id: "prop-1", status: "pending", rationale: "Test", operations: [{ kind: "update-item", itemId: "missing-item", changes: { label: "X" } }], alternatives: [], expiresAt: null, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: { "missing-item": 1 }, orderingPreconditions: null },
      items: [],
      constraintsVersion: null,
    }, helpers);

    const result = await applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" });
    expect(result).toEqual({ success: false, reason: "refresh_required" });
  });

  // P8: cross-operation backup-cycle test (A→backup B, B→backup A)
  test("(g) cross-operation backup cycle returns refresh_required", async () => {
    const helpers = makeHelperMocks();
    const itemA = { ...baseItem, id: "item-a", version: 1, state: "planned", label: "A", backupTargetItemId: null };
    const itemB = { ...baseItem, id: "item-b", version: 1, state: "planned", label: "B", backupTargetItemId: null };
    const ops = [
      { kind: "change-item-state", itemId: "item-a", state: "backup", backupTargetItemId: "item-b" },
      { kind: "change-item-state", itemId: "item-b", state: "backup", backupTargetItemId: "item-a" },
    ];
    const { applyApprovedTripChange } = await setupApplyMocks({
      project: baseProject,
      proposal: { id: "prop-1", status: "pending", rationale: "Test", operations: ops, alternatives: [], expiresAt: null, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: { "item-a": 1, "item-b": 1 }, orderingPreconditions: null },
      items: [itemA, itemB],
      constraintsVersion: null,
    }, helpers);

    const result = await applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" });
    expect(result).toEqual({ success: false, reason: "refresh_required" });
    // No helper should be called — the cycle is detected pre-mutation.
    expect(helpers.changeInternalTripPlanItemStateInTransaction).not.toHaveBeenCalled();
  });

  test("(i) idempotent re-apply on already-applied proposal returns not_found", async () => {
    const helpers = makeHelperMocks();
    const { applyApprovedTripChange } = await setupApplyMocks({
      project: baseProject,
      proposal: { id: "prop-1", status: "applied", rationale: "Test", operations: [], alternatives: [], expiresAt: null, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: null, orderingPreconditions: null },
      items: [],
      constraintsVersion: null,
    }, helpers);

    const result = await applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" });
    expect(result).toEqual({ success: false, reason: "not_found" });
    expect(helpers.createTripPlanItemInTransaction).not.toHaveBeenCalled();
  });

  test("(P1) multi-op touching same item: second op sees updated version and succeeds", async () => {
    const helpers = makeHelperMocks();
    helpers.updateTripPlanItemInTransaction
      .mockResolvedValueOnce({ success: true, aggregateVersion: 2 })
      .mockResolvedValueOnce({ success: true, aggregateVersion: 3 });
    helpers.changeInternalTripPlanItemStateInTransaction
      .mockResolvedValueOnce({ success: true, aggregateVersion: 4 });
    const ops = [
      { kind: "update-item", itemId: "leg-1", changes: { label: "Updated" } },
      { kind: "change-item-state", itemId: "leg-1", state: "confirmed" },
    ];
    const { applyApprovedTripChange } = await setupApplyMocks({
      project: { ...baseProject, aggregateVersion: 1 },
      proposal: { id: "prop-1", status: "pending", rationale: "Test", operations: ops, alternatives: [], expiresAt: null, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: { "leg-1": 1 }, orderingPreconditions: null },
      items: [{ ...baseItem, version: 1 }],
      constraintsVersion: null,
    }, helpers);

    const result = await applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" });
    expect(result.success).toBe(true);
    // The second op's helper should have been called with expectedItemVersion=2
    // (the version after op 1's update), not 1 (the pre-apply version).
    expect(helpers.changeInternalTripPlanItemStateInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "project-1",
      2, // runningAggregateVersion after op 1
      "leg-1",
      2, // expectedItemVersion = updated version (P1 fix)
      "confirmed",
      null,
    );
  });

  test("(P6) unrecognized ordering-precondition key fails closed with refresh_required", async () => {
    const helpers = makeHelperMocks();
    const { applyApprovedTripChange } = await setupApplyMocks({
      project: baseProject,
      proposal: { id: "prop-1", status: "pending", rationale: "Test", operations: [{ kind: "change-item-state", itemId: "leg-1", state: "confirmed" }], alternatives: [], expiresAt: null, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: { "leg-1": 1 }, orderingPreconditions: { unknownField: "bad" } },
      items: [baseItem],
      constraintsVersion: null,
    }, helpers);

    const result = await applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" });
    expect(result).toEqual({ success: false, reason: "refresh_required" });
  });

  // E7R2-F1: a multi-op sequence with two update-item ops on the same item must
  // propagate plannedAt through the in-memory aggregate. The first op sets a
  // new plannedAt; the second op changes only label (no plannedAt in changes).
  // Before the fix, the second op's in-memory aggregate omitted plannedAt, so
  // mergeChangesToInternalInput fell back to the stale current.plannedAt (null)
  // and the second helper call wrote plannedAt=null back — silently reverting
  // the first op's date change inside one committed transaction. The fix
  // propagates values.plannedAt into the aggregate so the second op sees and
  // preserves the first op's date.
  test("(E7R2-F1) multi-op update-item: second update-item without plannedAt preserves the first op's plannedAt (no silent revert)", async () => {
    const helpers = makeHelperMocks();
    helpers.updateTripPlanItemInTransaction
      .mockResolvedValueOnce({ success: true, aggregateVersion: 2 })
      .mockResolvedValueOnce({ success: true, aggregateVersion: 3 });
    const newPlannedAt = "2026-08-15T08:00:00.000Z";
    const ops = [
      { kind: "update-item", itemId: "leg-1", changes: { plannedAt: newPlannedAt } },
      { kind: "update-item", itemId: "leg-1", changes: { label: "Chạy xe cập nhật" } },
    ];
    const { applyApprovedTripChange } = await setupApplyMocks({
      project: { ...baseProject, aggregateVersion: 1 },
      proposal: { id: "prop-1", status: "pending", rationale: "Test", operations: ops, alternatives: [], expiresAt: null, createdAt: new Date(), expectedAggregateVersion: 1, expectedItemVersions: { "leg-1": 1 }, orderingPreconditions: null },
      items: [{ ...baseItem, version: 1, plannedAt: null }],
      constraintsVersion: null,
    }, helpers);

    const result = await applyApprovedTripChange({ tripProjectId: "project-1", proposalId: "prop-1" });
    expect(result.success).toBe(true);

    // The second update-item helper must have been called with values.plannedAt
    // equal to the first op's new plannedAt (propagated through the in-memory
    // aggregate), NOT reverted to null (the stale pre-apply value).
    expect(helpers.updateTripPlanItemInTransaction).toHaveBeenCalledTimes(2);
    const secondCallArgs = helpers.updateTripPlanItemInTransaction.mock.calls[1];
    const secondValues = secondCallArgs[6]; // values (7th positional arg)
    expect(secondValues.plannedAt).toEqual(new Date(newPlannedAt));
  });
});

describe("Story 8.4 Audit history boundary", () => {
  test("Chat/Trips has no direct trip plan history insert through any receiver", () => {
    const directHistoryInsert = /\.\s*insert\s*\(\s*tripPlanChangeHistory\b/;
    const files = listTypeScriptFiles("src/features/chat-trips");
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(directHistoryInsert);
    }
    expect("transaction.insert(\n  tripPlanChangeHistory,\n)").toMatch(directHistoryInsert);
    expect("getDb().insert(tripPlanChangeHistory)").toMatch(directHistoryInsert);
    expect(readFileSync("src/features/chat-trips/trip-change-proposals.ts", "utf8")).toContain("recordPlanHistory(");
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

// Q1: expire-on-read is a best-effort side effect; a transient DB error during
// expire must NOT fail the user's pending-proposals read. P11 made
// expireTripChangeProposal re-throw transient errors; expireElapsedPendingProposals
// wraps each per-row call in try/catch so the read always succeeds.
describe("Story 7.5 Q1 expire-on-read survives transient DB errors", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("listPendingProposalsForTripProject returns successfully when expireTripChangeProposal throws a transient error", async () => {
    // Mock the db so the expire lookup SELECT returns one elapsed row, the
    // pending read SELECT returns no rows, and the expire transaction throws a
    // simulated transient connection error. The read must not propagate the
    // throw — the per-row catch in expireElapsedPendingProposals swallows it.
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "q1-user", email: "q1-user@example.com" }),
    }));
    vi.doMock("@/db/client", () => ({
      getDb: () => ({
        select: (selection: Record<string, unknown>) => ({
          from: () => ({
            where: () => {
              // The expire lookup selects only { id }; the pending read selects
              // many fields. Return one elapsed row for the lookup, [] for the
              // pending read so the read returns early with [].
              const isExpiryLookup = Object.keys(selection ?? {}).length === 1;
              const rows = isExpiryLookup ? [{ id: "q1-proposal-1" }] : [];
              const promise = Promise.resolve(rows) as Promise<typeof rows> & { orderBy: () => Promise<typeof rows> };
              promise.orderBy = () => promise;
              return promise;
            },
          }),
        }),
        transaction: async () => {
          throw new Error("simulated transient connection error");
        },
      }),
    }));

    const { listPendingProposalsForTripProject } = await import("@/features/chat-trips/trip-change-proposals");
    const result = await listPendingProposalsForTripProject("q1-project");
    // The read succeeds (no throw) and returns an empty pending list.
    expect(result).toEqual([]);
  });

  test("getProposalForOwnerReview returns successfully when expireTripChangeProposal throws a transient error", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "q1-user", email: "q1-user@example.com" }),
    }));
    vi.doMock("@/db/client", () => ({
      getDb: () => ({
        select: (selection: Record<string, unknown>) => ({
          from: () => ({
            where: () => {
              const isExpiryLookup = Object.keys(selection ?? {}).length === 1;
              const rows = isExpiryLookup ? [{ id: "q1-proposal-2" }] : [];
              const promise = Promise.resolve(rows) as Promise<typeof rows> & {
                orderBy: () => Promise<typeof rows>;
                limit: () => Promise<typeof rows>;
                for: () => Promise<typeof rows>;
              };
              promise.orderBy = () => promise;
              promise.limit = () => promise;
              promise.for = () => promise;
              return promise;
            },
          }),
        }),
        transaction: async () => {
          throw new Error("simulated transient connection error");
        },
      }),
    }));

    const { getProposalForOwnerReview } = await import("@/features/chat-trips/trip-change-proposals");
    // The read succeeds (no throw) even though expire threw for the elapsed row.
    const result = await getProposalForOwnerReview("q1-project", "q1-proposal-2");
    expect(result).toBeNull();
  });
});
