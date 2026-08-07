import { BadRequestException, Controller, Headers, Inject, InternalServerErrorException, Post, Req, Res } from "@nestjs/common";

import { consoleOperationalTelemetrySink, emitOperationalTelemetry, aiAskMaxMultipartBodySize, parseAiAskStreamInput, type OperationalTelemetrySink, type RequestPrincipal } from "@xuyenviet/contracts";
import { AiAskAdmissionValidationError, type AiAskStreamExecution } from "@xuyenviet/domain";

import { Principal } from "../auth/principal.decorator";

export const AI_ASK_STREAM_EXECUTION = Symbol("AI_ASK_STREAM_EXECUTION");
export const OPERATIONAL_TELEMETRY_SINK = Symbol("OPERATIONAL_TELEMETRY_SINK");
const safeStreamFailure = new TextEncoder().encode('{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
const maxIncompleteNdjsonRecordBytes = 1024 * 1024;
const streamChunkTimeoutMs = 195_000;

@Controller("v1/ai-ask")
export class AiAskController {
  constructor(@Inject(AI_ASK_STREAM_EXECUTION) private readonly execution: AiAskStreamExecution, @Inject(OPERATIONAL_TELEMETRY_SINK) private readonly telemetry: OperationalTelemetrySink = consoleOperationalTelemetrySink) {}

  @Post("stream")
  async stream(
    @Principal() principal: RequestPrincipal,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: ApiRequest,
    @Res() response: ApiResponse,
  ): Promise<void> {
    const startedAt = Date.now();
    let resultCode: "success" | "failure" = "failure";
    const raw = await readBoundedRequest(request);
    const multipart = parseMultipart(headerValue(request.headers["content-type"]), raw);
    const parsed = parseAiAskStreamInput({ question: multipart.question, ...multipart, idempotencyKey });
    if (!parsed) throw new BadRequestException({ code: "validation_error" });

    const abort = new AbortController();
    let callerDisconnected = false;
    const onAborted = () => {
      callerDisconnected = true;
      abort.abort(new Error("caller disconnected"));
    };
    // IncomingMessage emits close on normal request completion too. Response close
    // is the only close event that means the stream consumer has gone away.
    const onResponseClose = () => {
      if (!response.writableEnded) onAborted();
    };
    request.once("aborted", onAborted);
    response.once("close", onResponseClose);
    let iterator: AsyncIterator<Uint8Array> | undefined;
    let recoveryAllowed = false;
    let prefixInvalid = false;
    let upstreamObserved = false;
    let terminalSent = false;
    let deadlineExceeded = false;
    const framer = createNdjsonFramer();
    try {
      iterator = this.execution.execute(parsed, principal, request.requestId!, abort.signal)[Symbol.asyncIterator]();
      let next = await nextStreamChunk(iterator, abort.signal);
      if (next === "timeout") {
        deadlineExceeded = true;
        abort.abort(new Error("AI Ask stream timed out"));
      }
      if (next !== "timeout" && next !== "aborted" && !next.done) {
        response.setHeader("content-type", "application/x-ndjson; charset=utf-8");
        response.setHeader("cache-control", "no-store");
      }
      while (next !== "timeout" && next !== "aborted" && !next.done) {
        if (abort.signal.aborted || response.writableEnded) break;
        upstreamObserved = true;
        for (const frame of framer.push(next.value)) {
          if (response.write(frame.bytes) === false) await waitForDrain(response, abort.signal);
          if (!prefixInvalid) {
            if (!recoveryAllowed) {
              if (frame.validPrefix === "preparing") recoveryAllowed = true;
              else prefixInvalid = true;
            } else if (frame.validPrefix !== "delta") {
              recoveryAllowed = false;
              prefixInvalid = true;
            }
          }
          if (frame.terminal || frame.inProgress) {
            terminalSent = true;
            resultCode = frame.resultCode;
            break;
          }
        }
        if (terminalSent) break;
        if (abort.signal.aborted || response.writableEnded) break;
        next = await nextStreamChunk(iterator, abort.signal);
        if (next === "timeout") {
          deadlineExceeded = true;
          abort.abort(new Error("AI Ask stream timed out"));
        }
      }
      if (!terminalSent) resultCode = "failure";
    } catch (error) {
      // Validation failures happened before the protocol began. Once it has begun,
      // only the retained NDJSON terminal shape is legal on this connection.
       if (!upstreamObserved && !response.headersSent) {
        if (error instanceof AiAskAdmissionValidationError) throw new BadRequestException({ code: "validation_error" });
        throw new InternalServerErrorException({ code: "internal_error" });
      }
    } finally {
       if (recoveryAllowed && !terminalSent && !callerDisconnected && !response.writableEnded) {
         try { response.write(safeStreamFailure); } catch { /* The client may have disconnected between write failure and close. */ }
       }
       if (deadlineExceeded || callerDisconnected) {
         void iterator?.return?.().catch(() => undefined);
       } else {
         try { await iterator?.return?.(); } catch { /* Iterator cleanup cannot keep an already-completed HTTP response open. */ }
       }
      request.removeListener("aborted", onAborted);
      response.removeListener("close", onResponseClose);
      if (!response.writableEnded) response.end();
      emitOperationalTelemetry(this.telemetry, {
        correlationId: request.requestId!, capability: "ai_ask.stream", principalClass: "user", resultCode,
        latencyMs: Math.min(Date.now() - startedAt, 86_400_000),
      });
    }
  }
}

async function nextStreamChunk(iterator: AsyncIterator<Uint8Array>, signal: AbortSignal): Promise<IteratorResult<Uint8Array> | "timeout" | "aborted"> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<"timeout">((resolve) => {
        timeout = setTimeout(() => resolve("timeout"), streamChunkTimeoutMs);
      }),
      new Promise<"aborted">((resolve) => {
        onAbort = () => resolve("aborted");
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function createNdjsonFramer(): { push(bytes: Uint8Array): Array<{ bytes: Uint8Array; terminal: boolean; inProgress: boolean; resultCode: "success" | "failure"; validPrefix: "preparing" | "delta" | undefined }> } {
  let buffered = new Uint8Array();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return {
    push(bytes) {
      const combined = new Uint8Array(buffered.byteLength + bytes.byteLength);
      combined.set(buffered);
      combined.set(bytes, buffered.byteLength);
      const frames: Array<{ bytes: Uint8Array; terminal: boolean; inProgress: boolean; resultCode: "success" | "failure"; validPrefix: "preparing" | "delta" | undefined }> = [];
      let start = 0;
      for (let index = 0; index < combined.byteLength; index += 1) {
        if (combined[index] !== 10) continue;
        const frame = combined.slice(start, index + 1);
        // Inspect only fully framed records. Frames themselves remain unmodified.
        const record = ndjsonRecord(frame, decoder);
        frames.push({ bytes: frame, terminal: record.terminal && !record.inProgress, inProgress: record.inProgress, resultCode: record.resultCode, validPrefix: record.validPrefix });
        start = index + 1;
        if (record.terminal) {
          buffered = new Uint8Array();
          return frames;
        }
      }
      if (combined.byteLength - start > maxIncompleteNdjsonRecordBytes) {
        throw new Error("Incomplete NDJSON record exceeds relay limit.");
      }
      buffered = combined.slice(start);
      return frames;
    },
  };
}

function ndjsonRecord(bytes: Uint8Array, decoder: TextDecoder): { terminal: boolean; inProgress: boolean; resultCode: "success" | "failure"; validPrefix: "preparing" | "delta" | undefined } {
  try {
    const record: unknown = JSON.parse(decoder.decode(bytes));
    if (typeof record !== "object" || record === null || Array.isArray(record)) return { terminal: false, inProgress: false, resultCode: "failure", validPrefix: undefined };
    const value = record as Record<string, unknown>;
    const type = typeof value.type === "string" ? value.type : undefined;
    const keys = Object.keys(value);
    const validPrefix = type === "preparing" && keys.length === 1
      ? "preparing"
      : type === "delta" && typeof value.content === "string" && keys.length === 2 && keys.includes("content")
        ? "delta"
        : undefined;
    const message = value.userMessage;
    const validMessage = typeof message === "object" && message !== null && !Array.isArray(message) && Object.keys(message).length === 2 && typeof (message as Record<string, unknown>).id === "string" && typeof (message as Record<string, unknown>).content === "string";
    const assistant = value.assistantMessage;
    const validAssistant = typeof assistant === "object" && assistant !== null && !Array.isArray(assistant) && Object.keys(assistant).every((key) => ["id", "content", "provenance"].includes(key)) && typeof (assistant as Record<string, unknown>).id === "string" && typeof (assistant as Record<string, unknown>).content === "string" && ((assistant as Record<string, unknown>).provenance === undefined || Array.isArray((assistant as Record<string, unknown>).provenance));
    const inProgress = type === "in_progress" && keys.every((key) => ["type", "conversationId", "userMessage"].includes(key)) && (value.conversationId === undefined || typeof value.conversationId === "string") && (value.userMessage === undefined || validMessage);
    const terminal = inProgress || type === "done" && keys.every((key) => ["type", "conversationId", "userMessage", "assistantMessage"].includes(key)) && typeof value.conversationId === "string" && validMessage && validAssistant
      || type === "error" && keys.every((key) => ["type", "code", "conversationId", "userMessage", "errorMessage"].includes(key)) && typeof value.errorMessage === "string" && (value.code === undefined || value.code === "refresh_required") && (value.conversationId === undefined || typeof value.conversationId === "string") && (value.userMessage === undefined || validMessage);
    return { terminal, inProgress, resultCode: type === "done" ? "success" : "failure", validPrefix };
  } catch {
    return { terminal: false, inProgress: false, resultCode: "failure", validPrefix: undefined };
  }
}

type ApiRequest = AsyncIterable<Uint8Array | Buffer> & {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
  once(event: "aborted" | "close", listener: () => void): void;
  removeListener(event: "aborted" | "close", listener: () => void): void;
};
type ApiResponse = {
  writableEnded: boolean;
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  write(value: Uint8Array): boolean | number;
  end(): void;
  once(event: "close" | "drain", listener: () => void): void;
  removeListener(event: "close" | "drain", listener: () => void): void;
};

function waitForDrain(response: ApiResponse, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      response.removeListener("drain", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    if (signal.aborted) return done();
    response.once("drain", done);
    signal.addEventListener("abort", done, { once: true });
  });
}


function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function readBoundedRequest(request: ApiRequest): Promise<Uint8Array> {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > aiAskMaxMultipartBodySize) throw new BadRequestException({ code: "validation_error" });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > aiAskMaxMultipartBodySize) throw new BadRequestException({ code: "validation_error" });
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function parseMultipart(contentType: string | undefined, body: Uint8Array): { question?: string; conversationId?: string; tripProjectId?: string; image?: { fileName: string | null; mimeType: string; byteSize: number; bytes: Uint8Array } } {
  const boundary = /^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType ?? "")?.slice(1).find(Boolean);
  if (!boundary) return {};
  if (!boundary) return {};
  const fields: Record<string, string> = {};
  let image: { fileName: string | null; mimeType: string; byteSize: number; bytes: Uint8Array } | undefined;
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = splitMultipartParts(Buffer.from(body), delimiter);
  if (!parts) return {};
  for (const part of parts) {
    const split = part.indexOf("\r\n\r\n");
    if (split < 0) continue;
    const headers = part.subarray(0, split).toString("utf8");
    const content = part.subarray(split + 4, part.length - 2);
    const name = /name="([^"]+)"/i.exec(headers)?.[1];
    if (!name) continue;
    const filename = /filename="([^"]*)"/i.exec(headers)?.[1];
    if (filename !== undefined) {
      if (name !== "image" || image) return {};
      image = { fileName: filename || null, mimeType: /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() ?? "", byteSize: content.length, bytes: new Uint8Array(content) };
    } else if (["question", "conversationId", "tripProjectId"].includes(name)) {
      if (Object.hasOwn(fields, name)) return {};
      fields[name] = content.toString("utf8");
    }
  }
  return { ...fields, ...(image ? { image } : {}) };
}

function splitMultipartParts(body: Buffer, delimiter: Buffer): Buffer[] | null {
  const parts: Buffer[] = [];
  if (!body.subarray(0, delimiter.length).equals(delimiter)) return null;
  let cursor = 0;
  while (cursor < body.length) {
    const start = body.indexOf(delimiter, cursor);
    if (start !== cursor) return null;
    const contentStart = start + delimiter.length;
    if (body.subarray(contentStart, contentStart + 4).equals(Buffer.from("--\r\n")) && contentStart + 4 === body.length) return parts;
    if (!body.subarray(contentStart, contentStart + 2).equals(Buffer.from("\r\n"))) return null;
    const partStart = contentStart + 2;
    const next = body.indexOf(Buffer.concat([Buffer.from("\r\n"), delimiter]), partStart);
    if (next < 0) return null;
    parts.push(body.subarray(partStart, next + 2));
    cursor = next + 2;
  }
  return null;
}
