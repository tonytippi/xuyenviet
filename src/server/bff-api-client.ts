import "server-only";

import { parseSafeApiError, type SafeApiError } from "@xuyenviet/contracts";
import type { BffTransportConfig } from "@xuyenviet/config";

export class BffApiError extends Error {
  constructor(readonly safe: SafeApiError) { super(safe.message); }
}

export async function callPrivateApi<T>(input: { config: BffTransportConfig; credential: string; correlationId: string; path: string; method: string; serializedBody?: string; parseResult: (value: unknown) => T | null; idempotencyKey?: string; allowIdempotencyKey?: boolean; signal?: AbortSignal; fetcher?: typeof fetch }): Promise<T> {
  if (!input.path.startsWith("/") || input.path.startsWith("//")) throw internalError(input.correlationId);
  let url: URL;
  let privateApiOrigin: string;
  try {
    const privateApiUrl = new URL(input.config.privateApiUrl);
    url = new URL(input.path, privateApiUrl);
    privateApiOrigin = privateApiUrl.origin;
  } catch {
    throw internalError(input.correlationId);
  }
  if (url.origin !== privateApiOrigin) throw internalError(input.correlationId);
  input.signal?.throwIfAborted();

  const controller = new AbortController();
  let abortKind: "caller" | "timeout" | null = null;
  const timeout = setTimeout(() => {
    if (abortKind === null) {
      abortKind = "timeout";
      controller.abort();
    }
  }, input.config.requestTimeoutMs);
  const onAbort = () => {
    if (abortKind === null) {
      abortKind = "caller";
      controller.abort(input.signal?.reason);
    }
  };
  input.signal?.addEventListener("abort", onAbort, { once: true });
  if (input.signal?.aborted) onAbort();
  try {
    const headers: Record<string, string> = { authorization: `Bearer ${input.credential}`, "x-request-id": input.correlationId, accept: "application/json" };
    if (input.serializedBody !== undefined) { headers["content-type"] = "application/json"; }
    if (input.allowIdempotencyKey && input.idempotencyKey) headers["idempotency-key"] = input.idempotencyKey;
    const response = await (input.fetcher ?? fetch)(url, { method: input.method, headers, body: input.serializedBody, redirect: "error", signal: controller.signal });
    if (abortKind === "timeout") throw timeoutError(input.correlationId);
    if (abortKind === "caller") input.signal?.throwIfAborted();
    const body: unknown = await response.json().catch(() => null);
    if (abortKind === "timeout") throw timeoutError(input.correlationId);
    if (abortKind === "caller") input.signal?.throwIfAborted();
    if (!response.ok) {
      const upstream = parseSafeApiError(body);
      throw new BffApiError(upstream ? safeError(upstream.code, messageFor(upstream.code), input.correlationId, presentationViolations(upstream)) : safeError("internal_error", messageFor("internal_error"), input.correlationId));
    }
    const result = input.parseResult(body);
    if (result === null) throw internalError(input.correlationId);
    return result;
  } catch (error) {
    if (error instanceof BffApiError) throw error;
    if (abortKind === "caller") throw error;
    throw abortKind === "timeout" ? timeoutError(input.correlationId) : internalError(input.correlationId);
  } finally {
    clearTimeout(timeout); input.signal?.removeEventListener("abort", onAbort);
  }
}

