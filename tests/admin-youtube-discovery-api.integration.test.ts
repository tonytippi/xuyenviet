import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createPostgresApiIdentityRepository } from "@xuyenviet/database";
import type { AdminYoutubeDiscoveryPort } from "@xuyenviet/domain";
import { createApiModule } from "../apps/api/src/app.module";
import { csrfHash, csrfNonce } from "../apps/api/src/auth/browser-auth";
import { userRoles, users } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";
import { getTestDatabaseUrl } from "./helpers/env-file";

const browserAuth = { googleClientId: "client", googleClientSecret: "secret", callbackUrl: "https://api.xuyenviet.app/auth/google/callback", allowedOrigins: ["https://admin.xuyenviet.app"], allowedReturnUrls: ["https://admin.xuyenviet.app/"], sessionLookupKey: "b".repeat(32), csrfKey: "c".repeat(32), oauthTransactionProtectionKey: "d".repeat(32), cookieName: "__Host-xuyenviet-session" } as const;
const query = { id: "proposal-1", origin: "operator" as const, queryText: "Da Lat route", reason: "operator_request" as const, priority: 50, enabled: true, cadenceMinutes: 60, nextRunAt: "2026-08-07T00:00:00.000Z", pausedReason: null };
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
  port = { list: vi.fn().mockResolvedValue({ items: [query] }), create: vi.fn().mockResolvedValue(query), edit: vi.fn().mockResolvedValue(query), reprioritize: vi.fn().mockResolvedValue(query), pause: vi.fn().mockResolvedValue({ ...query, enabled: false, nextRunAt: null, pausedReason: "operator" }), resume: vi.fn().mockResolvedValue(query) };
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
});
