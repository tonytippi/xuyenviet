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
    expect(result.queries).toEqual([expect.objectContaining({ priority: 80, queryText: "Da Lat route", targetDigest: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
    expect(result.unavailableCodes).toEqual(["source_timeout"]);
  });

  test("caps safe list output at 200 items", () => {
    const item = { id: "proposal", origin: "operator", queryText: "Da Lat route", reason: "operator_request", priority: 1, enabled: false, cadenceMinutes: 15, nextRunAt: null, pausedReason: "operator" };
    expect(parseAdminYoutubeDiscoveryQueryList({ items: Array.from({ length: 200 }, () => item) })).not.toBeNull();
    expect(parseAdminYoutubeDiscoveryQueryList({ items: Array.from({ length: 201 }, () => item) })).toBeNull();
  });

});
