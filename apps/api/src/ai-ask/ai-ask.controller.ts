import { BadRequestException, Controller, Headers, Inject, InternalServerErrorException, Post, Req, Res } from "@nestjs/common";

import { aiAskMaxMultipartBodySize, parseAiAskStreamInput, type RequestPrincipal } from "@xuyenviet/contracts";
import { AiAskAdmissionValidationError, type AiAskStreamExecution } from "@xuyenviet/domain";

import { Principal } from "../auth/principal.decorator";

export const AI_ASK_STREAM_EXECUTION = Symbol("AI_ASK_STREAM_EXECUTION");

@Controller("v1/ai-ask")
export class AiAskController {
  constructor(@Inject(AI_ASK_STREAM_EXECUTION) private readonly execution: AiAskStreamExecution) {}

  @Post("stream")
  async stream(
    @Principal() principal: RequestPrincipal,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: ApiRequest,
    @Res() response: ApiResponse,
  ): Promise<void> {
    const raw = await readBoundedRequest(request);
    const multipart = parseMultipart(headerValue(request.headers["content-type"]), raw);
    const parsed = parseAiAskStreamInput({ question: multipart.question, ...multipart, idempotencyKey });
    if (!parsed) throw new BadRequestException({ code: "validation_error" });

    const abort = new AbortController();
    const onAborted = () => abort.abort(new Error("caller disconnected"));
    // IncomingMessage emits close on normal request completion too. Response close
    // is the only close event that means the stream consumer has gone away.
    const onResponseClose = () => {
      if (!response.writableEnded) abort.abort(new Error("caller disconnected"));
    };
    request.once("aborted", onAborted);
    response.once("close", onResponseClose);
    let iterator: AsyncIterator<Uint8Array> | undefined;
    try {
      iterator = this.execution.execute(parsed, principal, request.requestId!, abort.signal)[Symbol.asyncIterator]();
      let next = await iterator.next();
      if (!next.done) {
        response.setHeader("content-type", "application/x-ndjson; charset=utf-8");
        response.setHeader("cache-control", "no-store");
      }
      while (!next.done) {
        const bytes = next.value;
        if (abort.signal.aborted || response.writableEnded) break;
        if (response.write(bytes) === false) await waitForDrain(response, abort.signal);
        if (abort.signal.aborted || response.writableEnded) break;
        next = await iterator.next();
      }
    } catch (error) {
      // Validation failures happened before the protocol began. Once it has begun,
      // only the retained NDJSON terminal shape is legal on this connection.
      if (!response.headersSent) {
        if (error instanceof AiAskAdmissionValidationError) throw new BadRequestException({ code: "validation_error" });
        throw new InternalServerErrorException({ code: "internal_error" });
      }
    } finally {
      await iterator?.return?.();
      request.removeListener("aborted", onAborted);
      response.removeListener("close", onResponseClose);
      if (!response.writableEnded) response.end();
    }
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
