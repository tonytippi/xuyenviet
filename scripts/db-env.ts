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

  return databaseUrl;
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
