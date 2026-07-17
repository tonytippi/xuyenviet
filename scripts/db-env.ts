import { existsSync, readFileSync } from "node:fs";

const envFileNames = [".env.local", ".env"] as const;

export function getEnvValue(name: string) {
  if (process.env[name]) {
    return process.env[name];
  }

  for (const envFile of envFileNames) {
    if (!existsSync(envFile)) {
      continue;
    }

    const match = readFileSync(envFile, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));

    if (match?.[1]) {
      return match[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

export function getDatabaseUrl() {
  const databaseUrl = getEnvValue("DATABASE_URL");

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Set it in the environment or .env.local.");
  }

  return assertPostgresUrl(databaseUrl, "DATABASE_URL");
}

export function getCaptureCacheDatabaseUrl() {
  const databaseUrl = getEnvValue("CAPTURE_CACHE_DATABASE_URL");
  if (!databaseUrl) throw new Error("CAPTURE_CACHE_DATABASE_URL is required for capture archive operations.");
  return assertPostgresUrl(databaseUrl, "CAPTURE_CACHE_DATABASE_URL");
}

export function assertPostgresUrl(value: string, name: string) {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === "/") throw new Error();
    return value;
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }
}

export async function assertDistinctCaptureDatabases(appSql: { unsafe: (query: string) => Promise<Array<{ identity: string }>> }, cacheSql: { unsafe: (query: string) => Promise<Array<{ identity: string }>> }) {
  const query = "select current_database() || ':' || inet_server_addr()::text || ':' || inet_server_port()::text as identity";
  const [app] = await appSql.unsafe(query);
  const [cache] = await cacheSql.unsafe(query);
  if (!app?.identity || !cache?.identity || app.identity === cache.identity) throw new Error("DATABASE_URL and CAPTURE_CACHE_DATABASE_URL must resolve to separate databases.");
}

export function assertLocalDatabaseUrl(databaseUrl: string) {
  const appEnv = getEnvValue("APP_ENV") ?? "local";
  const url = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const databaseName = url.pathname.replace(/^\//, "");

  if (appEnv !== "local") {
    throw new Error(`Refusing to reset database when APP_ENV=${appEnv}. db:reset is local-only.`);
  }

  if (!localHosts.has(url.hostname)) {
    throw new Error(`Refusing to reset non-local database host: ${url.hostname}`);
  }

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  if (["postgres", "template0", "template1"].includes(databaseName)) {
    throw new Error(`Refusing to reset protected database: ${databaseName}`);
  }
}