export async function callPrivateApiStream(input: {
  config: BffTransportConfig;
  credential: string;
  correlationId: string;
  path: string;
  idempotencyKey: string;
  body: ReadableStream<Uint8Array> | null;
  contentType: string | null;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<{ status: number; body: ReadableStream<Uint8Array>; requestId: string }> {
  if (!input.path.startsWith("/") || input.path.startsWith("//") || !input.contentType?.toLowerCase().startsWith("multipart/form-data;") || !input.body) throw internalError(input.correlationId);
  let url: URL;
  try {
    const privateApiUrl = new URL(input.config.privateApiUrl);
    url = new URL(input.path, privateApiUrl);
    if (url.origin !== privateApiUrl.origin) throw new Error("private origin mismatch");
  } catch {
    throw internalError(input.correlationId);
  }
  input.signal?.throwIfAborted();
  const controller = new AbortController();
  let abortKind: "caller" | "timeout" | null = null;
  const timeout = setTimeout(() => { if (!abortKind) { abortKind = "timeout"; controller.abort(); } }, input.config.requestTimeoutMs);
  const onAbort = () => { if (!abortKind) { abortKind = "caller"; controller.abort(input.signal?.reason); } };
  input.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await (input.fetcher ?? fetch)(url, {
      method: "POST",
      headers: { authorization: `Bearer ${input.credential}`, "x-request-id": input.correlationId, "idempotency-key": input.idempotencyKey, "content-type": input.contentType, accept: "application/x-ndjson" },
      body: input.body,
      duplex: "half",
      redirect: "error",
      signal: controller.signal,
    } as RequestInit);
    if (abortKind === "timeout") throw timeoutError(input.correlationId);
    if (abortKind === "caller") input.signal?.throwIfAborted();
    if (!response.ok) {
      const safe = parseSafeApiError(await response.json().catch(() => null));
      throw new BffApiError(safe ? safeError(safe.code, messageFor(safe.code), input.correlationId, presentationViolations(safe)) : safeError("internal_error", messageFor("internal_error"), input.correlationId));
    }
    if (!response.body || !response.headers.get("content-type")?.toLowerCase().startsWith("application/x-ndjson")) throw internalError(input.correlationId);
    const upstreamRequestId = response.headers.get("x-request-id");
    // The local timeout protects connection establishment only. Once the API has
    // committed NDJSON headers, aborting it would silently truncate the protocol.
    clearTimeout(timeout);
    return { status: response.status, body: abortableBody(response.body, controller, () => { input.signal?.removeEventListener("abort", onAbort); }), requestId: /^[A-Za-z0-9_-]{1,128}$/.test(upstreamRequestId ?? "") ? upstreamRequestId! : input.correlationId };
  } catch (error) {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onAbort);
    if (abortKind === "caller") throw error;
    if (error instanceof BffApiError) throw error;
    throw abortKind === "timeout" ? timeoutError(input.correlationId) : internalError(input.correlationId);
  }
}

function abortableBody(body: ReadableStream<Uint8Array>, controller: AbortController, cleanup: () => void): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream({
    async pull(output) {
      try {
        const next = await reader.read();
        if (next.done) { cleanup(); output.close(); } else output.enqueue(next.value);
      } catch (error) { cleanup(); output.error(error); }
    },
    async cancel(reason) { cleanup(); controller.abort(reason); await reader.cancel(reason); },
  });
}

function internalError(requestId: string): BffApiError { return new BffApiError(safeError("internal_error", messageFor("internal_error"), requestId)); }
function timeoutError(requestId: string): BffApiError { return new BffApiError(safeError("request_timeout", messageFor("request_timeout"), requestId)); }
function safeError(code: SafeApiError["code"], message: string, requestId: string, violations?: SafeApiError["violations"]): SafeApiError { return { code, message, requestId, ...(violations ? { violations } : {}) }; }
function presentationViolations(error: SafeApiError): SafeApiError["violations"] {
  if (error.code !== "validation_error" || !error.violations) return undefined;
  return error.violations.map(({ field, code }) => ({ field, code, message: messageFor(error.code) }));
}
function messageFor(code: SafeApiError["code"]): string {
  if (code === "unauthorized") return "Không được phép truy cập.";
  if (code === "forbidden") return "Bạn không có quyền thực hiện thao tác này.";
  if (code === "validation_error") return "Dữ liệu yêu cầu không hợp lệ.";
  if (code === "csrf_invalid") return "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.";
  if (code === "request_timeout") return "Yêu cầu đã hết thời gian chờ.";
  return "Không thể xử lý yêu cầu.";
}
