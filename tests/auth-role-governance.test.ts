import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { describe, expect, test } from "vitest";

import { parseAdminUserRosterCursor, type RequestPrincipal } from "@xuyenviet/contracts";
import { createPostgresUserRoleGovernancePort } from "@xuyenviet/database";
import { changeGovernedUserRole } from "@xuyenviet/domain";

import { accounts, auditEvents, userRoles, users, type UserRole } from "@/db/schema";
import { bootstrapInitialAdmin } from "@/features/auth/role-governance";

import { testDb } from "./helpers/db";
import { getTestDatabaseUrl } from "./helpers/env-file";

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

function changeUserRole(principalValue: RequestPrincipal, input: { targetUserId: string; role: "operator" | "admin"; operation: "grant" | "revoke" }) {
  return changeGovernedUserRole(createPostgresUserRoleGovernancePort(getTestDatabaseUrl()), principalValue, input);
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

  test("uses JavaScript Unicode normalization for the stored email lookup", async () => {
    await createUser("unicode-admin", [], "İadmin@example.com");
    await testDb.insert(accounts).values({ userId: "unicode-admin", type: "oauth", provider: "google", providerAccountId: "unicode-account-1" });

    await expect(bootstrapInitialAdmin("i\u0307ADMIN@example.com", { database: testDb })).resolves.toEqual({ targetUserId: "unicode-admin", role: "admin" });
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "unicode-admin"))).resolves.toEqual([{ userId: "unicode-admin", role: "admin" }]);
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

    await expect(changeUserRole(principal("admin"), { targetUserId: "target", role: "operator", operation: "grant" })).resolves.toMatchObject({ changed: true });
    await expect(changeUserRole(principal("admin"), { targetUserId: "target", role: "operator", operation: "grant" })).resolves.toMatchObject({ changed: false });
    await expect(authorizationVersion("target")).resolves.toBe(2);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetId, "target"))).resolves.toEqual([
      expect.objectContaining({ actorClass: "user", actorUserId: "admin", actorEmail: "admin@example.com", afterSummary: '{"role":"operator"}' }),
    ]);

    await expect(changeUserRole(principal("admin"), { targetUserId: "target", role: "operator", operation: "revoke" })).resolves.toMatchObject({ changed: true });
    await expect(authorizationVersion("target")).resolves.toBe(3);
  });

  test("rejects stale or unauthorized callers before role, version, or audit mutations", async () => {
    await createUser("former-admin");
    await createUser("target");

    await expect(changeUserRole(principal("former-admin"), { targetUserId: "target", role: "operator", operation: "grant" })).rejects.toThrow("Exact administrator access is required for role changes.");
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "target"))).resolves.toEqual([]);
    await expect(authorizationVersion("target")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("rejects a stale principal without role, version, or audit mutations", async () => {
    await createUser("admin", ["admin"]);
    await createUser("target");
    await testDb.update(users).set({ authorizationVersion: 2 }).where(eq(users.id, "admin"));

    await expect(changeUserRole(principal("admin"), { targetUserId: "target", role: "operator", operation: "grant" })).rejects.toThrow("Request principal is stale.");
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "target"))).resolves.toEqual([]);
    await expect(authorizationVersion("target")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("preserves the final administrator and rolls back its transaction", async () => {
    await createUser("admin", ["admin"]);

    await expect(changeUserRole(principal("admin"), { targetUserId: "admin", role: "admin", operation: "revoke" })).rejects.toThrow("Cannot revoke the final administrator role.");
    await expect(testDb.select().from(userRoles).where(and(eq(userRoles.userId, "admin"), eq(userRoles.role, "admin")))).resolves.toHaveLength(1);
    await expect(authorizationVersion("admin")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("rejects malformed operations before they can revoke the final administrator", async () => {
    await createUser("admin", ["admin"]);

    await expect(changeUserRole(principal("admin"), { targetUserId: "admin", role: "admin", operation: "unexpected" as never })).rejects.toThrow();
    await expect(testDb.select().from(userRoles).where(and(eq(userRoles.userId, "admin"), eq(userRoles.role, "admin")))).resolves.toHaveLength(1);
    await expect(authorizationVersion("admin")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("rolls back bootstrap role and authorization mutations when audit recording fails", async () => {
    await createUser("first-admin", [], "admin@example.com");
    await testDb.insert(accounts).values({ userId: "first-admin", type: "oauth", provider: "google", providerAccountId: "account-1" });
    const auditFailure = new Error("audit write failed");

    await expect(bootstrapInitialAdmin("admin@example.com", {
      database: testDb,
      recordAuditEvent: async () => { throw auditFailure; },
    })).rejects.toThrow(auditFailure);
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "first-admin"))).resolves.toEqual([]);
    await expect(authorizationVersion("first-admin")).resolves.toBe(1);
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
      const mutation = changeUserRole(principal("admin"), { targetUserId: "target", role: "operator", operation: "grant" })
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

  test("the extracted PostgreSQL governance port preserves final-admin, audit, and version invariants", async () => {
    await createUser("admin", ["admin"]);
    await createUser("target");
    const port = createPostgresUserRoleGovernancePort(getTestDatabaseUrl());

    await expect(changeGovernedUserRole(port, principal("admin"), { targetUserId: "target", role: "operator", operation: "grant" })).resolves.toMatchObject({ changed: true });
    await expect(changeGovernedUserRole(port, principal("admin"), { targetUserId: "target", role: "operator", operation: "grant" })).resolves.toMatchObject({ changed: false });
    await expect(authorizationVersion("target")).resolves.toBe(2);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetId, "target"))).resolves.toHaveLength(1);

    await expect(changeGovernedUserRole(port, principal("admin"), { targetUserId: "admin", role: "admin", operation: "revoke" })).rejects.toThrow("Cannot revoke the final administrator role.");
    await expect(authorizationVersion("admin")).resolves.toBe(1);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetId, "admin"))).resolves.toEqual([]);
  });

  test("pages the PostgreSQL roster in canonical name, email, id order without gaps or duplicates", async () => {
    const roster = [
      { id: "00-null-null", name: null, email: null },
      { id: "01-null-null", name: null, email: null },
      { id: "02-null-a", name: null, email: "a@example.com" },
      { id: "03-null-z", name: null, email: "z@example.com" },
      { id: "04-ada-null", name: "Ada", email: null },
      { id: "05-ada-a", name: "Ada", email: "a.ada@example.com" },
      { id: "06-ada-z", name: "Ada", email: "z.ada@example.com" },
      { id: "07-bea-null", name: "Bea", email: null },
      { id: "08-bea-a", name: "Bea", email: "a.bea@example.com" },
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `user-${String(index).padStart(2, "0")}`,
        name: `User ${String(index).padStart(2, "0")}`,
        email: `user-${String(index).padStart(2, "0")}@example.com`,
      })),
    ];
    await testDb.insert(users).values(roster);
    const port = createPostgresUserRoleGovernancePort(getTestDatabaseUrl());
    const pages = [];
    let cursor = null;

    for (let pageNumber = 0; pageNumber < 2; pageNumber += 1) {
      const page = await port.listUsers({ cursor, search: "" });
      pages.push(page);
      cursor = page.nextCursor ? parseAdminUserRosterCursor(page.nextCursor) : null;
    }

    const ids = pages.flatMap((page) => page.items.map((user) => user.id));
    expect(pages.map((page) => page.items)).toHaveLength(2);
    expect(cursor).toBeNull();
    expect(ids).toEqual(roster.map((user) => user.id));
    expect(new Set(ids)).toHaveLength(roster.length);
  });
});
