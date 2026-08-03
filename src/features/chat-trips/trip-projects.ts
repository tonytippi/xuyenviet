import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { conversations, messages, tripPlanItems, tripProjectConstraints, tripProjects, type TripPlanAnchorRole, type TripPlanItemKind, type TripPlanItemState, type TripPlanItemType } from "@/db/schema";
import { buildTripWorkspaceReadModelWithConstraints, type ConstraintsProjection, type PendingProposalFocusInput, type PlanHistoryEntryView, type TimelineGroup, type TripHomeFocus, type TripPlanItemProjection } from "@/features/chat-trips/trip-home";
import { formatPlanHistoryRow, listPlanHistoryForTripProject, listPendingProposalsForTripProject, type OwnedTripChangeProposalSummary } from "@/features/chat-trips/trip-change-proposals";
import { getAuthenticatedSession } from "@/server/auth";
import { formatTripProjectLabel } from "./labels";

export { formatTripProjectLabel };

const previewMaxLength = 60;
const maxOwnedTripProjectsLimit = 100;
const maxRelatedChatsRowLimit = 1_000;

export type OwnedTripProjectSummary = {
  id: string;
  title: string;
  origin: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  travelers: string | null;
  notes: string | null;
  updatedAt: Date;
};

export type OwnedTripProjectWorkspaceSummary = OwnedTripProjectSummary & {
  primaryConversation: { id: string; updatedAt: Date; preview: string };
  historicChats: Array<{ id: string; updatedAt: Date; preview: string }>;
  planItems: TripPlanItemProjection[];
  timelineGroups: TimelineGroup[];
  constraints: ConstraintsProjection | null;
  tripHome: TripHomeFocus;
  pendingProposals: OwnedTripChangeProposalSummary[];
  // Story 7.5 (AC4): owner-visible plan history (bounded preview). Populated
  // from listPlanHistoryForTripProject + formatPlanHistoryRow so the workspace
  // panel can render the history entry without a second round-trip. Never
  // exposes raw model prompts/responses.
  planHistory: PlanHistoryEntryView[];
};

export async function listOwnedTripProjects(): Promise<OwnedTripProjectSummary[] | null> {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  return getDb()
    .select({
      id: tripProjects.id,
      title: tripProjects.title,
      origin: tripProjects.origin,
      destination: tripProjects.destination,
      startDate: tripProjects.startDate,
      endDate: tripProjects.endDate,
      travelers: tripProjects.travelers,
      notes: tripProjects.notes,
      updatedAt: tripProjects.updatedAt,
    })
    .from(tripProjects)
    .where(eq(tripProjects.userId, session.userId))
    .orderBy(desc(tripProjects.updatedAt), desc(tripProjects.id))
    .limit(maxOwnedTripProjectsLimit);
}

export async function getOwnedTripProject(tripProjectId: string) {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  return getOwnedTripProjectForSession(session, tripProjectId);
}

