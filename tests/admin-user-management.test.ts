import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { apiAudience, encodeAdminUserRosterCursor, parseAdminUserRosterCursor, parseAdminUserRosterPage, parseAdminUserRosterQuery, parseUserRoleCommand, parseUserRoleCommandResult } from "@xuyenviet/contracts";
import { createBffTransportConfig } from "@xuyenviet/config";
import { AdminUsersController } from "../apps/api/src/admin/admin-users.controller";
import { AdminCapabilityGuard } from "../apps/api/src/auth/admin-capability.guard";
import { adminCsrfCookieName } from "../apps/admin/server/cookies";
import { issueAdminCsrfToken } from "../apps/admin/server/csrf";
import { executeAdminBffMutation, executeAdminBffRead } from "../apps/admin/server/bff-adapter";
import { adminBffResponse } from "../apps/admin/server/users";

const transport = createBffTransportConfig({
  privateApiUrl: new URL(`https://${apiAudience}`),
  bffOrigin: "https://admin.xuyenviet.app",
  csrfSigningSecret: "a".repeat(32),
  csrfLifetimeSeconds: 300,
  requestTimeoutMs: 100,
});

afterEach(() => vi.useRealTimers());

describe("admin user-role governance cutover", () => {
  test("uses a bounded opaque full ordering cursor and rejects malformed browser input", () => {
    const cursor = encodeAdminUserRosterCursor({ name: null, email: "a@example.com", id: "user-a" });
    expect(parseAdminUserRosterCursor(cursor)).toEqual({ name: null, email: "a@example.com", id: "user-a" });
    expect(parseAdminUserRosterQuery({ search: "Nguyen", cursor })).toEqual({ search: "Nguyen", cursor });
    expect(parseAdminUserRosterQuery({ page: "1" })).toBeNull();
    expect(parseUserRoleCommand({ targetUserId: "u", role: "traveler", operation: "grant" })).toBeNull();
    expect(parseUserRoleCommand({ targetUserId: "u", role: "admin", operation: "grant" })).toEqual({ targetUserId: "u", role: "admin", operation: "grant" });
    expect(parseUserRoleCommandResult({ targetUserId: "u", role: "admin", operation: "grant", changed: true })).toEqual({ targetUserId: "u", role: "admin", operation: "grant", changed: true });
  });

  test("accepts only safe roster projections", () => {
    expect(parseAdminUserRosterPage({ items: [{ id: "u", name: null, email: null, image: null, emailVerified: null, roles: ["admin"], usage: { aiRequestCount: "0", inputTokens: "0", outputTokens: "0" } }], nextCursor: null, search: "" })).not.toBeNull();
    expect(parseAdminUserRosterPage({ items: [{ id: "u", email: "private@example.com" }], nextCursor: null, search: "" })).toBeNull();
  });

  test("retires the matching legacy route, query, commands, and navigation", () => {
    expect(existsSync(join(process.cwd(), "src/app/admin/users/page.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/features/admin/users.ts"))).toBe(false);
    const actions = readFileSync(join(process.cwd(), "src/features/admin/actions.ts"), "utf8");
    const layout = readFileSync(join(process.cwd(), "src/app/admin/layout.tsx"), "utf8");
    expect(actions).not.toMatch(/grantAdminUserRole|revokeAdminUserRole/);
    expect(layout).not.toContain('href: "/admin/users"');
  });

  test("admits role governance only for an exact admin credential", () => {
    const guard = new AdminCapabilityGuard({ getAllAndOverride: () => "admin.role.governance" } as unknown as Reflector);
    for (const principal of [undefined, { issuer: "xuyenviet-admin-bff", roles: ["operator"] }, { issuer: "xuyenviet-admin-bff", roles: ["traveler"] }, { issuer: "xuyenviet-web-bff", roles: ["admin"] }]) {
      const context = { getHandler: () => () => {}, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ principal, requestId: "governance" }) }) } as never;
      expect(() => guard.canActivate(context)).toThrow();
    }
    const exactAdmin = { getHandler: () => () => {}, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ principal: { issuer: "xuyenviet-admin-bff", roles: ["admin"] }, requestId: "governance" }) }) } as never;
    expect(guard.canActivate(exactAdmin)).toBe(true);
  });

  test("controller validates query and command input before invoking its governance port", async () => {
    const transaction = { lockRoleGovernance: vi.fn(), loadLiveExactAdmin: vi.fn(async () => ({ userId: "admin", email: "admin@example.com" })), requireTargetUser: vi.fn(), lockTargetRoles: vi.fn(), listAdministratorUserIds: vi.fn(async () => ["admin"]), grantRole: vi.fn(async () => true), revokeRole: vi.fn(async () => true), incrementAuthorizationVersion: vi.fn(), recordRoleAudit: vi.fn() };
    const governance = { listUsers: vi.fn(async () => ({ items: [], nextCursor: null, search: "An" })), withinRoleGovernanceTransaction: vi.fn(async (operation) => operation(transaction)) };
    const controller = new AdminUsersController(governance);
    await expect(controller.list({ search: "An" })).resolves.toEqual({ items: [], nextCursor: null, search: "An" });
    expect(governance.listUsers).toHaveBeenCalledWith({ cursor: null, search: "An" });
    await expect(controller.list({ cursor: "invalid" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.grant("target", { role: "operator" } as never, { principal: { userId: "admin", sessionId: "session", roles: ["admin"], authorizationVersion: 1, issuer: "xuyenviet-admin-bff", tokenId: "token" } })).resolves.toMatchObject({ changed: true });
    expect(governance.withinRoleGovernanceTransaction).toHaveBeenCalledOnce();
    await expect(controller.revoke("", "admin", { principal: undefined })).rejects.toBeInstanceOf(BadRequestException);
    expect(governance.withinRoleGovernanceTransaction).toHaveBeenCalledOnce();
  });

  test("BFF rejects malformed roster and role input without credential minting or private requests", async () => {
    vi.resetModules();
    const executeAdminBffRead = vi.fn();
    const executeAdminBffMutation = vi.fn();
    vi.doMock("../apps/admin/server/bff-adapter", () => ({ executeAdminBffRead, executeAdminBffMutation }));
    const { mutateAdminUserRole, readAdminUsers } = await import("../apps/admin/server/users");
    const request = new Request("https://admin.xuyenviet.app/api/users", { headers: { "x-request-id": "known_request" } });
    await expect(readAdminUsers(request, ["one", "two"], null)).resolves.toMatchObject({ ok: false, error: { code: "validation_error", requestId: "known_request" } });
    await expect(mutateAdminUserRole(Object.assign(request, { cookies: { get: () => undefined } }), "", "admin", "revoke")).resolves.toMatchObject({ ok: false, error: { code: "validation_error", requestId: "known_request" } });
    expect(executeAdminBffRead).not.toHaveBeenCalled();
    expect(executeAdminBffMutation).not.toHaveBeenCalled();
    vi.doUnmock("../apps/admin/server/bff-adapter");
  });

  test("mutation adapter preserves only canonical correlated safe API errors", async () => {
    const token = issueAdminCsrfToken(transport);
    const request = { headers: new Headers({ origin: transport.bffOrigin, "sec-fetch-site": "same-origin", "X-XuyenViet-Admin-CSRF": token, "x-request-id": "role_error" }), cookies: { get: (name: string) => name === adminCsrfCookieName ? { value: token } : undefined } };
    const call = (response: Response) => executeAdminBffMutation({ request, rawInput: { role: "admin" }, parseInput: () => ({ role: "admin" }), parseResult: () => null, capability: "admin.role.governance", path: "/v1/admin/users/u/roles", method: "POST", config: transport, mintCredential: async () => "credential", fetcher: vi.fn(async () => response) });

    await expect(call(new Response(JSON.stringify({ code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: "role_error", violations: [{ field: "role", code: "invalid", message: "invalid role" }] }), { status: 400, headers: { "x-request-id": "role_error" } }))).resolves.toMatchObject({ ok: false, status: 400, error: { code: "validation_error", requestId: "role_error" } });
    await expect(call(new Response(JSON.stringify({ code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: "other" }), { status: 400, headers: { "x-request-id": "role_error" } }))).resolves.toMatchObject({ ok: false, error: { code: "internal_error", requestId: "role_error" } });
    await expect(call(new Response(JSON.stringify({ code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: "role_error" }), { status: 400, headers: { "x-request-id": "other" } }))).resolves.toMatchObject({ ok: false, error: { code: "internal_error", requestId: "role_error" } });
  });

  test("maps the canonical correlated request timeout envelope to HTTP 408", () => {
    const error = { code: "request_timeout" as const, message: "Không thể xử lý yêu cầu.", requestId: "timeout_13_2" };

    expect(adminBffResponse({ ok: false, error })).toEqual({ body: error, status: 408, requestId: "timeout_13_2" });
  });

  test("keeps private request timeout and caller abort active while parsing read and mutation JSON", async () => {
    vi.useFakeTimers();
    const token = issueAdminCsrfToken(transport);
    const request = (signal?: AbortSignal) => ({ headers: new Headers({ origin: transport.bffOrigin, "sec-fetch-site": "same-origin", "X-XuyenViet-Admin-CSRF": token }), cookies: { get: (name: string) => name === adminCsrfCookieName ? { value: token } : undefined }, signal });
    const responseAwaitingAbort = (signal: AbortSignal) => {
      const response = new Response(null, { headers: { "x-request-id": "generated" } });
      Object.defineProperty(response, "json", { value: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Request aborted.", "AbortError")), { once: true })) });
      return response;
    };
    const read = executeAdminBffRead({ request: { headers: new Headers() }, capability: "admin.role.governance", path: "/v1/admin/users", config: { ...transport, requestTimeoutMs: 1 }, mintCredential: async () => "credential", fetcher: vi.fn(async (_url, init) => responseAwaitingAbort(init!.signal!)), parseResult: () => ({ items: [], nextCursor: null, search: "" }) });
    await vi.advanceTimersByTimeAsync(1);
    await expect(read).resolves.toMatchObject({ ok: false, error: { code: "request_timeout" } });

    const caller = new AbortController();
    const mutation = executeAdminBffMutation({ request: request(caller.signal), rawInput: { role: "admin" }, parseInput: () => ({ role: "admin" }), parseResult: () => ({ targetUserId: "u", role: "admin", operation: "grant", changed: true }), capability: "admin.role.governance", path: "/v1/admin/users/u/roles", method: "POST", config: transport, mintCredential: async () => "credential", fetcher: vi.fn(async (_url, init) => responseAwaitingAbort(init!.signal!)) });
    await vi.advanceTimersByTimeAsync(0);
    caller.abort();
    await expect(mutation).resolves.toMatchObject({ ok: false, error: { code: "request_timeout" } });
  });

  test("does not invoke the private API when the caller aborts while an admin credential is minting", async () => {
    const token = issueAdminCsrfToken(transport);
    const caller = new AbortController();
    let minted!: (credential: string) => void;
    let mintStarted!: () => void;
    const minting = new Promise<string>((resolve) => { minted = resolve; });
    const started = new Promise<void>((resolve) => { mintStarted = resolve; });
    const mintCredential = vi.fn(async () => { mintStarted(); return minting; });
    const fetcher = vi.fn<typeof fetch>();
    const request = {
      headers: new Headers({ origin: transport.bffOrigin, "sec-fetch-site": "same-origin", "X-XuyenViet-Admin-CSRF": token, "x-request-id": "mint_abort_13_2" }),
      cookies: { get: (name: string) => name === adminCsrfCookieName ? { value: token } : undefined },
      signal: caller.signal,
    };
    const mutation = executeAdminBffMutation({ request, rawInput: { role: "admin" }, parseInput: () => ({ role: "admin" as const }), parseResult: () => ({ targetUserId: "u", role: "admin" as const, operation: "grant" as const, changed: true }), capability: "admin.role.governance", path: "/v1/admin/users/u/roles", method: "POST", config: transport, mintCredential, fetcher });

    await started;
    caller.abort();
    minted("credential");

    await expect(mutation).resolves.toEqual({ ok: false, error: { code: "request_timeout", message: "Không thể xử lý yêu cầu.", requestId: "mint_abort_13_2" } });
    expect(mintCredential).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("user roster aborts and generation-guards stale search or load-more responses, including after a mutation", () => {
    const source = readFileSync(join(process.cwd(), "apps/admin/app/users/user-roster.tsx"), "utf8");
    expect(source).toContain("rosterRequest.current?.abort()");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("generation !== rosterGeneration.current");
    expect(source).toContain("generation === rosterGeneration.current && !controller.signal.aborted");
    const mutationSucceeded = source.indexOf('if (!response.ok || !result || typeof result !== "object") throw new Error("mutation failed");');
    const invalidateGeneration = source.indexOf("++rosterGeneration.current", mutationSucceeded);
    const abortRoster = source.indexOf("rosterRequest.current?.abort()", mutationSucceeded);
    const updateRoles = source.indexOf("setPage((current) =>", mutationSucceeded);
    expect(invalidateGeneration).toBeGreaterThan(mutationSucceeded);
    expect(abortRoster).toBeGreaterThan(invalidateGeneration);
    expect(updateRoles).toBeGreaterThan(abortRoster);
  });

  test("user BFF routes project exact-admin data, authorization denial, and safe responses", async () => {
    vi.resetModules();
    const readAdminUsers = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: { items: [], nextCursor: null, search: "" }, requestId: "get_admin" })
      .mockResolvedValueOnce({ ok: false as const, error: { code: "forbidden", message: "Bạn không có quyền thực hiện thao tác này.", requestId: "get_operator" } })
      .mockResolvedValueOnce({ ok: false as const, error: { code: "unauthorized", message: "Không được phép truy cập.", requestId: "get_anonymous" } });
    const mutateAdminUserRole = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: { targetUserId: "target", role: "operator", operation: "grant", changed: true }, requestId: "post_admin" })
      .mockResolvedValueOnce({ ok: true as const, value: { targetUserId: "target", role: "operator", operation: "revoke", changed: true }, requestId: "delete_admin" })
      .mockResolvedValueOnce({ ok: false as const, error: { code: "csrf_invalid", message: "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.", requestId: "post_csrf" } })
      .mockResolvedValueOnce({ ok: false as const, error: { code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: "post_invalid" } });
    vi.doMock("../apps/admin/server/users", () => ({
      readAdminUsers,
      mutateAdminUserRole,
      adminBffResponse: (result: { ok: true; value: unknown; requestId: string } | { ok: false; error: { code: string; message: string; requestId: string } }) => result.ok
        ? { body: result.value, status: 200, requestId: result.requestId }
        : { body: result.error, status: result.error.code === "unauthorized" ? 401 : result.error.code === "forbidden" || result.error.code === "csrf_invalid" ? 403 : 503, requestId: result.error.requestId },
    }));
    const { GET } = await import("../apps/admin/app/api/users/route");
    const { POST } = await import("../apps/admin/app/api/users/[userId]/roles/route");
    const { DELETE } = await import("../apps/admin/app/api/users/[userId]/roles/[role]/route");

    const getAdmin = await GET(new NextRequest("https://admin.xuyenviet.app/api/users", { headers: { "x-request-id": "get_admin" } }));
    expect(getAdmin.status).toBe(200);
    expect(getAdmin.headers.get("x-request-id")).toBe("get_admin");
    expect(await getAdmin.json()).toEqual({ items: [], nextCursor: null, search: "" });
    await expect(GET(new NextRequest("https://admin.xuyenviet.app/api/users", { headers: { "x-request-id": "get_operator" } }))).resolves.toMatchObject({ status: 403 });
    await expect(GET(new NextRequest("https://admin.xuyenviet.app/api/users", { headers: { "x-request-id": "get_anonymous" } }))).resolves.toMatchObject({ status: 401 });

    const postAdmin = await POST(new NextRequest("https://admin.xuyenviet.app/api/users/target/roles", { method: "POST", body: JSON.stringify({ role: "operator" }) }), { params: Promise.resolve({ userId: "target" }) });
    expect(postAdmin.status).toBe(200);
    expect(await postAdmin.json()).toEqual({ targetUserId: "target", role: "operator", operation: "grant", changed: true });
    const deleteAdmin = await DELETE(new NextRequest("https://admin.xuyenviet.app/api/users/target/roles/operator", { method: "DELETE" }), { params: Promise.resolve({ userId: "target", role: "operator" }) });
    expect(deleteAdmin.status).toBe(200);
    expect(await deleteAdmin.json()).toEqual({ targetUserId: "target", role: "operator", operation: "revoke", changed: true });
    const csrfFailure = await POST(new NextRequest("https://admin.xuyenviet.app/api/users/target/roles", { method: "POST", body: JSON.stringify({ role: "operator" }) }), { params: Promise.resolve({ userId: "target" }) });
    expect(csrfFailure.status).toBe(403);
    const csrfBody = await csrfFailure.json();
    expect(csrfBody).toEqual({ code: "csrf_invalid", message: "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.", requestId: "post_csrf" });
    expect(JSON.stringify(csrfBody)).not.toContain("credential");

    await POST(new NextRequest("https://admin.xuyenviet.app/api/users/target/roles", { method: "POST", body: JSON.stringify({ role: "admin", unexpected: true }) }), { params: Promise.resolve({ userId: "target" }) });
    expect(mutateAdminUserRole).toHaveBeenLastCalledWith(expect.any(Request), "target", null, "grant");
    vi.doUnmock("../apps/admin/server/users");
  });
});
