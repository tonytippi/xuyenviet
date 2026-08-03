import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual as secureEqual } from "node:crypto";
import { Reflector } from "@nestjs/core";
import { decodeJwt, importJWK, jwtVerify, type JWTPayload } from "jose";

import { apiAudience, isBffIssuer, isRequestRole, type InternalCredentialClaims, type RequestPrincipal } from "@xuyenviet/contracts";
import { type BffCredentialConfig, type BrowserAuthConfig } from "@xuyenviet/config";
import { type ApiIdentityRepository, type BrowserIdentityRepository, type ReleaseSchemaVersionRepository } from "@xuyenviet/database";

import { PUBLIC_ROUTE } from "./public-route.decorator";
import { IDEMPOTENT_BROWSER_LOGOUT } from "./idempotent-browser-logout.decorator";
import { BROWSER_AUTH_CONFIG, cookieValue, type BrowserAuthConfigProvider } from "./browser-auth";
import { API_CONFIGURATION_VALID, API_RELEASE_PHASE_POLICY, isApiReady, RELEASE_SCHEMA_VERSION_REPOSITORY } from "../release-schema";

type RequestWithPrincipal = { method: string; headers: { authorization?: string; "x-request-id"?: string | string[]; cookie?: string; origin?: string; "x-xuyenviet-csrf"?: string }; requestId?: string; principal?: RequestPrincipal; browserSessionId?: string; browserConfig?: BrowserAuthConfig; res?: { cookie(name: string, value: string, options: { httpOnly: boolean; secure: boolean; sameSite: "lax"; path: string; expires: Date }): void } };
export const BFF_CREDENTIAL_CONFIG = Symbol("BFF_CREDENTIAL_CONFIG");
export const API_IDENTITY_REPOSITORY = Symbol("API_IDENTITY_REPOSITORY");

@Injectable()
export class ResourceServerGuard implements CanActivate {
  constructor(
    @Inject(BFF_CREDENTIAL_CONFIG) private readonly config: BffCredentialConfig,
    @Inject(API_IDENTITY_REPOSITORY) private readonly identities: ApiIdentityRepository,
    // esbuild does not preserve constructor metadata for this external Nest
    // dependency in the bundled API entrypoint, so keep the token explicit.
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(BROWSER_AUTH_CONFIG) private readonly browserAuth: BrowserAuthConfigProvider,
    @Optional() @Inject(RELEASE_SCHEMA_VERSION_REPOSITORY) private readonly schemaVersions?: ReleaseSchemaVersionRepository,
    @Optional() @Inject(API_CONFIGURATION_VALID) private readonly configValid?: boolean,
    @Optional() @Inject(API_RELEASE_PHASE_POLICY) private readonly releasePhasePolicy?: import("@xuyenviet/contracts").SchemaReleasePhasePolicy | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    if (request.headers.authorization === undefined) {
      await this.browserAdmission(request, this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_BROWSER_LOGOUT, [context.getHandler(), context.getClass()]) === true);
      await this.requireApiReady();
      return true;
    }
    try {
      const token = bearerToken(request.headers.authorization);
      if (!token) throw new Error("invalid bearer credential");
      const payload = decodeJwt(token);
      if (!isBffIssuer(payload.iss)) {
        throw new Error("invalid issuer");
      }
      const issuer = this.config.issuers[payload.iss];
      const { protectedHeader } = await jwtVerify(token, await keyForToken(issuer, token), {
        issuer: payload.iss,
        audience: apiAudience,
        algorithms: ["ES256"],
      });
      if (!protectedHeader.kid) {
        throw new Error("missing key id");
      }
      const claims = validateClaims(payload);
      let session;
      try {
        session = claims.iss === "xuyenviet-admin-bff"
          ? await this.adminSession(claims.sid)
          : await this.identities.getSession(claims.sid);
      } catch {
        throw new IdentityUnavailableError();
      }
      if (!session || session.userId !== claims.sub || session.expires <= new Date() || session.authorizationVersion !== claims.rv) {
        throw new Error("stale identity");
      }
      request.principal = {
        userId: claims.sub,
        sessionId: claims.sid,
        roles: claims.roles,
        authorizationVersion: claims.rv,
        transport: "bff_bearer",
        issuer: claims.iss,
        tokenId: claims.jti,
      };
    } catch (error) {
      if (error instanceof IdentityUnavailableError) {
        throw new ServiceUnavailableException({ code: "internal_error" });
      }
      throw unauthorized(request);
    }
    await this.requireApiReady();
    return true;
  }

  private async browserAdmission(request: RequestWithPrincipal, permitStaleLogout = false): Promise<boolean> {
    const config = this.browserAuth.config; const sessionId = config ? cookieValue(request.headers.cookie, config.cookieName) : null;
    if (!config || !sessionId) throw unauthorized(request);
    const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (request.headers.origin && !config.allowedOrigins.includes(request.headers.origin)) throw forbidden(request, "forbidden");
    if (!safeMethod && (!request.headers.origin || !config.allowedOrigins.includes(request.headers.origin))) throw forbidden(request, "forbidden");
    try {
      const identity = await (this.identities as BrowserIdentityRepository).getBrowserSession(sessionId);
      if (!identity || identity.expires <= new Date() || identity.roles.length === 0 || !identity.roles.every(isRequestRole)) {
        if (!permitStaleLogout || safeMethod) throw new Error("stale identity");
        const csrf = request.headers["x-xuyenviet-csrf"];
        const staleCsrfHash = await (this.identities as BrowserIdentityRepository).getBrowserLogoutCsrfHash(sessionId);
        const expectedCsrfHash = staleCsrfHash ?? createHmac("sha256", config.csrfKey).update(`${sessionId}.${createHmac("sha256", config.csrfKey).update(`nonce.${sessionId}`).digest("base64url")}`).digest("base64url");
        if (!csrf || !timingSafeEqual(expectedCsrfHash, createHmac("sha256", config.csrfKey).update(`${sessionId}.${csrf}`).digest("base64url"))) throw forbidden(request, "csrf_invalid");
        request.principal = { userId: "", sessionId, roles: [], authorizationVersion: 0, transport: "browser_session" };
        return true;
      }
      if (!safeMethod) {
        const csrf = request.headers["x-xuyenviet-csrf"];
        if (!csrf || !timingSafeEqual(identity.csrfHash, createHmac("sha256", config.csrfKey).update(`${sessionId}.${csrf}`).digest("base64url"))) throw forbidden(request, "csrf_invalid");
      }
      request.principal = { userId: identity.userId, sessionId, roles: identity.roles, authorizationVersion: identity.authorizationVersion, transport: "browser_session" };
      request.browserSessionId = sessionId; request.browserConfig = config;
      if (identity.expires.getTime() - Date.now() < 7 * 24 * 60 * 60_000) {
        const expires = new Date(Date.now() + 30 * 24 * 60 * 60_000);
        if (!await (this.identities as BrowserIdentityRepository).renewBrowserSession(sessionId, expires)) throw new Error("stale identity");
        request.res?.cookie(config.cookieName, sessionId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires });
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof Error && error.message === "stale identity") throw unauthorized(request);
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
    return true;
  }

  private async requireApiReady(): Promise<void> {
    if (this.schemaVersions && !await isApiReady({ configValid: this.configValid ?? false, repository: this.schemaVersions, releasePhasePolicy: this.releasePhasePolicy })) {
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
  }

  private async adminSession(sessionId: string) {
    if (!this.identities.getAdminSession) throw new IdentityUnavailableError();
    return this.identities.getAdminSession(sessionId);
  }
}

