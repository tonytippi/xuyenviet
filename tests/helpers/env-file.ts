import { existsSync, readFileSync } from "node:fs";

const envFileNames = [".env.local", ".env"] as const;
const safeLocalHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function loadDotEnvFile() {
  for (const envFileName of envFileNames) {
    if (!existsSync(envFileName)) {
      continue;
    }

    const envFile = readFileSync(envFileName, "utf8");

    for (const line of envFile.split(/\r?\n/)) {
      const match = line.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);

      if (!match) {
        continue;
      }

      const [, name, rawValue] = match;
      process.env[name] ??= rawValue.trim().replace(/\s+#.*$/, "").replace(/^['"]|['"]$/g, "");
    }
  }
}

export function getTestDatabaseUrl() {
  loadDotEnvFile();

  const testDatabaseUrl = process.env.DATABASE_URL_TEST;

  if (!testDatabaseUrl) {
    throw new Error("DATABASE_URL_TEST is required for integration tests.");
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set so tests can prove DATABASE_URL_TEST is separate.");
  }

  assertSafeTestDatabaseUrl(testDatabaseUrl, databaseUrl);

  return testDatabaseUrl;
}

function assertSafeTestDatabaseUrl(testDatabaseUrl: string, databaseUrl: string) {
  const parsedTestUrl = new URL(testDatabaseUrl);
  const parsedDatabaseUrl = new URL(databaseUrl);
  const testDatabaseName = parsedTestUrl.pathname.replace(/^\//, "").toLowerCase();
  const normalizedTestUrl = normalizeDatabaseUrl(parsedTestUrl);
  const normalizedDatabaseUrl = normalizeDatabaseUrl(parsedDatabaseUrl);

  if (normalizedTestUrl === normalizedDatabaseUrl) {
    throw new Error("DATABASE_URL_TEST must be different from DATABASE_URL.");
  }

  if (!testDatabaseName.includes("test")) {
    throw new Error("DATABASE_URL_TEST database name must include 'test'.");
  }

  if (!isSafeTestHost(parsedTestUrl.hostname)) {
    throw new Error("DATABASE_URL_TEST must point at a local or explicitly test/CI host.");
  }
}

function normalizeDatabaseUrl(url: URL) {
  return `${url.protocol}//${url.hostname}:${url.port || "5432"}${url.pathname}`.toLowerCase();
}

function isSafeTestHost(hostname: string) {
  const normalizedHost = hostname.toLowerCase();

  return safeLocalHosts.has(normalizedHost) || normalizedHost.includes("test") || normalizedHost.includes("ci");
}
