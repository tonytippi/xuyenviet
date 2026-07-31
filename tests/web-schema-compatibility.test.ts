import { describe, expect, it } from "vitest";

import { isWebDeploymentReady } from "@/server/web-schema-admission";
import { parseSchemaReleasePhasePolicy } from "@xuyenviet/contracts";

describe("web deployment schema admission", () => {
  it("becomes traffic eligible only for one compatible release record", async () => {
    const dependencies = {
      assertEnvironment() {},
      async probeDatabase() {},
      async readReleaseVersions() { return [{ version: "20260728.1" }]; },
    };
    await expect(isWebDeploymentReady(dependencies)).resolves.toBe(true);
    await expect(isWebDeploymentReady({ ...dependencies, async readReleaseVersions() { return [{ version: "20260729.1" }]; } })).resolves.toBe(false);
    await expect(isWebDeploymentReady({ ...dependencies, async readReleaseVersions() { return []; } })).resolves.toBe(false);
    await expect(isWebDeploymentReady({ ...dependencies, async readReleaseVersions() { return [{ version: "bad" }]; } })).resolves.toBe(false);
    await expect(isWebDeploymentReady({ ...dependencies, async readReleaseVersions() { return [{ version: "20260728.1" }, { version: "20260728.1" }]; } })).resolves.toBe(false);
  });

  it("denies traffic when the selected release phase excludes web despite a compatible persisted row", async () => {
    const policy = parseSchemaReleasePhasePolicy({ releaseId: "schema-20260728.1-to-20260729.1", matrixPath: "20260728.1-to-20260729.1.json", matrixDigest: "a".repeat(64), target: { environment: "staging", identityClass: "durable", resolvedIdentity: "database=xuyenviet;host=10.0.0.1;port=5432" }, phase: "contract", workloads: {
      web: { workload: "web", minimumVersion: "20260729.1", maximumVersion: "20260729.1" },
      api: { workload: "api", minimumVersion: "20260728.1", maximumVersion: "20260729.1" },
      worker: { workload: "worker", minimumVersion: "20260728.1", maximumVersion: "20260729.1" },
      migration: { workload: "migration", minimumVersion: "20260728.1", maximumVersion: "20260729.1" },
      admin: { workload: "admin", minimumVersion: "20260728.1", maximumVersion: "20260729.1" },
    } });
    expect(policy).not.toBeNull();
    await expect(isWebDeploymentReady({ assertEnvironment() {}, async probeDatabase() {}, async readReleaseVersions() { return [{ version: "20260728.1" }]; }, async readReleaseAdmission() { return { rows: [{ version: "20260728.1" }], resolvedTargetIdentity: policy!.target.resolvedIdentity }; }, releasePhasePolicy: policy! })).resolves.toBe(false);
  });

  it("fails closed when the approved policy identity differs from the connected database", async () => {
    const policy = parseSchemaReleasePhasePolicy({ releaseId: "schema-20260728.1-to-20260729.1", matrixPath: "20260728.1-to-20260729.1.json", matrixDigest: "a".repeat(64), target: { environment: "staging", identityClass: "durable", resolvedIdentity: "database=xuyenviet;host=10.0.0.1;port=5432" }, phase: "migrate", workloads: {
      web: { workload: "web", minimumVersion: "20260728.1", maximumVersion: "20260729.1" }, api: { workload: "api", minimumVersion: "20260728.1", maximumVersion: "20260729.1" }, worker: { workload: "worker", minimumVersion: "20260728.1", maximumVersion: "20260729.1" }, migration: { workload: "migration", minimumVersion: "20260728.1", maximumVersion: "20260729.1" }, admin: { workload: "admin", minimumVersion: "20260728.1", maximumVersion: "20260729.1" },
    } });
    await expect(isWebDeploymentReady({ assertEnvironment() {}, async probeDatabase() {}, async readReleaseVersions() { return [{ version: "20260729.1" }]; }, async readReleaseAdmission() { return { rows: [{ version: "20260729.1" }], resolvedTargetIdentity: "database=other;host=10.0.0.1;port=5432" }; }, releasePhasePolicy: policy! })).resolves.toBe(false);
  });

  it("uses one bound admission result rather than mixing ledger rows and an identity from separate probes", async () => {
    const policy = parseSchemaReleasePhasePolicy({ releaseId: "schema-20260728.1-to-20260729.1", matrixPath: "20260728.1-to-20260729.1.json", matrixDigest: "a".repeat(64), target: { environment: "staging", identityClass: "durable", resolvedIdentity: "database=xuyenviet;host=10.0.0.1;port=5432" }, phase: "migrate", workloads: {
      web: { workload: "web", minimumVersion: "20260728.1", maximumVersion: "20260729.1" }, api: { workload: "api", minimumVersion: "20260728.1", maximumVersion: "20260729.1" }, worker: { workload: "worker", minimumVersion: "20260728.1", maximumVersion: "20260729.1" }, migration: { workload: "migration", minimumVersion: "20260728.1", maximumVersion: "20260729.1" }, admin: { workload: "admin", minimumVersion: "20260728.1", maximumVersion: "20260729.1" },
    } });
    await expect(isWebDeploymentReady({ assertEnvironment() {}, async probeDatabase() {}, async readReleaseVersions() { return [{ version: "20260729.1" }]; }, async readReleaseAdmission() { return { rows: [{ version: "20260729.1" }], resolvedTargetIdentity: policy!.target.resolvedIdentity }; }, releasePhasePolicy: policy! })).resolves.toBe(true);
  });
});
