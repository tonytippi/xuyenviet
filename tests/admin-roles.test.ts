import { sql } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { userRoles, users, type UserRole } from "@/db/schema";

import { testDb } from "./helpers/db";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

async function createUserWithRoles(userId: string, roles: UserRole[]) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });

  if (roles.length > 0) {
    await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
  }
}

describe("admin role authorization", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test.each([
    { roles: ["traveler"] as UserRole[], expected: false },
    { roles: ["operator"] as UserRole[], expected: true },
    { roles: ["admin"] as UserRole[], expected: true },
    { roles: ["operator", "admin"] as UserRole[], expected: true },
  ])("hasAdminAccess($roles) is $expected", async ({ roles, expected }) => {
    const { hasAdminAccess } = await import("@/server/auth");

    expect(hasAdminAccess(roles)).toBe(expected);
  });

  test("requireAdminSession throws typed error when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const { AdminAuthorizationError, requireAdminSession } = await import("@/server/auth");

    await expect(requireAdminSession()).rejects.toThrow(AdminAuthorizationError);
  });

  test("requireAdminSession denies traveler role", async () => {
    await createUserWithRoles("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    const { AdminAuthorizationError, requireAdminSession } = await import("@/server/auth");

    await expect(requireAdminSession()).rejects.toThrow(AdminAuthorizationError);
  });

  test.each(["operator", "admin"] as UserRole[])("requireAdminSession allows %s", async (role) => {
    await createUserWithRoles(`${role}-user`, [role]);
    authMock.mockResolvedValue({ user: { id: `${role}-user`, email: `${role}-user@example.com` } });
    const { requireAdminSession } = await import("@/server/auth");

    await expect(requireAdminSession()).resolves.toMatchObject({ userId: `${role}-user`, roles: [role] });
  });

  test("database rejects roles outside the allowed set", async () => {
    await testDb.insert(users).values({ id: "invalid-role-user", email: "invalid-role-user@example.com" });

    await expect(
      testDb.execute(sql`insert into user_roles (user_id, role) values ('invalid-role-user', 'superuser')`),
    ).rejects.toThrow();
  });

  test("database accepts every valid role", async () => {
    await testDb.insert(users).values({ id: "valid-role-user", email: "valid-role-user@example.com" });

    await expect(
      testDb.insert(userRoles).values([
        { userId: "valid-role-user", role: "traveler" },
        { userId: "valid-role-user", role: "operator" },
        { userId: "valid-role-user", role: "admin" },
      ]),
    ).resolves.toBeDefined();
  });
});

describe("admin layout gate", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test("traveler denial does not render protected children", async () => {
    await createUserWithRoles("layout-traveler", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "layout-traveler", email: "layout-traveler@example.com" } });
    const { default: AdminLayout } = await import("@/app/admin/layout");

    const element = await AdminLayout({ children: "SECRET_ADMIN_CHILD" });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Không có quyền quản trị");
    expect(html).not.toContain("SECRET_ADMIN_CHILD");
  });

  test("admin role renders protected children", async () => {
    await createUserWithRoles("layout-admin", ["admin"]);
    authMock.mockResolvedValue({ user: { id: "layout-admin", email: "layout-admin@example.com" } });
    const { default: AdminLayout } = await import("@/app/admin/layout");

    const element = await AdminLayout({ children: "SECRET_ADMIN_CHILD" });

    expect(renderToStaticMarkup(element)).toContain("SECRET_ADMIN_CHILD");
  });
});
