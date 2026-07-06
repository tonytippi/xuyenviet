import "server-only";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { getRequiredServerEnv } from "@/server/env";

import { schema } from "./schema";

let db: ReturnType<typeof createDb> | undefined;

function getDatabaseUrl() {
  return getRequiredServerEnv("DATABASE_URL");
}

function createDb() {
  return drizzle(postgres(getDatabaseUrl()), { schema });
}

export function getDb() {
  db ??= createDb();

  return db;
}
