import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

import { AiAskController } from "../apps/api/src/ai-ask/ai-ask.controller";
import { AiAskAdmissionValidationError, type AiAskStreamExecution } from "@xuyenviet/domain";
import type { RequestPrincipal } from "@xuyenviet/contracts";

describe("AI Ask API adapter", () => {
  test("routes validated multipart input to the injected execution owner and writes its bytes unchanged", async () => {
    const first = new Uint8Array([123, 34, 116, 121, 112, 101, 34, 58, 34, 112, 114, 101, 112, 97, 114, 105, 110, 103, 34, 125, 10]);
    const terminal = new Uint8Array([123, 34, 116, 121, 112, 101, 34, 58, 34, 100, 111, 110, 101, 34, 125, 10]);
    const execute = vi.fn<AiAskStreamExecution["execute"]>(async function* () { yield first; yield terminal; });
    const controller = new AiAskController({ execute });
    const written: Uint8Array[] = [];
    const response = {
      writableEnded: false,
      headersSent: false,
      setHeader: vi.fn(),
      write: vi.fn((bytes: Uint8Array) => written.push(bytes)),
      end: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
    };
    const boundary = "adapter-boundary";
    const body = new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\nHue?\r\n--${boundary}--\r\n`);
    const request = {
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      requestId: "request_1",
      async *[Symbol.asyncIterator]() { yield body; },
      once: vi.fn(),
      removeListener: vi.fn(),
    };

    await controller.stream(principal(), "valid_idempotency_key", request, response);

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ question: "Hue?", idempotencyKey: "valid_idempotency_key" }), principal(), "request_1", expect.any(AbortSignal));
    expect(written).toEqual([first, terminal]);
    expect(written[0]).toBe(first);
    expect(written[1]).toBe(terminal);
    expect(response.setHeader).toHaveBeenCalledWith("content-type", "application/x-ndjson; charset=utf-8");
  });

  test("does not abort an admitted stream when the request closes normally", async () => {
    let signal: AbortSignal | undefined;
    const controller = new AiAskController({
      execute: async function* (_input, _principal, _requestId, abortSignal) {
        signal = abortSignal;
        yield new TextEncoder().encode('{"type":"preparing"}\n');
        yield new TextEncoder().encode('{"type":"done"}\n');
      },
    });
    const listeners = new Map<string, () => void>();
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn(), end: vi.fn(), once: vi.fn((event: string, listener: () => void) => listeners.set(`response:${event}`, listener)), removeListener: vi.fn() };
    const boundary = "adapter-boundary";
    const body = new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\nHue?\r\n--${boundary}--\r\n`);
    const request = { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, requestId: "request_1", async *[Symbol.asyncIterator]() { yield body; }, once: vi.fn((event: string, listener: () => void) => listeners.set(`request:${event}`, listener)), removeListener: vi.fn() };

    await controller.stream(principal(), "valid_idempotency_key", request, response);

    expect(request.once).not.toHaveBeenCalledWith("close", expect.any(Function));
    expect(signal?.aborted).toBe(false);
  });

  test("resolves a backpressured write after disconnect and returns the execution iterator", async () => {
    const iterator = {
      next: vi.fn(async () => ({ done: false as const, value: new TextEncoder().encode('{"type":"preparing"}\n') })),
      return: vi.fn(async () => ({ done: true as const, value: undefined })),
    };
    const controller = new AiAskController({
      execute: vi.fn(() => ({ [Symbol.asyncIterator]: () => iterator })) as AiAskStreamExecution["execute"],
    });
    const listeners = new Map<string, () => void>();
    const response = {
      writableEnded: false,
      headersSent: false,
      setHeader: vi.fn(),
      write: vi.fn(() => false),
      end: vi.fn(),
      once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
      removeListener: vi.fn(),
    };
    const boundary = "adapter-boundary";
    const body = new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\nHue?\r\n--${boundary}--\r\n`);
    const request = { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, requestId: "request_1", async *[Symbol.asyncIterator]() { yield body; }, once: vi.fn((event: string, listener: () => void) => listeners.set(`request:${event}`, listener)), removeListener: vi.fn() };

    const streaming = controller.stream(principal(), "valid_idempotency_key", request, response);
    await vi.waitFor(() => expect(listeners.get("drain")).toBeTypeOf("function"));
    listeners.get("close")?.();

    await expect(streaming).resolves.toBeUndefined();
    expect(iterator.next).toHaveBeenCalledTimes(1);
    expect(iterator.return).toHaveBeenCalledOnce();
  });

  test("forwards execution NDJSON bytes without parsing or re-serializing them", () => {
    const source = readFileSync("apps/api/src/ai-ask/ai-ask.controller.ts", "utf8");

    expect(source).not.toContain("JSON.parse");
    expect(source).not.toContain("JSON.stringify");
  });

  test("projects known admission validation failures as 400 and unexpected failures as safe 500s", async () => {
    const boundary = "adapter-boundary";
    const body = new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\nHue?\r\n--${boundary}--\r\n`);
    const request = { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, requestId: "request_1", async *[Symbol.asyncIterator]() { yield body; }, once: vi.fn(), removeListener: vi.fn() };
    const response = () => ({ writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn(), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() });
    const validation = new AiAskController({ execute: async function* () { throw new AiAskAdmissionValidationError("invalid"); } });
    const internal = new AiAskController({ execute: async function* () { throw new Error("database unavailable"); } });

    await expect(validation.stream(principal(), "valid_idempotency_key", request, response())).rejects.toMatchObject({ status: 400, response: { code: "validation_error" } });
    await expect(internal.stream(principal(), "valid_idempotency_key", request, response())).rejects.toMatchObject({ status: 500, response: { code: "internal_error" } });
  });

  test("rejects unterminated multipart framing and duplicate recognized fields before execution", async () => {
    const execute = vi.fn<AiAskStreamExecution["execute"]>(async function* () {});
    const controller = new AiAskController({ execute });
    const response = () => ({ writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn(), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() });
    const boundary = "adapter-boundary";
    for (const payload of [
      `--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\nHue?\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\nHue?\r\n--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\nDa Nang?\r\n--${boundary}--\r\n`,
    ]) {
      const request = { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, requestId: "request_1", async *[Symbol.asyncIterator]() { yield new TextEncoder().encode(payload); }, once: vi.fn(), removeListener: vi.fn() };
      await expect(controller.stream(principal(), "valid_idempotency_key", request, response())).rejects.toMatchObject({ status: 400, response: { code: "validation_error" } });
    }
    expect(execute).not.toHaveBeenCalled();
  });
});

function principal(): RequestPrincipal {
  return { userId: "user-1", sessionId: "session-1", roles: ["traveler"], authorizationVersion: 1, issuer: "xuyenviet-web-bff", tokenId: "token-1" };
}
