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
const declineTripCreationRecommendation = vi.fn();
const choosePrivateTripRecommendation = vi.fn();
const continueInTrip = vi.fn();
const saveAnswerUsefulnessFeedback = vi.fn();
const listTripProjects = vi.fn();

beforeEach(async () => {
  await resetTestDatabase();
  loadRecommendations.mockReset().mockResolvedValue({ tripCreationRecommendation: { kind: "none" }, tripContextRecommendation: { kind: "none" } });
  acceptTripCreationRecommendation.mockReset().mockResolvedValue({ success: true, destination: { tripProjectId: "project-1", conversationId: "conversation-1" } });
  declineTripCreationRecommendation.mockReset().mockResolvedValue({ success: true });
  choosePrivateTripRecommendation.mockReset().mockResolvedValue({ success: true });
  continueInTrip.mockReset().mockResolvedValue({ success: true, destination: { tripProjectId: "project-1", conversationId: "conversation-1" } });
  saveAnswerUsefulnessFeedback.mockReset().mockResolvedValue({ success: true, feedback: { rating: "useful", comment: null, updatedAt: "2026-08-05T00:00:00.000Z" } });
  listTripProjects.mockReset().mockResolvedValue([]);
  const commands: Pick<TravelerCommandPort, "acceptTripCreationRecommendation" | "declineTripCreationRecommendation" | "choosePrivateTripRecommendation" | "continueInTrip" | "saveAnswerUsefulnessFeedback"> = { acceptTripCreationRecommendation, declineTripCreationRecommendation, choosePrivateTripRecommendation, continueInTrip, saveAnswerUsefulnessFeedback };
  const identities = createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey);
  const ApiModule = createApiModule(identities, {
    conversationSummaries: { async listOwnedConversationSummaryRows() { return []; } },
    tripRecommendations: { loadOwnedTripRecommendations: loadRecommendations },
    tripProjectSidebarReads: { listOwnedTripProjectSidebarSummaries: listTripProjects },
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
  test("uses the authenticated principal for canonical Trip Project sidebar rows", async () => {
    const traveler = await travelerSession();
    listTripProjects.mockResolvedValueOnce([{ id: "project-1", title: "Hè miền Trung", conversationId: "conversation-1", updatedAt: "2026-08-05T00:00:00.000Z" }]);
    await request(app.getHttpServer()).get("/v1/conversations/trip-projects").set({ Cookie: traveler.cookie, Origin: "https://web.xuyenviet.vn" }).expect(200).expect({ projects: [{ id: "project-1", title: "Hè miền Trung", conversationId: "conversation-1", updatedAt: "2026-08-05T00:00:00.000Z" }] });
    expect(listTripProjects).toHaveBeenCalledWith("traveler");
  });

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

  test("strictly admits decline, private, and continue decisions using only the authenticated principal", async () => {
    const traveler = await travelerSession();
    const headers = { Cookie: traveler.cookie, Origin: "https://web.xuyenviet.vn", "x-xuyenviet-csrf": traveler.csrf };
    for (const endpoint of ["/v1/trip-recommendations/decline-creation", "/v1/trip-recommendations/private"]) {
      await request(app.getHttpServer()).post(endpoint).set(headers).send({ decisionId: "decision-1", userId: "forged" }).expect(400);
      await request(app.getHttpServer()).post(endpoint).set(headers).send({ decisionId: "decision-1" }).expect(201).expect({ success: true });
    }
    await request(app.getHttpServer()).post("/v1/trip-recommendations/continue").set(headers).send({ decisionId: "decision-1", tripProjectId: "project-1", title: "Injected" }).expect(400);
    await request(app.getHttpServer()).post("/v1/trip-recommendations/continue").set(headers).send({ decisionId: "decision-1", tripProjectId: "project-1" }).expect(201).expect({ success: true, destination: { tripProjectId: "project-1", conversationId: "conversation-1" } });
    expect(declineTripCreationRecommendation).toHaveBeenCalledWith("traveler", { decisionId: "decision-1" });
    expect(choosePrivateTripRecommendation).toHaveBeenCalledWith("traveler", { decisionId: "decision-1" });
    expect(continueInTrip).toHaveBeenCalledWith("traveler", { decisionId: "decision-1", tripProjectId: "project-1" });
  });

  test("rejects unauthenticated, CSRF-invalid, and forged feedback before the command port", async () => {
    const endpoint = "/v1/answer-usefulness-feedback";
    await request(app.getHttpServer()).post(endpoint).send({ assistantMessageId: "message-1", rating: "useful" }).expect(401);
    const traveler = await travelerSession();
    await request(app.getHttpServer()).post(endpoint).set({ Cookie: traveler.cookie, Origin: "https://web.xuyenviet.vn" }).send({ assistantMessageId: "message-1", rating: "useful" }).expect(403);
    const freshTraveler = await travelerSession("traveler-invalid");
    await request(app.getHttpServer()).post(endpoint).set({ Cookie: freshTraveler.cookie, Origin: "https://web.xuyenviet.vn", "x-xuyenviet-csrf": freshTraveler.csrf }).send({ assistantMessageId: "message-1", rating: "bad", userId: "forged" }).expect(400);
    expect(saveAnswerUsefulnessFeedback).not.toHaveBeenCalled();
  });

  test("strictly admits feedback with the authenticated principal and returns safe command results", async () => {
    const traveler = await travelerSession();
    const endpoint = "/v1/answer-usefulness-feedback";
    const headers = { Cookie: traveler.cookie, Origin: "https://web.xuyenviet.vn", "x-xuyenviet-csrf": traveler.csrf };

    for (const input of [
      { assistantMessageId: "message-1", rating: "useful", conversationId: "forged" },
      { assistantMessageId: "message-1", rating: "useful", unexpected: true },
      { assistantMessageId: "message-1", rating: "not_useful", comment: 42 },
    ]) await request(app.getHttpServer()).post(endpoint).set(headers).send(input).expect(400);
    expect(saveAnswerUsefulnessFeedback).not.toHaveBeenCalled();

    saveAnswerUsefulnessFeedback.mockResolvedValueOnce({ success: false, reason: "not_found" });
    await request(app.getHttpServer()).post(endpoint).set(headers).send({ assistantMessageId: "message-1", rating: "useful" }).expect(201).expect({ success: false, reason: "not_found" });
    expect(saveAnswerUsefulnessFeedback).toHaveBeenLastCalledWith("traveler", { assistantMessageId: "message-1", rating: "useful" });

    saveAnswerUsefulnessFeedback.mockResolvedValueOnce({ success: false, reason: "not_found" });
    await request(app.getHttpServer()).post(endpoint).set(headers).send({ assistantMessageId: "message-2", rating: "useful" }).expect(201).expect({ success: false, reason: "not_found" });

    await request(app.getHttpServer()).post(endpoint).set(headers).send({ assistantMessageId: "message-1", rating: "not_useful", comment: "Cần rõ hơn" }).expect(201);
    expect(saveAnswerUsefulnessFeedback).toHaveBeenLastCalledWith("traveler", { assistantMessageId: "message-1", rating: "not_useful", comment: "Cần rõ hơn" });
  });
});