class IdentityUnavailableError extends Error {}

async function keyForToken(issuer: BffCredentialConfig["issuers"][keyof BffCredentialConfig["issuers"]], token: string) {
  const { kid } = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as { kid?: unknown };
  if (typeof kid !== "string") {
    throw new Error("missing key id");
  }
  const now = new Date();
  const key = issuer.active.kid === kid
    ? issuer.active.key
    : issuer.previous?.kid === kid && issuer.previous.verificationEndsAt !== undefined && issuer.previous.verificationEndsAt > now
      ? issuer.previous.key
      : null;
  if (!key) {
    throw new Error("unknown key id");
  }
  return importJWK(key, "ES256");
}

function validateClaims(payload: JWTPayload): InternalCredentialClaims {
  const expected = ["aud", "exp", "iat", "iss", "jti", "nbf", "roles", "rv", "sid", "sub"];
  if (Object.keys(payload).sort().join(",") !== expected.join(",")) {
    throw new Error("unexpected claims");
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    typeof payload.sub !== "string" || !payload.sub ||
    typeof payload.sid !== "string" || !payload.sid ||
    !Array.isArray(payload.roles) || !payload.roles.every(isRequestRole) ||
    payload.roles.some((role, index, roles) => index > 0 && roles[index - 1] > role) ||
    typeof payload.rv !== "number" || !Number.isInteger(payload.rv) || payload.rv < 1 ||
    typeof payload.jti !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.jti) ||
    !isBffIssuer(payload.iss) || payload.aud !== apiAudience ||
    typeof payload.iat !== "number" || typeof payload.nbf !== "number" || typeof payload.exp !== "number" ||
    payload.iat > now || payload.nbf > now || payload.exp <= now || payload.exp - payload.iat > 300
  ) {
    throw new Error("invalid claims");
  }
  return payload as InternalCredentialClaims;
}

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer ([A-Za-z0-9_\-.]+)$/.exec(header ?? "");
  return match?.[1] ?? null;
}

function unauthorized(request: RequestWithPrincipal) {
  return new UnauthorizedException({ code: "unauthorized", message: "Không được phép truy cập.", requestId: request.requestId ?? crypto.randomUUID() });
}
function forbidden(request: RequestWithPrincipal, code: "forbidden" | "csrf_invalid") { return new ForbiddenException({ code, requestId: request.requestId ?? crypto.randomUUID() }); }
function timingSafeEqual(left: string, right: string) { return left.length === right.length && secureEqual(Buffer.from(left), Buffer.from(right)); }
