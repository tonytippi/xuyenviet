import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { parseAdminYoutubeDiscoveryMissionCoveragePage } from "@xuyenviet/contracts";
import { YoutubeDiscoveryMissionQuality, validateMissionQueryDraft } from "../apps/admin/app/knowledge/youtube-discovery/mission/mission";

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
    expect(validateMissionQueryDraft({ queryText: "Đèo Prenn", priority: "", cadenceMinutes: "60" }, false)).toEqual({ priority: "Ưu tiên phải từ 1 đến 100." });
  });

  test("renders the bounded Vietnamese-first quality proof", () => {
    const html = renderToStaticMarkup(createElement(YoutubeDiscoveryMissionQuality, { quality: { tooShort: 2, durationUnknown: 3, nonVietnamese: 4, languageUnknown: 5, foreignFallback: 6, vietnameseConsider: 8, considered: 10, vietnameseFitPercent: 80, durationViolations: 0 } }));
    for (const text of ["Chất lượng ưu tiên tiếng Việt", "80%", "Mẫu: 8/10", "Ngưỡng yêu cầu: 80% (đạt)", "Nguồn ngoại ngữ bổ sung: 6", "Video quá ngắn: 2", "chưa rõ thời lượng: 3", "không phải tiếng Việt: 4", "chưa rõ ngôn ngữ: 5", "vi phạm thời lượng: 0"]) expect(html).toContain(text);
  });

  test("announces when the Vietnamese-first threshold is not met", () => {
    const html = renderToStaticMarkup(createElement(YoutubeDiscoveryMissionQuality, { quality: { tooShort: 0, durationUnknown: 0, nonVietnamese: 0, languageUnknown: 0, foreignFallback: 0, vietnameseConsider: 7, considered: 10, vietnameseFitPercent: 70, durationViolations: 1 } }));
    expect(html).toContain("Mẫu: 7/10");
    expect(html).toContain("Ngưỡng yêu cầu: 80% (chưa đạt)");
  });
});
