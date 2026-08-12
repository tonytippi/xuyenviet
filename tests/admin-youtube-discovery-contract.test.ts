import { describe, expect, test } from "vitest";
import { encodeAdminYoutubeDiscoveryActionRequiredCursor, encodeAdminYoutubeDiscoveryHealthIncidentCursor, encodeAdminYoutubeDiscoveryMissionCandidateCursor, encodeAdminYoutubeDiscoveryMissionCoverageCursor, encodeAdminYoutubeDiscoveryMissionQueryCursor, encodeAdminYoutubeDiscoveryReviewCursor, parseAdminYoutubeDiscoveryAcceptCommand, parseAdminYoutubeDiscoveryAcceptReviewResult, parseAdminYoutubeDiscoveryActionRequiredCursor, parseAdminYoutubeDiscoveryActionRequiredQueue, parseAdminYoutubeDiscoveryDeferCommand, parseAdminYoutubeDiscoveryDeferReviewResult, parseAdminYoutubeDiscoveryEnablementCommand, parseAdminYoutubeDiscoveryEnablementResult, parseAdminYoutubeDiscoveryHealthIncidentDetail, parseAdminYoutubeDiscoveryHealthIncidentCursor, parseAdminYoutubeDiscoveryHealthOverview, parseAdminYoutubeDiscoveryMissionCandidatePage, parseAdminYoutubeDiscoveryMissionCoveragePage, parseAdminYoutubeDiscoveryMissionDetail, parseAdminYoutubeDiscoveryMissionFunnel, parseAdminYoutubeDiscoveryMissionQueryPage, parseAdminYoutubeDiscoveryQuery, parseAdminYoutubeDiscoveryQueryList, parseAdminYoutubeDiscoveryReviewCursor, parseAdminYoutubeDiscoveryReviewDetail, parseAdminYoutubeDiscoveryReviewQueue, parseAdminYoutubeDiscoverySkipCommand, parseAdminYoutubeDiscoverySkipReviewResult } from "@xuyenviet/contracts";

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

  test("accepts only the closed Discovery enablement command and result", () => {
    const result = { enabled: false, version: 2, createdAt: "2026-08-07T00:00:00.000Z", changed: true };
    expect(parseAdminYoutubeDiscoveryEnablementCommand({ enabled: false })).toEqual({ enabled: false });
    expect(parseAdminYoutubeDiscoveryEnablementCommand({ enabled: false, version: 2 })).toBeNull();
    expect(parseAdminYoutubeDiscoveryEnablementCommand({ enabled: "false" })).toBeNull();
    expect(parseAdminYoutubeDiscoveryEnablementResult(result)).toEqual(result);
    expect(parseAdminYoutubeDiscoveryEnablementResult({ ...result, policy: {} })).toBeNull();
    expect(parseAdminYoutubeDiscoveryEnablementResult({ ...result, createdAt: "2026-08-07T00:00:00Z" })).toBeNull();
  });

  test("requires exact bounded review projections and an opaque versioned cursor", () => {
    const item = { recommendationId: "recommendation-1", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", title: "Da Lat route", channelName: "Route channel", publishedAt: "2026-08-07T00:00:00.000Z", durationSeconds: 120, recommendation: "consider" as const, reason: "eligible_score_band" as const, actionAvailability: "available" as const };
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

  test("accept accepts exactly an empty JSON object and exposes only closed outcomes", () => {
    expect(parseAdminYoutubeDiscoveryAcceptCommand({})).toEqual({});
    expect(parseAdminYoutubeDiscoveryAcceptCommand(undefined)).toBeNull();
    expect(parseAdminYoutubeDiscoveryAcceptCommand(null)).toBeNull();
    expect(parseAdminYoutubeDiscoveryAcceptCommand([])).toBeNull();
    expect(parseAdminYoutubeDiscoveryAcceptCommand({ canonicalUrl: "https://unsafe.example" })).toBeNull();
    expect(parseAdminYoutubeDiscoveryAcceptReviewResult({ outcome: "submitted" })).toEqual({ outcome: "submitted" });
    expect(parseAdminYoutubeDiscoveryAcceptReviewResult({ outcome: "duplicate" })).toEqual({ outcome: "duplicate" });
    expect(parseAdminYoutubeDiscoveryAcceptReviewResult({ outcome: "failed", sourceId: "unsafe" })).toBeNull();
    expect(parseAdminYoutubeDiscoveryAcceptReviewResult({ outcome: "reconciling", batchId: "unsafe" })).toBeNull();
  });

  test("defer and skip accept exactly empty JSON objects with route-specific closed outcomes", () => {
    for (const command of [parseAdminYoutubeDiscoveryDeferCommand, parseAdminYoutubeDiscoverySkipCommand]) {
      expect(command({})).toEqual({});
      expect(command(undefined)).toBeNull();
      expect(command({ reason: "unsafe" })).toBeNull();
    }
    expect(parseAdminYoutubeDiscoveryDeferReviewResult({ outcome: "deferred" })).toEqual({ outcome: "deferred" });
    expect(parseAdminYoutubeDiscoveryDeferReviewResult({ outcome: "skipped" })).toBeNull();
    expect(parseAdminYoutubeDiscoverySkipReviewResult({ outcome: "skipped" })).toEqual({ outcome: "skipped" });
    expect(parseAdminYoutubeDiscoverySkipReviewResult({ outcome: "deferred", audit: {} })).toBeNull();
  });

  test("requires exact bounded action-required projections and versioned cursors", () => {
    const item = { kind: "health_incident" as const, actionId: "query-1:provider_rate_limited", destination: "health" as const, reason: "provider_rate_limited" as const, priority: 1, occurredAt: "2026-08-07T00:00:00.000Z" };
    const cursor = encodeAdminYoutubeDiscoveryActionRequiredCursor({ version: 1, urgency: 0, priority: 1, occurredAt: item.occurredAt, kind: item.kind, actionId: item.actionId });
    expect(parseAdminYoutubeDiscoveryActionRequiredCursor(cursor)).toEqual({ version: 1, urgency: 0, priority: 1, occurredAt: item.occurredAt, kind: item.kind, actionId: item.actionId });
    expect(parseAdminYoutubeDiscoveryActionRequiredCursor("yda2.bad")).toBeNull();
    expect(parseAdminYoutubeDiscoveryActionRequiredQueue({ items: [item], nextCursor: cursor })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryActionRequiredQueue({ items: [{ ...item, providerPayload: {} }], nextCursor: null })).toBeNull();
    expect(parseAdminYoutubeDiscoveryActionRequiredQueue({ items: [{ ...item, label: "provider/source/Knowledge text" }], nextCursor: null })).toBeNull();
    expect(parseAdminYoutubeDiscoveryActionRequiredQueue({ items: [{ ...item, reason: "retry_exhausted" }], nextCursor: null })).toBeNull();
    expect(parseAdminYoutubeDiscoveryActionRequiredQueue({ items: [{ ...item, kind: "mission_need", destination: "health", reason: "provider_rate_limited" }], nextCursor: null })).toBeNull();
    expect(parseAdminYoutubeDiscoveryActionRequiredQueue({ items: [{ ...item, kind: "candidate_review", destination: "review", reason: "knowledge_risk" }], nextCursor: null })).toBeNull();
    expect(parseAdminYoutubeDiscoveryActionRequiredQueue({ items: [
      { kind: "candidate_review", actionId: "candidate-1", destination: "review", reason: "review_pending", priority: 1, occurredAt: item.occurredAt },
      { kind: "candidate_review", actionId: "candidate-2", destination: "review", reason: "review_aged", priority: 1, occurredAt: item.occurredAt },
      { kind: "mission_need", actionId: "mission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", destination: "mission", reason: "mission_no_progress", priority: 1, occurredAt: item.occurredAt },
      { kind: "mission_need", actionId: "mission-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", destination: "mission", reason: "mission_disabled", priority: 1, occurredAt: item.occurredAt },
      { kind: "mission_need", actionId: "mission-cccccccccccccccccccccccccccccccc", destination: "mission", reason: "mission_no_enabled_query", priority: 1, occurredAt: item.occurredAt },
      item,
      { kind: "health_incident", actionId: "query-1:triage_schema_invalid", destination: "health", reason: "triage_schema_invalid", priority: 1, occurredAt: item.occurredAt },
      { kind: "health_incident", actionId: "query-1:execution_terminal", destination: "health", reason: "execution_persistent_failure", priority: 1, occurredAt: item.occurredAt },
      { kind: "knowledge_recommendation", actionId: "knowledge-risk", destination: "knowledge_recommendation", reason: "knowledge_risk", priority: 1, occurredAt: item.occurredAt },
      { kind: "knowledge_recommendation", actionId: "knowledge-relation", destination: "knowledge_recommendation", reason: "knowledge_relation", priority: 1, occurredAt: item.occurredAt },
    ], nextCursor: null })).not.toBeNull();
  });

  test("requires endpoint-specific Mission pages, current-state funnel, and unavailable safe context", () => {
    const coverage = { actionId: "mission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", priority: 1, createdAt: "2026-08-07T00:00:00.000Z", corridor: null, location: "Đà Lạt", routeSegment: null, taxonomy: "place", freshness: "sensitive" as const, conflict: "none" as const, demand: "unavailable" as const, seasonalContext: "unavailable" as const };
    const coverageCursor = encodeAdminYoutubeDiscoveryMissionCoverageCursor({ version: 1, priority: 1, createdAt: "2026-08-07T00:00:00.000001Z", actionId: coverage.actionId });
    expect(parseAdminYoutubeDiscoveryMissionCoveragePage({ items: [coverage], nextCursor: coverageCursor })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryMissionCoveragePage({ items: [{ ...coverage, sourceId: "unsafe" }], nextCursor: null })).toBeNull();
    const queryCursor = encodeAdminYoutubeDiscoveryMissionQueryCursor({ version: 1, priority: 50, createdAt: "2026-08-07T00:00:00.000001Z", id: query.id });
    expect(parseAdminYoutubeDiscoveryMissionQueryPage({ items: [query], nextCursor: queryCursor })).not.toBeNull();
    const candidate = { candidateId: "candidate-1", actionId: coverage.actionId, priority: 1, rank: 0, rankedAt: coverage.createdAt, rankingState: "recommended" as const, recommendationId: "recommendation-1", recommendation: "consider" as const, candidateState: "pending" as const, reviewAvailable: true };
    const candidateCursor = encodeAdminYoutubeDiscoveryMissionCandidateCursor({ version: 1, actionId: coverage.actionId, priority: 1, rank: 0, rankedAt: coverage.createdAt, candidateId: candidate.candidateId });
    expect(parseAdminYoutubeDiscoveryMissionCandidatePage({ items: [candidate], nextCursor: candidateCursor })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryMissionCandidatePage({ items: [{ ...candidate, reviewAvailable: true, candidateState: "accepted" }], nextCursor: null })).toBeNull();
    expect(parseAdminYoutubeDiscoveryMissionDetail({ coverage, query: { ...query, origin: "system", reason: "coverage_gap" }, latestRun: { state: "unavailable", createdAt: null, retryCount: null, terminalCategory: "unavailable" }, candidates: { items: [candidate], nextCursor: null } })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryMissionDetail({ coverage, query, latestRun: { state: "unavailable", createdAt: null, retryCount: null, terminalCategory: "unavailable" }, candidates: { items: [candidate], nextCursor: null } })).toBeNull();
    expect(parseAdminYoutubeDiscoveryMissionFunnel({ asOf: coverage.createdAt, discovered: 1, enriched: 1, triaged: 1, recommended: 1, pendingReview: 1, accepted: 0, deferred: 0, skipped: 0 })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryMissionFunnel({ asOf: coverage.createdAt, discovered: -1, enriched: 0, triaged: 0, recommended: 0, pendingReview: 0, accepted: 0, deferred: 0, skipped: 0 })).toBeNull();
  });

  test("requires bounded Health projections and server-admitted opaque incident cursors", () => {
    const overview = { asOf: "2026-08-07T00:00:00.000Z", lastUpdatedAt: "2026-08-07T00:00:00.000Z", policy: { enabled: true }, planning: { state: "no_run" as const, at: null, lastUpdatedAt: null, nextRunAt: null, retryCount: null, category: "unavailable" as const, freshness: "unavailable" as const }, querySchedule: { enabled: null, cadenceMinutes: null, nextRunAt: null, lastUpdatedAt: null, freshness: "unavailable" as const }, latestQueryRun: { state: "retrying" as const, at: "2026-08-07T00:00:00.000Z", lastUpdatedAt: "2026-08-07T00:00:00.000Z", nextRunAt: "2026-08-07T00:15:00.000Z", retryCount: 1, category: "provider_rate_limited" as const, freshness: "current" as const }, pausedRuns: [], throughput: { windowHours: 24, discovered: 1, enriched: 1, triaged: 1, recommended: 1, lastUpdatedAt: "2026-08-07T00:00:00.000Z", freshness: "current" as const }, backlog: { pending: 1, deferred: 1, oldestDeferredAt: "2026-08-06T00:00:00.000Z", deferredAge: "available" as const, lastUpdatedAt: "2026-08-06T00:00:00.000Z" }, incidents: [{ kind: "health_incident" as const, actionId: "123e4567-e89b-12d3-a456-426614174000:provider_rate_limited", destination: "health" as const, reason: "provider_rate_limited" as const, priority: 1, occurredAt: "2026-08-07T00:00:00.000Z" }], usage: { availability: "available" as const, requests: 1, totalTokens: 10, costMicros: 20, lastUpdatedAt: "2026-08-07T00:00:00.000Z", freshness: "current" as const } };
    expect(parseAdminYoutubeDiscoveryHealthOverview(overview)).toEqual(overview);
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, providerPayload: {} })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, pausedRuns: [{ runId: "run-1", state: "policy_revoked", at: overview.asOf }] })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, pausedRuns: Array.from({ length: 21 }, () => ({ runId: "run-1", state: "policy_revoked", at: overview.asOf })) })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, incidents: [{ ...overview.incidents[0], urgency: 0 }] })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, incidents: [{ ...overview.incidents[0], actionId: "query-1:provider_rate_limited" }] })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, policy: { enabled: null } })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, policy: { enabled: "true" } })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, backlog: { ...overview.backlog, oldestDeferredAt: null } })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, latestQueryRun: { ...overview.latestQueryRun, freshness: "fresh" } })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, latestQueryRun: { ...overview.latestQueryRun, nextRunAt: null } })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, policy: { enabled: false }, latestQueryRun: { ...overview.latestQueryRun, nextRunAt: null } })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, planning: { ...overview.planning, lastUpdatedAt: overview.asOf } })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, throughput: { ...overview.throughput, freshness: "unavailable" } })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, throughput: { ...overview.throughput, lastUpdatedAt: null, freshness: "unavailable" } })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, usage: { ...overview.usage, availability: "incomplete_usage", totalTokens: null, costMicros: null } })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, usage: { ...overview.usage, availability: "incomplete_pricing", costMicros: null } })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, usage: { availability: "missing", requests: 0, totalTokens: null, costMicros: null, lastUpdatedAt: null, freshness: "unavailable" } })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthOverview({ ...overview, usage: { ...overview.usage, availability: "available", totalTokens: null } })).toBeNull();
    const cursorAt = "2026-08-07T00:00:00.000123Z";
    const cursor = encodeAdminYoutubeDiscoveryHealthIncidentCursor({ version: 1, groupId: overview.incidents[0].actionId, at: cursorAt, runId: "run-1" });
    expect(parseAdminYoutubeDiscoveryHealthIncidentCursor(cursor)).toEqual({ version: 1, groupId: overview.incidents[0].actionId, at: cursorAt, runId: "run-1" });
    expect(() => encodeAdminYoutubeDiscoveryHealthIncidentCursor({ version: 1, groupId: overview.incidents[0].actionId, at: overview.asOf, runId: "run-1" })).toThrow("Invalid YouTube Discovery Mission cursor.");
    expect(parseAdminYoutubeDiscoveryHealthIncidentDetail({ groupId: overview.incidents[0].actionId, category: "provider_rate_limited", items: [{ runId: "run-1", state: "retrying", stage: "unavailable", phase: "retrying", at: overview.asOf, nextRunAt: "2026-08-07T00:15:00.000Z", retryCount: 1, category: "provider_rate_limited" }], nextCursor: cursor })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthIncidentDetail({ groupId: overview.incidents[0].actionId, category: "provider_rate_limited", items: [{ runId: "run-1", state: "failed", stage: "unavailable", phase: "retrying", at: overview.asOf, nextRunAt: null, retryCount: 1, category: "provider_rate_limited" }], nextCursor: null })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthIncidentDetail({ groupId: overview.incidents[0].actionId, category: "provider_rate_limited", items: [{ runId: "run-1", state: "retrying", stage: "unavailable", phase: "retrying", at: overview.asOf, nextRunAt: null, retryCount: 1, category: "triage_schema_invalid" }], nextCursor: null })).toBeNull();
    expect(parseAdminYoutubeDiscoveryHealthIncidentDetail({ groupId: overview.incidents[0].actionId, category: "provider_rate_limited", items: [{ runId: "run-1", state: "retrying", phase: "retrying", at: overview.asOf, nextRunAt: "2026-08-07T00:15:00.000Z", retryCount: 1, category: "provider_rate_limited" }], nextCursor: null })).toBeNull();
  });
});
