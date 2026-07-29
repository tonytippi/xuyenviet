import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { accounts, aiUsageEvents, auditEvents, sessions, userRoles, users, type UserRole } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

async function createUser(userId: string, roles: UserRole[] = [], values: Partial<typeof users.$inferInsert> = {}) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com`, ...values });

  if (roles.length > 0) {
    await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
  }
}

function authenticate(userId: string) {
  authMock.mockResolvedValue({ user: { id: userId, email: `${userId}@example.com` } });
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("admin user management", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test("requires an exact administrator while preserving the operator-inclusive console guard", async () => {
    await createUser("operator", ["operator"]);
    authenticate("operator");
    const { AdminAuthorizationError, requireAdminSession, requireExactAdminSession } = await import("@/server/auth");

    await expect(requireAdminSession()).resolves.toMatchObject({ userId: "operator" });
    await expect(requireExactAdminSession()).rejects.toThrow(AdminAuthorizationError);
  });

  test.each([
    { name: "anonymous", setup: async () => undefined },
    { name: "traveler", setup: async () => { await createUser("traveler", ["traveler"]); authenticate("traveler"); } },
    { name: "operator", setup: async () => { await createUser("operator", ["operator"]); authenticate("operator"); } },
  ])("denies $name before roster or mutation side effects", async ({ setup }) => {
    await createUser("target", []);
    await setup();
    const { grantAdminUserRole } = await import("@/features/admin/actions");
    const { listAdminUsers } = await import("@/features/admin/users");

    await expect(listAdminUsers()).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(grantAdminUserRole("target", "operator")).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "target"))).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("returns a paginated safe roster with lifetime usage totals, case-insensitive search, and no auth tables", async () => {
    await createUser("admin", ["admin"]);
    await createUser("first", ["operator"], { name: "An Nguyen", emailVerified: new Date("2026-01-01T00:00:00.000Z"), image: "https://example.com/an.jpg" });
    await createUser("second", ["admin"], { name: "Binh Tran" });
    await testDb.insert(accounts).values({ userId: "first", type: "oauth", provider: "google", providerAccountId: "private-account", access_token: "secret" });
    await testDb.insert(sessions).values({ sessionToken: "private-session", userId: "first", expires: new Date("2027-01-01T00:00:00.000Z") });
    await testDb.insert(aiUsageEvents).values([
      { initiatedByUserId: "first", executorSystem: "system-ai-orchestration", purpose: "ai_ask_initial_answer", provider: "ai_gateway", model: "test", promptVersion: "test", status: "success", promptTokens: 120, completionTokens: 80 },
      { initiatedByUserId: "first", executorSystem: "system-ai-orchestration", purpose: "extraction", provider: "ai_gateway", model: "test", promptVersion: "test", status: "failure", promptTokens: 30, completionTokens: 20 },
      { initiatedByUserId: "first", executorSystem: "system-ai-orchestration", purpose: "web_search_fallback", provider: "tavily", model: "search", promptVersion: "test", status: "failure" },
      { initiatedByUserId: null, executorSystem: "system-knowledge-pipeline", purpose: "extraction", provider: "ai_gateway", model: "test", promptVersion: "test", status: "success", promptTokens: 999, completionTokens: 999 },
      { initiatedByUserId: "second", executorSystem: "system-ai-orchestration", purpose: "ai_ask_initial_answer", provider: "ai_gateway", model: "test", promptVersion: "test", status: "success", promptTokens: 999, completionTokens: 999 },
    ]);
    authenticate("admin");
    const { listAdminUsers } = await import("@/features/admin/users");

    await expect(listAdminUsers({ search: "NGUYEN", page: "invalid" })).resolves.toEqual({
      items: [{ id: "first", name: "An Nguyen", email: "first@example.com", image: "https://example.com/an.jpg", emailVerified: new Date("2026-01-01T00:00:00.000Z"), roles: ["operator"], aiRequestCount: "3", inputTokens: "150", outputTokens: "100" }],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      search: "NGUYEN",
    });
  });

  test("defaults lifetime usage metrics to zero for users without usage events", async () => {
    await createUser("admin", ["admin"]);
    await createUser("target");
    authenticate("admin");
    const { listAdminUsers } = await import("@/features/admin/users");

    await expect(listAdminUsers({ search: "target" })).resolves.toMatchObject({
      items: [{ id: "target", aiRequestCount: "0", inputTokens: "0", outputTokens: "0" }],
    });
  });

  test("clamps stale roster pages to the last available page", async () => {
    await createUser("admin", ["admin"]);
    await createUser("target");
    authenticate("admin");
    const { listAdminUsers } = await import("@/features/admin/users");

    await expect(listAdminUsers({ page: 99 })).resolves.toMatchObject({
      page: 1,
      totalPages: 1,
      total: 2,
      items: expect.arrayContaining([expect.objectContaining({ id: "admin" }), expect.objectContaining({ id: "target" })]),
    });
  });

  test("grants and revokes only permitted role deltas with safe audit metadata", async () => {
    await createUser("admin", ["admin"]);
    await createUser("target", []);
    authenticate("admin");
    const { grantAdminUserRole, revokeAdminUserRole } = await import("@/features/admin/actions");

    await expect(grantAdminUserRole("target", "operator")).resolves.toMatchObject({ changed: true, operation: "grant" });
    await expect(grantAdminUserRole("target", "operator")).resolves.toMatchObject({ changed: false });
    await expect(revokeAdminUserRole("target", "operator")).resolves.toMatchObject({ changed: true, operation: "revoke" });
    await expect(revokeAdminUserRole("target", "operator")).resolves.toMatchObject({ changed: false });
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetId, "target"))).resolves.toEqual([
      expect.objectContaining({ operation: "update", targetType: "user_role", beforeSummary: null, afterSummary: '{"role":"operator"}' }),
      expect.objectContaining({ operation: "update", targetType: "user_role", beforeSummary: '{"role":"operator"}', afterSummary: null }),
    ]);
  });

  test("rejects invalid or unknown role targets without audit events", async () => {
    await createUser("admin", ["admin"]);
    authenticate("admin");
    const { grantAdminUserRole } = await import("@/features/admin/actions");

    await expect(grantAdminUserRole("missing", "operator")).rejects.toThrow("User not found.");
    await expect(grantAdminUserRole("admin", "traveler" as never)).rejects.toThrow("Role must be operator or admin.");
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("prevents revoking the final administrator without changing roles or audit state", async () => {
    await createUser("admin", ["admin"]);
    authenticate("admin");
    const { revokeAdminUserRole } = await import("@/features/admin/actions");

    await expect(revokeAdminUserRole("admin", "admin")).rejects.toThrow("Cannot revoke the final administrator role.");
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "admin"))).resolves.toMatchObject([{ role: "admin" }]);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });
});
