import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { getRequiredServerEnv } from "@/server/env";

import { schema } from "./schema";

let db: ReturnType<typeof createDb> | undefined;

function getDatabaseUrl() {
  return getRequiredServerEnv("DATABASE_URL");
}

function createDb() {
  return drizzle(neon(getDatabaseUrl()), { schema });
}

export function getDb() {
  db ??= createDb();

  return db;
}
