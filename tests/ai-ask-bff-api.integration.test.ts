import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { createBffCredentialConfig, createBffTransportConfig, type BffCredentialConfig, type Jwk } from "@xuyenviet/config";
import { apiAudience, type OperationalTelemetryEvent, type OperationalTelemetrySink } from "@xuyenviet/contracts";
import { createPostgresAiAskStreamExecutionPort, createPostgresApiIdentityRepository } from "@xuyenviet/database";
import { createAiAskStreamExecution, type AiAskStreamExecution } from "@xuyenviet/domain";
import { aiAskCommands, aiGatewayModels, aiUsageEvents, assistantResponseProvenance, conversations, domainOutbox, domainOutboxEffects, messages, sessions, users } from "@/db/schema";
import { processAiAskDomainOutboxBatch } from "@/features/ai/domain-outbox-worker";
import { issueCsrfToken } from "@/server/csrf";

import { createApiModule } from "../apps/api/src/app.module";
import { apiSchemaCompatibility } from "../apps/api/src/release-schema";
import { getTestDatabaseUrl } from "./helpers/env-file";
import { resetTestDatabase, testDb } from "./helpers/db";

const transport = createBffTransportConfig({
  privateApiUrl: new URL(`https://${apiAudience}`),
  bffOrigin: "https://web.xuyenviet.test",
  csrfSigningSecret: "a".repeat(32),
  csrfLifetimeSeconds: 300,
  requestTimeoutMs: 30_000,
});
const session = { userId: "traveler", email: "traveler@example.com" };

let app: INestApplication;
let credentialConfig: BffCredentialConfig;
let forwardedCredential: string | undefined;
let gatewayFails = false;
let gatewayGate: Promise<void> | undefined;
let apiRequestCancelled = false;
let telemetryEvents: OperationalTelemetryEvent[];
const telemetry: OperationalTelemetrySink = { emit(event) { telemetryEvents.push(event); } };

beforeEach(async () => {
  await resetTestDatabase();
  const web = await keySet("web-active");
  const admin = await keySet("admin-active");
  credentialConfig = createBffCredentialConfig({
    audience: apiAudience,
    maxLifetimeSeconds: 300,
    issuers: {
      "xuyenviet-web-bff": { issuer: "xuyenviet-web-bff", active: { kid: web.kid, key: web.publicKey } },
      "xuyenviet-admin-bff": { issuer: "xuyenviet-admin-bff", active: { kid: admin.kid, key: admin.publicKey } },
    },
  });
  process.env.XV_WEB_BFF_ACTIVE_KID = web.kid;
  process.env.XV_WEB_BFF_ACTIVE_JWK = JSON.stringify(web.publicKey);
  process.env.XV_WEB_BFF_ACTIVE_PRIVATE_JWK = JSON.stringify(web.privateKey);
  await testDb.insert(users).values({ id: session.userId, email: session.email });
  await testDb.insert(sessions).values({ sessionToken: "bff-session", userId: session.userId, expires: new Date(Date.now() + 86_400_000) });
});

afterEach(async () => {
  if (app) await app.close();
  app = undefined as never;
  vi.doUnmock("@xuyenviet/config");
  vi.doUnmock("@/server/auth");
  vi.doUnmock("@/server/bff-session-token");
  vi.unstubAllGlobals();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`Unexpected network request in test: ${String(input)}`);
    }),
  );
  forwardedCredential = undefined;
  gatewayFails = false;
  gatewayGate = undefined;
  apiRequestCancelled = false;
  telemetryEvents = [];
  vi.resetModules();
  delete process.env.XV_WEB_BFF_ACTIVE_KID;
  delete process.env.XV_WEB_BFF_ACTIVE_JWK;
  delete process.env.XV_WEB_BFF_ACTIVE_PRIVATE_JWK;
  await resetTestDatabase();
});

