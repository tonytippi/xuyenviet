import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

import { applyTripChangeProposal, dismissTripChangeProposal, executeAnnotationProposalAction, expireTripChangeProposal, validatePlanReferencesRules } from "@xuyenviet/database";
import { auditEvents, conversations, messages, tripChangeProposals, tripPlanChangeHistory, tripPlanItems, tripProjectConstraints, tripProjects, users } from "@/db/schema";
import { persistAiTripChangeProposalDraftInTransaction, validateProposalOperations } from "../packages/worker-domain/src/features/chat-trips/trip-change-proposals";

import { resetTestDatabase, testDb } from "./helpers/db";

beforeEach(async () => { await resetTestDatabase(); });

const lockSql = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1 });

afterAll(async () => {
  await lockSql.end();
});

async function owner(id: string) { await testDb.insert(users).values({ id, email: `${id}@example.com` }); }
async function fixture() {
  await owner("owner"); await owner("other");
  await testDb.insert(tripProjects).values({ id: "project", userId: "owner", title: "Huế", aggregateVersion: 1 });
  await testDb.insert(conversations).values({ id: "conversation", userId: "owner", tripProjectId: "project" });
  await testDb.insert(messages).values({ id: "assistant", userId: "owner", conversationId: "conversation", role: "assistant", content: "Áp dụng" });
  await testDb.insert(tripPlanItems).values({ id: "leg", userId: "owner", tripProjectId: "project", kind: "leg", type: "transport", state: "planned", label: "Hà Nội đến Huế", ordinal: 0, version: 1 });
  const [proposal] = await testDb.insert(tripChangeProposals).values({ id: "proposal", userId: "owner", tripProjectId: "project", creatorClass: "ai_orchestration", status: "pending", rationale: "Xác nhận chặng", operations: [{ kind: "change-item-state", itemId: "leg", state: "confirmed" }], expectedAggregateVersion: 1, expectedItemVersions: { leg: 1 }, sourceAssistantMessageId: "assistant" }).returning();
  return proposal;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function holdProjectLock(projectId: string) {
  const connection = await lockSql.reserve();
  await connection.unsafe("begin");
  await connection.unsafe("select id from trip_projects where id = $1 for update", [projectId]);
  return async () => {
    await connection.unsafe("commit");
    await connection.release();
  };
}

describe("package proposal commands", () => {
  test("rejects malformed proposal operations without throwing", () => {
    const knownItems = [
      { id: "leg", kind: "leg" as const, anchorRole: null, type: "transport" as const, state: "backup" as const, label: "Hà Nội đến Huế", notes: null, plannedAt: null, ordinal: 0, parentItemId: null, backupTargetItemId: "activity", transportOriginLabel: null, transportDestinationLabel: null, accommodationPlaceAreaLabel: null },
      { id: "activity", kind: "activity" as const, anchorRole: null, type: "visit" as const, state: "planned" as const, label: "Đại Nội", notes: null, plannedAt: null, ordinal: 1, parentItemId: "leg", backupTargetItemId: null, transportOriginLabel: null, transportDestinationLabel: null, accommodationPlaceAreaLabel: null },
    ];
    const validate = (operations: unknown) => validateProposalOperations(operations, { knownItems, tripProjectId: "project" });

    expect(validate([{ kind: "create-item", ordinal: 0, item: { kind: "invalid", state: "planned", label: "Điểm dừng" } }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "create-item", ordinal: 0, item: { kind: "leg", type: "transport", state: "invalid", label: "Điểm dừng" } }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "update-item", itemId: "leg", changes: { state: "invalid" } }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "update-item", itemId: "leg", changes: { notes: 123 } }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "update-item", itemId: "leg", changes: {} }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "update-item", itemId: "leg", changes: { label: "https://unsafe.example" } }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "update-item", itemId: "leg", changes: { notes: "Dòng một\nDòng hai" } }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "update-item", itemId: "leg", changes: { transportOriginLabel: "https://unsafe.example" } }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "update-item", itemId: "leg", changes: { transportDestinationLabel: "Dòng một\nDòng hai" } }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "update-item", itemId: "activity", changes: { accommodationPlaceAreaLabel: "https://unsafe.example" } }]).rejected).toHaveLength(1);
    expect(() => validate([{ kind: "change-item-state", itemId: "other-project-item", state: "planned" }])).not.toThrow();
    expect(validate([{ kind: "change-item-state", itemId: "other-project-item", state: "planned" }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "change-item-state", itemId: "leg", state: "backup", backupTargetItemId: "leg" }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "change-item-state", itemId: "leg", state: "backup", backupTargetItemId: "activity" }, { kind: "change-item-state", itemId: "activity", state: "backup", backupTargetItemId: "leg" }]).rejected).toHaveLength(1);
    expect(validate([{ kind: "remove-item", itemId: "leg" }]).rejected).toHaveLength(1);
  });

  test("rejects operations and references targeting an item removed earlier while allowing valid removal", () => {
    const knownItems = [
      { id: "leg", kind: "leg" as const, anchorRole: null, type: "transport" as const, state: "planned" as const, label: "Hà Nội đến Huế", notes: null, plannedAt: null, ordinal: 0, parentItemId: null, backupTargetItemId: null, transportOriginLabel: null, transportDestinationLabel: null, accommodationPlaceAreaLabel: null },
      { id: "activity", kind: "activity" as const, anchorRole: null, type: "visit" as const, state: "planned" as const, label: "Đại Nội", notes: null, plannedAt: null, ordinal: 1, parentItemId: "leg", backupTargetItemId: null, transportOriginLabel: null, transportDestinationLabel: null, accommodationPlaceAreaLabel: null },
    ];
    const validate = (operations: unknown) => validateProposalOperations(operations, { knownItems, tripProjectId: "project" });
    const validateWithBackup = (operations: unknown) => validateProposalOperations(operations, {
      knownItems: [{ ...knownItems[0], state: "backup", backupTargetItemId: "activity" }, knownItems[1]],
      tripProjectId: "project",
    });

    expect(validate([{ kind: "remove-item", itemId: "activity" }, { kind: "update-item", itemId: "activity", changes: { label: "Đại Nội mới" } }]).rejected).toEqual([{ index: 1, reason: "item references unknown or cross-project item" }]);
    expect(validate([{ kind: "remove-item", itemId: "activity" }, { kind: "reorder-item", itemId: "activity", ordinal: 0 }]).rejected).toEqual([{ index: 1, reason: "item references unknown or cross-project item" }]);
    expect(validate([{ kind: "remove-item", itemId: "activity" }, { kind: "change-item-state", itemId: "activity", state: "confirmed" }]).rejected).toEqual([{ index: 1, reason: "item references unknown or cross-project item" }]);
    expect(validate([{ kind: "remove-item", itemId: "activity" }, { kind: "change-item-state", itemId: "leg", state: "backup", backupTargetItemId: "activity" }]).rejected).toEqual([{ index: 1, reason: "change-item-state invalid" }]);
    expect(validate([{ kind: "remove-item", itemId: "leg" }, { kind: "reorder-item", itemId: "activity", parentItemId: null, ordinal: 0 }]).rejected).toEqual([{ index: 0, reason: "remove-item references surviving item" }]);
    expect(validateWithBackup([{ kind: "remove-item", itemId: "activity" }, { kind: "change-item-state", itemId: "leg", state: "planned" }]).rejected).toEqual([{ index: 0, reason: "remove-item references surviving item" }]);
    expect(validateWithBackup([{ kind: "change-item-state", itemId: "leg", state: "planned" }, { kind: "remove-item", itemId: "activity" }])).toEqual({ valid: [{ kind: "change-item-state", itemId: "leg", state: "planned", backupTargetItemId: null }, { kind: "remove-item", itemId: "activity" }], rejected: [] });
    expect(validate([{ kind: "change-item-state", itemId: "leg", state: "planned" }, { kind: "remove-item", itemId: "activity" }])).toEqual({ valid: [{ kind: "change-item-state", itemId: "leg", state: "planned", backupTargetItemId: null }, { kind: "remove-item", itemId: "activity" }], rejected: [] });
  });

  test("rejects removing a parent after creating its child", () => {
    const knownItems = [
      { id: "leg", kind: "leg" as const, anchorRole: null, type: "transport" as const, state: "planned" as const, label: "Hà Nội đến Huế", notes: null, plannedAt: null, ordinal: 0, parentItemId: null, backupTargetItemId: null, transportOriginLabel: null, transportDestinationLabel: null, accommodationPlaceAreaLabel: null },
    ];

    expect(validateProposalOperations([
      { kind: "create-item", parentItemId: "leg", ordinal: 0, item: { kind: "activity", type: "visit", state: "planned", label: "Đại Nội" } },
      { kind: "remove-item", itemId: "leg" },
    ], { knownItems, tripProjectId: "project" }).rejected).toEqual([{ index: 1, reason: "remove-item references surviving item" }]);
  });

  test("excludes elapsed pending proposals from owner review without mutation", async () => {
    await fixture();
    await testDb.update(tripChangeProposals).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(tripChangeProposals.id, "proposal"));
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "owner", email: "owner@example.com" }) }));
    const { getProposalForOwnerReview } = await import("@/features/chat-trips/trip-change-proposals");

    await expect(getProposalForOwnerReview("project", "proposal")).resolves.toBeNull();
    await expect(testDb.select({ status: tripChangeProposals.status, terminalTimestamp: tripChangeProposals.terminalTimestamp }).from(tripChangeProposals).where(eq(tripChangeProposals.id, "proposal"))).resolves.toEqual([{ status: "pending", terminalTimestamp: null }]);
  });

  test("rejects unsafe rationale and alternative summaries before proposal persistence", async () => {
    await fixture();
    const input = { tripProjectId: "project", expectedAggregateVersion: 1, operations: [{ kind: "change-item-state", itemId: "leg", state: "confirmed" }], rationale: "Xác nhận chặng" };

    await expect(testDb.transaction((transaction) => persistAiTripChangeProposalDraftInTransaction(transaction, { userId: "owner" }, { ...input, rationale: "https://unsafe.example" }))).resolves.toEqual({ success: false, reason: "invalid" });
    await expect(testDb.transaction((transaction) => persistAiTripChangeProposalDraftInTransaction(transaction, { userId: "owner" }, { ...input, alternatives: [{ summary: "Dòng một\nDòng hai" }] }))).resolves.toEqual({ success: false, reason: "invalid" });
    await expect(testDb.select().from(tripChangeProposals)).resolves.toHaveLength(1);
  });

  test("enforces owner isolation and atomically applies a pending proposal", async () => {
    await fixture();
    await expect(applyTripChangeProposal("other", { tripProjectId: "project", proposalId: "proposal" })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(applyTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" })).resolves.toMatchObject({ success: true, aggregateVersion: 2 });
    await expect(testDb.select({ state: tripPlanItems.state }).from(tripPlanItems).where(eq(tripPlanItems.id, "leg"))).resolves.toEqual([{ state: "confirmed" }]);
    await expect(testDb.select({ operationClass: tripPlanChangeHistory.operationClass }).from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, "proposal"))).resolves.toEqual([{ operationClass: "apply" }]);
  });

  test("keeps dismissal idempotent and expiry system-owned", async () => {
    await fixture();
    await expect(dismissTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" })).resolves.toMatchObject({ success: true, proposal: { status: "dismissed" } });
    await expect(dismissTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" })).resolves.toMatchObject({ success: true, proposal: { status: "dismissed" } });
    await expect(expireTripChangeProposal({ tripProjectId: "project", proposalId: "proposal" })).resolves.toMatchObject({ success: true, proposal: { status: "dismissed" } });
    await expect(testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, "proposal"))).resolves.toHaveLength(1);
  });

  test("rolls back an earlier item mutation when a later proposal operation fails", async () => {
    await fixture();
    await testDb.update(tripChangeProposals).set({
      operations: [
        { kind: "change-item-state", itemId: "leg", state: "confirmed" },
        { kind: "upsert-constraints", constraints: { adultCount: 0 } },
      ],
    }).where(eq(tripChangeProposals.id, "proposal"));

    await expect(applyTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select({ state: tripPlanItems.state, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "leg"))).resolves.toEqual([{ state: "planned", version: 1 }]);
    await expect(testDb.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(eq(tripProjects.id, "project"))).resolves.toEqual([{ aggregateVersion: 1 }]);
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, "proposal"))).resolves.toEqual([{ status: "pending" }]);
    await expect(testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, "proposal"))).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("applies sequential constraint updates with advancing constraint and aggregate versions", async () => {
    await fixture();
    await testDb.update(tripChangeProposals).set({
      operations: [
        { kind: "upsert-constraints", constraints: { adultCount: 2 } },
        { kind: "upsert-constraints", constraints: { adultCount: 3 } },
      ],
    }).where(eq(tripChangeProposals.id, "proposal"));

    const result = await applyTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" });
    expect(result).toMatchObject({ success: true, aggregateVersion: 3 });
    await expect(testDb.select({ adultCount: tripProjectConstraints.adultCount, version: tripProjectConstraints.version }).from(tripProjectConstraints).where(eq(tripProjectConstraints.tripProjectId, "project"))).resolves.toEqual([{ adultCount: 3, version: 2 }]);
  });

  test("does not disclose or mutate another owner's pending proposal", async () => {
    await fixture();

    await expect(applyTripChangeProposal("other", { tripProjectId: "project", proposalId: "proposal" })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(dismissTripChangeProposal("other", { tripProjectId: "project", proposalId: "proposal" })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, "proposal"))).resolves.toEqual([{ status: "pending" }]);
    await expect(testDb.select({ state: tripPlanItems.state, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "leg"))).resolves.toEqual([{ state: "planned", version: 1 }]);
    await expect(testDb.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(eq(tripProjects.id, "project"))).resolves.toEqual([{ aggregateVersion: 1 }]);
    await expect(testDb.select().from(tripPlanChangeHistory)).resolves.toHaveLength(0);
  });

  test("expires a pending proposal without plan mutation and records system history and audit", async () => {
    await fixture();
    const now = new Date("2026-08-03T00:00:00.000Z");
    await testDb.update(tripChangeProposals).set({ expiresAt: new Date("2026-08-02T23:59:59.000Z") }).where(eq(tripChangeProposals.id, "proposal"));

    await expect(expireTripChangeProposal({ tripProjectId: "project", proposalId: "proposal", now })).resolves.toMatchObject({ success: true, proposal: { status: "expired" } });
    await expect(testDb.select({ state: tripPlanItems.state, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "leg"))).resolves.toEqual([{ state: "planned", version: 1 }]);
    await expect(testDb.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(eq(tripProjects.id, "project"))).resolves.toEqual([{ aggregateVersion: 1 }]);
    await expect(testDb.select({ operationClass: tripPlanChangeHistory.operationClass, actorClass: tripPlanChangeHistory.actorClass, actorSystem: tripPlanChangeHistory.actorSystem, actorUserId: tripPlanChangeHistory.actorUserId }).from(tripPlanChangeHistory)).resolves.toEqual([{ operationClass: "expire", actorClass: "system", actorSystem: "system-trip-planning", actorUserId: null }]);
    await expect(testDb.select({ operation: auditEvents.operation, actorClass: auditEvents.actorClass, actorSystem: auditEvents.actorSystem, actorUserId: auditEvents.actorUserId }).from(auditEvents)).resolves.toEqual([{ operation: "expire", actorClass: "system", actorSystem: "system-trip-planning", actorUserId: null }]);
  });

  test("rejects stale aggregate, item, and unknown ordering fences without partial writes", async () => {
    await fixture();
    await testDb.update(tripChangeProposals).set({ expectedAggregateVersion: 2 }).where(eq(tripChangeProposals.id, "proposal"));
    await expect(applyTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" })).resolves.toEqual({ success: false, reason: "refresh_required" });

    await testDb.update(tripChangeProposals).set({ expectedAggregateVersion: 1, expectedItemVersions: { leg: 2 } }).where(eq(tripChangeProposals.id, "proposal"));
    await expect(applyTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" })).resolves.toEqual({ success: false, reason: "refresh_required" });

    await testDb.update(tripChangeProposals).set({ expectedItemVersions: { leg: 1 }, operations: [{ kind: "reorder-item", itemId: "leg", ordinal: 0 }], orderingPreconditions: { unsupported: true } }).where(eq(tripChangeProposals.id, "proposal"));
    await expect(applyTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" })).resolves.toEqual({ success: false, reason: "refresh_required" });
    await expect(testDb.select({ ordinal: tripPlanItems.ordinal, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "leg"))).resolves.toEqual([{ ordinal: 0, version: 1 }]);
    await expect(testDb.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(eq(tripProjects.id, "project"))).resolves.toEqual([{ aggregateVersion: 1 }]);
    await expect(testDb.select().from(tripPlanChangeHistory)).resolves.toHaveLength(0);
  });

  test("serializes concurrent terminal apply commands and writes one terminal history record", async () => {
    await fixture();

    const [first, second] = await Promise.all([
      applyTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" }),
      applyTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" }),
    ]);

    expect([first, second].filter((result) => result.success)).toHaveLength(1);
    expect([first, second].filter((result) => !result.success && result.reason === "not_found")).toHaveLength(1);
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, "proposal"))).resolves.toEqual([{ status: "applied" }]);
    await expect(testDb.select({ state: tripPlanItems.state, version: tripPlanItems.version }).from(tripPlanItems).where(eq(tripPlanItems.id, "leg"))).resolves.toEqual([{ state: "confirmed", version: 2 }]);
    await expect(testDb.select({ operationClass: tripPlanChangeHistory.operationClass }).from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, "proposal"))).resolves.toEqual([{ operationClass: "apply" }]);
  });

  test("serializes concurrent apply and dismiss without a deadlock", async () => {
    await fixture();

    const outcomes = await Promise.allSettled([
      applyTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" }),
      dismissTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" }),
    ]);

    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    await expect(testDb.select({ status: tripChangeProposals.status }).from(tripChangeProposals).where(eq(tripChangeProposals.id, "proposal"))).resolves.toSatisfy((rows) => ["applied", "dismissed"].includes(rows[0]?.status ?? ""));
    await expect(testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, "proposal"))).resolves.toHaveLength(1);
  });

  test("blocks apply while another connection holds the aggregate row lock", async () => {
    await fixture();
    const releaseLock = await holdProjectLock("project");
    const apply = applyTripChangeProposal("owner", { tripProjectId: "project", proposalId: "proposal" });

    try {
      await expect(Promise.race([apply.then(() => "resolved" as const), delay(150).then(() => "blocked" as const)])).resolves.toBe("blocked");
    } finally {
      await releaseLock();
    }

    await expect(apply).resolves.toMatchObject({ success: true, aggregateVersion: 2 });
    await expect(testDb.select({ operationClass: tripPlanChangeHistory.operationClass }).from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, "proposal"))).resolves.toEqual([{ operationClass: "apply" }]);
  });

  test("fails annotation actions closed unless the stored action binding matches", async () => {
    await fixture();
    await testDb.update(messages).set({ answerAnnotations: [{ id: "trip-change-proposal-apply", start: 0, end: 2, text: "Áp", type: "action", detail: { type: "action", label: "Áp", action: { command: "trip_change_proposal.apply", label: "Áp", arguments: {}, anchor: "trip-change-proposal-action.v1" } } }] }).where(eq(messages.id, "assistant"));
    await expect(executeAnnotationProposalAction("owner", { conversationId: "conversation", assistantMessageId: "assistant", annotationId: "trip-change-proposal-dismiss", command: "trip_change_proposal.dismiss" })).resolves.toEqual({ success: false, reason: "not_found" });
  });

  test("shares parent and backup-cycle reference validation", () => {
    expect(validatePlanReferencesRules("project", { kind: "activity", parentItemId: "leg" }, [{ id: "leg", kind: "leg", tripProjectId: "project", backupTargetItemId: null }])).toBeNull();
    expect(validatePlanReferencesRules("project", { kind: "leg", backupTargetItemId: "leg" }, [{ id: "leg", kind: "leg", tripProjectId: "project", backupTargetItemId: null }], "leg")).not.toBeNull();
  });
});
