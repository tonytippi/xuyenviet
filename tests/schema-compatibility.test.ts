import { describe, expect, it, vi } from "vitest";

import { admitsSchemaReleaseGate, compareSchemaVersions, createSchemaCompatibilityConsumer, isSchemaCompatible, parseSchemaReleaseMatrix, parseSchemaReleasePhasePolicy, parseSchemaVersion, schemaCompatibilityDeclarations, validatesSchemaReleasePhasePolicy, type SchemaReleaseMatrix } from "@xuyenviet/contracts";
import { createPostgresReleaseSchemaVersionRepository } from "@xuyenviet/database";
import { releaseSchemaVersions } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";
import { runApiSchemaMigration } from "../scripts/migrate-api-schema-runner";
import { isApiReady } from "../apps/api/src/release-schema";

const releaseMatrix: SchemaReleaseMatrix = {
  releaseId: "schema-20260729-1", disposition: "expand_migrate_contract",
  target: { environment: "staging", identityClass: "durable", resolvedIdentity: "database=xuyenviet;host=10.0.0.1;port=5432" }, approval: { approved: true, reference: "change-12-3" },
  currentVersion: "20260728.1", targetVersion: "20260729.1", operation: { phase: "migrate", durableRewrite: false }, persistentObjects: [{ name: "example", interpretation: "compatible expansion" }],
  phases: Object.fromEntries(["expand", "migrate", "contract"].map((phase) => [phase, { workloads: Object.fromEntries(["web", "api", "worker", "migration", "admin"].map((workload) => [workload, { workload, minimumVersion: phase === "contract" ? "20260729.1" : "20260728.1", maximumVersion: "20260729.1" }])) }])) as SchemaReleaseMatrix["phases"],
  activeOwnerInventory: { attested: true, owners: [
    ...(["web", "api", "worker", "migration"] as const).map((workload) => ({ id: `${workload}-expanded`, ownerType: "workload" as const, workload, role: "reader" as const, oldRepresentation: `${workload}-expand-20260729.1`, schemaVersion: "20260728.1", effectiveState: "active" as const, deploymentEvidence: `${workload} deployed`, declaration: { workload, minimumVersion: "20260728.1", maximumVersion: "20260729.1" } })),
    { id: "api-request-write", ownerType: "capability" as const, capability: "api.request-write", runtimeWorkload: "api" as const, role: "writer" as const, oldRepresentation: "api-request-write-expand-20260729.1", schemaVersion: "20260728.1", effectiveState: "active" as const, deploymentEvidence: "API request writer inventory attested", declaration: { workload: "api" as const, minimumVersion: "20260728.1", maximumVersion: "20260729.1" } },
  ] },
  expandEvidence: Object.fromEntries(["web", "api", "worker", "migration"].map((workload) => [`${workload}-expanded`, `${workload} expanded deployment verified`]).concat([["api-request-write", "API request writer expanded deployment verified"]])) as SchemaReleaseMatrix["expandEvidence"],
  rolloutOrder: ["web-expanded", "api-expanded", "worker-expanded", "migration-expanded", "api-request-write", "verify-expand", "migrate"], migrationJob: { version: "20260729.1", lock: "918_040_004" }, migrationPlan: { disposition: "forward_only", pending: [] },
  traffic: { writerOwnerId: "api-request-write", dualWrite: false, readOnlyShadow: false }, rollback: { legacyOwnerId: "api-request-write", legacyBinaryRelease: "api-request-write-expand-20260729.1" }, verification: ["schema admission verified"], contract: { oldOwners: ["web", "api", "worker", "migration"].map((workload) => ({ id: `${workload}-expanded`, oldRepresentation: `${workload}-expand-20260729.1`, schemaVersion: "20260728.1", retired: false })).concat([{ id: "api-request-write", oldRepresentation: "api-request-write-expand-20260729.1", schemaVersion: "20260728.1", retired: false }]), destructiveCleanup: false },
};

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
      expect(isSchemaCompatible(schemaCompatibilityDeclarations[workload], "20260729.1")).toBe(true);
    }
    const web = createSchemaCompatibilityConsumer(schemaCompatibilityDeclarations.web);
    expect(web.admits([{ version: "20260728.1" }])).toBe(true);
    expect(web.admits([{ version: "20260729.1" }])).toBe(true);
    expect(web.admits([])).toBe(false);
    expect(web.admits([{ version: "bad" }])).toBe(false);
    expect(web.admits([{ version: "20260728.1" }, { version: "20260728.1" }])).toBe(false);
  });

  it("fails API admission closed when its live database identity differs from the approved phase policy", async () => {
    const policy = { releaseId: "schema-20260729-1", matrixPath: "20260728.1-to-20260729.1.json", matrixDigest: "a".repeat(64), target: releaseMatrix.target, phase: "migrate" as const, workloads: releaseMatrix.phases.migrate.workloads };
    await expect(isApiReady({ configValid: true, releasePhasePolicy: policy, repository: {
      async hasCompatibleSchemaVersion() { return true; },
      async getResolvedTargetIdentity() { return "database=other;host=10.0.0.1;port=5432"; },
      async readSchemaAdmission() { return { rows: [{ version: "20260729.1" }], resolvedTargetIdentity: "database=other;host=10.0.0.1;port=5432" }; },
      async recordSchemaVersion() {},
    } })).resolves.toBe(false);
  });

  it("validates phase policy declarations independent of JSON object key order", () => {
    const parsedMatrix = parseSchemaReleaseMatrix(releaseMatrix)!;
    const reversedWorkloads = Object.fromEntries(
      Object.entries(parsedMatrix.phases.migrate.workloads).reverse(),
    );
    const policy = parseSchemaReleasePhasePolicy({
      target: parsedMatrix.target,
      workloads: reversedWorkloads,
      phase: "migrate",
      matrixDigest: "a".repeat(64),
      matrixPath: "20260728.1-to-20260729.1.json",
      releaseId: parsedMatrix.releaseId,
    });

    expect(policy).not.toBeNull();
    expect(validatesSchemaReleasePhasePolicy(policy, parsedMatrix, "a".repeat(64))).toBe(true);

    const alteredPolicy = structuredClone(policy!);
    alteredPolicy.workloads.api.minimumVersion = "20260729.1";
    expect(validatesSchemaReleasePhasePolicy(alteredPolicy, parsedMatrix, "a".repeat(64))).toBe(false);
  });

  it("validates an approved overlap matrix and admits only its pre-migration release", () => {
    expect(parseSchemaReleaseMatrix(releaseMatrix)).toEqual(releaseMatrix);
    expect(parseSchemaReleaseMatrix({ ...releaseMatrix, operation: { phase: "expand", durableRewrite: false } })).not.toBeNull();
    const historicalExpand = structuredClone(releaseMatrix);
    historicalExpand.phases.expand.workloads.web.minimumVersion = "20260727.1";
    expect(parseSchemaReleaseMatrix(historicalExpand)).not.toBeNull();
    const parsed = parseSchemaReleaseMatrix(releaseMatrix)!;
    expect(parsed.activeOwnerInventory.owners.some((owner) => owner.ownerType === "capability" && owner.capability === "api.request-write")).toBe(true);
    expect(parsed.activeOwnerInventory.owners.some((owner) => owner.ownerType === "workload" && owner.workload === "admin")).toBe(false);
    const target = releaseMatrix.target;
    expect(admitsSchemaReleaseGate({ disposition: "expand_migrate_contract", matrix: releaseMatrix, phase: "migrate", migrationVersion: "20260729.1", persistedRows: [{ version: "20260728.1" }], target })).toBe(true);
    expect(admitsSchemaReleaseGate({ disposition: "clean_break_disposable", matrix: releaseMatrix, phase: "migrate", migrationVersion: "20260729.1", persistedRows: [{ version: "20260728.1" }], target })).toBe(false);
    expect(admitsSchemaReleaseGate({ disposition: "expand_migrate_contract", matrix: { ...releaseMatrix, approval: { approved: false } }, phase: "migrate", migrationVersion: "20260729.1", persistedRows: [{ version: "20260728.1" }], target })).toBe(false);
    expect(admitsSchemaReleaseGate({ disposition: "expand_migrate_contract", matrix: releaseMatrix, phase: "expand", migrationVersion: "20260729.1", persistedRows: [{ version: "20260728.1" }], target })).toBe(false);
    expect(admitsSchemaReleaseGate({ disposition: "expand_migrate_contract", matrix: releaseMatrix, phase: "migrate", migrationVersion: "20260729.1", persistedRows: [{ version: "20260728.1" }], target: { ...target, resolvedIdentity: "database=other;host=10.0.0.1;port=5432" } })).toBe(false);
  });

  it("rejects incomplete, unsafe, and infeasible matrix contracts", () => {
    const missingWorker = structuredClone(releaseMatrix) as Record<string, unknown>;
    const missingMigration = missingWorker.activeOwnerInventory as { owners: unknown[] };
    missingMigration.owners = missingMigration.owners.filter((owner) => (owner as { workload?: string }).workload !== "migration");
    expect(parseSchemaReleaseMatrix(missingWorker)).toBeNull();

    const unattestedInventory = structuredClone(releaseMatrix);
    (unattestedInventory.activeOwnerInventory as { attested: boolean }).attested = false;
    expect(parseSchemaReleaseMatrix(unattestedInventory)).toBeNull();

    const unsafeCleanup = structuredClone(releaseMatrix);
    unsafeCleanup.contract.destructiveCleanup = true;
    unsafeCleanup.contract.oldOwners = [];
    expect(parseSchemaReleaseMatrix(unsafeCleanup)).toBeNull();

    const omittedOldOwner = structuredClone(releaseMatrix);
    omittedOldOwner.contract.oldOwners.pop();
    expect(parseSchemaReleaseMatrix(omittedOldOwner)).toBeNull();

    const incompleteRetirement = structuredClone(releaseMatrix);
    incompleteRetirement.contract.destructiveCleanup = true;
    incompleteRetirement.contract.oldOwners.pop();
    expect(parseSchemaReleaseMatrix(incompleteRetirement)).toBeNull();

    const duplicateOldOwner = structuredClone(releaseMatrix);
    duplicateOldOwner.contract.oldOwners[1]!.id = "web-expanded";
    expect(parseSchemaReleaseMatrix(duplicateOldOwner)).toBeNull();

    const mismatchedOldOwner = structuredClone(releaseMatrix);
    mismatchedOldOwner.contract.oldOwners[0]!.oldRepresentation = "web-20260728.1";
    expect(parseSchemaReleaseMatrix(mismatchedOldOwner)).toBeNull();

    const mismatchedOldSchema = structuredClone(releaseMatrix);
    mismatchedOldSchema.contract.oldOwners[0]!.schemaVersion = "20260729.1";
    expect(parseSchemaReleaseMatrix(mismatchedOldSchema)).toBeNull();

    const badOrder = structuredClone(releaseMatrix);
    badOrder.rolloutOrder = ["web-expanded", "api-expanded", "worker-expanded", "migration-expanded", "api-request-write", "migrate", "verify-expand"];
    expect(parseSchemaReleaseMatrix(badOrder)).toBeNull();

    const missingExpandEvidence = structuredClone(releaseMatrix);
    delete (missingExpandEvidence.expandEvidence as Record<string, string>)["worker-expanded"];
    expect(parseSchemaReleaseMatrix(missingExpandEvidence)).toBeNull();

    const infeasibleMigration = structuredClone(releaseMatrix);
    infeasibleMigration.phases.migrate.workloads.migration.minimumVersion = "20260727.1";
    expect(parseSchemaReleaseMatrix(infeasibleMigration)).toBeNull();

    const unsafeRollback = structuredClone(releaseMatrix);
    unsafeRollback.rollback.legacyBinaryRelease = "api-20260726.1";
    expect(parseSchemaReleaseMatrix(unsafeRollback)).toBeNull();

    const legacyIncompatible = structuredClone(releaseMatrix);
    legacyIncompatible.activeOwnerInventory.owners[4]!.declaration.maximumVersion = "20260728.1";
    expect(parseSchemaReleaseMatrix(legacyIncompatible)).toBeNull();

    const originalNarrowBinary = structuredClone(releaseMatrix);
    originalNarrowBinary.activeOwnerInventory.owners[4]!.oldRepresentation = "api-20260728.1";
    originalNarrowBinary.activeOwnerInventory.owners[4]!.declaration.maximumVersion = "20260728.1";
    expect(parseSchemaReleaseMatrix(originalNarrowBinary)).toBeNull();

    const reversedOverlap = structuredClone(releaseMatrix);
    reversedOverlap.activeOwnerInventory.owners[4]!.schemaVersion = "20260729.1";
    expect(parseSchemaReleaseMatrix(reversedOverlap)).toBeNull();

    const unrelatedOverlap = structuredClone(releaseMatrix);
    unrelatedOverlap.activeOwnerInventory.owners[4]!.schemaVersion = "20260730.1";
    expect(parseSchemaReleaseMatrix(unrelatedOverlap)).toBeNull();

    const incompleteRewrite = structuredClone(releaseMatrix) as Record<string, unknown>;
    (incompleteRewrite.operation as { durableRewrite: boolean }).durableRewrite = true;
    incompleteRewrite.dataRewrite = { approvedRunbook: "runbook", idempotent: true, batchingAndResumption: true, validation: "validated", failureHandling: "handled" };
    expect(parseSchemaReleaseMatrix(incompleteRewrite)).toBeNull();

    const undeclaredCapabilityRuntime = structuredClone(releaseMatrix);
    delete (undeclaredCapabilityRuntime.activeOwnerInventory.owners[4] as { runtimeWorkload?: string }).runtimeWorkload;
    expect(parseSchemaReleaseMatrix(undeclaredCapabilityRuntime)).toBeNull();

    const mismatchedCapabilityRuntime = structuredClone(releaseMatrix);
    mismatchedCapabilityRuntime.activeOwnerInventory.owners[4]!.declaration.workload = "worker";
    expect(parseSchemaReleaseMatrix(mismatchedCapabilityRuntime)).toBeNull();

    const dualWriter = structuredClone(releaseMatrix) as unknown as { traffic: { dualWrite: boolean } };
    dualWriter.traffic.dualWrite = true;
    expect(parseSchemaReleaseMatrix(dualWriter)).toBeNull();

    const unboundWriter = structuredClone(releaseMatrix) as unknown as { traffic: { writerOwnerId: string } };
    unboundWriter.traffic.writerOwnerId = "not-in-inventory";
    expect(parseSchemaReleaseMatrix(unboundWriter)).toBeNull();

    const unboundRollback = structuredClone(releaseMatrix) as unknown as { rollback: { legacyOwnerId: string } };
    unboundRollback.rollback.legacyOwnerId = "not-in-inventory";
    expect(parseSchemaReleaseMatrix(unboundRollback)).toBeNull();

    const migrationWriter = structuredClone(releaseMatrix);
    migrationWriter.activeOwnerInventory.owners[3]!.role = "writer";
    migrationWriter.activeOwnerInventory.owners[4]!.role = "reader";
    migrationWriter.traffic.writerOwnerId = "migration-expanded";
    expect(parseSchemaReleaseMatrix(migrationWriter)).toBeNull();

    const migrationRollback = structuredClone(releaseMatrix);
    migrationRollback.rollback.legacyOwnerId = "migration-expanded";
    migrationRollback.rollback.legacyBinaryRelease = "migration-expand-20260729.1";
    expect(parseSchemaReleaseMatrix(migrationRollback)).toBeNull();

    const readerWriter = structuredClone(releaseMatrix);
    readerWriter.traffic.writerOwnerId = "api-expanded";
    expect(parseSchemaReleaseMatrix(readerWriter)).toBeNull();

    const deployableWriter = structuredClone(releaseMatrix);
    deployableWriter.activeOwnerInventory.owners[4]!.effectiveState = "deployable";
    expect(parseSchemaReleaseMatrix(deployableWriter)).toBeNull();

    const multipleWriters = structuredClone(releaseMatrix);
    multipleWriters.activeOwnerInventory.owners[1]!.role = "writer";
    expect(parseSchemaReleaseMatrix(multipleWriters)).toBeNull();

    const workerWriter = structuredClone(releaseMatrix);
    workerWriter.activeOwnerInventory.owners[2]!.role = "writer";
    workerWriter.activeOwnerInventory.owners[4]!.role = "reader";
    workerWriter.traffic.writerOwnerId = "worker-expanded";
    workerWriter.rollback.legacyOwnerId = "worker-expanded";
    workerWriter.rollback.legacyBinaryRelease = "worker-expand-20260729.1";
    expect(parseSchemaReleaseMatrix(workerWriter)).toBeNull();

    const readerRollback = structuredClone(releaseMatrix);
    readerRollback.rollback.legacyOwnerId = "api-expanded";
    readerRollback.rollback.legacyBinaryRelease = "api-expand-20260729.1";
    expect(parseSchemaReleaseMatrix(readerRollback)).toBeNull();

    const contractOperation = structuredClone(releaseMatrix);
    (contractOperation.operation as { phase: string }).phase = "contract";
    expect(parseSchemaReleaseMatrix(contractOperation)).toEqual(contractOperation);
    expect(admitsSchemaReleaseGate({ disposition: "expand_migrate_contract", matrix: contractOperation, phase: "migrate", migrationVersion: "20260729.1", persistedRows: [{ version: "20260728.1" }], target: releaseMatrix.target })).toBe(false);

    const destructiveContract = structuredClone(releaseMatrix);
    destructiveContract.contract.destructiveCleanup = true;
    destructiveContract.contract.cleanupConstraints = { expandedSchemaRetainedUntilRetirement: true, noDestructiveRollback: true, forwardOnly: true };
    expect(admitsSchemaReleaseGate({ disposition: "expand_migrate_contract", matrix: destructiveContract, phase: "migrate", migrationVersion: "20260729.1", persistedRows: [{ version: "20260728.1" }], target: releaseMatrix.target })).toBe(false);

    const completeContract = structuredClone(releaseMatrix);
    completeContract.operation.phase = "contract";
    completeContract.contract.destructiveCleanup = true;
    completeContract.contract.oldOwners = completeContract.contract.oldOwners.map((owner) => ({ ...owner, retired: true, retirementEvidence: "retirement verified" }));
    completeContract.contract.cleanupConstraints = { expandedSchemaRetainedUntilRetirement: true, noDestructiveRollback: true, forwardOnly: true };
    expect(parseSchemaReleaseMatrix(completeContract)).toEqual(completeContract);
    expect(admitsSchemaReleaseGate({ disposition: "expand_migrate_contract", matrix: completeContract, phase: "migrate", migrationVersion: "20260729.1", persistedRows: [{ version: "20260728.1" }], target: releaseMatrix.target })).toBe(false);
  });

  it.runIf(Boolean(process.env.DATABASE_URL_TEST))("fails closed unless PostgreSQL has exactly one compatible release record", async () => {
    await resetTestDatabase();
    const repository = createPostgresReleaseSchemaVersionRepository(process.env.DATABASE_URL_TEST!);
    await expect(repository.hasCompatibleSchemaVersion(schemaCompatibilityDeclarations.api)).resolves.toBe(false);
    await testDb.insert(releaseSchemaVersions).values({ version: schemaCompatibilityDeclarations.api.maximumVersion });
    await expect(repository.hasCompatibleSchemaVersion(schemaCompatibilityDeclarations.api)).resolves.toBe(true);
    await testDb.insert(releaseSchemaVersions).values({ version: "20260730.1" });
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
        preflight: async () => undefined,
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
        preflight: async () => undefined,
      });
      expect(recordSchemaVersion).toHaveBeenCalledOnce();
      await expect(testDb.select().from(releaseSchemaVersions)).resolves.toMatchObject([{ version: schemaCompatibilityDeclarations.migration.maximumVersion }]);
    } finally {
      await repository.close?.();
    }
  });

  describe.sequential("PostgreSQL-backed release gate runner", () => {
    const attempts: Array<{ runDrizzleMigration: ReturnType<typeof vi.fn>; recordSchemaVersion: ReturnType<typeof vi.fn> }> = [];

    async function runWithGate(matrix: unknown, target = releaseMatrix.target) {
      const repository = createPostgresReleaseSchemaVersionRepository(process.env.DATABASE_URL_TEST!);
      const runDrizzleMigration = vi.fn(async () => undefined);
      const recordSchemaVersion = vi.fn(repository.recordSchemaVersion.bind(repository));
      attempts.push({ runDrizzleMigration, recordSchemaVersion });
      try {
        await runApiSchemaMigration({
          acquireMigrationLock: async () => undefined,
          releaseMigrationLock: async () => undefined,
          runDrizzleMigration,
          releaseSchemaVersions: { recordSchemaVersion },
          migrationVersion: releaseMatrix.targetVersion,
          async preflight() {
            const rows = await testDb.select().from(releaseSchemaVersions);
            if (!admitsSchemaReleaseGate({ disposition: "expand_migrate_contract", matrix, phase: "migrate", migrationVersion: releaseMatrix.targetVersion, persistedRows: rows, target })) throw new Error("release gate rejected");
          },
        });
      } finally {
        await repository.close?.();
      }
      return { runDrizzleMigration, recordSchemaVersion };
    }

    it.runIf(Boolean(process.env.DATABASE_URL_TEST))("rejects invalid matrices, identities, and persisted records before Drizzle or release recording", async () => {
      for (const [matrix, target, persistedVersion] of [
        [{ ...releaseMatrix, approval: { approved: false } }, releaseMatrix.target, "20260728.1"],
        [releaseMatrix, { ...releaseMatrix.target, resolvedIdentity: "database=other;host=10.0.0.1;port=5432" }, "20260728.1"],
        [releaseMatrix, releaseMatrix.target, "20260727.1"],
      ] as const) {
        await resetTestDatabase();
        await testDb.insert(releaseSchemaVersions).values({ version: persistedVersion });
        await expect(runWithGate(matrix, target)).rejects.toThrow("release gate rejected");
        expect(attempts.at(-1)?.runDrizzleMigration).not.toHaveBeenCalled();
        expect(attempts.at(-1)?.recordSchemaVersion).not.toHaveBeenCalled();
        await expect(testDb.select().from(releaseSchemaVersions)).resolves.toMatchObject([{ version: persistedVersion }]);
      }
    });

    it.runIf(Boolean(process.env.DATABASE_URL_TEST))("runs Drizzle before replacing the one persisted target version after a valid gate", async () => {
      await resetTestDatabase();
      await testDb.insert(releaseSchemaVersions).values({ version: releaseMatrix.currentVersion });
      const result = await runWithGate(releaseMatrix);
      expect(result.runDrizzleMigration).toHaveBeenCalledOnce();
      expect(result.recordSchemaVersion).toHaveBeenCalledOnce();
      await expect(testDb.select().from(releaseSchemaVersions)).resolves.toMatchObject([{ version: releaseMatrix.targetVersion }]);
    });
  });
});