export async function getOwnedTripProjectSummary(tripProjectId: string) {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  const project = await getOwnedTripProjectForSession(session, tripProjectId);
  if (!project) return null;
  const [persistedPrimaryConversation] = project.primaryConversationId
    ? await getDb()
      .select({ id: conversations.id, updatedAt: conversations.updatedAt })
      .from(conversations)
      .where(and(eq(conversations.id, project.primaryConversationId), eq(conversations.userId, session.userId), eq(conversations.tripProjectId, tripProjectId)))
      .limit(1)
    : [];

  const rows = await getDb()
    .select({ id: conversations.id, updatedAt: conversations.updatedAt, messageContent: messages.content })
    .from(conversations)
    .leftJoin(messages, and(eq(messages.conversationId, conversations.id), eq(messages.userId, session.userId), eq(messages.role, "user")))
    .where(and(eq(conversations.userId, session.userId), eq(conversations.tripProjectId, tripProjectId)))
    .orderBy(desc(conversations.updatedAt), desc(conversations.id), asc(messages.createdAt), asc(messages.id))
    .limit(maxRelatedChatsRowLimit);

  const seenConversationIds = new Set<string>();
  const relatedChats: Array<{ id: string; updatedAt: Date; preview: string }> = [];

  for (const row of rows) {
    if (seenConversationIds.has(row.id)) {
      continue;
    }

    seenConversationIds.add(row.id);
    relatedChats.push({ id: row.id, updatedAt: row.updatedAt, preview: formatPreview(row.messageContent) });
  }

  const primaryConversation = persistedPrimaryConversation
    ? relatedChats.find((chat) => chat.id === persistedPrimaryConversation.id) ?? { ...persistedPrimaryConversation, preview: "Hội thoại mới" }
    : relatedChats[0];
  if (!primaryConversation) return null;

  const primarySummary = primaryConversation;

  const planItemRows = await getDb()
    .select({
      id: tripPlanItems.id,
      kind: tripPlanItems.kind,
      anchorRole: tripPlanItems.anchorRole,
      type: tripPlanItems.type,
      state: tripPlanItems.state,
      label: tripPlanItems.label,
      notes: tripPlanItems.notes,
      plannedAt: tripPlanItems.plannedAt,
      ordinal: tripPlanItems.ordinal,
      parentItemId: tripPlanItems.parentItemId,
      backupTargetItemId: tripPlanItems.backupTargetItemId,
      transportOriginLabel: tripPlanItems.transportOriginLabel,
      transportDestinationLabel: tripPlanItems.transportDestinationLabel,
      accommodationPlaceAreaLabel: tripPlanItems.accommodationPlaceAreaLabel,
      createdAt: tripPlanItems.createdAt,
    })
    .from(tripPlanItems)
    .where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, session.userId)))
    .orderBy(sql`${tripPlanItems.parentItemId} asc nulls first, ${tripPlanItems.ordinal} asc`);

  const planItems: TripPlanItemProjection[] = planItemRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    anchorRole: row.anchorRole,
    type: row.type,
    state: row.state,
    label: row.label,
    notes: row.notes,
    plannedAt: row.plannedAt,
    ordinal: row.ordinal,
    parentItemId: row.parentItemId,
    backupTargetItemId: row.backupTargetItemId,
    transportOriginLabel: row.transportOriginLabel,
    transportDestinationLabel: row.transportDestinationLabel,
    accommodationPlaceAreaLabel: row.accommodationPlaceAreaLabel,
    createdAt: row.createdAt,
  }));

  const [constraintsRow] = await getDb()
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
    .where(and(eq(tripProjectConstraints.tripProjectId, tripProjectId), eq(tripProjectConstraints.userId, session.userId)))
    .limit(1);

  const now = new Date();
  const pendingProposals = (await listPendingProposalsForTripProject(tripProjectId)) ?? [];
  const pendingProposalFocusInputs: PendingProposalFocusInput[] = pendingProposals.map((proposal) => ({
    id: proposal.id,
    expiresAt: proposal.expiresAt,
    createdAt: proposal.createdAt,
    rationale: proposal.rationale,
    status: proposal.status,
    affectedItems: proposal.affectedItems,
    beforeAfter: proposal.beforeAfter,
    alternatives: proposal.alternatives,
    hasAlternatives: proposal.hasAlternatives,
  }));
  const workspaceReadModel = buildTripWorkspaceReadModelWithConstraints({ items: planItems, pendingProposals: pendingProposalFocusInputs, now }, constraintsRow);

  // Story 7.5 (AC4): load the owner-visible plan history (bounded preview) so
  // the workspace panel can render the history entry without a second
  // round-trip. The read is owner-scoped and free of provider calls.
  const planHistoryRows = (await listPlanHistoryForTripProject(tripProjectId)) ?? [];
  const planHistory: PlanHistoryEntryView[] = planHistoryRows.map((row) => {
    const view = formatPlanHistoryRow(row);
    return {
      proposalId: view.proposalId,
      operationLabel: view.operationLabel,
      actorLabel: view.actorLabel,
      timestampLabel: view.timestampLabel,
      affectedItemLabels: view.affectedItemLabels,
      beforeAfter: view.beforeAfter,
    };
  });

  return {
    ...project,
    primaryConversation: primarySummary,
    historicChats: relatedChats.filter((chat) => chat.id !== primaryConversation.id),
    planItems,
    timelineGroups: workspaceReadModel.timelineGroups,
    constraints: workspaceReadModel.constraints,
    tripHome: workspaceReadModel.focus,
    pendingProposals,
    planHistory,
  } satisfies OwnedTripProjectWorkspaceSummary;
}

// Story 7.4: Chat/Trips-owned aggregate read for AI proposal drafting. Non-owning
// modules (AI Orchestration) read the current Trip Planning aggregate through this
// helper instead of importing Chat/Trips-owned tables directly (ownership boundary
// per AD-29/AD-30). Returns only the fields the draft prompt needs; writes nothing.
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
  session: { userId: string },
): Promise<TripProjectAggregateForDraft | null> {
  const [project] = await getDb()
    .select({ id: tripProjects.id, aggregateVersion: tripProjects.aggregateVersion })
    .from(tripProjects)
    .where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId)))
    .limit(1);

  if (!project) return null;

  const itemRows = await getDb()
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
    .where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, session.userId)));

  const [constraintsRow] = await getDb()
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
    .where(and(eq(tripProjectConstraints.tripProjectId, tripProjectId), eq(tripProjectConstraints.userId, session.userId)))
    .limit(1);

  return {
    aggregateVersion: project.aggregateVersion,
    items: itemRows,
    constraints: constraintsRow ?? null,
  };
}

async function getOwnedTripProjectForSession(session: { userId: string }, tripProjectId: string) {
  const [project] = await getDb()
    .select({
      id: tripProjects.id,
      title: tripProjects.title,
      origin: tripProjects.origin,
      destination: tripProjects.destination,
      startDate: tripProjects.startDate,
      endDate: tripProjects.endDate,
      travelers: tripProjects.travelers,
      notes: tripProjects.notes,
      updatedAt: tripProjects.updatedAt,
      primaryConversationId: tripProjects.primaryConversationId,
    })
    .from(tripProjects)
    .where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId)))
    .limit(1);

  return project ?? null;
}

function formatPreview(content: string | null): string {
  if (!content) {
    return "Hội thoại mới";
  }

  const trimmed = content.trim();

  if (trimmed.length <= previewMaxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, previewMaxLength).trimEnd()}…`;
}
