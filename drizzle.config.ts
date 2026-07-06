import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";

const envFileNames = [".env.local", ".env"] as const;

function getEnvValue(name: string) {
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

function getDatabaseUrl() {
  const databaseUrl = getEnvValue("DATABASE_URL");

  if (databaseUrl) {
    return databaseUrl;
  }

  throw new Error("DATABASE_URL is required for Drizzle commands. Set it in the environment or .env.local.");
}

function assertProductionDatabaseUrl(databaseUrl: string) {
  const appEnv = getEnvValue("APP_ENV") ?? "local";

  if (!["local", "staging", "production"].includes(appEnv)) {
    throw new Error("APP_ENV must be one of: local, staging, production.");
  }

  if (appEnv !== "production") {
    return;
  }

  const normalizedUrl = databaseUrl.trim().toLowerCase();

  if (
    !normalizedUrl ||
    normalizedUrl.includes("replace-with-") ||
    normalizedUrl.includes("placeholder") ||
    normalizedUrl.includes("example") ||
    normalizedUrl.includes("changeme") ||
    normalizedUrl.includes("change-me") ||
    normalizedUrl.includes("localhost") ||
    normalizedUrl.includes("127.0.0.1") ||
    normalizedUrl.includes("[::1]") ||
    normalizedUrl.includes("::1")
  ) {
    throw new Error("DATABASE_URL must be a non-placeholder production database URL when APP_ENV=production.");
  }
}

const databaseUrl = getDatabaseUrl();

assertProductionDatabaseUrl(databaseUrl);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
