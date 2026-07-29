import { describe, expect, test, vi } from "vitest";

import { createBffTransportConfig, getBffCsrfConfig, getBffTransportConfig } from "@xuyenviet/config";
import { BffApiError, callPrivateApi, callPrivateApiStream } from "@/server/bff-api-client";
import { issueCsrfToken, issueCsrfTokenWithCookie, validateCsrfRequest } from "@/server/csrf";
import { executeProtectedBffMutation } from "@/server/protected-bff-adapter";

const config = createBffTransportConfig({ privateApiUrl: new URL("https://api.railway.internal"), bffOrigin: "https://web.xuyenviet.vn", csrfSigningSecret: "a".repeat(32), csrfLifetimeSeconds: 300, requestTimeoutMs: 100 });

describe("private BFF transport", () => {
  test("rejects bad CSRF and invalid DTOs before credential minting or private API invocation", async () => {
    const mintCredential = vi.fn(); const fetcher = vi.fn();
    const invalidCsrf = await adapter({ mintCredential, fetcher, origin: "https://foreign.example", rawInput: { title: "valid" } });
    const invalidDto = await adapter({ mintCredential, fetcher, rawInput: {} });

    expect(invalidCsrf).toMatchObject({ ok: false, error: { code: "csrf_invalid" } });
    expect(invalidDto).toMatchObject({ ok: false, error: { code: "validation_error" } });
    expect(mintCredential).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("forwards only DTO, request ID, bearer, and explicitly declared idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    const result = await adapter({ mintCredential: vi.fn(async () => "private-token"), fetcher, rawInput: { title: "valid" }, idempotencyKey: "declared", allowIdempotencyKey: true });
    const init = fetcher.mock.calls[0]?.[1];
    if (!init) throw new Error("Expected BFF transport request initialization.");
    const headers = new Headers(init.headers);

    expect(result).toEqual({ ok: true, value: { accepted: true }, requestId: "request_1" });
    expect(headers.get("authorization")).toBe("Bearer private-token");
    expect(headers.get("x-request-id")).toBe("request_1");
    expect(headers.get("idempotency-key")).toBe("declared");
    expect(init.body).toBe('{"title":"valid"}');
    expect(init.redirect).toBe("error");
  });

  test("forwards AI Ask multipart bytes unchanged through the private stream seam", async () => {
    const requestBytes = new Uint8Array([0, 255, 13, 10, 45, 45, 98, 111, 117, 110, 100, 97, 114, 121]);
    const requestBody = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(requestBytes); controller.close(); } });
    const upstreamBytes = new Uint8Array([123, 34, 116, 121, 112, 101, 34, 58, 34, 100, 111, 110, 101, 34, 125, 10]);
    const fetcher = vi.fn<typeof fetch>(async () => new Response(upstreamBytes, { status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8", "x-request-id": "upstream_1" } }));

    const result = await callPrivateApiStream({
      config,
      credential: "private-token",
      correlationId: "request_1",
      path: "/v1/ai-ask/stream",
      idempotencyKey: "valid_idempotency_key",
      body: requestBody,
      contentType: "multipart/form-data; boundary=boundary",
      fetcher,
    });
    const init = fetcher.mock.calls[0]?.[1];
    if (!init) throw new Error("Expected BFF stream request initialization.");

    expect(init.body).toBe(requestBody);
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer private-token");
    expect(headers.get("x-request-id")).toBe("request_1");
    expect(headers.get("idempotency-key")).toBe("valid_idempotency_key");
    expect(headers.get("accept")).toBe("application/x-ndjson");
    expect(result.requestId).toBe("upstream_1");
    expect(new Uint8Array(await new Response(result.body).arrayBuffer())).toEqual(upstreamBytes);
  });

  test("keeps the local timeout through the full NDJSON body, returns a safe terminal error, and aborts a stalled upstream", async () => {
    let cancelled = false;
    const preparing = new TextEncoder().encode('{"type":"preparing"}\n');
    const upstream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(preparing); }, pull() {}, cancel() { cancelled = true; } });
    const result = await callPrivateApiStream({ config: { ...config, requestTimeoutMs: 1 }, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } }), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });

    await expect(new Response(result.body).text()).resolves.toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
    expect(cancelled).toBe(true);
  });

  test("drops a partial record on timeout so the terminal error follows only valid NDJSON frames", async () => {
    let cancelled = false;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"type":"preparing"}\n{"type":"delta","content":"half')); },
      pull() {},
      cancel() { cancelled = true; },
    });
    const result = await callPrivateApiStream({ config: { ...config, requestTimeoutMs: 1 }, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: requestBody(), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });

    await expect(new Response(result.body).text()).resolves.toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
    expect(cancelled).toBe(true);
  });

  test("stops at a terminal frame without appending an error or relaying later bytes", async () => {
    let cancelled = false;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"type":"preparing"}\n{"type":"done"}\n{"type":"delta","content":"ignored"}\n')); },
      cancel() { cancelled = true; },
    });
    const result = await callPrivateApiStream({ config, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: requestBody(), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });

    await expect(new Response(result.body).text()).resolves.toBe('{"type":"preparing"}\n{"type":"done"}\n');
    expect(cancelled).toBe(true);
  });

  test("closes the downstream after a terminal record even when upstream cancellation rejects", async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"type":"done"}\n')); },
      cancel() { return Promise.reject(new Error("upstream already closed")); },
    });
    const result = await callPrivateApiStream({ config, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: requestBody(), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });
    const reader = result.body.getReader();

    await expect(reader.read()).resolves.toMatchObject({ done: false, value: new TextEncoder().encode('{"type":"done"}\n') });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  test("recognizes only a parsed root terminal type and preserves malformed raw records", async () => {
    const records = [
      '{"type":"delta","metadata":{"type":"done"}}\n',
      '{"type":"delta","content":"broken","metadata":{"type":"error"}\n',
      '{"type":"error","errorMessage":"safe"}\n',
      '{"type":"delta","content":"ignored"}\n',
    ];
    let recordIndex = 0;
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(records[recordIndex++]));
        if (recordIndex === records.length) controller.close();
      },
    });
    const result = await callPrivateApiStream({ config, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: requestBody(), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });

    await expect(new Response(result.body).text()).resolves.toBe(records.slice(0, 3).join(""));
  });

  test("adds exactly one safe terminal error after a truncated upstream body", async () => {
    const upstream = new TextEncoder().encode('{"type":"preparing"}\n{"type":"delta","content":"half');
    const result = await callPrivateApiStream({ config, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: requestBody(), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });

    await expect(new Response(result.body).text()).resolves.toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
  });

  test("accepts a complete pending replay immediately, even when the upstream remains open through timeout", async () => {
    let cancelled = false;
    const replay = new TextEncoder().encode('{"type":"in_progress","conversationId":"conversation-1"}\n');
    const upstream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(replay); }, pull() {}, cancel() { cancelled = true; } });
    const result = await callPrivateApiStream({ config: { ...config, requestTimeoutMs: 5 }, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: requestBody(), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });
    const reader = result.body.getReader();

    await expect(reader.read()).resolves.toMatchObject({ done: false, value: replay });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    expect(cancelled).toBe(true);
  });

  test("reads upstream only as the downstream reader demands frames", async () => {
    let pulls = 0;
    const records = ['{"type":"preparing"}\n', '{"type":"delta","content":"slow"}\n', '{"type":"done"}\n'];
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const record = records[pulls++];
        if (record) controller.enqueue(new TextEncoder().encode(record));
        if (pulls === records.length) controller.close();
      },
    }, { highWaterMark: 0 });
    const result = await callPrivateApiStream({ config, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: requestBody(), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });
    const reader = result.body.getReader();

    expect(pulls).toBe(0);
    await expect(reader.read()).resolves.toMatchObject({ done: false, value: new TextEncoder().encode(records[0]) });
    expect(pulls).toBe(1);
    await Promise.resolve();
    expect(pulls).toBe(1);
    await expect(reader.read()).resolves.toMatchObject({ done: false, value: new TextEncoder().encode(records[1]) });
    expect(pulls).toBe(2);
  });

  test("relays a large coalesced chunk as one pull-driven raw chunk rather than retaining its frames", async () => {
    let pulls = 0;
    const coalesced = new TextEncoder().encode(Array.from({ length: 2_000 }, (_, index) => `{"type":"delta","content":"${index}"}\n`).join(""));
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(coalesced);
      },
      cancel() {},
    }, { highWaterMark: 0 });
    const result = await callPrivateApiStream({ config, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: requestBody(), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });
    const reader = result.body.getReader();

    await expect(reader.read()).resolves.toEqual({ done: false, value: coalesced });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pulls).toBe(1);
    await reader.cancel();
  });

  test("cancelling the browser stream cancels the established upstream body", async () => {
    let cancelled = false;
    const upstream = new ReadableStream<Uint8Array>({ pull() {}, cancel() { cancelled = true; } });
    const result = await callPrivateApiStream({ config, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } }), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });

    await result.body.cancel("browser disconnected");
    expect(cancelled).toBe(true);
  });

  test("cancels upstream after a framing failure", async () => {
    let cancelled = false;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(1_048_577).fill(65)); },
      cancel() { cancelled = true; },
    });
    const result = await callPrivateApiStream({ config, credential: "private-token", correlationId: "request_1", path: "/v1/ai-ask/stream", idempotencyKey: "valid_idempotency_key", body: requestBody(), contentType: "multipart/form-data; boundary=boundary", fetcher: async () => new Response(upstream, { headers: { "content-type": "application/x-ndjson" } }) });

    await expect(new Response(result.body).text()).resolves.toBe('{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
    expect(cancelled).toBe(true);
  });

  test("uses the DTO JSON serialized before minting a credential", async () => {
    const dto = { toJSON: vi.fn(() => ({ title: "before-mint" })) };
    const mintCredential = vi.fn(async () => {
      dto.toJSON.mockImplementation(() => ({ title: "after-mint" }));
      return "private-token";
    });
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));

    const result = await executeProtectedBffMutation({
      request: authenticatedRequest(), rawInput: dto, parseInput: () => dto, parseResult: parseAccepted,
      config, mintCredential, path: "/v1/test", method: "POST", fetcher,
    });

    expect(result).toMatchObject({ ok: true, value: { accepted: true } });
    expect(dto.toJSON).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe('{"title":"before-mint"}');
  });

  test("loads validated transport configuration at the root BFF adapter seam", async () => {
    vi.stubEnv("XV_PRIVATE_API_URL", "https://api.railway.internal");
    vi.stubEnv("XV_WEB_BFF_ORIGIN", "https://web.xuyenviet.vn");
    vi.stubEnv("XV_BFF_CSRF_SIGNING_SECRET", "a".repeat(32));
    vi.stubEnv("XV_BFF_CSRF_LIFETIME_SECONDS", "300");
    vi.stubEnv("XV_BFF_REQUEST_TIMEOUT_MS", "100");
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));

    try {
      const result = await executeProtectedBffMutation({
        request: authenticatedRequest(), rawInput: { title: "valid" }, parseInput: (value) => value as { title: string }, parseResult: parseAccepted,
        mintCredential: async () => "private-token", path: "/v1/test", method: "POST", fetcher,
      });

      expect(result).toEqual({ ok: true, value: { accepted: true }, requestId: "request_1" });
      expect(fetcher.mock.calls[0]?.[0].toString()).toBe("https://api.railway.internal/v1/test");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("uses defensive private API configuration after the caller mutates its URL", async () => {
    const privateApiUrl = new URL("https://api.railway.internal");
    const defensiveConfig = createBffTransportConfig({ ...config, privateApiUrl });
    privateApiUrl.hostname = "evil.example";
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));

    await callPrivateApi({ config: defensiveConfig, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "GET", parseResult: parseAccepted, fetcher });

    expect(fetcher.mock.calls[0]?.[0].toString()).toBe("https://api.railway.internal/v1/test");
  });

  test("does not forward an undeclared idempotency key and converts timeout or malformed API JSON to safe errors", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    await adapter({ mintCredential: vi.fn(async () => "private-token"), fetcher, rawInput: { title: "valid" }, idempotencyKey: "ignored" });
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get("idempotency-key")).toBeNull();
    await expect(callPrivateApi({ config, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "POST", parseResult: parseAccepted, fetcher: async () => new Response('{"token":"leak"}', { status: 500 }) })).rejects.toMatchObject({ safe: { code: "internal_error", requestId: "request_1" } });
  });

  test("projects success payloads and maps unexpected payloads to safe internal errors", async () => {
    const result = await adapter({ mintCredential: vi.fn(async () => "private-token"), fetcher: async () => new Response(JSON.stringify({ token: "leak" }), { status: 200 }), rawInput: { title: "valid" } });

    expect(result).toEqual({ ok: false, error: { code: "internal_error", message: "Không thể xử lý yêu cầu.", requestId: "request_1" } });
  });

  test("maps thrown DTO parser errors to validation errors before minting a credential", async () => {
    const mintCredential = vi.fn(async () => "private-token");
    const fetcher = vi.fn<typeof fetch>();
    const result = await adapter({ mintCredential, fetcher, rawInput: { title: "valid" }, parseInput: () => { throw new Error("invalid input"); } });

    expect(result).toEqual({ ok: false, error: { code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: "request_1" } });
    expect(mintCredential).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("rejects non-serializable DTOs before minting a credential", async () => {
    const mintCredential = vi.fn(async () => "private-token");
    const fetcher = vi.fn<typeof fetch>();
    const cyclic: { title: string; self?: unknown } = { title: "valid" };
    cyclic.self = cyclic;
    const result = await adapter({ mintCredential, fetcher, rawInput: cyclic, parseInput: () => cyclic });

    expect(result).toEqual({ ok: false, error: { code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: "request_1" } });
    expect(mintCredential).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("rejects DTOs whose JSON serialization produces undefined before minting a credential", async () => {
    const mintCredential = vi.fn(async () => "private-token");
    const fetcher = vi.fn<typeof fetch>();
    const result = await executeProtectedBffMutation({
      request: authenticatedRequest(), rawInput: { title: "valid" }, parseInput: () => (() => undefined), parseResult: parseAccepted,
      config, mintCredential, path: "/v1/test", method: "POST", fetcher,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "validation_error", requestId: "request_1" } });
    expect(mintCredential).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("rejects undefined, null, and FormData parser results before minting a credential", async () => {
    for (const parsed of [undefined, null, new FormData()]) {
      const mintCredential = vi.fn(async () => "private-token");
      const fetcher = vi.fn<typeof fetch>();
      const result = await adapter({ mintCredential, fetcher, rawInput: { title: "valid" }, parseInput: () => parsed as { title: string } | null });

      expect(result).toEqual({ ok: false, error: { code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: "request_1" } });
      expect(mintCredential).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  test("rethrows caller cancellation instead of projecting an internal error", async () => {
    const controller = new AbortController();
    const cancelled = new Error("caller cancelled");
    const request = adapter({ mintCredential: vi.fn(async () => "private-token"), fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })), rawInput: { title: "valid" }, signal: controller.signal });
    controller.abort(cancelled);

    await expect(request).rejects.toBe(cancelled);
  });

  test("sanitizes upstream error messages, violation messages, and request IDs", async () => {
    const upstream = {
      code: "validation_error",
      message: "Internal database constraint: traveler_email",
      requestId: "upstream_request_1",
      violations: [{ field: "email", code: "invalid", message: "Email không hợp lệ." }],
    };

    await expect(callPrivateApi({ config, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "POST", parseResult: parseAccepted, fetcher: async () => new Response(JSON.stringify(upstream), { status: 400 }) })).rejects.toMatchObject({
      safe: {
        code: "validation_error",
        message: "Dữ liệu yêu cầu không hợp lệ.",
        requestId: "request_1",
        violations: [{ field: "email", code: "invalid", message: "Dữ liệu yêu cầu không hợp lệ." }],
      },
    });
  });

  test("does not expose violations from non-validation upstream errors", async () => {
    const upstream = {
      code: "forbidden",
      message: "Role assignment is restricted.",
      requestId: "upstream_request_1",
      violations: [{ field: "role", code: "restricted", message: "Operator only." }],
    };

    await expect(callPrivateApi({ config, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "POST", parseResult: parseAccepted, fetcher: async () => new Response(JSON.stringify(upstream), { status: 403 }) })).rejects.toMatchObject({
      safe: { code: "forbidden", message: "Bạn không có quyền thực hiện thao tác này.", requestId: "request_1" },
    });
    await expect(callPrivateApi({ config, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "POST", parseResult: parseAccepted, fetcher: async () => new Response(JSON.stringify(upstream), { status: 403 }) })).rejects.not.toMatchObject({ safe: { violations: expect.anything() } });
  });

  test("uses the required CSRF header, accepts same-site Fetch Metadata, and issues a host-only strict cookie", () => {
    const token = issueCsrfToken(config, 1_000_000);
    const request = { headers: new Headers({ origin: config.bffOrigin, "X-XuyenViet-CSRF": token }), cookies: { get: () => ({ value: token }) } };
    const issued = issueCsrfTokenWithCookie(config, 1_000_000);

    expect(validateCsrfRequest(request, config, 1_100_000)).toBe(true);
    expect(validateCsrfRequest({ ...request, headers: new Headers({ origin: config.bffOrigin, "X-XuyenViet-CSRF": token, "sec-fetch-site": "same-site" }) }, config, 1_100_000)).toBe(true);
    expect(validateCsrfRequest({ ...request, headers: new Headers({ origin: config.bffOrigin, "x-csrf-token": token }) }, config, 1_100_000)).toBe(false);
    expect(validateCsrfRequest({ ...request, headers: new Headers({ origin: config.bffOrigin, "X-XuyenViet-CSRF": token, "sec-fetch-site": "cross-site" }) }, config, 1_100_000)).toBe(false);
    expect(validateCsrfRequest({ headers: new Headers({ origin: config.bffOrigin, "X-XuyenViet-CSRF": `${token}x` }), cookies: { get: () => ({ value: `${token}x` }) } }, config, 1_100_000)).toBe(false);
    expect(validateCsrfRequest({ headers: new Headers({ origin: config.bffOrigin, "X-XuyenViet-CSRF": "x".repeat(100_000) }), cookies: { get: () => ({ value: "x".repeat(100_000) }) } }, config, 1_100_000)).toBe(false);
    expect(validateCsrfRequest(request, config, 1_300_000)).toBe(false);
    expect(issued).toMatchObject({ cookie: { name: "xv_bff_csrf", value: issued.token, secure: true, sameSite: "strict", path: "/", maxAge: 300 } });
    expect(Object.hasOwn(issued.cookie, "domain")).toBe(false);
  });

  test("rejects non-exact BFF origins from environment configuration", () => {
    const environment = {
      NODE_ENV: "test" as const,
      XV_PRIVATE_API_URL: "https://api.railway.internal",
      XV_BFF_CSRF_SIGNING_SECRET: "a".repeat(32),
      XV_BFF_CSRF_LIFETIME_SECONDS: "300",
      XV_BFF_REQUEST_TIMEOUT_MS: "100",
    };

    expect(getBffTransportConfig({ ...environment, XV_WEB_BFF_ORIGIN: "https://web.xuyenviet.vn" }).bffOrigin).toBe("https://web.xuyenviet.vn");
    for (const origin of ["http://web.xuyenviet.vn", "https://web.xuyenviet.vn/path", "https://web.xuyenviet.vn?query=value", "https://web.xuyenviet.vn#fragment", "https://user:password@web.xuyenviet.vn"]) {
      expect(() => getBffTransportConfig({ ...environment, XV_WEB_BFF_ORIGIN: origin })).toThrow("Invalid BFF transport configuration.");
    }
  });

  test("enforces the shared CSRF secret and lifetime bounds without private API cutover configuration", () => {
    const environment: NodeJS.ProcessEnv = { NODE_ENV: "test", XV_WEB_BFF_ORIGIN: "https://web.xuyenviet.vn", XV_BFF_CSRF_SIGNING_SECRET: "a".repeat(32), XV_BFF_CSRF_LIFETIME_SECONDS: "300" };

    expect(getBffCsrfConfig(environment)).toMatchObject({ csrfSigningSecret: "a".repeat(32), csrfLifetimeSeconds: 300 });
    for (const invalid of [
      { XV_BFF_CSRF_SIGNING_SECRET: "a".repeat(31) },
      { XV_BFF_CSRF_LIFETIME_SECONDS: "59" },
      { XV_BFF_CSRF_LIFETIME_SECONDS: "3601" },
      { XV_BFF_CSRF_LIFETIME_SECONDS: "300.5" },
    ]) {
      expect(() => getBffCsrfConfig({ ...environment, ...invalid })).toThrow("Invalid BFF transport configuration.");
    }
  });

  test("never forwards a bearer outside the configured private origin", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(callPrivateApi({ config, credential: "private-token", correlationId: "request_1", path: "/\\evil.example/path", method: "GET", parseResult: parseAccepted, fetcher })).rejects.toMatchObject({ safe: { code: "internal_error" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("preserves caller aborts, including an already-aborted signal, while mapping only local aborts to timeouts", async () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort(new Error("caller cancelled"));
    await expect(callPrivateApi({ config, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "GET", parseResult: parseAccepted, signal: alreadyAborted.signal })).rejects.toBe(alreadyAborted.signal.reason);

    const caller = new AbortController();
    const callerAbort = new Error("caller cancelled");
    const callerRequest = callPrivateApi({ config, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "GET", parseResult: parseAccepted, signal: caller.signal, fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })) });
    caller.abort(callerAbort);
    await expect(callerRequest).rejects.toBe(callerAbort);

    await expect(callPrivateApi({ config: { ...config, requestTimeoutMs: 1 }, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "GET", parseResult: parseAccepted, fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })) })).rejects.toBeInstanceOf(BffApiError);
    await expect(callPrivateApi({ config: { ...config, requestTimeoutMs: 1 }, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "GET", parseResult: parseAccepted, fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })) })).rejects.toMatchObject({ safe: { code: "request_timeout" } });
  });

  test("rejects a response that resolves after the local timeout", async () => {
    await expect(callPrivateApi({
      config: { ...config, requestTimeoutMs: 1 }, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "GET", parseResult: parseAccepted,
      fetcher: async () => new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify({ accepted: true }), { status: 200 })), 10)),
    })).rejects.toMatchObject({ safe: { code: "request_timeout", requestId: "request_1" } });
  });

  test("rejects caller aborts and local timeouts that occur while parsing a response body", async () => {
    const caller = new AbortController();
    const callerAbort = new Error("caller cancelled");
    let beginParsing!: () => void;
    let finishParsing!: () => void;
    const parsingStarted = new Promise<void>((resolve) => { beginParsing = resolve; });
    const callerRequest = callPrivateApi({
      config, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "GET", parseResult: parseAccepted, signal: caller.signal,
      fetcher: async () => ({ ok: true, json: async () => { beginParsing(); return new Promise((resolve) => { finishParsing = () => resolve({ accepted: true }); }); } }) as Response,
    });
    await parsingStarted;
    caller.abort(callerAbort);
    finishParsing();
    await expect(callerRequest).rejects.toBe(callerAbort);

    await expect(callPrivateApi({
      config: { ...config, requestTimeoutMs: 1 }, credential: "private-token", correlationId: "request_1", path: "/v1/test", method: "GET", parseResult: parseAccepted,
      fetcher: async () => ({ ok: true, json: async () => new Promise((resolve) => setTimeout(() => resolve({ accepted: true }), 10)) }) as Response,
    })).rejects.toMatchObject({ safe: { code: "request_timeout", requestId: "request_1" } });
  });
});

