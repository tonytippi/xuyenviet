import "server-only";

import { parseSafeApiError, type SafeApiError } from "@xuyenviet/contracts";
import type { BffTransportConfig } from "@xuyenviet/config";

const safeStreamFailure = new TextEncoder().encode('{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
const maxIncompleteNdjsonRecordBytes = 1024 * 1024;

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
  if (input.signal?.aborted) onAbort();
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
    return {
      status: response.status,
      body: abortableBody(response.body, controller, () => {
        clearTimeout(timeout);
        input.signal?.removeEventListener("abort", onAbort);
      }, () => abortKind),
      requestId: /^[A-Za-z0-9_-]{1,128}$/.test(upstreamRequestId ?? "") ? upstreamRequestId! : input.correlationId,
    };
  } catch (error) {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onAbort);
    if (abortKind === "caller") throw error;
    if (error instanceof BffApiError) throw error;
    throw abortKind === "timeout" ? timeoutError(input.correlationId) : internalError(input.correlationId);
  }
}

function abortableBody(body: ReadableStream<Uint8Array>, controller: AbortController, cleanup: () => void, abortKind: () => "caller" | "timeout" | null): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let closed = false;
  const framer = createNdjsonFramer();
  const finish = () => {
    if (closed) return;
    closed = true;
    controller.signal.removeEventListener("abort", onAbort);
    cleanup();
  };
  let outputController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const onAbort = () => {
    if (closed) return;
    const kind = abortKind();
    finish();
    try {
      if (kind === "timeout") outputController?.enqueue(safeStreamFailure);
    } finally {
      outputController?.close();
      void reader.cancel(controller.signal.reason).catch(() => {});
    }
  };
  return new ReadableStream({
    start(output) {
      outputController = output;
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    },
    pull(output) {
      return relayPull(output);
    },
    async cancel(reason) {
      finish();
      controller.abort(reason);
      try { await reader.cancel(reason); } catch { /* Upstream abort races are already terminal for this relay. */ }
    },
  }, { highWaterMark: 0 });

  async function relayPull(output: ReadableStreamDefaultController<Uint8Array>) {
    if (closed) return;
    try {
      while (!closed) {
        const next = await reader.read();
        if (controller.signal.aborted) return;
        if (next.done) {
          finish();
          output.enqueue(safeStreamFailure);
          output.close();
          return;
        }
        const relayed = framer.push(next.value);
        if (!relayed) continue;
        output.enqueue(relayed.bytes);
        if (relayed.terminal) {
          finish();
          // A root in_progress is the complete pending-replay result. Do not wait
          // for EOF, which may never arrive from an already-running execution.
          void reader.cancel().catch(() => {});
          output.close();
        }
        return;
      }
    } catch {
      if (controller.signal.aborted) return;
      finish();
      try {
        output.enqueue(safeStreamFailure);
      } finally {
        output.close();
        void reader.cancel().catch(() => {});
      }
    }
  }
}

function createNdjsonFramer(): { push(bytes: Uint8Array): { bytes: Uint8Array; terminal: boolean } | undefined } {
  let buffered = new Uint8Array();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return {
    push(bytes) {
      const hadBufferedBytes = buffered.byteLength > 0;
      const combined = hadBufferedBytes ? joinBytes(buffered, bytes) : bytes;
      let start = 0;
      let completeEnd = 0;
      for (let index = 0; index < combined.byteLength; index += 1) {
        if (combined[index] !== 10) continue;
        // Examine a completed record without changing the bytes sent to the caller.
        const recordType = ndjsonRecordType(combined.subarray(start, index + 1), decoder);
        completeEnd = index + 1;
        start = index + 1;
        const terminal = recordType === "done" || recordType === "error" || recordType === "in_progress";
        if (terminal) {
          buffered = new Uint8Array();
          return { bytes: completeBytes(combined, bytes, hadBufferedBytes, completeEnd), terminal: true };
        }
      }
      const incompleteLength = combined.byteLength - completeEnd;
      if (incompleteLength > maxIncompleteNdjsonRecordBytes) throw new Error("Incomplete NDJSON record exceeds relay limit.");
      // Copy the tail so a small incomplete record cannot retain a large source chunk.
      buffered = incompleteLength === 0 ? new Uint8Array() : combined.slice(completeEnd);
      return completeEnd === 0 ? undefined : { bytes: completeBytes(combined, bytes, hadBufferedBytes, completeEnd), terminal: false };
    },
  };
}

function joinBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const joined = new Uint8Array(left.byteLength + right.byteLength);
  joined.set(left);
  joined.set(right, left.byteLength);
  return joined;
}

function completeBytes(combined: Uint8Array, source: Uint8Array, hadBufferedBytes: boolean, length: number): Uint8Array {
  return !hadBufferedBytes && length === source.byteLength ? source : combined.slice(0, length);
}

function ndjsonRecordType(bytes: Uint8Array, decoder: TextDecoder): string | undefined {
  try {
    const record: unknown = JSON.parse(decoder.decode(bytes));
    const type = typeof record === "object" && record !== null && !Array.isArray(record) ? (record as { type?: unknown }).type : undefined;
    return typeof type === "string" ? type : undefined;
  } catch {
    return undefined;
  }
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
