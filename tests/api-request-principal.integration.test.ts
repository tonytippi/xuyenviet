import { Body, Controller, Get, Headers as NestHeaders, INestApplication, Module, Post, UseGuards } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { apiAudience } from "@xuyenviet/contracts";
import { createBffCredentialConfig, createBffTransportConfig, type BffCredentialConfig, type Jwk } from "@xuyenviet/config";
import { createPostgresApiIdentityRepository } from "@xuyenviet/database";
import { createApiModule } from "../apps/api/src/app.module";
import { Principal } from "../apps/api/src/auth/principal.decorator";
import { ResourceServerGuard } from "../apps/api/src/auth/resource-server.guard";
import { getTestDatabaseUrl } from "./helpers/env-file";
import { resetTestDatabase, testDb } from "./helpers/db";
import { accounts, adminSessions, sessions, userRoles, users } from "@/db/schema";
import type { RequestPrincipal } from "@xuyenviet/contracts";
import { issueCsrfToken } from "@/server/csrf";
import { executeProtectedBffMutation } from "@/server/protected-bff-adapter";

let app: INestApplication;
let config: BffCredentialConfig;
let webPrevious: Awaited<ReturnType<typeof keySet>>;
let adminActive: Awaited<ReturnType<typeof keySet>>;
const authMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock, signIn: vi.fn(), signOut: vi.fn() }));

class MutationDto {
  constructor(readonly title: string) {}

  static parse(value: unknown): { ok: true; value: MutationDto } | { ok: false } {
    return typeof value === "object" && value !== null && typeof (value as { title?: unknown }).title === "string"
      ? { ok: true, value: new MutationDto((value as { title: string }).title) }
      : { ok: false };
  }
}

class ThrowingMutationDto {
  static parse() {
    throw new Error("DTO parser failure");
  }
}

@Controller("_identity-test")
class IdentityTestController {
  calls = 0;
  protectedMutationCalls = 0;
  protectedMutationRequest?: { title: string; requestId?: string; idempotencyKey?: string };

  @Get()
  @UseGuards(ResourceServerGuard)
  getPrincipal(@Principal() principal: RequestPrincipal) {
    this.calls += 1;
    return { userId: principal.userId };
  }

  @Get("failure")
  @UseGuards(ResourceServerGuard)
  failure() {
    throw new Error("database password and bearer token must not leak");
  }

  @Post("protected-mutation")
  @UseGuards(ResourceServerGuard)
  protectedMutation(@Body() body: MutationDto, @NestHeaders("x-request-id") requestId?: string, @NestHeaders("idempotency-key") idempotencyKey?: string) {
    this.protectedMutationCalls += 1;
    this.protectedMutationRequest = { title: body.title, requestId, idempotencyKey };
    if (body.title === "explode") throw new Error("database password and bearer token must not leak");
    return { accepted: true };
  }

  @Post("validation-throw")
  validationThrow(@Body() body: ThrowingMutationDto) {
    void body;
    throw new Error("The validation pipe should have rejected this request.");
  }
}

beforeEach(async () => {
  await resetTestDatabase();
  await testDb.insert(users).values({ id: "user-1", email: "user-1@example.com" });
  await testDb.insert(sessions).values({ sessionToken: "session-1", userId: "user-1", expires: new Date(Date.now() + 86_400_000) });
  await testDb.insert(adminSessions).values({ sessionLookupHash: adminSessionLookupHash("session-1"), userId: "user-1", expires: new Date(Date.now() + 86_400_000) });
  const web = await keySet("web-active");
  webPrevious = await keySet("web-previous");
  adminActive = await keySet("admin-active");
  config = createBffCredentialConfig({ audience: apiAudience, maxLifetimeSeconds: 300, issuers: {
    "xuyenviet-web-bff": { issuer: "xuyenviet-web-bff", active: web, previous: { kid: webPrevious.kid, key: webPrevious.key, verificationEndsAt: new Date(Date.now() + 60_000) } },
    "xuyenviet-admin-bff": { issuer: "xuyenviet-admin-bff", active: adminActive },
  } });
  await startApp();
});

