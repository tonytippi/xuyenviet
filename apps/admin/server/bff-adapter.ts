import "server-only";

import { correlationId, parseSafeApiError, type SafeApiError } from "@xuyenviet/contracts";
import { getAdminBffConfig, type BffTransportConfig } from "@xuyenviet/config";

import { AdminAuthorizationDeniedError, mintAdminCredential } from "./identity";
import { validateAdminCsrfRequest } from "./csrf";

type BffRequest = { headers: Headers; cookies: { get(name: string): { value: string } | undefined }; signal?: AbortSignal };
type BffResult<TResult> = { ok: true; value: TResult; requestId: string } | { ok: false; error: SafeApiError; status?: number };

export async function executeAdminBffMutation<TInput, TResult>(input: {
  request: BffRequest;
  rawInput: unknown;
  parseInput: (value: unknown) => TInput | null | undefined;
  parseResult: (value: unknown) => TResult | null;
  capability: "admin.workspace.read" | "admin.role.governance" | "admin.ai-model-catalog.write";
  path: string;
  method: string;
  idempotencyKey?: string;
  allowIdempotencyKey?: boolean;
  config?: BffTransportConfig;
  fetcher?: typeof fetch;
  mintCredential?: (capability: "admin.workspace.read" | "admin.role.governance" | "admin.ai-model-catalog.write") => Promise<string>;
}): Promise<BffResult<TResult>> {
  const config = input.config ?? getAdminBffConfig().transport;
  const requestId = correlationId(input.request.headers.get("x-request-id"));
  // CSRF is intentionally the first operation: no identity handoff or signing on a rejected request.
  if (!validateAdminCsrfRequest(input.request, config)) return denied("csrf_invalid", requestId);
  let serializedBody: string;
  try {
    const dto = input.parseInput(input.rawInput);
    if (dto == null || dto instanceof FormData) throw new Error("invalid dto");
    serializedBody = JSON.stringify(dto);
    if (serializedBody === undefined) throw new Error("invalid dto");
  } catch { return denied("validation_error", requestId); }
  if (!input.path.startsWith("/") || input.path.startsWith("//")) return denied("internal_error", requestId);
  try {
    if (input.request.signal?.aborted) return denied("request_timeout", requestId);
    const credential = await (input.mintCredential ?? mintAdminCredential)(input.capability);
    if (input.request.signal?.aborted) return denied("request_timeout", requestId);
    return await privateRequest(config, credential, requestId, input, serializedBody, async (response) => {
      const body: unknown = await response.json().catch(() => null);
      if (response.headers.get("x-request-id") !== requestId) return denied("internal_error", requestId);
      if (!response.ok) return upstreamError(response.status, body, requestId);
      const value = input.parseResult(body);
      return value === null ? denied("internal_error", requestId) : { ok: true, value, requestId };
    });
  } catch (error) { return error instanceof AdminAuthorizationDeniedError ? denied(error.code, requestId) : error instanceof DOMException && error.name === "AbortError" ? denied("request_timeout", requestId) : denied("internal_error", requestId); }
}

/** Safe reads use the same bounded private transport and correlation boundary as mutations. */
export async function executeAdminBffRead<TResult>(input: {
  request: Pick<BffRequest, "headers" | "signal">;
  capability: "admin.workspace.read" | "admin.role.governance" | "admin.ai-model-catalog.write";
  path: string;
  parseResult: (value: unknown) => TResult | null;
  config?: BffTransportConfig;
  fetcher?: typeof fetch;
  mintCredential?: (capability: "admin.workspace.read" | "admin.role.governance" | "admin.ai-model-catalog.write") => Promise<string>;
}): Promise<BffResult<TResult>> {
  const config = input.config ?? getAdminBffConfig().transport;
  const requestId = correlationId(input.request.headers.get("x-request-id"));
  if (!input.path.startsWith("/") || input.path.startsWith("//")) return denied("internal_error", requestId);
  try {
    if (input.request.signal?.aborted) return denied("request_timeout", requestId);
    const credential = await (input.mintCredential ?? mintAdminCredential)(input.capability);
    if (input.request.signal?.aborted) return denied("request_timeout", requestId);
    return await privateRequest(config, credential, requestId, { ...input, method: "GET" }, undefined, async (response) => {
      const body: unknown = await response.json().catch(() => null);
      // API middleware must preserve the correlation identifier it admitted.
      if (response.headers.get("x-request-id") !== requestId) return denied("internal_error", requestId);
      if (!response.ok) return upstreamError(response.status, body, requestId);
      const value = input.parseResult(body);
      return value === null ? denied("internal_error", requestId) : { ok: true, value, requestId };
    });
  } catch (error) { return error instanceof AdminAuthorizationDeniedError ? denied(error.code, requestId) : error instanceof DOMException && error.name === "AbortError" ? denied("request_timeout", requestId) : denied("internal_error", requestId); }
}

async function privateRequest<TResult>(config: BffTransportConfig, credential: string, requestId: string, input: { path: string; method: string; idempotencyKey?: string; allowIdempotencyKey?: boolean; fetcher?: typeof fetch; request?: Pick<BffRequest, "signal"> }, body: string | undefined, handleResponse: (response: Response) => Promise<TResult>): Promise<TResult> {
  const base = new URL(config.privateApiUrl); const url = new URL(input.path, base);
  if (url.origin !== base.origin) throw new Error("private origin mismatch");
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const abort = () => controller.abort();
  input.request?.signal?.addEventListener("abort", abort, { once: true });
  try {
    const headers: Record<string, string> = { authorization: `Bearer ${credential}`, "x-request-id": requestId, accept: "application/json", "content-type": "application/json" };
    if (input.allowIdempotencyKey && input.idempotencyKey) headers["idempotency-key"] = input.idempotencyKey;
    if (input.request?.signal?.aborted) throw new DOMException("Request aborted.", "AbortError");
    const response = await (input.fetcher ?? fetch)(url, { method: input.method, headers, ...(body === undefined ? {} : { body }), redirect: "error", signal: controller.signal });
    const result = await handleResponse(response);
    if (controller.signal.aborted) throw new DOMException("Request aborted.", "AbortError");
    return result;
  } finally { clearTimeout(timeout); input.request?.signal?.removeEventListener("abort", abort); }
}

function denied(code: SafeApiError["code"], requestId: string): { ok: false; error: SafeApiError } {
  const message = code === "csrf_invalid" ? "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại."
    : code === "validation_error" ? "Dữ liệu yêu cầu không hợp lệ."
      : code === "unauthorized" ? "Không được phép truy cập."
        : code === "forbidden" ? "Bạn không có quyền thực hiện thao tác này."
          : "Không thể xử lý yêu cầu.";
  return { ok: false, error: { code, message, requestId } };
}

function upstreamError(status: number, body: unknown, requestId: string): { ok: false; error: SafeApiError; status?: number } {
  const error = parseSafeApiError(body);
  if (!error || error.requestId !== requestId || !isSupportedErrorStatus(status, error.code)) return denied("internal_error", requestId);
  return { ok: false, error, status };
}

function isSupportedErrorStatus(status: number, code: SafeApiError["code"]): boolean {
  return status === 400 && code === "validation_error"
    || status === 401 && code === "unauthorized"
    || status === 403 && (code === "forbidden" || code === "csrf_invalid")
    || status === 408 && code === "request_timeout"
    || (status === 500 || status === 503) && code === "internal_error";
}
