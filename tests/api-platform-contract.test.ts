import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { createHmac } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { apiAudience } from "@xuyenviet/contracts";
import { createBffCredentialConfig, type BffCredentialConfig, type Jwk } from "@xuyenviet/config";
import type { BrowserIdentityRepository, ConversationSummaryRepository, ReleaseSchemaVersionRepository, TravelerShellRepository } from "@xuyenviet/database";
import type { AiAskStreamExecution, PlanningReadRepository, TravelerCommandPort } from "@xuyenviet/domain";
import { createApiModule } from "../apps/api/src/app.module";
import { apiSchemaCompatibility } from "../apps/api/src/release-schema";

let app: INestApplication;
let config: BffCredentialConfig;
let active: Awaited<ReturnType<typeof keySet>>;
let ready = true;
const browserAuth = { googleClientId: "client", googleClientSecret: "secret", callbackUrl: "https://web.xuyenviet.vn/auth/google/callback", allowedOrigins: ["https://web.xuyenviet.vn"], allowedReturnUrls: ["https://web.xuyenviet.vn/ai-ask"], sessionLookupKey: "b".repeat(32), csrfKey: "c".repeat(32), oauthTransactionProtectionKey: "d".repeat(32), cookieName: "__Host-xuyenviet-session" } as const;
const browserSessionId = "b".repeat(64);
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
  const identities: BrowserIdentityRepository = {
    async getSession(sessionId) { return sessionId === "session-1" ? { userId: "user-1", expires: new Date(Date.now() + 60_000), authorizationVersion: 1 } : sessionId === "session-2" ? { userId: "user-2", expires: new Date(Date.now() + 60_000), authorizationVersion: 1 } : null; },
    async getBrowserSession(sessionId) { return sessionId === browserSessionId ? { userId: "user-1", sessionId, expires: new Date(Date.now() + 60_000), authorizationVersion: 1, roles: ["traveler"], csrfHash: createHmac("sha256", browserAuth.csrfKey).update(`${sessionId}.browser-csrf`).digest("base64url") } : null; },
    async getBrowserLogoutCsrfHash() { return null; },
    async createBrowserOAuthTransaction() {},
    async consumeBrowserOAuthTransaction() { return null; },
    async createBrowserSession() {},
    async purgeExpiredBrowserOAuthTransactions() {},
    async renewBrowserSession() { return true; },
    async resolveOrCreateBrowserGoogleUser() { return { userId: "user-1", authorizationVersion: 1 }; },
    async revokeBrowserSession() {},
  };
  const summaries: ConversationSummaryRepository = { async listOwnedConversationSummaryRows(userId) { return rows[userId] ?? []; } };
  const planningReads: PlanningReadRepository = {
    async loadOwnedPlanningContext(userId, tripProjectId) { return (userId === "user-1" && tripProjectId === "project-1") || (userId === "user-2" && tripProjectId === "foreign-project") ? { version: 1, hasProjectScope: true, tripProjectId, aggregateVersion: 2, primaryConversationId: userId === "user-1" ? "conversation-a" : "conversation-other", anchors: [], planItems: [], constraints: null, currentConversationFacts: [], conflicts: [] } : null; },
    async loadOwnedAnswerDetail(userId, conversationId, assistantMessageId) { return userId === "user-1" && conversationId === "conversation-a" && assistantMessageId === "answer-1" ? { conversationId, assistantMessageId, content: "Nội dung đã hoàn tất.", provenance: [{ id: "withdrawn", rank: 1, availability: "withdrawn", unavailableLabel: "Nguồn này không còn khả dụng.", usedInPrompt: true, citedInAnswer: false }], annotations: [] } : null; },
  };
  const travelerShells: TravelerShellRepository = { async loadOwnedTravelerShell(userId, conversationId, tripProjectId) { return userId === "user-1" && (conversationId === "conversation-a" || tripProjectId === "project-1") ? { conversation: { id: "conversation-a", tripProjectId: null, messages: [{ id: "message-1", role: "assistant", content: "Nội dung đã hoàn tất." }] }, tripProject: null, workspace: null } : { conversation: null, tripProject: null, workspace: null }; } };
  const versions: ReleaseSchemaVersionRepository = {
    async hasCompatibleSchemaVersion(declaration) { return ready && declaration.workload === apiSchemaCompatibility.workload && declaration.minimumVersion === apiSchemaCompatibility.minimumVersion && declaration.maximumVersion === "20260728.1"; },
    async recordSchemaVersion() {},
  };
  const aiAskExecution: AiAskStreamExecution = { async *execute() { yield new Uint8Array([123, 34, 116, 121, 112, 101, 34, 58, 34, 112, 114, 101, 112, 97, 114, 105, 110, 103, 34, 125, 10]); yield new Uint8Array([123, 34, 116, 121, 112, 101, 34, 58, 34, 100, 111, 110, 101, 34, 125, 10]); } };
  const travelerCommands: TravelerCommandPort = {
    async createTripProject(userId, input) { return userId === "user-1" ? { success: true, project: { id: "project-created", title: input.title.trim(), origin: null, destination: null, startDate: null, endDate: null, travelers: null, notes: null, updatedAt: "2026-08-03T00:00:00.000Z" } } : { success: false, reason: "failed" }; },
    async deleteConversation(userId, id) { return userId === "user-1" && id === "conversation-a" ? { success: true } : { success: false, reason: "not_found" }; },
    async deleteTripProject(userId, id) { return userId === "user-1" && id === "project-1" ? { success: true } : { success: false, reason: "not_found" }; },
    async saveAnswerUsefulnessFeedback(userId, input) { return userId === "user-1" && input.assistantMessageId === "answer-1" ? { success: true, feedback: { rating: input.rating, comment: input.comment?.trim() || null, updatedAt: "2026-08-03T00:00:00.000Z" } } : { success: false, reason: "not_found" }; },
    async applyTripChangeProposal(userId, input) { return userId === "user-1" && input.proposalId === "proposal-1" ? { success: true, aggregateVersion: 3, proposalStatus: "applied" } : { success: false, reason: "not_found" }; },
    async dismissTripChangeProposal(userId, input) { return userId === "user-1" && input.proposalId === "proposal-1" ? { success: true, proposalStatus: "dismissed" } : { success: false, reason: "not_found" }; },
    async executeAnnotationProposalAction(userId, input) { return userId === "user-1" && input.annotationId === "trip-change-proposal-apply" ? { success: true, aggregateVersion: 3, proposalStatus: "applied" } : { success: false, reason: "not_found" }; },
  };
  const ApiModule = createApiModule(config, identities, { conversationSummaries: summaries, travelerShells, planningReads, travelerCommands, schemaVersions: versions, aiAskExecution, browserAuth });
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
    expect(openApi.body.paths["/v1/conversations/summaries"].get.security).toEqual([{ bearerAuth: [] }, { browserSession: [] }]);
    expect(openApi.body.paths["/v1/conversations/summaries"].get.summary).toContain("updatedAt DESC");
    expect(openApi.body.paths["/v1/conversations/summaries"].get.summary).toContain("retained BFF bearer path");
    expect(openApi.body.paths["/v1/ai-ask/stream"].post.security).toEqual([{ bearerAuth: [] }, { browserSession: [] }]);
    const csrfHeader = { name: "X-XuyenViet-CSRF", in: "header", required: false, description: "Required for browser-session mutations; not used by the retained bearer path.", schema: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" } };
    expect(openApi.body.paths["/v1/ai-ask/stream"].post.parameters).toEqual([csrfHeader]);
    expect(openApi.body.paths["/auth/logout"].post.parameters).toEqual([csrfHeader]);
    expect(openApi.body.paths["/v1/admin/workspace"].get.security).toEqual([{ bearerAuth: [] }]);
    expect(openApi.body.components.securitySchemes.bearerAuth.description).toContain("not retired");
    expect(openApi.body.paths["/auth/google"].get.summary).toContain("host-only secure HttpOnly SameSite=Lax transaction cookie");
    expect(openApi.body.paths["/auth/google/callback"].get.summary).toContain("match the state transaction ID before one-time consumption");
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
    expect(openApi.body.paths["/v1/conversations/planning-context/{tripProjectId}"].get.security).toEqual([{ bearerAuth: [] }, { browserSession: [] }]);
    expect(openApi.body.paths["/v1/conversations/{conversationId}/answers/{assistantMessageId}"].get.security).toEqual([{ bearerAuth: [] }, { browserSession: [] }]);
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

  test("serves the owner-scoped direct traveler shell projection", async () => {
    const shell = await request(app.getHttpServer()).get("/v1/conversations/shell?conversationId=conversation-a").set("Authorization", `Bearer ${await tokenFor()}`).expect(200);
    expect(shell.body).toEqual({ shell: { conversation: { id: "conversation-a", tripProjectId: null, messages: [{ id: "message-1", role: "assistant", content: "Nội dung đã hoàn tất." }] }, tripProject: null, workspace: null } });
    await request(app.getHttpServer()).get("/v1/conversations/shell?conversationId=foreign-conversation").set("Authorization", `Bearer ${await tokenFor()}`).expect(200, { shell: { conversation: null, tripProject: null, workspace: null } });
    await request(app.getHttpServer()).get("/v1/conversations/shell?conversationId=history-conversation").set("Authorization", `Bearer ${await tokenFor()}`).expect(200, { shell: { conversation: null, tripProject: null, workspace: null } });
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

  test("admits traveler commands through the single API port and rejects malformed input before the port", async () => {
    const authorization = { Authorization: `Bearer ${await tokenFor()}` };
    await request(app.getHttpServer()).post("/v1/trip-projects").set(authorization).send({ title: "Huế cuối tuần" }).expect(201, { success: true, project: { id: "project-created", title: "Huế cuối tuần", origin: null, destination: null, startDate: null, endDate: null, travelers: null, notes: null, updatedAt: "2026-08-03T00:00:00.000Z" } });
    await request(app.getHttpServer()).post("/v1/trip-projects").set(authorization).send({ title: "ok", extra: true }).expect(400);
    await request(app.getHttpServer()).delete("/v1/conversations/conversation-a").set(authorization).expect(200, { success: true });
    await request(app.getHttpServer()).delete("/v1/trip-projects/foreign").set(authorization).expect(200, { success: false, reason: "not_found" });
    await request(app.getHttpServer()).post("/v1/answer-usefulness-feedback").set(authorization).send({ assistantMessageId: "answer-1", rating: "useful", comment: "Rõ ràng" }).expect(201, { success: true, feedback: { rating: "useful", comment: "Rõ ràng", updatedAt: "2026-08-03T00:00:00.000Z" } });
  });

  test("admits every traveler command only through an exact-origin browser session and CSRF proof", async () => {
    const browser = { Cookie: `${browserAuth.cookieName}=${browserSessionId}`, Origin: browserAuth.allowedOrigins[0], "X-XuyenViet-CSRF": "browser-csrf" };
    const rejected = { Cookie: browser.Cookie, Origin: "https://foreign.example", "X-XuyenViet-CSRF": "browser-csrf" };
    await request(app.getHttpServer()).post("/v1/trip-projects").set(rejected).send({ title: "Huế cuối tuần" }).expect(403);
    await request(app.getHttpServer()).post("/v1/trip-projects").set(browser).send({ title: "Huế cuối tuần" }).expect(201);
    await request(app.getHttpServer()).delete("/v1/conversations/conversation-a").set(browser).expect(200, { success: true });
    await request(app.getHttpServer()).delete("/v1/trip-projects/foreign").set(browser).expect(200, { success: false, reason: "not_found" });
    await request(app.getHttpServer()).post("/v1/answer-usefulness-feedback").set(browser).send({ assistantMessageId: "answer-1", rating: "useful" }).expect(201);
    await request(app.getHttpServer()).post("/v1/trip-change-proposals/apply").set(browser).send({ tripProjectId: "project-1", proposalId: "proposal-1" }).expect(201, { success: true, aggregateVersion: 3, proposalStatus: "applied" });
    await request(app.getHttpServer()).post("/v1/trip-change-proposals/dismiss").set(browser).send({ tripProjectId: "project-1", proposalId: "proposal-1" }).expect(201, { success: true, proposalStatus: "dismissed" });
    await request(app.getHttpServer()).post("/v1/trip-change-proposals/annotation-action").set(browser).send({ conversationId: "conversation-a", assistantMessageId: "answer-1", annotationId: "trip-change-proposal-apply", command: "trip_change_proposal.apply" }).expect(201, { success: true, aggregateVersion: 3, proposalStatus: "applied" });
    await request(app.getHttpServer()).post("/v1/trip-projects").set({ Cookie: browser.Cookie, Origin: browser.Origin, "X-XuyenViet-CSRF": "wrong" }).send({ title: "Huế cuối tuần" }).expect(403);
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
