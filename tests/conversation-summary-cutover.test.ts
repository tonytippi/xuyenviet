import { beforeEach, describe, expect, test, vi } from "vitest";
import { conversations, messages, users } from "@/db/schema";

import { loadOwnedConversationSummaries } from "@/features/chat-trips/conversation-summary-loader";
import { listOwnedConversationSummariesFromApi } from "@/features/chat-trips/conversation-summary-bff";
import { parseConversationSummaryListResponse } from "@xuyenviet/contracts";

import { testDb } from "./helpers/db";

describe("conversation summary API cutover", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("defaults off, rejects non-boolean configuration, and selects exactly one owner", async () => {
    const legacy = vi.fn(async () => [{ id: "legacy", updatedAt: new Date("2026-07-01T00:00:00.000Z"), preview: "Hội thoại mới" }]);
    const api = vi.fn(async () => [{ id: "api", updatedAt: new Date("2026-07-02T00:00:00.000Z"), preview: "Từ API" }]);
    await expect(loadOwnedConversationSummaries({ legacy, api, environment: { XV_CONVERSATION_SUMMARY_API_ENABLED: "false" } })).resolves.toEqual([{ id: "legacy", updatedAt: new Date("2026-07-01T00:00:00.000Z"), preview: "Hội thoại mới" }]);
    expect(api).not.toHaveBeenCalled();

    legacy.mockClear();
    await expect(loadOwnedConversationSummaries({ legacy, api, environment: { XV_CONVERSATION_SUMMARY_API_ENABLED: "true" } })).resolves.toEqual([{ id: "api", updatedAt: new Date("2026-07-02T00:00:00.000Z"), preview: "Từ API" }]);
    expect(legacy).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledTimes(1);
    await expect(loadOwnedConversationSummaries({ legacy, environment: { XV_CONVERSATION_SUMMARY_API_ENABLED: "1" } })).rejects.toThrow("Invalid conversation-summary API cutover configuration.");
  });

  test("keeps internal credentials and API timestamp serialization out of the page contract", async () => {
    const callApi = vi.fn(async () => ({ summaries: [{ id: "conversation-1", updatedAt: "2026-07-02T03:04:05.000Z", preview: "Đi Huế" }] }));
    const result = await listOwnedConversationSummariesFromApi({
      config: () => ({ privateApiUrl: "https://api.railway.internal/", bffOrigin: "https://web.xuyenviet.vn", csrfSigningSecret: "a".repeat(32), csrfLifetimeSeconds: 300, requestTimeoutMs: 100 }),
      mintCredential: async () => "private-credential",
      callApi,
    });

    expect(result).toEqual([{ id: "conversation-1", updatedAt: new Date("2026-07-02T03:04:05.000Z"), preview: "Đi Huế" }]);
    expect(callApi).toHaveBeenCalledWith(expect.objectContaining({ path: "/v1/conversations/summaries", method: "GET", credential: "private-credential" }));
  });

  test("accepts only canonical UTC API timestamps", () => {
    for (const updatedAt of ["2026-07-02", "2026-07-02T03:04:05Z", "2026-07-02T03:04:05.000+07:00", "not-a-date"]) {
      expect(parseConversationSummaryListResponse({ summaries: [{ id: "conversation-1", updatedAt, preview: "Đi Huế" }] })).toBeNull();
    }
  });

  test("compares the real legacy and API adapters only in local or staging after the selected owner", async () => {
    const updatedAt = new Date("2026-07-02T03:04:05.000Z");
    await testDb.insert(users).values({ id: "comparison-user", email: "comparison@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ userId: "comparison-user", updatedAt }).returning({ id: conversations.id });
    await testDb.insert(messages).values({ conversationId: conversation.id, userId: "comparison-user", role: "user", content: "Đi Huế" });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "comparison-user", email: "comparison@example.com" }) }));
    const { listOwnedConversations } = await import("@/features/chat-trips/conversations");
    const legacyAdapter = vi.fn(listOwnedConversations);
    const apiCall = vi.fn(async () => ({ summaries: [{ id: conversation.id, updatedAt: updatedAt.toISOString(), preview: "Đi Huế" }] }));
    const apiAdapter = () => listOwnedConversationSummariesFromApi({
      config: () => ({ privateApiUrl: "https://api.railway.internal/", bffOrigin: "https://web.xuyenviet.vn", csrfSigningSecret: "a".repeat(32), csrfLifetimeSeconds: 300, requestTimeoutMs: 100 }),
      mintCredential: async () => "private-credential",
      callApi: apiCall,
    }, "comparison-request-1");
    const logger = { info: vi.fn(), warn: vi.fn() };

    await expect(loadOwnedConversationSummaries({
      legacy: legacyAdapter,
      api: apiAdapter,
      correlationId: "comparison-request-1",
      logger,
      environment: { APP_ENV: "staging", XV_CONVERSATION_SUMMARY_API_ENABLED: "true", XV_CONVERSATION_SUMMARY_SHADOW_COMPARE_ENABLED: "true" },
    })).resolves.toEqual([{ id: conversation.id, updatedAt, preview: "Đi Huế" }]);

    await vi.waitFor(() => expect(legacyAdapter).toHaveBeenCalledTimes(1));
    expect(apiCall).toHaveBeenCalledWith(expect.objectContaining({ correlationId: "comparison-request-1" }));
    await vi.waitFor(() => expect(logger.info).toHaveBeenCalledWith("conversation_summary_shadow_comparison", { correlationId: "comparison-request-1", equivalent: true }));

    legacyAdapter.mockClear();
    apiCall.mockClear();
    await loadOwnedConversationSummaries({
      legacy: legacyAdapter,
      api: apiAdapter,
      environment: { APP_ENV: "production", XV_CONVERSATION_SUMMARY_API_ENABLED: "true", XV_CONVERSATION_SUMMARY_SHADOW_COMPARE_ENABLED: "true" },
    });
    expect(legacyAdapter).not.toHaveBeenCalled();
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  test("fails closed for malformed shadow comparison configuration without changing the selected response", async () => {
    for (const [apiEnabled, expectedId] of [["false", "legacy"], ["true", "api"]] as const) {
      const legacy = vi.fn(async () => [{ id: "legacy", updatedAt: new Date("2026-07-01T00:00:00.000Z"), preview: "Hội thoại mới" }]);
      const api = vi.fn(async () => [{ id: "api", updatedAt: new Date("2026-07-02T00:00:00.000Z"), preview: "Từ API" }]);

      await expect(loadOwnedConversationSummaries({
        legacy,
        api,
        environment: {
          APP_ENV: "staging",
          XV_CONVERSATION_SUMMARY_API_ENABLED: apiEnabled,
          XV_CONVERSATION_SUMMARY_SHADOW_COMPARE_ENABLED: "enabled",
        },
      })).resolves.toMatchObject([{ id: expectedId }]);

      expect(legacy).toHaveBeenCalledTimes(apiEnabled === "false" ? 1 : 0);
      expect(api).toHaveBeenCalledTimes(apiEnabled === "true" ? 1 : 0);
    }
  });
});