afterEach(async () => {
  if (app) await app.close();
});

describe("API request principals", () => {
  test("allows a current principal", async () => {
    const token = await tokenFor(config, "xuyenviet-web-bff");
    expect(await createPostgresApiIdentityRepository(getTestDatabaseUrl(), "a".repeat(32)).getSession("session-1")).toEqual({
      userId: "user-1",
      expires: expect.any(Date),
      authorizationVersion: 1,
    });

    await request(app.getHttpServer()).get("/_identity-test").set("Authorization", `Bearer ${token}`).expect(200, { userId: "user-1" });
    expect(controller().calls).toBe(1);
  });

  test("rejects missing bearer, bad signatures, issuer/audience/kid errors, and malformed claims", async () => {
    const unrelated = await keySet("web-active");
    const cases = [
      undefined,
      "malformed-bearer",
      await tokenFor(config, "xuyenviet-web-bff", {}, unrelated),
      await tokenFor(config, "xuyenviet-web-bff", { iss: "untrusted-issuer" }),
      await tokenFor(config, "xuyenviet-web-bff", { aud: "wrong-audience" }),
      await tokenFor(config, "xuyenviet-web-bff", { kid: "unknown" }),
      await tokenFor(config, "xuyenviet-web-bff", { sid: undefined }),
      await tokenFor(config, "xuyenviet-web-bff", { roles: ["not-a-role"] }),
      await tokenFor(config, "xuyenviet-web-bff", { jti: "not-a-uuid" }),
    ];

    for (const token of cases) await rejected(token);
  });

  test("rejects browser cookies without a bearer and emits no CORS allow-origin header", async () => {
    const response = await request(app.getHttpServer())
      .get("/_identity-test")
      .set({ Cookie: "authjs.session-token=browser-cookie", Origin: "https://web.xuyenviet.vn" })
      .expect(401);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.body).toEqual({ code: "unauthorized", message: "Không được phép truy cập.", requestId: expect.any(String) });
    expect(controller().calls).toBe(0);
  });

  test("enforces the declared admin workspace capability through Nest route metadata before returning its bounded result", async () => {
    const operatorToken = await tokenFor(config, "xuyenviet-admin-bff", { roles: ["operator"] });
    await testDb.insert(userRoles).values({ userId: "user-1", role: "operator" });
    await request(app.getHttpServer()).get("/v1/admin/workspace").set("Authorization", `Bearer ${operatorToken}`).expect(200, { ready: true });

    const denied = await request(app.getHttpServer())
      .get("/v1/admin/workspace")
      .set({ Authorization: `Bearer ${await tokenFor(config, "xuyenviet-admin-bff", { roles: ["traveler"] })}`, Cookie: "__Host-xuyenviet-admin-session=root-cookie" })
      .expect(403);
    expect(denied.body).toEqual({ code: "forbidden", message: "Bạn không có quyền thực hiện thao tác này.", requestId: expect.any(String) });
    expect(denied.text).not.toContain("root-cookie");

    await request(app.getHttpServer())
      .get("/v1/admin/workspace")
      .set("Authorization", `Bearer ${await tokenFor(config, "xuyenviet-web-bff", { roles: ["operator"] })}`)
      .expect(403);
    expect(controller().calls).toBe(0);

    const cookieOnly = await request(app.getHttpServer()).get("/v1/admin/workspace").set("Cookie", "__Host-xuyenviet-admin-session=root-cookie").expect(401);
    expect(cookieOnly.body).toEqual({ code: "unauthorized", message: "Không được phép truy cập.", requestId: expect.any(String) });
  });

  test("redacts unexpected protected API exceptions with the canonical request ID", async () => {
    const token = await tokenFor(config, "xuyenviet-web-bff");
    const response = await request(app.getHttpServer())
      .get("/_identity-test/failure")
      .set({ Authorization: `Bearer ${token}`, "X-Request-Id": "known_request" })
      .expect(500);

    expect(response.body).toEqual({ code: "internal_error", message: "Không thể xử lý yêu cầu.", requestId: "known_request" });
    expect(response.text).not.toContain("database password");
    expect(response.text).not.toContain("bearer token");
  });

  test("projects a throwing DTO parser as a safe 400 validation envelope", async () => {
    const token = await tokenFor(config, "xuyenviet-web-bff");
    const response = await request(app.getHttpServer())
      .post("/_identity-test/validation-throw")
      .set({ Authorization: `Bearer ${token}`, "X-Request-Id": "parser_failure" })
      .send({ title: "valid" })
      .expect(400);

    expect(response.body).toEqual({ code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: "parser_failure", violations: [] });
  });

  test("validates every admin identity route through Nest before controller work", async () => {
    const routes = [
      ["/internal/admin-identity/handoff", {}],
      ["/internal/admin-identity/oauth/start", {}],
      ["/internal/admin-identity/oauth/callback", {}],
      ["/internal/admin-identity/revoke", {}],
      ["/internal/admin-identity/readiness", {}],
    ] as const;
    for (const [path, body] of routes) {
      const response = await request(app.getHttpServer()).post(path).set("Authorization", "Bearer identity-service").send(body).expect(400);
      expect(response.body).toEqual({ code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: expect.any(String), violations: [] });
    }
  });

  test("stores only an HMAC session lookup value and resolves and revokes the presented bearer ID", async () => {
    await testDb.insert(accounts).values({ userId: "user-1", type: "oauth", provider: "google", providerAccountId: "google-user-1" });
    await testDb.insert(userRoles).values({ userId: "user-1", role: "operator" });
    const repository = createPostgresApiIdentityRepository(getTestDatabaseUrl(), "a".repeat(32));
    const sessionId = await repository.createAdminSessionForGoogleAccount("google-user-1", new Date(Date.now() + 60_000));
    if (!sessionId) throw new Error("Expected an admin session.");
    const [stored] = await testDb.select().from(adminSessions).where(eq(adminSessions.userId, "user-1"));
    expect(stored?.sessionLookupHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored?.sessionLookupHash).not.toContain(sessionId);
    await expect(repository.resolveAdminHandoff(sessionId, "user-1")).resolves.toMatchObject({ sessionId, subject: "user-1" });
    await repository.revokeAdminSession(sessionId);
    await expect(repository.resolveAdminHandoff(sessionId, "user-1")).resolves.toBeNull();
  });

  test("executes protected BFF mutations over HTTP with CSRF ordering, canonical correlation, declared idempotency, and safe error projection", async () => {
    const transport = createBffTransportConfig({ privateApiUrl: new URL("https://api.railway.internal"), bffOrigin: "https://web.xuyenviet.vn", csrfSigningSecret: "a".repeat(32), csrfLifetimeSeconds: 300, requestTimeoutMs: 1_000 });
    const token = issueCsrfToken(transport);
    await app.listen(0, "127.0.0.1");
    vi.unstubAllGlobals();
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("Expected a listening test API server.");
    const fetcher: typeof fetch = (url, init) => {
      const localUrl = new URL(typeof url === "string" || url instanceof URL ? url : url.url);
      localUrl.protocol = "http:";
      localUrl.hostname = "127.0.0.1";
      localUrl.port = String(address.port);
      return fetch(localUrl, init);
    };
    const request = { headers: new Headers({ origin: transport.bffOrigin, "sec-fetch-site": "same-origin", "X-XuyenViet-CSRF": token, "x-request-id": "story_9_3" }), cookies: { get: () => ({ value: token }) } };
    const mintCredential = vi.fn(() => tokenFor(config, "xuyenviet-web-bff"));

    const rejected = await executeProtectedBffMutation({ request: { ...request, headers: new Headers({ origin: "https://foreign.example", "X-XuyenViet-CSRF": token }) }, rawInput: { title: "valid" }, parseInput: parseMutation, parseResult: parseAccepted, config: transport, mintCredential, path: "/_identity-test/protected-mutation", method: "POST", fetcher });
    expect(rejected).toMatchObject({ ok: false, error: { code: "csrf_invalid" } });
    expect(mintCredential).not.toHaveBeenCalled();
    expect(controller().protectedMutationCalls).toBe(0);

    const accepted = await executeProtectedBffMutation({ request, rawInput: { title: "valid" }, parseInput: parseMutation, parseResult: parseAccepted, config: transport, mintCredential, path: "/_identity-test/protected-mutation", method: "POST", idempotencyKey: "declared-9-3", allowIdempotencyKey: true, fetcher });
    expect(accepted).toEqual({ ok: true, value: { accepted: true }, requestId: "story_9_3" });
    expect(controller().protectedMutationRequest).toEqual({ title: "valid", requestId: "story_9_3", idempotencyKey: "declared-9-3" });

    const failure = await executeProtectedBffMutation({ request, rawInput: { title: "explode" }, parseInput: parseMutation, parseResult: parseAccepted, config: transport, mintCredential, path: "/_identity-test/protected-mutation", method: "POST", fetcher });
    expect(failure).toEqual({ ok: false, error: { code: "internal_error", message: "Không thể xử lý yêu cầu.", requestId: "story_9_3" } });
  });

  test("rejects invalid clock constraints before controller execution", async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const overrides of [
      { iat: now + 60 },
      { nbf: now + 60 },
      { exp: now - 1 },
      { exp: now + 301 },
    ]) await rejected(await tokenFor(config, "xuyenviet-web-bff", overrides));
  });

  test("rejects absent, expired, mismatched, and stale identity state before controller execution", async () => {
    const changes = [
      () => testDb.delete(sessions),
      () => testDb.update(sessions).set({ expires: new Date(Date.now() - 1) }),
      async () => { await testDb.insert(users).values({ id: "another-user", email: "another@example.com" }); return testDb.update(sessions).set({ userId: "another-user" }); },
      () => testDb.update(users).set({ authorizationVersion: 2 }),
    ];
    for (const change of changes) {
      await change();
      await restartApp();
      await rejected(await tokenFor(config, "xuyenviet-web-bff"));
    }
  });

  test("accepts only the matching issuer's previous key during its configured overlap", async () => {
    await request(app.getHttpServer()).get("/_identity-test").set("Authorization", `Bearer ${await tokenFor(config, "xuyenviet-web-bff", {}, webPrevious)}`).expect(200);
    expect(controller().calls).toBe(1);

    await rejected(await tokenFor(config, "xuyenviet-web-bff", { kid: adminActive.kid }, adminActive));

    // Configuration rejects expired overlap at startup; mutate the already-validated test config to exercise runtime expiry.
    config.issuers["xuyenviet-web-bff"].previous!.verificationEndsAt = new Date(Date.now() - 1);
    await restartApp();
    await rejected(await tokenFor(config, "xuyenviet-web-bff", {}, webPrevious));
  });

  test("accepts a valid admin credential while rejecting its key for the web issuer", async () => {
    await request(app.getHttpServer()).get("/_identity-test").set("Authorization", `Bearer ${await tokenFor(config, "xuyenviet-admin-bff")}`).expect(200, { userId: "user-1" });
    expect(controller().calls).toBe(1);

    await rejected(await tokenFor(config, "xuyenviet-web-bff", {}, adminActive));
  });

  test("rejects an admin credential when only a traveler session exists", async () => {
    await testDb.delete(adminSessions);
    await rejected(await tokenFor(config, "xuyenviet-admin-bff"));
  });

  test("rejects already minted credentials after role grants and revokes change authorization version", async () => {
    await testDb.insert(users).values({ id: "admin-1", email: "admin-1@example.com" });
    await testDb.insert(userRoles).values({ userId: "admin-1", role: "admin" });
    authMock.mockResolvedValue({ user: { id: "admin-1", email: "admin-1@example.com" } });
    const { grantAdminUserRole, revokeAdminUserRole } = await import("@/features/admin/actions");

    const beforeGrant = await tokenFor(config, "xuyenviet-web-bff");
    await expect(grantAdminUserRole("user-1", "operator")).resolves.toMatchObject({ changed: true });
    await rejected(beforeGrant);

    const beforeRevoke = await tokenFor(config, "xuyenviet-web-bff", { rv: 2 });
    await request(app.getHttpServer()).get("/_identity-test").set("Authorization", `Bearer ${beforeRevoke}`).expect(200);
    await expect(revokeAdminUserRole("user-1", "operator")).resolves.toMatchObject({ changed: true });
    await rejected(beforeRevoke);
  });
});

