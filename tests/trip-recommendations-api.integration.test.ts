import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createPostgresApiIdentityRepository } from "@xuyenviet/database";
import type { TravelerCommandPort } from "@xuyenviet/domain";
import { createApiModule } from "../apps/api/src/app.module";
import { csrfHash, csrfNonce } from "../apps/api/src/auth/browser-auth";
import { getTestDatabaseUrl } from "./helpers/env-file";
import { resetTestDatabase, testDb } from "./helpers/db";
import { userRoles, users } from "@/db/schema";

const browserAuth = { googleClientId: "client", googleClientSecret: "secret", callbackUrl: "https://api.xuyenviet.app/auth/google/callback", allowedOrigins: ["https://web.xuyenviet.vn"], allowedReturnUrls: ["https://web.xuyenviet.vn/trips"], sessionLookupKey: "b".repeat(32), csrfKey: "c".repeat(32), oauthTransactionProtectionKey: "d".repeat(32), cookieName: "__Host-xuyenviet-session" } as const;
let app: INestApplication;
const loadRecommendations = vi.fn();
const acceptTripCreationRecommendation = vi.fn();

beforeEach(async () => {
  await resetTestDatabase();
  loadRecommendations.mockReset().mockResolvedValue({ tripCreationRecommendation: { kind: "none" }, tripContextRecommendation: { kind: "none" } });
  acceptTripCreationRecommendation.mockReset().mockResolvedValue({ success: true, destination: { tripProjectId: "project-1", conversationId: "conversation-1" } });
  const commands: Pick<TravelerCommandPort, "acceptTripCreationRecommendation"> = { acceptTripCreationRecommendation };
  const identities = createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey);
  const ApiModule = createApiModule(identities, {
    conversationSummaries: { async listOwnedConversationSummaryRows() { return []; } },
    tripRecommendations: { loadOwnedTripRecommendations: loadRecommendations },
    travelerCommands: commands as TravelerCommandPort,
    schemaVersions: { async hasCompatibleSchemaVersion() { return true; }, async recordSchemaVersion() {} },
    browserAuth,
  });
  @Module({ imports: [ApiModule] }) class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.init();
});

afterEach(async () => { await app.close(); });

async function travelerSession(userId = "traveler") {
  const sessionId = `${userId}${"s".repeat(64)}`.slice(0, 64);
  const csrf = csrfNonce(browserAuth, sessionId);
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
  await testDb.insert(userRoles).values({ userId, role: "traveler" });
  await createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey).createBrowserSession(userId, sessionId, csrfHash(browserAuth, sessionId, csrf), 1, new Date(Date.now() + 60_000));
  return { cookie: `${browserAuth.cookieName}=${sessionId}`, csrf };
}

describe("trip recommendation direct API", () => {
  test("uses the authenticated principal for the owner-scoped projection", async () => {
    const traveler = await travelerSession();
    loadRecommendations.mockResolvedValueOnce({ tripCreationRecommendation: { kind: "clarify", question: "Bạn dự định đi đâu?", actions: ["private_answer"] }, tripContextRecommendation: { kind: "none" } });
    await request(app.getHttpServer()).get("/v1/conversations/conversation-1/trip-recommendation").set({ Cookie: traveler.cookie, Origin: "https://web.xuyenviet.vn" }).expect(200).expect({ tripCreationRecommendation: { kind: "clarify", question: "Bạn dự định đi đâu?", actions: ["private_answer"] }, tripContextRecommendation: { kind: "none" } });
    expect(loadRecommendations).toHaveBeenCalledWith("traveler", "conversation-1");
  });

  test("enforces browser CSRF and validates the accepted-creation header before invoking the port", async () => {
    const traveler = await travelerSession();
    const endpoint = "/v1/trip-recommendations/accept-creation";
    await request(app.getHttpServer()).post(endpoint).set({ Cookie: traveler.cookie, Origin: "https://web.xuyenviet.vn" }).send({ decisionId: "decision-1" }).expect(403);
    await request(app.getHttpServer()).post(endpoint).set({ Cookie: traveler.cookie, Origin: "https://web.xuyenviet.vn", "x-xuyenviet-csrf": traveler.csrf }).send({ decisionId: "decision-1" }).expect(400);
    await request(app.getHttpServer()).post(endpoint).set({ Cookie: traveler.cookie, Origin: "https://web.xuyenviet.vn", "x-xuyenviet-csrf": traveler.csrf, "idempotency-key": "short" }).send({ decisionId: "decision-1" }).expect(400);
    expect(acceptTripCreationRecommendation).not.toHaveBeenCalled();
    const accepted = await request(app.getHttpServer()).post(endpoint).set({ Cookie: traveler.cookie, Origin: "https://web.xuyenviet.vn", "x-xuyenviet-csrf": traveler.csrf, "idempotency-key": "a".repeat(16) }).send({ decisionId: "decision-1" });
    expect(accepted.status).toBe(201);
    expect(accepted.body).toEqual({ success: true, destination: { tripProjectId: "project-1", conversationId: "conversation-1" } });
    expect(acceptTripCreationRecommendation).toHaveBeenCalledWith("traveler", { decisionId: "decision-1", idempotencyKey: "a".repeat(16) });
  });
});
