import { exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { apiAudience } from "@xuyenviet/contracts";

const state = vi.hoisted(() => ({ cookieValues: new Map<string, string>(), config: undefined as unknown, fetcher: vi.fn<typeof fetch>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => state.cookieValues.has(name) ? { value: state.cookieValues.get(name)! } : undefined }),
}));
vi.mock("@xuyenviet/config", () => ({ getAdminBffConfig: () => state.config }));

beforeEach(() => {
  vi.resetModules();
  state.cookieValues.clear();
  state.fetcher.mockReset();
  vi.stubGlobal("fetch", state.fetcher);
});

describe("admin identity routes", () => {
  test("rejects non-default ports in admin private API and identity handoff configuration", async () => {
    const key = await keySet("admin-key");
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      XV_ADMIN_PRIVATE_API_URL: `https://${apiAudience}`,
      XV_ADMIN_BFF_ORIGIN: "https://admin.xuyenviet.app",
      XV_ADMIN_BFF_CSRF_SIGNING_SECRET: "a".repeat(32),
      XV_ADMIN_BFF_CSRF_LIFETIME_SECONDS: "300",
      XV_ADMIN_BFF_REQUEST_TIMEOUT_MS: "100",
      XV_ADMIN_IDENTITY_HANDOFF_URL: `https://${apiAudience}`,
      XV_ADMIN_IDENTITY_HANDOFF_SERVICE_TOKEN: "service",
      XV_ADMIN_BFF_ACTIVE_KID: "admin-key",
      XV_ADMIN_BFF_ACTIVE_JWK: JSON.stringify(key.publicKey),
      XV_ADMIN_BFF_ACTIVE_PRIVATE_JWK: JSON.stringify(key.privateKey),
    };
    const { getAdminBffConfig } = await vi.importActual<typeof import("@xuyenviet/config")>("@xuyenviet/config");
    expect(getAdminBffConfig(environment)).toMatchObject({ handoffUrl: `https://${apiAudience}/` });
    expect(() => getAdminBffConfig({ ...environment, XV_ADMIN_PRIVATE_API_URL: `https://${apiAudience}:444` })).toThrow("Invalid BFF transport configuration.");
    expect(() => getAdminBffConfig({ ...environment, XV_ADMIN_IDENTITY_HANDOFF_URL: `https://${apiAudience}:444` })).toThrow("Invalid admin identity handoff configuration.");
  });

  test("permits only the explicit local loopback admin transport", async () => {
    const key = await keySet("admin-key");
    const environment: NodeJS.ProcessEnv = {
      APP_ENV: "local",
      XV_ADMIN_LOCAL_TRANSPORT: "true",
      XV_ADMIN_PRIVATE_API_URL: "http://127.0.0.1:3001",
      XV_ADMIN_BFF_ORIGIN: "http://localhost:3003",
      XV_ADMIN_BFF_CSRF_SIGNING_SECRET: "a".repeat(32),
      XV_ADMIN_BFF_CSRF_LIFETIME_SECONDS: "300",
      XV_ADMIN_BFF_REQUEST_TIMEOUT_MS: "100",
      XV_ADMIN_IDENTITY_HANDOFF_URL: "http://127.0.0.1:3001",
      XV_ADMIN_IDENTITY_HANDOFF_SERVICE_TOKEN: "service",
      XV_ADMIN_BFF_ACTIVE_KID: "admin-key",
      XV_ADMIN_BFF_ACTIVE_JWK: JSON.stringify(key.publicKey),
      XV_ADMIN_BFF_ACTIVE_PRIVATE_JWK: JSON.stringify(key.privateKey),
    };
    const { getAdminBffConfig } = await vi.importActual<typeof import("@xuyenviet/config")>("@xuyenviet/config");
    expect(getAdminBffConfig(environment).transport).toMatchObject({ privateApiUrl: "http://127.0.0.1:3001/", bffOrigin: "http://localhost:3003" });
    expect(() => getAdminBffConfig({ ...environment, XV_ADMIN_PRIVATE_API_URL: "http://localhost:3001" })).toThrow("Invalid local admin BFF transport configuration.");
    expect(() => getAdminBffConfig({ ...environment, APP_ENV: "production" })).toThrow("Invalid BFF transport configuration.");
  });

  test("mints only bounded admin claims with its isolated signing key and ignores traveler cookies", async () => {
    const admin = await keySet("admin-key");
    const web = await keySet("web-key");
    state.config = {
      transport: { requestTimeoutMs: 100 }, handoffUrl: `https://${apiAudience}`, handoffServiceToken: "service",
      signing: { audience: apiAudience, maxLifetimeSeconds: 300, issuer: "xuyenviet-admin-bff", active: admin },
    };
    state.cookieValues.set("authjs.session-token", "traveler-root-cookie");
    const { mintAdminCredential, requireOperator } = await import("../apps/admin/server/identity");
    await expect(requireOperator()).resolves.toBeNull();
    await expect(mintAdminCredential()).rejects.toThrow("Admin access denied.");
    expect(state.fetcher).not.toHaveBeenCalled();

    state.cookieValues.set("__Host-xuyenviet-admin-session", "admin-opaque-session");
    state.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ identity: { subject: "operator", sessionId: "admin-opaque-session", authorizationVersion: 4, roles: ["operator"] } }), { status: 200 }));
    const token = await mintAdminCredential();
    const verified = await jwtVerify(token, await importJWK(admin.publicKey, "ES256"), { issuer: "xuyenviet-admin-bff", audience: apiAudience });
    expect(verified.protectedHeader).toEqual({ alg: "ES256", kid: "admin-key" });
    expect(Object.keys(verified.payload).sort()).toEqual(["aud", "exp", "iat", "iss", "jti", "nbf", "roles", "rv", "sid", "sub"]);
    expect(verified.payload).toMatchObject({ sub: "operator", sid: "admin-opaque-session", rv: 4, roles: ["operator"] });
    await expect(jwtVerify(token, await importJWK(web.publicKey, "ES256"), { issuer: "xuyenviet-admin-bff", audience: apiAudience })).rejects.toThrow();
  });

  test("callback rejects a non-admin origin before completing the identity handoff", async () => {
    const completeOAuthCallback = vi.fn();
    vi.doMock("../apps/admin/server/identity", () => ({ completeOAuthCallback }));
    process.env.XV_ADMIN_BFF_ORIGIN = "https://admin.xuyenviet.app";
    const { GET } = await import("../apps/admin/app/api/auth/callback/route");
    const response = await GET(new Request("https://foreign.example/api/auth/callback?code=code&state=state") as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://foreign.example/sign-in");
    expect(completeOAuthCallback).not.toHaveBeenCalled();
    delete process.env.XV_ADMIN_BFF_ORIGIN;
  });

  test("local callback reads the local OAuth transaction cookie", async () => {
    const completeOAuthCallback = vi.fn().mockResolvedValue("local-admin-session");
    vi.doMock("../apps/admin/server/identity", () => ({ completeOAuthCallback }));
    process.env.APP_ENV = "local";
    process.env.XV_ADMIN_LOCAL_TRANSPORT = "true";
    process.env.XV_ADMIN_BFF_ORIGIN = "http://localhost:3003";
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../apps/admin/app/api/auth/callback/route");
    const response = await GET(new NextRequest("http://localhost:3003/api/auth/callback?code=code&state=state", { headers: { cookie: "xv-local-admin-oauth=local-transaction" } }));
    expect(completeOAuthCallback).toHaveBeenCalledWith("code", "state", "local-transaction");
    expect(response.headers.get("location")).toBe("http://localhost:3003/");
    expect(response.headers.getSetCookie()).toEqual(expect.arrayContaining([expect.stringContaining("xv-local-admin-session=local-admin-session")]));
    delete process.env.APP_ENV;
    delete process.env.XV_ADMIN_LOCAL_TRANSPORT;
    delete process.env.XV_ADMIN_BFF_ORIGIN;
  });

  test("callback returns a terminal denial instead of restarting OAuth", async () => {
    const completeOAuthCallback = vi.fn().mockResolvedValue(null);
    vi.doMock("../apps/admin/server/identity", () => ({ completeOAuthCallback }));
    process.env.XV_ADMIN_BFF_ORIGIN = "https://admin.xuyenviet.app";
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../apps/admin/app/api/auth/callback/route");
    const response = await GET(new NextRequest("https://admin.xuyenviet.app/api/auth/callback?code=code&state=state", { headers: { cookie: "__Host-xuyenviet-admin-oauth=transaction" } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ code: "unauthorized" });
    delete process.env.XV_ADMIN_BFF_ORIGIN;
  });
});

async function keySet(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  return { kid, publicKey: { ...await exportJWK(publicKey), kid } as JsonWebKey, privateKey: { ...await exportJWK(privateKey), kid } as JsonWebKey };
}
