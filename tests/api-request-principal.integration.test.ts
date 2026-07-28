import { Controller, Get, INestApplication, Module, UseGuards } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { apiAudience } from "@xuyenviet/contracts";
import { createBffCredentialConfig, type BffCredentialConfig, type Jwk } from "@xuyenviet/config";
import { createPostgresApiIdentityRepository } from "@xuyenviet/database";
import { createApiModule } from "../apps/api/src/app.module";
import { Principal } from "../apps/api/src/auth/principal.decorator";
import { ResourceServerGuard } from "../apps/api/src/auth/resource-server.guard";
import { getTestDatabaseUrl } from "./helpers/env-file";
import { resetTestDatabase, testDb } from "./helpers/db";
import { sessions, userRoles, users } from "@/db/schema";
import type { RequestPrincipal } from "@xuyenviet/contracts";

let app: INestApplication;
let config: BffCredentialConfig;
let webPrevious: Awaited<ReturnType<typeof keySet>>;
let adminActive: Awaited<ReturnType<typeof keySet>>;
const authMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock, signIn: vi.fn(), signOut: vi.fn() }));

@Controller("_identity-test")
class IdentityTestController {
  calls = 0;

  @Get()
  @UseGuards(ResourceServerGuard)
  getPrincipal(@Principal() principal: RequestPrincipal) {
    this.calls += 1;
    return { userId: principal.userId };
  }
}

beforeEach(async () => {
  await resetTestDatabase();
  await testDb.insert(users).values({ id: "user-1", email: "user-1@example.com" });
  await testDb.insert(sessions).values({ sessionToken: "session-1", userId: "user-1", expires: new Date(Date.now() + 86_400_000) });
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
    expect(await createPostgresApiIdentityRepository(getTestDatabaseUrl()).getSession("session-1")).toEqual({
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
  const ApiModule = createApiModule(config, createPostgresApiIdentityRepository(getTestDatabaseUrl()));
  @Module({ imports: [ApiModule], controllers: [IdentityTestController] })
  class TestApiModule {}
  app = await NestFactory.create(TestApiModule, { logger: ["error"] });
  await app.init();
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
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .expect(401);
  expect(response.body).toEqual({ code: "unauthorized", message: "Unauthorized.", requestId: expect.any(String) });
  expect(Object.keys(response.body).sort()).toEqual(["code", "message", "requestId"]);
  expect(response.body.requestId.length).toBeLessThanOrEqual(128);
  expect(controller().calls).toBe(0);
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
