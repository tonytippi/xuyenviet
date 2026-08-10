import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { getTestDatabaseUrl } from "./helpers/env-file";

export default async function globalSetup() {
  const testDatabaseUrl = getTestDatabaseUrl();
  const migrationDatabaseUrl = new URL(testDatabaseUrl);
  // libpq parses the value as a command-line option, so its space and `=` must
  // remain percent-encoded rather than being serialized as `+` by URLSearchParams.
  const migrationOption = encodeURIComponent("-c xuyenviet.provenance_old_writers_quiesced=v1");
  migrationDatabaseUrl.search = `${migrationDatabaseUrl.search}${migrationDatabaseUrl.search ? "&" : "?"}options=${migrationOption}`;
  const migrationSql = postgres(migrationDatabaseUrl.toString(), { max: 1 });

  try {
    // The isolated DATABASE_URL_TEST harness is the authorized disposable
    // cutover target; its migration session records this writer admission.
    await migrate(drizzle(migrationSql), { migrationsFolder: "./drizzle/migrations" });
  } finally {
    await migrationSql.end();
  }
}
