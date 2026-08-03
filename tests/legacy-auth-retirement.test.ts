import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const root = process.cwd();
const removedOwners = [
  "src/auth.ts",
  "src/app/api/auth/[...nextauth]/route.ts",
  "src/app/api/bff/session/route.ts",
  "src/server/auth.ts",
  "src/server/bff-credentials.ts",
  "src/server/bff-session-token.ts",
  "src/server/bff-api-client.ts",
  "src/server/csrf.ts",
  "src/server/protected-bff-adapter.ts",
  "src/server/mutations.ts",
  "src/app/admin/layout.tsx",
];

describe("legacy Auth.js and BFF retirement inventory", () => {
  test("has no active root authentication, BFF, or admin owner", () => {
    for (const owner of removedOwners) expect(existsSync(join(root, owner))).toBe(false);

    const activeFiles = ["package.json", "pnpm-workspace.yaml", ".env.example", ".web.env.example", "apps/api/.env.example", "Dockerfile", "README.md"];
    const activeSource = activeFiles.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
    expect(activeSource).not.toMatch(/next-auth|@auth\/drizzle-adapter|XV_BFF|XV_PRIVATE_API|XV_WEB_BFF|AUTH_SECRET|AUTH_URL|AUTH_GOOGLE/i);
  });
});
