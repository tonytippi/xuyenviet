import { spawn } from "node:child_process";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { schemaCompatibilityDeclarations } from "@xuyenviet/contracts";

import { assertDisposableLocalDatabaseUrl, databaseNameFromResolvedIdentity, getDatabaseUrl, isProtectedDatabaseName, isResolvedDatabaseTargetIdentity, maintenanceIdentityFromTargetIdentity, resolveDatabaseTargetIdentity, type DestructiveResetEnvironment } from "./db-env";
import { runDisposableDatabaseSeed } from "./db-seed";
import { runApiSchemaMigration } from "./migrate-api-schema-runner";

export function runQuietly(command: string, args: string[], environment: Record<string, string | undefined> = process.env as Record<string, string | undefined>) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", env: environment as unknown as NodeJS.ProcessEnv });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error("Child command failed."));
    });
  });
}

const releaseLock = 918_040_004;

async function recreateDatabase(databaseUrl: string, expectedIdentity: string) {
  const url = new URL(databaseUrl);
  const databaseName = databaseNameForReset(expectedIdentity);
  if (!databaseName) throw new Error("Refusing destructive reset without a resolved target identity.");
  const maintenanceUrl = new URL(url);

  maintenanceUrl.pathname = "/postgres";

  const sql = postgres(maintenanceUrl.toString(), { max: 1 });
  const escapedDatabaseName = databaseName.replace(/"/g, "\"\"");

  try {
    // The maintenance connection is the destructive authority; verify it after
    // connecting and immediately before terminating or dropping anything.
    await assertMaintenanceTargetIdentity(sql, expectedIdentity);
    await sql`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${databaseName}
        and pid <> pg_backend_pid()
    `;
    await sql.unsafe(`drop database if exists "${escapedDatabaseName}"`);
    await sql.unsafe(`create database "${escapedDatabaseName}"`);
  } finally {
    await sql.end();
  }
}

export function databaseNameForReset(resolvedIdentity: string): string {
  return databaseNameFromResolvedIdentity(resolvedIdentity);
}

export async function assertMaintenanceTargetIdentity(sql: { unsafe(query: string): Promise<Array<{ identity: string }>> }, expectedIdentity: string): Promise<void> {
  const expectedMaintenanceIdentity = maintenanceIdentityFromTargetIdentity(expectedIdentity);
  if (!expectedMaintenanceIdentity || await resolveDatabaseTargetIdentity(sql) !== expectedMaintenanceIdentity) {
    throw new Error("Refusing destructive reset because the maintenance target differs from the operator confirmation.");
  }
}

