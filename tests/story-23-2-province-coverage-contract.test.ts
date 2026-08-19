import { describe, expect, test, vi } from "vitest";

import { governedKnowledgeProvinceIds, knowledgeProvinceCoverageNames, parseAdminAiPurposeAssignment, parseAdminKnowledgeProvinceCoverageList, parseAdminKnowledgeProvinceSuggestion, parseAdminKnowledgeProvinceSuggestionCommand } from "@xuyenviet/contracts";

describe("Story 23.2 province coverage contracts", () => {
  const coverage = { topics: [{ topic: "place", count: 2 }], freshnessSensitiveCount: 1, latestUpdatedAt: "2026-08-17T00:00:00.000Z" };
  const completeCoverage = { items: governedKnowledgeProvinceIds.map((canonicalProvinceId) => ({ ...coverage, canonicalProvinceId, ...knowledgeProvinceCoverageNames(canonicalProvinceId)! })) };

  test("accepts only metadata-only canonical province coverage", () => {
    expect(parseAdminKnowledgeProvinceCoverageList(completeCoverage)).toEqual(completeCoverage);
    expect(parseAdminKnowledgeProvinceCoverageList({ items: completeCoverage.items.slice(1) })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: [...completeCoverage.items.slice(0, -1), completeCoverage.items[0]] })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: completeCoverage.items.map((item, index) => index === 0 ? { ...item, locationName: "unsafe" } : item) })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: completeCoverage.items.map((item, index) => index === 0 ? { ...item, topics: [{ topic: "place", count: -1 }] } : item) })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: completeCoverage.items.map((item, index) => index === 0 ? { ...item, currentName: null } : item) })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: completeCoverage.items.map((item, index) => index === 0 ? { ...item, currentName: "Cao Bằng" } : item) })).toBeNull();
    const lamDong = completeCoverage.items.find((item) => item.canonicalProvinceId === "vn-26-lam-dong")!;
    expect(parseAdminKnowledgeProvinceCoverageList({ items: completeCoverage.items.map((item) => item.canonicalProvinceId === lamDong.canonicalProvinceId ? { ...item, legacyNames: [...item.legacyNames].reverse() } : item) })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: completeCoverage.items.map((item) => item.canonicalProvinceId === lamDong.canonicalProvinceId ? { ...item, legacyNames: item.legacyNames.slice(1) } : item) })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: completeCoverage.items.map((item) => item.canonicalProvinceId === lamDong.canonicalProvinceId ? { ...item, legacyNames: [...item.legacyNames, "Không chính thức"] } : item) })).toBeNull();
    expect(parseAdminKnowledgeProvinceCoverageList({ items: completeCoverage.items.map((item, index) => index === 0 ? { ...item, canonicalProvinceId: "vn-99-foreign" } : item) })).toBeNull();
  });

  test("accepts only exact province-suggestion model assignments", () => {
    const assignment = { purpose: "youtube_discovery_province_suggestion" as const, aiGatewayModelId: "model-1" };
    expect(parseAdminAiPurposeAssignment(assignment)).toEqual(assignment);
    expect(parseAdminAiPurposeAssignment({ ...assignment, defaultForPurpose: true })).toBeNull();
    expect(parseAdminAiPurposeAssignment({ ...assignment, aiGatewayModelId: "" })).toBeNull();
    expect(parseAdminAiPurposeAssignment({ ...assignment, purpose: "unknown" })).toBeNull();
  });

  test("requires exact canonical suggestion input and output", () => {
    expect(parseAdminKnowledgeProvinceSuggestionCommand({ canonicalProvinceId: "vn-01-ha-noi" })).toEqual({ canonicalProvinceId: "vn-01-ha-noi" });
    expect(parseAdminKnowledgeProvinceSuggestionCommand({ canonicalProvinceId: "vn-01-ha-noi", demand: "unsafe" })).toBeNull();
    const suggestion = { canonicalProvinceId: "vn-01-ha-noi", need: "Cần bổ sung thông tin đường đi", reason: "Chủ đề hiện có còn ít", queryText: "kinh nghiệm lái xe Hà Nội" };
    expect(parseAdminKnowledgeProvinceSuggestion(suggestion)).toEqual(suggestion);
    expect(parseAdminKnowledgeProvinceSuggestion({ ...suggestion, providerPayload: {} })).toBeNull();
    expect(parseAdminKnowledgeProvinceSuggestion({ ...suggestion, canonicalProvinceId: "vn-99-foreign" })).toBeNull();
    expect(parseAdminKnowledgeProvinceSuggestionCommand({ canonicalProvinceId: "vn-99-foreign" })).toBeNull();
    expect(parseAdminKnowledgeProvinceSuggestion({ ...suggestion, need: null })).toBeNull();
    expect(parseAdminKnowledgeProvinceSuggestion({ ...suggestion, queryText: "road trip Da Nang" })).toBeNull();
  });
});
