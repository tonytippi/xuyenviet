import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  for (const envFile of [".env.local", ".env"]) {
    if (!existsSync(envFile)) {
      continue;
    }

    const match = readFileSync(envFile, "utf8").match(/^DATABASE_URL=(.*)$/m);

    if (match?.[1]) {
      return match[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }

  throw new Error("DATABASE_URL is required for Drizzle commands. Set it in the environment or .env.local.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
