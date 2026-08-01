import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { apiAudience, futureAdminSchemaCompatibilityConsumer, schemaCompatibilityDeclarations, type AdminIdentityHandoff } from "@xuyenviet/contracts";
import { createBffTransportConfig } from "@xuyenviet/config";
import { AdminCapabilityGuard } from "../apps/api/src/auth/admin-capability.guard";
import { AdminIdentityController } from "../apps/api/src/auth/admin-identity.controller";
import { adminCsrfCookieName } from "../apps/admin/server/cookies";
import { issueAdminCsrfToken } from "../apps/admin/server/csrf";
import { executeAdminBffMutation, executeAdminBffRead } from "../apps/admin/server/bff-adapter";
import { AdminAuthorizationDeniedError } from "../apps/admin/server/identity";
import { adminCsrfCookie, adminTransactionCookie } from "../apps/admin/server/cookies";

const transport = createBffTransportConfig({
  privateApiUrl: new URL(`https://${apiAudience}`),
  bffOrigin: "https://admin.xuyenviet.app",
  csrfSigningSecret: "a".repeat(32),
  csrfLifetimeSeconds: 300,
  requestTimeoutMs: 100,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.XV_ADMIN_GOOGLE_CLIENT_ID;
  delete process.env.XV_ADMIN_GOOGLE_CLIENT_SECRET;
});

