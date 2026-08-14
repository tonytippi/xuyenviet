import { execFileSync } from "node:child_process";

import { getTestDatabaseUrl } from "./helpers/env-file";

export default async function globalSetup() {
  const testDatabaseUrl = getTestDatabaseUrl();
  const migrationDatabaseUrl = new URL(testDatabaseUrl);
  migrationDatabaseUrl.searchParams.set("options", "-c xuyenviet.provenance_old_writers_quiesced=v1");

  // Drizzle's in-process migrator leaves the Vitest global setup process
  // waiting after initializing its ledger. The CLI runs the same migration
  // plan in a disposable child process, which exits before workers start.
  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, APP_ENV: "local", DATABASE_URL: migrationDatabaseUrl.toString() },
    stdio: "pipe",
  });
}
