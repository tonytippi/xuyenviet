import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { runApiSchemaMigration } from "./migrate-api-schema-runner";

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
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await withTargetMigrationLock(sql, async () => {
      await runApiSchemaMigration({
        acquireMigrationLock: async () => undefined,
        releaseMigrationLock: async () => undefined,
        runDrizzleMigration: async () => {
          await migrate(drizzle(sql), { migrationsFolder: "drizzle/migrations" });
        },
        async preflight() {},
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