async function startApp() {
  const ApiModule = createApiModule(config, createPostgresApiIdentityRepository(getTestDatabaseUrl(), "a".repeat(32)), {
    conversationSummaries: { async listOwnedConversationSummaryRows() { return []; } },
    schemaVersions: { async hasCompatibleSchemaVersion() { return true; }, async recordSchemaVersion() {} },
    adminIdentityServiceToken: "identity-service",
  });
  @Module({ imports: [ApiModule], controllers: [IdentityTestController] })
  class TestApiModule {}
  app = await NestFactory.create(TestApiModule, { logger: ["error"] });
  await app.init();
}

function adminSessionLookupHash(sessionId: string) {
  return createHmac("sha256", "a".repeat(32)).update(sessionId).digest("base64url");
}

async function restartApp() {
  await app.close();
  await startApp();
}

function controller() {
  return app.get(IdentityTestController);
}

async function rejected(token?: string) {
  controller().calls = 0;
  const response = await request(app.getHttpServer())
    .get("/_identity-test")
    .set({ Origin: "https://web.xuyenviet.vn", ...(token ? { Authorization: `Bearer ${token}` } : {}) })
    .expect(401);
  expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  expect(response.body).toEqual({ code: "unauthorized", message: "Không được phép truy cập.", requestId: expect.any(String) });
  expect(Object.keys(response.body).sort()).toEqual(["code", "message", "requestId"]);
  expect(response.body.requestId.length).toBeLessThanOrEqual(128);
  expect(controller().calls).toBe(0);
}

