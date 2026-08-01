import { describe, expect, it } from "vitest";

import { admitsSchemaReleaseGate, admitsSchemaReleasePhasePolicy, parseSchemaReleaseMatrix } from "@xuyenviet/contracts";
import { isPathContainedBy, readApprovedReleasePhasePolicy, readReleaseMatrixArtifact, readReleaseMatrixArtifactWithDigest, resolveReleaseMatrixPath } from "../scripts/schema-release-matrix";

describe("schema release matrix artifacts", () => {
  it("recognizes only paths contained by the checked-in matrix directory", () => {
    expect(isPathContainedBy("/repo/docs/release-matrices", "/repo/docs/release-matrices/20260728-1.json")).toBe(true);
    expect(isPathContainedBy("/repo/docs/release-matrices", "/repo/docs/other.json")).toBe(false);
  });

  it("rejects absolute paths, traversal, and non-JSON artifacts", () => {
    expect(() => resolveReleaseMatrixPath("/tmp/matrix.json")).toThrow("release input invalid");
    expect(() => resolveReleaseMatrixPath("../runbooks/schema-release-matrix.md")).toThrow("release input invalid");
    expect(() => resolveReleaseMatrixPath("README.md")).toThrow("release input invalid");
  });

  it("rejects the checked-in template until an operator supplies actual approval evidence", () => {
    const matrix = readReleaseMatrixArtifact("20260728.1-to-20260729.1.json");
    expect(matrix).toMatchObject({ approval: { approved: false }, activeOwnerInventory: { attested: false, owners: [] } });
    expect(parseSchemaReleaseMatrix(matrix)).toBeNull();
    expect(admitsSchemaReleaseGate({
      disposition: "expand_migrate_contract", matrix, phase: "migrate", migrationVersion: "20260729.1",
      persistedRows: [{ version: "20260728.1" }], target: {
        environment: "staging", identityClass: "durable",
        resolvedIdentity: "database=operator_supplied_release_target;host=release-target.invalid;port=5432",
      },
    })).toBe(false);
  });

  it("accepts only a policy bound to the checked-in approval and fails closed after overlap without one", () => {
    const { matrix, digest } = readReleaseMatrixArtifactWithDigest("20260728.1-to-20260729.1.json");
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(readApprovedReleasePhasePolicy(JSON.stringify({ releaseId: "schema-20260728.1-to-20260729.1", matrixPath: "20260728.1-to-20260729.1.json", matrixDigest: digest, target: (matrix as { target: unknown }).target, phase: "migrate", workloads: (matrix as { phases: { migrate: { workloads: unknown } } }).phases.migrate.workloads }))).toBeNull();
    expect(admitsSchemaReleasePhasePolicy(undefined, "web", [{ version: "20260728.1" }])).toBe(true);
    expect(admitsSchemaReleasePhasePolicy(undefined, "web", [{ version: "20260729.1" }])).toBe(false);
  });

  it("records the admin migrations and owner as isolated-test-only evidence", () => {
    const matrix = readReleaseMatrixArtifact("20260728.1-to-20260729.1-database-url-test.json") as {
      target: { environment: string }; activeOwnerInventory: { owners: Array<{ id: string; workload?: string; deploymentEvidence: string }> };
      migrationPlan: { pending: Array<{ id: string; digest: string }> }; verification: string[];
    };
    expect(matrix.target.environment).toBe("test");
    expect(matrix.activeOwnerInventory.owners).toContainEqual(expect.objectContaining({ id: "admin-expanded", workload: "admin" }));
    expect(matrix.migrationPlan.pending).toEqual(expect.arrayContaining([
      { id: "0022_admin_oauth_transactions", digest: "1c68335f936d02df7cc71596d16e8e73ac4eebd193195a9025a6be508efea84f" },
      { id: "0023_separate_admin_sessions", digest: "74af35894fe545dd68e10f9ea0a9db34e3e575da7e5a40bc67f0fdb683a7eee6" },
      { id: "0024_hash_admin_session_lookup", digest: "ce58d64c36975e2d4af84b1e88daaff1c410609903c014beb83cbc91cf9d5a9d" },
    ]));
    expect(matrix.verification.join(" ")).toContain("not staging approval");
  });
});
