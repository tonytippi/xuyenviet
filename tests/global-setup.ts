import { execFileSync } from "node:child_process";

import { getTestDatabaseUrl } from "./helpers/env-file";

export default function globalSetup() {
  const testDatabaseUrl = getTestDatabaseUrl();

  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
    env: {
      ...process.env,
      APP_ENV: "local",
      DATABASE_URL: testDatabaseUrl,
    },
    stdio: "inherit",
  });
}
