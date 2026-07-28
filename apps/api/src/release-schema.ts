import type { ReleaseSchemaVersionRepository } from "@xuyenviet/database";

export const apiCompatibleSchemaVersion = "20260728.1";
export const RELEASE_SCHEMA_VERSION_REPOSITORY = Symbol("RELEASE_SCHEMA_VERSION_REPOSITORY");
export const API_CONFIGURATION_VALID = Symbol("API_CONFIGURATION_VALID");

export async function isApiReady(input: { configValid: boolean; repository: ReleaseSchemaVersionRepository }): Promise<boolean> {
  if (!input.configValid) return false;
  try {
    return await input.repository.hasCompatibleSchemaVersion(apiCompatibleSchemaVersion);
  } catch {
    return false;
  }
}
