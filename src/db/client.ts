import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { schema } from "./schema";

let db: ReturnType<typeof createDb> | undefined;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database-backed server operations.");
  }

  return databaseUrl;
}

function createDb() {
  return drizzle(neon(getDatabaseUrl()), { schema });
}

export function getDb() {
  db ??= createDb();

  return db;
}
