import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createPostgresApiIdentityRepository, type BrowserIdentityRepository } from "@xuyenviet/database";
import { YoutubeDiscoveryMissionCursorValidationError, YoutubeDiscoveryReviewCursorValidationError, type AdminYoutubeDiscoveryPort } from "@xuyenviet/domain";
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
let port: Record<string, ReturnType<typeof vi.fn>>;
let identities: BrowserIdentityRepository;

async function browserSession(userId: string, role: "operator" | "traveler") {
  const sessionId = `${userId[0]}${"s".repeat(63)}`;
  const csrf = csrfNonce(browserAuth, sessionId);
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
  await testDb.insert(userRoles).values({ userId, role });
  await identities.createBrowserSession(userId, sessionId, csrfHash(browserAuth, sessionId, csrf), 1, new Date(Date.now() + 60_000));
  return { cookie: `${browserAuth.cookieName}=${sessionId}`, csrf };
}

beforeEach(async () => {
  await resetTestDatabase();
  port = { list: vi.fn().mockResolvedValue({ items: [query] }), listReview: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), getReview: vi.fn().mockResolvedValue(null), acceptReview: vi.fn().mockResolvedValue({ outcome: "submitted" }), deferReview: vi.fn().mockResolvedValue({ outcome: "deferred" }), skipReview: vi.fn().mockResolvedValue({ outcome: "skipped" }), create: vi.fn().mockResolvedValue(query), edit: vi.fn().mockResolvedValue(query), reprioritize: vi.fn().mockResolvedValue(query), pause: vi.fn().mockResolvedValue({ ...query, enabled: false, nextRunAt: null, pausedReason: "operator" }), resume: vi.fn().mockResolvedValue(query), listActionRequired: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), listMissionCoverage: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), listMissionQueries: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), listMissionCandidates: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), missionFunnel: vi.fn().mockResolvedValue({ asOf: "2026-08-07T00:00:00.000Z", discovered: 0, enriched: 0, triaged: 0, recommended: 0, pendingReview: 0, accepted: 0, deferred: 0, skipped: 0 }), getMissionDetail: vi.fn().mockResolvedValue(null), healthOverview: vi.fn().mockResolvedValue({ asOf: "2026-08-07T00:00:00.000Z", lastUpdatedAt: null, planning: { state: "no_run", at: null, lastUpdatedAt: null, nextRunAt: null, retryCount: null, category: "unavailable", freshness: "unavailable" }, querySchedule: { enabled: null, cadenceMinutes: null, nextRunAt: null, lastUpdatedAt: null, freshness: "unavailable" }, latestQueryRun: { state: "no_run", at: null, lastUpdatedAt: null, nextRunAt: null, retryCount: null, category: "unavailable", freshness: "unavailable" }, throughput: { windowHours: 24, discovered: 0, enriched: 0, triaged: 0, recommended: 0, lastUpdatedAt: null }, backlog: { pending: 0, deferred: 0, oldestDeferredAt: null, deferredAge: "unavailable", lastUpdatedAt: null }, incidents: [], usage: { availability: "missing", requests: 0, totalTokens: null, costMicros: null, lastUpdatedAt: null, freshness: "unavailable" } }), getHealthIncident: vi.fn().mockResolvedValue(null) };
  port.listBrowse = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
  port.setEnabled = vi.fn().mockResolvedValue({ enabled: false, version: 2, createdAt: "2026-08-07T00:00:00.000Z", changed: true });
  port.healthOverview.mockResolvedValue({ asOf: "2026-08-07T00:00:00.000Z", lastUpdatedAt: null, policy: { enabled: null }, planning: { state: "no_run", at: null, lastUpdatedAt: null, nextRunAt: null, retryCount: null, category: "unavailable", freshness: "unavailable" }, querySchedule: { enabled: null, cadenceMinutes: null, nextRunAt: null, lastUpdatedAt: null, freshness: "unavailable" }, latestQueryRun: { state: "no_run", at: null, lastUpdatedAt: null, nextRunAt: null, retryCount: null, category: "unavailable", freshness: "unavailable" }, pausedRuns: [], throughput: { windowHours: 24, discovered: 0, enriched: 0, triaged: 0, recommended: 0, lastUpdatedAt: null, freshness: "unavailable" }, backlog: { pending: 0, deferred: 0, candidateQueued: 0, candidateRetrying: 0, candidateRunning: 0, oldestDeferredAt: null, deferredAge: "unavailable", lastUpdatedAt: null }, incidents: [], usage: { availability: "missing", requests: 0, totalTokens: null, costMicros: null, lastUpdatedAt: null, freshness: "unavailable" } });
  identities = createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey);
  const ApiModule = createApiModule(identities, { conversationSummaries: { async listOwnedConversationSummaryRows() { return []; } }, browserAuth, adminYoutubeDiscovery: port as unknown as AdminYoutubeDiscoveryPort });
  @Module({ imports: [ApiModule] }) class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.init();
});

