import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createPostgresApiIdentityRepository } from "@xuyenviet/database";
import { YoutubeDiscoveryReviewCursorValidationError, type AdminYoutubeDiscoveryPort } from "@xuyenviet/domain";
import { createApiModule } from "../apps/api/src/app.module";
import { csrfHash, csrfNonce } from "../apps/api/src/auth/browser-auth";
import { userRoles, users } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";
import { getTestDatabaseUrl } from "./helpers/env-file";

const browserAuth = { googleClientId: "client", googleClientSecret: "secret", callbackUrl: "https://api.xuyenviet.app/auth/google/callback", allowedOrigins: ["https://admin.xuyenviet.app"], allowedReturnUrls: ["https://admin.xuyenviet.app/"], sessionLookupKey: "b".repeat(32), csrfKey: "c".repeat(32), oauthTransactionProtectionKey: "d".repeat(32), cookieName: "__Host-xuyenviet-session" } as const;
const query = { id: "proposal-1", origin: "operator" as const, queryText: "Da Lat route", reason: "operator_request" as const, priority: 50, enabled: true, cadenceMinutes: 60, nextRunAt: "2026-08-07T00:00:00.000Z", pausedReason: null };
const reviewItem = { recommendationId: "recommendation-1", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", title: "Da Lat route", channelName: "Route channel", publishedAt: "2026-08-07T00:00:00.000Z", durationSeconds: 120, recommendation: "consider" as const, reason: "eligible_score_band" as const, actionAvailability: "available" as const };
const reviewDetail = { ...reviewItem, queryText: "Da Lat route", queryReason: "operator_request" as const, score: 0.7, factors: ["relevance" as const], penalties: [], signals: ["practical_question_demand" as const], priorCaptureOutcome: "eligible" as const };
let app: INestApplication;
let port: { [K in keyof AdminYoutubeDiscoveryPort]: ReturnType<typeof vi.fn> };

async function browserSession(userId: string, role: "operator" | "traveler") {
  const sessionId = `${userId[0]}${"s".repeat(63)}`;
  const csrf = csrfNonce(browserAuth, sessionId);
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
  await testDb.insert(userRoles).values({ userId, role });
  await createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey).createBrowserSession(userId, sessionId, csrfHash(browserAuth, sessionId, csrf), 1, new Date(Date.now() + 60_000));
  return { cookie: `${browserAuth.cookieName}=${sessionId}`, csrf };
}

beforeEach(async () => {
  await resetTestDatabase();
  port = { list: vi.fn().mockResolvedValue({ items: [query] }), listReview: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), getReview: vi.fn().mockResolvedValue(null), acceptReview: vi.fn().mockResolvedValue({ outcome: "submitted" }), deferReview: vi.fn().mockResolvedValue({ outcome: "deferred" }), skipReview: vi.fn().mockResolvedValue({ outcome: "skipped" }), create: vi.fn().mockResolvedValue(query), edit: vi.fn().mockResolvedValue(query), reprioritize: vi.fn().mockResolvedValue(query), pause: vi.fn().mockResolvedValue({ ...query, enabled: false, nextRunAt: null, pausedReason: "operator" }), resume: vi.fn().mockResolvedValue(query) };
  const identities = createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey);
  const ApiModule = createApiModule(identities, { conversationSummaries: { async listOwnedConversationSummaryRows() { return []; } }, browserAuth, adminYoutubeDiscovery: port as unknown as AdminYoutubeDiscoveryPort });
  @Module({ imports: [ApiModule] }) class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.init();
});

afterEach(async () => { await app.close(); });

