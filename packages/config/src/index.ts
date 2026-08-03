import { createHash, createPrivateKey, createPublicKey, type JsonWebKey as NodeJsonWebKey } from "node:crypto";
import { realpathSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { apiAudience, bffIssuers, parseSchemaReleasePhasePolicy, validatesSchemaReleasePhasePolicy, type BffIssuer, type SchemaReleasePhasePolicy } from "@xuyenviet/contracts";

export type Jwk = JsonWebKey & { kty: "EC"; crv: "P-256"; kid?: string };
export type VerificationKey = { kid: string; key: Jwk; verificationEndsAt?: Date };
export type IssuerCredentialConfig = {
  issuer: BffIssuer;
  active: VerificationKey;
  previous?: VerificationKey;
};
export type BffCredentialConfig = {
  audience: typeof apiAudience;
  maxLifetimeSeconds: number;
  issuers: Record<BffIssuer, IssuerCredentialConfig>;
};
export type WebBffSigningConfig = {
  audience: typeof apiAudience;
  maxLifetimeSeconds: number;
  issuer: "xuyenviet-web-bff";
  active: { kid: string; publicKey: Jwk; privateKey: Jwk };
};
export type AdminBffSigningConfig = {
  audience: typeof apiAudience;
  maxLifetimeSeconds: number;
  issuer: "xuyenviet-admin-bff";
  active: { kid: string; publicKey: Jwk; privateKey: Jwk };
};
export type AdminBffConfig = {
  transport: BffTransportConfig;
  signing: AdminBffSigningConfig;
  handoffUrl: string;
  handoffServiceToken: string;
};
export type BffTransportConfig = {
  readonly privateApiUrl: string;
  readonly bffOrigin: string;
  readonly csrfSigningSecret: string;
  readonly csrfLifetimeSeconds: number;
  readonly requestTimeoutMs: number;
};
export type BffCsrfConfig = Pick<BffTransportConfig, "bffOrigin" | "csrfSigningSecret" | "csrfLifetimeSeconds">;
export type BrowserAuthConfig = { googleClientId: string; googleClientSecret: string; callbackUrl: string; allowedOrigins: readonly string[]; allowedReturnUrls: readonly string[]; sessionLookupKey: string; csrfKey: string; oauthTransactionProtectionKey: string; cookieName: string };
export function getBrowserAuthConfig(environment: NodeJS.ProcessEnv = process.env): BrowserAuthConfig {
  const origins = requiredOrigins(environment.XV_BROWSER_ALLOWED_ORIGINS);
  const callbackUrl = requiredUrl(environment.XV_BROWSER_GOOGLE_CALLBACK_URL);
  if (callbackUrl.protocol !== "https:" || !origins.includes(callbackUrl.origin)) throw new Error("Invalid browser authentication configuration.");
  const config = { googleClientId: requiredBrowserValue(environment.XV_BROWSER_GOOGLE_CLIENT_ID), googleClientSecret: requiredBrowserValue(environment.XV_BROWSER_GOOGLE_CLIENT_SECRET), callbackUrl: callbackUrl.href, allowedOrigins: origins, allowedReturnUrls: requiredReturnUrls(environment.XV_BROWSER_ALLOWED_RETURN_URLS), sessionLookupKey: requiredBrowserValue(environment.XV_BROWSER_SESSION_LOOKUP_KEY), csrfKey: requiredBrowserValue(environment.XV_BROWSER_CSRF_KEY), oauthTransactionProtectionKey: requiredBrowserValue(environment.XV_BROWSER_OAUTH_TRANSACTION_PROTECTION_KEY), cookieName: "__Host-xuyenviet-session" };
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

export function createBffTransportConfig(input: Omit<BffTransportConfig, "privateApiUrl"> & { privateApiUrl: URL }): BffTransportConfig {
  if (
    !(input.privateApiUrl instanceof URL) || input.privateApiUrl.protocol !== "https:" || input.privateApiUrl.hostname !== apiAudience || input.privateApiUrl.port || input.privateApiUrl.username || input.privateApiUrl.password ||
    !isValidBffCsrfConfig(input) ||
    !Number.isInteger(input.requestTimeoutMs) || input.requestTimeoutMs < 100 || input.requestTimeoutMs > 30_000
  ) throw new Error("Invalid BFF transport configuration.");
  return Object.freeze({
    privateApiUrl: input.privateApiUrl.href,
    bffOrigin: input.bffOrigin,
    csrfSigningSecret: input.csrfSigningSecret,
    csrfLifetimeSeconds: input.csrfLifetimeSeconds,
    requestTimeoutMs: input.requestTimeoutMs,
  });
}

export function getBffTransportConfig(environment: NodeJS.ProcessEnv = process.env): BffTransportConfig {
  const privateApiUrl = requiredUrl(environment.XV_PRIVATE_API_URL);
  const csrf = getBffCsrfConfig(environment);
  return createBffTransportConfig({
    privateApiUrl,
    ...csrf,
    requestTimeoutMs: requiredInteger(environment.XV_BFF_REQUEST_TIMEOUT_MS),
  });
}

/** The rollback BFF still enforces the same session/CSRF boundary without an API origin. */
export function getBffCsrfConfig(environment: NodeJS.ProcessEnv = process.env): BffCsrfConfig {
  const config = {
    bffOrigin: requiredExactHttpsOrigin(environment.XV_WEB_BFF_ORIGIN),
    csrfSigningSecret: requiredValue(environment.XV_BFF_CSRF_SIGNING_SECRET),
    csrfLifetimeSeconds: requiredInteger(environment.XV_BFF_CSRF_LIFETIME_SECONDS),
  };
  if (!isValidBffCsrfConfig(config)) throw new Error("Invalid BFF transport configuration.");
  return config;
}

export function parseBffCredentialConfig(input: unknown): BffCredentialConfig {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid BFF credential configuration.");
  }

  const config = input as BffCredentialConfig;
  for (const issuer of bffIssuers) {
    const previous = config.issuers?.[issuer]?.previous;
    if (previous && typeof previous.verificationEndsAt === "string") {
      previous.verificationEndsAt = new Date(previous.verificationEndsAt);
    }
  }
  return createBffCredentialConfig(config);
}

export function createBffCredentialConfig(input: BffCredentialConfig): BffCredentialConfig {
  if (input.audience !== apiAudience || !isCredentialLifetime(input.maxLifetimeSeconds)) {
    throw new Error("Invalid BFF credential configuration.");
  }

  for (const issuer of bffIssuers) {
    const config = input.issuers[issuer];
    if (!config || config.issuer !== issuer || !isVerificationKey(config.active)) {
      throw new Error("Invalid BFF issuer configuration.");
    }
    if (
      config.previous &&
      (!isVerificationKey(config.previous) ||
        config.previous.kid === config.active.kid ||
        !(config.previous.verificationEndsAt instanceof Date) ||
        !Number.isFinite(config.previous.verificationEndsAt.getTime()) ||
        config.previous.verificationEndsAt <= new Date())
    ) {
      throw new Error("Invalid BFF previous verification key.");
    }
  }
  const webKeys = verifierKeys(input.issuers["xuyenviet-web-bff"]);
  const adminKeys = verifierKeys(input.issuers["xuyenviet-admin-bff"]);
  if (webKeys.some((webKey) => adminKeys.some((adminKey) => webKey.kid === adminKey.kid || samePublicKey(webKey.key, adminKey.key)))) {
    throw new Error("BFF issuer verification keys must be isolated.");
  }
  return input;
}

export function createWebBffSigningConfig(input: WebBffSigningConfig): WebBffSigningConfig {
  if (
    input.audience !== apiAudience ||
    !isCredentialLifetime(input.maxLifetimeSeconds) ||
    input.issuer !== "xuyenviet-web-bff" ||
    !isVerificationKey({ kid: input.active.kid, key: input.active.publicKey }) ||
    !isPrivateEs256Key(input.active.privateKey) ||
    input.active.publicKey.kid !== input.active.kid ||
    input.active.privateKey.kid !== input.active.kid ||
    !privateKeyMatchesPublicKey(input.active.privateKey, input.active.publicKey)
  ) {
    throw new Error("Invalid web BFF signing configuration.");
  }
  return input;
}

export function createAdminBffSigningConfig(input: AdminBffSigningConfig): AdminBffSigningConfig {
  if (
    input.audience !== apiAudience || !isCredentialLifetime(input.maxLifetimeSeconds) || input.issuer !== "xuyenviet-admin-bff" ||
    !isVerificationKey({ kid: input.active.kid, key: input.active.publicKey }) || !isPrivateEs256Key(input.active.privateKey) ||
    input.active.publicKey.kid !== input.active.kid || input.active.privateKey.kid !== input.active.kid ||
    !privateKeyMatchesPublicKey(input.active.privateKey, input.active.publicKey)
  ) throw new Error("Invalid admin BFF signing configuration.");
  return input;
}

export function getAdminBffConfig(environment: NodeJS.ProcessEnv = process.env): AdminBffConfig {
  const privateApiUrl = requiredUrl(environment.XV_ADMIN_PRIVATE_API_URL);
  const transportInput = {
    privateApiUrl,
    bffOrigin: requiredValue(environment.XV_ADMIN_BFF_ORIGIN),
    csrfSigningSecret: requiredValue(environment.XV_ADMIN_BFF_CSRF_SIGNING_SECRET),
    csrfLifetimeSeconds: requiredInteger(environment.XV_ADMIN_BFF_CSRF_LIFETIME_SECONDS),
    requestTimeoutMs: requiredInteger(environment.XV_ADMIN_BFF_REQUEST_TIMEOUT_MS),
  };
  const localTransport = isLocalAdminTransport(environment);
  const transport = localTransport
    ? createLocalAdminBffTransportConfig(transportInput)
    : createBffTransportConfig({ ...transportInput, bffOrigin: requiredExactHttpsOrigin(environment.XV_ADMIN_BFF_ORIGIN) });
  const handoffUrl = requiredUrl(environment.XV_ADMIN_IDENTITY_HANDOFF_URL);
  if (localTransport ? !isLocalApiUrl(handoffUrl) : handoffUrl.protocol !== "https:" || handoffUrl.hostname !== apiAudience || handoffUrl.port || handoffUrl.username || handoffUrl.password) throw new Error("Invalid admin identity handoff configuration.");
  return {
    transport,
    signing: createAdminBffSigningConfig({ audience: apiAudience, maxLifetimeSeconds: 300, issuer: "xuyenviet-admin-bff", active: {
      kid: requiredValue(environment.XV_ADMIN_BFF_ACTIVE_KID), publicKey: parsePrivateOrPublicJwk(requiredValue(environment.XV_ADMIN_BFF_ACTIVE_JWK), false), privateKey: parsePrivateOrPublicJwk(requiredValue(environment.XV_ADMIN_BFF_ACTIVE_PRIVATE_JWK), true),
    } }),
    handoffUrl: handoffUrl.href,
    handoffServiceToken: requiredValue(environment.XV_ADMIN_IDENTITY_HANDOFF_SERVICE_TOKEN),
  };
}

export function isLocalAdminTransport(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.APP_ENV === "local" && environment.XV_ADMIN_LOCAL_TRANSPORT === "true";
}

function createLocalAdminBffTransportConfig(input: Omit<BffTransportConfig, "privateApiUrl"> & { privateApiUrl: URL }): BffTransportConfig {
  if (!isLocalApiUrl(input.privateApiUrl) || input.bffOrigin !== "http://localhost:3003" || !isValidBffCsrfConfig({ ...input, bffOrigin: "https://placeholder.invalid" }) || !Number.isInteger(input.requestTimeoutMs) || input.requestTimeoutMs < 100 || input.requestTimeoutMs > 30_000) {
    throw new Error("Invalid local admin BFF transport configuration.");
  }
  return Object.freeze({ ...input, privateApiUrl: input.privateApiUrl.href });
}

function isLocalApiUrl(url: URL): boolean {
  return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === "3001" && !url.username && !url.password;
}

function isVerificationKey(key: VerificationKey): boolean {
  return Boolean(key.kid) && key.key.kid === key.kid && isPublicEs256Key(key.key);
}

function verifierKeys(config: IssuerCredentialConfig): VerificationKey[] {
  return config.previous ? [config.active, config.previous] : [config.active];
}

function samePublicKey(left: Jwk, right: Jwk): boolean {
  return left.kty === right.kty && left.crv === right.crv && left.x === right.x && left.y === right.y;
}

function isPublicEs256Key(key: Jwk): boolean {
  if (key.kty !== "EC" || key.crv !== "P-256" || typeof key.x !== "string" || typeof key.y !== "string" || key.d) {
    return false;
  }
  try {
    createPublicKey({ key: key as unknown as NodeJsonWebKey, format: "jwk" });
    return true;
  } catch {
    return false;
  }
}

function isPrivateEs256Key(key: Jwk): boolean {
  if (key.kty !== "EC" || key.crv !== "P-256" || typeof key.x !== "string" || typeof key.y !== "string" || typeof key.d !== "string") {
    return false;
  }
  try {
    createPrivateKey({ key: key as unknown as NodeJsonWebKey, format: "jwk" });
    return true;
  } catch {
    return false;
  }
}

function isCredentialLifetime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 1 && value <= 300;
}

