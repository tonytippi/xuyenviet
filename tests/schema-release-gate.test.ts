import { describe, expect, it, vi } from "vitest";

import { assertDisposableLocalDatabaseUrl } from "../scripts/db-env";
import { runDisposableDatabaseReset } from "../scripts/db-reset";
import { runApiSchemaMigration } from "../scripts/migrate-api-schema-runner";

describe("database operations", () => {
  it("runs forward migration under the supplied lock", async () => {
    const steps: string[] = [];
    await runApiSchemaMigration({
      acquireMigrationLock: async () => { steps.push("lock"); },
      preflight: async () => { steps.push("preflight"); },
      runDrizzleMigration: async () => { steps.push("drizzle"); },
      releaseMigrationLock: async () => { steps.push("unlock"); },
    });
    expect(steps).toEqual(["lock", "preflight", "drizzle", "unlock"]);
  });

  it("does not migrate when preflight fails", async () => {
    const drizzle = vi.fn(async () => undefined);
    await expect(runApiSchemaMigration({ acquireMigrationLock: async () => undefined, releaseMigrationLock: async () => undefined, preflight: async () => { throw new Error("target changed"); }, runDrizzleMigration: drizzle })).rejects.toThrow("target changed");
    expect(drizzle).not.toHaveBeenCalled();
  });

  it("requires explicit local reset confirmation", () => {
    expect(() => assertDisposableLocalDatabaseUrl("postgresql://user:password@localhost/xuyenviet_test", { APP_ENV: "local" })).toThrow("explicit disposable-target");
  });

  it("seeds only after a successful disposable migration", async () => {
    const steps: string[] = [];
    const url = "postgresql://user:password@localhost/xuyenviet_test";
    const environment = { APP_ENV: "local", DATABASE_URL: url, DB_RESET_DISPOSABLE_CONFIRMATION: "confirm-disposable-reset", DB_RESET_NO_RUNTIME_OVERLAP: "confirm-no-runtime-overlap", DB_RESET_EXPECTED_TARGET_IDENTITY: "database=xuyenviet_test;host=127.0.0.1;port=5432" };
    await runDisposableDatabaseReset(url, environment, {
      recreateDatabase: async () => { steps.push("recreate"); },
      resolveTargetIdentity: async () => environment.DB_RESET_EXPECTED_TARGET_IDENTITY,
      run: async () => { steps.push("migrate"); },
      seedDatabase: async () => { steps.push("seed"); },
      withReleaseLock: async (_url, _identity, action) => action(),
    });
    expect(steps).toEqual(["recreate", "migrate", "seed"]);
  });
});
