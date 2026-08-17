import { describe, expect, test } from "vitest";

import { parseAdminKnowledgeProvinceCoverageList, parseAdminKnowledgeProvinceSuggestion, parseAdminKnowledgeProvinceSuggestionCommand } from "@xuyenviet/contracts";

describe("Story 23.2 province coverage contracts", () => {
  const coverage = { canonicalProvinceId: "vn-01-ha-noi", currentName: "Hà Nội", legacyNames: [], topics: [{ topic: "place", count: 2 }], freshnessSensitiveCount: 1, latestUpdatedAt: "2026-08-17T00:00:00.000Z" };

  test("accepts only metadata-only canonical province coverage", () => {
    expect(parseAdminKnowledgeProvinceCoverageList({ items: [coverage] })).toEqual({ items: [coverage] });
    expect(parseAdminKnowledgeProvinceCoverageList({ items: [{ ...coverage, locationName: "unsafe" }] })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: [{ ...coverage, topics: [{ topic: "place", count: -1 }] }] })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: [{ ...coverage, currentName: null }] })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: [{ ...coverage, canonicalProvinceId: "vn-99-foreign" }] })).toBeNull();
  });

  test("requires exact canonical suggestion input and output", () => {
    expect(parseAdminKnowledgeProvinceSuggestionCommand({ canonicalProvinceId: coverage.canonicalProvinceId })).toEqual({ canonicalProvinceId: coverage.canonicalProvinceId });
    expect(parseAdminKnowledgeProvinceSuggestionCommand({ canonicalProvinceId: coverage.canonicalProvinceId, demand: "unsafe" })).toBeNull();
    const suggestion = { canonicalProvinceId: coverage.canonicalProvinceId, need: "Cần bổ sung thông tin đường đi", reason: "Chủ đề hiện có còn ít", queryText: "kinh nghiệm lái xe Hà Nội" };
    expect(parseAdminKnowledgeProvinceSuggestion(suggestion)).toEqual(suggestion);
    expect(parseAdminKnowledgeProvinceSuggestion({ ...suggestion, providerPayload: {} })).toBeNull();
    expect(parseAdminKnowledgeProvinceSuggestion({ ...suggestion, canonicalProvinceId: "vn-99-foreign" })).toBeNull();
    expect(parseAdminKnowledgeProvinceSuggestionCommand({ canonicalProvinceId: "vn-99-foreign" })).toBeNull();
    expect(parseAdminKnowledgeProvinceSuggestion({ ...suggestion, need: null })).toBeNull();
    expect(parseAdminKnowledgeProvinceSuggestion({ ...suggestion, queryText: "road trip Da Nang" })).toBeNull();
  });
});
