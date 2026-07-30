import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { getRequiredServerEnv } from "./env";

import { schema } from "./schema";

const databaseClientKey = Symbol.for("xuyenviet.database.client");
type DatabaseClient = { databaseUrl: string; db: ReturnType<typeof createDb> };

// Module invalidation must not create pools that lose their last close handle.
// A server process has one DATABASE_URL; changing it at runtime is unsupported.
const globalState = globalThis as typeof globalThis & { [key: symbol]: unknown };

function getDatabaseUrl() {
  return getRequiredServerEnv("DATABASE_URL");
}

function createDb(databaseUrl: string) {
  return drizzle(postgres(databaseUrl), { schema });
}

export function getDb() {
  const databaseUrl = getDatabaseUrl();
  const existing = globalState[databaseClientKey] as DatabaseClient | undefined;
  if (existing) {
    if (existing.databaseUrl !== databaseUrl) throw new Error("DATABASE_URL cannot change after the database client is initialized.");
    return existing.db;
  }
  const db = createDb(databaseUrl);
  globalState[databaseClientKey] = { databaseUrl, db } satisfies DatabaseClient;
  return db;
}

/** Test-only teardown is keyed so it cannot close a client for another URL. */
export async function resetDatabaseClientForTests(databaseUrl: string) {
  const existing = globalState[databaseClientKey] as DatabaseClient | undefined;
  if (!existing || existing.databaseUrl !== databaseUrl) return false;
  delete globalState[databaseClientKey];
  await existing.db.$client.end({ timeout: 5 });
  return true;
}
