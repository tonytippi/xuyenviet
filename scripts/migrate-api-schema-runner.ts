import type { ReleaseSchemaVersionRepository } from "@xuyenviet/database";

export type ApiSchemaMigrationDependencies = {
  acquireMigrationLock(): Promise<void>;
  releaseMigrationLock(): Promise<void>;
  runDrizzleMigration(): Promise<void>;
  releaseSchemaVersions: Pick<ReleaseSchemaVersionRepository, "recordSchemaVersion">;
  migrationVersion: string;
  preflight(): Promise<void>;
};

// Recording is deliberately sequenced after Drizzle. The release record remains
// the only deployed-schema authority and is untouched when migration fails.
export async function runApiSchemaMigration(dependencies: ApiSchemaMigrationDependencies): Promise<void> {
  let locked = false;
  try {
    await dependencies.acquireMigrationLock();
    locked = true;
    await dependencies.preflight();
    await dependencies.runDrizzleMigration();
    await dependencies.releaseSchemaVersions.recordSchemaVersion(dependencies.migrationVersion);
  } finally {
    if (locked) await dependencies.releaseMigrationLock();
  }
}
