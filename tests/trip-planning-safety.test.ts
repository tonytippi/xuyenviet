import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  auditEvents,
  conversations,
  tripChangeProposals,
  tripPlanChangeHistory,
  tripPlanItems,
  tripProjects,
  users,
} from "@/db/schema";

import { testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

async function ensureSystemTripPlanningActor() {
  const [existing] = await testDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, "system-trip-planning"))
    .limit(1);
  if (!existing) {
    try {
      await testDb
        .insert(users)
        .values({ id: "system-trip-planning", email: "system-trip-planning@xuyenviet.invalid" });
    } catch (error) {
      console.error(
        "ensureSystemTripPlanningActor insert failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

async function loadModuleAs(userId: string, email: string) {
  vi.resetModules();
  vi.doMock("@/server/auth", () => ({
    getAuthenticatedSession: vi.fn().mockResolvedValue({ userId, email }),
  }));
  return await import("@/features/chat-trips/trip-change-proposals");
}

async function loadProjectsModuleAs(userId: string, email: string) {
  vi.resetModules();
  vi.doMock("@/server/auth", () => ({
    getAuthenticatedSession: vi.fn().mockResolvedValue({ userId, email }),
  }));
  return await import("@/features/chat-trips/trip-projects");
}

// Story 7.6 AC1: Cross-cutting adversarial safety suite. Scenarios that span
// modules/owners: multi-owner existence-leakage, deleted/unlinked primary
// conversation, concurrent terminal actions, project-deletion cascade to
// history, and ordering-precondition fail-closed. DB-backed where locking,
// cascade, or concurrency must be real (mocked DB is insufficient).
describe("Story 7.6 AC1 cross-cutting trip planning safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  // Task 1: Owner-scope and existence-leakage verification.
  describe("Task 1 — cross-owner existence-leakage", () => {
    test("1.1 cross-owner reads return null/empty without leaking whether the other owner's resource exists", async () => {
      await createTestUser("owner-a");
      await createTestUser("owner-b");
      await testDb.insert(tripProjects).values({ id: "safety-p-a", userId: "owner-a", title: "Huế" });
      await testDb.insert(tripProjects).values({ id: "safety-p-b", userId: "owner-b", title: "Đà Lạt" });
      const [convA] = await testDb
        .insert(conversations)
        .values({ id: "safety-conv-a", userId: "owner-a", tripProjectId: "safety-p-a" })
        .returning({ id: conversations.id });
      await testDb
        .update(tripProjects)
        .set({ primaryConversationId: convA.id })
        .where(eq(tripProjects.id, "safety-p-a"));
      await testDb.insert(tripPlanItems).values({
        id: "safety-item-a",
        tripProjectId: "safety-p-a",
        userId: "owner-a",
        kind: "leg",
        type: "transport",
        state: "idea",
        label: "Chạy xe",
        ordinal: 0,
      });

      // Owner B tries to read owner A's project resources — all must return
      // null or empty without leaking that the resource exists.
      const { getOwnedTripProjectSummary } = await loadProjectsModuleAs("owner-b", "owner-b@example.com");
      await expect(getOwnedTripProjectSummary("safety-p-a")).resolves.toBeNull();

      const { listPendingProposalsForTripProject, getProposalForOwnerReview, listPlanHistoryForTripProject } =
        await loadModuleAs("owner-b", "owner-b@example.com");
      await expect(listPendingProposalsForTripProject("safety-p-a")).resolves.toEqual([]);
      await expect(getProposalForOwnerReview("safety-p-a", "nonexistent-proposal")).resolves.toBeNull();
      await expect(listPlanHistoryForTripProject("safety-p-a")).resolves.toBeNull();

      const { resolveOwnedPrimaryConversation } = await loadProjectsModuleAs(
        "owner-b",
        "owner-b@example.com",
      );
      // resolveOwnedPrimaryConversation returns null for a cross-owner project.
      // (It may create a new conversation for owner-b on safety-p-b but never
      // for safety-p-a which owner-b does not own.)
      const result = await resolveOwnedPrimaryConversation("safety-p-a");
      expect(result).toBeNull();
    });

    test("1.2 cross-owner applyApprovedTripChange and dismissTripChangeProposal return not_found, write no history, advance no version", async () => {
      await createTestUser("owner-a");
      await createTestUser("owner-b");
      await testDb.insert(tripProjects).values({
        id: "safety-apply-p",
        userId: "owner-a",
        title: "Hà Giang",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-apply-leg",
        tripProjectId: "safety-apply-p",
        userId: "owner-a",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });

      // Owner A creates a proposal.
      const { persistAiTripChangeProposalDraft } = await loadModuleAs(
        "owner-a",
        "owner-a@example.com",
      );
      const persisted = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-apply-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-apply-leg": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-apply-leg", state: "confirmed" }],
        rationale: "Xác nhận chặng xe",
      });
      if (!persisted.success) throw new Error("persist failed");
      const proposalId = persisted.proposal.id;

      const historyBefore = await testDb.select().from(tripPlanChangeHistory);
      const versionBefore = await testDb
        .select({ v: tripProjects.aggregateVersion })
        .from(tripProjects)
        .where(eq(tripProjects.id, "safety-apply-p"));

      // Owner B tries to apply and dismiss owner A's proposal.
      const { applyApprovedTripChange, dismissTripChangeProposal } = await loadModuleAs(
        "owner-b",
        "owner-b@example.com",
      );
      const applyResult = await applyApprovedTripChange({
        tripProjectId: "safety-apply-p",
        proposalId,
      });
      expect(applyResult).toEqual({ success: false, reason: "not_found" });

      const dismissResult = await dismissTripChangeProposal({
        tripProjectId: "safety-apply-p",
        proposalId,
      });
      expect(dismissResult).toEqual({ success: false, reason: "not_found" });

      // No history row was written, no version advanced.
      const historyAfter = await testDb.select().from(tripPlanChangeHistory);
      expect(historyAfter).toHaveLength(historyBefore.length);
      const versionAfter = await testDb
        .select({ v: tripProjects.aggregateVersion })
        .from(tripProjects)
        .where(eq(tripProjects.id, "safety-apply-p"));
      expect(versionAfter[0].v).toBe(versionBefore[0].v);

      // The proposal is still pending (not mutated by the cross-owner attempt).
      const [proposal] = await testDb
        .select({ status: tripChangeProposals.status })
        .from(tripChangeProposals)
        .where(eq(tripChangeProposals.id, proposalId));
      expect(proposal.status).toBe("pending");
    });

    test("1.3 unauthenticated command paths return unauthenticated and write nothing", async () => {
      await createTestUser("owner-a");
      await testDb.insert(tripProjects).values({
        id: "safety-unauth-p",
        userId: "owner-a",
        title: "Cần Thơ",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-unauth-leg",
        tripProjectId: "safety-unauth-p",
        userId: "owner-a",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });

      vi.resetModules();
      vi.doMock("@/server/auth", () => ({
        getAuthenticatedSession: vi.fn().mockResolvedValue(null),
      }));
      const { applyApprovedTripChange, dismissTripChangeProposal } = await import(
        "@/features/chat-trips/trip-change-proposals"
      );

      const applyResult = await applyApprovedTripChange({
        tripProjectId: "safety-unauth-p",
        proposalId: "any",
      });
      expect(applyResult).toEqual({ success: false, reason: "unauthenticated" });

      const dismissResult = await dismissTripChangeProposal({
        tripProjectId: "safety-unauth-p",
        proposalId: "any",
      });
      expect(dismissResult).toEqual({ success: false, reason: "unauthenticated" });

      // No history row, no audit, no version change.
      await expect(testDb.select().from(tripPlanChangeHistory)).resolves.toHaveLength(0);
      await expect(
        testDb
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.targetType, "trip_change_proposal")),
      ).resolves.toHaveLength(0);
    });
  });

  // Task 2: Deleted/unlinked primary-conversation invariant.
  describe("Task 2 — deleted/unlinked primary conversation invariant", () => {
    test("2.1 resolveOwnedPrimaryConversation never returns a cross-owner conversation — resolver is owner-scoped", async () => {
      await createTestUser("owner-a");
      await createTestUser("owner-b");
      await testDb.insert(tripProjects).values({ id: "safety-conv-p-a", userId: "owner-a", title: "Nha Trang" });
      await testDb.insert(tripProjects).values({ id: "safety-conv-p-b", userId: "owner-b", title: "Vũng Tàu" });
      // Owner A has a conversation linked to their project.
      const [convA] = await testDb
        .insert(conversations)
        .values({ id: "safety-conv-a", userId: "owner-a", tripProjectId: "safety-conv-p-a" })
        .returning({ id: conversations.id });
      await testDb
        .update(tripProjects)
        .set({ primaryConversationId: convA.id })
        .where(eq(tripProjects.id, "safety-conv-p-a"));
      // Owner B has a conversation linked to their project.
      const [convB] = await testDb
        .insert(conversations)
        .values({ id: "safety-conv-b", userId: "owner-b", tripProjectId: "safety-conv-p-b" })
        .returning({ id: conversations.id });

      // Owner A resolves their own project — must get owner A's conversation.
      const { resolveOwnedPrimaryConversation } = await loadProjectsModuleAs(
        "owner-a",
        "owner-a@example.com",
      );
      const resultA = await resolveOwnedPrimaryConversation("safety-conv-p-a");
      expect(resultA).not.toBeNull();
      if (resultA) {
        expect(resultA.id).toBe(convA.id);
        const [resolved] = await testDb
          .select({ userId: conversations.userId })
          .from(conversations)
          .where(eq(conversations.id, resultA.id));
        expect(resolved.userId).toBe("owner-a");
      }

      // Owner A tries to resolve owner B's project — must return null (cross-owner).
      const resultCross = await resolveOwnedPrimaryConversation("safety-conv-p-b");
      expect(resultCross).toBeNull();

      // The DB schema prevents a cross-owner pointer (composite FK), so the
      // invariant is enforced at both the schema and resolver level. Verify
      // the resolver queries with userId predicates by checking it never
      // returns convB for owner A.
      expect(resultA?.id).not.toBe(convB.id);
    });

    test("2.2 after deleting the primary conversation, re-resolving selects a same-owner linked live conversation", async () => {
      await createTestUser("owner-a");
      await testDb.insert(tripProjects).values({ id: "safety-del-p", userId: "owner-a", title: "Hội An" });
      const [primary] = await testDb
        .insert(conversations)
        .values({ id: "safety-del-primary", userId: "owner-a", tripProjectId: "safety-del-p" })
        .returning({ id: conversations.id });
      await testDb
        .update(tripProjects)
        .set({ primaryConversationId: primary.id })
        .where(eq(tripProjects.id, "safety-del-p"));
      // Add a second conversation linked to the same project.
      await testDb
        .insert(conversations)
        .values({ id: "safety-del-secondary", userId: "owner-a", tripProjectId: "safety-del-p" })
        .returning({ id: conversations.id });

      // Delete the primary conversation.
      await testDb.delete(conversations).where(eq(conversations.id, primary.id));

      // Re-resolve — should select the secondary (same-owner, linked, live).
      const { resolveOwnedPrimaryConversation } = await loadProjectsModuleAs(
        "owner-a",
        "owner-a@example.com",
      );
      const result = await resolveOwnedPrimaryConversation("safety-del-p");
      expect(result).not.toBeNull();
      if (result) {
        // Must not be the deleted conversation.
        expect(result.id).not.toBe(primary.id);
        // Must be a live conversation owned by owner-a.
        const [resolved] = await testDb
          .select({ userId: conversations.userId })
          .from(conversations)
          .where(eq(conversations.id, result.id));
        expect(resolved.userId).toBe("owner-a");
      }
      // The project now points at a live conversation (not deleted).
      const [project] = await testDb
        .select({ primaryConversationId: tripProjects.primaryConversationId })
        .from(tripProjects)
        .where(eq(tripProjects.id, "safety-del-p"));
      const [pointedConv] = await testDb
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, project.primaryConversationId ?? ""));
      expect(pointedConv).toBeDefined();
    });
  });

  // Task 5: Proposal expiry, concurrent applies, and project-deletion cascade.
  describe("Task 5 — concurrent terminal actions and deletion cascade", () => {
    test("5.1 expired proposal apply returns expired, writes no history row, mutates no plan state", async () => {
      await createTestUser("safety-exp-user");
      await ensureSystemTripPlanningActor();
      await testDb.insert(tripProjects).values({
        id: "safety-exp-p",
        userId: "safety-exp-user",
        title: "Mũi Né",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-exp-leg",
        tripProjectId: "safety-exp-p",
        userId: "safety-exp-user",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });

      const { persistAiTripChangeProposalDraft } = await loadModuleAs(
        "safety-exp-user",
        "safety-exp-user@example.com",
      );
      const persisted = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-exp-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-exp-leg": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-exp-leg", state: "confirmed" }],
        rationale: "Xác nhận",
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      if (!persisted.success) throw new Error("persist failed");

      const { applyApprovedTripChange } = await loadModuleAs(
        "safety-exp-user",
        "safety-exp-user@example.com",
      );
      const result = await applyApprovedTripChange({
        tripProjectId: "safety-exp-p",
        proposalId: persisted.proposal.id,
      });
      expect(result).toEqual({ success: false, reason: "expired" });

      // No history row written.
      const historyRows = await testDb
        .select()
        .from(tripPlanChangeHistory)
        .where(eq(tripPlanChangeHistory.proposalId, persisted.proposal.id));
      expect(historyRows).toHaveLength(0);

      // Plan state unchanged.
      const [item] = await testDb
        .select({ state: tripPlanItems.state, version: tripPlanItems.version })
        .from(tripPlanItems)
        .where(eq(tripPlanItems.id, "safety-exp-leg"));
      expect(item.state).toBe("planned");
      expect(item.version).toBe(1);
    });

    test("5.2 two concurrent applyApprovedTripChange calls — exactly one wins, the other returns not_found", async () => {
      await createTestUser("safety-conc-user");
      await testDb.insert(tripProjects).values({
        id: "safety-conc-p",
        userId: "safety-conc-user",
        title: "Đà Lạt",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-conc-leg",
        tripProjectId: "safety-conc-p",
        userId: "safety-conc-user",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });

      const { persistAiTripChangeProposalDraft } = await loadModuleAs(
        "safety-conc-user",
        "safety-conc-user@example.com",
      );
      const persisted = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-conc-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-conc-leg": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-conc-leg", state: "confirmed" }],
        rationale: "Xác nhận",
      });
      if (!persisted.success) throw new Error("persist failed");
      const proposalId = persisted.proposal.id;

      // Two concurrent apply calls using the real PostgreSQL test database.
      // FOR UPDATE on the project + proposal rows serializes them: the first
      // to acquire the lock applies; the second sees status != 'pending'.
      const { applyApprovedTripChange } = await loadModuleAs(
        "safety-conc-user",
        "safety-conc-user@example.com",
      );
      const [result1, result2] = await Promise.all([
        applyApprovedTripChange({ tripProjectId: "safety-conc-p", proposalId }),
        applyApprovedTripChange({ tripProjectId: "safety-conc-p", proposalId }),
      ]);

      // Exactly one success, one not_found.
      const successes = [result1, result2].filter((r) => r.success);
      const notFounds = [result1, result2].filter(
        (r) => !r.success && r.reason === "not_found",
      );
      expect(successes).toHaveLength(1);
      expect(notFounds).toHaveLength(1);

      // Exactly one apply history row.
      const historyRows = await testDb
        .select()
        .from(tripPlanChangeHistory)
        .where(eq(tripPlanChangeHistory.proposalId, proposalId));
      expect(historyRows).toHaveLength(1);
      expect(historyRows[0].operationClass).toBe("apply");

      // The proposal is terminal (applied).
      const [proposal] = await testDb
        .select({ status: tripChangeProposals.status })
        .from(tripChangeProposals)
        .where(eq(tripChangeProposals.id, proposalId));
      expect(proposal.status).toBe("applied");
    });

    test("5.3 concurrent apply vs dismiss — exactly one writes a history row, the other is a no-op", async () => {
      await createTestUser("safety-ad-user");
      await testDb.insert(tripProjects).values({
        id: "safety-ad-p",
        userId: "safety-ad-user",
        title: "Phan Thiết",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-ad-leg",
        tripProjectId: "safety-ad-p",
        userId: "safety-ad-user",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });

      const { persistAiTripChangeProposalDraft, applyApprovedTripChange, dismissTripChangeProposal } =
        await loadModuleAs("safety-ad-user", "safety-ad-user@example.com");
      const persisted = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-ad-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-ad-leg": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-ad-leg", state: "confirmed" }],
        rationale: "Xác nhận",
      });
      if (!persisted.success) throw new Error("persist failed");
      const proposalId = persisted.proposal.id;

      const [applyResult, dismissResult] = await Promise.all([
        applyApprovedTripChange({ tripProjectId: "safety-ad-p", proposalId }),
        dismissTripChangeProposal({ tripProjectId: "safety-ad-p", proposalId }),
      ]);

      // FOR UPDATE serializes them. If apply wins, dismiss sees terminal and
      // returns success (idempotent, no second history row). If dismiss wins,
      // apply sees terminal and returns not_found. Either way, exactly one
      // history row is written.
      const historyRows = await testDb
        .select()
        .from(tripPlanChangeHistory)
        .where(eq(tripPlanChangeHistory.proposalId, proposalId));
      expect(historyRows).toHaveLength(1);

      // The proposal is terminal.
      const [proposal] = await testDb
        .select({ status: tripChangeProposals.status })
        .from(tripChangeProposals)
        .where(eq(tripChangeProposals.id, proposalId));
      expect(["applied", "dismissed"]).toContain(proposal.status);

      // If apply won, the history row is "apply"; if dismiss won, it is "dismiss".
      expect(["apply", "dismiss"]).toContain(historyRows[0].operationClass);

      // No partial writes: exactly one terminal action wrote exactly one row.
      // Apply writes only on success; dismiss writes only on first terminal.
      // The no-op side wrote no history row (verified by toHaveLength(1)).
      void applyResult;
      void dismissResult;
    });

    test("5.4 deleting an owned Trip Project cascades to plan items, proposals, AND trip_plan_change_history rows", async () => {
      await createTestUser("safety-casc-user");
      await testDb.insert(tripProjects).values({
        id: "safety-casc-p",
        userId: "safety-casc-user",
        title: "Côn Đảo",
        aggregateVersion: 1,
      });
      const [conv] = await testDb
        .insert(conversations)
        .values({ id: "safety-casc-conv", userId: "safety-casc-user", tripProjectId: "safety-casc-p" })
        .returning({ id: conversations.id });
      await testDb
        .update(tripProjects)
        .set({ primaryConversationId: conv.id })
        .where(eq(tripProjects.id, "safety-casc-p"));
      await testDb.insert(tripPlanItems).values({
        id: "safety-casc-leg",
        tripProjectId: "safety-casc-p",
        userId: "safety-casc-user",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });

      // Create and apply a proposal so there is a history row.
      const { persistAiTripChangeProposalDraft, applyApprovedTripChange } = await loadModuleAs(
        "safety-casc-user",
        "safety-casc-user@example.com",
      );
      const persisted = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-casc-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-casc-leg": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-casc-leg", state: "confirmed" }],
        rationale: "Xác nhận",
      });
      if (!persisted.success) throw new Error("persist failed");
      const applyResult = await applyApprovedTripChange({
        tripProjectId: "safety-casc-p",
        proposalId: persisted.proposal.id,
      });
      expect(applyResult.success).toBe(true);

      // Verify rows exist before deletion.
      await expect(
        testDb
          .select()
          .from(tripPlanItems)
          .where(eq(tripPlanItems.tripProjectId, "safety-casc-p")),
      ).resolves.toHaveLength(1);
      await expect(
        testDb
          .select()
          .from(tripChangeProposals)
          .where(eq(tripChangeProposals.tripProjectId, "safety-casc-p")),
      ).resolves.toHaveLength(1);
      await expect(
        testDb
          .select()
          .from(tripPlanChangeHistory)
          .where(eq(tripPlanChangeHistory.tripProjectId, "safety-casc-p")),
      ).resolves.toHaveLength(1);

      // Delete the project.
      const { deleteOwnedTripProject } = await loadProjectsModuleAs(
        "safety-casc-user",
        "safety-casc-user@example.com",
      );
      await expect(deleteOwnedTripProject("safety-casc-p")).resolves.toEqual({ success: true });

      // All owned structured state is cascade-deleted.
      await expect(
        testDb
          .select()
          .from(tripPlanItems)
          .where(eq(tripPlanItems.tripProjectId, "safety-casc-p")),
      ).resolves.toHaveLength(0);
      await expect(
        testDb
          .select()
          .from(tripChangeProposals)
          .where(eq(tripChangeProposals.tripProjectId, "safety-casc-p")),
      ).resolves.toHaveLength(0);
      await expect(
        testDb
          .select()
          .from(tripPlanChangeHistory)
          .where(eq(tripPlanChangeHistory.tripProjectId, "safety-casc-p")),
      ).resolves.toHaveLength(0);
      // The project itself is gone.
      await expect(
        testDb.select().from(tripProjects).where(eq(tripProjects.id, "safety-casc-p")),
      ).resolves.toHaveLength(0);
      // No deleted plan state is reconstitutable from retained audit metadata.
      // Audit events may remain (minimal non-content metadata) but cannot
      // reconstruct the plan.
      const audits = await testDb
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.targetType, "trip_project"));
      // Audit summaries must not contain plan item content.
      for (const audit of audits) {
        if (audit.beforeSummary) {
          expect(audit.beforeSummary).not.toContain("Chạy xe");
        }
        if (audit.afterSummary) {
          expect(audit.afterSummary).not.toContain("Chạy xe");
        }
      }
    });
  });

  // Task 4.2: Pure-unit + DB-backed test for ordering-precondition fail-closed.
  describe("Task 4.2 — ordering-precondition fail-closed on unrecognized keys", () => {
    test("apply with unrecognized orderingPreconditions returns refresh_required and applies nothing (P6 fail-closed)", async () => {
      await createTestUser("safety-p6-user");
      await testDb.insert(tripProjects).values({
        id: "safety-p6-p",
        userId: "safety-p6-user",
        title: "Cát Bà",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-p6-leg",
        tripProjectId: "safety-p6-p",
        userId: "safety-p6-user",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });

      // Persist a proposal with an unrecognized orderingPrecondition key.
      // The persist path stores orderingPreconditions as opaque JSON. The apply
      // orchestrator's validateOperationFences (P6 fix) checks recognized keys
      // and fails closed on unrecognized ones → refresh_required.
      const { persistAiTripChangeProposalDraft, applyApprovedTripChange } = await loadModuleAs(
        "safety-p6-user",
        "safety-p6-user@example.com",
      );
      const persisted = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-p6-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-p6-leg": 1 },
        operations: [{ kind: "reorder-item", itemId: "safety-p6-leg", ordinal: 1 }],
        rationale: "Sắp xếp lại",
        orderingPreconditions: { unrecognizedKey: "bad" },
      });
      if (!persisted.success) throw new Error("persist failed");

      const result = await applyApprovedTripChange({
        tripProjectId: "safety-p6-p",
        proposalId: persisted.proposal.id,
      });

      // P6: unrecognized ordering precondition key → refresh_required, nothing applied.
      expect(result).toEqual({ success: false, reason: "refresh_required" });

      // No history row, plan state unchanged.
      const historyRows = await testDb
        .select()
        .from(tripPlanChangeHistory)
        .where(eq(tripPlanChangeHistory.proposalId, persisted.proposal.id));
      expect(historyRows).toHaveLength(0);

      const [item] = await testDb
        .select({ ordinal: tripPlanItems.ordinal, version: tripPlanItems.version })
        .from(tripPlanItems)
        .where(eq(tripPlanItems.id, "safety-p6-leg"));
      expect(item.ordinal).toBe(0);
      expect(item.version).toBe(1);

      // The proposal is still pending (not mutated).
      const [proposal] = await testDb
        .select({ status: tripChangeProposals.status })
        .from(tripChangeProposals)
        .where(eq(tripChangeProposals.id, persisted.proposal.id));
      expect(proposal.status).toBe("pending");
    });
  });
});
