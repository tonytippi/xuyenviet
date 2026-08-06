import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createPostgresApiIdentityRepository } from "@xuyenviet/database";
import { KnowledgeDraftReviewPolicyError, type AdminKnowledgeReviewPort } from "@xuyenviet/domain";
import { createApiModule } from "../apps/api/src/app.module";
import { csrfHash, csrfNonce } from "../apps/api/src/auth/browser-auth";
import { userRoles, users } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";
import { getTestDatabaseUrl } from "./helpers/env-file";

const browserAuth = { googleClientId: "client", googleClientSecret: "secret", callbackUrl: "https://api.xuyenviet.app/auth/google/callback", allowedOrigins: ["https://admin.xuyenviet.app"], allowedReturnUrls: ["https://admin.xuyenviet.app/"], sessionLookupKey: "b".repeat(32), csrfKey: "c".repeat(32), oauthTransactionProtectionKey: "d".repeat(32), cookieName: "__Host-xuyenviet-session" } as const;
const recommendationId = "11111111-1111-4111-8111-111111111111";
const cardId = "22222222-2222-4222-8222-222222222222";
let app: INestApplication;
let resolveRecommendation: ReturnType<typeof vi.fn<AdminKnowledgeReviewPort["resolveRecommendation"]>>;

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
  resolveRecommendation = vi.fn<AdminKnowledgeReviewPort["resolveRecommendation"]>().mockResolvedValue({ status: "resolved", cardId });
  const review: AdminKnowledgeReviewPort = {
    listCards: vi.fn(), getCard: vi.fn(), listRecommendations: vi.fn(), getRecommendation: vi.fn(), resolveRecommendation: (...args) => resolveRecommendation(...args),
  };
  const identities = createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey);
  const ApiModule = createApiModule(identities, { conversationSummaries: { async listOwnedConversationSummaryRows() { return []; } }, browserAuth, adminKnowledgeReview: review });
  @Module({ imports: [ApiModule] }) class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.init();
});

afterEach(async () => { await app.close(); });

describe("admin knowledge review direct API", () => {
  test("rejects anonymous, traveler, invalid or missing CSRF, and malformed requests before lifecycle resolution", async () => {
    await request(app.getHttpServer()).post(`/v1/admin/knowledge/recommendations/${recommendationId}/resolve`).set("x-request-id", "knowledge-review-anonymous").send({ action: "verify" }).expect(401);
    const traveler = await browserSession("traveler", "traveler");
    await request(app.getHttpServer()).post(`/v1/admin/knowledge/recommendations/${recommendationId}/resolve`).set({ Cookie: traveler.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": traveler.csrf }).send({ action: "verify" }).expect(403);
    const operator = await browserSession("operator", "operator");
    await request(app.getHttpServer()).post(`/v1/admin/knowledge/recommendations/${recommendationId}/resolve`).set({ Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app" }).send({ action: "verify" }).expect(403);
    await request(app.getHttpServer()).post(`/v1/admin/knowledge/recommendations/${recommendationId}/resolve`).set({ Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": "invalid" }).send({ action: "verify" }).expect(403);
    await request(app.getHttpServer()).post(`/v1/admin/knowledge/recommendations/${recommendationId}/resolve`).set({ Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf }).send({ action: "verify", unexpected: true }).expect(400);
    expect(resolveRecommendation).not.toHaveBeenCalled();
  });

  test("admits only an authorized CSRF-protected browser session and delegates once", async () => {
    const operator = await browserSession("operator", "operator");
    const response = await request(app.getHttpServer()).post(`/v1/admin/knowledge/recommendations/${recommendationId}/resolve`).set({ Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf, "x-request-id": "knowledge-review-authorized" }).send({ action: "verify" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "resolved", cardId });
    expect(resolveRecommendation).toHaveBeenCalledWith(recommendationId, { action: "verify" }, expect.objectContaining({ userId: "operator", roles: ["operator"] }));
  });

  test("accepts a relation-resolution action through the explicit safe DTO", async () => {
    const operator = await browserSession("operator", "operator");
    const response = await request(app.getHttpServer()).post(`/v1/admin/knowledge/recommendations/${recommendationId}/resolve`).set({ Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf }).send({ action: "resolve_relation" });
    expect(response.status).toBe(200);
    expect(resolveRecommendation).toHaveBeenCalledWith(recommendationId, { action: "resolve_relation" }, expect.objectContaining({ userId: "operator", roles: ["operator"] }));
  });

  test("maps an admitted port policy rejection without a successful lifecycle result", async () => {
    resolveRecommendation.mockRejectedValueOnce(new KnowledgeDraftReviewPolicyError("rejected", "not_reviewable"));
    const operator = await browserSession("operator", "operator");
    await request(app.getHttpServer()).post(`/v1/admin/knowledge/recommendations/${recommendationId}/resolve`).set({ Cookie: operator.cookie, Origin: "https://admin.xuyenviet.app", "x-xuyenviet-csrf": operator.csrf }).send({ action: "verify" }).expect(400);
    expect(resolveRecommendation).toHaveBeenCalledOnce();
  });
});
