import { describe, expect, test } from "vitest";
import { deriveDiscoveryQueries, parseDiscoveryQuerySignalPortResult } from "@xuyenviet/domain";
import { parseAdminYoutubeDiscoveryQueryList } from "@xuyenviet/contracts";

describe("YouTube Discovery safe planning signals", () => {
  test("accepts only exact bounded signal and unavailable contracts", () => {
    expect(parseDiscoveryQuerySignalPortResult({ status: "available", signals: [{ reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 1 }] })).not.toBeNull();
    expect(parseDiscoveryQuerySignalPortResult({ status: "available", signals: [{ reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 1, prompt: "private" }] })).toBeNull();
    expect(parseDiscoveryQuerySignalPortResult({ status: "unavailable", code: "source_timeout" })).not.toBeNull();
    expect(parseDiscoveryQuerySignalPortResult({ status: "unavailable", code: "provider_error" })).toBeNull();
    expect(parseDiscoveryQuerySignalPortResult({ status: "available", signals: [{ reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 1 }, { reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 1, prompt: "private" }] })).toBeNull();
    expect(parseDiscoveryQuerySignalPortResult({ status: "available", signals: [{ reason: "coverage_gap", geography: "x".repeat(81), taxonomy: "route", priority: 1 }] })).toBeNull();
  });

  test.each([
    null, [], {}, { status: "available" }, { status: "available", signals: "invalid" },
    { status: "available", signals: Array.from({ length: 101 }, () => ({ reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 1 })) },
    { status: "available", signals: [{ reason: "unknown", geography: "Da Lat", taxonomy: "route", priority: 1 }] },
    { status: "available", signals: [{ reason: "coverage_gap", geography: "", taxonomy: "route", priority: 1 }] },
    { status: "available", signals: [{ reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 1.5 }] },
    { status: "unavailable" }, { status: "unavailable", code: "unsafe" }, { status: "unavailable", code: "source_timeout", extra: true },
  ])("rejects invalid safe-port input %#", (value) => {
    expect(parseDiscoveryQuerySignalPortResult(value)).toBeNull();
  });

  test("normalizes, deduplicates, derives stable opaque targets, and reports invalid inputs", () => {
    const result = deriveDiscoveryQueries([{ status: "available", signals: [
      { reason: "coverage_gap", geography: " Da Lat ", taxonomy: "route", priority: 30 },
      { reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 80 },
    ] }, { status: "unavailable", code: "source_timeout" }]);
    expect(result.queries).toEqual([expect.objectContaining({ priority: 80, queryBuilderVersion: 1, queryText: "Da Lat kinh nghiệm cung đường đi ô tô", targetDigest: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
    expect(result.unavailableCodes).toEqual(["source_timeout"]);
  });

  test("maps every reason and supported snake-case taxonomy to natural Vietnamese road-user queries", () => {
    const result = deriveDiscoveryQueries([{ status: "available", signals: [
      { reason: "coverage_gap", geography: "Da Lat", taxonomy: "route_note", priority: 50 },
      { reason: "freshness_risk", geography: "Ha Noi Da Nang", taxonomy: "cost_note", priority: 50 },
      { reason: "unresolved_conflict", geography: "Hai Phong", taxonomy: "parking", priority: 50 },
      { reason: "anonymized_demand", geography: "Viet Nam", taxonomy: "general_travel_tip", priority: 50 },
      { reason: "anonymized_demand", geography: "Can Tho", taxonomy: "unrecognized taxonomy", priority: 50 },
    ] }]);

    expect(result.queries.map(({ queryText, taxonomy, targetDigest }) => ({ queryText, taxonomy, targetDigest }))).toEqual([
      { queryText: "Can Tho kinh nghiệm du lịch tự lái", taxonomy: "unrecognized taxonomy", targetDigest: expect.stringMatching(/^[a-f0-9]{64}$/) },
      { queryText: "Viet Nam kinh nghiệm chuyến đi tự lái", taxonomy: "general_travel_tip", targetDigest: expect.stringMatching(/^[a-f0-9]{64}$/) },
      { queryText: "Da Lat kinh nghiệm cung đường đi ô tô", taxonomy: "route_note", targetDigest: expect.stringMatching(/^[a-f0-9]{64}$/) },
      { queryText: "Ha Noi Da Nang thông tin mới chi phí hành trình", taxonomy: "cost_note", targetDigest: expect.stringMatching(/^[a-f0-9]{64}$/) },
      { queryText: "Hai Phong lưu ý thực tế điểm đỗ xe trên đường", taxonomy: "parking", targetDigest: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
    expect(result.queries.map((query) => query.queryText).join(" ")).not.toMatch(/route[_ ]note|cost[_ ]note|unrecognized taxonomy|general[_ ]travel[_ ]tip/i);
  });

  test("keeps the target identity stable while a supported builder version changes query text", () => {
    const input = [{ status: "available" as const, signals: [{ reason: "coverage_gap" as const, geography: "Da Lat", taxonomy: "route note", priority: 50 }] }];
    const versionOne = deriveDiscoveryQueries(input, 1).queries[0]!;
    const versionTwo = deriveDiscoveryQueries(input, 2).queries[0]!;

    expect(versionTwo).toMatchObject({ queryBuilderVersion: 2, queryText: "Da Lat kinh nghiệm hành trình cung đường đi ô tô", targetDigest: versionOne.targetDigest });
    expect(versionTwo.queryText).not.toMatch(/route note/i);
  });

  test("caps safe list output at 200 items", () => {
    const item = { id: "proposal", origin: "operator", queryText: "Da Lat route", reason: "operator_request", priority: 1, enabled: false, cadenceMinutes: 15, nextRunAt: null, pausedReason: "operator" };
    expect(parseAdminYoutubeDiscoveryQueryList({ items: Array.from({ length: 200 }, () => item) })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryQueryList({ items: Array.from({ length: 201 }, () => item) })).toBeNull();
  });

});
