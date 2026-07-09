import { describe, expect, test } from "vitest";

import { evaluateWebSearchFallbackQuality, type WebSearchQualityQuery } from "@/features/retrieval/web-search-quality";

const checkedAt = "2026-07-09T10:00:00.000Z";

describe("web search fallback quality evaluator", () => {
  test("scores Vietnamese corridor fixtures for required metadata and gaps", () => {
    const evaluation = evaluateWebSearchFallbackQuality({
      generatedAt: new Date(checkedAt),
      operational: operationalInput(),
      queries: [
        {
          id: "hanoi-hcmc-route",
          query: "lộ trình Hà Nội TP.HCM đường bộ mới nhất",
          expectedLanguage: "vi",
          candidates: [
            candidate({ title: "Cục Đường bộ Việt Nam - thông tin tuyến", url: "https://drvn.gov.vn/tuyen-ha-noi-tphcm", snippet: "Thông tin tuyến đường Hà Nội - TP.HCM", sourceType: "official", providerScore: 0.91, rank: 1 }),
            candidate({ title: "Kinh nghiệm lái xe xuyên Việt", url: "https://example.vn/kinh-nghiem", snippet: "Gợi ý chặng nghỉ", sourceType: "general", providerScore: 0.65, rank: 2, checkedAt: undefined }),
          ],
        },
        {
          id: "hue-ticket",
          query: "giá vé Đại Nội Huế hôm nay",
          expectedLanguage: "vi",
          candidates: [candidate({ title: "Trung tâm Bảo tồn Di tích Cố đô Huế", url: "https://hueworldheritage.org.vn/ve-tham-quan", snippet: "Giá vé tham quan Đại Nội Huế", sourceType: "provider", providerScore: 0.88, rank: 1 })],
        },
      ],
    });

    expect(evaluation.providerName).toBe("tavily");
    expect(evaluation.generatedAt).toBe(checkedAt);
    expect(evaluation.queries[0]).toMatchObject({
      resultCount: 2,
      usableVietnameseSourceCount: 2,
      officialOrProviderPreferred: true,
      topSourceType: "official",
      sourceTypeCounts: { official: 1, provider: 0, general: 1, community: 0 },
    });
    expect(evaluation.queries[0]?.metadata).toMatchObject({
      titleCount: 2,
      urlCount: 2,
      snippetOrContentCount: 2,
      checkedAtCount: 1,
      providerScoreCount: 2,
      missing: ["checked_at"],
    });
    expect(evaluation.queries[0]?.candidates[0]).toMatchObject({
      rank: 1,
      titleAvailable: true,
      urlAvailable: true,
      snippetOrContentAvailable: true,
      checkedAtAvailable: true,
      rankingSignalAvailable: true,
      usableSourceLanguage: true,
      sourceLanguage: "vi",
      sourceType: "official",
    });
    expect(evaluation.score).toBeGreaterThanOrEqual(80);
  });

  test("prefers official/provider candidates and flags community or spoofed sources", () => {
    const evaluation = evaluateWebSearchFallbackQuality({
      generatedAt: new Date(checkedAt),
      operational: operationalInput(),
      queries: [{
        id: "ferry-schedule",
        query: "lịch phà Cần Giờ Vũng Tàu",
        expectedLanguage: "vi",
        candidates: [
          candidate({ title: "Bài repost lịch phà chính thức", url: "https://facebook.com/groups/phuot/post/1", snippet: "Cộng đồng chia sẻ lịch phà", sourceType: "community", providerScore: 0.99, rank: 1 }),
          candidate({ title: "Nhà vận hành phà Cần Giờ", url: "https://ferry.example.vn/lich-pha", snippet: "Lịch vận hành phà", sourceType: "provider", providerScore: 0.72, rank: 2 }),
          candidate({ title: "Official schedule", url: "https://scammer.example/path/.gov.vn/lich", snippet: "Lịch không xác thực", sourceType: "general", providerScore: 0.7, rank: 3 }),
        ],
      }],
    });

    expect(evaluation.queries[0]?.officialOrProviderPreferred).toBe(false);
    expect(evaluation.queries[0]?.sourceSafetyFlags).toEqual(expect.arrayContaining([
      "community_promoted_to_top:1",
      "community_or_repost:1",
      "spoofed_official_claim:1",
      "spoofed_official_claim:3",
    ]));
    expect(evaluation.queries[0]?.notes).toContain("official_or_provider_available_but_not_preferred");
    expect(evaluation.queries[0]?.pass).toBe(false);
  });

  test("fails unsafe source flags even when metadata and preference otherwise pass", () => {
    const evaluation = evaluateWebSearchFallbackQuality({
      generatedAt: new Date(checkedAt),
      operational: operationalInput(),
      queries: [{
        id: "spoofed-provider",
        query: "lịch phà chính thức",
        expectedLanguage: "vi",
        candidates: [candidate({ title: "Official lịch phà Cần Giờ", url: "https://ferry.example.vn/official", snippet: "Lịch vận hành phà", sourceType: "provider", providerScore: 0.9, rank: 1 })],
      }],
    });

    expect(evaluation.queries[0]?.officialOrProviderPreferred).toBe(true);
    expect(evaluation.queries[0]?.sourceSafetyFlags).toContain("spoofed_official_claim:1");
    expect(evaluation.queries[0]?.score).toBeGreaterThanOrEqual(70);
    expect(evaluation.queries[0]?.pass).toBe(false);
    expect(evaluation.pass).toBe(false);
  });

  test("does not reorder unranked provider output before evaluating source preference", () => {
    const evaluation = evaluateWebSearchFallbackQuality({
      generatedAt: new Date(checkedAt),
      operational: operationalInput(),
      queries: [{
        id: "unranked-provider-order",
        query: "lịch phà Cần Giờ",
        expectedLanguage: "vi",
        candidates: [
          candidate({ title: "Bài repost lịch phà", url: "https://facebook.com/groups/phuot/post/1", snippet: "Cộng đồng chia sẻ lịch phà", sourceType: "community", rank: undefined, providerScore: 0.99 }),
          candidate({ title: "Nhà vận hành phà Cần Giờ", url: "https://ferry.example.vn/lich-pha", snippet: "Lịch vận hành phà", sourceType: "provider", rank: undefined, providerScore: 0.72 }),
        ],
      }],
    });

    expect(evaluation.queries[0]?.topSourceType).toBe("community");
    expect(evaluation.queries[0]?.officialOrProviderPreferred).toBe(false);
    expect(evaluation.queries[0]?.sourceSafetyFlags).toContain("community_promoted_to_top:1");
  });

  test("does not pass an empty validation run or failed query with otherwise strong candidates", () => {
    const empty = evaluateWebSearchFallbackQuality({ generatedAt: new Date(checkedAt), operational: operationalInput(), queries: [] });
    const failed = evaluateWebSearchFallbackQuality({
      generatedAt: new Date(checkedAt),
      operational: operationalInput(),
      queries: [{
        id: "failed-but-ranked",
        query: "giá vé Huế",
        expectedLanguage: "vi",
        failureCode: "provider_timeout",
        candidates: [candidate({ title: "Hue ticket official", url: "https://hue.gov.vn/ticket", snippet: "Gia ve Hue", sourceType: "official", providerScore: 0.9 })],
      }],
    });

    expect(empty.pass).toBe(false);
    expect(empty.score).toBe(0);
    expect(failed.queries[0]?.notes).toContain("safe_failure:provider_timeout");
    expect(failed.queries[0]?.pass).toBe(false);
    expect(failed.pass).toBe(false);
  });

  test("accepts rank as a ranking signal and counts unaccented Vietnamese place names", () => {
    const evaluation = evaluateWebSearchFallbackQuality({
      generatedAt: new Date(checkedAt),
      operational: operationalInput(),
      queries: [{
        id: "unaccented-place",
        query: "Da Nang Hue road condition",
        expectedLanguage: "vi",
        candidates: [candidate({ title: "Da Nang to Hue road condition", url: "https://drvn.gov.vn/da-nang-hue", snippet: "Vietnam road update", sourceType: "official", providerScore: undefined, rank: 1 })],
      }],
    });

    expect(evaluation.queries[0]?.usableVietnameseSourceCount).toBe(1);
    expect(evaluation.queries[0]?.metadata.providerScoreCount).toBe(1);
    expect(evaluation.queries[0]?.metadata.missing).not.toContain("provider_score_or_ranking_signal");
  });

  test("does not count invalid checked dates as available metadata", () => {
    const evaluation = evaluateWebSearchFallbackQuality({
      generatedAt: new Date(checkedAt),
      operational: operationalInput(),
      queries: [{
        id: "invalid-date",
        query: "giá vé Huế hôm nay",
        expectedLanguage: "vi",
        candidates: [candidate({ title: "Giá vé Huế", url: "https://hue.example.vn/ve", snippet: "Giá vé tham quan Huế", sourceType: "provider", checkedAt: "không rõ" })],
      }],
    });

    expect(evaluation.queries[0]?.metadata.checkedAtCount).toBe(0);
    expect(evaluation.queries[0]?.metadata.missing).toContain("checked_at");
    expect(evaluation.queries[0]?.candidates[0]?.checkedAtAvailable).toBe(false);
  });

  test("uses expectedLanguage for English and mixed validation fixtures", () => {
    const evaluation = evaluateWebSearchFallbackQuality({
      generatedAt: new Date(checkedAt),
      operational: operationalInput(),
      queries: [
        {
          id: "english-official",
          query: "Vietnam road condition official",
          expectedLanguage: "en",
          candidates: [candidate({ title: "Vietnam road condition update", url: "https://drvn.gov.vn/en/road", snippet: "Official road condition update", sourceType: "official", providerScore: 0.8 })],
        },
        {
          id: "mixed-provider",
          query: "Quy Nhon hotel availability",
          expectedLanguage: "mixed",
          candidates: [candidate({ title: "Quy Nhon hotel availability", url: "https://hotel.example.vn/rooms", snippet: "Room availability changes often", sourceType: "provider", providerScore: 0.8 })],
        },
      ],
    });

    expect(evaluation.queries.map((query) => query.usableVietnameseSourceCount)).toEqual([1, 1]);
  });

  test("documents provider failures, cost, limits, fallback behavior, and MVP recommendation", () => {
    const evaluation = evaluateWebSearchFallbackQuality({
      generatedAt: new Date(checkedAt),
      operational: operationalInput({ apiKeyConfigured: false, timeoutMs: 6_000 }),
      queries: [{
        id: "weather-road-condition",
        query: "thời tiết đèo Hải Vân tình trạng đường hôm nay",
        expectedLanguage: "vi",
        failureCode: "provider_timeout",
        candidates: [],
      }],
    });

    expect(evaluation.operationalRisks).toEqual(expect.arrayContaining([
      "missing_api_key_blocks_live_fallback",
      "timeout_may_delay_ai_answer",
      "pricing:Tavily free/paid limits must be monitored before production scale.",
      "rate_limit:Rate limits can reduce freshness coverage during peak travel planning use.",
      "failure_behavior:Runtime keeps warning-only fallback codes and does not block answer generation.",
    ]));
    expect(evaluation.queries[0]?.notes).toContain("safe_failure:provider_timeout");
    expect(evaluation.queries[0]?.pass).toBe(false);
    expect(evaluation.pass).toBe(false);
    expect(evaluation.recommendation).toContain("warning-only fallback");
  });

  test("keeps output provider-independent and web confidence unapproved", () => {
    const query: WebSearchQualityQuery = {
      id: "hotel-availability",
      query: "khách sạn Quy Nhơn còn phòng cuối tuần",
      expectedLanguage: "vi",
      candidates: [candidate({ title: "Khách sạn ven biển Quy Nhơn", url: "https://hotel.example.vn/rooms", snippet: "Tình trạng phòng có thể thay đổi", sourceType: "provider", providerScore: 0.82 })],
    };
    const evaluation = evaluateWebSearchFallbackQuality({ generatedAt: new Date(checkedAt), operational: operationalInput({ providerName: "future-provider" }), queries: [query] });
    const serialized = JSON.stringify(evaluation);

    expect(evaluation.providerName).toBe("future-provider");
    expect(serialized).not.toContain("raw_provider_payload");
    expect(serialized).not.toContain("approved");
    expect(serialized).not.toContain("tavily_api_key");
    expect(evaluation.recommendation).toContain("provider-independent source contracts");
  });
});

function operationalInput(overrides: Partial<Parameters<typeof evaluateWebSearchFallbackQuality>[0]["operational"]> = {}) {
  return {
    providerName: "tavily",
    apiKeyConfigured: true,
    timeoutMs: 3_000,
    pricingNote: "Tavily free/paid limits must be monitored before production scale.",
    rateLimitNote: "Rate limits can reduce freshness coverage during peak travel planning use.",
    failureBehavior: "Runtime keeps warning-only fallback codes and does not block answer generation.",
    ...overrides,
  };
}

function candidate(overrides: Partial<WebSearchQualityQuery["candidates"][number]> = {}): WebSearchQualityQuery["candidates"][number] {
  return {
    query: "fixture query",
    title: "Nguồn tiếng Việt",
    url: "https://example.vn",
    snippet: "Thông tin tiếng Việt",
    provider: "tavily",
    providerScore: 0.8,
    checkedAt,
    sourceType: "general",
    rank: 1,
    ...overrides,
  };
}