afterEach(async () => { await app.close(); await identities.close(); });

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

  test("admits a strict protected read-only browse endpoint", async () => {
    const operator = await browserSession("operator", "operator");
    const item = { recommendationId: "recommendation-1", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", title: "Da Lat route", channelName: "Route channel", publishedAt: "2026-08-07T00:00:00.000Z", durationSeconds: 120, recommendation: "skip", reason: "below_defer_band", score: 0.2, factors: [], penalties: [], signals: [], createdAt: "2026-08-07T00:00:00.000Z" };
    port.listBrowse.mockResolvedValueOnce({ items: [item], nextCursor: null });
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/browse?filter=skip").set({ Cookie: operator.cookie }).expect(200, { items: [item], nextCursor: null });
    expect(port.listBrowse).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator" }), "skip", null);
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/browse?filter=unknown").set({ Cookie: operator.cookie }).expect(400);
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/browse?cursor=ydr2.bad").set({ Cookie: operator.cookie }).expect(400);
  });

  test("rejects browse pages that contradict the requested filter", async () => {
    const operator = await browserSession("operator", "operator");
    const item = { recommendationId: "recommendation-1", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", title: "Da Lat route", channelName: "Route channel", publishedAt: "2026-08-07T00:00:00.000Z", durationSeconds: 120, recommendation: "defer", reason: "between_defer_and_consider_band", score: 0.5, factors: [], penalties: [], signals: [], createdAt: "2026-08-07T00:00:00.000Z" };
    port.listBrowse.mockResolvedValueOnce({ items: [item], nextCursor: null });
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/browse?filter=skip").set({ Cookie: operator.cookie }).expect(503);
    port.listBrowse.mockResolvedValueOnce({ items: [], nextCursor: "ydb1.eyJ2ZXJzaW9uIjoxLCJmaWx0ZXIiOiJkZWZlciIsImNyZWF0ZWRBdCI6IjIwMjYtMDgtMDdUMDA6MDA6MDAuMDAwMDAxWiIsInJlY29tbWVuZGF0aW9uSWQiOiJyZWNvbW1lbmRhdGlvbi0xIn0" });
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/browse?filter=skip").set({ Cookie: operator.cookie }).expect(503);
  });

  test("admits the protected action-required queue and rejects malformed cursors before admission", async () => {
    const operator = await browserSession("operator", "operator");
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/action-required").set({ Cookie: operator.cookie }).expect(200, { items: [], nextCursor: null });
    expect(port.listActionRequired).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator" }), null);
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/action-required?cursor=bad").set({ Cookie: operator.cookie }).expect(400).expect(({ body }) => expect(body).toMatchObject({ code: "validation_error" }));
    expect(port.listActionRequired).toHaveBeenCalledOnce();
  });

  test("denies anonymous and traveler action-required reads before port admission", async () => {
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/action-required").expect(401);
    const traveler = await browserSession("traveler", "traveler");
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/action-required").set({ Cookie: traveler.cookie }).expect(403);
    expect(port.listActionRequired).not.toHaveBeenCalled();
  });

  test("admits strict protected Health reads and fails closed for malformed, missing, and unsafe details", async () => {
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/health").expect(401);
    expect(port.healthOverview).not.toHaveBeenCalled();
    const operator = await browserSession("operator", "operator");
    const groupId = "123e4567-e89b-12d3-a456-426614174000:provider_rate_limited";
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/health").set({ Cookie: operator.cookie }).expect(200);
    expect(port.healthOverview).toHaveBeenCalledOnce();
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/health?unsafe=yes").set({ Cookie: operator.cookie }).expect(400);
    await request(app.getHttpServer()).get(`/v1/admin/knowledge/youtube-discovery/health/${groupId}`).set({ Cookie: operator.cookie, "x-request-id": "health-not-found" }).expect(404, { code: "not_found", message: "Không tìm thấy tài nguyên yêu cầu.", requestId: "health-not-found" });
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/health/bad").set({ Cookie: operator.cookie, "x-request-id": "malformed-health-id" }).expect(404, { code: "not_found", message: "Không tìm thấy tài nguyên yêu cầu.", requestId: "malformed-health-id" });
    expect(port.getHealthIncident).toHaveBeenCalledOnce();
    port.healthOverview.mockResolvedValueOnce({ unsafe: true });
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/health").set({ Cookie: operator.cookie }).expect(503);
    port.getHealthIncident.mockRejectedValueOnce(new Error("adapter unavailable"));
    await request(app.getHttpServer()).get(`/v1/admin/knowledge/youtube-discovery/health/${groupId}`).set({ Cookie: operator.cookie }).expect(503);
  });

  test("admits separate guarded Mission endpoints and rejects extra query keys before port admission", async () => {
    const operator = await browserSession("operator", "operator");
    const coverage = { actionId: "mission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", priority: 1, createdAt: "2026-08-07T00:00:00.000Z", corridor: null, location: null, routeSegment: null, taxonomy: null, freshness: "fresh" as const, conflict: "none" as const, demand: "unavailable" as const, seasonalContext: "unavailable" as const };
    const missionQuery = { ...query, origin: "system" as const, reason: "coverage_gap" as const };
    const candidate = { candidateId: "candidate-1", actionId: coverage.actionId, priority: 1, rank: 0, rankedAt: coverage.createdAt, rankingState: "recommended" as const, recommendationId: "recommendation-1", recommendation: "consider" as const, candidateState: "pending" as const, reviewAvailable: true };
    port.listMissionCoverage.mockResolvedValueOnce({ items: [coverage], nextCursor: null });
    port.listMissionQueries.mockResolvedValueOnce({ items: [missionQuery], nextCursor: null });
    port.listMissionCandidates.mockResolvedValueOnce({ items: [candidate], nextCursor: null });
    port.getMissionDetail.mockResolvedValueOnce({ coverage, query: missionQuery, latestRun: { state: "unavailable", createdAt: null, retryCount: null, terminalCategory: "unavailable" }, candidates: { items: [candidate], nextCursor: null } });
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/mission/coverage").set({ Cookie: operator.cookie }).expect(200, { items: [coverage], nextCursor: null });
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/mission/queries").set({ Cookie: operator.cookie }).expect(200, { items: [missionQuery], nextCursor: null });
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/mission/candidates").set({ Cookie: operator.cookie }).expect(200, { items: [candidate], nextCursor: null });
    await request(app.getHttpServer()).get(`/v1/admin/knowledge/youtube-discovery/mission/${coverage.actionId}`).set({ Cookie: operator.cookie }).expect(200);
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/mission/coverage?unsafe=yes").set({ Cookie: operator.cookie }).expect(400);
    await request(app.getHttpServer()).get(`/v1/admin/knowledge/youtube-discovery/mission/${coverage.actionId}?cursor=x`).set({ Cookie: operator.cookie }).expect(400);
    expect(port.listMissionCoverage).toHaveBeenCalledOnce();
    await request(app.getHttpServer()).get("/v1/admin/knowledge/youtube-discovery/mission/funnel").expect(401);
    expect(port.missionFunnel).not.toHaveBeenCalled();
  });

  test("maps stale Coverage and Queries cursors to validation failures", async () => {
    const operator = await browserSession("operator", "operator");
    port.listMissionCoverage.mockRejectedValueOnce(new YoutubeDiscoveryMissionCursorValidationError("Invalid YouTube Discovery Mission cursor."));
    port.listMissionQueries.mockRejectedValueOnce(new YoutubeDiscoveryMissionCursorValidationError("Invalid YouTube Discovery Mission cursor."));
    const coverageCursor = "ydmc1.eyJ2ZXJzaW9uIjoxLCJwcmlvcml0eSI6MSwiY3JlYXRlZEF0IjoiMjAyNi0wOC0wN1QwMDowMDowMC4wMDBaIiwiYWN0aW9uSWQiOiJtaXNzaW9uLWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhIn0";
    const queryCursor = "ydmq1.eyJ2ZXJzaW9uIjoxLCJwcmlvcml0eSI6NTAsImNyZWF0ZWRBdCI6IjIwMjYtMDgtMDdUMDA6MDA6MDAuMDAwWiIsImlkIjoicHJvcG9zYWwtMSJ9";
    await request(app.getHttpServer()).get(`/v1/admin/knowledge/youtube-discovery/mission/coverage?cursor=${coverageCursor}`).set({ Cookie: operator.cookie }).expect(400).expect(({ body }) => expect(body).toMatchObject({ code: "validation_error" }));
    await request(app.getHttpServer()).get(`/v1/admin/knowledge/youtube-discovery/mission/queries?cursor=${queryCursor}`).set({ Cookie: operator.cookie }).expect(400).expect(({ body }) => expect(body).toMatchObject({ code: "validation_error" }));
  });

  test("admits only an exact CSRF-protected Accept command and returns its closed outcome", async () => {
    const operator = await browserSession("operator", "operator");
    const headers = { Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf };
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/recommendation-1/accept").set(headers).send({}).expect(201, { outcome: "submitted" });
    expect(port.acceptReview).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator", email: "operator@example.com" }), "recommendation-1");
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/recommendation-1/accept").set(headers).send({ canonicalUrl: "https://unsafe.example" }).expect(400);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/recommendation-1/accept").set({ Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": "invalid" }).send({}).expect(403);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/review/recommendation-1/accept").set({ Cookie: operator.cookie, Origin: "https://unsafe.example", "x-xuyenviet-csrf": operator.csrf }).send({}).expect(403);
  });

  test("admits only exact CSRF-protected operator enablement commands", async () => {
    const traveler = await browserSession("traveler", "traveler");
    const operator = await browserSession("operator", "operator");
    const headers = { Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf };

    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/enablement").send({ enabled: false }).expect(401);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/enablement").set({ Cookie: traveler.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": traveler.csrf }).send({ enabled: false }).expect(403);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/enablement").set(headers).send({ enabled: "false" }).expect(400);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/enablement").set({ ...headers, "x-xuyenviet-csrf": "invalid" }).send({ enabled: false }).expect(403);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/enablement").set({ ...headers, Origin: "https://unsafe.example" }).send({ enabled: false }).expect(403);
    await request(app.getHttpServer()).post("/v1/admin/knowledge/youtube-discovery/enablement").set(headers).send({ enabled: false }).expect(201, { enabled: false, version: 2, createdAt: "2026-08-07T00:00:00.000Z", changed: true });
    expect(port.setEnabled).toHaveBeenCalledOnce();
    expect(port.setEnabled).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator", email: "operator@example.com" }), false);
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
