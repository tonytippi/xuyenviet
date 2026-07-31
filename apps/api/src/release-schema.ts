import type { ReleaseSchemaVersionRepository } from "@xuyenviet/database";
import { evaluateSchemaAdmission, schemaCompatibilityDeclarations, type SchemaReleasePhasePolicy } from "@xuyenviet/contracts";
import { readApprovedReleasePhasePolicy } from "../../../scripts/schema-release-matrix";

export const apiSchemaCompatibility = schemaCompatibilityDeclarations.api;
export const apiCompatibleSchemaVersion = apiSchemaCompatibility.maximumVersion;
export const RELEASE_SCHEMA_VERSION_REPOSITORY = Symbol("RELEASE_SCHEMA_VERSION_REPOSITORY");
export const API_CONFIGURATION_VALID = Symbol("API_CONFIGURATION_VALID");
export const API_RELEASE_PHASE_POLICY = Symbol("API_RELEASE_PHASE_POLICY");

export async function isApiReady(input: { configValid: boolean; repository: ReleaseSchemaVersionRepository; releasePhasePolicy?: SchemaReleasePhasePolicy | null }): Promise<boolean> {
  if (!input.configValid) return false;
  try {
    // The repository remains the schema authority. Policy is a further static
    // release admission constraint and therefore reads the same row.
    if (input.releasePhasePolicy === null) return false;
    if (input.releasePhasePolicy === undefined) {
      return await input.repository.hasCompatibleSchemaVersion({ ...apiSchemaCompatibility, maximumVersion: "20260728.1" });
    }
    if (!input.repository.readSchemaAdmission) return false;
    const admission = await input.repository.readSchemaAdmission();
    return apiSchemaCompatibility.workload === input.releasePhasePolicy.workloads.api.workload
      && evaluateSchemaAdmission(apiSchemaCompatibility, admission.rows).compatible
      && admission.resolvedTargetIdentity === input.releasePhasePolicy.target.resolvedIdentity
      && evaluateSchemaAdmission(input.releasePhasePolicy.workloads.api, admission.rows).compatible;
  } catch {
    return false;
  }
}

export function readApiReleasePhasePolicy(value = process.env.SCHEMA_RELEASE_PHASE_POLICY): SchemaReleasePhasePolicy | null | undefined {
  return readApprovedReleasePhasePolicy(value);
}
