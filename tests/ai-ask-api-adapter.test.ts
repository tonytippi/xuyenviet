import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

import { AiAskController } from "../apps/api/src/ai-ask/ai-ask.controller";
import { AiAskAdmissionValidationError, type AiAskStreamExecution } from "@xuyenviet/domain";
import type { RequestPrincipal } from "@xuyenviet/contracts";

describe("AI Ask API adapter", () => {
  test("routes validated multipart input to the injected execution owner and writes its bytes unchanged", async () => {
    const first = new Uint8Array([123, 34, 116, 121, 112, 101, 34, 58, 34, 112, 114, 101, 112, 97, 114, 105, 110, 103, 34, 125, 10]);
    const terminal = new TextEncoder().encode('{"type":"error","errorMessage":"safe"}\n');
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
    expect(response.setHeader).toHaveBeenCalledWith("content-type", "application/x-ndjson; charset=utf-8");
  });

  test("does not abort an admitted stream when the request closes normally", async () => {
    let signal: AbortSignal | undefined;
    const controller = new AiAskController({
      execute: async function* (_input, _principal, _requestId, abortSignal) {
        signal = abortSignal;
        yield new TextEncoder().encode('{"type":"preparing"}\n');
        yield new TextEncoder().encode('{"type":"error","errorMessage":"safe"}\n');
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

  test("writes one canonical safe terminal error when iteration fails after the stream starts", async () => {
    const controller = new AiAskController({
      execute: async function* () {
        yield new TextEncoder().encode('{"type":"preparing"}\n');
        throw new Error("provider details must not reach the client");
      },
    });
    const written: Uint8Array[] = [];
    const response = {
      writableEnded: false,
      headersSent: false,
      setHeader: vi.fn(),
      write: vi.fn(function(this: { headersSent: boolean }, bytes: Uint8Array) { this.headersSent = true; written.push(bytes); return true; }),
      end: vi.fn(), once: vi.fn(), removeListener: vi.fn(),
    };
    const boundary = "adapter-boundary";
    const request = { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, requestId: "request_1", async *[Symbol.asyncIterator]() { yield new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\nHue?\r\n--${boundary}--\r\n`); }, once: vi.fn(), removeListener: vi.fn() };

    await controller.stream(principal(), "valid_idempotency_key", request, response);

    expect(new TextDecoder().decode(concatenate(written))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
    expect(response.end).toHaveBeenCalledOnce();
  });

  test("aborts a stalled execution after a valid preparing prefix, writes one safe terminal, and closes the response", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      let releaseNext!: () => void;
      const heldNext = new Promise<IteratorResult<Uint8Array>>((resolve) => { releaseNext = () => resolve({ done: true, value: undefined }); });
      const iterator = {
        next: vi.fn()
          .mockResolvedValueOnce({ done: false as const, value: new TextEncoder().encode('{"type":"preparing"}\n') })
          .mockImplementationOnce(() => heldNext),
        return: vi.fn(async () => ({ done: true as const, value: undefined })),
      };
      const controller = new AiAskController({
        execute: vi.fn((_input, _principal, _requestId, abortSignal) => {
          signal = abortSignal;
          return { [Symbol.asyncIterator]: () => iterator };
        }) as AiAskStreamExecution["execute"],
      });
      const written: Uint8Array[] = [];
      const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

      const streaming = controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);
      await vi.waitFor(() => expect(iterator.next).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(195_000);
      await expect(streaming).resolves.toBeUndefined();

      expect(signal?.aborted).toBe(true);
      expect(new TextDecoder().decode(concatenate(written))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
      expect(response.end).toHaveBeenCalledOnce();
      releaseNext();
    } finally {
      vi.useRealTimers();
    }
  });

  test("does not synthesize a terminal when execution stalls before a valid preparing prefix", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const iterator = {
        next: vi.fn(() => new Promise<IteratorResult<Uint8Array>>(() => undefined)),
        return: vi.fn(async () => ({ done: true as const, value: undefined })),
      };
      const controller = new AiAskController({
        execute: vi.fn((_input, _principal, _requestId, abortSignal) => {
          signal = abortSignal;
          return { [Symbol.asyncIterator]: () => iterator };
        }) as AiAskStreamExecution["execute"],
      });
      const written: Uint8Array[] = [];
      const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

      const streaming = controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);
      await vi.advanceTimersByTimeAsync(195_000);
      await expect(streaming).resolves.toBeUndefined();

      expect(signal?.aborted).toBe(true);
      expect(written).toEqual([]);
      expect(response.end).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test("closes promptly without a terminal when a caller disconnects while execution is stalled", async () => {
    let signal: AbortSignal | undefined;
    const iterator = {
      next: vi.fn()
        .mockResolvedValueOnce({ done: false as const, value: new TextEncoder().encode('{"type":"preparing"}\n') })
        .mockImplementationOnce(() => new Promise<IteratorResult<Uint8Array>>(() => undefined)),
      return: vi.fn(() => new Promise<IteratorResult<Uint8Array>>(() => undefined)),
    };
    const controller = new AiAskController({
      execute: vi.fn((_input, _principal, _requestId, abortSignal) => {
        signal = abortSignal;
        return { [Symbol.asyncIterator]: () => iterator };
      }) as AiAskStreamExecution["execute"],
    });
    const listeners = new Map<string, () => void>();
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)), removeListener: vi.fn() };

    const streaming = controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);
    await vi.waitFor(() => expect(iterator.next).toHaveBeenCalledTimes(2));
    listeners.get("close")?.();
    await expect(streaming).resolves.toBeUndefined();

    expect(signal?.aborted).toBe(true);
    expect(new TextDecoder().decode(concatenate(written))).toBe('{"type":"preparing"}\n');
    expect(response.end).toHaveBeenCalledOnce();
  });

  test("does not write a recovery terminal when the caller disconnects as the deadline expires", async () => {
    vi.useFakeTimers();
    try {
      const iterator = {
        next: vi.fn()
          .mockResolvedValueOnce({ done: false as const, value: new TextEncoder().encode('{"type":"preparing"}\n') })
          .mockImplementationOnce(() => new Promise<IteratorResult<Uint8Array>>(() => undefined)),
        return: vi.fn(async () => ({ done: true as const, value: undefined })),
      };
      const controller = new AiAskController({
        execute: vi.fn(() => ({ [Symbol.asyncIterator]: () => iterator })) as AiAskStreamExecution["execute"],
      });
      const listeners = new Map<string, () => void>();
      const written: Uint8Array[] = [];
      const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)), removeListener: vi.fn() };

      // Register before the controller's chunk deadline so close wins at the same clock time.
      setTimeout(() => listeners.get("close")?.(), 195_000);
      const streaming = controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);
      await vi.waitFor(() => expect(iterator.next).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(195_000);
      await expect(streaming).resolves.toBeUndefined();

      expect(new TextDecoder().decode(concatenate(written))).toBe('{"type":"preparing"}\n');
      expect(response.end).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test("adds one canonical safe terminal error when a begun iterator ends early", async () => {
    const controller = new AiAskController({
      execute: async function* () { yield new TextEncoder().encode('{"type":"preparing"}\n'); },
    });
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };
    const boundary = "adapter-boundary";
    const request = multipartRequest(boundary);

    await controller.stream(principal(), "valid_idempotency_key", request, response);

    expect(new TextDecoder().decode(concatenate(written))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
  });

  test("accepts a complete pending replay and suppresses unfinished later bytes", async () => {
    const replay = new TextEncoder().encode('{"type":"in_progress","conversationId":"conversation-1"}\n{"type":"delta","content":"partial');
    const controller = new AiAskController({
      execute: async function* () { yield replay; },
    });
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

    await controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);

    expect(new TextDecoder().decode(concatenate(written))).toBe('{"type":"in_progress","conversationId":"conversation-1"}\n');
    expect(response.end).toHaveBeenCalledOnce();
  });

  test("ends the response when execution iterator cleanup rejects", async () => {
    const iterator = {
      next: vi.fn(async () => ({ done: false as const, value: new TextEncoder().encode('{"type":"error","errorMessage":"safe"}\n') })),
      return: vi.fn(async () => { throw new Error("iterator cleanup failed"); }),
    };
    const controller = new AiAskController({ execute: vi.fn(() => ({ [Symbol.asyncIterator]: () => iterator })) as AiAskStreamExecution["execute"] });
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn(() => true), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

    await expect(controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response)).resolves.toBeUndefined();

    expect(response.end).toHaveBeenCalledOnce();
  });

  test("drops an unterminated raw fragment before the canonical terminal when a begun iterator fails", async () => {
    const controller = new AiAskController({
      execute: async function* () {
        yield new TextEncoder().encode('{"type":"preparing"}\n{"type":"delta","content":"partial');
        throw new Error("provider disconnected mid-frame");
      },
    });
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

    await controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);

    expect(new TextDecoder().decode(concatenate(written))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
  });

  test("drops an unterminated raw fragment before the canonical terminal when a begun iterator ends", async () => {
    const controller = new AiAskController({
      execute: async function* () {
        yield new TextEncoder().encode('{"type":"preparing"}\n{"type":"delta","content":"partial');
      },
    });
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

    await controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);

    expect(new TextDecoder().decode(concatenate(written))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
  });

  test("closes without a synthetic terminal when the initial upstream record exceeds the framing limit", async () => {
    const iterator = {
      next: vi.fn(async () => ({ done: false as const, value: new Uint8Array(1_048_577).fill(65) })),
      return: vi.fn(async () => ({ done: true as const, value: undefined })),
    };
    const controller = new AiAskController({ execute: vi.fn(() => ({ [Symbol.asyncIterator]: () => iterator })) as AiAskStreamExecution["execute"] });
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

    await controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);

    expect(new TextDecoder().decode(concatenate(written))).toBe("");
    expect(iterator.return).toHaveBeenCalledOnce();
  });

  test("recovers after a complete preparing record split across raw byte chunks", async () => {
    const preparing = new TextEncoder().encode('{"type":"preparing"}\n');
    const controller = new AiAskController({
      execute: async function* () {
        yield preparing.subarray(0, 9);
        yield preparing.subarray(9);
      },
    });
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

    await controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);

    expect(new TextDecoder().decode(concatenate(written))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
  });

  test("forwards malformed and type-only initial records without synthesizing a terminal", async () => {
    for (const initial of ['{"type":"preparing","unexpected":true}\n', '{"type":"delta"}\n', '{"type":"preparing"\n']) {
      const controller = new AiAskController({ execute: async function* () { yield new TextEncoder().encode(initial); } });
      const written: Uint8Array[] = [];
      const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

      await controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);

      expect(new TextDecoder().decode(concatenate(written))).toBe(initial);
    }
  });

  test("closes without a synthetic terminal after an incomplete initial frame", async () => {
    const controller = new AiAskController({ execute: async function* () { yield new TextEncoder().encode('{"type":"prepar'); } });
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

    await controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);

    expect(new TextDecoder().decode(concatenate(written))).toBe("");
  });

  test("suppresses frames after a split or coalesced terminal record and returns the iterator", async () => {
    const terminalThenData = new TextEncoder().encode('{"type":"preparing"}\n{"type":"error","errorMessage":"safe"}\n{"type":"delta","content":"ignored"}\n');
    const iterator = {
      next: vi.fn()
        .mockResolvedValueOnce({ done: false, value: terminalThenData.subarray(0, 31) })
        .mockResolvedValueOnce({ done: false, value: terminalThenData.subarray(31) }),
      return: vi.fn(async () => ({ done: true, value: undefined })),
    };
    const controller = new AiAskController({
      execute: vi.fn(() => ({ [Symbol.asyncIterator]: () => iterator })) as AiAskStreamExecution["execute"],
    });
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };
    const boundary = "adapter-boundary";

    await controller.stream(principal(), "valid_idempotency_key", multipartRequest(boundary), response);

    expect(new TextDecoder().decode(concatenate(written))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"safe"}\n');
    expect(iterator.next).toHaveBeenCalledTimes(2);
    expect(iterator.return).toHaveBeenCalledOnce();
  });

  test("does not treat nested type fields or type-only terminal records as terminal", async () => {
    const records = [
      '{"type":"delta","metadata":{"type":"done"}}\n',
      '{"type":"done"}\n',
      '{"type":"error","errorMessage":"safe"}\n',
    ];
    const controller = new AiAskController({
      execute: async function* () {
        yield new TextEncoder().encode(records.join(""));
      },
    });
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

    await controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);

    expect(new TextDecoder().decode(concatenate(written))).toBe(records.join(""));
  });

  test("forwards a done record with an unexpected assistant key until a later valid terminal", async () => {
    const records = [
      '{"type":"preparing"}\n',
      '{ "assistantMessage" : { "unexpected" : true, "content" : "Wrong", "id" : "assistant-1" }, "userMessage" : { "content" : "Hi", "id" : "user-1" }, "conversationId" : "conversation-1", "type" : "done" }\n',
      '{ "assistantMessage" : { "provenance" : [], "content" : "Right", "id" : "assistant-2" }, "userMessage" : { "content" : "Hi", "id" : "user-1" }, "conversationId" : "conversation-1", "type" : "done" }\n',
      '{"type":"delta","content":"ignored"}\n',
    ];
    const encoder = new TextEncoder();
    const controller = new AiAskController({
      execute: async function* () {
        yield new TextEncoder().encode(records.join(""));
      },
    });
    const written: Uint8Array[] = [];
    const response = { writableEnded: false, headersSent: false, setHeader: vi.fn(), write: vi.fn((bytes: Uint8Array) => { written.push(bytes); return true; }), end: vi.fn(), once: vi.fn(), removeListener: vi.fn() };

    await controller.stream(principal(), "valid_idempotency_key", multipartRequest("adapter-boundary"), response);

    expect(concatenate(written)).toEqual(encoder.encode(records.slice(0, 3).join("")));
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
  return { userId: "user-1", sessionId: "session-1", roles: ["traveler"], authorizationVersion: 1 };
}

function concatenate(chunks: Uint8Array[]) {
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function multipartRequest(boundary: string) {
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, requestId: "request_1", async *[Symbol.asyncIterator]() { yield new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\nHue?\r\n--${boundary}--\r\n`); }, once: vi.fn(), removeListener: vi.fn() };
}