function parseMutation(value: unknown): { title: string } | null {
  return typeof value === "object" && value !== null && typeof (value as { title?: unknown }).title === "string" ? { title: (value as { title: string }).title } : null;
}

function parseAccepted(value: unknown): { accepted: boolean } | null {
  return typeof value === "object" && value !== null && typeof (value as { accepted?: unknown }).accepted === "boolean" ? { accepted: (value as { accepted: boolean }).accepted } : null;
}

async function keySet(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  return { kid, key: asEs256Jwk(await exportJWK(publicKey), kid), privateKey: asEs256Jwk(await exportJWK(privateKey), kid) };
}

function asEs256Jwk(key: JsonWebKey, kid: string): Jwk {
  if (key.kty !== "EC" || key.crv !== "P-256") throw new Error("Expected an ES256 key.");
  return { ...key, kty: "EC", crv: "P-256", kid };
}

type TokenOverrides = { kid?: string; iss?: string; aud?: string; iat?: number; nbf?: number; exp?: number; sid?: string; roles?: string[]; rv?: number; jti?: string };

async function tokenFor(config: BffCredentialConfig, issuer: "xuyenviet-web-bff" | "xuyenviet-admin-bff", overrides: TokenOverrides = {}, signer = config.issuers[issuer].active as Awaited<ReturnType<typeof keySet>>) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { roles: overrides.roles ?? ["traveler"], rv: overrides.rv ?? 1, jti: overrides.jti ?? crypto.randomUUID() };
  if (overrides.sid !== undefined) Object.assign(claims, { sid: overrides.sid });
  else if (!("sid" in overrides)) Object.assign(claims, { sid: "session-1" });
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: overrides.kid ?? signer.kid })
    .setSubject("user-1").setIssuer(overrides.iss ?? issuer).setAudience(overrides.aud ?? apiAudience)
    .setIssuedAt(overrides.iat ?? now).setNotBefore(overrides.nbf ?? now).setExpirationTime(overrides.exp ?? now + 60)
    .sign(await importJWK(signer.privateKey!, "ES256"));
}
