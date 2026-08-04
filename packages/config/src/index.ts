import { createHash } from "node:crypto";
import { realpathSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { parseSchemaReleasePhasePolicy, validatesSchemaReleasePhasePolicy, type SchemaReleasePhasePolicy } from "@xuyenviet/contracts";
export type BrowserAuthConfig = { googleClientId: string; googleClientSecret: string; callbackUrl: string; allowedOrigins: readonly string[]; allowedReturnUrls: readonly string[]; sessionLookupKey: string; csrfKey: string; oauthTransactionProtectionKey: string; cookieName: string };
export function getBrowserAuthConfig(environment: NodeJS.ProcessEnv = process.env): BrowserAuthConfig {
  const origins = requiredOrigins(environment.XV_BROWSER_ALLOWED_ORIGINS);
  const callbackUrl = requiredUrl(environment.XV_BROWSER_GOOGLE_CALLBACK_URL);
  const localLoopback = environment.APP_ENV === "local" && callbackUrl.protocol === "http:" && isLoopbackOrigin(callbackUrl.origin) && origins.every(isLoopbackOrigin);
  if ((!localLoopback && (callbackUrl.protocol !== "https:" || !origins.every(isHttpsOrigin))) || !origins.includes(callbackUrl.origin)) throw new Error("Invalid browser authentication configuration.");
  const config = { googleClientId: requiredBrowserValue(environment.XV_BROWSER_GOOGLE_CLIENT_ID), googleClientSecret: requiredBrowserValue(environment.XV_BROWSER_GOOGLE_CLIENT_SECRET), callbackUrl: callbackUrl.href, allowedOrigins: origins, allowedReturnUrls: requiredReturnUrls(environment.XV_BROWSER_ALLOWED_RETURN_URLS), sessionLookupKey: requiredBrowserValue(environment.XV_BROWSER_SESSION_LOOKUP_KEY), csrfKey: requiredBrowserValue(environment.XV_BROWSER_CSRF_KEY), oauthTransactionProtectionKey: requiredBrowserValue(environment.XV_BROWSER_OAUTH_TRANSACTION_PROTECTION_KEY), cookieName: localLoopback ? "xuyenviet-session" : "__Host-xuyenviet-session" };
  if (config.sessionLookupKey.length < 32 || config.csrfKey.length < 32 || config.oauthTransactionProtectionKey.length < 32 || config.oauthTransactionProtectionKey === config.sessionLookupKey || config.oauthTransactionProtectionKey === config.csrfKey || !config.allowedReturnUrls.every((url) => origins.includes(new URL(url).origin))) throw new Error("Invalid browser authentication configuration.");
  return Object.freeze(config);
}

/** Runtime release artifacts must be supplied from a deployment-owned directory. */
export function readApprovedSchemaReleasePhasePolicy(
  value = process.env.SCHEMA_RELEASE_PHASE_POLICY,
  matrixDirectory = process.env.SCHEMA_RELEASE_MATRIX_DIRECTORY,
): SchemaReleasePhasePolicy | null | undefined {
  if (!value) return undefined;
  if (!matrixDirectory) return null;
  try {
    const policy = parseSchemaReleasePhasePolicy(JSON.parse(value));
    if (!policy || !/^[A-Za-z0-9._-]{1,255}\.json$/.test(policy.matrixPath)) return null;
    const directory = realpathSync(matrixDirectory);
    const artifactPath = realpathSync(resolve(directory, policy.matrixPath));
    const path = relative(directory, artifactPath);
    if (path === "" || path === ".." || path.startsWith(`..${sep}`) || path.startsWith("/")) return null;
    const source = readFileSync(artifactPath);
    return validatesSchemaReleasePhasePolicy(policy, JSON.parse(source.toString("utf8")), createHash("sha256").update(source).digest("hex")) ? policy : null;
  } catch {
    return null;
  }
}

function requiredBrowserValue(value: string | undefined): string { if (!value?.trim()) throw new Error("Invalid browser authentication configuration."); return value; }
function requiredUrl(value: string | undefined): URL { try { return new URL(requiredBrowserValue(value)); } catch { throw new Error("Invalid browser authentication configuration."); } }
function requiredOrigins(value: string | undefined): string[] { const origins = value?.split(",").map((item) => item.trim()).filter(Boolean) ?? []; if (!origins.length || new Set(origins).size !== origins.length || !origins.every(isExactOrigin)) throw new Error("Invalid browser authentication configuration."); return origins; }
function requiredReturnUrls(value: string | undefined): string[] {
  const urls = value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (!urls.length || new Set(urls).size !== urls.length || !urls.every(isCanonicalHttpsReturnUrl)) throw new Error("Invalid browser authentication configuration.");
  return urls;
}

function isExactOrigin(value: string): boolean {
  try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value; } catch { return false; }
}
function isHttpsOrigin(value: string): boolean { return new URL(value).protocol === "https:"; }

function isCanonicalHttpsReturnUrl(value: string): boolean {
  try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && !url.hash && url.href === value; } catch { return false; }
}
function isLoopbackOrigin(value: string): boolean { try { const url = new URL(value); return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"); } catch { return false; } }
