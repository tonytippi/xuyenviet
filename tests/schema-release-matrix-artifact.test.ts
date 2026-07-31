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

  it("loads and admits the checked-in 20260728.1 to 20260729.1 repository approval template", () => {
    const matrix = readReleaseMatrixArtifact("20260728.1-to-20260729.1.json");
    const parsed = parseSchemaReleaseMatrix(matrix);
    expect(parsed).not.toBeNull();
    expect(admitsSchemaReleaseGate({
      disposition: "expand_migrate_contract", matrix, phase: "migrate", migrationVersion: "20260729.1",
      persistedRows: [{ version: "20260728.1" }], target: {
        environment: "staging", identityClass: "durable",
        resolvedIdentity: "database=operator_supplied_release_target;host=release-target.invalid;port=5432",
      },
    })).toBe(true);
  });

  it("accepts only a policy bound to the checked-in approval and fails closed after overlap without one", () => {
    const { matrix, digest } = readReleaseMatrixArtifactWithDigest("20260728.1-to-20260729.1.json");
    const parsed = parseSchemaReleaseMatrix(matrix)!;
    const policy = readApprovedReleasePhasePolicy(JSON.stringify({ releaseId: parsed.releaseId, matrixPath: "20260728.1-to-20260729.1.json", matrixDigest: digest, target: parsed.target, phase: "migrate", workloads: parsed.phases.migrate.workloads }));
    expect(policy).not.toBeNull();
    expect(admitsSchemaReleasePhasePolicy(policy, "web", [{ version: "20260729.1" }], parsed.target.resolvedIdentity)).toBe(true);
    expect(admitsSchemaReleasePhasePolicy(policy, "web", [{ version: "20260729.1" }], "database=other;host=10.0.0.1;port=5432")).toBe(false);
    expect(admitsSchemaReleasePhasePolicy(undefined, "web", [{ version: "20260728.1" }])).toBe(true);
    expect(admitsSchemaReleasePhasePolicy(undefined, "web", [{ version: "20260729.1" }])).toBe(false);
    expect(readApprovedReleasePhasePolicy(JSON.stringify({ ...policy!, matrixDigest: "0".repeat(64) }))).toBeNull();
    expect(readApprovedReleasePhasePolicy(JSON.stringify({ ...policy!, target: { ...parsed.target, identityClass: "protected" } }))).toBeNull();
  });
});
