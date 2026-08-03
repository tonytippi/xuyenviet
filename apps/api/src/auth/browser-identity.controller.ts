import { Controller, Get, Headers, Inject, Post, Query, Res, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { BrowserAuthConfig } from "@xuyenviet/config";
import { BrowserGoogleAccountConflictError, type BrowserIdentityRepository } from "@xuyenviet/database";

import { API_IDENTITY_REPOSITORY } from "./resource-server.guard";
import { Principal } from "./principal.decorator";
import type { RequestPrincipal } from "@xuyenviet/contracts";
import { BROWSER_AUTH_CONFIG, cookieValue, csrfHash, csrfNonce, type BrowserAuthConfigProvider } from "./browser-auth";
import { PublicRoute } from "./public-route.decorator";
import { IdempotentBrowserLogout } from "./idempotent-browser-logout.decorator";
import { API_CONFIGURATION_VALID, API_RELEASE_PHASE_POLICY, isApiReady, RELEASE_SCHEMA_VERSION_REPOSITORY } from "../release-schema";
import type { ReleaseSchemaVersionRepository } from "@xuyenviet/database";

const sessionLifetimeMs = 30 * 24 * 60 * 60_000;
const browserOAuthTransactionPurgeLimit = 100;
const browserOAuthTransactionCookieName = "__Host-xuyenviet-browser-oauth";
const browserOAuthTransactionLifetimeMs = 10 * 60_000;
type CookieOptions = { httpOnly: boolean; secure: boolean; sameSite: "lax"; path: string };
type CookieResponse = { redirect(url: string): void; cookie(name: string, value: string, options: CookieOptions & { expires: Date }): void; clearCookie(name: string, options: CookieOptions): { status(code: number): { send(): void } }; json(value: unknown): void };

@Controller("auth")
export class BrowserIdentityController {
  constructor(
    @Inject(API_IDENTITY_REPOSITORY) private readonly identities: BrowserIdentityRepository,
    @Inject(BROWSER_AUTH_CONFIG) private readonly browserAuth: BrowserAuthConfigProvider,
    @Inject(RELEASE_SCHEMA_VERSION_REPOSITORY) private readonly schemaVersions: ReleaseSchemaVersionRepository,
    @Inject(API_CONFIGURATION_VALID) private readonly configValid: boolean,
    @Inject(API_RELEASE_PHASE_POLICY) private readonly releasePhasePolicy: import("@xuyenviet/contracts").SchemaReleasePhasePolicy | null | undefined,
  ) {}

  @Get("google")
  @PublicRoute()
  async start(@Query("returnUrl") returnUrl: string | undefined, @Query("ref") ref: string | undefined, @Res() response: CookieResponse): Promise<void> {
    const config = this.requiredConfig();
    await this.assertAdmitted();
    const allowedReturnUrl = validReturnUrl(returnUrl, config) ? returnUrl! : null;
    if (!allowedReturnUrl) throw this.denied();
    const id = randomUUID(); const state = randomBytes(32).toString("base64url"); const verifier = randomBytes(48).toString("base64url");
    try {
      await this.identities.purgeExpiredBrowserOAuthTransactions(browserOAuthTransactionPurgeLimit);
      const expires = new Date(Date.now() + browserOAuthTransactionLifetimeMs);
       await this.identities.createBrowserOAuthTransaction({ id, state, codeVerifier: verifier, returnUrl: allowedReturnUrl, referralCode: normalizeReferralCode(ref), expires });
      setTransactionCookie(response, id, expires);
      const query = new URLSearchParams({ client_id: config.googleClientId, redirect_uri: config.callbackUrl, response_type: "code", scope: "openid email profile", state: `${id}.${state}`, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
      response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
    } catch { throw new ServiceUnavailableException({ code: "internal_error" }); }
  }

  @Get("google/callback")
  @PublicRoute()
  async callback(@Query("code") code: string | undefined, @Query("state") suppliedState: string | undefined, @Headers("cookie") cookie: string | undefined, @Res() response: CookieResponse): Promise<void> {
    clearTransactionCookie(response);
    const config = this.requiredConfig();
    await this.assertAdmitted();
    const parsed = parseState(suppliedState);
    const transactionId = cookieValue(cookie, browserOAuthTransactionCookieName);
    if (!code || !parsed || transactionId !== parsed.id) throw this.denied();
    try {
       const transaction = await this.identities.consumeBrowserOAuthTransaction(parsed.id, parsed.state);
      if (!transaction) throw this.denied();
       const tokenResponse = await googleRequest("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: config.callbackUrl, grant_type: "authorization_code", code_verifier: transaction.codeVerifier }) });
       if (isRetryableGoogleResponse(tokenResponse)) throw new ServiceUnavailableException({ code: "internal_error" });
      const token = await tokenResponse.json().catch(() => null) as { access_token?: unknown } | null;
      if (!tokenResponse.ok || !nonEmpty(token?.access_token)) throw this.denied();
       const profileResponse = await googleRequest("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } });
       if (isRetryableGoogleResponse(profileResponse)) throw new ServiceUnavailableException({ code: "internal_error" });
      const profile = await profileResponse.json().catch(() => null) as { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown; picture?: unknown } | null;
      if (!profileResponse.ok || !nonEmpty(profile?.sub) || !nonEmpty(profile?.email) || profile.email_verified !== true) throw this.denied();
       const user = await this.identities.resolveOrCreateBrowserGoogleUser(profile.sub, profile.email.trim().toLowerCase(), stringOrNull(profile.name), stringOrNull(profile.picture), transaction.referralCode ?? null);
      const sessionId = randomBytes(48).toString("base64url"); const csrfToken = csrfNonce(config, sessionId); const expires = new Date(Date.now() + sessionLifetimeMs);
      await this.identities.createBrowserSession(user.userId, sessionId, csrfHash(config, sessionId, csrfToken), user.authorizationVersion, expires);
      setSessionCookie(response, config, sessionId, expires);
      response.redirect(transaction.returnUrl);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BrowserGoogleAccountConflictError) throw this.denied();
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
  }

  @Get("csrf")
  csrf(@Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Principal() principal: RequestPrincipal) {
    const config = this.requiredConfig();
    const sessionId = cookieValue(cookie, config.cookieName);
    if (!origin || !config.allowedOrigins.includes(origin) || !sessionId || principal.sessionId !== sessionId) throw this.denied();
    return { csrfToken: csrfNonce(config, sessionId) };
  }

  @Post("logout")
  @IdempotentBrowserLogout()
  async logout(@Headers("cookie") cookie: string | undefined, @Principal() principal: RequestPrincipal, @Res() response: CookieResponse): Promise<void> {
    const config = this.requiredConfig(); const sessionId = cookieValue(cookie, config.cookieName);
    if (!sessionId || principal.sessionId !== sessionId) throw this.denied();
    try {
      await this.identities.revokeBrowserSession(sessionId);
    } catch {
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
    response.clearCookie(config.cookieName, { httpOnly: true, secure: true, sameSite: "lax", path: "/" }).status(204).send();
  }

  private requiredConfig(): BrowserAuthConfig { if (!this.browserAuth.config) throw new ServiceUnavailableException({ code: "internal_error" }); return this.browserAuth.config; }
  private async assertAdmitted() { if (!await isApiReady({ configValid: this.configValid, repository: this.schemaVersions, releasePhasePolicy: this.releasePhasePolicy })) throw new ServiceUnavailableException({ code: "internal_error" }); }
  private denied() { return new UnauthorizedException({ code: "unauthorized" }); }
}

function setSessionCookie(response: CookieResponse, config: BrowserAuthConfig, value: string, expires: Date) { response.cookie(config.cookieName, value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires }); }
function setTransactionCookie(response: CookieResponse, transactionId: string, expires: Date) { response.cookie(browserOAuthTransactionCookieName, transactionId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires }); }
function clearTransactionCookie(response: CookieResponse) { response.clearCookie(browserOAuthTransactionCookieName, { httpOnly: true, secure: true, sameSite: "lax", path: "/" }); }
function validReturnUrl(value: string | undefined, config: BrowserAuthConfig): boolean { return value !== undefined && config.allowedReturnUrls.includes(value); }
function parseState(value: string | undefined): { id: string; state: string } | null { const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32,128})$/i.exec(value ?? ""); return match ? { id: match[1]!, state: match[2]! } : null; }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function stringOrNull(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim().slice(0, 512) : null; }
function normalizeReferralCode(value: string | undefined): string | null { const code = value?.trim().toUpperCase(); return code && /^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(code) ? code : null; }
function isRetryableGoogleResponse(response: Response): boolean { return response.status === 429 || response.status >= 500; }
async function googleRequest(url: string, init: RequestInit): Promise<Response> { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5_000); try { return await fetch(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timeout); } }
