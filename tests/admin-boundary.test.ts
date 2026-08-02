import { afterEach, describe, expect, test, vi } from "vitest";

import { permitsAdminCapability } from "@xuyenviet/contracts";

import { adminCsrfCookieName, adminSessionCookie, adminSessionCookieName, adminTransactionCookie, adminTransactionCookieName } from "../apps/admin/server/cookies";

describe("separate admin boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("uses distinct host-only admin cookie namespaces", () => {
    expect(adminSessionCookieName).toBe("__Host-xuyenviet-admin-session");
    expect(adminTransactionCookieName).toBe("__Host-xuyenviet-admin-oauth");
    expect(adminCsrfCookieName).toBe("__Host-xuyenviet-admin-csrf");
    expect(adminSessionCookie("opaque")).toEqual(expect.objectContaining({ name: adminSessionCookieName, secure: true, httpOnly: true, sameSite: "strict", path: "/" }));
    expect(adminSessionCookie("opaque")).not.toHaveProperty("domain");
    expect(adminTransactionCookie("transaction")).toEqual(expect.objectContaining({ name: adminTransactionCookieName, secure: true, httpOnly: true, sameSite: "lax", path: "/" }));
    expect(adminTransactionCookie("transaction")).not.toHaveProperty("domain");
    expect(adminSessionCookieName).not.toContain("xuyenviet.session-token");
  });

  test("uses localhost-only cookie names without Secure in explicit local transport mode", async () => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("XV_ADMIN_LOCAL_TRANSPORT", "true");
    vi.resetModules();
    const cookies = await import("../apps/admin/server/cookies");
    expect(cookies.adminSessionCookieName).toBe("xv-local-admin-session");
    expect(cookies.adminTransactionCookieName).toBe("xv-local-admin-oauth");
    expect(cookies.adminCsrfCookieName).toBe("xv-local-admin-csrf");
    expect(cookies.adminSessionCookie("opaque")).toMatchObject({ secure: false, httpOnly: true, sameSite: "strict" });
    expect(cookies.adminTransactionCookie("transaction")).toMatchObject({ secure: false, httpOnly: true, sameSite: "lax" });
  });

  test("uses the same declared capability matrix at the BFF and API seam", () => {
    expect(permitsAdminCapability(["operator"], "admin.workspace.read")).toBe(true);
    expect(permitsAdminCapability(["traveler"], "admin.workspace.read")).toBe(false);
    expect(permitsAdminCapability(["operator"], "admin.role.governance")).toBe(false);
    expect(permitsAdminCapability(["admin"], "admin.ai-model-catalog.write")).toBe(true);
  });
});
