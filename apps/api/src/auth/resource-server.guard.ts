import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual as secureEqual } from "node:crypto";
import { Reflector } from "@nestjs/core";

import { isRequestRole, type RequestPrincipal } from "@xuyenviet/contracts";
import { type BrowserAuthConfig } from "@xuyenviet/config";
import { type ApiIdentityRepository, type BrowserIdentityRepository, type ReleaseSchemaVersionRepository } from "@xuyenviet/database";

import { PUBLIC_ROUTE } from "./public-route.decorator";
import { IDEMPOTENT_BROWSER_LOGOUT } from "./idempotent-browser-logout.decorator";
import { BROWSER_AUTH_CONFIG, cookieValue, type BrowserAuthConfigProvider } from "./browser-auth";
import { API_CONFIGURATION_VALID, API_RELEASE_PHASE_POLICY, isApiReady, RELEASE_SCHEMA_VERSION_REPOSITORY } from "../release-schema";

type RequestWithPrincipal = { method: string; headers: { authorization?: string; "x-request-id"?: string | string[]; cookie?: string; origin?: string; "x-xuyenviet-csrf"?: string }; requestId?: string; principal?: RequestPrincipal; browserSessionId?: string; browserConfig?: BrowserAuthConfig; res?: { cookie(name: string, value: string, options: { httpOnly: boolean; secure: boolean; sameSite: "lax"; path: string; expires: Date }): void } };
export const API_IDENTITY_REPOSITORY = Symbol("API_IDENTITY_REPOSITORY");

@Injectable()
export class ResourceServerGuard implements CanActivate {
  constructor(
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
    if (request.headers.authorization) throw unauthorized(request);
    await this.browserAdmission(request, this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_BROWSER_LOGOUT, [context.getHandler(), context.getClass()]) === true);
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
        request.principal = { userId: "", sessionId, roles: [], authorizationVersion: 0 };
        return true;
      }
      if (!safeMethod) {
        const csrf = request.headers["x-xuyenviet-csrf"];
        if (!csrf || !timingSafeEqual(identity.csrfHash, createHmac("sha256", config.csrfKey).update(`${sessionId}.${csrf}`).digest("base64url"))) throw forbidden(request, "csrf_invalid");
      }
      request.principal = { userId: identity.userId, sessionId, roles: identity.roles, authorizationVersion: identity.authorizationVersion, name: identity.name, email: identity.email };
      request.browserSessionId = sessionId; request.browserConfig = config;
      if (identity.expires.getTime() - Date.now() < 7 * 24 * 60 * 60_000) {
        const expires = new Date(Date.now() + 30 * 24 * 60 * 60_000);
        if (!await (this.identities as BrowserIdentityRepository).renewBrowserSession(sessionId, expires)) throw new Error("stale identity");
        request.res?.cookie(config.cookieName, sessionId, { httpOnly: true, secure: new URL(config.callbackUrl).protocol === "https:", sameSite: "lax", path: "/", expires });
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

}


function unauthorized(request: RequestWithPrincipal) {
  return new UnauthorizedException({ code: "unauthorized", message: "Không được phép truy cập.", requestId: request.requestId ?? crypto.randomUUID() });
}
function forbidden(request: RequestWithPrincipal, code: "forbidden" | "csrf_invalid") { return new ForbiddenException({ code, requestId: request.requestId ?? crypto.randomUUID() }); }
function timingSafeEqual(left: string, right: string) { return left.length === right.length && secureEqual(Buffer.from(left), Buffer.from(right)); }
