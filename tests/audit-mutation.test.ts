import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, userRoles, users, type UserRole } from "@/db/schema";

import { testDb } from "./helpers/db";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
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
  });

  test("throws before mutation when authenticated session is missing", async () => {
    authMock.mockResolvedValue(null);
    const { runAuditedAuthenticatedMutation } = await import("@/server/mutations");

    await expect(
      runAuditedAuthenticatedMutation({
        action: async () => "never runs",
        audit: { operation: "create", targetType: "test_target" },
      }),
    ).rejects.toThrow("Authentication required for this server mutation.");
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
});
