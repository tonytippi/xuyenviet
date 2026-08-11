import { describe, expect, test } from "vitest";
import { parseAdminYoutubeDiscoveryMissionCoveragePage } from "@xuyenviet/contracts";
import { validateMissionQueryDraft } from "../apps/admin/app/knowledge/youtube-discovery/mission/mission";

describe("Mission UI interaction boundary", () => {
  test("rejects unsafe responses before presentation", () => {
    expect(parseAdminYoutubeDiscoveryMissionCoveragePage({ items: [{ actionId: "mission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", priority: 1, createdAt: "2026-08-07T00:00:00.000Z", corridor: null, location: null, routeSegment: null, taxonomy: null, freshness: "fresh", conflict: "none", demand: "unavailable", seasonalContext: "unavailable", providerPayload: {} }], nextCursor: null })).toBeNull();
  });

  test("keeps query drafts safe for command submission without erasing them", () => {
    const invalid = { queryText: "", priority: "101", cadenceMinutes: "14" };
    expect(validateMissionQueryDraft(invalid, true)).toEqual({ queryText: "Nhập truy vấn dài từ 1 đến 240 ký tự.", priority: "Ưu tiên phải từ 1 đến 100.", cadenceMinutes: "Chu kỳ phải từ 15 đến 10080 phút." });
    expect(invalid).toEqual({ queryText: "", priority: "101", cadenceMinutes: "14" });
    expect(validateMissionQueryDraft({ queryText: "Đèo Prenn", priority: "25", cadenceMinutes: "60" }, true)).toEqual({});
    expect(validateMissionQueryDraft({ queryText: "Đèo Prenn", priority: "25", cadenceMinutes: "10081" }, true)).toEqual({ cadenceMinutes: "Chu kỳ phải từ 15 đến 10080 phút." });
  });
});
