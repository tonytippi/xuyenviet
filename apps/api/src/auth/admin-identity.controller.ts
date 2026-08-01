import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Post, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { evaluateSchemaAdmission, futureAdminSchemaCompatibilityConsumer, permitsAdminCapability, type AdminIdentityHandoffRequest, type AdminIdentityHandoffResponse, type AdminReadinessResponse, type SchemaCompatibilityDeclaration } from "@xuyenviet/contracts";
import type { AdminIdentityRepository, ApiIdentityRepository, ReleaseSchemaVersionRepository } from "@xuyenviet/database";

import { API_IDENTITY_REPOSITORY } from "./resource-server.guard";
import { PublicRoute } from "./public-route.decorator";
import { API_CONFIGURATION_VALID, API_RELEASE_PHASE_POLICY, RELEASE_SCHEMA_VERSION_REPOSITORY } from "../release-schema";

export const ADMIN_IDENTITY_SERVICE_TOKEN = Symbol("ADMIN_IDENTITY_SERVICE_TOKEN");
const adminOAuthTransactionPurgeLimit = 100;

export class AdminIdentityHandoffDto {
  constructor(readonly sessionId: string, readonly subject?: string) {}
  static parse(value: unknown): { ok: true; value: AdminIdentityHandoffDto } | { ok: false } {
    return validHandoff(value) ? { ok: true, value: new AdminIdentityHandoffDto(value.sessionId, value.subject) } : { ok: false };
  }
}

export class AdminOAuthStartDto {
  constructor(readonly callbackUrl: string) {}
  static parse(value: unknown): { ok: true; value: AdminOAuthStartDto } | { ok: false } {
    return isRecord(value) && typeof value.callbackUrl === "string" && isAdminCallbackUrl(value.callbackUrl)
      ? { ok: true, value: new AdminOAuthStartDto(value.callbackUrl) } : { ok: false };
  }
}

export class AdminOAuthCallbackDto {
  constructor(readonly code: string, readonly state: string, readonly transactionId: string) {}
  static parse(value: unknown): { ok: true; value: AdminOAuthCallbackDto } | { ok: false } {
    return isRecord(value) && validSessionId(value.code) && validSessionId(value.state) && validSessionId(value.transactionId)
      ? { ok: true, value: new AdminOAuthCallbackDto(value.code, value.state, value.transactionId) } : { ok: false };
  }
}

export class AdminReadinessDto {
  constructor(readonly declaration: SchemaCompatibilityDeclaration) {}
  static parse(value: unknown): { ok: true; value: AdminReadinessDto } | { ok: false } {
    const declaration = isRecord(value) ? value.declaration : undefined;
    return isDeclaration(declaration) ? { ok: true, value: new AdminReadinessDto(declaration) } : { ok: false };
  }
}

@Controller("internal/admin-identity")
@PublicRoute()
export class AdminIdentityController {
  constructor(
    @Inject(API_IDENTITY_REPOSITORY) private readonly identities: ApiIdentityRepository,
    @Inject(ADMIN_IDENTITY_SERVICE_TOKEN) private readonly serviceToken: string | undefined,
    @Inject(RELEASE_SCHEMA_VERSION_REPOSITORY) private readonly schemaVersions: ReleaseSchemaVersionRepository,
    @Inject(API_CONFIGURATION_VALID) private readonly configValid: boolean,
    @Inject(API_RELEASE_PHASE_POLICY) private readonly releasePhasePolicy: import("@xuyenviet/contracts").SchemaReleasePhasePolicy | null | undefined,
  ) {}

