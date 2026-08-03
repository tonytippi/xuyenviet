export type PlanItemReference = { id: string; kind: string; tripProjectId?: string; backupTargetItemId: string | null };

export function validatePlanReferencesRules(tripProjectId: string, values: { kind: string; parentItemId?: string | null; backupTargetItemId?: string | null }, knownItems: PlanItemReference[], itemId?: string): string | null {
  const knownById = new Map(knownItems.filter((item) => Boolean(item?.id)).map((item) => [item.id, item]));
  if (values.parentItemId) {
    const parent = knownById.get(values.parentItemId);
    if (values.kind !== "activity" || values.parentItemId === itemId || !parent || parent.tripProjectId !== undefined && parent.tripProjectId !== tripProjectId || parent.kind !== "leg") return "Invalid trip plan parent.";
  }
  if (values.backupTargetItemId) {
    const target = knownById.get(values.backupTargetItemId);
    if (values.backupTargetItemId === itemId || !target || target.tripProjectId !== undefined && target.tripProjectId !== tripProjectId) return "Invalid trip plan backup target.";
    const seen = new Set<string>(itemId ? [itemId] : []);
    for (let targetId: string | null = values.backupTargetItemId; targetId; targetId = knownById.get(targetId)?.backupTargetItemId ?? null) {
      if (seen.has(targetId)) return "Invalid trip plan backup target.";
      seen.add(targetId);
    }
  }
  return null;
}
