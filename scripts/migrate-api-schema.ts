import { spawnSync } from "node:child_process";

import postgres from "postgres";

import { apiCompatibleSchemaVersion } from "../apps/api/src/release-schema";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const sql = postgres(databaseUrl, { max: 1 });

try {
  await sql`select pg_advisory_lock(918_040_004)`;
  const migration = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], { stdio: "inherit", env: process.env });
  if (migration.status !== 0) process.exitCode = migration.status ?? 1;
  else {
    await sql.begin(async (transaction) => {
      await transaction`delete from release_schema_versions`;
      await transaction`insert into release_schema_versions (version) values (${apiCompatibleSchemaVersion})`;
    });
  }
} finally {
  await sql`select pg_advisory_unlock(918_040_004)`;
  await sql.end();
}
