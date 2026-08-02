import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { admitsSchemaReleaseGate, parseSchemaReleaseMatrix, schemaCompatibilityDeclarations } from "@xuyenviet/contracts";
import { resolveDatabaseTargetIdentity } from "./db-env";
import { assertApprovedDrizzlePendingPlan } from "./drizzle-migration-plan";
import { runApiSchemaMigration } from "./migrate-api-schema-runner";
import { readReleaseMatrixArtifact } from "./schema-release-matrix";

const releaseLock = 918_040_004;

export async function withTargetMigrationLock(sql: ReturnType<typeof postgres>, action: () => Promise<void>): Promise<void> {
  let locked = false;
  try {
    // Advisory locks are database-scoped. This must remain on the application
    // target so pre-Epic-12 and current migration runners serialize together.
    await sql`select pg_advisory_lock(${releaseLock})`;
    locked = true;
    await action();
  } finally {
    if (locked) await sql`select pg_advisory_unlock(${releaseLock})`.catch(() => undefined);
  }
}

export async function runApiSchemaMigrationCommand() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const matrixPath = process.env.SCHEMA_RELEASE_MATRIX_PATH?.trim();
  if (!databaseUrl || !matrixPath) throw new Error("release input missing");
  const matrix: unknown = readReleaseMatrixArtifact(matrixPath);
  if (!parseSchemaReleaseMatrix(matrix)) throw new Error("release input invalid");

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await withTargetMigrationLock(sql, async () => {
      await runApiSchemaMigration({
        acquireMigrationLock: async () => undefined,
        releaseMigrationLock: async () => undefined,
        runDrizzleMigration: async () => {
          // This migrator uses this exact client, which was identity-checked again
          // immediately before DDL rather than relying on a separately spawned CLI.
          const target = await resolveDatabaseTargetIdentity(sql);
          const parsed = parseSchemaReleaseMatrix(matrix);
          if (!parsed || target !== parsed.target.resolvedIdentity) throw new Error("Schema release target changed before migration execution.");
          await assertApprovedDrizzlePendingPlan(sql, parsed.migrationPlan);
          await migrate(drizzle(sql), { migrationsFolder: "drizzle/migrations" });
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
        async preflight() {
          const [{ exists }] = await sql<{ exists: boolean }[]>`select to_regclass('public.release_schema_versions') is not null as exists`;
          // A fresh target has no release ledger until forward migration 0003 runs.
          // Bootstrap admission therefore observes no rows rather than querying a
          // relation that does not exist; recording remains post-Drizzle only.
          const rows = exists ? await sql<{ version: string }[]>`select version from release_schema_versions` : [];
          const target = {
            environment: process.env.APP_ENV,
            identityClass: process.env.SCHEMA_RELEASE_TARGET_IDENTITY_CLASS,
            resolvedIdentity: await resolveDatabaseTargetIdentity(sql),
          };
          if (!admitsSchemaReleaseGate({ disposition: "expand_migrate_contract", matrix, phase: "migrate", migrationVersion: schemaCompatibilityDeclarations.migration.maximumVersion, persistedRows: rows, target })) {
            throw new Error("Schema release gate rejected this migration before execution.");
          }
          const parsed = parseSchemaReleaseMatrix(matrix);
          if (!parsed) throw new Error("Schema release gate rejected this migration before execution.");
          await assertApprovedDrizzlePendingPlan(sql, parsed.migrationPlan);
        },
      });
    });
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith("migrate-api-schema.ts")) {
  runApiSchemaMigrationCommand().catch(() => {
    console.error("Schema migration failed or was rejected before execution. Verify the approved release matrix and pre-migration schema admission.");
    process.exitCode = 1;
  });
}