describe("AI Ask enabled BFF to API integration", () => {
  test("relays exact protected API bytes through a CSRF-valid authenticated BFF request without disclosing internal data", async () => {
    const records = [
      '{"type":"preparing"}\n',
      '{ "assistantMessage" : { "unexpected" : true, "content" : "Wrong", "id" : "assistant-1" }, "userMessage" : { "content" : "Hi", "id" : "user-1" }, "conversationId" : "conversation-1", "type" : "done" }\n',
      '{ "assistantMessage" : { "provenance" : [], "content" : "Right", "id" : "assistant-2" }, "userMessage" : { "content" : "Hi", "id" : "user-1" }, "conversationId" : "conversation-1", "type" : "done" }\n',
      '{"type":"delta","content":"ignored"}\n',
    ];
    const raw = new TextEncoder().encode(records.join(""));
    const expected = new TextEncoder().encode(records.slice(0, 3).join(""));
    let receivedPrincipal: unknown;
    const iterator = {
      next: vi.fn()
        .mockResolvedValueOnce({ done: false as const, value: raw.subarray(0, raw.indexOf(10) + 1) })
        .mockResolvedValueOnce({ done: false as const, value: raw.subarray(raw.indexOf(10) + 1) }),
      return: vi.fn(async () => ({ done: true as const, value: undefined })),
    };
    const execution: AiAskStreamExecution = {
      execute(_input, principal) {
        receivedPrincipal = principal;
        return { [Symbol.asyncIterator]: () => iterator };
      },
    };
    await startApi(execution);
    const getAuthenticatedSession = await loadEnabledRoute();

    const response = await postBffRequest("relay_request_1");
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(201);
    expect(body).toEqual(expected);
    expect(iterator.next).toHaveBeenCalledTimes(2);
    expect(iterator.return).toHaveBeenCalledOnce();
    expect(response.headers.get("x-request-id")).toBe("relay_request_1");
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(new TextDecoder().decode(body)).not.toContain(apiAudience);
    expect(new TextDecoder().decode(body)).not.toContain(forwardedCredential!);
    expect([...response.headers.entries()].join(" ")).not.toContain("Bearer ");
    expect(getAuthenticatedSession).toHaveBeenCalledTimes(2);
    expect(receivedPrincipal).toMatchObject({ userId: session.userId, sessionId: "bff-session", issuer: "xuyenviet-web-bff" });
  });

  test("persists one completed turn atomically and replays its durable terminal through the enabled BFF/API composition", async () => {
    await insertStreamingModel();
    await startApi(createAiAskStreamExecution(createPostgresAiAskStreamExecutionPort(getTestDatabaseUrl(), telemetry)));
    await loadEnabledRoute();

    const first = await postBffRequest("persist_request_1", "persisted_idempotency_key");
    const firstEvents = ndjson(await first.text());
    const terminal = firstEvents.at(-1);
    const replay = await postBffRequest("persist_request_2", "persisted_idempotency_key");
    const replayEvents = ndjson(await replay.text());
    if (!terminal?.assistantMessage) throw new Error("Expected persisted assistant terminal.");

    expect(first.status).toBe(201);
    expect(firstEvents.map((event) => event.type)).toEqual(["preparing", "delta", "done"]);
    expect(terminal).toMatchObject({ type: "done" });
    expect(replay.status).toBe(201);
    expect(replayEvents).toEqual([terminal]);
    await expect(testDb.select({ status: aiAskCommands.status, terminalResult: aiAskCommands.terminalResult, assistantMessageId: aiAskCommands.assistantMessageId }).from(aiAskCommands)).resolves.toEqual([
      expect.objectContaining({ status: "completed", terminalResult: terminal, assistantMessageId: terminal?.assistantMessage.id }),
    ]);
    await expect(testDb.select({ role: messages.role, content: messages.content }).from(messages)).resolves.toEqual([
      { role: "user", content: "Đi Huế?" },
      { role: "assistant", content: terminal.assistantMessage.content },
    ]);
  });

  test("persists and replays the provider-failure terminal through the enabled BFF/API composition", async () => {
    await insertStreamingModel();
    gatewayFails = true;
    await startApi(createAiAskStreamExecution(createPostgresAiAskStreamExecutionPort(getTestDatabaseUrl(), telemetry)));
    await loadEnabledRoute();

    const first = await postBffRequest("failure_request_1", "failure_idempotency_key");
    const firstEvents = ndjson(await first.text());
    const terminal = firstEvents.at(-1);
    const replay = await postBffRequest("failure_request_2", "failure_idempotency_key");
    const replayEvents = ndjson(await replay.text());

    expect(firstEvents.map((event) => event.type)).toEqual(["preparing", "error"]);
    expect(replayEvents).toEqual([terminal]);
    await expect(testDb.select({ status: aiAskCommands.status, terminalResult: aiAskCommands.terminalResult, assistantMessageId: aiAskCommands.assistantMessageId }).from(aiAskCommands)).resolves.toEqual([
      expect.objectContaining({ status: "failed", terminalResult: terminal, assistantMessageId: null }),
    ]);
    await expect(testDb.select({ role: messages.role }).from(messages)).resolves.toEqual([{ role: "user" }]);
    expect(telemetryEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ correlationId: "failure_request_1", capability: "ai_ask.provider", principalClass: "user", resultCode: "failure" }),
      expect.objectContaining({ correlationId: "failure_request_1", capability: "ai_ask.stream", principalClass: "user", resultCode: "failure" }),
    ]));
    expect(JSON.stringify(telemetryEvents)).not.toMatch(/Đi Huế|Bearer|cookie|authorization|postgres/i);
  });

  test("propagates caller abort through BFF, Nest, and the provider stream", async () => {
    await insertStreamingModel();
    let releaseGateway!: () => void;
    gatewayGate = new Promise<void>((resolve) => { releaseGateway = resolve; });
    await startApi(createAiAskStreamExecution(createPostgresAiAskStreamExecutionPort(getTestDatabaseUrl(), telemetry)));
    await loadEnabledRoute();
    const response = await postBffRequest("abort_request_1", "abort_idempotency_key");

    await response.body?.cancel();
    await vi.waitFor(() => expect(apiRequestCancelled).toBe(true));
    releaseGateway();
    await vi.waitFor(async () => {
      const [usage] = await testDb.select({ errorCode: aiUsageEvents.errorCode }).from(aiUsageEvents);
      expect(usage?.errorCode).toBe("client_stream_aborted");
    });
  });

  test("discards a stale finalization fence through BFF/API without assistant, provenance, usage, or final outbox effects", async () => {
    await insertStreamingModel();
    let releaseGateway!: () => void;
    gatewayGate = new Promise<void>((resolve) => { releaseGateway = resolve; });
    await startApi(createAiAskStreamExecution(createPostgresAiAskStreamExecutionPort(getTestDatabaseUrl(), telemetry)));
    await loadEnabledRoute();
    const response = await postBffRequest("stale_request_1", "stale_idempotency_key");
    await vi.waitFor(async () => expect((await testDb.select({ id: conversations.id }).from(conversations))[0]).toBeDefined());
    const [conversation] = await testDb.select({ id: conversations.id }).from(conversations);
    await testDb.update(conversations).set({ lifecycleVersion: 2 }).where(eq(conversations.id, conversation!.id));
    releaseGateway();
    const events = ndjson(await response.text());

    expect(events.at(-1)).toMatchObject({ type: "error", code: "refresh_required" });
    await expect(testDb.select({ role: messages.role }).from(messages)).resolves.toEqual([{ role: "user" }]);
    await expect(testDb.select().from(assistantResponseProvenance)).resolves.toHaveLength(0);
    await expect(testDb.select({ status: aiUsageEvents.status }).from(aiUsageEvents)).resolves.toEqual([{ status: "failure" }]);
    await expect(testDb.select({ eventType: domainOutbox.eventType }).from(domainOutbox)).resolves.toEqual([{ eventType: "ai_ask.context_extraction.v1" }]);
  });

  test("records a context-dispatch provider failure atomically while preserving the permitted terminal replay", async () => {
    await insertStreamingModel();
    await insertExtractionModel();
    await startApi(createAiAskStreamExecution(createPostgresAiAskStreamExecutionPort(getTestDatabaseUrl(), telemetry)));
    await loadEnabledRoute();
    const first = await postBffRequest("context_failure_1", "context_failure_key");
    const terminal = ndjson(await first.text()).at(-1);
    await testDb.update(domainOutbox).set({ availableAt: new Date("2099-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.answer_annotation.v1"));
    await testDb.update(domainOutbox).set({ availableAt: new Date("2020-01-01T00:00:00.000Z") }).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"));
    gatewayFails = true;

    await expect(processAiAskDomainOutboxBatch({ workerId: "bff-context-failure" })).resolves.toEqual({ kind: "processed", count: 1 });
    const replay = await postBffRequest("context_failure_2", "context_failure_key");

    expect(ndjson(await replay.text())).toEqual([terminal]);
    await expect(testDb.select({ status: domainOutbox.status, lastErrorCode: domainOutbox.lastErrorCode }).from(domainOutbox).where(eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"))).resolves.toEqual([{ status: "pending", lastErrorCode: "context_provider_failed" }]);
    await expect(testDb.select({ status: aiUsageEvents.status, errorCode: aiUsageEvents.errorCode }).from(aiUsageEvents).where(eq(aiUsageEvents.purpose, "extraction"))).resolves.toEqual([{ status: "failure", errorCode: "gateway_http_error" }]);
    await expect(testDb.select().from(domainOutboxEffects)).resolves.toHaveLength(0);
  });

});

async function loadEnabledRoute() {
  vi.resetModules();
  const getAuthenticatedSession = vi.fn(async () => session);
  vi.doMock("@xuyenviet/config", async () => ({
    ...(await vi.importActual<typeof import("@xuyenviet/config")>("@xuyenviet/config")),
    isAiAskApiEnabled: () => true,
    getBffCsrfConfig: () => transport,
    getBffTransportConfig: () => transport,
  }));
  vi.doMock("@/server/auth", () => ({ getAuthenticatedSession }));
  vi.doMock("@/server/bff-session-token", () => ({ resolveBffSessionToken: async () => "bff-session" }));

  vi.unstubAllGlobals();
  const nativeFetch = globalThis.fetch;
  const address = app.getHttpServer().address();
  if (!address || typeof address === "string") throw new Error("Expected listening API server.");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin === new URL(transport.privateApiUrl).origin) {
      const credential = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "");
      if (!credential) throw new Error("BFF did not forward a credential.");
      forwardedCredential = credential;
      init?.signal?.addEventListener("abort", () => { apiRequestCancelled = true; }, { once: true });
      await jwtVerify(credential, await importJWK(credentialConfig.issuers["xuyenviet-web-bff"].active.key, "ES256"), { issuer: "xuyenviet-web-bff", audience: apiAudience });
      url.protocol = "http:";
      url.hostname = "127.0.0.1";
      url.port = String(address.port);
      return nativeFetch(url, init);
    }
    if (url.origin === "https://test-gateway.example") {
      if (gatewayFails) return new Response("unavailable", { status: 503 });
      if (gatewayGate) {
        return new Response(new ReadableStream({
          start(controller) {
            const onAbort = () => { controller.close(); };
            init?.signal?.addEventListener("abort", onAbort, { once: true });
            controller.enqueue(new TextEncoder().encode('data: {"model":"test-streaming-model","choices":[{"delta":{"content":"Đi Huế an toàn"}}]}\n\n'));
          },
          async pull(controller) {
            await gatewayGate;
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":4,"total_tokens":7}}\n\ndata: [DONE]\n\n'));
            controller.close();
          },
          cancel() {},
        }), { headers: { "content-type": "text/event-stream" } });
      }
      return new Response('data: {"model":"test-streaming-model","choices":[{"delta":{"content":"Đi Huế an toàn"}}]}\n' +
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":4,"total_tokens":7}}\n' +
        "data: [DONE]\n", { headers: { "content-type": "text/event-stream" } });
    }
    throw new Error(`Unexpected network request: ${url}`);
  });
  await import("@/app/api/ai-ask/stream/route");
  return getAuthenticatedSession;
}

