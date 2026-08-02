import { execFileSync } from "node:child_process";

import { getTestDatabaseUrl } from "./helpers/env-file";

export default function globalSetup() {
  const testDatabaseUrl = getTestDatabaseUrl();
  const migrationDatabaseUrl = new URL(testDatabaseUrl);
  migrationDatabaseUrl.searchParams.set("options", "-c xuyenviet.provenance_old_writers_quiesced=v1");

  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
    env: {
      ...process.env,
      APP_ENV: "local",
      // The isolated DATABASE_URL_TEST harness is the authorized disposable
      // cutover target; its migration session records this writer admission.
      DATABASE_URL: migrationDatabaseUrl.toString(),
    },
    stdio: "inherit",
  });
}
