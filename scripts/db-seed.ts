import postgres from "postgres";

import { assertDisposableLocalDatabaseUrl, databaseNameFromResolvedIdentity, getDatabaseUrl, isProtectedDatabaseName, isResolvedDatabaseTargetIdentity, resolveDatabaseTargetIdentity, type DestructiveResetEnvironment } from "./db-env";
import { seedDatabase } from "./db-seed-data";

export async function runDisposableDatabaseSeed(databaseUrl: string, environment: DestructiveResetEnvironment & Record<string, string | undefined> = process.env as DestructiveResetEnvironment & Record<string, string | undefined>, dependencies: { seed?(sql: postgres.Sql): Promise<void> } = {}) {
  assertDisposableLocalDatabaseUrl(databaseUrl, environment);
  if (environment.DATABASE_URL !== undefined && environment.DATABASE_URL !== databaseUrl) throw new Error("Refusing destructive seed when supplied DATABASE_URL differs from the selected target.");
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await seedVerifiedConnection(sql, environment.DB_RESET_EXPECTED_TARGET_IDENTITY, dependencies.seed ?? seedDatabase);
  } finally { await sql.end(); }
}

export async function seedVerifiedConnection(sql: postgres.Sql, expectedIdentity: string | undefined, seed: (sql: postgres.Sql) => Promise<void> = seedDatabase): Promise<void> {
  // Identity and first insert share this session so a URL/DNS target swap cannot
  // turn a successful preflight into writes against another server.
  const resolvedIdentity = await resolveDatabaseTargetIdentity(sql);
  if (!isResolvedDatabaseTargetIdentity(resolvedIdentity) || resolvedIdentity !== expectedIdentity) throw new Error("Refusing destructive seed because the resolved target does not match the operator confirmation.");
  if (isProtectedDatabaseName(databaseNameFromResolvedIdentity(resolvedIdentity))) throw new Error("Refusing to seed a protected database.");
  await seed(sql);
}

async function main() {
  await runDisposableDatabaseSeed(getDatabaseUrl());
  console.log("Seed data inserted.");
}

if (process.argv[1]?.endsWith("db-seed.ts")) {
  main().catch(() => {
    console.error("Database seed failed before completion.");
    process.exitCode = 1;
  });
}
