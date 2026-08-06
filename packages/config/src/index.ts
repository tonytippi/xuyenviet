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
