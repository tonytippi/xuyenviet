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
  if (input.audience !== apiAudience || input.maxLifetimeSeconds < 1 || input.maxLifetimeSeconds > 300) {
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
    input.maxLifetimeSeconds < 1 ||
    input.maxLifetimeSeconds > 300 ||
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
  return key.kty === "EC" && key.crv === "P-256" && typeof key.x === "string" && typeof key.y === "string" && !key.d;
}

function isPrivateEs256Key(key: Jwk): boolean {
  return key.kty === "EC" && key.crv === "P-256" && typeof key.x === "string" && typeof key.y === "string" && typeof key.d === "string";
}

function privateKeyMatchesPublicKey(privateKey: Jwk, publicKey: Jwk): boolean {
  try {
    const derived = createPublicKey(createPrivateKey({ key: privateKey as unknown as NodeJsonWebKey, format: "jwk" })).export({ format: "jwk" });
    return derived.x === publicKey.x && derived.y === publicKey.y;
  } catch {
    return false;
  }
}
