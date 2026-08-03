// Story 7.4 review finding 9: pure same-project parent/backup/no-cycle rules
// shared by the DB-backed validatePlanReferences command path (trip-projects.ts)
// and the proposal validator (trip-change-proposals.ts). Extracting these rules
// here keeps both paths on the exact same logic so they cannot diverge.
//
// This module is intentionally dependency-free and side-effect-free so it can be
// imported by both domain modules without creating a circular import.

export type PlanItemReference = {
  id: string;
  kind: string;
  tripProjectId?: string;
  parentItemId?: string | null;
  backupTargetItemId: string | null;
};

// Returns an error message string when the proposed parent/backup references are
// invalid, or null when valid. Callers must provide every plan item in the same
// project (DB-loaded for commands, already-loaded knownItems for proposals) so
// same-project scoping and cycle walks are exact. `tripProjectId` is the project
// the change targets; when a known item carries `tripProjectId`, it is checked
// for same-project membership (command path). The proposal path loads items
// scoped to the project already, so `tripProjectId` may be omitted on references
// and the same-project check is satisfied by membership in `knownItems`.
export function validatePlanReferencesRules(
  tripProjectId: string,
  values: { kind: string; parentItemId?: string | null; backupTargetItemId?: string | null },
  knownItems: PlanItemReference[],
  itemId?: string,
): string | null {
  const knownById = new Map<string, PlanItemReference>();
  for (const item of knownItems) {
    if (item && typeof item.id === "string" && item.id) {
      knownById.set(item.id, item);
    }
  }

  if (values.parentItemId) {
    if (values.kind !== "activity") return "Invalid trip plan parent.";
    if (values.parentItemId === itemId) return "Invalid trip plan parent.";
    const parent = knownById.get(values.parentItemId);
    if (!parent) return "Invalid trip plan parent.";
    if (parent.tripProjectId !== undefined && parent.tripProjectId !== tripProjectId) return "Invalid trip plan parent.";
    if (parent.kind !== "leg") return "Invalid trip plan parent.";
  }

  if (values.backupTargetItemId) {
    if (values.backupTargetItemId === itemId) return "Invalid trip plan backup target.";
    const target = knownById.get(values.backupTargetItemId);
    if (!target) return "Invalid trip plan backup target.";
    if (target.tripProjectId !== undefined && target.tripProjectId !== tripProjectId) return "Invalid trip plan backup target.";
    const seen = new Set<string>(itemId ? [itemId] : []);
    let targetId: string | null = values.backupTargetItemId;
    while (targetId) {
      if (seen.has(targetId)) return "Invalid trip plan backup target.";
      seen.add(targetId);
      const next = knownById.get(targetId);
      targetId = next?.backupTargetItemId ?? null;
    }
  }

  return null;
}
