import { describe, expect, test, vi } from "vitest";

import { governedKnowledgeProvinceIds, knowledgeProvinceCoverageNames, parseAdminKnowledgeProvinceCoverageList, parseAdminKnowledgeProvinceSuggestion, parseAdminKnowledgeProvinceSuggestionCommand } from "@xuyenviet/contracts";
import { AdminAiModelCatalogPolicyError, updateAdminAiGatewayModel } from "@xuyenviet/domain";

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

  test("requires extraction capabilities for the default province-suggestion model", async () => {
    const port = { update: vi.fn() };
    const principal = { userId: "operator", email: "operator@example.com", roles: ["operator"] as Array<"operator">, sessionId: "session-23-2", authorizationVersion: 1 };
    const input = { purpose: "youtube_discovery_province_suggestion" as const, defaultForPurpose: true };
    await expect(updateAdminAiGatewayModel(port as never, principal, "model-1", { ...input, supportsTextInput: false, supportsExtraction: true })).rejects.toThrow(new AdminAiModelCatalogPolicyError("Default extraction model must support text input and extraction."));
    await expect(updateAdminAiGatewayModel(port as never, principal, "model-1", { ...input, supportsTextInput: true, supportsExtraction: false })).rejects.toThrow(new AdminAiModelCatalogPolicyError("Default extraction model must support text input and extraction."));
    expect(port.update).not.toHaveBeenCalled();
    await updateAdminAiGatewayModel(port as never, principal, "model-1", { ...input, supportsTextInput: true, supportsExtraction: true });
    expect(port.update).toHaveBeenCalledWith(principal, "model-1", { ...input, supportsTextInput: true, supportsExtraction: true });
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