describe("Story 13.1 final identity proofs", () => {
  test("consumes OAuth state once, rejects malformed or mismatched values, and returns only an opaque session on success", async () => {
    process.env.XV_ADMIN_GOOGLE_CLIENT_ID = "client";
    process.env.XV_ADMIN_GOOGLE_CLIENT_SECRET = "secret";
    const transaction = { id: "tx", state: "expected", codeVerifier: "verifier", callbackUrl: "https://admin.xuyenviet.app/api/auth/callback", expires: new Date(Date.now() + 60_000) };
    let consumed = false;
    const identities = {
      consumeAdminOAuthTransaction: vi.fn(async (id: string, state: string) => id === transaction.id && state === transaction.state && !consumed ? (consumed = true, transaction) : null),
      resolveAdminRolesForGoogleAccount: vi.fn(async () => ["operator"]),
      createAdminSessionForGoogleAccount: vi.fn(async () => "opaque-admin-session"),
      resolveAdminHandoff: vi.fn(), revokeAdminSession: vi.fn(), purgeExpiredAdminOAuthTransactions: vi.fn(), createAdminOAuthTransaction: vi.fn(),
    };
    const controller = identityController(identities);
    await expect(controller.completeOAuth("Bearer service", { code: "code", state: "expected", transactionId: "" })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.completeOAuth("Bearer service", { code: "code", state: "wrong", transactionId: "tx" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identities.createAdminSessionForGoogleAccount).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "google-subject" }), { status: 200 })));
    await expect(controller.completeOAuth("Bearer service", { code: "code", state: "expected", transactionId: "tx" })).resolves.toEqual({ sessionId: "opaque-admin-session" });
    expect(identities.createAdminSessionForGoogleAccount).toHaveBeenCalledWith("google-subject", expect.any(Date));
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(true);
    await expect(controller.completeOAuth("Bearer service", { code: "code", state: "expected", transactionId: "tx" })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test("OAuth callback resolves roles and rejects travelers before creating an admin session", async () => {
    process.env.XV_ADMIN_GOOGLE_CLIENT_ID = "client";
    process.env.XV_ADMIN_GOOGLE_CLIENT_SECRET = "secret";
    const identities = {
      consumeAdminOAuthTransaction: vi.fn(async () => ({ id: "tx", state: "state", codeVerifier: "verifier", callbackUrl: "https://admin.xuyenviet.app/api/auth/callback", expires: new Date(Date.now() + 60_000) })),
      resolveAdminRolesForGoogleAccount: vi.fn(async () => ["traveler"]),
      createAdminSessionForGoogleAccount: vi.fn(async () => "must-not-exist"),
      resolveAdminHandoff: vi.fn(), revokeAdminSession: vi.fn(), purgeExpiredAdminOAuthTransactions: vi.fn(), createAdminOAuthTransaction: vi.fn(),
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "traveler-subject" }), { status: 200 })));
    await expect(identityController(identities).completeOAuth("Bearer service", { code: "code", state: "state", transactionId: "tx" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identities.resolveAdminRolesForGoogleAccount).toHaveBeenCalledWith("traveler-subject");
    expect(identities.createAdminSessionForGoogleAccount).not.toHaveBeenCalled();
  });

  test("uses a host-only Lax transaction cookie and issues a distinct non-HttpOnly CSRF token cookie", () => {
    expect(adminTransactionCookie("transaction")).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax", path: "/" });
    expect(adminTransactionCookie("transaction")).not.toHaveProperty("domain");
    expect(adminCsrfCookie("token", 300)).toMatchObject({ secure: true, sameSite: "strict", path: "/", maxAge: 300 });
    expect(adminCsrfCookie("token", 300)).not.toHaveProperty("httpOnly");
    expect(adminCsrfCookie("token", 300)).not.toHaveProperty("domain");
  });

  test("rejects unavailable or invalid identity handoffs before a credential can be minted", async () => {
    const identities = { resolveAdminHandoff: vi.fn(async () => null), revokeAdminSession: vi.fn(), purgeExpiredAdminOAuthTransactions: vi.fn(), createAdminOAuthTransaction: vi.fn(), consumeAdminOAuthTransaction: vi.fn(), createAdminSessionForGoogleAccount: vi.fn() };
    const controller = identityController(identities);
    await expect(controller.handoff("Bearer service", { sessionId: "opaque" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identities.resolveAdminHandoff).toHaveBeenCalledOnce();
    const unavailable = identityController({ ...identities, resolveAdminHandoff: vi.fn(async () => { throw new Error("database unavailable"); }) });
    await expect(unavailable.handoff("Bearer service", { sessionId: "opaque" })).rejects.toMatchObject({ status: 503 });
  });

  test("denies every identity operation before repository or provider work when release admission is unready", async () => {
    const identities = {
      resolveAdminHandoff: vi.fn(), revokeAdminSession: vi.fn(), purgeExpiredAdminOAuthTransactions: vi.fn(), createAdminOAuthTransaction: vi.fn(),
      consumeAdminOAuthTransaction: vi.fn(), createAdminSessionForGoogleAccount: vi.fn(), resolveAdminRolesForGoogleAccount: vi.fn(),
    };
    const controller = identityController(identities, { hasCompatibleSchemaVersion: vi.fn(async () => false) });
    for (const operation of [
      () => controller.handoff("Bearer service", { sessionId: "opaque" }),
      () => controller.startOAuth("Bearer service", { callbackUrl: "https://admin.xuyenviet.app/api/auth/callback" }),
      () => controller.completeOAuth("Bearer service", { code: "code", state: "state", transactionId: "transaction" }),
      () => controller.revoke("Bearer service", { sessionId: "opaque", subject: "operator" }),
    ]) await expect(operation()).rejects.toMatchObject({ status: 503 });
    expect(identities.resolveAdminHandoff).not.toHaveBeenCalled();
    expect(identities.purgeExpiredAdminOAuthTransactions).not.toHaveBeenCalled();
    expect(identities.consumeAdminOAuthTransaction).not.toHaveBeenCalled();
    expect(identities.revokeAdminSession).not.toHaveBeenCalled();
  });

  test("policy-free identity admission accepts 20260728.1 and rejects 20260729.1", async () => {
    const identities = {
      resolveAdminHandoff: vi.fn(async () => ({ subject: "operator", sessionId: "opaque", authorizationVersion: 1, roles: ["operator"] })),
      revokeAdminSession: vi.fn(), purgeExpiredAdminOAuthTransactions: vi.fn(), createAdminOAuthTransaction: vi.fn(), consumeAdminOAuthTransaction: vi.fn(), createAdminSessionForGoogleAccount: vi.fn(),
    };
    for (const [version, admitted] of [["20260728.1", true], ["20260729.1", false]] as const) {
      const hasCompatibleSchemaVersion = vi.fn(async (declaration: { minimumVersion: string; maximumVersion: string }) =>
        version === "20260728.1" && declaration.minimumVersion === "20260728.1" && declaration.maximumVersion === "20260728.1");
      const controller = identityController(identities, { hasCompatibleSchemaVersion });
      const handoff = controller.handoff("Bearer service", { sessionId: "opaque" });
      if (admitted) await expect(handoff).resolves.toMatchObject({ identity: { sessionId: "opaque" } });
      else await expect(handoff).rejects.toMatchObject({ status: 503 });
      expect(hasCompatibleSchemaVersion).toHaveBeenCalledWith({ ...futureAdminSchemaCompatibilityConsumer.declaration, maximumVersion: "20260728.1" });
    }
  });

  test("rejection of expired, revoked, logged-out, or authorization-version-changed sessions is delegated to live identity state", async () => {
    const states: Record<string, AdminIdentityHandoff | null> = {
      live: { subject: "operator", sessionId: "live", authorizationVersion: 1, roles: ["operator"] },
      expired: null,
      revoked: null,
      changed: { subject: "operator", sessionId: "changed", authorizationVersion: 2, roles: ["operator"] },
    };
    const identities = { resolveAdminHandoff: vi.fn(async (sessionId: string) => states[sessionId]), revokeAdminSession: vi.fn(async (id: string) => { states[id] = null; }), purgeExpiredAdminOAuthTransactions: vi.fn(), createAdminOAuthTransaction: vi.fn(), consumeAdminOAuthTransaction: vi.fn(), createAdminSessionForGoogleAccount: vi.fn() };
    const controller = identityController(identities);
    await expect(controller.handoff("Bearer service", { sessionId: "live" })).resolves.toMatchObject({ identity: states.live });
    for (const id of ["expired", "revoked"]) await expect(controller.handoff("Bearer service", { sessionId: id })).rejects.toBeInstanceOf(UnauthorizedException);
    await controller.revoke("Bearer service", { sessionId: "live", subject: "operator" });
    await expect(controller.handoff("Bearer service", { sessionId: "live" })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.handoff("Bearer service", { sessionId: "changed", subject: "operator" })).resolves.toMatchObject({ identity: { authorizationVersion: 2 } });
  });

  test("revoke accepts only the BFF's own currently live session and subject", async () => {
    const identities = {
      resolveAdminHandoff: vi.fn(async (sessionId: string, subject?: string) => sessionId === "own" && subject === "operator" ? { subject: "operator", sessionId: "own", authorizationVersion: 1, roles: ["operator"] } : null),
      revokeAdminSession: vi.fn(), purgeExpiredAdminOAuthTransactions: vi.fn(), createAdminOAuthTransaction: vi.fn(), consumeAdminOAuthTransaction: vi.fn(), createAdminSessionForGoogleAccount: vi.fn(),
    };
    const controller = identityController(identities);
    await expect(controller.revoke("Bearer service", { sessionId: "other", subject: "operator" })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.revoke("Bearer service", { sessionId: "own", subject: "other" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identities.revokeAdminSession).not.toHaveBeenCalled();
    await expect(controller.revoke("Bearer service", { sessionId: "own", subject: "operator" })).resolves.toBeUndefined();
    expect(identities.revokeAdminSession).toHaveBeenCalledWith("own");
  });

  test("purges a bounded set of expired OAuth transactions before creating a new one and fails closed on cleanup errors", async () => {
    process.env.XV_ADMIN_GOOGLE_CLIENT_ID = "client";
    process.env.XV_ADMIN_GOOGLE_CLIENT_SECRET = "secret";
    const identities = { resolveAdminHandoff: vi.fn(), revokeAdminSession: vi.fn(), purgeExpiredAdminOAuthTransactions: vi.fn(async () => {}), createAdminOAuthTransaction: vi.fn(async () => {}), consumeAdminOAuthTransaction: vi.fn(), createAdminSessionForGoogleAccount: vi.fn() };
    const controller = identityController(identities);
    await expect(controller.startOAuth("Bearer service", { callbackUrl: "https://admin.xuyenviet.app/api/auth/callback" })).resolves.toMatchObject({ transactionId: expect.any(String) });
    expect(identities.purgeExpiredAdminOAuthTransactions).toHaveBeenCalledWith(100);
    expect(identities.createAdminOAuthTransaction).toHaveBeenCalledAfter(identities.purgeExpiredAdminOAuthTransactions);
    const unavailable = identityController({ ...identities, purgeExpiredAdminOAuthTransactions: vi.fn(async () => { throw new Error("database unavailable"); }) });
    await expect(unavailable.startOAuth("Bearer service", { callbackUrl: "https://admin.xuyenviet.app/api/auth/callback" })).rejects.toMatchObject({ status: 503 });
  });

  test("accepts only the exact admin callback origin without credentials or a non-default port", async () => {
    process.env.XV_ADMIN_GOOGLE_CLIENT_ID = "client";
    process.env.XV_ADMIN_GOOGLE_CLIENT_SECRET = "secret";
    const identities = { resolveAdminHandoff: vi.fn(), revokeAdminSession: vi.fn(), purgeExpiredAdminOAuthTransactions: vi.fn(), createAdminOAuthTransaction: vi.fn(), consumeAdminOAuthTransaction: vi.fn(), createAdminSessionForGoogleAccount: vi.fn() };
    const controller = identityController(identities);

    for (const callbackUrl of [
      "https://operator@admin.xuyenviet.app/api/auth/callback",
      "https://operator:secret@admin.xuyenviet.app/api/auth/callback",
      "https://admin.xuyenviet.app:444/api/auth/callback",
    ]) {
      await expect(controller.startOAuth("Bearer service", { callbackUrl })).rejects.toBeInstanceOf(UnauthorizedException);
    }

    expect(identities.createAdminOAuthTransaction).not.toHaveBeenCalled();
  });
});

describe("Story 13.1 BFF and API denial proofs", () => {
  test("adapter rejects origin, Fetch Metadata, and CSRF before minting, forwards only allowed headers, and redacts failures", async () => {
    const token = issueAdminCsrfToken(transport);
    const mintCredential = vi.fn(async () => "internal-credential");
    const fetcher = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => new Response(JSON.stringify({ accepted: true }), { status: 200, headers: { "x-request-id": (init?.headers as Record<string, string>)["x-request-id"] } }));
    const request = (headers: Record<string, string>) => ({ headers: new Headers(headers), cookies: { get: (name: string) => name === adminCsrfCookieName ? { value: token } : undefined } });
    for (const headers of [
      { origin: "https://foreign.example", "sec-fetch-site": "same-origin", "X-XuyenViet-Admin-CSRF": token },
      { origin: transport.bffOrigin, "sec-fetch-site": "cross-site", "X-XuyenViet-Admin-CSRF": token },
      { origin: transport.bffOrigin, "X-XuyenViet-Admin-CSRF": token },
      { origin: transport.bffOrigin, "sec-fetch-site": "same-origin", "X-XuyenViet-Admin-CSRF": "invalid" },
    ] as Array<Record<string, string>>) {
      await expect(adapterCall(request(headers), mintCredential, fetcher)).resolves.toMatchObject({ ok: false, error: { code: "csrf_invalid" } });
    }
    expect(mintCredential).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();

    const accepted = await adapterCall(request({ origin: transport.bffOrigin, "sec-fetch-site": "same-origin", "X-XuyenViet-Admin-CSRF": token, "x-request-id": "admin_13_1" }), mintCredential, fetcher, { idempotencyKey: "only-when-declared", allowIdempotencyKey: true });
    expect(accepted).toEqual({ ok: true, value: { accepted: true }, requestId: "admin_13_1" });
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ headers: { authorization: "Bearer internal-credential", "x-request-id": "admin_13_1", accept: "application/json", "content-type": "application/json", "idempotency-key": "only-when-declared" } }));

    const unsafeFailure = await adapterCall(request({ origin: transport.bffOrigin, "sec-fetch-site": "same-origin", "X-XuyenViet-Admin-CSRF": token }), mintCredential, vi.fn(async () => new Response("provider token and private url", { status: 500 })));
    expect(unsafeFailure).toMatchObject({ ok: false, error: { code: "internal_error", message: "Không thể xử lý yêu cầu." } });
    expect(JSON.stringify(unsafeFailure)).not.toContain("provider token");

    const timeout = await adapterCall(request({ origin: transport.bffOrigin, "sec-fetch-site": "same-origin", "X-XuyenViet-Admin-CSRF": token }), mintCredential, vi.fn((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("timed out")))) as never));
    expect(timeout).toMatchObject({ ok: false, error: { code: "internal_error" } });
  });

  test("capability denial occurs before handler work", () => {
    const guard = new AdminCapabilityGuard({ getAllAndOverride: () => "admin.role.governance" } as unknown as Reflector);
    let handlerCalls = 0;
    const context = { getHandler: () => () => { handlerCalls += 1; }, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ principal: { roles: ["operator"] }, requestId: "known" }) }) } as never;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(handlerCalls).toBe(0);
  });

  test("readiness accepts only the admin declaration and rejects API-admitted/admin-incompatible states", async () => {
    const repository = { hasCompatibleSchemaVersion: vi.fn(async () => true), readSchemaAdmission: vi.fn(async () => { throw new Error("unavailable"); }) };
    await expect(identityController({}, repository, false).readiness("Bearer service", { declaration: futureAdminSchemaCompatibilityConsumer.declaration })).resolves.toEqual({ ready: false });
    await expect(identityController({}, repository, true, null).readiness("Bearer service", { declaration: futureAdminSchemaCompatibilityConsumer.declaration })).resolves.toEqual({ ready: false });
    await expect(identityController({}, { hasCompatibleSchemaVersion: vi.fn(async () => false) }, true).readiness("Bearer service", { declaration: futureAdminSchemaCompatibilityConsumer.declaration })).resolves.toEqual({ ready: false });
    const compatible = { hasCompatibleSchemaVersion: vi.fn(async () => true) };
    await expect(identityController({}, compatible, true).readiness("Bearer service", { declaration: futureAdminSchemaCompatibilityConsumer.declaration })).resolves.toEqual({ ready: true });
    expect(compatible.hasCompatibleSchemaVersion).toHaveBeenCalledWith({ ...futureAdminSchemaCompatibilityConsumer.declaration, maximumVersion: "20260728.1" });
    await expect(identityController({}, compatible, true).readiness("Bearer service", { declaration: schemaCompatibilityDeclarations.api })).resolves.toEqual({ ready: false });

    const incompatibleAdminPolicy = {
      target: { resolvedIdentity: "target" },
      workloads: { ...schemaCompatibilityDeclarations, admin: { ...schemaCompatibilityDeclarations.admin, maximumVersion: "20260728.1" } },
    } as never;
    const apiAdmittedAdminIncompatible = { readSchemaAdmission: vi.fn(async () => ({ rows: [{ version: "20260729.1" }], resolvedTargetIdentity: "target" })), hasCompatibleSchemaVersion: vi.fn(async () => true) };
    await expect(identityController({}, apiAdmittedAdminIncompatible, true, incompatibleAdminPolicy).readiness("Bearer service", { declaration: futureAdminSchemaCompatibilityConsumer.declaration })).resolves.toEqual({ ready: false });
  });

  test("the actual workspace route delegates the request, including its correlation ID, to the admin adapter", async () => {
    const executeAdminBffRead = vi.fn(async () => ({ ok: true as const, value: { ready: true }, requestId: "workspace_13_1" }));
    vi.resetModules();
    vi.doMock("../apps/admin/server/bff-adapter", () => ({ executeAdminBffRead }));
    const { GET } = await import("../apps/admin/app/api/workspace/route");
    const response = await GET(new Request("https://admin.xuyenviet.app/api/workspace", { headers: { "x-request-id": "workspace_13_1" } }));
    expect(executeAdminBffRead).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({ headers: expect.any(Headers) }), capability: "admin.workspace.read", path: "/v1/admin/workspace" }));
    expect(response.headers.get("x-request-id")).toBe("workspace_13_1");
    expect(await response.json()).toEqual({ ready: true });
  });

  test("workspace adapter generates, validates, and forwards the request ID", async () => {
    let forwarded: string | undefined;
    const fetcher: typeof fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      forwarded = (init?.headers as Record<string, string>)["x-request-id"];
      return new Response(JSON.stringify({ ready: true }), { status: 200, headers: { "x-request-id": forwarded! } });
    });
    const result = await executeAdminBffRead({ request: { headers: new Headers({ "x-request-id": "unsafe request id" }) }, capability: "admin.workspace.read", path: "/v1/admin/workspace", config: transport, mintCredential: async () => "internal-credential", fetcher, parseResult: (value) => value && typeof value === "object" && (value as { ready?: unknown }).ready === true ? { ready: true } : null });
    expect(result).toMatchObject({ ok: true, value: { ready: true } });
    expect(forwarded).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(result.ok && result.requestId).toBe(forwarded);
  });

  test("adapter projects denied credential minting as authorization failure, not service unavailability", async () => {
    const token = issueAdminCsrfToken(transport);
    const request = { headers: new Headers({ origin: transport.bffOrigin, "sec-fetch-site": "same-origin", "X-XuyenViet-Admin-CSRF": token }), cookies: { get: (name: string) => name === adminCsrfCookieName ? { value: token } : undefined } };
    await expect(adapterCall(request, async () => { throw new AdminAuthorizationDeniedError("unauthorized"); }, vi.fn())).resolves.toMatchObject({ ok: false, error: { code: "unauthorized" } });
    await expect(adapterCall(request, async () => { throw new AdminAuthorizationDeniedError("forbidden"); }, vi.fn())).resolves.toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  test("workspace route projects absent and forbidden admin identity as authorization denial", async () => {
    vi.resetModules();
    const executeAdminBffRead = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, error: { code: "unauthorized", message: "Không được phép truy cập.", requestId: "absent" } })
      .mockResolvedValueOnce({ ok: false as const, error: { code: "forbidden", message: "Bạn không có quyền thực hiện thao tác này.", requestId: "forbidden" } });
    vi.doMock("../apps/admin/server/bff-adapter", () => ({ executeAdminBffRead }));
    const { GET } = await import("../apps/admin/app/api/workspace/route");
    await expect(GET(new Request("https://admin.xuyenviet.app/api/workspace"))).resolves.toMatchObject({ status: 401 });
    await expect(GET(new Request("https://admin.xuyenviet.app/api/workspace"))).resolves.toMatchObject({ status: 403 });
  });

  test("admin source and browser assets have no database/root import or secret/private URL disclosure", () => {
    const adminRoot = join(process.cwd(), "apps/admin");
    const sources = files(adminRoot).filter((file) => /\.(ts|tsx)$/.test(file)).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(sources).not.toMatch(/from\s+["'](?:@\/|@xuyenviet\/database|drizzle-orm|server-only.*src)/);
    expect(sources).not.toContain("DATABASE_URL");
    const browserRoot = join(adminRoot, ".next/static");
    const browser = existsSync(browserRoot) ? files(browserRoot).map((file) => readFileSync(file, "utf8")).join("\n") : "";
    expect(browser).not.toMatch(/XV_ADMIN_(?:BFF_ACTIVE_PRIVATE_JWK|IDENTITY_HANDOFF_SERVICE_TOKEN|PRIVATE_API_URL)|DATABASE_URL|api\.railway\.internal/);
  });
});

function identityController(identities: Record<string, unknown>, schemaVersions: Record<string, unknown> = { hasCompatibleSchemaVersion: async () => true }, configValid = true, policy: undefined | null = undefined) {
  return new AdminIdentityController({ resolveAdminRolesForGoogleAccount: async () => ["operator"], ...identities } as never, "service", schemaVersions as never, configValid, policy);
}

function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]);
}

function adapterCall(request: { headers: Headers; cookies: { get(name: string): { value: string } | undefined } }, mintCredential: (capability: "admin.workspace.read" | "admin.role.governance" | "admin.ai-model-catalog.write") => Promise<string>, fetcher: typeof fetch, extra: { idempotencyKey?: string; allowIdempotencyKey?: boolean } = {}) {
  return executeAdminBffMutation({ request, rawInput: { title: "valid" }, parseInput: (value) => typeof value === "object" ? { title: "valid" } : null, parseResult: (value) => value && typeof value === "object" && (value as { accepted?: unknown }).accepted === true ? { accepted: true } : null, capability: "admin.workspace.read", path: "/v1/admin/test", method: "POST", config: transport, mintCredential, fetcher, ...extra });
}
