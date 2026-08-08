import { describe, expect, test } from "vitest";
import { parseAdminYoutubeDiscoveryQuery, parseAdminYoutubeDiscoveryQueryList } from "@xuyenviet/contracts";

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
});
