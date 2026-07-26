import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, userRoles, users, type UserRole } from "@/db/schema";

import { testDb } from "./helpers/db";

const authMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: getDbMock,
}));

async function createUser(userId: string, roles: UserRole[] = []) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });

  if (roles.length > 0) {
    await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
  }
}

async function countRows(tableName: string) {
  const rows = await testDb.execute<{ count: string }>(sql.raw(`select count(*)::text as count from ${tableName}`));

  return Number(rows[0]?.count ?? 0);
}

describe("audited mutation transaction contract", () => {
  beforeEach(() => {
    authMock.mockReset();
    getDbMock.mockReset();
    getDbMock.mockReturnValue(testDb);
  });

  test("throws before mutation when authenticated session is missing", async () => {
    authMock.mockResolvedValue(null);
    const { runAuditedAuthenticatedMutation } = await import("@/server/mutations");
    const action = vi.fn(async () => "never runs");

    await expect(
      runAuditedAuthenticatedMutation({
        action,
        audit: { operation: "create", targetType: "test_target" },
      }),
    ).rejects.toThrow("Authentication required for this server mutation.");

    expect(action).not.toHaveBeenCalled();
  });

  test("commits action and audit row together", async () => {
    await createUser("actor-user");
    await createUser("target-user");
    authMock.mockResolvedValue({ user: { id: "actor-user", email: "actor-user@example.com" } });
    const { runAuditedAuthenticatedMutation } = await import("@/server/mutations");

    await expect(
      runAuditedAuthenticatedMutation({
        action: async (_session, transaction) => {
          await transaction.insert(userRoles).values({ userId: "target-user", role: "operator" });
          return "ok";
        },
        audit: { operation: "update", targetType: "user_role", targetId: "target-user" },
      }),
    ).resolves.toBe("ok");

    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "target-user"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.actorUserId, "actor-user"))).resolves.toHaveLength(1);
  });

  test("uses the authenticated actor when untyped audit metadata supplies another actor", async () => {
    await createUser("actor-user");
    await createUser("metadata-user");
    authMock.mockResolvedValue({ user: { id: "actor-user", email: "actor-user@example.com" } });
    const { runAuditedAuthenticatedMutation } = await import("@/server/mutations");

    await runAuditedAuthenticatedMutation({
      action: async () => "ok",
      audit: {
        operation: "update",
        targetType: "test_target",
        actor: { kind: "user", userId: "metadata-user", email: "metadata-user@example.com" },
      } as never,
    });

    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.actorUserId, "actor-user"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.actorUserId, "metadata-user"))).resolves.toHaveLength(0);
  });

  test("rolls back action and writes no audit row when the action throws", async () => {
    await createUser("actor-user");
    authMock.mockResolvedValue({ user: { id: "actor-user", email: "actor-user@example.com" } });
    const { runAuditedAuthenticatedMutation } = await import("@/server/mutations");

    await expect(
      runAuditedAuthenticatedMutation({
        action: async (_session, transaction) => {
          await transaction.insert(users).values({ id: "rolled-back-user", email: "rolled-back-user@example.com" });
          throw new Error("action failed");
        },
        audit: { operation: "create", targetType: "user", targetId: "rolled-back-user" },
      }),
    ).rejects.toThrow("action failed");

    await expect(testDb.select().from(users).where(eq(users.id, "rolled-back-user"))).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("rolls back the action when audit insert fails", async () => {
    authMock.mockResolvedValue({ user: { id: "missing-actor", email: "missing-actor@example.com" } });
    const { runAuditedAuthenticatedMutation } = await import("@/server/mutations");

    await expect(
      runAuditedAuthenticatedMutation({
        action: async (_session, transaction) => {
          await transaction.insert(users).values({ id: "audit-failure-side-effect", email: "audit-failure@example.com" });
          return "side effect created";
        },
        audit: { operation: "create", targetType: "user", targetId: "audit-failure-side-effect" },
      }),
    ).rejects.toThrow();

    await expect(testDb.select().from(users).where(eq(users.id, "audit-failure-side-effect"))).resolves.toHaveLength(0);
    expect(await countRows("audit_events")).toBe(0);
  });

  test("runAuditedAdminMutation denies non-admin session before action", async () => {
    await createUser("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    const { runAuditedAdminMutation } = await import("@/server/mutations");
    const action = vi.fn(async () => "never runs");

    await expect(
      runAuditedAdminMutation({
        action,
        audit: { operation: "access_check", targetType: "admin_action" },
      }),
    ).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    expect(action).not.toHaveBeenCalled();
  });

  test("runAuditedAdminMutation commits an admin action and audit row together", async () => {
    await createUser("admin-user", ["admin"]);
    await createUser("admin-target");
    authMock.mockResolvedValue({ user: { id: "admin-user", email: "admin-user@example.com" } });
    const { runAuditedAdminMutation } = await import("@/server/mutations");

    await expect(runAuditedAdminMutation({
      action: async (_session, transaction) => {
        await transaction.insert(userRoles).values({ userId: "admin-target", role: "operator" });
        return "committed";
      },
      audit: { operation: "update", targetType: "user_role", targetId: "admin-target" },
    })).resolves.toBe("committed");

    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "admin-target"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.actorUserId, "admin-user"))).resolves.toHaveLength(1);
  });

  test("runAuditedExactAdminMutation commits the action and audit row together", async () => {
    await createUser("exact-admin", ["admin"]);
    await createUser("exact-admin-target");
    authMock.mockResolvedValue({ user: { id: "exact-admin", email: "exact-admin@example.com" } });
    const { runAuditedExactAdminMutation } = await import("@/server/mutations");

    await expect(runAuditedExactAdminMutation({
      action: async (_session, transaction) => {
        await transaction.insert(userRoles).values({ userId: "exact-admin-target", role: "operator" });
        return "committed";
      },
      audit: () => ({ operation: "update", targetType: "user_role", targetId: "exact-admin-target" }),
    })).resolves.toBe("committed");

    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "exact-admin-target"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.actorUserId, "exact-admin"))).resolves.toHaveLength(1);
  });

  test("runAuditedExactAdminMutation denies an initially authorized admin revoked before transaction revalidation", async () => {
    await createUser("revoked-admin", ["admin"]);
    authMock.mockResolvedValue({ user: { id: "revoked-admin", email: "revoked-admin@example.com" } });
    const { runAuditedExactAdminMutation } = await import("@/server/mutations");
    const action = vi.fn(async () => "never runs");

    getDbMock
      .mockReturnValueOnce(testDb)
      .mockReturnValueOnce({
        ...testDb,
        transaction: async (callback: Parameters<typeof testDb.transaction>[0]) => {
          await testDb.delete(userRoles).where(eq(userRoles.userId, "revoked-admin"));
          return testDb.transaction(callback);
        },
      });

    await expect(runAuditedExactAdminMutation({
      action,
      audit: () => ({ operation: "update", targetType: "user_role" }),
    })).rejects.toThrow("Exact administrator access is required for this server mutation.");

    expect(action).not.toHaveBeenCalled();
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.actorUserId, "revoked-admin"))).resolves.toHaveLength(0);
  });
});
