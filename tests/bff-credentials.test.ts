import { generateKeyPair, exportJWK, jwtVerify } from "jose";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { apiAudience } from "@xuyenviet/contracts";
import { createBffCredentialConfig, parseBffCredentialConfig, type BffCredentialConfig, type Jwk } from "@xuyenviet/config";
import { BffCredentialError, mintWebBffCredential, mintWebBffCredentialForSession } from "@/server/bff-credentials";
import { sessions, userRoles, users } from "@/db/schema";

import { testDb } from "./helpers/db";

let config: BffCredentialConfig;

beforeEach(async () => {
  const web = await keySet("web-active");
  const admin = await keySet("admin-active");
  config = createBffCredentialConfig({
    audience: apiAudience,
    maxLifetimeSeconds: 300,
    issuers: {
      "xuyenviet-web-bff": { issuer: "xuyenviet-web-bff", active: web },
      "xuyenviet-admin-bff": { issuer: "xuyenviet-admin-bff", active: admin },
    },
  });
  await testDb.insert(users).values({ id: "traveler", email: "traveler@example.com" });
  await testDb.insert(sessions).values({ sessionToken: "opaque-session-token", userId: "traveler", expires: new Date(Date.now() + 60_000) });
  await testDb.insert(userRoles).values([{ userId: "traveler", role: "operator" }, { userId: "traveler", role: "traveler" }]);
});

describe("web BFF credentials", () => {
  test("mints a bounded ES256 credential with only the allowlisted claims", async () => {
    const token = await mintWebBffCredentialForSession("traveler", "opaque-session-token", config);
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
    const token = await mintWebBffCredential("traveler", config, {
      getAuthenticatedSession: async () => ({ userId: "traveler", email: "traveler@example.com" }),
      resolveBffSessionToken,
    });

    expect(token).toEqual(expect.any(String));
    expect(resolveBffSessionToken).toHaveBeenCalledWith("traveler");
  });

  test("rejects an absent or mismatched host-only Auth.js session before database session resolution", async () => {
    const resolveBffSessionToken = vi.fn(async () => "opaque-session-token");
    for (const getAuthenticatedSession of [
      async () => null,
      async () => ({ userId: "another-user", email: "another@example.com" }),
    ]) {
      await expect(mintWebBffCredential("traveler", config, { getAuthenticatedSession, resolveBffSessionToken })).rejects.toBeInstanceOf(BffCredentialError);
    }

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
            key: config.issuers["xuyenviet-web-bff"].active.key,
            verificationEndsAt: new Date(Date.now() + 60_000).toISOString(),
          },
        },
      },
    })));

    expect(parsed.issuers["xuyenviet-web-bff"].previous?.verificationEndsAt).toBeInstanceOf(Date);
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
