import { getEnvValue } from "@xuyenviet/database";

export { getEnvValue };

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
  return assertLocalDatabaseUrlForEnvironment(databaseUrl, process.env);
}

export function assertLocalDatabaseUrlForEnvironment(databaseUrl: string, environment: Record<string, unknown>) {
  const appEnv = environment["APP_ENV"];
  const url = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const databaseName = decodedDatabaseName(url);

  if (appEnv !== "local") {
    throw new Error("Refusing to reset database unless APP_ENV is explicitly local.");
  }

  if (!localHosts.has(url.hostname)) {
    throw new Error("Refusing to reset a non-local database host.");
  }

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  if (isProtectedDatabaseName(databaseName)) {
    throw new Error("Refusing to reset a protected database.");
  }
}

export type DestructiveResetEnvironment = Record<string, unknown> & { APP_ENV?: string; DB_RESET_DISPOSABLE_CONFIRMATION?: string; DB_RESET_NO_RUNTIME_OVERLAP?: string; DB_RESET_EXPECTED_TARGET_IDENTITY?: string };

export function assertDisposableLocalDatabaseUrl(databaseUrl: string, environment: DestructiveResetEnvironment = process.env as unknown as DestructiveResetEnvironment) {
  assertLocalDatabaseUrlForEnvironment(databaseUrl, environment);
  const confirmation = environment["DB_RESET_DISPOSABLE_CONFIRMATION"];
  const overlapConfirmation = environment["DB_RESET_NO_RUNTIME_OVERLAP"];
  const expectedIdentity = environment["DB_RESET_EXPECTED_TARGET_IDENTITY"];
  if (confirmation !== "confirm-disposable-reset" || overlapConfirmation !== "confirm-no-runtime-overlap" || !isExplicitlyLocalResolvedDatabaseIdentity(expectedIdentity)) {
    throw new Error("Refusing destructive reset without explicit disposable-target and no-overlap confirmations.");
  }
  const url = new URL(databaseUrl);
  if (!url.hostname || !url.pathname || url.pathname === "/") throw new Error("Refusing reset without a resolved target identity.");
}

export async function resolveDatabaseTargetIdentity(sql: { unsafe(query: string): Promise<Array<{ identity: string }>> }): Promise<string> {
  // PostgreSQL reports no port for Unix-socket connections; use the PostgreSQL
  // default so local resolved identities remain canonical and comparable.
  const [target] = await sql.unsafe("select 'database=' || current_database() || ';host=' || coalesce(host(inet_server_addr()), 'local') || ';port=' || coalesce(inet_server_port()::text, '5432') as identity");
  if (!isResolvedDatabaseTargetIdentity(target?.identity)) throw new Error("Could not resolve the database target identity.");
  return target.identity;
}

export function isResolvedDatabaseTargetIdentity(value: unknown): value is string {
  return typeof value === "string" && /^database=[A-Za-z0-9_-]{1,128};host=[A-Za-z0-9:.\[\]-]{1,255};port=[0-9]{1,5}$/.test(value);
}

export function isExplicitlyLocalResolvedDatabaseIdentity(value: unknown): value is string {
  if (!isResolvedDatabaseTargetIdentity(value)) return false;
  const host = /;host=([^;]+);/.exec(value)?.[1];
  return host === "127.0.0.1" || host === "::1" || host === "local";
}

export function databaseNameFromResolvedIdentity(identity: string): string {
  return /^database=([^;]+);/.exec(identity)?.[1] ?? "";
}

export function isProtectedDatabaseName(databaseName: string): boolean {
  return ["postgres", "template0", "template1"].includes(databaseName) || /(?:prod|production|staging|stage|railway)/i.test(databaseName);
}

export function maintenanceIdentityFromTargetIdentity(identity: string): string {
  return isResolvedDatabaseTargetIdentity(identity) ? identity.replace(/^database=[^;]+/, "database=postgres") : "";
}

function decodedDatabaseName(url: URL): string {
  try {
    return decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    throw new Error("DATABASE_URL must include a valid database name.");
  }
}
