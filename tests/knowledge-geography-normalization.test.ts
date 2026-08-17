import { describe, expect, test } from "vitest";

import { isEligibleKnowledgeProvinceBackfill, knowledgeProvinceReferenceEffectiveDate, knowledgeProvinceReferenceFixture, knowledgeProvinceReferenceProvenance, knowledgeProvinceReferenceVersion, normalizeKnowledgeProvinceReference, validateKnowledgeProvinceReferences } from "@/db/knowledge-geography";

describe("Knowledge province normalization", () => {
  test("ships a versioned official reference with deterministic current units", () => {
    expect(validateKnowledgeProvinceReferences()).toBe(true);
    expect(knowledgeProvinceReferenceFixture).not.toHaveLength(0);
    expect(knowledgeProvinceReferenceVersion).toBe("vn-admin-2025-07-01");
    expect(knowledgeProvinceReferenceEffectiveDate).toBe("2025-07-01");
    expect(knowledgeProvinceReferenceProvenance).toMatch(/^https:\/\//);
    const currentRows = knowledgeProvinceReferenceFixture.filter((reference) => reference.id === reference.currentUnitId);
    const legacyRows = knowledgeProvinceReferenceFixture.filter((reference) => reference.id !== reference.currentUnitId);
    expect(knowledgeProvinceReferenceFixture).toHaveLength(63);
    expect(currentRows).toHaveLength(34);
    expect(legacyRows).toHaveLength(29);
    expect(currentRows.every((reference) => reference.id && reference.displayName && reference.currentUnitId === reference.id)).toBe(true);
    expect(legacyRows.every((reference) => currentRows.some((current) => current.id === reference.currentUnitId))).toBe(true);
  });

  test("resolves every governed fixture label to its current unit", () => {
    const currentNames = new Map(knowledgeProvinceReferenceFixture.filter((reference) => reference.id === reference.currentUnitId).map((reference) => [reference.id, reference.displayName]));
    for (const reference of knowledgeProvinceReferenceFixture) {
      expect(normalizeKnowledgeProvinceReference(reference.displayName)).toEqual({ currentUnitId: reference.currentUnitId, currentUnitName: currentNames.get(reference.currentUnitId) });
    }
  });

  test.each(["Hội An", "Đà Nẵng - Hội An", "quảng nam", " Quảng Nam", "Việt Nam", null, undefined])("leaves unsafe or non-exact labels unresolved: %s", (locationName) => {
    expect(normalizeKnowledgeProvinceReference(locationName)).toBeNull();
    expect(isEligibleKnowledgeProvinceBackfill(locationName)).toBe(false);
  });
});
