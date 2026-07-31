import type { ReleaseSchemaVersionRepository } from "@xuyenviet/database";
import { schemaCompatibilityDeclarations } from "@xuyenviet/contracts";

export const apiSchemaCompatibility = schemaCompatibilityDeclarations.api;
export const apiCompatibleSchemaVersion = apiSchemaCompatibility.maximumVersion;
export const RELEASE_SCHEMA_VERSION_REPOSITORY = Symbol("RELEASE_SCHEMA_VERSION_REPOSITORY");
export const API_CONFIGURATION_VALID = Symbol("API_CONFIGURATION_VALID");

export async function isApiReady(input: { configValid: boolean; repository: ReleaseSchemaVersionRepository }): Promise<boolean> {
  if (!input.configValid) return false;
  try {
    return await input.repository.hasCompatibleSchemaVersion(apiSchemaCompatibility);
  } catch {
    return false;
  }
}