describe("admin YouTube Discovery direct API", () => {
  test("denies anonymous and traveler commands before port admission", async () => {
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery").send({ queryText: "Da Lat route", priority: 50, cadenceMinutes: 60 }).expect(401);
    const traveler = await browserSession("traveler", "traveler");
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery").set({ Cookie: traveler.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": traveler.csrf }).send({ queryText: "Da Lat route", priority: 50, cadenceMinutes: 60 }).expect(403);
    expect(port.create).not.toHaveBeenCalled();
  });

  test("admits all five authenticated operator commands with the request principal", async () => {
    const operator = await browserSession("operator", "operator");
    const headers = { Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf };
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery").set(headers).send({ queryText: "Da Lat route", priority: 50, cadenceMinutes: 60 }).expect(201);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/proposal-1/text").set(headers).send({ queryText: "Da Lat pass route" }).expect(201);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/proposal-1/priority").set(headers).send({ priority: 70 }).expect(201);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/proposal-1/pause").set(headers).send({}).expect(201);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/proposal-1/resume").set(headers).send({}).expect(201);
    expect(port.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator", email: "operator@example.com" }), expect.anything());
    expect(port.edit).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator", email: "operator@example.com" }), "proposal-1", "Da Lat pass route");
    expect(port.reprioritize).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator", email: "operator@example.com" }), "proposal-1", 70);
    expect(port.pause).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator", email: "operator@example.com" }), "proposal-1");
    expect(port.resume).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator", email: "operator@example.com" }), "proposal-1");
    expect(query.origin).toBe("operator");
  });

  test("forwards an authorized text edit to the proposal port", async () => {
    const operator = await browserSession("operator", "operator");
    const headers = { Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf };
    port.edit.mockResolvedValueOnce({ ...query, origin: "system", reason: "coverage_gap" });

    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/proposal-1/text").set(headers).send({ queryText: "Da Lat pass route" }).expect(201);

    expect(port.edit).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator", email: "operator@example.com" }), "proposal-1", "Da Lat pass route");
  });

  test("rejects non-empty pause and resume bodies before port admission", async () => {
    const operator = await browserSession("operator", "operator");
    const headers = { Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf };
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/proposal-1/pause").set(headers).send({ origin: "system" }).expect(400);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/proposal-1/resume").set(headers).send({ providerPayload: {} }).expect(400);
    expect(port.pause).not.toHaveBeenCalled();
    expect(port.resume).not.toHaveBeenCalled();
  });

  test("admits bodyless pause and resume commands", async () => {
    const operator = await browserSession("operator", "operator");
    const headers = { Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf };
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/proposal-1/pause").set(headers).expect(201);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/proposal-1/resume").set(headers).expect(201);
    expect(port.pause).toHaveBeenCalledOnce();
    expect(port.resume).toHaveBeenCalledOnce();
  });

  test("denies anonymous and traveler review reads before port admission", async () => {
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review").expect(401);
    const traveler = await browserSession("traveler", "traveler");
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review").set({ Cookie: traveler.cookie }).expect(403);
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review/recommendation-1").set({ Cookie: traveler.cookie }).expect(403);
    expect(port.listReview).not.toHaveBeenCalled();
    expect(port.getReview).not.toHaveBeenCalled();
  });

  test("admits operator review queue and detail reads", async () => {
    const operator = await browserSession("operator", "operator");
    port.listReview.mockResolvedValueOnce({ items: [reviewItem], nextCursor: null });
    port.getReview.mockResolvedValueOnce(reviewDetail);
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review").set({ Cookie: operator.cookie }).expect(200, { items: [reviewItem], nextCursor: null });
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review/recommendation-1").set({ Cookie: operator.cookie }).expect(200, reviewDetail);
    expect(port.listReview).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator" }), null);
    expect(port.getReview).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator" }), "recommendation-1");
  });

  test("admits only an exact CSRF-protected Accept command and returns its closed outcome", async () => {
    const operator = await browserSession("operator", "operator");
    const headers = { Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf };
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/recommendation-1/accept").set(headers).send({}).expect(201, { outcome: "submitted" });
    expect(port.acceptReview).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator", email: "operator@example.com" }), "recommendation-1");
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/recommendation-1/accept").set(headers).send({ canonicalUrl: "https://unsafe.example" }).expect(400);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/recommendation-1/accept").set({ Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": "invalid" }).send({}).expect(403);
  });

  test("admits only exact CSRF-protected Defer and Skip commands with route-specific outcomes", async () => {
    const operator = await browserSession("operator", "operator");
    const headers = { Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf };
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/recommendation-1/defer").set(headers).send({}).expect(201, { outcome: "deferred" });
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/recommendation-1/skip").set(headers).send({}).expect(201, { outcome: "skipped" });
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/recommendation-1/defer").set(headers).send({ reason: "unsafe" }).expect(400);
    expect(port.deferReview).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator" }), "recommendation-1");
    expect(port.skipReview).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator" }), "recommendation-1");
  });

  test("fails closed for Defer and Skip authorization, stale associations, and unsafe port results", async () => {
    const traveler = await browserSession("traveler", "traveler");
    const operator = await browserSession("operator", "operator");
    const headers = { Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf };
    for (const action of ["defer", "skip"] as const) {
      await request(app.getHttpServer()).post(`/v1/admin/knowledge/youtube-discovery/review/recommendation-1/${action}`).send({}).expect(401);
      await request(app.getHttpServer()).post(`/v1/admin/knowledge/youtube-discovery/review/recommendation-1/${action}`).set({ Cookie: traveler.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": traveler.csrf }).send({}).expect(403);
      await request(app.getHttpServer()).post(`/v1/admin/knowledge/youtube-discovery/review/recommendation-1/${action}`).set({ ...headers, "x-xuyenviet-csrf": "invalid" }).send({}).expect(403);
      port[action === "defer" ? "deferReview" : "skipReview"].mockResolvedValueOnce(null);
      await request(app.getHttpServer()).post(`/v1/admin/knowledge/youtube-discovery/review/recommendation-1/${action}`).set(headers).send({}).expect(404).expect(({ body }) => expect(body).toMatchObject({ code: "not_found" }));
      port[action === "defer" ? "deferReview" : "skipReview"].mockResolvedValueOnce({ outcome: action === "defer" ? "skipped" : "deferred" });
      await request(app.getHttpServer()).post(`/v1/admin/knowledge/youtube-discovery/review/recommendation-1/${action}`).set(headers).send({}).expect(503);
      port[action === "defer" ? "deferReview" : "skipReview"].mockRejectedValueOnce(new Error("adapter unavailable"));
      await request(app.getHttpServer()).post(`/v1/admin/knowledge/youtube-discovery/review/recommendation-1/${action}`).set(headers).send({}).expect(503);
    }
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/%20/defer").set(headers).send({}).expect(400);
  });

  test("rejects malformed review cursor and identifier before port admission", async () => {
    const operator = await browserSession("operator", "operator");
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review?cursor=ydr2.bad").set({ Cookie: operator.cookie }).expect(400);
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review/%20").set({ Cookie: operator.cookie }).expect(400);
    expect(port.listReview).not.toHaveBeenCalled();
    expect(port.getReview).not.toHaveBeenCalled();
  });

  test("rejects unknown review query keys before port admission", async () => {
    const operator = await browserSession("operator", "operator");

    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review?unexpected=value").set({ Cookie: operator.cookie }).expect(400).expect(({ body }) => expect(body).toMatchObject({ code: "validation_error" }));

    expect(port.listReview).not.toHaveBeenCalled();
  });

  test("maps a stale but shape-valid review cursor to validation failure", async () => {
    const operator = await browserSession("operator", "operator");
    port.listReview.mockRejectedValueOnce(new YoutubeDiscoveryReviewCursorValidationError("Invalid YouTube Discovery review cursor."));
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review?cursor=ydr2.eyJzY29yZSI6MC43LCJjcmVhdGVkQXQiOiIyMDI2LTA4LTA3VDAwOjAwOjAwLjAwMDAwMFoiLCJyZWNvbW1lbmRhdGlvbklkIjoicmVjb21tZW5kYXRpb24tMSJ9").set({ Cookie: operator.cookie }).expect(400);
    expect(port.listReview).toHaveBeenCalledOnce();
  });

  test("maps non-active or missing detail to 404 and port failures to 503", async () => {
    const operator = await browserSession("operator", "operator");
    port.getReview.mockResolvedValueOnce(null);
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review/recommendation-1").set({ Cookie: operator.cookie, "x-request-id": "review-not-found" }).expect(404, { code: "not_found", message: "Không tìm thấy tài nguyên yêu cầu.", requestId: "review-not-found" });
    port.listReview.mockRejectedValueOnce(new Error("adapter unavailable"));
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review").set({ Cookie: operator.cookie }).expect(503);
    port.getReview.mockRejectedValueOnce(new Error("adapter unavailable"));
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/review/recommendation-1").set({ Cookie: operator.cookie }).expect(503);
  });
});
