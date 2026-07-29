import { getBffCsrfConfig, getBffTransportConfig, isAiAskApiEnabled } from "@xuyenviet/config";
import { aiAskMaxMultipartBodySize, parseAiAskStreamInput } from "@xuyenviet/contracts";
import { createPostgresAiAskStreamExecutionPort } from "@xuyenviet/database";
import { createAiAskStreamExecution } from "@xuyenviet/domain";
import type { NextRequest } from "next/server";

import { getAuthenticatedSession } from "@/server/auth";
import { callPrivateApiStream, BffApiError } from "@/server/bff-api-client";
import { mintWebBffCredential } from "@/server/bff-credentials";
import { correlationId } from "@/server/correlation-id";
import { validateCsrfRequest } from "@/server/csrf";

export async function POST(request: NextRequest) {
  const requestId = correlationId(request.headers.get("x-request-id"));
  const apiEnabled = isAiAskApiEnabled();
  if (!validateCsrfRequest(request, getBffCsrfConfig())) return Response.json({ error: "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại." }, { status: 403, headers: { "x-request-id": requestId } });
  if (!apiEnabled) {
    console.info("AI Ask stream selected owner", { owner: "legacy_compatibility", correlationId: requestId });
    return postLegacyAiAskStream(request, requestId);
  }

  console.info("AI Ask stream selected owner", { owner: "versioned_api", correlationId: requestId });
  if (!await getAuthenticatedSession()) return Response.json({ error: "Authentication required." }, { status: 401, headers: { "x-request-id": requestId } });
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return Response.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400, headers: { "x-request-id": requestId } });

  try {
    const upstream = await callPrivateApiStream({
      config: getBffTransportConfig(),
      credential: await mintWebBffCredential(),
      correlationId: requestId,
      path: "/v1/ai-ask/stream",
      idempotencyKey,
      body: request.body,
      contentType: request.headers.get("content-type"),
      signal: request.signal,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-request-id": upstream.requestId,
      },
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    const status = error instanceof BffApiError && error.safe.code === "validation_error" ? 400 : error instanceof BffApiError && error.safe.code === "request_timeout" ? 408 : 500;
    return Response.json({ error: error instanceof BffApiError ? error.safe.message : "Không thể xử lý yêu cầu." }, { status, headers: { "x-request-id": requestId } });
  }
}

async function postLegacyAiAskStream(request: NextRequest, requestId: string) {
  const session = await getAuthenticatedSession();
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > aiAskMaxMultipartBodySize) {
    return Response.json({ error: "AI Ask submissions must be 6MB or smaller." }, { status: 413 });
  }
  const formData = await request.formData().catch(() => null);
  if (!formData) return Response.json({ error: "Invalid form data." }, { status: 400 });
  const image = formData.get("image");
  if (image !== null && !(image instanceof File)) return Response.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  const parsed = parseAiAskStreamInput({
    question: formData.get("question"),
    conversationId: formData.get("conversationId") || undefined,
    tripProjectId: formData.get("tripProjectId") || undefined,
    idempotencyKey: request.headers.get("idempotency-key"),
    ...(image instanceof File ? { image: { fileName: image.name, mimeType: image.type, byteSize: image.size, bytes: new Uint8Array(await image.arrayBuffer()) } } : {}),
  });
  if (!parsed) return Response.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });

  const execution = createAiAskStreamExecution(createPostgresAiAskStreamExecutionPort(requiredDatabaseUrl()));
  const iterator = execution.execute(parsed, {
    userId: session.userId,
    sessionId: "legacy",
    roles: ["traveler"],
    authorizationVersion: 0,
    issuer: "xuyenviet-web-bff",
    tokenId: "legacy",
  }, requestId, request.signal)[Symbol.asyncIterator]();
  let first: IteratorResult<Uint8Array>;
  try {
    // Admission includes ownership validation. Pull it before committing the HTTP status.
    first = await iterator.next();
  } catch {
    return Response.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) controller.close();
      else controller.enqueue(first.value);
    },
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return?.();
    },
  }), {
    headers: { "cache-control": "no-store", "content-type": "application/x-ndjson; charset=utf-8" },
  });
}

function requiredDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  return databaseUrl;
}
