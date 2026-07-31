import { and, eq } from "drizzle-orm";

import { getDb } from "@xuyenviet/database";
import { tripPlanItems, tripProjectConstraints, tripProjects, type TripPlanAnchorRole, type TripPlanItemKind, type TripPlanItemState, type TripPlanItemType } from "@xuyenviet/database";

// The worker reads this owner-scoped projection to draft a proposal. Web-facing
// project commands and workspace reads remain in the application package.
export type TripProjectAggregateForDraft = {
  aggregateVersion: number;
  items: Array<{
    id: string;
    kind: TripPlanItemKind;
    anchorRole: TripPlanAnchorRole | null;
    type: TripPlanItemType | null;
    state: TripPlanItemState;
    label: string;
    ordinal: number;
    parentItemId: string | null;
    backupTargetItemId: string | null;
    transportOriginLabel: string | null;
    transportDestinationLabel: string | null;
    accommodationPlaceAreaLabel: string | null;
    version: number;
  }>;
  constraints: Record<string, unknown> | null;
};

export async function readOwnedTripProjectAggregateForProposalDraft(
  tripProjectId: string,
  owner: { userId: string },
): Promise<TripProjectAggregateForDraft | null> {
  const [project] = await getDb()
    .select({ id: tripProjects.id, aggregateVersion: tripProjects.aggregateVersion })
    .from(tripProjects)
    .where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, owner.userId)))
    .limit(1);
  if (!project) return null;

  const items = await getDb()
    .select({
      id: tripPlanItems.id,
      kind: tripPlanItems.kind,
      anchorRole: tripPlanItems.anchorRole,
      type: tripPlanItems.type,
      state: tripPlanItems.state,
      label: tripPlanItems.label,
      ordinal: tripPlanItems.ordinal,
      parentItemId: tripPlanItems.parentItemId,
      backupTargetItemId: tripPlanItems.backupTargetItemId,
      transportOriginLabel: tripPlanItems.transportOriginLabel,
      transportDestinationLabel: tripPlanItems.transportDestinationLabel,
      accommodationPlaceAreaLabel: tripPlanItems.accommodationPlaceAreaLabel,
      version: tripPlanItems.version,
    })
    .from(tripPlanItems)
    .where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, owner.userId)));
  const [constraints] = await getDb()
    .select({
      adultCount: tripProjectConstraints.adultCount,
      childCount: tripProjectConstraints.childCount,
      children: tripProjectConstraints.children,
      vehicleType: tripProjectConstraints.vehicleType,
      evChargingNeed: tripProjectConstraints.evChargingNeed,
      drivingToleranceHours: tripProjectConstraints.drivingToleranceHours,
      budgetCurrency: tripProjectConstraints.budgetCurrency,
      budgetMinVnd: tripProjectConstraints.budgetMinVnd,
      budgetMaxVnd: tripProjectConstraints.budgetMaxVnd,
      preferenceTags: tripProjectConstraints.preferenceTags,
      avoidItems: tripProjectConstraints.avoidItems,
    })
    .from(tripProjectConstraints)
    .where(and(eq(tripProjectConstraints.tripProjectId, tripProjectId), eq(tripProjectConstraints.userId, owner.userId)))
    .limit(1);

  return { aggregateVersion: project.aggregateVersion, items, constraints: constraints ?? null };
}
