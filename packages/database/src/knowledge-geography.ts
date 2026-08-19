export { knowledgeProvinceReferenceEffectiveDate, knowledgeProvinceReferenceFixture, knowledgeProvinceReferenceProvenance, knowledgeProvinceReferenceVersion } from "@xuyenviet/contracts";
import { knowledgeProvinceReferenceFixture } from "@xuyenviet/contracts";

const currentUnitNames = new Map(knowledgeProvinceReferenceFixture.filter((reference) => reference.id === reference.currentUnitId).map((reference) => [reference.id, reference.displayName]));
const referencesByName = new Map(knowledgeProvinceReferenceFixture.map((reference) => [reference.displayName, reference]));

export function validateKnowledgeProvinceReferences() {
  if (knowledgeProvinceReferenceFixture.length !== new Set(knowledgeProvinceReferenceFixture.map((reference) => reference.id)).size) throw new Error("Knowledge province reference IDs must be unique.");
  for (const reference of knowledgeProvinceReferenceFixture) {
    if (!reference.displayName || !currentUnitNames.has(reference.currentUnitId)) throw new Error("Knowledge province reference is invalid.");
  }
  return true;
}

export function normalizeKnowledgeProvinceReference(locationName: string | null | undefined) {
  if (!locationName) return null;
  const reference = referencesByName.get(locationName);
  if (!reference) return null;
  return { currentUnitId: reference.currentUnitId, currentUnitName: currentUnitNames.get(reference.currentUnitId)! };
}

export function isEligibleKnowledgeProvinceBackfill(locationName: string | null | undefined) {
  return normalizeKnowledgeProvinceReference(locationName) !== null;
}

validateKnowledgeProvinceReferences();
