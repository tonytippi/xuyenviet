import { describe, expect, test } from "vitest";
import { encodeAdminYoutubeDiscoveryReviewCursor, parseAdminYoutubeDiscoveryQuery, parseAdminYoutubeDiscoveryQueryList, parseAdminYoutubeDiscoveryReviewCursor, parseAdminYoutubeDiscoveryReviewDetail, parseAdminYoutubeDiscoveryReviewQueue } from "@xuyenviet/contracts";

const query = { id: "proposal-1", origin: "operator" as const, queryText: "Da Lat route", reason: "operator_request" as const, priority: 50, enabled: true, cadenceMinutes: 60, nextRunAt: "2026-08-07T00:00:00.000Z", pausedReason: null };

describe("admin YouTube Discovery contract", () => {
  test("requires exact safe query projections", () => {
    expect(parseAdminYoutubeDiscoveryQuery(query)).toEqual(query);
    expect(parseAdminYoutubeDiscoveryQuery({ ...query, targetDigest: "secret" })).toBeNull();
    expect(parseAdminYoutubeDiscoveryQuery({ ...query, nextRunAt: null })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryQuery({ ...query, enabled: false, nextRunAt: null, pausedReason: "operator" })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryQuery({ ...query, enabled: true, nextRunAt: null, pausedReason: "operator" })).toBeNull();
    expect(parseAdminYoutubeDiscoveryQuery({ ...query, enabled: false, nextRunAt: null, pausedReason: "global" })).toBeNull();
    expect(parseAdminYoutubeDiscoveryQuery({ ...query, nextRunAt: "2026-08-07T00:00:00Z" })).toBeNull();
    expect(parseAdminYoutubeDiscoveryQuery({ ...query, nextRunAt: "2026-08-07T00:00:00.000+00:00" })).toBeNull();
    expect(parseAdminYoutubeDiscoveryQuery({ ...query, nextRunAt: "2026-02-30T00:00:00.000Z" })).toBeNull();
    expect(parseAdminYoutubeDiscoveryQueryList({ items: [query] })).toEqual({ items: [query] });
    expect(parseAdminYoutubeDiscoveryQueryList({ items: [{ ...query, providerPayload: {} }] })).toBeNull();
  });

  test("requires exact bounded review projections and an opaque versioned cursor", () => {
    const item = { recommendationId: "recommendation-1", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", title: "Da Lat route", channelName: "Route channel", publishedAt: "2026-08-07T00:00:00.000Z", durationSeconds: 120, recommendation: "consider" as const, reason: "eligible_score_band" as const };
    const cursor = encodeAdminYoutubeDiscoveryReviewCursor({ score: 0.7, createdAt: "2026-08-07T00:00:00.000001Z", recommendationId: item.recommendationId });
    expect(parseAdminYoutubeDiscoveryReviewCursor(cursor)).toEqual({ score: 0.7, createdAt: "2026-08-07T00:00:00.000001Z", recommendationId: item.recommendationId });
    expect(parseAdminYoutubeDiscoveryReviewCursor("ydr1.bad")).toBeNull();
    expect(parseAdminYoutubeDiscoveryReviewCursor("ydr2.eyJzY29yZSI6MC43LCJjcmVhdGVkQXQiOiIyMDI2LTAyLTMwVDAwOjAwOjAwLjAwMDAwMVoiLCJyZWNvbW1lbmRhdGlvbklkIjoicmVjb21tZW5kYXRpb24tMSJ9")).toBeNull();
    expect(parseAdminYoutubeDiscoveryReviewQueue({ items: [item], nextCursor: cursor })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryReviewQueue({ items: [{ ...item, videoId: "unsafe" }], nextCursor: null })).toBeNull();
    const detail = { ...item, queryText: "Da Lat route", queryReason: "operator_request" as const, score: 0.7, factors: ["relevance"], penalties: [], signals: ["practical_question_demand"], priorCaptureOutcome: "eligible" as const };
    expect(parseAdminYoutubeDiscoveryReviewDetail(detail)).toEqual(detail);
    expect(parseAdminYoutubeDiscoveryReviewDetail({ ...detail, factors: ["relevance", "relevance"] })).toBeNull();
    expect(parseAdminYoutubeDiscoveryReviewDetail({ ...detail, queryReason: "unknown" })).toBeNull();
  });
});
