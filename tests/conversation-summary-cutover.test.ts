import { describe, expect, test, vi } from "vitest";

import { loadOwnedConversationSummaries } from "@/features/chat-trips/conversation-summary-loader";
import { listOwnedConversationSummariesFromApi } from "@/features/chat-trips/conversation-summary-bff";
import { parseConversationSummaryListResponse } from "@xuyenviet/contracts";

describe("conversation summary API cutover", () => {
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
});
