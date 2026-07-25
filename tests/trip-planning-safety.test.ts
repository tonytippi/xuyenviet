import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import {
  aiUsageEvents,
  auditEvents,
  conversations,
  schema,
  tripChangeProposals,
  tripPlanChangeHistory,
  tripPlanItems,
  tripProjectConstraints,
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

// F2: a dedicated multi-connection pool scoped to the concurrency tests. The
// default testDb helper uses max:1 (serialized), and the production getDb()
// pool size is an implicit assumption. For apply/apply, apply/dismiss, and
// concurrent reorder we make the multi-connection pool EXPLICIT and prove real
// FOR UPDATE contention with a held lock (see 5.2b). The pool is opened once
// for the file and closed in afterAll so it does not leak across tests.
let concSql: ReturnType<typeof postgres> | null = null;
let concDb: PostgresJsDatabase<typeof schema> | null = null;
// A separate single raw connection used only to hold a FOR UPDATE lock for the
// contention-proof tests (independent of concDb so the lock and the contending
// transaction run on different connections).
let lockSql: ReturnType<typeof postgres> | null = null;
// A second independent raw connection for the deterministic deadlock test
// (5.3d), which must hold TWO first-lock rows (project + proposal) at once on
// separate connections so both contending transactions can block on their
// respective first locks simultaneously.
let lockSql2: ReturnType<typeof postgres> | null = null;

beforeAll(async () => {
  // setup.ts already routes process.env.DATABASE_URL at the test database, so
  // re-running getTestDatabaseUrl() here would collide on the "must differ"
  // safety check. Read DATABASE_URL_TEST directly (populated from .env by the
  // setup phase) — it points at the same local test database testDb uses.
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is required for concurrency tests");
  concSql = postgres(url, { max: 4 });
  concDb = drizzle(concSql, { schema });
  lockSql = postgres(url, { max: 1 });
  lockSql2 = postgres(url, { max: 1 });
});

afterAll(async () => {
  if (concSql) await concSql.end();
  if (lockSql) await lockSql.end();
  if (lockSql2) await lockSql2.end();
});

function getConcurrencyDb(): PostgresJsDatabase<typeof schema> {
  if (!concDb) throw new Error("concurrency pool not initialized");
  return concDb;
}

// Load a module with both the auth session AND @/db/client getDb mocked so the
// apply/dismiss/reorder functions run on the explicit multi-connection pool.
async function loadModuleAsMultiConn(userId: string, email: string) {
  vi.resetModules();
  const db = getConcurrencyDb();
  vi.doMock("@/server/auth", () => ({
    getAuthenticatedSession: vi.fn().mockResolvedValue({ userId, email }),
  }));
  vi.doMock("@/db/client", () => ({ getDb: () => db }));
  return await import("@/features/chat-trips/trip-change-proposals");
}

async function loadProjectsModuleAsMultiConn(userId: string, email: string) {
  vi.resetModules();
  const db = getConcurrencyDb();
  vi.doMock("@/server/auth", () => ({
    getAuthenticatedSession: vi.fn().mockResolvedValue({ userId, email }),
  }));
  vi.doMock("@/db/client", () => ({ getDb: () => db }));
  return await import("@/features/chat-trips/trip-projects");
}

// The expiry worker is sessionless and calls getDb() when no explicit db is
// passed. Mock @/db/client so the worker runs on the multi-connection pool too
// (avoids the duplicate-drizzle-instance type clash from passing a typed db arg).
async function loadExpiryWorkerModuleMultiConn() {
  vi.resetModules();
  const db = getConcurrencyDb();
  vi.doMock("@/db/client", () => ({ getDb: () => db }));
  return await import("@/features/chat-trips/trip-proposal-expiry-worker");
}

// F2/F6 contention proof helper: hold a FOR UPDATE lock on a trip_project row
// from an independent raw connection. Returns a release function that commits
// and frees the connection. While the lock is held, any apply/reorder that
// locks the same project row must block until release() is called.
async function holdProjectLock(projectId: string): Promise<() => Promise<void>> {
  if (!lockSql) throw new Error("lock connection not initialized");
  const conn = await lockSql.reserve();
  await conn.unsafe("begin");
  await conn.unsafe(`select id from trip_projects where id = $1 for update`, [projectId]);
  return async () => {
    await conn.unsafe("commit");
    await conn.release();
  };
}

// 5.3d: hold a FOR UPDATE lock on a trip_change_proposals row from a second
// independent raw connection. Used together with holdProjectLock to force the
// apply/dismiss lock-order inversion into a deterministic deadlock.
async function holdProposalLock(proposalId: string): Promise<() => Promise<void>> {
  if (!lockSql2) throw new Error("proposal lock connection not initialized");
  const conn = await lockSql2.reserve();
  await conn.unsafe("begin");
  await conn.unsafe(`select id from trip_change_proposals where id = $1 for update`, [proposalId]);
  return async () => {
    await conn.unsafe("commit");
    await conn.release();
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

      // Owner A creates a pending proposal so its real id can be used for the
      // cross-owner getProposalForOwnerReview probe below (F15).
      const { persistAiTripChangeProposalDraft: persistAsA } = await loadModuleAs(
        "owner-a",
        "owner-a@example.com",
      );
      const persistedA = await persistAsA({
        tripProjectId: "safety-p-a",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-item-a": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-item-a", state: "confirmed" }],
        rationale: "Xác nhận chặng",
      });
      if (!persistedA.success) throw new Error("persist failed");
      const ownerAProposalId = persistedA.proposal.id;

      // Owner B tries to read owner A's project resources — all must return
      // null or empty without leaking that the resource exists.
      const { getOwnedTripProjectSummary } = await loadProjectsModuleAs("owner-b", "owner-b@example.com");
      await expect(getOwnedTripProjectSummary("safety-p-a")).resolves.toBeNull();

      const { listPendingProposalsForTripProject, getProposalForOwnerReview, listPlanHistoryForTripProject } =
        await loadModuleAs("owner-b", "owner-b@example.com");
      await expect(listPendingProposalsForTripProject("safety-p-a")).resolves.toEqual([]);
      // F15: probe with owner A's REAL live proposal id. A nonexistent id would
      // hit not_found for any caller; only a real id proves cross-owner non-
      // leakage of a live proposal. The owner-scoped predicate (userId = owner-b)
      // must exclude owner A's proposal → null, without leaking its existence.
      await expect(getProposalForOwnerReview("safety-p-a", ownerAProposalId)).resolves.toBeNull();
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

      const historyBefore = await testDb
        .select()
        .from(tripPlanChangeHistory)
        .where(eq(tripPlanChangeHistory.tripProjectId, "safety-apply-p"));
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

      // No history row was written for the cross-owner project, no version
      // advanced. F11: scope the count to safety-apply-p (consistent with the
      // scoped version check below) so a history row written for a different
      // project cannot hide a leak by count coincidence.
      const historyAfter = await testDb
        .select()
        .from(tripPlanChangeHistory)
        .where(eq(tripPlanChangeHistory.tripProjectId, "safety-apply-p"));
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
      await expect(
        testDb
          .select()
          .from(tripPlanChangeHistory)
          .where(eq(tripPlanChangeHistory.tripProjectId, "safety-unauth-p")),
      ).resolves.toHaveLength(0);
      await expect(
        testDb
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.targetType, "trip_change_proposal")),
      ).resolves.toHaveLength(0);
      // F8: AC 1.3 requires "no provider call, no usage event, no persistence."
      // Assert zero aiUsageEvents rows on the unauthenticated path so a future
      // regression that records a usage event before the auth gate is caught.
      await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(0);
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

    test("2.1b the schema prevents an unlinked primary conversation (AD-30 unlinked invariant is DB-enforced)", async () => {
      // F9: AC 2.1 requires the resolver to never return a "deleted or unlinked"
      // conversation. The deleted case is covered in 2.2. For the unlinked case,
      // the composite FK trip_projects_primary_conversation_owner_fk
      // (primary_conversation_id, id, user_id) -> conversations(id, trip_project_id,
      // user_id) (migration 0062) guarantees a referenced primary conversation
      // stays linked to the project: nulling its trip_project_id while the
      // project points at it violates the FK. Assert the schema rejects both
      // unlinking a referenced primary and pointing a project at a conversation
      // linked to a different project. The resolver's tripProjectId-scoped
      // primary lookup is a defensive double-check on top of this invariant.
      await createTestUser("owner-a");
      await testDb.insert(tripProjects).values({ id: "safety-unlink-p", userId: "owner-a", title: "Quảng Bình" });
      const [primary] = await testDb
        .insert(conversations)
        .values({ id: "safety-unlink-primary", userId: "owner-a", tripProjectId: "safety-unlink-p" })
        .returning({ id: conversations.id });
      await testDb
        .update(tripProjects)
        .set({ primaryConversationId: primary.id })
        .where(eq(tripProjects.id, "safety-unlink-p"));

      // Unlinking the referenced primary (null its tripProjectId) violates the
      // composite FK — the unlinked invariant is enforced at the DB level.
      try {
        await testDb
          .update(conversations)
          .set({ tripProjectId: null })
          .where(eq(conversations.id, primary.id));
        throw new Error("expected unlinking a referenced primary conversation to be rejected");
      } catch (error) {
        const cause = (error as { cause?: { code?: string; constraint_name?: string } }).cause;
        expect(cause?.code).toBe("23503");
        expect(cause?.constraint_name).toBe("trip_projects_primary_conversation_owner_fk");
      }

      // Pointing the project at a conversation linked to a DIFFERENT project is
      // also rejected by the same composite FK.
      await testDb.insert(tripProjects).values({ id: "safety-unlink-p2", userId: "owner-a", title: "Quảng Trị" });
      const [otherConv] = await testDb
        .insert(conversations)
        .values({ id: "safety-unlink-other", userId: "owner-a", tripProjectId: "safety-unlink-p2" })
        .returning({ id: conversations.id });
      try {
        await testDb
          .update(tripProjects)
          .set({ primaryConversationId: otherConv.id })
          .where(eq(tripProjects.id, "safety-unlink-p"));
        throw new Error("expected pointing a project at a cross-project conversation to be rejected");
      } catch (error) {
        const cause = (error as { cause?: { code?: string; constraint_name?: string } }).cause;
        expect(cause?.code).toBe("23503");
        expect(cause?.constraint_name).toBe("trip_projects_primary_conversation_owner_fk");
      }

      // The project still points at the original linked primary (unchanged).
      const [project] = await testDb
        .select({ primaryConversationId: tripProjects.primaryConversationId })
        .from(tripProjects)
        .where(eq(tripProjects.id, "safety-unlink-p"));
      expect(project.primaryConversationId).toBe(primary.id);
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
        // F16: the resolver must SELECT the existing linked secondary, not
        // create a brand-new conversation. Assert the specific id so a create-
        // instead-of-select regression cannot pass (AD-30 select-vs-create).
        expect(result.id).toBe("safety-del-secondary");
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

      const { persistAiTripChangeProposalDraft } = await loadModuleAsMultiConn(
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

      // F2: two concurrent apply calls run on the explicit multi-connection pool
      // (max:4) so they can truly race. FOR UPDATE on the project + proposal
      // rows serializes them: the first to acquire the lock applies; the second
      // sees status != 'pending'. Real contention is proven separately in 5.2b.
      const { applyApprovedTripChange } = await loadModuleAsMultiConn(
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

    test("5.2b a held FOR UPDATE lock blocks applyApprovedTripChange until released — real contention, not serialized", async () => {
      // F2: prove FOR UPDATE is truly contended. Hold the project row lock from
      // an independent raw connection; an apply call must NOT resolve while the
      // lock is held, then resolve once the lock is released. With a single-
      // connection (max:1) pool the apply could not run concurrently and this
      // assertion would fail because the apply would never get scheduled behind
      // the lock-holder on the same connection.
      await createTestUser("safety-lock-user");
      await testDb.insert(tripProjects).values({
        id: "safety-lock-p",
        userId: "safety-lock-user",
        title: "Hà Giang",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-lock-leg",
        tripProjectId: "safety-lock-p",
        userId: "safety-lock-user",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });

      const { persistAiTripChangeProposalDraft, applyApprovedTripChange } = await loadModuleAsMultiConn(
        "safety-lock-user",
        "safety-lock-user@example.com",
      );
      const persisted = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-lock-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-lock-leg": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-lock-leg", state: "confirmed" }],
        rationale: "Xác nhận",
      });
      if (!persisted.success) throw new Error("persist failed");
      const proposalId = persisted.proposal.id;

      // Hold the project row lock from an independent connection.
      const releaseLock = await holdProjectLock("safety-lock-p");

      // Issue apply on the multi-connection pool; it must block on FOR UPDATE.
      // Start the contending promise before the try so it stays in scope after
      // the finally releases the lock. The lock MUST release in finally so a
      // failed assertion (e.g. apply resolving within 250ms on a fast machine)
      // cannot leave an uncommitted FOR UPDATE holding the row — which would
      // block the next test's resetTestDatabase() TRUNCATE forever.
      const applyPromise = applyApprovedTripChange({ tripProjectId: "safety-lock-p", proposalId });
      try {
        const outcome = await Promise.race([
          applyPromise.then(() => "resolved" as const),
          delay(250).then(() => "blocked" as const),
        ]);
        // While the lock is held, apply must NOT resolve (it is contending).
        expect(outcome).toBe("blocked");
      } finally {
        await releaseLock();
      }

      // The lock is released; the blocked apply now proceeds and resolves.
      const result = await applyPromise;
      expect(result.success).toBe(true);

      // Exactly one apply history row was written.
      const historyRows = await testDb
        .select()
        .from(tripPlanChangeHistory)
        .where(eq(tripPlanChangeHistory.proposalId, proposalId));
      expect(historyRows).toHaveLength(1);
      expect(historyRows[0].operationClass).toBe("apply");
    });

    test("5.3 concurrent apply vs dismiss — safe idempotent end state under real FOR UPDATE contention", async () => {
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
        await loadModuleAsMultiConn("safety-ad-user", "safety-ad-user@example.com");
      const persisted = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-ad-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-ad-leg": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-ad-leg", state: "confirmed" }],
        rationale: "Xác nhận",
      });
      if (!persisted.success) throw new Error("persist failed");
      const proposalId = persisted.proposal.id;

      // Run apply and dismiss concurrently on the multi-connection pool. Real
      // FOR UPDATE contention has two safe outcomes: (a) clean serialization —
      // one wins, the other returns the documented no-op (idempotent success or
      // not_found); (b) a lock-order inversion (apply: project→proposal; dismiss
      // takes the proposal then a KEY SHARE on the project via the history FK
      // insert) can deadlock, which Postgres detects and aborts safely — the
      // victim throws a retryable concurrency error (40P01/40001), the winner
      // completes. Both outcomes leave exactly one history row and a terminal
      // proposal (no partial writes). The deterministic return-value contract is
      // asserted separately in 5.3c (sequential).
      const outcomes = await Promise.allSettled([
        applyApprovedTripChange({ tripProjectId: "safety-ad-p", proposalId }),
        dismissTripChangeProposal({ tripProjectId: "safety-ad-p", proposalId }),
      ]);

      // Safety invariants hold regardless of which contention outcome occurred.
      const historyRows = await testDb
        .select()
        .from(tripPlanChangeHistory)
        .where(eq(tripPlanChangeHistory.proposalId, proposalId));
      expect(historyRows).toHaveLength(1);
      expect(["apply", "dismiss"]).toContain(historyRows[0].operationClass);

      const [proposal] = await testDb
        .select({ status: tripChangeProposals.status })
        .from(tripChangeProposals)
        .where(eq(tripChangeProposals.id, proposalId));
      expect(["applied", "dismissed"]).toContain(proposal.status);

      // Exactly one call succeeded (the winner); the other is either a clean
      // no-op (fulfilled) or the deadlock victim (rejected with a retryable
      // Postgres concurrency error — never a silent success or partial write).
      const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      if (outcomes.every((o) => o.status === "fulfilled")) {
        // Clean serialization: verify F12 losing-side return values by winner.
        const applyResult = (outcomes[0] as { status: string; value: { success: boolean; reason?: string } }).value;
        const dismissResult = (outcomes[1] as { status: string; value: { success: boolean; reason?: string } }).value;
        if (historyRows[0].operationClass === "apply") {
          expect(applyResult.success).toBe(true);
          expect(dismissResult.success).toBe(true); // idempotent no-op
        } else {
          expect(dismissResult.success).toBe(true);
          expect(applyResult).toEqual({ success: false, reason: "not_found" });
        }
      } else {
        // Deadlock outcome: the rejected call is a retryable Postgres concurrency
        // error; the fulfilled call won. The aborted transaction wrote nothing.
        const rejected = outcomes.find((o) => o.status === "rejected") as {
          status: string;
          reason: { cause?: { code?: string } };
        };
        const cause = rejected.reason?.cause;
        expect(["40P01", "40001"]).toContain(cause?.code);
        const winnerValue = (fulfilled[0] as { status: string; value: { success: boolean } }).value;
        expect(winnerValue.success).toBe(true);
      }
    });

    test("5.3d forced lock-order inversion between apply and dismiss deadlocks safely (deterministic)", async () => {
      // The non-deterministic 5.3 test above may serialize cleanly on fast CI
      // and never exercise the deadlock branch, leaving the SQLSTATE 40P01
      // check + winner verification as dead code. This test FORCES the
      // lock-order inversion: apply locks project(FOR UPDATE)→proposal
      // (FOR UPDATE); dismiss locks proposal(FOR UPDATE)→project(KEY SHARE via
      // the trip_plan_change_history FK insert). Hold both first-lock rows from
      // independent connections, start both transactions (each blocks on its
      // first lock), release the proposal lock so dismiss proceeds to wait on
      // the project KEY SHARE while still holding the proposal, then release
      // the project lock so apply proceeds to wait on the proposal — a closed
      // wait-for cycle Postgres detects and aborts (SQLSTATE 40P01).
      await createTestUser("safety-dl-user");
      await testDb.insert(tripProjects).values({
        id: "safety-dl-p",
        userId: "safety-dl-user",
        title: "Phú Quốc",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-dl-leg",
        tripProjectId: "safety-dl-p",
        userId: "safety-dl-user",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });

      const { persistAiTripChangeProposalDraft, applyApprovedTripChange, dismissTripChangeProposal } =
        await loadModuleAsMultiConn("safety-dl-user", "safety-dl-user@example.com");
      const persisted = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-dl-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-dl-leg": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-dl-leg", state: "confirmed" }],
        rationale: "Xác nhận",
      });
      if (!persisted.success) throw new Error("persist failed");
      const proposalId = persisted.proposal.id;

      // Hold apply's first lock (project) and dismiss's first lock (proposal)
      // on two independent raw connections.
      const releaseProjectLock = await holdProjectLock("safety-dl-p");
      const releaseProposalLock = await holdProposalLock(proposalId);
      // Idempotent release guards so the finally cannot double-commit (which
      // would error on an already-released connection) and cannot leak a lock
      // if an assertion throws before both locks were released.
      let projectReleased = false;
      let proposalReleased = false;
      const safeReleaseProject = async () => {
        if (!projectReleased) {
          projectReleased = true;
          await releaseProjectLock();
        }
      };
      const safeReleaseProposal = async () => {
        if (!proposalReleased) {
          proposalReleased = true;
          await releaseProposalLock();
        }
      };
      try {
        // Start both transactions; each blocks on its first lock.
        const applyPromise = applyApprovedTripChange({ tripProjectId: "safety-dl-p", proposalId });
        const dismissPromise = dismissTripChangeProposal({ tripProjectId: "safety-dl-p", proposalId });
        await delay(100);

        // Release the proposal lock: dismiss acquires it and proceeds to insert
        // the history row, which takes a KEY SHARE on the project — still
        // blocked by our held project lock. dismiss now holds the proposal and
        // waits on the project.
        await safeReleaseProposal();
        await delay(150);

        // Release the project lock: apply acquires it (first waiter) and
        // proceeds to lock the proposal FOR UPDATE — blocked by dismiss. apply
        // holds the project and waits on the proposal. Closed cycle → Postgres
        // detects the deadlock and aborts one transaction.
        await safeReleaseProject();

        const outcomes = await Promise.allSettled([applyPromise, dismissPromise]);

        // Exactly one transaction is the deadlock victim (rejected); the other
        // wins (fulfilled). Both cannot succeed (that would mean no cycle).
        const rejected = outcomes.filter((o) => o.status === "rejected");
        const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
        expect(rejected).toHaveLength(1);
        expect(fulfilled).toHaveLength(1);
        const victim = rejected[0] as { status: string; reason: { cause?: { code?: string } } };
        expect(["40P01", "40001"]).toContain(victim.reason?.cause?.code);
        const winner = (fulfilled[0] as { status: string; value: { success: boolean } }).value;
        expect(winner.success).toBe(true);

        // Safety invariants: exactly one history row and a terminal proposal,
        // no partial writes (the aborted transaction wrote nothing).
        const historyRows = await testDb
          .select()
          .from(tripPlanChangeHistory)
          .where(eq(tripPlanChangeHistory.proposalId, proposalId));
        expect(historyRows).toHaveLength(1);
        expect(["apply", "dismiss"]).toContain(historyRows[0].operationClass);
        const [proposal] = await testDb
          .select({ status: tripChangeProposals.status })
          .from(tripChangeProposals)
          .where(eq(tripChangeProposals.id, proposalId));
        expect(["applied", "dismissed"]).toContain(proposal.status);
      } finally {
        await safeReleaseProposal();
        await safeReleaseProject();
      }
    });

    test("5.3c sequential apply-then-dismiss and dismiss-then-apply verify the no-op return-value contract (F12)", async () => {
      // Deterministic, no contention: prove the idempotent no-op return values
      // the concurrent 5.3 relies on. apply-then-dismiss → dismiss returns
      // idempotent success; dismiss-then-apply → apply returns not_found.
      await createTestUser("safety-seq-user");
      await testDb.insert(tripProjects).values({
        id: "safety-seq-p",
        userId: "safety-seq-user",
        title: "Vũng Tàu",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-seq-leg",
        tripProjectId: "safety-seq-p",
        userId: "safety-seq-user",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });
      const { persistAiTripChangeProposalDraft, applyApprovedTripChange, dismissTripChangeProposal } =
        await loadModuleAs("safety-seq-user", "safety-seq-user@example.com");

      // Case 1: apply wins first, then dismiss sees a terminal proposal.
      const persisted1 = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-seq-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-seq-leg": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-seq-leg", state: "confirmed" }],
        rationale: "Xác nhận 1",
      });
      if (!persisted1.success) throw new Error("persist failed");
      const applyResult1 = await applyApprovedTripChange({ tripProjectId: "safety-seq-p", proposalId: persisted1.proposal.id });
      expect(applyResult1.success).toBe(true);
      const dismissResult1 = await dismissTripChangeProposal({ tripProjectId: "safety-seq-p", proposalId: persisted1.proposal.id });
      // F12: the losing dismiss side returns idempotent success (no second history row).
      expect(dismissResult1.success).toBe(true);
      const history1 = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, persisted1.proposal.id));
      expect(history1).toHaveLength(1);
      expect(history1[0].operationClass).toBe("apply");

      // Case 2: dismiss wins first, then apply sees a terminal proposal.
      // After case 1's apply, the aggregate is 2 and the item version is 2.
      const persisted2 = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-seq-p",
        expectedAggregateVersion: 2,
        expectedItemVersions: { "safety-seq-leg": 2 },
        operations: [{ kind: "change-item-state", itemId: "safety-seq-leg", state: "confirmed" }],
        rationale: "Xác nhận 2",
      });
      if (!persisted2.success) throw new Error("persist failed");
      const dismissResult2 = await dismissTripChangeProposal({ tripProjectId: "safety-seq-p", proposalId: persisted2.proposal.id });
      expect(dismissResult2.success).toBe(true);
      const applyResult2 = await applyApprovedTripChange({ tripProjectId: "safety-seq-p", proposalId: persisted2.proposal.id });
      // F12: the losing apply side returns not_found (no second history row).
      expect(applyResult2).toEqual({ success: false, reason: "not_found" });
      const history2 = await testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, persisted2.proposal.id));
      expect(history2).toHaveLength(1);
      expect(history2[0].operationClass).toBe("dismiss");
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
      // F14: AC 5.4 says the cascade reaches constraints too. Seed a constraints
      // row so its cascade deletion can be asserted alongside items/proposals/history.
      await testDb.insert(tripProjectConstraints).values({
        tripProjectId: "safety-casc-p",
        userId: "safety-casc-user",
        adultCount: 2,
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

      // Verify rows exist before deletion (including the constraints row).
      await expect(
        testDb
          .select()
          .from(tripPlanItems)
          .where(eq(tripPlanItems.tripProjectId, "safety-casc-p")),
      ).resolves.toHaveLength(1);
      await expect(
        testDb
          .select()
          .from(tripProjectConstraints)
          .where(eq(tripProjectConstraints.tripProjectId, "safety-casc-p")),
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
      // F14: constraints cascade via the composite owner FK (ON DELETE CASCADE).
      await expect(
        testDb
          .select()
          .from(tripProjectConstraints)
          .where(eq(tripProjectConstraints.tripProjectId, "safety-casc-p")),
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
      // Audit events survive the cascade (audit rows are NOT cascade-deleted)
      // for EVERY target type touched during the test: trip_project,
      // trip_plan_item, trip_project_constraints, and trip_change_proposal.
      // The prior check inspected only trip_project audits; a regression that
      // added item labels to the item/proposal/constraints summaries would
      // reconstitute deleted plan content from retained audit metadata and
      // still pass. Assert across ALL retained target types.
      const allAudits = await testDb.select().from(auditEvents);
      expect(allAudits.length).toBeGreaterThan(0);
      // Non-vacuous: the cascade-deleted target types have surviving audit
      // rows (so the content check below actually inspects them).
      // trip_change_proposal audits are created by persist + apply;
      // trip_plan_item audits are created by the apply op's
      // changeInternalTripPlanItemStateInTransaction. (trip_project_constraints
      // audits would only exist if constraints were upserted via the command —
      // this test seeds them directly to verify cascade deletion, so no
      // constraints audit is created; the universal content check below still
      // covers it if a future change adds one.)
      const auditTargetTypes = new Set(allAudits.map((a) => a.targetType));
      expect(auditTargetTypes).toContain("trip_plan_item");
      expect(auditTargetTypes).toContain("trip_change_proposal");
      // Every retained audit summary must be minimal non-content metadata —
      // it must not contain the deleted plan item label (or any plan content).
      for (const audit of allAudits) {
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

  // F13: AC 5.3 names "worker vs. read expire." Worker/worker FOR UPDATE SKIP
  // LOCKED is covered by the 7.5 suite (tests/trip-proposal-expiry-worker.test.ts);
  // this exercises the worker-vs-read pair (a worker expiring while a read does
  // expire-on-read). Both are idempotent: first-to-lock wins, the other is a
  // no-op, exactly one expire history row.
  describe("Task 5.3b — worker vs. read expire idempotency", () => {
    test("a worker expiring while a read does expire-on-read produces exactly one expire history row", async () => {
      await createTestUser("safety-wr-user");
      await ensureSystemTripPlanningActor();
      await testDb.insert(tripProjects).values({
        id: "safety-wr-p",
        userId: "safety-wr-user",
        title: "Phú Quốc",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-wr-leg",
        tripProjectId: "safety-wr-p",
        userId: "safety-wr-user",
        kind: "leg",
        type: "transport",
        state: "planned",
        label: "Chạy xe",
        ordinal: 0,
        version: 1,
      });
      // Seed an elapsed pending proposal (expires in the past).
      const { persistAiTripChangeProposalDraft } = await loadModuleAsMultiConn(
        "safety-wr-user",
        "safety-wr-user@example.com",
      );
      const persisted = await persistAiTripChangeProposalDraft({
        tripProjectId: "safety-wr-p",
        expectedAggregateVersion: 1,
        expectedItemVersions: { "safety-wr-leg": 1 },
        operations: [{ kind: "change-item-state", itemId: "safety-wr-leg", state: "confirmed" }],
        rationale: "Hết hạn",
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      if (!persisted.success) throw new Error("persist failed");
      const proposalId = persisted.proposal.id;

      // Run the worker and the read concurrently. Both run on the explicit
      // multi-connection pool via the mocked getDb (the worker calls getDb()
      // when no explicit db is supplied; the read uses loadModuleAsMultiConn).
      // FOR UPDATE on the proposal row serializes them: one expires, the other
      // sees terminal.
      const { processNextExpiredTripChangeProposal } = await loadExpiryWorkerModuleMultiConn();
      const { listPendingProposalsForTripProject } = await loadModuleAsMultiConn(
        "safety-wr-user",
        "safety-wr-user@example.com",
      );
      const now = new Date("2026-07-25T00:00:00.000Z");
      const [, pendingList] = await Promise.all([
        processNextExpiredTripChangeProposal({ now }),
        listPendingProposalsForTripProject("safety-wr-p"),
      ]);

      // The read's expire-on-read dropped the elapsed proposal → empty list.
      expect(pendingList).toEqual([]);

      // The proposal is terminal (expired), not pending.
      const [proposal] = await testDb
        .select({ status: tripChangeProposals.status })
        .from(tripChangeProposals)
        .where(eq(tripChangeProposals.id, proposalId));
      expect(proposal.status).toBe("expired");

      // Exactly one expire history row — the loser (worker or read) was an
      // idempotent no-op and wrote no second row.
      const expireHistory = await testDb
        .select()
        .from(tripPlanChangeHistory)
        .where(eq(tripPlanChangeHistory.proposalId, proposalId));
      expect(expireHistory).toHaveLength(1);
      expect(expireHistory[0].operationClass).toBe("expire");
      expect(expireHistory[0].actorClass).toBe("system");
    });
  });

  // F6: AC 4.1 says "renumber is atomic and a concurrent reorder conflict
  // applies nothing." Only single-threaded create/remove uniqueness was tested
  // before. These exercises real concurrent-reorder contention on the
  // multi-connection pool (one wins, the other refresh_required, no partial
  // renumber) and proves FOR UPDATE contention with a held lock.
  describe("Task 4.1b — concurrent reorder conflict and renumber atomicity", () => {
    test("two concurrent reorders — exactly one wins, the other returns refresh_required, ordinals stay unique", async () => {
      await createTestUser("safety-reord-user");
      await testDb.insert(tripProjects).values({
        id: "safety-reord-p",
        userId: "safety-reord-user",
        title: "Đà Lạt",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-reord-a",
        tripProjectId: "safety-reord-p",
        userId: "safety-reord-user",
        kind: "leg",
        type: "transport",
        state: "idea",
        label: "A",
        ordinal: 0,
        version: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-reord-b",
        tripProjectId: "safety-reord-p",
        userId: "safety-reord-user",
        kind: "leg",
        type: "visit",
        state: "idea",
        label: "B",
        ordinal: 1,
        version: 1,
      });

      const { reorderInternalTripPlanItem } = await loadProjectsModuleAsMultiConn(
        "safety-reord-user",
        "safety-reord-user@example.com",
      );
      // Both reorders expect aggregate version 1. The first to lock the
      // aggregate wins and advances it; the other sees a stale aggregate and
      // returns refresh_required without writing any ordinal.
      const expectedChanged = { "safety-reord-a": 1, "safety-reord-b": 1 };
      const [r1, r2] = await Promise.all([
        reorderInternalTripPlanItem("safety-reord-p", 1, { itemId: "safety-reord-a", expectedItemVersion: 1, ordinal: 1, expectedChangedItemVersions: expectedChanged }),
        reorderInternalTripPlanItem("safety-reord-p", 1, { itemId: "safety-reord-b", expectedItemVersion: 1, ordinal: 1, expectedChangedItemVersions: expectedChanged }),
      ]);

      const successes = [r1, r2].filter((r) => r.success);
      const refreshRequired = [r1, r2].filter((r) => !r.success && r.reason === "refresh_required");
      expect(successes).toHaveLength(1);
      expect(refreshRequired).toHaveLength(1);

      // Rnumber is atomic: ordinals remain unique within the root scope (no
      // partial/duplicate ordinal from the loser). The aggregate advanced once.
      const items = await testDb
        .select({ ordinal: tripPlanItems.ordinal })
        .from(tripPlanItems)
        .where(eq(tripPlanItems.tripProjectId, "safety-reord-p"));
      const ordinals = items.map((i) => i.ordinal).sort((a, b) => a - b);
      expect(ordinals).toEqual([0, 1]);
      const [project] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, "safety-reord-p"));
      expect(project.aggregateVersion).toBe(2);
    });

    test("a held FOR UPDATE lock blocks reorderInternalTripPlanItem until released — real reorder contention", async () => {
      await createTestUser("safety-reord-lock-user");
      await testDb.insert(tripProjects).values({
        id: "safety-reord-lock-p",
        userId: "safety-reord-lock-user",
        title: "Sapa",
        aggregateVersion: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-reord-lock-a",
        tripProjectId: "safety-reord-lock-p",
        userId: "safety-reord-lock-user",
        kind: "leg",
        type: "transport",
        state: "idea",
        label: "A",
        ordinal: 0,
        version: 1,
      });
      await testDb.insert(tripPlanItems).values({
        id: "safety-reord-lock-b",
        tripProjectId: "safety-reord-lock-p",
        userId: "safety-reord-lock-user",
        kind: "leg",
        type: "visit",
        state: "idea",
        label: "B",
        ordinal: 1,
        version: 1,
      });

      const { reorderInternalTripPlanItem } = await loadProjectsModuleAsMultiConn(
        "safety-reord-lock-user",
        "safety-reord-lock-user@example.com",
      );
      const releaseLock = await holdProjectLock("safety-reord-lock-p");

      const reorderPromise = reorderInternalTripPlanItem("safety-reord-lock-p", 1, {
        itemId: "safety-reord-lock-a",
        expectedItemVersion: 1,
        ordinal: 1,
        expectedChangedItemVersions: { "safety-reord-lock-a": 1, "safety-reord-lock-b": 1 },
      });
      // The lock MUST release in finally so a failed contention assertion
      // cannot leave the FOR UPDATE held (which would hang the next TRUNCATE).
      try {
        const outcome = await Promise.race([
          reorderPromise.then(() => "resolved" as const),
          delay(250).then(() => "blocked" as const),
        ]);
        // The reorder must block on the aggregate FOR UPDATE lock.
        expect(outcome).toBe("blocked");
      } finally {
        await releaseLock();
      }

      const result = await reorderPromise;
      expect(result.success).toBe(true);

      // Rnumber atomic: ordinals unique.
      const items = await testDb
        .select({ ordinal: tripPlanItems.ordinal })
        .from(tripPlanItems)
        .where(eq(tripPlanItems.tripProjectId, "safety-reord-lock-p"));
      expect(items.map((i) => i.ordinal).sort((a, b) => a - b)).toEqual([0, 1]);
    });
  });
});
