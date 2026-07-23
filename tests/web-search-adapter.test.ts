import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { conversations, messages, users, webSearchResults } from "@/db/schema";

import { testDb } from "./helpers/db";

async function seedTurn() {
  await testDb.insert(users).values({ id: "web-user", email: "web-user@example.com" });
  const [conversation] = await testDb.insert(conversations).values({ userId: "web-user" }).returning({ id: conversations.id });
  const [message] = await testDb.insert(messages).values({ userId: "web-user", conversationId: conversation.id, role: "user", content: "Giá vé hiện tại ở Huế?" }).returning({ id: messages.id });

  return { conversationId: conversation.id, userMessageId: message.id };
}

describe("web search adapter", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  test("normalizes Tavily results, prefers official/provider-looking sources, and filters low scores", async () => {
    const { searchWebForSourceBundle } = await import("@/features/retrieval/web-search");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      results: [
        { title: "Forum repost", url: "https://facebook.com/post", content: "Bài đăng cộng đồng", score: 0.95, raw_provider_payload: "must-not-leak" },
        { title: "Official Hue Ticket", url: "https://hue.gov.vn/ticket", content: "Giá vé chính thức", score: 0.8 },
        { title: "Hotel Provider", url: "https://hotel.example/rooms", content: "Còn phòng", score: 0.7 },
        { title: "Low quality official", url: "https://official.example/low", content: "Không đủ điểm", score: 0.1 },
        { title: "Unscored result", url: "https://example.com/unscored", content: "Không có tín hiệu xếp hạng" },
        { title: "Missing URL", content: "Không dùng được", score: 0.9 },
      ],
    }), { status: 200 }));

    const result = await searchWebForSourceBundle({
      query: "Giá vé hiện tại ở Huế?",
      triggerReasons: ["freshness_sensitive_request"],
      fetcher,
      now: () => new Date("2026-07-09T10:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results).toHaveLength(3);
    expect(result.results.map((item) => item.sourceType)).toEqual(["official", "provider", "community"]);
    expect(result.results.map((item) => item.confidence)).toEqual(["unverified", "unverified", "unverified"]);
    expect(result.results.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(JSON.stringify(result.results)).not.toContain("raw_provider_payload");
  });

  test("does not promote spoofed URL substrings or title text to official source type", async () => {
    const { normalizeTavilyResults } = await import("@/features/retrieval/web-search");

    const results = normalizeTavilyResults({
      payload: { results: [
        { title: "Official Hue Ticket", url: "https://scammer.example/path/.gov.vn/ticket", content: "Giá vé giả", score: 0.95 },
        { title: "Thông tin chính thức", url: "https://example.com/?next=https://hue.gov.vn", content: "Tin ngoài", score: 0.9 },
        { title: "Hue Portal", url: "https://hue.gov.vn/ticket", content: "Giá vé", score: 0.5 },
      ] },
      query: "Giá vé Huế",
      triggerReason: "freshness_sensitive_request",
      checkedAt: new Date("2026-07-09T10:00:00.000Z"),
    });

    expect(results.map((item) => item.sourceType)).toEqual(["official", "general", "general"]);
    expect(results[0]?.url).toBe("https://hue.gov.vn/ticket");
  });

  test("returns safe failure codes for provider errors, invalid responses, low quality, timeout, and missing key", async () => {
    const { searchWebForSourceBundle } = await import("@/features/retrieval/web-search");
    const previousKey = process.env.TAVILY_API_KEY;

    const providerFailure = await searchWebForSourceBundle({
      query: "Huế",
      triggerReasons: ["no_active_knowledge"],
      fetcher: vi.fn(async () => new Response("nope", { status: 503 })),
    });
    const invalidResponse = await searchWebForSourceBundle({
      query: "Huế",
      triggerReasons: ["no_active_knowledge"],
      fetcher: vi.fn(async () => new Response(JSON.stringify({ answer: "not results" }), { status: 200 })),
    });
    const invalidJson = await searchWebForSourceBundle({
      query: "Huế",
      triggerReasons: ["no_active_knowledge"],
      fetcher: vi.fn(async () => new Response("not-json", { status: 200 })),
    });
    const lowQuality = await searchWebForSourceBundle({
      query: "Huế",
      triggerReasons: ["no_active_knowledge"],
      fetcher: vi.fn(async () => new Response(JSON.stringify({ results: [{ title: "Low", url: "https://example.com", content: "x", score: 0.1 }] }), { status: 200 })),
    });
    const unscoredLowQuality = await searchWebForSourceBundle({
      query: "Huế",
      triggerReasons: ["no_active_knowledge"],
      fetcher: vi.fn(async () => new Response(JSON.stringify({ results: [{ title: "Unscored", url: "https://example.com", content: "x" }] }), { status: 200 })),
    });
    const timeout = await searchWebForSourceBundle({
      query: "Huế",
      triggerReasons: ["no_active_knowledge"],
      fetcher: vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      })),
    });
    const emptyQuery = await searchWebForSourceBundle({
      query: "Tên tôi là Nguyễn Văn A, email a@example.com, số 0912 345 678, con 6 tuổi.",
      triggerReasons: ["no_active_knowledge"],
      fetcher: vi.fn(),
    });
    const oversizedResponse = await searchWebForSourceBundle({
      query: "Huế",
      triggerReasons: ["no_active_knowledge"],
      fetcher: vi.fn(async () => new Response(JSON.stringify({ results: [{ title: "Huge", url: "https://example.com", content: "x".repeat(600_000), score: 0.8 }] }), { status: 200 })),
    });

    delete process.env.TAVILY_API_KEY;
    const missingKey = await searchWebForSourceBundle({ query: "Huế", triggerReasons: ["no_active_knowledge"] });
    if (previousKey) {
      process.env.TAVILY_API_KEY = previousKey;
    } else {
      delete process.env.TAVILY_API_KEY;
    }

    expect(providerFailure).toMatchObject({ ok: false, code: "provider_request_failed", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "provider_request_failed" } });
    expect(invalidResponse).toMatchObject({ ok: false, code: "invalid_provider_response", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "invalid_provider_response" } });
    expect(invalidJson).toMatchObject({ ok: false, code: "invalid_provider_response", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "invalid_provider_response" } });
    expect(lowQuality).toMatchObject({ ok: false, code: "low_quality_results", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "low_quality_results" } });
    expect(unscoredLowQuality).toMatchObject({ ok: false, code: "low_quality_results", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "low_quality_results" } });
    expect(timeout).toMatchObject({ ok: false, code: "provider_timeout", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "provider_timeout" } });
    expect(emptyQuery).toMatchObject({ ok: false, code: "empty_query", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "empty_query" } });
    expect(oversizedResponse).toMatchObject({ ok: false, code: "invalid_provider_response", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "invalid_provider_response" } });
    expect(missingKey).toMatchObject({ ok: false, code: "missing_api_key", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "missing_api_key" } });
    expect(providerFailure.attempt.latencyMs).toEqual(expect.any(Number));
  });

  test("passes caller abort signal to provider requests", async () => {
    const { searchWebForSourceBundle } = await import("@/features/retrieval/web-search");
    const abortController = new AbortController();
    const fetcher = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      abortController.abort();
    }));

    const result = await searchWebForSourceBundle({
      query: "Giá vé Huế hiện tại?",
      triggerReasons: ["freshness_sensitive_request"],
      fetcher,
      abortSignal: abortController.signal,
    });

    expect(result).toMatchObject({ ok: false, code: "client_aborted", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "client_aborted" } });
  });

  test("keeps provider timeout attribution when caller abort arrives after timeout", async () => {
    const { searchWebForSourceBundle } = await import("@/features/retrieval/web-search");
    process.env.TAVILY_API_KEY = "tvly-test";
    vi.useFakeTimers();
    const abortController = new AbortController();
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }));

    const pending = searchWebForSourceBundle({
      query: "Giá vé Huế hiện tại",
      triggerReasons: ["freshness_sensitive_request"],
      fetcher: fetcher as typeof fetch,
      abortSignal: abortController.signal,
    });

    let result;
    try {
      await vi.advanceTimersByTimeAsync(5_000);
      abortController.abort();
      result = await pending;
    } finally {
      vi.useRealTimers();
    }

    expect(result).toMatchObject({ ok: false, code: "provider_timeout", attempt: { provider: "tavily", mechanism: "search", status: "failure", errorCode: "provider_timeout" } });
  });

  test("minimizes personal details before sending query to provider", async () => {
    const { minimizeWebSearchQuery, searchWebForSourceBundle } = await import("@/features/retrieval/web-search");
    let requestBody = "";
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ results: [{ title: "Hue", url: "https://hue.gov.vn", content: "Thông tin", score: 0.8 }] }), { status: 200 });
    };
    const privateQuestion = "Tên tôi là Nguyễn Văn A, email a@example.com, số 0912 345 678, con 6 tuổi. Giá vé Huế hiện tại?";

    await searchWebForSourceBundle({ query: privateQuestion, triggerReasons: ["freshness_sensitive_request"], fetcher });

    const sentBody = JSON.parse(requestBody) as { query: string };
    expect(minimizeWebSearchQuery(privateQuestion)).not.toContain("a@example.com");
    expect(sentBody.query).not.toContain("Nguyễn Văn A");
    expect(sentBody.query).not.toContain("a@example.com");
    expect(sentBody.query).not.toContain("0912");
    expect(sentBody.query).not.toContain("6 tuổi");
    expect(sentBody.query).toContain("Giá vé Huế hiện tại");
  });

  test("drops overlong URLs instead of truncating invalid source URLs", async () => {
    const { normalizeTavilyResults } = await import("@/features/retrieval/web-search");

    const results = normalizeTavilyResults({
      payload: { results: [{ title: "Long URL", url: `https://example.com/${"a".repeat(2_100)}`, content: "Có nội dung", score: 0.8 }] },
      query: "Huế",
      triggerReason: "no_active_knowledge",
      checkedAt: new Date("2026-07-09T10:00:00.000Z"),
    });

    expect(results).toEqual([]);
  });

  test("captures normalized result rows idempotently linked to the traveler turn without raw provider payloads", async () => {
    const { conversationId, userMessageId } = await seedTurn();
    const { captureWebSearchResults, normalizeTavilyResults } = await import("@/features/retrieval/web-search");
    const results = normalizeTavilyResults({
      payload: { results: [{ title: "Official Hue Ticket", url: "https://hue.gov.vn/ticket", content: "Giá vé chính thức", score: 0.8, raw_payload: { secret: true } }] },
      query: "Giá vé hiện tại ở Huế?",
      triggerReason: "freshness_sensitive_request",
      checkedAt: new Date("2026-07-09T10:00:00.000Z"),
    });

    await captureWebSearchResults({ db: testDb, userId: "web-user", conversationId, userMessageId, results });
    await captureWebSearchResults({ db: testDb, userId: "web-user", conversationId, userMessageId, results });

    const rows = await testDb.select().from(webSearchResults).where(eq(webSearchResults.userMessageId, userMessageId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "web-user",
      conversationId,
      userMessageId,
      title: "Official Hue Ticket",
      url: "https://hue.gov.vn/ticket",
      provider: "tavily",
      sourceType: "official",
      confidence: "unverified",
      triggerReason: "freshness_sensitive_request",
      rank: 1,
    });
    expect(JSON.stringify(rows[0])).not.toContain("raw_payload");
  });

  test("rejects capture when the message is not a user turn", async () => {
    const { conversationId } = await seedTurn();
    const [assistantMessage] = await testDb.insert(messages).values({ userId: "web-user", conversationId, role: "assistant", content: "Trả lời" }).returning({ id: messages.id });
    const { captureWebSearchResults, normalizeTavilyResults } = await import("@/features/retrieval/web-search");
    const results = normalizeTavilyResults({
      payload: { results: [{ title: "Official Hue Ticket", url: "https://hue.gov.vn/ticket", content: "Giá vé chính thức", score: 0.8 }] },
      query: "Giá vé hiện tại ở Huế?",
      triggerReason: "freshness_sensitive_request",
      checkedAt: new Date("2026-07-09T10:00:00.000Z"),
    });

    await expect(captureWebSearchResults({ db: testDb, userId: "web-user", conversationId, userMessageId: assistantMessage.id, results })).rejects.toThrow("user message");
  });
});
