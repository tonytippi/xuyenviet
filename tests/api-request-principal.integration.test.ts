import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { apiAudience } from "@xuyenviet/contracts";
import { createBffCredentialConfig, type BffCredentialConfig, type Jwk } from "@xuyenviet/config";
import type { ApiIdentityRepository } from "@xuyenviet/database";
import { createApiModule, IdentityTestController } from "../apps/api/src/app.module";
import { SafeApiExceptionFilter } from "../apps/api/src/safe-api-exception.filter";

let app: INestApplication;
let config: BffCredentialConfig;
let identities: ApiIdentityRepository;
let webPrevious: Awaited<ReturnType<typeof keySet>>;

beforeEach(async () => {
  const web = await keySet("web-active");
  webPrevious = await keySet("web-previous");
  const admin = await keySet("admin-active");
  config = createBffCredentialConfig({ audience: apiAudience, maxLifetimeSeconds: 300, issuers: {
    "xuyenviet-web-bff": { issuer: "xuyenviet-web-bff", active: web, previous: { kid: webPrevious.kid, key: webPrevious.key, verificationEndsAt: new Date(Date.now() + 60_000) } },
    "xuyenviet-admin-bff": { issuer: "xuyenviet-admin-bff", active: admin },
  } });
  identities = currentIdentity();
  await startApp();
});

afterEach(async () => {
  if (app) await app.close();
});

describe("API request principals", () => {
  test("allows a current principal", async () => {
    const token = await tokenFor(config, "xuyenviet-web-bff");

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
    for (const identity of [
      null,
      { userId: "user-1", expires: new Date(Date.now() - 1), authorizationVersion: 1 },
      { userId: "another-user", expires: new Date(Date.now() + 60_000), authorizationVersion: 1 },
      { userId: "user-1", expires: new Date(Date.now() + 60_000), authorizationVersion: 2 },
    ]) {
      identities = { getSession: async () => identity };
      await restartApp();
      await rejected(await tokenFor(config, "xuyenviet-web-bff"));
    }
  });

  test("accepts only the matching issuer's previous key during its configured overlap", async () => {
    await request(app.getHttpServer()).get("/_identity-test").set("Authorization", `Bearer ${await tokenFor(config, "xuyenviet-web-bff", {}, webPrevious)}`).expect(200);
    expect(controller().calls).toBe(1);

    await rejected(await tokenFor(config, "xuyenviet-web-bff", { kid: config.issuers["xuyenviet-admin-bff"].active.kid }, config.issuers["xuyenviet-admin-bff"].active));

    // Configuration rejects expired overlap at startup; mutate the already-validated test config to exercise runtime expiry.
    config.issuers["xuyenviet-web-bff"].previous!.verificationEndsAt = new Date(Date.now() - 1);
    await restartApp();
    await rejected(await tokenFor(config, "xuyenviet-web-bff", {}, webPrevious));
  });
});

function currentIdentity(): ApiIdentityRepository {
  return { getSession: async () => ({ userId: "user-1", expires: new Date(Date.now() + 60_000), authorizationVersion: 1 }) };
}

async function startApp() {
  app = await NestFactory.create(createApiModule(config, identities), { logger: ["error"] });
  app.useGlobalFilters(new SafeApiExceptionFilter());
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

type TokenOverrides = { kid?: string; iss?: string; aud?: string; iat?: number; nbf?: number; exp?: number; sid?: string; roles?: string[]; jti?: string };

async function tokenFor(config: BffCredentialConfig, issuer: "xuyenviet-web-bff" | "xuyenviet-admin-bff", overrides: TokenOverrides = {}, signer = config.issuers[issuer].active) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { roles: overrides.roles ?? ["traveler"], rv: 1, jti: overrides.jti ?? crypto.randomUUID() };
  if (overrides.sid !== undefined) Object.assign(claims, { sid: overrides.sid });
  else if (!("sid" in overrides)) Object.assign(claims, { sid: "session-1" });
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: overrides.kid ?? signer.kid })
    .setSubject("user-1").setIssuer(overrides.iss ?? issuer).setAudience(overrides.aud ?? apiAudience)
    .setIssuedAt(overrides.iat ?? now).setNotBefore(overrides.nbf ?? now).setExpirationTime(overrides.exp ?? now + 60)
    .sign(await importJWK(signer.privateKey!, "ES256"));
}
