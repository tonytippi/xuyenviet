import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getBrowserAuthConfig } from "@xuyenviet/config";
import { createPostgresApiIdentityRepository, type BrowserIdentityRepository } from "@xuyenviet/database";
import { createApiModule } from "../apps/api/src/app.module";
import { getTestDatabaseUrl } from "./helpers/env-file";
import { accounts, browserOAuthTransactions, browserSessions, referralAttributions, referralCodes, userRoles, users } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";

let app: INestApplication;
let identities: BrowserIdentityRepository;
const browserAuth = { googleClientId: "client", googleClientSecret: "secret", callbackUrl: "https://api.xuyenviet.app/auth/google/callback", allowedOrigins: ["https://web.xuyenviet.vn", "https://admin.xuyenviet.app"], allowedReturnUrls: ["https://web.xuyenviet.vn/trips", "https://admin.xuyenviet.app/", "https://admin.xuyenviet.app/knowledge/facebook-captures"], sessionLookupKey: "b".repeat(32), csrfKey: "c".repeat(32), oauthTransactionProtectionKey: "d".repeat(32), cookieName: "__Host-xuyenviet-session" } as const;

beforeEach(async () => {
  await resetTestDatabase();
  identities = createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey);
  const ApiModule = createApiModule(identities, { conversationSummaries: { async listOwnedConversationSummaryRows() { return []; } }, browserAuth });
  @Module({ imports: [ApiModule] })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.init();
});

afterEach(async () => { vi.unstubAllGlobals(); await app.close(); await identities.close(); });

