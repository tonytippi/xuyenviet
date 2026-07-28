import "server-only";

import { randomUUID } from "node:crypto";

import { SignJWT, importJWK } from "jose";
import { and, eq, gt } from "drizzle-orm";

import { apiAudience, type InternalCredentialClaims, type RequestRole } from "@xuyenviet/contracts";
import { createBffCredentialConfig, type BffCredentialConfig } from "@xuyenviet/config";

import { getDb } from "@/db/client";
import { sessions, userRoles, users } from "@/db/schema";

import { getAuthenticatedSession } from "./auth";
import { resolveBffSessionToken } from "./bff-session-token";

const webIssuer = "xuyenviet-web-bff" as const;

export class BffCredentialError extends Error {
  constructor() {
    super("Unable to establish an internal API credential.");
    this.name = "BffCredentialError";
  }
}

type BffCredentialDependencies = {
  getAuthenticatedSession: typeof getAuthenticatedSession;
  resolveBffSessionToken: typeof resolveBffSessionToken;
};

const defaultDependencies: BffCredentialDependencies = { getAuthenticatedSession, resolveBffSessionToken };

export async function mintWebBffCredential(
  userId: string,
  config = getBffCredentialConfig(),
  dependencies: BffCredentialDependencies = defaultDependencies,
): Promise<string> {
  const authenticatedSession = await dependencies.getAuthenticatedSession();
  if (!authenticatedSession || authenticatedSession.userId !== userId) {
    throw new BffCredentialError();
  }
  const sessionToken = await dependencies.resolveBffSessionToken(userId);
  if (!sessionToken) {
    throw new BffCredentialError();
  }
  return mintWebBffCredentialForSession(userId, sessionToken, config);
}

export async function mintWebBffCredentialForSession(userId: string, sessionToken: string, config: BffCredentialConfig): Promise<string> {
  const session = await getDb()
    .select({ sessionToken: sessions.sessionToken })
    .from(sessions)
    .where(and(eq(sessions.sessionToken, sessionToken), eq(sessions.userId, userId), gt(sessions.expires, new Date())))
    .limit(1);
  if (!session[0]) {
    throw new BffCredentialError();
  }
  const identity = await getDb()
    .select({ authorizationVersion: users.authorizationVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!identity[0]) {
    throw new BffCredentialError();
  }
  const roles = (await getDb().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId)))
    .map((row) => row.role as RequestRole)
    .sort();
  const issuer = config.issuers[webIssuer];
  if (!issuer.active.privateKey) {
    throw new BffCredentialError();
  }
  const now = Math.floor(Date.now() / 1000);
  const claims: InternalCredentialClaims = {
    sub: userId,
    sid: sessionToken,
    roles,
    rv: identity[0].authorizationVersion,
    jti: randomUUID(),
    iss: webIssuer,
    aud: apiAudience,
    iat: now,
    nbf: now,
    exp: now + config.maxLifetimeSeconds,
  };
  const signingKey = await importJWK(issuer.active.privateKey, "ES256");
  return new SignJWT({ sid: claims.sid, roles: claims.roles, rv: claims.rv, jti: claims.jti })
    .setProtectedHeader({ alg: "ES256", kid: issuer.active.kid })
    .setSubject(claims.sub)
    .setIssuer(claims.iss)
    .setAudience(claims.aud)
    .setIssuedAt(claims.iat)
    .setNotBefore(claims.nbf)
    .setExpirationTime(claims.exp)
    .sign(signingKey);
}

function getBffCredentialConfig(): BffCredentialConfig {
  return createBffCredentialConfig({
    audience: apiAudience,
    maxLifetimeSeconds: 300,
    issuers: {
      "xuyenviet-web-bff": loadIssuer("xuyenviet-web-bff", "XV_WEB_BFF"),
      "xuyenviet-admin-bff": loadIssuer("xuyenviet-admin-bff", "XV_ADMIN_BFF"),
    },
  });
}

function loadIssuer(issuer: "xuyenviet-web-bff" | "xuyenviet-admin-bff", prefix: string) {
  const active = parseJwk(`${prefix}_ACTIVE_JWK`);
  const privateKey = parseJwk(`${prefix}_ACTIVE_PRIVATE_JWK`);
  const previousValue = process.env[`${prefix}_PREVIOUS_JWK`];
  const previousEndsAt = process.env[`${prefix}_PREVIOUS_VERIFICATION_ENDS_AT`];
  return {
    issuer,
    active: { kid: required(`${prefix}_ACTIVE_KID`), key: active, privateKey },
    ...(previousValue || previousEndsAt
      ? { previous: { kid: required(`${prefix}_PREVIOUS_KID`), key: parseJwk(`${prefix}_PREVIOUS_JWK`), verificationEndsAt: new Date(required(`${prefix}_PREVIOUS_VERIFICATION_ENDS_AT`)) } }
      : {}),
  };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new BffCredentialError();
  }
  return value;
}

function parseJwk(name: string) {
  try {
    const key = JSON.parse(required(name));
    if (!key || key.kty !== "EC" || key.crv !== "P-256") {
      throw new Error("invalid key");
    }
    return key as JsonWebKey & { kty: "EC"; crv: "P-256" };
  } catch {
    throw new BffCredentialError();
  }
}
