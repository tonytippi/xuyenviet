import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { assertDisposableLocalDatabaseUrl } from "../scripts/db-env";
import { assertMaintenanceTargetIdentity, databaseNameForReset, runDisposableDatabaseReset } from "../scripts/db-reset";
import { runDisposableDatabaseSeed, seedVerifiedConnection } from "../scripts/db-seed";
import { runApiSchemaMigration } from "../scripts/migrate-api-schema-runner";
import { withTargetMigrationLock } from "../scripts/migrate-api-schema";
import { getTestDatabaseUrl } from "./helpers/env-file";

const sensitiveReleaseInput = {
  url: "postgresql://operator:super-secret-password@db.internal:5432/customer_production",
  sql: "drop database customer_production",
  matrix: '{"approval":"top-secret-matrix"}',
  identity: "database=customer_production;host=10.44.0.8;port=5432",
};

function runCli(script: "db:migrate" | "db:reset" | "db:seed", environment: Record<string, string | undefined>) {
  const result = spawnSync("pnpm", [script], {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, ...environment },
    encoding: "utf8",
    timeout: 15_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function expectGenericFailureOutput(output: string) {
  expect(output).toContain("failed");
  for (const value of Object.values(sensitiveReleaseInput)) expect(output).not.toContain(value);
}

describe("schema release gates", () => {
  const noOpTestLock = async (_url: string, _identity: string, action: () => Promise<void>) => action();
  it("rejects destructive reset without each explicit local confirmation", () => {
    const url = "postgresql://user:password@localhost:5432/xuyenviet_test";
    expect(() => assertDisposableLocalDatabaseUrl(url, { APP_ENV: "local" })).toThrow("explicit disposable-target");
    const confirmation = { APP_ENV: "local", DB_RESET_DISPOSABLE_CONFIRMATION: "confirm-disposable-reset", DB_RESET_NO_RUNTIME_OVERLAP: "confirm-no-runtime-overlap", DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=127.0.0.1;port=5432" };
    expect(() => assertDisposableLocalDatabaseUrl(url, confirmation)).not.toThrow();
    expect(() => assertDisposableLocalDatabaseUrl("postgresql://user:password@example.com/xuyenviet_test", confirmation)).toThrow("non-local");
    expect(() => assertDisposableLocalDatabaseUrl("postgresql://user:password@localhost/production", confirmation)).toThrow("protected");
    expect(() => assertDisposableLocalDatabaseUrl("postgresql://user:password@localhost/%70roduction", confirmation)).toThrow("protected");
    expect(() => assertDisposableLocalDatabaseUrl(url, { ...confirmation, APP_ENV: "staging" })).toThrow("explicitly local");
    expect(() => assertDisposableLocalDatabaseUrl(url, { ...confirmation, DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=10.0.0.1;port=5432" })).toThrow("explicit disposable-target");
  });

  it("runs neither Drizzle nor version recording when release preflight rejects", async () => {
    const runDrizzleMigration = vi.fn(async () => undefined);
    const recordSchemaVersion = vi.fn(async () => undefined);
    await expect(runApiSchemaMigration({
      acquireMigrationLock: async () => undefined, releaseMigrationLock: async () => undefined,
      preflight: async () => { throw new Error("release gate rejected"); }, runDrizzleMigration,
      releaseSchemaVersions: { recordSchemaVersion }, migrationVersion: "20260729.1",
    })).rejects.toThrow("release gate rejected");
    expect(runDrizzleMigration).not.toHaveBeenCalled();
    expect(recordSchemaVersion).not.toHaveBeenCalled();
  });

  it("runs the gate after the lock and preserves release-record sequencing", async () => {
    const steps: string[] = [];
    await runApiSchemaMigration({
      acquireMigrationLock: async () => { steps.push("lock"); },
      preflight: async () => { steps.push("preflight"); },
      runDrizzleMigration: async () => { steps.push("drizzle"); },
      releaseSchemaVersions: { recordSchemaVersion: async () => { steps.push("record"); } },
      migrationVersion: "20260728.1",
      releaseMigrationLock: async () => { steps.push("unlock"); },
    });
    expect(steps).toEqual(["lock", "preflight", "drizzle", "record", "unlock"]);
  });

  it("allows an approved fresh-target bootstrap to reach Drizzle before the release ledger exists", async () => {
    const steps: string[] = [];
    await runApiSchemaMigration({
      acquireMigrationLock: async () => { steps.push("lock"); },
      preflight: async () => { steps.push("preflight-no-ledger"); },
      runDrizzleMigration: async () => { steps.push("drizzle-creates-ledger"); },
      releaseSchemaVersions: { recordSchemaVersion: async () => { steps.push("record-after-ledger"); } },
      migrationVersion: "20260729.1",
      releaseMigrationLock: async () => { steps.push("unlock"); },
    });
    expect(steps).toEqual(["lock", "preflight-no-ledger", "drizzle-creates-ledger", "record-after-ledger", "unlock"]);
  });

  it("records the clean-break target after Drizzle and before seed", async () => {
    const steps: string[] = [];
    const databaseUrl = "postgresql://user:password@localhost/xuyenviet_test";
    const environment = { APP_ENV: "local", DATABASE_URL: databaseUrl, DB_RESET_DISPOSABLE_CONFIRMATION: "confirm-disposable-reset", DB_RESET_NO_RUNTIME_OVERLAP: "confirm-no-runtime-overlap", DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=127.0.0.1;port=5432" };
    await runDisposableDatabaseReset(databaseUrl, environment, {
      recreateDatabase: async () => { steps.push("recreate"); },
      resolveTargetIdentity: async () => environment.DB_RESET_EXPECTED_TARGET_IDENTITY,
      run: async () => { steps.push("drizzle"); },
      recordSchemaVersion: async (_url, version) => { steps.push(`record:${version}`); },
      seedDatabase: async () => { steps.push("seed"); },
      withReleaseLock: noOpTestLock,
    });
    expect(steps).toEqual(["recreate", "drizzle", "record:20260729.1", "seed"]);
  });

  it("does not record or seed a clean-break target when Drizzle fails", async () => {
    const recordSchemaVersion = vi.fn(async () => undefined);
    const seedDatabase = vi.fn(async () => undefined);
    const databaseUrl = "postgresql://user:password@localhost/xuyenviet_test";
    const environment = { APP_ENV: "local", DATABASE_URL: databaseUrl, DB_RESET_DISPOSABLE_CONFIRMATION: "confirm-disposable-reset", DB_RESET_NO_RUNTIME_OVERLAP: "confirm-no-runtime-overlap", DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=127.0.0.1;port=5432" };
    await expect(runDisposableDatabaseReset(databaseUrl, environment, {
      recreateDatabase: async () => undefined,
      resolveTargetIdentity: async () => environment.DB_RESET_EXPECTED_TARGET_IDENTITY,
      run: async () => { throw new Error("Drizzle failed"); },
      recordSchemaVersion,
      seedDatabase,
      withReleaseLock: noOpTestLock,
    })).rejects.toThrow("Drizzle failed");
    expect(recordSchemaVersion).not.toHaveBeenCalled();
    expect(seedDatabase).not.toHaveBeenCalled();
  });

  it("does not insert when the seed target changes after reset preflight", async () => {
    const seedDatabase = vi.fn(async () => undefined);
    const databaseUrl = "postgresql://user:password@localhost/xuyenviet_test";
    const environment = { APP_ENV: "local", DATABASE_URL: databaseUrl, DB_RESET_DISPOSABLE_CONFIRMATION: "confirm-disposable-reset", DB_RESET_NO_RUNTIME_OVERLAP: "confirm-no-runtime-overlap", DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=127.0.0.1;port=5432" };
    const resolveTargetIdentity = vi.fn()
      .mockResolvedValueOnce(environment.DB_RESET_EXPECTED_TARGET_IDENTITY)
      .mockResolvedValueOnce("database=other_test;host=127.0.0.1;port=5432");
    await expect(runDisposableDatabaseReset(databaseUrl, environment, {
      recreateDatabase: async () => undefined,
      resolveTargetIdentity,
      run: async () => undefined,
      recordSchemaVersion: async () => undefined,
      seedDatabase,
      withReleaseLock: noOpTestLock,
    })).rejects.toThrow("resolved target does not match");
    expect(seedDatabase).not.toHaveBeenCalled();
    expect(resolveTargetIdentity).toHaveBeenCalledTimes(2);
  });

  it("does not resolve, recreate, migrate, or seed when clean-break validation rejects", async () => {
    const recreateDatabase = vi.fn(async () => undefined);
    const run = vi.fn(async () => undefined);
    await expect(runDisposableDatabaseReset("postgresql://user:password@localhost/xuyenviet_test", { APP_ENV: "local" }, { recreateDatabase, run })).rejects.toThrow("explicit disposable-target");
    expect(recreateDatabase).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("does not open a direct seed connection without the disposable confirmation", async () => {
    await expect(runDisposableDatabaseSeed("postgresql://user:password@localhost/xuyenviet_test", { APP_ENV: "local" })).rejects.toThrow("explicit disposable-target");
  });

  it("does not insert when direct seed detects runtime overlap", async () => {
    await expect(runDisposableDatabaseSeed("postgresql://user:password@localhost/xuyenviet_test", { APP_ENV: "local", DB_RESET_DISPOSABLE_CONFIRMATION: "confirm-disposable-reset", DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=127.0.0.1;port=5432" })).rejects.toThrow("explicit disposable-target");
  });

  it("verifies the expected identity on the seed writer connection before inserts", async () => {
    const unsafe = vi.fn(async () => [{ identity: "database=other_test;host=127.0.0.1;port=5432" }]);
    const seed = vi.fn(async () => undefined);
    await expect(seedVerifiedConnection({ unsafe } as never, "database=xuyenviet_test;host=127.0.0.1;port=5432", seed)).rejects.toThrow("resolved target does not match");
    expect(seed).not.toHaveBeenCalled();
  });

  it("binds reset and every child process to the operator-confirmed resolved target", async () => {
    const recreateDatabase = vi.fn(async () => undefined);
    const childEnvironments: Array<Record<string, string | undefined>> = [];
    const run = vi.fn(async (_command: string, _args: string[], childEnvironment: Record<string, string | undefined>) => { childEnvironments.push(childEnvironment); });
    const seedDatabase = vi.fn(async () => undefined);
    const resolveTargetIdentity = vi.fn(async () => "database=xuyenviet_test;host=127.0.0.1;port=5432");
    const databaseUrl = "postgresql://user:password@localhost/xuyenviet_test";
    const environment = { APP_ENV: "local", DATABASE_URL: databaseUrl, DB_RESET_DISPOSABLE_CONFIRMATION: "confirm-disposable-reset", DB_RESET_NO_RUNTIME_OVERLAP: "confirm-no-runtime-overlap", DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=127.0.0.1;port=5432" };
    await runDisposableDatabaseReset(databaseUrl, environment, { recreateDatabase, run, resolveTargetIdentity, seedDatabase, recordSchemaVersion: async () => undefined, withReleaseLock: noOpTestLock });
    expect(recreateDatabase).toHaveBeenCalledWith(databaseUrl, environment.DB_RESET_EXPECTED_TARGET_IDENTITY);
    expect(run).toHaveBeenCalledTimes(1);
    expect(seedDatabase).toHaveBeenCalledWith(databaseUrl);
    expect(resolveTargetIdentity).toHaveBeenCalledTimes(4);
    expect(childEnvironments.every((childEnvironment) => childEnvironment.DATABASE_URL === databaseUrl)).toBe(true);
  });

  it("rejects supplied URL mismatch and resolved or encoded protected identities before mutation", async () => {
    const recreateDatabase = vi.fn(async () => undefined);
    const run = vi.fn(async () => undefined);
    const databaseUrl = "postgresql://user:password@localhost/xuyenviet_test";
    const environment = { APP_ENV: "local", DATABASE_URL: "postgresql://user:password@localhost/other_test", DB_RESET_DISPOSABLE_CONFIRMATION: "confirm-disposable-reset", DB_RESET_NO_RUNTIME_OVERLAP: "confirm-no-runtime-overlap", DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=127.0.0.1;port=5432" };
    await expect(runDisposableDatabaseReset(databaseUrl, environment, { recreateDatabase, run, resolveTargetIdentity: async () => "database=xuyenviet_test;host=127.0.0.1;port=5432" })).rejects.toThrow("differs");
    await expect(runDisposableDatabaseReset(databaseUrl, { ...environment, DATABASE_URL: databaseUrl, DB_RESET_EXPECTED_TARGET_IDENTITY: "database=production;host=127.0.0.1;port=5432" }, { recreateDatabase, run, resolveTargetIdentity: async () => "database=production;host=127.0.0.1;port=5432" })).rejects.toThrow("protected");
    expect(recreateDatabase).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("rechecks the exact resolved target on the maintenance connection before mutation", async () => {
    const unsafe = vi.fn(async () => [{ identity: "database=postgres;host=10.0.0.1;port=5432" }]);
    await expect(assertMaintenanceTargetIdentity({ unsafe }, "database=xuyenviet_test;host=127.0.0.1;port=5432")).rejects.toThrow("maintenance target differs");
    expect(unsafe).toHaveBeenCalledOnce();
  });

  it("accepts only the canonical maintenance identity for the confirmed target server", async () => {
    const unsafe = vi.fn(async () => [{ identity: "database=postgres;host=127.0.0.1;port=5432" }]);
    await expect(assertMaintenanceTargetIdentity({ unsafe }, "database=xuyenviet_test;host=127.0.0.1;port=5432")).resolves.toBeUndefined();
  });

  it("uses the resolved canonical database name rather than an encoded URL pathname", () => {
    expect(databaseNameForReset("database=xuyenviet_test;host=127.0.0.1;port=5432")).toBe("xuyenviet_test");
    expect(databaseNameForReset("database=;host=127.0.0.1;port=5432")).toBe("");
  });

  it("rejects malformed or empty resolved identities before reset maintenance", async () => {
    const recreateDatabase = vi.fn(async () => undefined);
    const run = vi.fn(async () => undefined);
    const databaseUrl = "postgresql://user:password@localhost/xuyenviet%5Ftest";
    const environment = { APP_ENV: "local", DATABASE_URL: databaseUrl, DB_RESET_DISPOSABLE_CONFIRMATION: "confirm-disposable-reset", DB_RESET_NO_RUNTIME_OVERLAP: "confirm-no-runtime-overlap", DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=127.0.0.1;port=5432" };
    await expect(runDisposableDatabaseReset(databaseUrl, environment, { recreateDatabase, run, resolveTargetIdentity: async () => "database=;host=127.0.0.1;port=5432" })).rejects.toThrow("resolved target");
    expect(recreateDatabase).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("holds the reset lifecycle lock around recreate, migration record, and seed", async () => {
    const steps: string[] = [];
    const databaseUrl = "postgresql://user:password@localhost/xuyenviet_test";
    const environment = { APP_ENV: "local", DATABASE_URL: databaseUrl, DB_RESET_DISPOSABLE_CONFIRMATION: "confirm-disposable-reset", DB_RESET_NO_RUNTIME_OVERLAP: "confirm-no-runtime-overlap", DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=127.0.0.1;port=5432" };
    await runDisposableDatabaseReset(databaseUrl, environment, {
      resolveTargetIdentity: async () => environment.DB_RESET_EXPECTED_TARGET_IDENTITY,
      recreateDatabase: async () => { steps.push("recreate"); },
      run: async () => { steps.push("drizzle"); },
      recordSchemaVersion: async () => { steps.push("record"); },
      seedDatabase: async () => { steps.push("seed"); },
      withReleaseLock: async (_url, _identity, action) => { steps.push("lock"); await action(); steps.push("unlock"); },
    });
    expect(steps).toEqual(["lock", "recreate", "drizzle", "record", "seed", "unlock"]);
  });

  it.runIf(Boolean(process.env.DATABASE_URL_TEST))("serializes legacy and current migration runners in the target database lock namespace", async () => {
    const targetUrl = getTestDatabaseUrl();
    const legacyRunnerLock = postgres(targetUrl, { max: 1 });
    const currentRunnerLock = postgres(targetUrl, { max: 1 });
    const maintenanceUrl = new URL(targetUrl);
    maintenanceUrl.pathname = "/postgres";
    const maintenanceLock = postgres(maintenanceUrl.toString(), { max: 1 });
    try {
      await legacyRunnerLock`select pg_advisory_lock(918_040_004)`;
      let currentRunnerEntered = false;
      const currentRunner = withTargetMigrationLock(currentRunnerLock, async () => { currentRunnerEntered = true; });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(currentRunnerEntered).toBe(false);
      const [maintenanceAcquired] = await maintenanceLock<{ acquired: boolean }[]>`select pg_try_advisory_lock(918_040_004) as acquired`;
      expect(maintenanceAcquired?.acquired).toBe(true);
      await maintenanceLock`select pg_advisory_unlock(918_040_004)`;
      await legacyRunnerLock`select pg_advisory_unlock(918_040_004)`;
      await currentRunner;
      expect(currentRunnerEntered).toBe(true);
    } finally {
      await legacyRunnerLock.end();
      await currentRunnerLock.end();
      await maintenanceLock.end();
    }
  });

  it("keeps migration CLI rejection output generic at the preflight boundary", () => {
    const result = runCli("db:migrate", {
      DATABASE_URL: sensitiveReleaseInput.url,
      SCHEMA_RELEASE_MATRIX_PATH: sensitiveReleaseInput.matrix,
      APP_ENV: "staging",
      SCHEMA_RELEASE_TARGET_IDENTITY_CLASS: "durable",
      DB_RESET_EXPECTED_TARGET_IDENTITY: sensitiveReleaseInput.identity,
      RELEASE_SQL_NOTE: sensitiveReleaseInput.sql,
    });
    expect(result.status).not.toBe(0);
    expectGenericFailureOutput(result.output);
  });

  it("keeps reset CLI rejection output generic before any destructive work", () => {
    const result = runCli("db:reset", {
      DATABASE_URL: sensitiveReleaseInput.url,
      APP_ENV: "staging",
      DB_RESET_EXPECTED_TARGET_IDENTITY: sensitiveReleaseInput.identity,
      DB_RESET_DISPOSABLE_CONFIRMATION: sensitiveReleaseInput.matrix,
      DB_RESET_NO_RUNTIME_OVERLAP: sensitiveReleaseInput.sql,
    });
    expect(result.status).not.toBe(0);
    expectGenericFailureOutput(result.output);
  });

  it("keeps direct seed CLI rejection output generic before any insert", () => {
    const result = runCli("db:seed", { DATABASE_URL: sensitiveReleaseInput.url, APP_ENV: "staging", DB_RESET_EXPECTED_TARGET_IDENTITY: sensitiveReleaseInput.identity, DB_RESET_DISPOSABLE_CONFIRMATION: sensitiveReleaseInput.matrix, DB_RESET_NO_RUNTIME_OVERLAP: sensitiveReleaseInput.sql });
    expect(result.status).not.toBe(0);
    expectGenericFailureOutput(result.output);
  });
});
