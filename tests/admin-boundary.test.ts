import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { permitsAdminCapability } from "@xuyenviet/contracts";

describe("direct admin browser boundary", () => {
  test("has no BFF routes, server bridge, credentials, or private API imports", () => {
    for (const path of ["apps/admin/app/api/workspace/route.ts", "apps/admin/app/api/auth/callback/route.ts", "apps/admin/app/api/auth/csrf/route.ts", "apps/admin/app/api/auth/logout/route.ts", "apps/admin/app/sign-in/route.ts", "apps/admin/server/bff-adapter.ts", "apps/admin/server/identity.ts", "apps/admin/server/csrf.ts", "apps/admin/server/cookies.ts"]) expect(existsSync(join(process.cwd(), path))).toBe(false);
    const sources = ["apps/admin/.env.example", "apps/admin/package.json", "apps/admin/next.config.ts", "apps/admin/app/api/health/route.ts"].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
    expect(sources).not.toMatch(/XV_ADMIN_|xuyenviet-admin-bff|api\.railway\.internal|Bearer|@xuyenviet\/config|jose/);
    expect(sources).toContain("NEXT_PUBLIC_API_ORIGIN");
  });

  test("uses the same declared capability matrix at the BFF and API seam", () => {
    expect(permitsAdminCapability(["operator"], "admin.workspace.read")).toBe(true);
    expect(permitsAdminCapability(["traveler"], "admin.workspace.read")).toBe(false);
    expect(permitsAdminCapability(["operator"], "admin.role.governance")).toBe(false);
    expect(permitsAdminCapability(["admin"], "admin.ai-model-catalog.write")).toBe(true);
  });
});
