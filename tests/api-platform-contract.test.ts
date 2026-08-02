import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { apiAudience } from "@xuyenviet/contracts";
import { createBffCredentialConfig, type BffCredentialConfig, type Jwk } from "@xuyenviet/config";
import type { ApiIdentityRepository, ConversationSummaryRepository, ReleaseSchemaVersionRepository } from "@xuyenviet/database";
import type { AiAskStreamExecution, PlanningReadRepository } from "@xuyenviet/domain";
import { createApiModule } from "../apps/api/src/app.module";
import { apiSchemaCompatibility } from "../apps/api/src/release-schema";

let app: INestApplication;
let config: BffCredentialConfig;
let active: Awaited<ReturnType<typeof keySet>>;
let ready = true;
const rows: Record<string, Awaited<ReturnType<ConversationSummaryRepository["listOwnedConversationSummaryRows"]>>> = {
  "user-1": [
    { id: "conversation-b", updatedAt: new Date("2026-07-02T00:00:00.000Z"), messageContent: "Đi Huế" },
    { id: "conversation-a", updatedAt: new Date("2026-07-01T00:00:00.000Z"), messageContent: null },
  ],
  "user-2": [{ id: "conversation-other", updatedAt: new Date("2026-07-03T00:00:00.000Z"), messageContent: "Riêng tư" }],
};

beforeEach(async () => {
  ready = true;
  active = await keySet("web-active");
  const admin = await keySet("admin-active");
  config = createBffCredentialConfig({ audience: apiAudience, maxLifetimeSeconds: 300, issuers: {
    "xuyenviet-web-bff": { issuer: "xuyenviet-web-bff", active },
    "xuyenviet-admin-bff": { issuer: "xuyenviet-admin-bff", active: admin },
  } });
  const identities: ApiIdentityRepository = { async getSession(sessionId) { return sessionId === "session-1" ? { userId: "user-1", expires: new Date(Date.now() + 60_000), authorizationVersion: 1 } : sessionId === "session-2" ? { userId: "user-2", expires: new Date(Date.now() + 60_000), authorizationVersion: 1 } : null; } };
  const summaries: ConversationSummaryRepository = { async listOwnedConversationSummaryRows(userId) { return rows[userId] ?? []; } };
  const planningReads: PlanningReadRepository = {
    async loadOwnedPlanningContext(userId, tripProjectId) { return (userId === "user-1" && tripProjectId === "project-1") || (userId === "user-2" && tripProjectId === "foreign-project") ? { version: 1, hasProjectScope: true, tripProjectId, aggregateVersion: 2, primaryConversationId: userId === "user-1" ? "conversation-a" : "conversation-other", anchors: [], planItems: [], constraints: null, currentConversationFacts: [], conflicts: [] } : null; },
    async loadOwnedAnswerDetail(userId, conversationId, assistantMessageId) { return userId === "user-1" && conversationId === "conversation-a" && assistantMessageId === "answer-1" ? { conversationId, assistantMessageId, content: "Nội dung đã hoàn tất.", provenance: [{ id: "withdrawn", rank: 1, availability: "withdrawn", unavailableLabel: "Nguồn này không còn khả dụng.", usedInPrompt: true, citedInAnswer: false }], annotations: [] } : null; },
  };
  const versions: ReleaseSchemaVersionRepository = {
    async hasCompatibleSchemaVersion(declaration) { return ready && declaration.workload === apiSchemaCompatibility.workload && declaration.minimumVersion === apiSchemaCompatibility.minimumVersion && declaration.maximumVersion === "20260728.1"; },
    async recordSchemaVersion() {},
  };
  const aiAskExecution: AiAskStreamExecution = { async *execute() { yield new Uint8Array([123, 34, 116, 121, 112, 101, 34, 58, 34, 112, 114, 101, 112, 97, 114, 105, 110, 103, 34, 125, 10]); yield new Uint8Array([123, 34, 116, 121, 112, 101, 34, 58, 34, 100, 111, 110, 101, 34, 125, 10]); } };
  const ApiModule = createApiModule(config, identities, { conversationSummaries: summaries, planningReads, schemaVersions: versions, aiAskExecution });
  @Module({ imports: [ApiModule] })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.init();
});

afterEach(async () => { await app.close(); });

