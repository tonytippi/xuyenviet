import "server-only";

import { randomUUID } from "node:crypto";

import { SignJWT, importJWK } from "jose";
import { and, eq, gt } from "drizzle-orm";

import { apiAudience, type InternalCredentialClaims, type RequestRole } from "@xuyenviet/contracts";
import { createWebBffSigningConfig, type WebBffSigningConfig } from "@xuyenviet/config";

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
  config = getBffCredentialConfig(),
  dependencies: BffCredentialDependencies = defaultDependencies,
): Promise<string> {
  const authenticatedSession = await dependencies.getAuthenticatedSession();
  if (!authenticatedSession) {
    throw new BffCredentialError();
  }
  const userId = authenticatedSession.userId;
  const sessionToken = await dependencies.resolveBffSessionToken(userId);
  if (!sessionToken) {
    throw new BffCredentialError();
  }
  return mintCredentialForValidatedSession(userId, sessionToken, config);
}

async function mintCredentialForValidatedSession(userId: string, sessionToken: string, config: WebBffSigningConfig): Promise<string> {
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
  const signingKey = await importJWK(config.active.privateKey, "ES256");
  return new SignJWT({ sid: claims.sid, roles: claims.roles, rv: claims.rv, jti: claims.jti })
    .setProtectedHeader({ alg: "ES256", kid: config.active.kid })
    .setSubject(claims.sub)
    .setIssuer(claims.iss)
    .setAudience(claims.aud)
    .setIssuedAt(claims.iat)
    .setNotBefore(claims.nbf)
    .setExpirationTime(claims.exp)
    .sign(signingKey);
}

function getBffCredentialConfig(): WebBffSigningConfig {
  return createWebBffSigningConfig({
    audience: apiAudience,
    maxLifetimeSeconds: 300,
    issuer: webIssuer,
    active: {
      kid: required("XV_WEB_BFF_ACTIVE_KID"),
      publicKey: parseJwk("XV_WEB_BFF_ACTIVE_JWK"),
      privateKey: parseJwk("XV_WEB_BFF_ACTIVE_PRIVATE_JWK"),
    },
  });
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
    if (!key || key.kty !== "EC" || key.crv !== "P-256" || typeof key.x !== "string" || typeof key.y !== "string") {
      throw new Error("invalid key");
    }
    return key as JsonWebKey & { kty: "EC"; crv: "P-256" };
  } catch {
    throw new BffCredentialError();
  }
}