  @Post("handoff")
  @HttpCode(HttpStatus.OK)
  async handoff(@Headers("authorization") authorization: string | undefined, @Body() body: AdminIdentityHandoffDto): Promise<AdminIdentityHandoffResponse> {
    this.assertService(authorization);
    await this.assertAdmitted();
    const parsed = AdminIdentityHandoffDto.parse(body);
    if (!parsed.ok) throw this.denied();
    body = parsed.value;
    try {
      if (!isAdminIdentityRepository(this.identities)) throw new Error("Admin identity handoff is unavailable.");
      const identity = await this.identities.resolveAdminHandoff(body.sessionId, body.subject);
      if (!identity || !permitsAdminCapability(identity.roles, "admin.workspace.read")) throw this.denied();
      return { identity };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
  }

  @Post("oauth/start")
  async startOAuth(@Headers("authorization") authorization: string | undefined, @Body() body: AdminOAuthStartDto): Promise<{ redirectUrl: string; transactionId: string }> {
    this.assertService(authorization);
    await this.assertAdmitted();
    const parsed = AdminOAuthStartDto.parse(body);
    if (!parsed.ok) throw this.denied();
    body = parsed.value;
    try {
      if (!isAdminIdentityRepository(this.identities)) throw new Error("Admin identity handoff is unavailable.");
      const transactionId = randomUUID(); const state = randomBytes(32).toString("base64url"); const codeVerifier = randomBytes(48).toString("base64url");
      await this.identities.purgeExpiredAdminOAuthTransactions(adminOAuthTransactionPurgeLimit);
      await this.identities.createAdminOAuthTransaction({ id: transactionId, state, codeVerifier, callbackUrl: body.callbackUrl, expires: new Date(Date.now() + 10 * 60_000) });
      const query = new URLSearchParams({ client_id: this.google.clientId, redirect_uri: body.callbackUrl, response_type: "code", scope: "openid email profile", state, code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"), code_challenge_method: "S256" });
      return { redirectUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}`, transactionId };
    } catch (error) {
      // A consumed/mismatched state is an authentication denial, not an upstream outage.
      if (isUnauthorized(error)) throw error;
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
  }

  @Post("oauth/callback")
  async completeOAuth(@Headers("authorization") authorization: string | undefined, @Body() body: AdminOAuthCallbackDto): Promise<{ sessionId: string }> {
    this.assertService(authorization);
    await this.assertAdmitted();
    const parsed = AdminOAuthCallbackDto.parse(body);
    if (!parsed.ok) throw this.denied();
    body = parsed.value;
    try {
      if (!isAdminIdentityRepository(this.identities)) throw new Error("Admin identity handoff is unavailable.");
      const transaction = await this.identities.consumeAdminOAuthTransaction(body.transactionId, body.state);
      if (!transaction) throw new OAuthStateDeniedError();
      const tokenResponse = await googleRequest("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: body.code, client_id: this.google.clientId, client_secret: this.google.clientSecret, redirect_uri: transaction.callbackUrl, grant_type: "authorization_code", code_verifier: transaction.codeVerifier }) });
      const token: unknown = await tokenResponse.json().catch(() => null);
      if (!tokenResponse.ok || !token || typeof token !== "object" || typeof (token as { access_token?: unknown }).access_token !== "string") throw this.denied();
      const profileResponse = await googleRequest("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${(token as { access_token: string }).access_token}` } });
       const profile: unknown = await profileResponse.json().catch(() => null);
       if (!profileResponse.ok || !profile || typeof profile !== "object" || typeof (profile as { sub?: unknown }).sub !== "string") throw this.denied();
       const subject = (profile as { sub: string }).sub;
       const roles = await this.identities.resolveAdminRolesForGoogleAccount(subject);
       if (!roles || !permitsAdminCapability(roles, "admin.workspace.read")) throw this.denied();
       const sessionId = await this.identities.createAdminSessionForGoogleAccount(subject, new Date(Date.now() + 8 * 60 * 60_000));
      if (!sessionId) throw this.denied();
      return { sessionId };
    } catch (error) {
      // A consumed/mismatched state is an authentication denial, not an upstream outage.
      if (error instanceof OAuthStateDeniedError || isUnauthorized(error)) throw this.denied();
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
  }

  @Post("revoke")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Headers("authorization") authorization: string | undefined, @Body() body: AdminIdentityHandoffDto): Promise<void> {
    this.assertService(authorization);
    await this.assertAdmitted();
    const parsed = AdminIdentityHandoffDto.parse(body);
    if (!parsed.ok) throw this.denied();
    body = parsed.value;
    try {
      if (!isAdminIdentityRepository(this.identities)) throw new Error("Admin identity handoff is unavailable.");
      const identity = await this.identities.resolveAdminHandoff(body.sessionId, body.subject);
      if (!identity || identity.sessionId !== body.sessionId || identity.subject !== body.subject) throw this.denied();
      await this.identities.revokeAdminSession(body.sessionId);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
  }

  @Post("readiness")
  async readiness(@Headers("authorization") authorization: string | undefined, @Body() body: AdminReadinessDto): Promise<AdminReadinessResponse> {
    this.assertService(authorization);
    const parsed = AdminReadinessDto.parse(body);
    if (!parsed.ok) throw this.denied();
    body = parsed.value;
    return { ready: await isAdminReady({ configValid: this.configValid, repository: this.schemaVersions, releasePhasePolicy: this.releasePhasePolicy, declaration: body?.declaration }) };
  }

  private assertService(authorization: string | undefined) {
    if (!this.serviceToken || authorization !== `Bearer ${this.serviceToken}`) throw this.denied();
  }
  private async assertAdmitted() {
    if (!await isAdminReady({ configValid: this.configValid, repository: this.schemaVersions, releasePhasePolicy: this.releasePhasePolicy, declaration: futureAdminSchemaCompatibilityConsumer.declaration })) {
      throw new ServiceUnavailableException({ code: "identity_unavailable" });
    }
  }
  private denied() { return new UnauthorizedException({ code: "unauthorized", message: "Không được phép truy cập." }); }
  private get google() {
    const clientId = process.env.XV_ADMIN_GOOGLE_CLIENT_ID; const clientSecret = process.env.XV_ADMIN_GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("Admin Google identity configuration is invalid.");
    return { clientId, clientSecret };
  }
}

export async function isAdminReady(input: { configValid: boolean; repository: ReleaseSchemaVersionRepository; releasePhasePolicy?: import("@xuyenviet/contracts").SchemaReleasePhasePolicy | null; declaration?: SchemaCompatibilityDeclaration }): Promise<boolean> {
  if (!input.configValid || !sameDeclaration(input.declaration, futureAdminSchemaCompatibilityConsumer.declaration)) return false;
  try {
    if (input.releasePhasePolicy === null) return false;
    if (input.releasePhasePolicy === undefined) return await input.repository.hasCompatibleSchemaVersion(futureAdminSchemaCompatibilityConsumer.declaration);
    if (!input.repository.readSchemaAdmission) return false;
    const admission = await input.repository.readSchemaAdmission();
    const declared = input.releasePhasePolicy.workloads.admin;
    return sameDeclaration(declared, futureAdminSchemaCompatibilityConsumer.declaration)
      && futureAdminSchemaCompatibilityConsumer.admits(admission.rows)
      && admission.resolvedTargetIdentity === input.releasePhasePolicy.target.resolvedIdentity
      && evaluateSchemaAdmission(declared, admission.rows).compatible;
  } catch { return false; }
}

function validHandoff(value: unknown): value is AdminIdentityHandoffRequest {
  return !!value && typeof value === "object" && validSessionId((value as AdminIdentityHandoffRequest).sessionId) && ((value as AdminIdentityHandoffRequest).subject === undefined || validSessionId((value as AdminIdentityHandoffRequest).subject));
}
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function isDeclaration(value: unknown): value is SchemaCompatibilityDeclaration {
  return isRecord(value) && (value.workload === "web" || value.workload === "api" || value.workload === "worker" || value.workload === "admin")
    && typeof value.minimumVersion === "string" && typeof value.maximumVersion === "string";
}
class OAuthStateDeniedError extends Error {}
function isUnauthorized(error: unknown): error is UnauthorizedException {
  return error instanceof UnauthorizedException || (typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === HttpStatus.UNAUTHORIZED);
}
function validSessionId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value; }
function isAdminIdentityRepository(value: ApiIdentityRepository): value is AdminIdentityRepository { return "resolveAdminHandoff" in value && "revokeAdminSession" in value && "purgeExpiredAdminOAuthTransactions" in value; }
function isAdminCallbackUrl(value: string): boolean { try { const url = new URL(value); return url.origin === "https://admin.xuyenviet.app" && !url.username && !url.password && url.pathname === "/api/auth/callback" && !url.search && !url.hash; } catch { return false; } }
function sameDeclaration(left: SchemaCompatibilityDeclaration | undefined, right: SchemaCompatibilityDeclaration): boolean { return left?.workload === right.workload && left.minimumVersion === right.minimumVersion && left.maximumVersion === right.maximumVersion; }
async function googleRequest(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try { return await fetch(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timeout); }
}