async function adapter(input: { mintCredential: () => Promise<string>; fetcher: typeof fetch; rawInput: unknown; origin?: string; idempotencyKey?: string; allowIdempotencyKey?: boolean; parseInput?: (value: unknown) => { title: string } | null | undefined; signal?: AbortSignal }) {
  const token = issueCsrfToken(config);
  return executeProtectedBffMutation<{ title: string }, { accepted: boolean }>({
    request: authenticatedRequest(token, input.origin),
    rawInput: input.rawInput,
    parseInput: input.parseInput ?? ((value) => typeof value === "object" && value !== null && typeof (value as { title?: unknown }).title === "string" ? { title: (value as { title: string }).title } : null),
    parseResult: parseAccepted,
    config, mintCredential: input.mintCredential, path: "/v1/test", method: "POST", idempotencyKey: input.idempotencyKey, allowIdempotencyKey: input.allowIdempotencyKey, signal: input.signal, fetcher: input.fetcher,
  });
}

function authenticatedRequest(token = issueCsrfToken(config), origin = config.bffOrigin) {
  return { headers: new Headers({ origin, "sec-fetch-site": "same-origin", "X-XuyenViet-CSRF": token, "x-request-id": "request_1" }), cookies: { get: () => ({ value: token }) } };
}

function parseAccepted(value: unknown): { accepted: boolean } | null {
  return typeof value === "object" && value !== null && typeof (value as { accepted?: unknown }).accepted === "boolean" ? { accepted: (value as { accepted: boolean }).accepted } : null;
}

function requestBody() {
  return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } });
}
