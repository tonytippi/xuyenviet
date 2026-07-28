import "server-only";

import type { SafeApiError } from "@xuyenviet/contracts";
import { getBffTransportConfig, type BffTransportConfig } from "@xuyenviet/config";

import { callPrivateApi, BffApiError } from "./bff-api-client";
import { correlationId } from "./correlation-id";
import { validateCsrfRequest } from "./csrf";

type BffRequest = { headers: Headers; cookies: { get(name: string): { value: string } | undefined } };

// This generic adapter is test infrastructure until a capability explicitly owns a BFF route.
export async function executeProtectedBffMutation<TInput, TResult>(input: {
  request: BffRequest;
  rawInput: unknown;
  parseInput: (value: unknown) => TInput | null | undefined;
  parseResult: (value: unknown) => TResult | null;
  config?: BffTransportConfig;
  mintCredential: () => Promise<string>;
  path: string;
  method: string;
  idempotencyKey?: string;
  allowIdempotencyKey?: boolean;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<{ ok: true; value: TResult; requestId: string } | { ok: false; error: SafeApiError }> {
  // Root BFF composition resolves private transport settings when a real adapter is used.
  const config = input.config ?? getBffTransportConfig();
  const requestId = correlationId(input.request.headers.get("x-request-id"));
  if (!validateCsrfRequest(input.request, config)) return { ok: false, error: { code: "csrf_invalid", message: "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.", requestId } };
  let dto: TInput | null | undefined;
  try {
    dto = input.parseInput(input.rawInput);
  } catch {
    return { ok: false, error: { code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId } };
  }
  if (dto == null || dto instanceof FormData) return { ok: false, error: { code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId } };
  let serializedBody: string;
  try {
    // Serialize before minting so the authenticated request cannot observe a mutated DTO.
    const serialized = JSON.stringify(dto);
    if (serialized === undefined) throw new Error("DTO cannot be serialized.");
    serializedBody = serialized;
  } catch {
    return { ok: false, error: { code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId } };
  }
  try {
    input.signal?.throwIfAborted();
    return { ok: true, value: await callPrivateApi<TResult>({ config, credential: await input.mintCredential(), correlationId: requestId, path: input.path, method: input.method, serializedBody, parseResult: input.parseResult, idempotencyKey: input.idempotencyKey, allowIdempotencyKey: input.allowIdempotencyKey, signal: input.signal, fetcher: input.fetcher }), requestId };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    if (error instanceof BffApiError) return { ok: false, error: error.safe };
    return { ok: false, error: { code: "internal_error", message: "Không thể xử lý yêu cầu.", requestId } };
  }
}
