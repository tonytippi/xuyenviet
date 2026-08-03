import { generateKeyPair, exportJWK, jwtVerify } from "jose";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { apiAudience } from "@xuyenviet/contracts";
import { createBffCredentialConfig, createWebBffSigningConfig, parseBffCredentialConfig, type BffCredentialConfig, type Jwk, type WebBffSigningConfig } from "@xuyenviet/config";
import { BffCredentialError, mintWebBffCredential } from "@/server/bff-credentials";
import { sessions, userRoles, users } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";

let config: BffCredentialConfig;
let webSigningConfig: WebBffSigningConfig;

beforeEach(async () => {
  await resetTestDatabase();
  const web = await keySet("web-active");
  config = createBffCredentialConfig({
    audience: apiAudience,
    maxLifetimeSeconds: 300,
    issuers: {
      "xuyenviet-web-bff": { issuer: "xuyenviet-web-bff", active: web },
    },
  });
  webSigningConfig = createWebBffSigningConfig({
    audience: apiAudience,
    maxLifetimeSeconds: 300,
    issuer: "xuyenviet-web-bff",
    active: { kid: web.kid, publicKey: web.key, privateKey: web.privateKey },
  });
  await testDb.insert(users).values({ id: "traveler", email: "traveler@example.com" });
  await testDb.insert(sessions).values({ sessionToken: "opaque-session-token", userId: "traveler", expires: new Date(Date.now() + 60_000) });
  await testDb.insert(userRoles).values([{ userId: "traveler", role: "operator" }, { userId: "traveler", role: "traveler" }]);
});

describe("web BFF credentials", () => {
  test("mints a bounded ES256 credential with only the allowlisted claims", async () => {
    const token = await mintWebBffCredential(webSigningConfig, {
      getAuthenticatedSession: async () => ({ userId: "traveler", email: "traveler@example.com" }),
      resolveBffSessionToken: async () => "opaque-session-token",
    });
    const active = config.issuers["xuyenviet-web-bff"].active;
    const verified = await jwtVerify(token, await import("jose").then(({ importJWK }) => importJWK(active.key, "ES256")), {
      issuer: "xuyenviet-web-bff",
      audience: apiAudience,
    });

    expect(verified.protectedHeader).toEqual({ alg: "ES256", kid: "web-active" });
    expect(Object.keys(verified.payload).sort()).toEqual(["aud", "exp", "iat", "iss", "jti", "nbf", "roles", "rv", "sid", "sub"]);
    expect(verified.payload).toMatchObject({ sub: "traveler", sid: "opaque-session-token", roles: ["operator", "traveler"], rv: 1 });
    expect((verified.payload.exp ?? 0) - (verified.payload.iat ?? 0)).toBeLessThanOrEqual(300);
    expect(token).not.toContain("traveler@example.com");
  });

  test("validates the host-only Auth.js session before resolving its database session", async () => {
    const resolveBffSessionToken = vi.fn(async () => "opaque-session-token");
    const token = await mintWebBffCredential(webSigningConfig, {
      getAuthenticatedSession: async () => ({ userId: "traveler", email: "traveler@example.com" }),
      resolveBffSessionToken,
    });

    expect(token).toEqual(expect.any(String));
    expect(resolveBffSessionToken).toHaveBeenCalledWith("traveler");
  });

  test("rejects an absent host-only Auth.js session before database session resolution", async () => {
    const resolveBffSessionToken = vi.fn(async () => "opaque-session-token");
    await expect(mintWebBffCredential(webSigningConfig, { getAuthenticatedSession: async () => null, resolveBffSessionToken })).rejects.toBeInstanceOf(BffCredentialError);

    expect(resolveBffSessionToken).not.toHaveBeenCalled();
  });

  test("rejects invalid, non-finite, expired, and missing previous verification end timestamps", () => {
    const previous = { kid: "previous", key: config.issuers["xuyenviet-web-bff"].active.key };
    for (const verificationEndsAt of [new Date("invalid"), new Date(Number.POSITIVE_INFINITY), new Date(Date.now() - 1)]) {
      expect(() => createBffCredentialConfig({
        ...config,
        issuers: {
          ...config.issuers,
          "xuyenviet-web-bff": { ...config.issuers["xuyenviet-web-bff"], previous: { ...previous, verificationEndsAt } },
        },
      })).toThrow("Invalid BFF previous verification key.");
    }
    expect(() => createBffCredentialConfig({
      ...config,
      issuers: {
        ...config.issuers,
        "xuyenviet-web-bff": { ...config.issuers["xuyenviet-web-bff"], previous: { ...previous } },
      },
    })).toThrow("Invalid BFF previous verification key.");
  });

  test("parses a configured previous verification end timestamp from API JSON", () => {
    const parsed = parseBffCredentialConfig(JSON.parse(JSON.stringify({
      ...config,
      issuers: {
        ...config.issuers,
        "xuyenviet-web-bff": {
          ...config.issuers["xuyenviet-web-bff"],
          previous: {
            kid: "previous",
            key: { ...config.issuers["xuyenviet-web-bff"].active.key, kid: "previous" },
            verificationEndsAt: new Date(Date.now() + 60_000).toISOString(),
          },
        },
      },
    })));

    expect(parsed.issuers["xuyenviet-web-bff"].previous?.verificationEndsAt).toBeInstanceOf(Date);
  });

  test("rejects verifier private keys, key-coordinate mismatches, and duplicate rotation IDs", () => {
    const web = config.issuers["xuyenviet-web-bff"];
    expect(() => createBffCredentialConfig({
      ...config,
      issuers: { ...config.issuers, "xuyenviet-web-bff": { ...web, active: { ...web.active, key: { ...web.active.key, d: "private" } } } },
    })).toThrow("Invalid BFF issuer configuration.");
    expect(() => createBffCredentialConfig({
      ...config,
      issuers: { ...config.issuers, "xuyenviet-web-bff": { ...web, previous: { kid: web.active.kid, key: web.active.key, verificationEndsAt: new Date(Date.now() + 60_000) } } },
    })).toThrow("Invalid BFF previous verification key.");
    expect(() => createWebBffSigningConfig({
      ...webSigningConfig,
      active: { ...webSigningConfig.active, privateKey: { ...webSigningConfig.active.privateKey, x: "wrong" } },
    })).toThrow("Invalid web BFF signing configuration.");
  });

  test("rejects non-integer lifetimes and JWKs that cannot be imported", () => {
    expect(() => createBffCredentialConfig({ ...config, maxLifetimeSeconds: "300" as unknown as number })).toThrow("Invalid BFF credential configuration.");
    expect(() => createWebBffSigningConfig({
      ...webSigningConfig,
      active: { ...webSigningConfig.active, publicKey: { ...webSigningConfig.active.publicKey, x: "invalid" } },
    })).toThrow("Invalid web BFF signing configuration.");
  });
});

async function keySet(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  return { kid, key: asEs256Jwk(await exportJWK(publicKey), kid), privateKey: asEs256Jwk(await exportJWK(privateKey), kid) };
}

function asEs256Jwk(key: JsonWebKey, kid: string): Jwk {
  if (key.kty !== "EC" || key.crv !== "P-256") throw new Error("Expected an ES256 key.");
  return { ...key, kty: "EC", crv: "P-256", kid };
}
