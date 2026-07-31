import { spawnSync } from "node:child_process";

import postgres from "postgres";

import { schemaCompatibilityDeclarations } from "@xuyenviet/contracts";
import { runApiSchemaMigration } from "./migrate-api-schema-runner";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const sql = postgres(databaseUrl, { max: 1 });
try {
  await runApiSchemaMigration({
    acquireMigrationLock: async () => { await sql`select pg_advisory_lock(918_040_004)`; },
    releaseMigrationLock: async () => { await sql`select pg_advisory_unlock(918_040_004)`; },
    runDrizzleMigration: async () => {
      const migration = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], { stdio: "inherit", env: process.env });
      if (migration.error) throw migration.error;
      if (migration.status !== 0) throw new Error("Drizzle migration failed.");
    },
    releaseSchemaVersions: {
      async recordSchemaVersion(version) {
        await sql.begin(async (transaction) => {
          await transaction`delete from release_schema_versions`;
          await transaction`insert into release_schema_versions (version) values (${version})`;
        });
      },
    },
    migrationVersion: schemaCompatibilityDeclarations.migration.maximumVersion,
  });
} catch {
  process.exitCode = 1;
} finally {
  await sql.end();
}