function privateKeyMatchesPublicKey(privateKey: Jwk, publicKey: Jwk): boolean {
  try {
    const derived = createPublicKey(createPrivateKey({ key: privateKey as unknown as NodeJsonWebKey, format: "jwk" })).export({ format: "jwk" });
    return derived.x === publicKey.x && derived.y === publicKey.y;
  } catch {
    return false;
  }
}

function requiredValue(value: string | undefined): string {
  if (!value?.trim()) throw new Error("Invalid BFF transport configuration.");
  return value;
}
function requiredBrowserValue(value: string | undefined): string { if (!value?.trim()) throw new Error("Invalid browser authentication configuration."); return value; }
function requiredOrigins(value: string | undefined): string[] { const origins = value?.split(",").map((item) => item.trim()).filter(Boolean) ?? []; if (!origins.length || new Set(origins).size !== origins.length || !origins.every(isExactHttpsOrigin)) throw new Error("Invalid browser authentication configuration."); return origins; }
function requiredReturnUrls(value: string | undefined): string[] {
  const urls = value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (!urls.length || new Set(urls).size !== urls.length || !urls.every(isCanonicalHttpsReturnUrl)) throw new Error("Invalid browser authentication configuration.");
  return urls;
}

function requiredUrl(value: string | undefined): URL {
  try { return new URL(requiredValue(value)); } catch { throw new Error("Invalid BFF transport configuration."); }
}

function requiredExactHttpsOrigin(value: string | undefined): string {
  const origin = requiredValue(value);
  if (!isExactHttpsOrigin(origin)) throw new Error("Invalid BFF transport configuration.");
  return origin;
}

function requiredInteger(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("Invalid BFF transport configuration.");
  return parsed;
}

function parsePrivateOrPublicJwk(value: string, privateKey: boolean): Jwk {
  try {
    const key = JSON.parse(value) as Jwk;
    if (privateKey ? !isPrivateEs256Key(key) : !isPublicEs256Key(key)) throw new Error("invalid key");
    return key;
  } catch { throw new Error("Invalid admin BFF signing configuration."); }
}

function isExactHttpsOrigin(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && url.origin === value; } catch { return false; }
}

function isCanonicalHttpsReturnUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.hash && url.href === value; } catch { return false; }
}

function isValidBffCsrfConfig(input: BffCsrfConfig): boolean {
  return isExactHttpsOrigin(input.bffOrigin)
    && typeof input.csrfSigningSecret === "string" && input.csrfSigningSecret.length >= 32
    && Number.isInteger(input.csrfLifetimeSeconds) && input.csrfLifetimeSeconds >= 60 && input.csrfLifetimeSeconds <= 3600;
}
