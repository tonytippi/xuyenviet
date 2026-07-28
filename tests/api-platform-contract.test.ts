import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { apiAudience } from "@xuyenviet/contracts";
import { createBffCredentialConfig, type BffCredentialConfig, type Jwk } from "@xuyenviet/config";
import type { ApiIdentityRepository, ConversationSummaryRepository, ReleaseSchemaVersionRepository } from "@xuyenviet/database";
import { createApiModule } from "../apps/api/src/app.module";
import { apiCompatibleSchemaVersion } from "../apps/api/src/release-schema";

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
  const identities: ApiIdentityRepository = { async getSession(sessionId) { return sessionId === "session-1" ? { userId: "user-1", expires: new Date(Date.now() + 60_000), authorizationVersion: 1 } : null; } };
  const summaries: ConversationSummaryRepository = { async listOwnedConversationSummaryRows(userId) { return rows[userId] ?? []; } };
  const versions: ReleaseSchemaVersionRepository = {
    async hasCompatibleSchemaVersion(version) { return ready && version === apiCompatibleSchemaVersion; },
    async recordSchemaVersion() {},
  };
  const ApiModule = createApiModule(config, identities, { conversationSummaries: summaries, schemaVersions: versions });
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
});

async function keySet(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  return { kid, key: asJwk(await exportJWK(publicKey), kid), privateKey: asJwk(await exportJWK(privateKey), kid) };
}

function asJwk(key: JsonWebKey, kid: string): Jwk {
  if (key.kty !== "EC" || key.crv !== "P-256") throw new Error("Expected EC key.");
  return { ...key, kty: "EC", crv: "P-256", kid };
}

async function tokenFor() {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: "session-1", roles: ["traveler"], rv: 1, jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: "ES256", kid: active.kid }).setSubject("user-1").setIssuer("xuyenviet-web-bff").setAudience(apiAudience)
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 60)
    .sign(await importJWK(active.privateKey, "ES256"));
}
