import { afterEach, describe, expect, test, vi } from "vitest";
import { issueCsrfToken } from "@/server/csrf";

const getAuthenticatedSession = vi.fn();
const mintWebBffCredential = vi.fn();
const callPrivateApiStream = vi.fn();
const validateCsrfRequest = vi.fn();
const getBffTransportConfig = vi.fn(() => bffTransportConfig);
const bffTransportConfig = {
  privateApiUrl: "https://api.railway.internal",
  bffOrigin: "https://xuyenviet.test",
  csrfSigningSecret: "a".repeat(32),
  csrfLifetimeSeconds: 300,
  requestTimeoutMs: 100,
};

describe("AI Ask BFF cutover routing", () => {
  afterEach(() => {
    vi.doUnmock("@xuyenviet/config");
    vi.doUnmock("@/server/auth");
    vi.doUnmock("@/server/bff-credentials");
    vi.doUnmock("@/server/bff-api-client");
    vi.doUnmock("@/server/csrf");
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("enabled BFF rejects an unauthenticated request before loading API config or minting and selects only the API owner", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await loadRoute(true);
    validateCsrfRequest.mockReset();
    validateCsrfRequest.mockReturnValue(true);
    getAuthenticatedSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/ai-ask/stream/route");
    const response = await POST(request() as never);

    expect(response.status).toBe(401);
    expect(mintWebBffCredential).not.toHaveBeenCalled();
    expect(callPrivateApiStream).not.toHaveBeenCalled();
    expect(getBffTransportConfig).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("AI Ask stream selected owner", { owner: "versioned_api", correlationId: "routing_request_1" });
    expectTelemetryIsOwnerAndCorrelation(log);
  });

  test("disabled BFF selects the compatible legacy owner with shared CSRF/session policy and no API config", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await loadRoute(false);
    validateCsrfRequest.mockReset();
    validateCsrfRequest.mockReturnValue(true);
    getAuthenticatedSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/ai-ask/stream/route");
    const response = await POST(request() as never);

    expect(response.status).toBe(401);
    expect(mintWebBffCredential).not.toHaveBeenCalled();
    expect(callPrivateApiStream).not.toHaveBeenCalled();
    expect(getBffTransportConfig).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("AI Ask stream selected owner", { owner: "legacy_compatibility", correlationId: "routing_request_1" });
    expectTelemetryIsOwnerAndCorrelation(log);
  });

  test("disabled BFF rejects invalid CSRF before legacy authentication or forwarding", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await loadRoute(false);
    validateCsrfRequest.mockReset();
    validateCsrfRequest.mockReturnValue(false);

    const { POST } = await import("@/app/api/ai-ask/stream/route");
    const response = await POST(request() as never);

    expect(response.status).toBe(403);
    expect(getAuthenticatedSession).not.toHaveBeenCalled();
    expect(mintWebBffCredential).not.toHaveBeenCalled();
    expect(callPrivateApiStream).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  test("enabled BFF validates CSRF and session before minting, then relays raw bytes without private data", async () => {
    await loadRoute(true);
    validateCsrfRequest.mockReturnValue(true);
    getAuthenticatedSession.mockResolvedValue({ userId: "user-1" });
    mintWebBffCredential.mockResolvedValue("private-token");
    const bytes = new TextEncoder().encode('{"type":"preparing"}\n{"type":"done"}\n');
    callPrivateApiStream.mockResolvedValue({ status: 201, body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }), requestId: "upstream_1" });

    const { POST } = await import("@/app/api/ai-ask/stream/route");
    const response = await POST(request() as never);

    expect(validateCsrfRequest).toHaveBeenCalledBefore(getAuthenticatedSession);
    expect(getAuthenticatedSession).toHaveBeenCalledBefore(mintWebBffCredential);
    expect(callPrivateApiStream).toHaveBeenCalledWith(expect.objectContaining({
      config: bffTransportConfig,
      credential: "private-token",
      correlationId: "routing_request_1",
      idempotencyKey: "valid_idempotency_key",
    }));
    const body = await response.text();
    expect(body).toBe('{"type":"preparing"}\n{"type":"done"}\n');
    expect(response.headers.get("x-request-id")).toBe("upstream_1");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect([...response.headers.entries()].join(" ")).not.toContain("private-token");
    expect(body).not.toContain("railway.internal");
  });
});

async function loadRoute(enabled: boolean) {
  vi.resetModules();
  vi.doMock("@xuyenviet/config", async () => ({
    ...(await vi.importActual<typeof import("@xuyenviet/config")>("@xuyenviet/config")),
    isAiAskApiEnabled: () => enabled,
    getBffCsrfConfig: () => bffTransportConfig,
    getBffTransportConfig,
  }));
  vi.doMock("@/server/auth", () => ({ getAuthenticatedSession }));
  vi.doMock("@/server/bff-credentials", () => ({ mintWebBffCredential }));
  vi.doMock("@/server/bff-api-client", () => ({ BffApiError: class BffApiError extends Error {}, callPrivateApiStream }));
  vi.doMock("@/server/csrf", () => ({ validateCsrfRequest }));
}

function request() {
  const token = issueCsrfToken(bffTransportConfig);
  const request = new Request("https://xuyenviet.test/api/ai-ask/stream", {
    method: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=routing",
      "idempotency-key": "valid_idempotency_key",
      "x-request-id": "routing_request_1",
      origin: bffTransportConfig.bffOrigin,
      "sec-fetch-site": "same-origin",
      "X-XuyenViet-CSRF": token,
    },
    body: "--routing--\r\n",
  });
  Object.assign(request, { cookies: { get: (name: string) => name === "xv_bff_csrf" ? { value: token } : undefined } });
  return request;
}

function expectTelemetryIsOwnerAndCorrelation(log: ReturnType<typeof vi.spyOn>) {
  const telemetry = log.mock.calls[0]?.[1];
  expect(Object.keys(telemetry as object).sort()).toEqual(["correlationId", "owner"]);
}
