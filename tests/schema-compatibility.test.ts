import { describe, expect, it, vi } from "vitest";

import { compareSchemaVersions, createSchemaCompatibilityConsumer, futureAdminSchemaCompatibilityConsumer, isSchemaCompatible, parseSchemaVersion, schemaCompatibilityDeclarations } from "@xuyenviet/contracts";
import { createPostgresReleaseSchemaVersionRepository } from "@xuyenviet/database";
import { releaseSchemaVersions } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";
import { runApiSchemaMigration } from "../scripts/migrate-api-schema-runner";

describe("schema compatibility contract", () => {
  it("compares date/revision tuples numerically and inclusively", () => {
    const later = parseSchemaVersion("20260728.10");
    const earlier = parseSchemaVersion("20260728.2");
    expect(later).not.toBeNull();
    expect(earlier).not.toBeNull();
    expect(compareSchemaVersions(later!, earlier!)).toBeGreaterThan(0);
    const declaration = { workload: "worker" as const, minimumVersion: "20260728.2", maximumVersion: "20260728.10" };
    expect(isSchemaCompatible(declaration, "20260728.2")).toBe(true);
    expect(isSchemaCompatible(declaration, "20260728.10")).toBe(true);
    expect(isSchemaCompatible(declaration, "20260728.11")).toBe(false);
  });

  it("fails closed for malformed versions, inverted ranges, and unknown workloads", () => {
    for (const version of ["00010229.1", "00990229.1", "20260229.1", "20261301.1", "20260728.01", "20260728.-1", "2026728.1"]) expect(parseSchemaVersion(version)).toBeNull();
    expect(parseSchemaVersion("00010228.999999999999999999999999999999")).toMatchObject({ year: 1, month: 2, day: 28, revision: BigInt("999999999999999999999999999999") });
    expect(isSchemaCompatible({ workload: "api", minimumVersion: "20260729.1", maximumVersion: "20260728.1" }, "20260728.1")).toBe(false);
    expect(isSchemaCompatible({ workload: "unknown" as "api", minimumVersion: "20260728.1", maximumVersion: "20260728.1" }, "20260728.1")).toBe(false);
  });

  it("provides the same declared release contract for every deployable boundary", () => {
    for (const workload of ["web", "api", "worker", "migration", "admin"] as const) {
      expect(isSchemaCompatible(schemaCompatibilityDeclarations[workload], "20260728.1")).toBe(true);
    }
    const web = createSchemaCompatibilityConsumer(schemaCompatibilityDeclarations.web);
    expect(web.admits([{ version: "20260728.1" }])).toBe(true);
    expect(web.admits([])).toBe(false);
    expect(web.admits([{ version: "bad" }])).toBe(false);
    expect(web.admits([{ version: "20260728.1" }, { version: "20260728.1" }])).toBe(false);
    expect(futureAdminSchemaCompatibilityConsumer.admits([{ version: "20260728.1" }])).toBe(true);
    expect(futureAdminSchemaCompatibilityConsumer.admits([{ version: "20260729.1" }])).toBe(false);
  });

  it.runIf(Boolean(process.env.DATABASE_URL_TEST))("fails closed unless PostgreSQL has exactly one compatible release record", async () => {
    await resetTestDatabase();
    const repository = createPostgresReleaseSchemaVersionRepository(process.env.DATABASE_URL_TEST!);
    await expect(repository.hasCompatibleSchemaVersion(schemaCompatibilityDeclarations.api)).resolves.toBe(false);
    await testDb.insert(releaseSchemaVersions).values({ version: schemaCompatibilityDeclarations.api.maximumVersion });
    await expect(repository.hasCompatibleSchemaVersion(schemaCompatibilityDeclarations.api)).resolves.toBe(true);
    await testDb.insert(releaseSchemaVersions).values({ version: "20260729.1" });
    await expect(repository.hasCompatibleSchemaVersion(schemaCompatibilityDeclarations.api)).resolves.toBe(false);
    await repository.close?.();
  });

  it.runIf(Boolean(process.env.DATABASE_URL_TEST))("does not record a release until Drizzle succeeds", async () => {
    await resetTestDatabase();
    await testDb.insert(releaseSchemaVersions).values({ version: "20260727.1" });
    const repository = createPostgresReleaseSchemaVersionRepository(process.env.DATABASE_URL_TEST!);
    const acquireMigrationLock = vi.fn(async () => undefined);
    const releaseMigrationLock = vi.fn(async () => undefined);
    try {
      await expect(runApiSchemaMigration({
        acquireMigrationLock,
        releaseMigrationLock,
        runDrizzleMigration: async () => { throw new Error("simulated Drizzle failure"); },
        releaseSchemaVersions: repository,
        migrationVersion: schemaCompatibilityDeclarations.migration.maximumVersion,
      })).rejects.toThrow("simulated Drizzle failure");
      await expect(testDb.select().from(releaseSchemaVersions)).resolves.toMatchObject([{ version: "20260727.1" }]);

      let drizzleCompleted = false;
      const recordSchemaVersion = vi.fn(async (version: string) => {
        expect(drizzleCompleted).toBe(true);
        await repository.recordSchemaVersion(version);
      });
      await runApiSchemaMigration({
        acquireMigrationLock,
        releaseMigrationLock,
        runDrizzleMigration: async () => { drizzleCompleted = true; },
        releaseSchemaVersions: { recordSchemaVersion },
        migrationVersion: schemaCompatibilityDeclarations.migration.maximumVersion,
      });
      expect(recordSchemaVersion).toHaveBeenCalledOnce();
      await expect(testDb.select().from(releaseSchemaVersions)).resolves.toMatchObject([{ version: schemaCompatibilityDeclarations.migration.maximumVersion }]);
    } finally {
      await repository.close?.();
    }
  });
});
