import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { describe, expect, test } from "vitest";

import type { RequestPrincipal } from "@xuyenviet/contracts";

import { accounts, auditEvents, userRoles, users, type UserRole } from "@/db/schema";
import { bootstrapInitialAdmin, changeUserRole } from "@/features/auth/role-governance";

import { testDb } from "./helpers/db";

const principal = (userId: string): RequestPrincipal => ({
  userId,
  sessionId: "session-1",
  roles: ["admin"],
  authorizationVersion: 1,
  issuer: "xuyenviet-web-bff",
  tokenId: "token-1",
});

async function createUser(userId: string, roles: UserRole[] = [], email = `${userId}@example.com`) {
  await testDb.insert(users).values({ id: userId, email });
  if (roles.length > 0) await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
}

async function authorizationVersion(userId: string) {
  const [user] = await testDb.select({ value: users.authorizationVersion }).from(users).where(eq(users.id, userId));
  return user?.value;
}

describe("Auth/Admin role governance", () => {
  test("bootstraps a normalized linked user as the sole initial administrator", async () => {
    await createUser("first-admin", [], "Admin@Example.com");
    await testDb.insert(accounts).values({ userId: "first-admin", type: "oauth", provider: "google", providerAccountId: "account-1" });

    await expect(bootstrapInitialAdmin("  admin@example.COM  ", { database: testDb })).resolves.toEqual({ targetUserId: "first-admin", role: "admin" });
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "first-admin"))).resolves.toEqual([{ userId: "first-admin", role: "admin" }]);
    await expect(authorizationVersion("first-admin")).resolves.toBe(2);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([
      expect.objectContaining({ actorClass: "system", actorSystem: "system-admin-bootstrap", targetId: "first-admin", afterSummary: '{"role":"admin"}' }),
    ]);
  });

  test.each([
    { name: "missing email", email: undefined, account: true, existingAdmin: false },
    { name: "unknown user", email: "missing@example.com", account: false, existingAdmin: false },
    { name: "unlinked user", email: "candidate@example.com", account: false, existingAdmin: false },
    { name: "existing administrator", email: "candidate@example.com", account: true, existingAdmin: true },
  ])("bootstrap fails closed for $name", async ({ email, account, existingAdmin }) => {
    await createUser("candidate", [], "candidate@example.com");
    if (account) await testDb.insert(accounts).values({ userId: "candidate", type: "oauth", provider: "google", providerAccountId: "account-1" });
    if (existingAdmin) await createUser("other-admin", ["admin"]);

    await expect(bootstrapInitialAdmin(email, { database: testDb })).rejects.toThrow();
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "candidate"))).resolves.toEqual([]);
    await expect(authorizationVersion("candidate")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("bootstrap fails closed when normalized email matches multiple users", async () => {
    await createUser("candidate-one", [], "Admin@Example.com");
    await createUser("candidate-two", [], "admin@example.com");
    await testDb.insert(accounts).values({ userId: "candidate-one", type: "oauth", provider: "google", providerAccountId: "account-1" });
    await testDb.insert(accounts).values({ userId: "candidate-two", type: "oauth", provider: "github", providerAccountId: "account-2" });

    await expect(bootstrapInitialAdmin("admin@example.com", { database: testDb })).rejects.toThrow("exactly one authenticated user");
    await expect(testDb.select().from(userRoles)).resolves.toEqual([]);
    await expect(authorizationVersion("candidate-one")).resolves.toBe(1);
    await expect(authorizationVersion("candidate-two")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("refuses repeated bootstrap without mutating the existing administrator", async () => {
    await createUser("first-admin", [], "admin@example.com");
    await testDb.insert(accounts).values({ userId: "first-admin", type: "oauth", provider: "google", providerAccountId: "account-1" });
    await bootstrapInitialAdmin("admin@example.com", { database: testDb });

    await expect(bootstrapInitialAdmin("admin@example.com", { database: testDb })).rejects.toThrow("Initial administrator bootstrap has already completed.");
    await expect(authorizationVersion("first-admin")).resolves.toBe(2);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(1);
  });

  test("uses the live admin actor and updates authorization version only for committed deltas", async () => {
    await createUser("admin", ["admin"]);
    await createUser("target");

    await expect(changeUserRole(principal("admin"), { targetUserId: "target", role: "operator", operation: "grant" }, { database: testDb })).resolves.toMatchObject({ changed: true });
    await expect(changeUserRole(principal("admin"), { targetUserId: "target", role: "operator", operation: "grant" }, { database: testDb })).resolves.toMatchObject({ changed: false });
    await expect(authorizationVersion("target")).resolves.toBe(2);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetId, "target"))).resolves.toEqual([
      expect.objectContaining({ actorClass: "user", actorUserId: "admin", actorEmail: "admin@example.com", afterSummary: '{"role":"operator"}' }),
    ]);

    await expect(changeUserRole(principal("admin"), { targetUserId: "target", role: "operator", operation: "revoke" }, { database: testDb })).resolves.toMatchObject({ changed: true });
    await expect(authorizationVersion("target")).resolves.toBe(3);
  });

  test("rejects stale or unauthorized callers before role, version, or audit mutations", async () => {
    await createUser("former-admin");
    await createUser("target");

    await expect(changeUserRole(principal("former-admin"), { targetUserId: "target", role: "operator", operation: "grant" }, { database: testDb })).rejects.toThrow("Exact administrator access is required for role changes.");
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "target"))).resolves.toEqual([]);
    await expect(authorizationVersion("target")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("rejects a stale principal without role, version, or audit mutations", async () => {
    await createUser("admin", ["admin"]);
    await createUser("target");
    await testDb.update(users).set({ authorizationVersion: 2 }).where(eq(users.id, "admin"));

    await expect(changeUserRole(principal("admin"), { targetUserId: "target", role: "operator", operation: "grant" }, { database: testDb })).rejects.toThrow("Request principal is stale.");
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "target"))).resolves.toEqual([]);
    await expect(authorizationVersion("target")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("preserves the final administrator and rolls back its transaction", async () => {
    await createUser("admin", ["admin"]);

    await expect(changeUserRole(principal("admin"), { targetUserId: "admin", role: "admin", operation: "revoke" }, { database: testDb })).rejects.toThrow("Cannot revoke the final administrator role.");
    await expect(testDb.select().from(userRoles).where(and(eq(userRoles.userId, "admin"), eq(userRoles.role, "admin")))).resolves.toHaveLength(1);
    await expect(authorizationVersion("admin")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("rejects malformed operations before they can revoke the final administrator", async () => {
    await createUser("admin", ["admin"]);

    await expect(changeUserRole(principal("admin"), { targetUserId: "admin", role: "admin", operation: "unexpected" as never }, { database: testDb })).rejects.toThrow("Role operation must be grant or revoke.");
    await expect(testDb.select().from(userRoles).where(and(eq(userRoles.userId, "admin"), eq(userRoles.role, "admin")))).resolves.toHaveLength(1);
    await expect(authorizationVersion("admin")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("rolls back role and authorization mutations when audit recording fails", async () => {
    await createUser("admin", ["admin"]);
    await createUser("target");
    const auditFailure = new Error("audit write failed");

    await expect(changeUserRole(
      principal("admin"),
      { targetUserId: "target", role: "operator", operation: "grant" },
      { database: testDb, recordAuditEvent: async () => { throw auditFailure; } },
    )).rejects.toThrow(auditFailure);
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "target"))).resolves.toEqual([]);
    await expect(authorizationVersion("target")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("waits for the transaction-scoped governance advisory lock before mutating", async () => {
    await createUser("admin", ["admin"]);
    await createUser("target");
    const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
    const connection = await sql.reserve();
    let completed = false;

    try {
      await connection.unsafe("begin");
      await connection.unsafe("select pg_advisory_xact_lock(727556452)");
      const mutation = changeUserRole(principal("admin"), { targetUserId: "target", role: "operator", operation: "grant" }, { database: testDb })
        .then(() => { completed = true; });

      await expect.poll(async () => {
        const [{ count }] = await sql<{ count: string }[]>`
          select count(*)::text as count
          from pg_locks
          where locktype = 'advisory' and granted = false
        `;
        return count;
      }).toBe("1");
      expect(completed).toBe(false);
      await connection.unsafe("commit");
      await mutation;
    } finally {
      await connection.release();
      await sql.end();
    }

    await expect(testDb.select().from(userRoles).where(and(eq(userRoles.userId, "target"), eq(userRoles.role, "operator")))).resolves.toHaveLength(1);
  });
});