async function insertStreamingModel() {
  await testDb.insert(aiGatewayModels).values({
    id: "streaming-ai-ask-model",
    gatewayModelName: "test-streaming-model",
    displayLabel: "Test streaming model",
    purpose: "ai_ask_initial_answer",
    active: true,
    defaultForPurpose: true,
    supportsTextInput: true,
    supportsImageInput: false,
    supportsImageOutput: false,
    supportsEmbeddings: false,
    supportsExtraction: false,
    supportsEvaluation: false,
    supportsStreaming: true,
    supportsCachePricing: false,
    pricingCurrency: "USD",
    inputTokenPriceMicros: 2_000_000,
    outputTokenPriceMicros: 4_000_000,
    pricingUnitTokens: 1_000_000,
    pricingEffectiveAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

async function insertExtractionModel() {
  await testDb.insert(aiGatewayModels).values({
    id: "extraction-ai-ask-model", gatewayModelName: "test-extraction-model", displayLabel: "Test extraction model", purpose: "extraction", active: true, defaultForPurpose: true,
    supportsTextInput: true, supportsImageInput: false, supportsImageOutput: false, supportsEmbeddings: false, supportsExtraction: true, supportsEvaluation: false, supportsStreaming: false, supportsCachePricing: false,
    pricingCurrency: "USD", inputTokenPriceMicros: 2_000_000, outputTokenPriceMicros: 4_000_000, pricingUnitTokens: 1_000_000, pricingEffectiveAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

async function postBffRequest(requestId: string, idempotencyKey = "valid_idempotency_key") {
  const token = issueCsrfToken(transport);
  const form = new FormData();
  form.set("question", "Đi Huế?");
  const request = new Request("https://web.xuyenviet.test/api/ai-ask/stream", {
    method: "POST",
    body: form,
    headers: {
      "idempotency-key": idempotencyKey,
      "x-request-id": requestId,
      origin: transport.bffOrigin,
      "sec-fetch-site": "same-origin",
      "X-XuyenViet-CSRF": token,
    },
  });
  Object.assign(request, { cookies: { get: (name: string) => name === "xv_bff_csrf" ? { value: token } : undefined } });
  const { POST } = await import("@/app/api/ai-ask/stream/route");
  return POST(request as never);
}

async function startApi(execution: AiAskStreamExecution) {
  const summaries = { async listOwnedConversationSummaryRows() { return []; } };
  const versions = { async hasCompatibleSchemaVersion(declaration: typeof apiSchemaCompatibility) { return declaration.workload === apiSchemaCompatibility.workload && declaration.minimumVersion === apiSchemaCompatibility.minimumVersion && declaration.maximumVersion === "20260728.1"; }, async recordSchemaVersion() {} };
  const ApiModule = createApiModule(credentialConfig, createPostgresApiIdentityRepository(getTestDatabaseUrl()), { conversationSummaries: summaries, schemaVersions: versions, aiAskExecution: execution, telemetry });
  @Module({ imports: [ApiModule] })
  class TestApiModule {}
  app = await NestFactory.create(TestApiModule, { logger: false });
  await app.listen(0, "127.0.0.1");
}

async function keySet(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  return { kid, publicKey: asJwk(await exportJWK(publicKey), kid), privateKey: asJwk(await exportJWK(privateKey), kid) };
}

function asJwk(key: JsonWebKey, kid: string): Jwk {
  if (key.kty !== "EC" || key.crv !== "P-256") throw new Error("Expected ES256 JWK.");
  return { ...key, kty: "EC", crv: "P-256", kid };
}

type StreamRecord = { type: string; assistantMessage?: { id: string; content: string } };

function ndjson(body: string): StreamRecord[] {
  return body.trim().split("\n").map((line) => JSON.parse(line) as StreamRecord);
}