describe("API platform contracts", () => {
  test("separates process liveness from database/schema readiness and publishes version/OpenAPI", async () => {
    await request(app.getHttpServer()).get("/health/live").expect(200, { status: "ok" });
    await request(app.getHttpServer()).get("/health/ready").expect(200, { status: "ok" });
    ready = false;
    await request(app.getHttpServer()).get("/health/live").expect(200, { status: "ok" });
    const notReady = await request(app.getHttpServer()).get("/health/ready").expect(503);
    expect(notReady.body).toMatchObject({ code: "internal_error", requestId: expect.any(String) });
    await request(app.getHttpServer()).get("/v1/version").expect(200, { version: "v1", conversationSummaryLimit: 100 });
    const openApi = await request(app.getHttpServer()).get("/openapi.json").expect(200);
    expect(openApi.body.paths["/v1/conversations/summaries"].get.security).toEqual([{ bearerAuth: [] }]);
    expect(openApi.body.paths["/v1/conversations/summaries"].get.summary).toContain("updatedAt DESC");
  });

  test("requires a bearer, ignores browser cookies, emits no CORS, and returns owner-scoped ISO summaries", async () => {
    const browser = await request(app.getHttpServer()).get("/v1/conversations/summaries").set({ Origin: "https://web.xuyenviet.vn", Cookie: "authjs.session-token=browser-cookie" }).expect(401);
    expect(browser.headers["access-control-allow-origin"]).toBeUndefined();
    expect(browser.body).toEqual({ code: "unauthorized", message: "Không được phép truy cập.", requestId: expect.any(String) });

    const response = await request(app.getHttpServer()).get("/v1/conversations/summaries").set("Authorization", `Bearer ${await tokenFor()}`).expect(200);
    expect(response.body).toEqual({ summaries: [
      { id: "conversation-b", updatedAt: "2026-07-02T00:00:00.000Z", preview: "Đi Huế" },
      { id: "conversation-a", updatedAt: "2026-07-01T00:00:00.000Z", preview: "Hội thoại mới" },
    ] });
    expect(JSON.stringify(response.body)).not.toContain("conversation-other");
  });

  test("serves only safe owner-scoped planning context and historic details", async () => {
    const noBearerContext = await request(app.getHttpServer()).get("/v1/conversations/planning-context/project-1").set({ Origin: "https://web.xuyenviet.vn", Cookie: "authjs.session-token=browser-cookie" }).expect(401);
    expect(noBearerContext.headers["access-control-allow-origin"]).toBeUndefined();
    const noBearerDetail = await request(app.getHttpServer()).get("/v1/conversations/conversation-a/answers/answer-1").set({ Origin: "https://web.xuyenviet.vn", Cookie: "authjs.session-token=browser-cookie" }).expect(401);
    expect(noBearerDetail.headers["access-control-allow-origin"]).toBeUndefined();
    const context = await request(app.getHttpServer()).get("/v1/conversations/planning-context/project-1").set("Authorization", `Bearer ${await tokenFor()}`).expect(200);
    expect(context.body.context).toMatchObject({ version: 1, tripProjectId: "project-1", aggregateVersion: 2 });
    await request(app.getHttpServer()).get("/v1/conversations/planning-context/foreign-project").set("Authorization", `Bearer ${await tokenFor()}`).expect(200, { context: null });
    await request(app.getHttpServer()).get("/v1/conversations/planning-context/foreign-project").set("Authorization", `Bearer ${await tokenFor("user-2", "session-2")}`).expect(200).expect(({ body }) => expect(body.context.tripProjectId).toBe("foreign-project"));
    await request(app.getHttpServer()).get("/v1/conversations/planning-context/%20bad").set("Authorization", `Bearer ${await tokenFor()}`).expect(200, { context: null });
    const detail = await request(app.getHttpServer()).get("/v1/conversations/conversation-a/answers/answer-1").set("Authorization", `Bearer ${await tokenFor()}`).expect(200);
    expect(detail.body.detail).toMatchObject({ content: "Nội dung đã hoàn tất.", provenance: [{ availability: "withdrawn", unavailableLabel: "Nguồn này không còn khả dụng." }] });
    expect(detail.body.detail).not.toHaveProperty("sourceSnapshot");
    expect(detail.body.detail).not.toHaveProperty("providerPayload");
    expect(detail.body.detail).not.toHaveProperty("rawSourceMaterial");
    await request(app.getHttpServer()).get("/v1/conversations/conversation-a/answers/foreign-answer").set("Authorization", `Bearer ${await tokenFor()}`).expect(200, { detail: null });
    await request(app.getHttpServer()).get("/v1/conversations/missing/answers/answer-1").set("Authorization", `Bearer ${await tokenFor()}`).expect(200, { detail: null });
    await request(app.getHttpServer()).get("/v1/conversations/%20bad/answers/answer-1").set("Authorization", `Bearer ${await tokenFor()}`).expect(200, { detail: null });
    await request(app.getHttpServer()).get("/v1/conversations/conversation-a/answers/answer-1").set("Authorization", `Bearer ${await tokenFor("user-2", "session-2")}`).expect(200, { detail: null });
    const openApi = await request(app.getHttpServer()).get("/openapi.json").expect(200);
    expect(openApi.body.paths["/v1/conversations/planning-context/{tripProjectId}"].get.security).toEqual([{ bearerAuth: [] }]);
    expect(openApi.body.paths["/v1/conversations/planning-context/{tripProjectId}"].get.responses["503"]).toEqual({ $ref: "#/components/responses/SafeError" });
    expect(openApi.body.paths["/v1/conversations/{conversationId}/answers/{assistantMessageId}"].get.responses["503"]).toEqual({ $ref: "#/components/responses/SafeError" });
    expect(openApi.body.components.schemas.PlanningContext.properties.context).toEqual({ oneOf: [{ type: "object", nullable: true, enum: [null] }, { $ref: "#/components/schemas/TripAnswerContext" }], description: "Missing and foreign ownership are both null." });
    expect(openApi.body.components.schemas.PlanningAnswerDetail.properties.detail).toEqual({ oneOf: [{ type: "object", nullable: true, enum: [null] }, { $ref: "#/components/schemas/AnswerDetail" }], description: "Missing and foreign ownership are both null; never includes snapshots, provider payloads, or raw source material." });
    expect(openApi.body.components.schemas.UnavailableProvenance.additionalProperties).toBe(false);
    expect(openApi.body.components.schemas.AnswerDetail.properties.provenance.maxItems).toBe(100);
    expect(openApi.body.components.schemas.AnswerDetail.properties.annotations.maxItems).toBe(20);
    expect(openApi.body.components.schemas.AnnotationDetail.additionalProperties).toBe(false);
    expect(openApi.body.components.schemas.ContextConstraints.properties.values.$ref).toBe("#/components/schemas/PlanningJsonObject0");
    expect(openApi.body.components.schemas.TripAnswerContext.properties.constraints).toEqual({ oneOf: [{ type: "object", nullable: true, enum: [null] }, { $ref: "#/components/schemas/ContextConstraints" }] });
    expect(openApi.body.components.schemas.PlanningJsonScalar).toEqual({ oneOf: [{ type: "object", nullable: true, enum: [null] }, { type: "boolean" }, { type: "number" }, { type: "string", maxLength: 500 }] });
  });

  test("streams the execution owner's raw NDJSON bytes through the authenticated versioned API", async () => {
    const boundary = "http-boundary";
    const multipart = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\nĐi đâu?\r\n--${boundary}--\r\n`);
    const response = await request(app.getHttpServer())
      .post("/v1/ai-ask/stream")
      .set("Authorization", `Bearer ${await tokenFor()}`)
      .set("Idempotency-Key", "valid_idempotency_key")
      .set("Content-Type", `multipart/form-data; boundary=${boundary}`)
      .send(multipart)
      .expect(201);

    expect(response.headers["content-type"]).toContain("application/x-ndjson");
    expect(response.text).toBe('{"type":"preparing"}\n{"type":"done"}\n');
  });
});

async function keySet(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  return { kid, key: asJwk(await exportJWK(publicKey), kid), privateKey: asJwk(await exportJWK(privateKey), kid) };
}

function asJwk(key: JsonWebKey, kid: string): Jwk {
  if (key.kty !== "EC" || key.crv !== "P-256") throw new Error("Expected EC key.");
  return { ...key, kty: "EC", crv: "P-256", kid };
}

async function tokenFor(userId = "user-1", sessionId = "session-1") {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: sessionId, roles: ["traveler"], rv: 1, jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: "ES256", kid: active.kid }).setSubject(userId).setIssuer("xuyenviet-web-bff").setAudience(apiAudience)
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 60)
    .sign(await importJWK(active.privateKey, "ES256"));
}
