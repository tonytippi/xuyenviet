import { apiAudience, bffIssuers, type BffIssuer } from "@xuyenviet/contracts";

export type Jwk = JsonWebKey & { kty: "EC"; crv: "P-256"; kid?: string };
export type VerificationKey = { kid: string; key: Jwk; verificationEndsAt?: Date };
export type IssuerCredentialConfig = {
  issuer: BffIssuer;
  active: VerificationKey & { privateKey?: Jwk };
  previous?: VerificationKey;
};
export type BffCredentialConfig = {
  audience: typeof apiAudience;
  maxLifetimeSeconds: number;
  issuers: Record<BffIssuer, IssuerCredentialConfig>;
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
    if (!config || config.issuer !== issuer || !isEs256Key(config.active.key) || !config.active.kid) {
      throw new Error("Invalid BFF issuer configuration.");
    }
    if (config.active.privateKey && !isEs256Key(config.active.privateKey)) {
      throw new Error("Invalid BFF signing key.");
    }
    if (
      config.previous &&
      (!isEs256Key(config.previous.key) ||
        !config.previous.kid ||
        !(config.previous.verificationEndsAt instanceof Date) ||
        !Number.isFinite(config.previous.verificationEndsAt.getTime()) ||
        config.previous.verificationEndsAt <= new Date())
    ) {
      throw new Error("Invalid BFF previous verification key.");
    }
  }
  return input;
}

function isEs256Key(key: Jwk): boolean {
  return key.kty === "EC" && key.crv === "P-256";
}
