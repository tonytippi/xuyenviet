import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createPostgresApiIdentityRepository } from "@xuyenviet/database";
import { createApiModule } from "../apps/api/src/app.module";
import { csrfHash, csrfNonce } from "../apps/api/src/auth/browser-auth";
import { getTestDatabaseUrl } from "./helpers/env-file";
import { resetTestDatabase, testDb } from "./helpers/db";
import { userRoles, users } from "@/db/schema";

const browserAuth = { googleClientId: "client", googleClientSecret: "secret", callbackUrl: "https://api.xuyenviet.app/auth/google/callback", allowedOrigins: ["https://web.xuyenviet.vn", "https://admin.xuyenviet.app"], allowedReturnUrls: ["https://web.xuyenviet.vn/trips", "https://admin.xuyenviet.app/"], sessionLookupKey: "b".repeat(32), csrfKey: "c".repeat(32), oauthTransactionProtectionKey: "d".repeat(32), cookieName: "__Host-xuyenviet-session" } as const;
let app: INestApplication;

beforeEach(async () => {
  await resetTestDatabase();
  const identities = createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey);
  const ApiModule = createApiModule(identities, { conversationSummaries: { async listOwnedConversationSummaryRows() { return []; } }, browserAuth });
  @Module({ imports: [ApiModule] }) class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.init();
});

afterEach(async () => { await app.close(); });

describe("admin workspace direct browser admission", () => {
  test.each(["operator", "admin"])("admits %s via the Nest browser session and rejects bearer credentials", async (role) => {
    const sessionId = "s".repeat(64); const csrf = csrfNonce(browserAuth, sessionId);
    await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
    await testDb.insert(userRoles).values({ userId: "operator", role: role as "operator" | "admin" });
    const identities = createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey);
    await identities.createBrowserSession("operator", sessionId, csrfHash(browserAuth, sessionId, csrf), 1, new Date(Date.now() + 60_000));
    const cookie = `${browserAuth.cookieName}=${sessionId}`;
    await request(app.getHttpServer()).get("/v1/admin/workspace").set({ Cookie: cookie, Origin: "https://admin.xuyenviet.app" }).expect(200, { ready: true });
    await request(app.getHttpServer()).get("/auth/session").set({ Cookie: cookie, Origin: "https://admin.xuyenviet.app" }).expect(200, { account: { name: null, email: "operator@example.com" } });
    await request(app.getHttpServer()).get("/v1/admin/workspace").set("Authorization", "Bearer malformed-admin-bff").expect(401);
    const response = await request(app.getHttpServer()).get("/v1/admin/workspace").set({ Cookie: cookie, Authorization: "Bearer malformed-admin-bff", Origin: "https://admin.xuyenviet.app" }).expect(401);
    expect(response.body).toMatchObject({ code: "unauthorized", message: "Không được phép truy cập." });
  });

  test("rejects travelers, foreign origins, and missing CSRF for browser mutations", async () => {
    const sessionId = "t".repeat(64); const csrf = csrfNonce(browserAuth, sessionId);
    await testDb.insert(users).values({ id: "traveler", email: "traveler@example.com" });
    await testDb.insert(userRoles).values({ userId: "traveler", role: "traveler" });
    const identities = createPostgresApiIdentityRepository(getTestDatabaseUrl(), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey);
    await identities.createBrowserSession("traveler", sessionId, csrfHash(browserAuth, sessionId, csrf), 1, new Date(Date.now() + 60_000));
    const cookie = `${browserAuth.cookieName}=${sessionId}`;
    await request(app.getHttpServer()).get("/v1/admin/workspace").set({ Cookie: cookie, Origin: "https://admin.xuyenviet.app" }).expect(403);
    await request(app.getHttpServer()).get("/v1/admin/workspace").set({ Cookie: cookie, Origin: "https://foreign.example" }).expect(403);
    await request(app.getHttpServer()).get("/auth/csrf").set({ Cookie: cookie, Origin: "https://foreign.example" }).expect(403);
    await request(app.getHttpServer()).get("/auth/csrf").set("Cookie", cookie).expect(200);
  });
});