describe("browser Google identity callback", () => {
  test("requires canonical exact browser OAuth return URLs independently from callback validation", () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      XV_BROWSER_GOOGLE_CLIENT_ID: "client",
      XV_BROWSER_GOOGLE_CLIENT_SECRET: "secret",
      XV_BROWSER_GOOGLE_CALLBACK_URL: "https://web.xuyenviet.vn/auth/google/callback",
      XV_BROWSER_ALLOWED_ORIGINS: "https://web.xuyenviet.vn",
      XV_BROWSER_ALLOWED_RETURN_URLS: "https://web.xuyenviet.vn/trips?tab=plan",
      XV_BROWSER_SESSION_LOOKUP_KEY: "a".repeat(32),
      XV_BROWSER_CSRF_KEY: "b".repeat(32),
      XV_BROWSER_OAUTH_TRANSACTION_PROTECTION_KEY: "c".repeat(32),
    };

    expect(getBrowserAuthConfig(environment).allowedReturnUrls).toEqual(["https://web.xuyenviet.vn/trips?tab=plan"]);
    for (const invalid of [
      { XV_BROWSER_ALLOWED_RETURN_URLS: "https://web.xuyenviet.vn/trips#section" },
      { XV_BROWSER_ALLOWED_RETURN_URLS: "https://user:password@web.xuyenviet.vn/trips" },
      { XV_BROWSER_ALLOWED_RETURN_URLS: "https://web.xuyenviet.vn/trips?tab=plan#section" },
      { XV_BROWSER_ALLOWED_RETURN_URLS: "https://web.xuyenviet.vn:443/trips" },
      { XV_BROWSER_ALLOWED_RETURN_URLS: "https://web.xuyenviet.vn/trips", XV_BROWSER_GOOGLE_CALLBACK_URL: "https://other.xuyenviet.vn/auth/google/callback" },
    ]) expect(() => getBrowserAuthConfig({ ...environment, ...invalid })).toThrow("Invalid browser authentication configuration.");
  });

  test("permits HTTP only for exact local loopback origins", () => {
    const environment: NodeJS.ProcessEnv = {
      APP_ENV: "local",
      NODE_ENV: "test",
      XV_BROWSER_GOOGLE_CLIENT_ID: "client",
      XV_BROWSER_GOOGLE_CLIENT_SECRET: "secret",
      XV_BROWSER_GOOGLE_CALLBACK_URL: "http://localhost:3001/auth/google/callback",
      XV_BROWSER_ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:3001",
      XV_BROWSER_ALLOWED_RETURN_URLS: "http://localhost:3000/",
      XV_BROWSER_SESSION_LOOKUP_KEY: "a".repeat(32),
      XV_BROWSER_CSRF_KEY: "b".repeat(32),
      XV_BROWSER_OAUTH_TRANSACTION_PROTECTION_KEY: "c".repeat(32),
    };

    expect(getBrowserAuthConfig(environment).cookieName).toBe("xuyenviet-session");
    for (const invalid of [
      { APP_ENV: "production" },
      { XV_BROWSER_ALLOWED_ORIGINS: "http://localhost:3000,http://example.test" },
      { XV_BROWSER_GOOGLE_CALLBACK_URL: "http://example.test/auth/google/callback", XV_BROWSER_ALLOWED_ORIGINS: "http://example.test" },
    ]) expect(() => getBrowserAuthConfig({ ...environment, ...invalid })).toThrow("Invalid browser authentication configuration.");
  });

  test("allows configured static admin returns and rejects dynamic detail returns", async () => {
    await request(app.getHttpServer()).get("/auth/google").query({ returnUrl: "https://admin.xuyenviet.app/knowledge/facebook-captures" }).expect(302);
    await request(app.getHttpServer()).get("/auth/google").query({ returnUrl: "https://admin.xuyenviet.app/knowledge/facebook-captures/detail-1" }).expect(401);
  });

  test("does not resolve or link a Google profile whose email is not verified", async () => {
    const repository = browserRepository();
    const id = "123e4567-e89b-42d3-a456-426614174000"; const state = "a".repeat(43);
    await repository.createBrowserOAuthTransaction({ id, state, codeVerifier: "v".repeat(64), returnUrl: browserAuth.allowedReturnUrls[0], expires: new Date(Date.now() + 60_000) });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "google-user", email: "traveler@example.com", email_verified: false }), { status: 200 })));

    const response = await callback(id, state).expect(401);
    expect(response.body).toEqual({ code: "unauthorized", message: "Không được phép truy cập.", requestId: expect.any(String) });
    expect(await testDb.select().from(users)).toEqual([]);
    expect(await testDb.select().from(accounts)).toEqual([]);
    expect(await testDb.select().from(browserSessions)).toEqual([]);
  });

  test("does not persist a transaction or exchange a provider code while API readiness is false", async () => {
    await app.close();
    await startBrowserApp(false);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await request(app.getHttpServer()).get("/auth/google?returnUrl=https://web.xuyenviet.vn/trips").expect(503);
    expect(await testDb.select().from(browserOAuthTransactions)).toEqual([]);

    await request(app.getHttpServer()).get("/auth/google/callback?code=code&state=123e4567-e89b-42d3-a456-426614174000.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").expect(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(await testDb.select().from(users)).toEqual([]);
    expect(await testDb.select().from(accounts)).toEqual([]);
    expect(await testDb.select().from(browserSessions)).toEqual([]);
  });

  test.each(["https://web.xuyenviet.vn/arbitrary", "https://web.xuyenviet.vn/trips?next=evil"]) ("rejects same-origin unconfigured return URL %s without persisting a transaction or redirecting", async (returnUrl) => {
    const response = await request(app.getHttpServer()).get("/auth/google").query({ returnUrl }).expect(401);

    expect(response.body).toEqual({ code: "unauthorized", message: "Không được phép truy cập.", requestId: expect.any(String) });
    expect(response.headers.location).toBeUndefined();
    expect(cookies(response)).toEqual([]);
    expect(await testDb.select().from(browserOAuthTransactions)).toEqual([]);
  });

  test("purges a bounded set of expired transactions before creating a public OAuth transaction", async () => {
    const repository = browserRepository();
    await repository.createBrowserOAuthTransaction({ id: "123e4567-e89b-42d3-a456-426614174000", state: "a".repeat(43), codeVerifier: "v".repeat(64), returnUrl: browserAuth.allowedReturnUrls[0], expires: new Date(Date.now() - 1) });

    const response = await request(app.getHttpServer()).get("/auth/google?returnUrl=https://web.xuyenviet.vn/trips").expect(302);
    expect(response.headers.location).toContain("accounts.google.com");
    const transactions = await testDb.select().from(browserOAuthTransactions);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.expires.getTime()).toBeGreaterThan(Date.now());
  });

  test("sets a host-only transaction-ID cookie without OAuth state or verifier", async () => {
    const response = await request(app.getHttpServer()).get("/auth/google?returnUrl=https://web.xuyenviet.vn/trips").expect(302);
    const location = new URL(response.headers.location!);
    const transactionId = location.searchParams.get("state")!.split(".")[0]!;
    const cookie = cookies(response).find((value) => value.startsWith("__Host-xuyenviet-browser-oauth="));

    expect(cookie).toMatch(new RegExp(`^__Host-xuyenviet-browser-oauth=${transactionId}; Path=/; Expires=.+; HttpOnly; Secure; SameSite=Lax$`));
    expect(cookie).not.toContain(location.searchParams.get("state")!);
    expect(cookie).not.toContain("code_challenge");
  });

  test("binds one valid referral first touch to the consumed browser OAuth transaction", async () => {
    await testDb.insert(users).values({ id: "referrer", email: "referrer@example.com" });
    const [code] = await testDb.insert(referralCodes).values({ code: "ROAD-2026", referrerUserId: "referrer" }).returning({ id: referralCodes.id });
    const start = await request(app.getHttpServer()).get("/auth/google?returnUrl=https://web.xuyenviet.vn/trips&ref=road-2026").expect(302);
    const state = new URL(start.headers.location!).searchParams.get("state")!;
    const [id, nonce] = state.split(".");
    expect(await testDb.select({ referralCode: browserOAuthTransactions.referralCode }).from(browserOAuthTransactions)).toEqual([{ referralCode: "ROAD-2026" }]);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "referred-google-user", email: "referred@example.com", email_verified: true }), { status: 200 })));

    await callback(id!, nonce!).expect(302);
    expect(await testDb.select().from(referralAttributions)).toEqual([expect.objectContaining({ referralCodeId: code!.id, referrerUserId: "referrer" })]);
    expect(await testDb.select().from(browserOAuthTransactions)).toEqual([]);
  });

  test("does not retain malformed referral input in a browser OAuth transaction", async () => {
    await request(app.getHttpServer()).get("/auth/google?returnUrl=https://web.xuyenviet.vn/trips&ref=not a referral").expect(302);
    expect(await testDb.select({ referralCode: browserOAuthTransactions.referralCode }).from(browserOAuthTransactions)).toEqual([{ referralCode: null }]);
  });

  test("rejects a valid state callback without or with a mismatching transaction cookie before user, account, or session creation", async () => {
    const repository = browserRepository();
    const id = randomTransactionId(); const state = "a".repeat(43);
    await repository.createBrowserOAuthTransaction({ id, state, codeVerifier: "v".repeat(64), returnUrl: browserAuth.allowedReturnUrls[0], expires: new Date(Date.now() + 60_000) });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    for (const cookie of [undefined, `__Host-xuyenviet-browser-oauth=${randomTransactionId()}`]) {
      const response = await request(app.getHttpServer()).get(`/auth/google/callback?code=code&state=${id}.${state}`).set(cookie ? { Cookie: cookie } : {}).expect(401);
      expect(response.body).toEqual({ code: "unauthorized", message: "Không được phép truy cập.", requestId: expect.any(String) });
      expect(response.headers["set-cookie"]).toContain("__Host-xuyenviet-browser-oauth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax");
    }

    expect(fetch).not.toHaveBeenCalled();
    expect(await testDb.select().from(users)).toEqual([]);
    expect(await testDb.select().from(accounts)).toEqual([]);
    expect(await testDb.select().from(browserSessions)).toEqual([]);
    expect(await testDb.select().from(browserOAuthTransactions)).toHaveLength(1);
  });

  test("completes a matching transaction-cookie callback without disclosing OAuth or session secrets", async () => {
    const repository = browserRepository();
    const id = randomTransactionId(); const state = "a".repeat(43); const verifier = "v".repeat(64);
    await repository.createBrowserOAuthTransaction({ id, state, codeVerifier: verifier, returnUrl: browserAuth.allowedReturnUrls[0], expires: new Date(Date.now() + 60_000) });
    const [storedTransaction] = await testDb.select().from(browserOAuthTransactions);
    expect(storedTransaction?.stateHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storedTransaction?.stateHash).not.toContain(state);
    expect(storedTransaction?.codeVerifierCiphertext).not.toContain(verifier);
    expect(storedTransaction?.codeVerifierCiphertext).not.toMatch(/^v+$/);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "google-user", email: "traveler@example.com", email_verified: true }), { status: 200 })));

    const response = await callback(id, state).expect(302).expect("Location", browserAuth.allowedReturnUrls[0]);
    expect(cookies(response)).toContain("__Host-xuyenviet-browser-oauth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax");
    expect(cookies(response).find((value) => value.startsWith(`${browserAuth.cookieName}=`))).toContain("HttpOnly; Secure; SameSite=Lax");
    expect(response.text).not.toContain("provider-token");
    expect(response.text).not.toContain(state);
    expect(response.text).not.toContain(verifier);
    expect(await testDb.select().from(users)).toHaveLength(1);
    expect(await testDb.select().from(accounts)).toHaveLength(1);
    expect(await testDb.select().from(browserSessions)).toHaveLength(1);
    expect(await testDb.select().from(browserOAuthTransactions)).toEqual([]);
  });

  test("issues a session for an existing Google subject without replacing its account link", async () => {
    await testDb.insert(users).values({ id: "existing-user", email: "traveler@example.com" });
    await testDb.insert(accounts).values({ userId: "existing-user", type: "oauth", provider: "google", providerAccountId: "google-user" });
    await testDb.insert(userRoles).values([{ userId: "existing-user", role: "operator" }, { userId: "existing-user", role: "admin" }]);
    const repository = browserRepository();
    const id = randomTransactionId(); const state = "a".repeat(43);
    await repository.createBrowserOAuthTransaction({ id, state, codeVerifier: "v".repeat(64), returnUrl: browserAuth.allowedReturnUrls[0], expires: new Date(Date.now() + 60_000) });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "google-user", email: "traveler@example.com", email_verified: true }), { status: 200 })));

    await callback(id, state).expect(302);
    expect(await testDb.select().from(accounts)).toEqual([expect.objectContaining({ userId: "existing-user", providerAccountId: "google-user" })]);
    expect(await testDb.select().from(userRoles)).toEqual(expect.arrayContaining([expect.objectContaining({ userId: "existing-user", role: "operator" }), expect.objectContaining({ userId: "existing-user", role: "admin" })]));
    expect(await testDb.select().from(users)).toEqual([expect.objectContaining({ id: "existing-user", authorizationVersion: 1 })]);
    expect(await testDb.select().from(browserSessions)).toEqual([expect.objectContaining({ userId: "existing-user", authorizationVersion: 1 })]);
  });

  test("migrates an Auth.js Google user with no roles to a traveler and admits its browser session", async () => {
    await testDb.insert(users).values({ id: "authjs-user", email: "traveler@example.com" });
    await testDb.insert(accounts).values({ userId: "authjs-user", type: "oauth", provider: "google", providerAccountId: "google-user" });
    const repository = browserRepository();
    const id = randomTransactionId(); const state = "a".repeat(43);
    await repository.createBrowserOAuthTransaction({ id, state, codeVerifier: "v".repeat(64), returnUrl: browserAuth.allowedReturnUrls[0], expires: new Date(Date.now() + 60_000) });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "google-user", email: "traveler@example.com", email_verified: true }), { status: 200 })));

    const response = await callback(id, state).expect(302);
    const sessionCookie = cookies(response).find((value) => value.startsWith(`${browserAuth.cookieName}=`));
    const sessionId = /__Host-xuyenviet-session=([^;]+)/.exec(sessionCookie ?? "")?.[1];
    if (!sessionId) throw new Error("Expected a browser session cookie.");

    expect(await testDb.select().from(userRoles)).toEqual([expect.objectContaining({ userId: "authjs-user", role: "traveler" })]);
    expect(await testDb.select().from(users)).toEqual([expect.objectContaining({ id: "authjs-user", authorizationVersion: 2 })]);
    expect(await testDb.select().from(browserSessions)).toEqual([expect.objectContaining({ userId: "authjs-user", authorizationVersion: 2 })]);
    await request(app.getHttpServer()).get("/auth/csrf").set({ Cookie: `${browserAuth.cookieName}=${sessionId}`, Origin: browserAuth.allowedOrigins[0] }).expect(200);
    await request(app.getHttpServer()).get("/auth/csrf").set("Cookie", `${browserAuth.cookieName}=${sessionId}`).expect(200);
  });

  test("rejects an email-selected user linked to another Google subject without issuing a session or taking over the account", async () => {
    await testDb.insert(users).values({ id: "existing-user", email: "traveler@example.com" });
    await testDb.insert(accounts).values({ userId: "existing-user", type: "oauth", provider: "google", providerAccountId: "original-google-user" });
    const repository = browserRepository();
    const id = randomTransactionId(); const state = "a".repeat(43);
    await repository.createBrowserOAuthTransaction({ id, state, codeVerifier: "v".repeat(64), returnUrl: browserAuth.allowedReturnUrls[0], expires: new Date(Date.now() + 60_000) });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "replacement-google-user", email: "traveler@example.com", email_verified: true }), { status: 200 })));

    await callback(id, state).expect(401);
    expect(await testDb.select().from(users)).toEqual([expect.objectContaining({ id: "existing-user", email: "traveler@example.com" })]);
    expect(await testDb.select().from(accounts)).toEqual([expect.objectContaining({ userId: "existing-user", providerAccountId: "original-google-user" })]);
    expect(await testDb.select().from(browserSessions)).toEqual([]);
  });

  test.each([
    ["token rate limit", new Response("", { status: 429 })],
    ["token server error", new Response("", { status: 500 })],
    ["userinfo rate limit", new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }), new Response("", { status: 429 })],
    ["userinfo server error", new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }), new Response("", { status: 503 })],
  ])("classifies Google %s as a retryable safe failure", async (_name, tokenResponse: Response, profileResponse?: Response) => {
    const repository = browserRepository();
    const id = randomTransactionId(); const state = "a".repeat(43);
    await repository.createBrowserOAuthTransaction({ id, state, codeVerifier: "v".repeat(64), returnUrl: browserAuth.allowedReturnUrls[0], expires: new Date(Date.now() + 60_000) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(profileResponse));

    await callback(id, state).expect(503).expect(({ body }) => expect(body.code).toBe("internal_error"));
    expect(await testDb.select().from(users)).toEqual([]);
    expect(await testDb.select().from(browserSessions)).toEqual([]);
  });

  test.each([
    ["token rejection", new Response("", { status: 401 })],
    ["malformed token", new Response(JSON.stringify({}), { status: 200 })],
    ["userinfo rejection", new Response(JSON.stringify({ access_token: "provider-token" }), { status: 401 }), new Response("", { status: 401 })],
    ["malformed userinfo", new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }), new Response(JSON.stringify({}), { status: 200 })],
  ])("keeps Google %s as an authentication denial", async (_name, tokenResponse: Response, profileResponse?: Response) => {
    const repository = browserRepository();
    const id = randomTransactionId(); const state = "a".repeat(43);
    await repository.createBrowserOAuthTransaction({ id, state, codeVerifier: "v".repeat(64), returnUrl: browserAuth.allowedReturnUrls[0], expires: new Date(Date.now() + 60_000) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(profileResponse));

    await callback(id, state).expect(401);
    expect(await testDb.select().from(users)).toEqual([]);
    expect(await testDb.select().from(browserSessions)).toEqual([]);
  });
});

async function startBrowserApp(schemaReady = true) {
  const ApiModule = createApiModule(browserRepository(), { conversationSummaries: { async listOwnedConversationSummaryRows() { return []; } }, browserAuth });
  @Module({ imports: [ApiModule] })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.init();
}

function randomTransactionId() { return crypto.randomUUID(); }

function browserRepository() { return identities; }

function callback(id: string, state: string) { return request(app.getHttpServer()).get(`/auth/google/callback?code=code&state=${id}.${state}`).set("Cookie", `__Host-xuyenviet-browser-oauth=${id}`); }

function cookies(response: request.Response): string[] { const value = response.headers["set-cookie"]; return Array.isArray(value) ? value : value ? [value] : []; }
