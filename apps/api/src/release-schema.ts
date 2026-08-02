import type { ReleaseSchemaVersionRepository } from "@xuyenviet/database";
import { readApprovedSchemaReleasePhasePolicy } from "@xuyenviet/config";
import { evaluateSchemaAdmission, schemaCompatibilityDeclarations, type SchemaReleasePhasePolicy } from "@xuyenviet/contracts";

export const apiSchemaCompatibility = schemaCompatibilityDeclarations.api;
export const policyFreeApiSchemaCompatibility = { ...apiSchemaCompatibility, maximumVersion: "20260728.1" };
export const RELEASE_SCHEMA_VERSION_REPOSITORY = Symbol("RELEASE_SCHEMA_VERSION_REPOSITORY");
export const API_CONFIGURATION_VALID = Symbol("API_CONFIGURATION_VALID");
export const API_RELEASE_PHASE_POLICY = Symbol("API_RELEASE_PHASE_POLICY");

export async function isApiReady(input: { configValid: boolean; repository: ReleaseSchemaVersionRepository; releasePhasePolicy?: SchemaReleasePhasePolicy | null }): Promise<boolean> {
  if (!input.configValid) return false;
  // Local admin OAuth uses a developer database that may not carry deployment
  // release records. This does not bypass database-backed identity or roles.
  if (process.env.APP_ENV === "local" && process.env.XV_ADMIN_LOCAL_TRANSPORT === "true") return true;
  try {
    // The repository remains the schema authority. Policy is a further static
    // release admission constraint and therefore reads the same row.
    if (input.releasePhasePolicy === null) return false;
    if (input.releasePhasePolicy === undefined) {
      return await input.repository.hasCompatibleSchemaVersion(policyFreeApiSchemaCompatibility);
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
  return readApprovedSchemaReleasePhasePolicy(value);
}
