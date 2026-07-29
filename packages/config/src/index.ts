import { createPrivateKey, createPublicKey, type JsonWebKey as NodeJsonWebKey } from "node:crypto";

import { apiAudience, bffIssuers, type BffIssuer } from "@xuyenviet/contracts";

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
export type BffTransportConfig = {
  readonly privateApiUrl: string;
  readonly bffOrigin: string;
  readonly csrfSigningSecret: string;
  readonly csrfLifetimeSeconds: number;
  readonly requestTimeoutMs: number;
};

export function isAiAskApiEnabled(environment: { APP_ENV?: string; XV_AI_ASK_API_ENABLED?: string } = process.env as unknown as { APP_ENV?: string; XV_AI_ASK_API_ENABLED?: string }): boolean {
  const value = environment.XV_AI_ASK_API_ENABLED;
  if (value === undefined || value === "" || value === "false") return false;
  if (value !== "true" || !["local", "development", "test", "staging", "production"].includes(environment.APP_ENV ?? "development")) {
    throw new Error("Invalid AI Ask API cutover configuration.");
  }
  return true;
}

export function createBffTransportConfig(input: Omit<BffTransportConfig, "privateApiUrl"> & { privateApiUrl: URL }): BffTransportConfig {
  if (
    !(input.privateApiUrl instanceof URL) || input.privateApiUrl.protocol !== "https:" || input.privateApiUrl.hostname !== apiAudience || input.privateApiUrl.username || input.privateApiUrl.password ||
    !isExactHttpsOrigin(input.bffOrigin) ||
    typeof input.csrfSigningSecret !== "string" || input.csrfSigningSecret.length < 32 ||
    !Number.isInteger(input.csrfLifetimeSeconds) || input.csrfLifetimeSeconds < 60 || input.csrfLifetimeSeconds > 3600 ||
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
  const bffOrigin = requiredExactHttpsOrigin(environment.XV_WEB_BFF_ORIGIN);
  const csrfSigningSecret = requiredValue(environment.XV_BFF_CSRF_SIGNING_SECRET);
  return createBffTransportConfig({
    privateApiUrl,
    bffOrigin,
    csrfSigningSecret,
    csrfLifetimeSeconds: requiredInteger(environment.XV_BFF_CSRF_LIFETIME_SECONDS),
    requestTimeoutMs: requiredInteger(environment.XV_BFF_REQUEST_TIMEOUT_MS),
  });
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

function isVerificationKey(key: VerificationKey): boolean {
  return Boolean(key.kid) && key.key.kid === key.kid && isPublicEs256Key(key.key);
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

function isExactHttpsOrigin(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && url.origin === value; } catch { return false; }
}