export async function runDisposableDatabaseReset(databaseUrl: string, environment: DestructiveResetEnvironment & Record<string, string | undefined> = process.env as unknown as DestructiveResetEnvironment & Record<string, string | undefined>, dependencies: {
  recreateDatabase(databaseUrl: string, expectedIdentity: string): Promise<void>;
  run(command: string, args: string[], environment: Record<string, string | undefined>): Promise<void>;
  resolveTargetIdentity?(databaseUrl: string): Promise<string>;
  seedDatabase?(databaseUrl: string): Promise<void>;
  recordSchemaVersion?(databaseUrl: string, version: string): Promise<void>;
  withReleaseLock?(databaseUrl: string, expectedIdentity: string, action: () => Promise<void>): Promise<void>;
} = { recreateDatabase, run: runQuietly }) {
  assertDisposableLocalDatabaseUrl(databaseUrl, environment);
  if (environment.DATABASE_URL !== undefined && environment.DATABASE_URL !== databaseUrl) {
    throw new Error("Refusing destructive reset when supplied DATABASE_URL differs from the selected target.");
  }
  const resolvedIdentity = dependencies.resolveTargetIdentity
    ? await dependencies.resolveTargetIdentity(databaseUrl)
    : await resolveTargetIdentity(databaseUrl);
  if (!isResolvedDatabaseTargetIdentity(resolvedIdentity) || resolvedIdentity !== environment.DB_RESET_EXPECTED_TARGET_IDENTITY) throw new Error("Refusing destructive reset because the resolved target does not match the operator confirmation.");
  if (isProtectedDatabaseName(databaseNameFromResolvedIdentity(resolvedIdentity))) throw new Error("Refusing to reset a protected database.");
  const execute = async () => {
    const childEnvironment = { ...environment, DATABASE_URL: databaseUrl };
    await dependencies.recreateDatabase(databaseUrl, resolvedIdentity);
    // A clean break does not use a release matrix, but it still records its known
    // target only after forward Drizzle succeeds and before any seed writes.
    await runApiSchemaMigration({
      acquireMigrationLock: async () => undefined,
      releaseMigrationLock: async () => undefined,
      preflight: async () => assertLiveTargetIdentity(databaseUrl, resolvedIdentity, dependencies.resolveTargetIdentity),
      runDrizzleMigration: async () => dependencies.run === runQuietly
        ? migrateDisposableTarget(databaseUrl, resolvedIdentity)
        : dependencies.run("pnpm", ["exec", "drizzle-kit", "migrate"], childEnvironment),
      releaseSchemaVersions: { recordSchemaVersion: async (version) => {
        await assertLiveTargetIdentity(databaseUrl, resolvedIdentity, dependencies.resolveTargetIdentity);
        await (dependencies.recordSchemaVersion?.(databaseUrl, version) ?? recordSchemaVersion(databaseUrl, version));
      } },
      migrationVersion: schemaCompatibilityDeclarations.migration.maximumVersion,
    });
    // Custom seed seams are test-only. Production reconnects and checks target
    // identity on the exact session that performs the first insert.
    if (dependencies.seedDatabase) {
      await assertLiveTargetIdentity(databaseUrl, resolvedIdentity, dependencies.resolveTargetIdentity);
      await dependencies.seedDatabase(databaseUrl);
    } else {
      await runDisposableDatabaseSeed(databaseUrl, childEnvironment);
    }
  };
  await (dependencies.withReleaseLock ?? withResetReleaseLock)(databaseUrl, resolvedIdentity, execute);
}

async function assertLiveTargetIdentity(databaseUrl: string, expectedIdentity: string, resolver?: (databaseUrl: string) => Promise<string>): Promise<void> {
  if (resolver) {
    if (await resolver(databaseUrl) !== expectedIdentity) throw new Error("Refusing destructive reset because the resolved target does not match the operator confirmation.");
    return;
  }
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    if (await resolveDatabaseTargetIdentity(sql) !== expectedIdentity) throw new Error("Refusing destructive reset because the resolved target does not match the operator confirmation.");
  } finally { await sql.end(); }
}

async function migrateDisposableTarget(databaseUrl: string, expectedIdentity: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    if (await resolveDatabaseTargetIdentity(sql) !== expectedIdentity) throw new Error("Refusing destructive reset because the resolved target does not match the operator confirmation.");
    await migrate(drizzle(sql), { migrationsFolder: "drizzle/migrations" });
  } finally {
    await sql.end();
  }
}

async function withResetReleaseLock(databaseUrl: string, expectedIdentity: string, action: () => Promise<void>): Promise<void> {
  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.pathname = "/postgres";
  const sql = postgres(maintenanceUrl.toString(), { max: 1 });
  let locked = false;
  try {
    await assertMaintenanceTargetIdentity(sql, expectedIdentity);
    await sql`select pg_advisory_lock(${releaseLock})`;
    locked = true;
    await action();
  } finally {
    if (locked) await sql`select pg_advisory_unlock(${releaseLock})`.catch(() => undefined);
    await sql.end();
  }
}

async function resolveTargetIdentity(databaseUrl: string): Promise<string> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    return await resolveDatabaseTargetIdentity(sql);
  } finally {
    await sql.end();
  }
}

async function recordSchemaVersion(databaseUrl: string, version: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.begin(async (transaction) => {
      // The maintenance session already holds the reset lifecycle lock. Taking
      // it again on this separate writer session would self-deadlock.
      await transaction`delete from release_schema_versions`;
      await transaction`insert into release_schema_versions (version) values (${version})`;
    });
  } finally {
    await sql.end();
  }
}

async function main() {
  await runDisposableDatabaseReset(getDatabaseUrl());
}

if (process.argv[1]?.endsWith("db-reset.ts")) {
  main().catch(() => {
    console.error("Database reset failed before completion.");
    process.exitCode = 1;
  });
}
