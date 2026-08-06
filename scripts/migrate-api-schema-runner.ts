export type ApiSchemaMigrationDependencies = {
  acquireMigrationLock(): Promise<void>;
  releaseMigrationLock(): Promise<void>;
  runDrizzleMigration(): Promise<void>;
  preflight(): Promise<void>;
};

export async function runApiSchemaMigration(dependencies: ApiSchemaMigrationDependencies): Promise<void> {
  let locked = false;
  try {
    await dependencies.acquireMigrationLock();
    locked = true;
    await dependencies.preflight();
    await dependencies.runDrizzleMigration();
  } finally {
    if (locked) await dependencies.releaseMigrationLock();
  }
}
