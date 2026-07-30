import "server-only";

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { chatContext, conversations, messages, tripAnswerContextSnapshots, tripChangeProposals, tripPlanItems, tripProjectConstraints, tripProjects, type TripPlanAnchorRole, type TripPlanItemKind, type TripPlanItemState, type TripPlanItemType } from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
import { toUserAuditActor } from "@/features/audit/actors";
import { buildTripWorkspaceReadModelWithConstraints, type ConstraintsProjection, type PendingProposalFocusInput, type PlanHistoryEntryView, type TimelineGroup, type TripHomeFocus, type TripPlanItemProjection } from "@/features/chat-trips/trip-home";
import { formatPlanHistoryRow, listPlanHistoryForTripProject, listPendingProposalsForTripProject, type OwnedTripChangeProposalSummary } from "@/features/chat-trips/trip-change-proposals";
import { validatePlanReferencesRules } from "@/features/chat-trips/plan-references";
import { getAuthenticatedSession } from "@/server/auth";
import { discardAiAskCommandsForDeletedConversations } from "@/features/ai/ai-ask-commands";

import { formatTripProjectLabel } from "./labels";

export { formatTripProjectLabel };

const previewMaxLength = 60;
const maxTitleLength = 160;
const maxTripFieldLength = 500;
const maxNotesLength = 2_000;
const maxOwnedTripProjectsLimit = 100;
const maxRelatedChatsRowLimit = 1_000;
const tripDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export type TripProjectInput = {
  title: string;
  origin?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  travelers?: string | null;
  notes?: string | null;
};

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

export type DeleteOwnedTripProjectResult = {
  success: boolean;
  reason?: "unauthenticated" | "not_found" | "failed";
};

type AggregateMutationResult = { success: true; aggregateVersion: number; itemId?: string } | { success: false; reason: "unauthenticated" | "not_found" | "refresh_required" | "invalid" };
export type InternalPlanItemInput = { kind: TripPlanItemKind; anchorRole?: TripPlanAnchorRole | null; type?: TripPlanItemType | null; state: TripPlanItemState; label: string; notes?: string | null; plannedAt?: Date | null; ordinal: number; parentItemId?: string | null; backupTargetItemId?: string | null; transportOriginLabel?: string | null; transportDestinationLabel?: string | null; accommodationPlaceAreaLabel?: string | null };
export type InternalConstraintsInput = { adultCount?: number | null; childCount?: number | null; children?: unknown[] | null; vehicleType?: "car" | "motorcycle" | "ev" | null; evChargingNeed?: "none" | "preferred" | "required" | null; drivingToleranceHours?: number | null; budgetCurrency?: "VND" | null; budgetMinVnd?: number | null; budgetMaxVnd?: number | null; preferenceTags?: string[] | null; avoidItems?: unknown[] | null };
export type InternalReorderInput = { itemId: string; expectedItemVersion: number; parentItemId?: string | null; ordinal: number; expectedChangedItemVersions: Record<string, number> };

export async function createTripProject(input: TripProjectInput): Promise<OwnedTripProjectSummary> {
  const session = await getAuthenticatedSession();

  if (!session) {
    throw new Error("Authentication required to create a trip project.");
  }

  const values = normalizeTripProjectInput(input);
  const db = getDb();

  return db.transaction(async (transaction) => {
    const [project] = await transaction.insert(tripProjects).values({ userId: session.userId, ...values }).returning({
      id: tripProjects.id,
      title: tripProjects.title,
      origin: tripProjects.origin,
      destination: tripProjects.destination,
      startDate: tripProjects.startDate,
      endDate: tripProjects.endDate,
      travelers: tripProjects.travelers,
      notes: tripProjects.notes,
      updatedAt: tripProjects.updatedAt,
    });

    await recordAuditEvent({
      actor: toUserAuditActor({ userId: session.userId, email: session.email }),
      operation: "create",
      targetType: "trip_project",
      targetId: project.id,
      afterSummary: formatTripProjectAuditSummary(project),
    }, transaction);

    return project;
  });
}

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

  const primaryConversation = await getDb().transaction((transaction) => resolveOwnedPrimaryConversationInTransaction(transaction, session.userId, tripProjectId));
  if (!primaryConversation) return null;
  const project = await getOwnedTripProjectForSession(session, tripProjectId);
  if (!project) return null;

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

  const primarySummary = relatedChats.find((chat) => chat.id === primaryConversation.id) ?? {
    id: primaryConversation.id,
    updatedAt: primaryConversation.updatedAt,
    preview: "Hội thoại mới",
  };

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

export async function resolveOwnedPrimaryConversation(tripProjectId: string) {
  const session = await getAuthenticatedSession();
  if (!session) return null;
  return getDb().transaction((transaction) => resolveOwnedPrimaryConversationInTransaction(transaction, session.userId, tripProjectId));
}

export async function resolveOwnedPrimaryConversationInTransaction(
  transaction: Transaction,
  userId: string,
  tripProjectId: string,
) {
  const [project] = await transaction
    .select({ id: tripProjects.id, userId: tripProjects.userId, primaryConversationId: tripProjects.primaryConversationId, aggregateVersion: tripProjects.aggregateVersion })
    .from(tripProjects)
    .where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId)))
    .limit(1)
    .for("update");
  if (!project) return null;

  if (project.primaryConversationId) {
    const [primary] = await transaction
      .select({ id: conversations.id, tripProjectId: conversations.tripProjectId, lifecycleVersion: conversations.lifecycleVersion, updatedAt: conversations.updatedAt })
      .from(conversations)
      .where(and(eq(conversations.id, project.primaryConversationId), eq(conversations.userId, userId), eq(conversations.tripProjectId, tripProjectId)))
      .limit(1)
      .for("update");
    if (primary) return primary;
  }

  const [existing] = await transaction
    .select({ id: conversations.id, tripProjectId: conversations.tripProjectId, lifecycleVersion: conversations.lifecycleVersion, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.tripProjectId, tripProjectId)))
    .orderBy(desc(conversations.updatedAt), desc(conversations.id))
    .limit(1)
    .for("update");
  const [primary] = existing
    ? [existing]
    : await transaction.insert(conversations).values({ userId, tripProjectId }).returning({ id: conversations.id, tripProjectId: conversations.tripProjectId, lifecycleVersion: conversations.lifecycleVersion, updatedAt: conversations.updatedAt });
  if (project.primaryConversationId !== primary.id) {
    await transaction.update(conversations).set({ lifecycleVersion: sql`${conversations.lifecycleVersion} + 1`, updatedAt: new Date() }).where(and(eq(conversations.id, primary.id), eq(conversations.userId, userId)));
    await transaction.update(tripProjects).set({ primaryConversationId: primary.id, aggregateVersion: project.aggregateVersion + 1, updatedAt: new Date() }).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId)));
    return { ...primary, lifecycleVersion: primary.lifecycleVersion + 1 };
  }
  return primary;
}

export async function deleteOwnedTripProject(tripProjectId: string): Promise<DeleteOwnedTripProjectResult> {
  const session = await getAuthenticatedSession();

  if (!session) {
    return { success: false, reason: "unauthenticated" };
  }

  try {
    return await getDb().transaction(async (transaction) => {
      const [project] = await transaction
        .select({ id: tripProjects.id })
        .from(tripProjects)
        .where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId)))
        .limit(1)
        .for("update");

      if (!project) {
        return { success: false, reason: "not_found" };
      }

      await transaction.update(tripProjects).set({ primaryConversationId: null, aggregateVersion: sql`${tripProjects.aggregateVersion} + 1`, updatedAt: new Date() }).where(and(eq(tripProjects.id, project.id), eq(tripProjects.userId, session.userId)));

      const [linkedConversationCount] = await transaction.select({ count: count() }).from(conversations).where(and(eq(conversations.tripProjectId, project.id), eq(conversations.userId, session.userId)));
      const [projectContextCount] = await transaction.select({ count: count() }).from(chatContext).where(and(eq(chatContext.tripProjectId, project.id), eq(chatContext.userId, session.userId)));
      const [planItemCount] = await transaction.select({ count: count() }).from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, project.id), eq(tripPlanItems.userId, session.userId)));
      const [constraintCount] = await transaction.select({ count: count() }).from(tripProjectConstraints).where(and(eq(tripProjectConstraints.tripProjectId, project.id), eq(tripProjectConstraints.userId, session.userId)));
      const [proposalCount] = await transaction.select({ count: count() }).from(tripChangeProposals).where(and(eq(tripChangeProposals.tripProjectId, project.id), eq(tripChangeProposals.userId, session.userId)));

      const linkedConversations = await transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.tripProjectId, project.id), eq(conversations.userId, session.userId))).orderBy(asc(conversations.id)).for("update");
      await discardAiAskCommandsForDeletedConversations(transaction, session.userId, linkedConversations.map((conversation) => conversation.id));
      await transaction.update(conversations).set({ lifecycleVersion: sql`${conversations.lifecycleVersion} + 1`, updatedAt: new Date() }).where(and(eq(conversations.tripProjectId, project.id), eq(conversations.userId, session.userId)));
      // Preserve independent historical chats, but remove immutable evidence that
      // contains deleted project state before unlinking the conversations.
       const linkedConversationIds = linkedConversations.map((conversation) => conversation.id);
       if (linkedConversationIds.length > 0) {
         await transaction.delete(tripAnswerContextSnapshots).where(and(eq(tripAnswerContextSnapshots.userId, session.userId), inArray(tripAnswerContextSnapshots.conversationId, linkedConversationIds)));
       }
       // This composite FK includes trip_project_id, so project-scoped context
       // must leave before its conversation is detached from the project.
       await transaction.delete(chatContext).where(and(eq(chatContext.tripProjectId, project.id), eq(chatContext.userId, session.userId)));
       await transaction.update(conversations).set({ tripProjectId: null, updatedAt: new Date() }).where(and(eq(conversations.tripProjectId, project.id), eq(conversations.userId, session.userId)));

      const deletedRows = await transaction
        .delete(tripProjects)
        .where(and(eq(tripProjects.id, project.id), eq(tripProjects.userId, session.userId)))
        .returning({ id: tripProjects.id });

      if (deletedRows.length !== 1) {
        return { success: false, reason: "not_found" };
      }

      await recordAuditEvent({
        actor: toUserAuditActor({ userId: session.userId, email: session.email }),
        operation: "delete",
        targetType: "trip_project",
        targetId: project.id,
        beforeSummary: JSON.stringify({
          tripProjectId: project.id,
          linkedConversationCount: linkedConversationCount?.count ?? 0,
          chatContextCount: projectContextCount?.count ?? 0,
          planItemCount: planItemCount?.count ?? 0,
          constraintCount: constraintCount?.count ?? 0,
          proposalCount: proposalCount?.count ?? 0,
        }),
        afterSummary: JSON.stringify({ deleted: true, linkedConversationsUnlinked: true }),
      }, transaction);

      return { success: true };
    });
  } catch (error) {
    console.error("Failed to delete owned trip project.", { tripProjectId, userId: session.userId, error });
    return { success: false, reason: "failed" };
  }
}

// Story 7.5: a shared transaction type alias for the *InTransaction helpers
// extracted from the public plan-item primitives. The apply orchestrator
// threads one transaction through every helper so the aggregate version
// advances exactly once for the whole proposal and a failure in op 3 rolls
// back ops 1 and 2 (AD-30).
type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;

// These are deliberately internal primitives for aggregate tests and future proposal application.
// No route, action, or chat pipeline calls them.
export async function createInternalTripPlanItem(tripProjectId: string, expectedAggregateVersion: number, input: InternalPlanItemInput): Promise<AggregateMutationResult> {
  const session = await getAuthenticatedSession();
  if (!session) return { success: false, reason: "unauthenticated" };
  try {
    const values = normalizePlanItem(input);
    return await getDb().transaction((transaction) => createTripPlanItemInTransaction(transaction, session, tripProjectId, expectedAggregateVersion, values));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid trip plan")) return { success: false, reason: "invalid" };
    throw error;
  }
}

// Story 7.5: the core mutation body extracted so applyApprovedTripChange can
// run every typed operation inside one locked transaction without re-locking
// or stale version errors. Does NOT call getDb().transaction itself.
export async function createTripPlanItemInTransaction(
  transaction: Transaction,
  session: { userId: string; email: string },
  tripProjectId: string,
  expectedAggregateVersion: number,
  values: ReturnType<typeof normalizePlanItem>,
): Promise<AggregateMutationResult> {
  const [project] = await transaction.select({ version: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId))).limit(1).for("update");
  if (!project) return { success: false, reason: "not_found" };
  if (project.version !== expectedAggregateVersion) return { success: false, reason: "refresh_required" };
  await validatePlanReferences(transaction, tripProjectId, session.userId, values);
  const [item] = await transaction.insert(tripPlanItems).values({ tripProjectId, userId: session.userId, ...values }).returning({ id: tripPlanItems.id });
  const nextVersion = project.version + 1;
  await transaction.update(tripProjects).set({ aggregateVersion: nextVersion, updatedAt: new Date() }).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId)));
  await recordAuditEvent({ actor: toUserAuditActor({ userId: session.userId, email: session.email }), operation: "create", targetType: "trip_plan_item", targetId: item.id, afterSummary: JSON.stringify({ tripProjectId, aggregateVersion: nextVersion }) }, transaction);
  return { success: true, aggregateVersion: nextVersion, itemId: item.id };
}

export async function upsertInternalTripProjectConstraints(tripProjectId: string, expectedAggregateVersion: number, expectedConstraintsVersion: number | null, input: InternalConstraintsInput): Promise<AggregateMutationResult> {
  const session = await getAuthenticatedSession();
  if (!session) return { success: false, reason: "unauthenticated" };
  try {
    const values = normalizeConstraints(input);
    return await getDb().transaction((transaction) => upsertInternalTripProjectConstraintsInTransaction(transaction, session, tripProjectId, expectedAggregateVersion, expectedConstraintsVersion, values));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid trip constraints")) return { success: false, reason: "invalid" };
    throw error;
  }
}

// Story 7.5: the core constraints upsert body extracted for the apply orchestrator.
export async function upsertInternalTripProjectConstraintsInTransaction(
  transaction: Transaction,
  session: { userId: string; email: string },
  tripProjectId: string,
  expectedAggregateVersion: number,
  expectedConstraintsVersion: number | null,
  values: ReturnType<typeof normalizeConstraints>,
): Promise<AggregateMutationResult> {
  const [project] = await transaction.select({ version: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId))).limit(1).for("update");
  if (!project) return { success: false, reason: "not_found" };
  if (project.version !== expectedAggregateVersion) return { success: false, reason: "refresh_required" };
  const [existing] = await transaction.select({ version: tripProjectConstraints.version }).from(tripProjectConstraints).where(and(eq(tripProjectConstraints.tripProjectId, tripProjectId), eq(tripProjectConstraints.userId, session.userId))).limit(1);
  if (existing && existing.version !== expectedConstraintsVersion) return { success: false, reason: "refresh_required" };
  if (!existing && expectedConstraintsVersion !== null) return { success: false, reason: "refresh_required" };
  if (existing) await transaction.update(tripProjectConstraints).set({ ...values, version: existing.version + 1, updatedAt: new Date() }).where(and(eq(tripProjectConstraints.tripProjectId, tripProjectId), eq(tripProjectConstraints.userId, session.userId)));
  else await transaction.insert(tripProjectConstraints).values({ tripProjectId, userId: session.userId, ...values });
  const nextVersion = project.version + 1;
  await transaction.update(tripProjects).set({ aggregateVersion: nextVersion, updatedAt: new Date() }).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId)));
  await recordAuditEvent({ actor: toUserAuditActor({ userId: session.userId, email: session.email }), operation: existing ? "update" : "create", targetType: "trip_project_constraints", targetId: tripProjectId, afterSummary: JSON.stringify({ tripProjectId, aggregateVersion: nextVersion }) }, transaction);
  return { success: true, aggregateVersion: nextVersion };
}

export async function updateInternalTripPlanItem(tripProjectId: string, expectedAggregateVersion: number, itemId: string, expectedItemVersion: number, input: InternalPlanItemInput): Promise<AggregateMutationResult> {
  const session = await getAuthenticatedSession();
  if (!session) return { success: false, reason: "unauthenticated" };
  try {
    const values = normalizePlanItem(input);
    return await getDb().transaction((transaction) => updateTripPlanItemInTransaction(transaction, session, tripProjectId, expectedAggregateVersion, itemId, expectedItemVersion, values));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid trip plan")) return { success: false, reason: "invalid" };
    throw error;
  }
}

// Story 7.5: the core update body extracted for the apply orchestrator.
export async function updateTripPlanItemInTransaction(
  transaction: Transaction,
  session: { userId: string; email: string },
  tripProjectId: string,
  expectedAggregateVersion: number,
  itemId: string,
  expectedItemVersion: number,
  values: ReturnType<typeof normalizePlanItem>,
): Promise<AggregateMutationResult> {
  const project = await lockAggregate(transaction, tripProjectId, session.userId, expectedAggregateVersion);
  if (!project.success) return project;
  const [item] = await transaction.select().from(tripPlanItems).where(and(eq(tripPlanItems.id, itemId), eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, session.userId))).limit(1);
  if (!item) return { success: false, reason: "not_found" };
  if (item.version !== expectedItemVersion) return { success: false, reason: "refresh_required" };
  await validatePlanReferences(transaction, tripProjectId, session.userId, values, itemId);
  await transaction.update(tripPlanItems).set({ ...values, version: item.version + 1, updatedAt: new Date() }).where(eq(tripPlanItems.id, itemId));
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, session.userId, project.version);
  await recordAggregateAudit(transaction, session, "update", "trip_plan_item", itemId, tripProjectId, aggregateVersion);
  return { success: true, aggregateVersion, itemId };
}

export async function deleteInternalTripPlanItem(tripProjectId: string, expectedAggregateVersion: number, itemId: string, expectedItemVersion: number): Promise<AggregateMutationResult> {
  const session = await getAuthenticatedSession();
  if (!session) return { success: false, reason: "unauthenticated" };
  return getDb().transaction((transaction) => deleteTripPlanItemInTransaction(transaction, session, tripProjectId, expectedAggregateVersion, itemId, expectedItemVersion));
}

// Story 7.5: the core delete body extracted for the apply orchestrator.
export async function deleteTripPlanItemInTransaction(
  transaction: Transaction,
  session: { userId: string; email: string },
  tripProjectId: string,
  expectedAggregateVersion: number,
  itemId: string,
  expectedItemVersion: number,
): Promise<AggregateMutationResult> {
  const project = await lockAggregate(transaction, tripProjectId, session.userId, expectedAggregateVersion);
  if (!project.success) return project;
  const [item] = await transaction.select({ version: tripPlanItems.version }).from(tripPlanItems).where(and(eq(tripPlanItems.id, itemId), eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, session.userId))).limit(1);
  if (!item) return { success: false, reason: "not_found" };
  if (item.version !== expectedItemVersion) return { success: false, reason: "refresh_required" };
  const [dependent] = await transaction.select({ id: tripPlanItems.id }).from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, session.userId), eq(tripPlanItems.parentItemId, itemId))).limit(1);
  const [backup] = await transaction.select({ id: tripPlanItems.id }).from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, session.userId), eq(tripPlanItems.backupTargetItemId, itemId))).limit(1);
  if (dependent || backup) return { success: false, reason: "invalid" };
  await transaction.delete(tripPlanItems).where(eq(tripPlanItems.id, itemId));
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, session.userId, project.version);
  await recordAggregateAudit(transaction, session, "delete", "trip_plan_item", itemId, tripProjectId, aggregateVersion);
  return { success: true, aggregateVersion, itemId };
}

export async function reorderInternalTripPlanItem(tripProjectId: string, expectedAggregateVersion: number, input: InternalReorderInput): Promise<AggregateMutationResult> {
  const session = await getAuthenticatedSession();
  if (!session) return { success: false, reason: "unauthenticated" };
  try {
    if (!Number.isInteger(input.ordinal) || input.ordinal < 0) throw new Error("Invalid trip plan ordinal.");
    return await getDb().transaction((transaction) => reorderTripPlanItemInTransaction(transaction, session, tripProjectId, expectedAggregateVersion, input));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid trip plan")) return { success: false, reason: "invalid" };
    throw error;
  }
}

// Story 7.5: the core reorder body extracted for the apply orchestrator.
export async function reorderTripPlanItemInTransaction(
  transaction: Transaction,
  session: { userId: string; email: string },
  tripProjectId: string,
  expectedAggregateVersion: number,
  input: InternalReorderInput,
): Promise<AggregateMutationResult> {
  if (!Number.isInteger(input.ordinal) || input.ordinal < 0) throw new Error("Invalid trip plan ordinal.");
  const project = await lockAggregate(transaction, tripProjectId, session.userId, expectedAggregateVersion);
  if (!project.success) return project;
  const rows = await transaction.select().from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, session.userId))).for("update");
  const item = rows.find((row) => row.id === input.itemId);
  if (!item) return { success: false, reason: "not_found" };
  if (item.version !== input.expectedItemVersion) return { success: false, reason: "refresh_required" };
  const nextParentId = input.parentItemId ?? null;
  const candidate = normalizePlanItem({ kind: item.kind, anchorRole: item.anchorRole, type: item.type, state: item.state, label: item.label, notes: item.notes, plannedAt: item.plannedAt, ordinal: input.ordinal, parentItemId: nextParentId, backupTargetItemId: item.backupTargetItemId, transportOriginLabel: item.transportOriginLabel, transportDestinationLabel: item.transportDestinationLabel, accommodationPlaceAreaLabel: item.accommodationPlaceAreaLabel });
  await validatePlanReferences(transaction, tripProjectId, session.userId, candidate, item.id);
  const sameScope = (row: typeof item, parentId: string | null) => row.parentItemId === parentId;
  const oldScope = rows.filter((row) => sameScope(row, item.parentItemId) && row.id !== item.id).sort((a, b) => a.ordinal - b.ordinal);
  const newScope = item.parentItemId === nextParentId ? oldScope : rows.filter((row) => sameScope(row, nextParentId)).sort((a, b) => a.ordinal - b.ordinal);
  const destination = Math.min(input.ordinal, newScope.length);
  const reordered = item.parentItemId === nextParentId ? oldScope : [...oldScope, ...newScope];
  const changedIds = new Set([...reordered.map((row) => row.id), item.id]);
  if (Object.keys(input.expectedChangedItemVersions).length !== changedIds.size || [...changedIds].some((id) => input.expectedChangedItemVersions[id] !== rows.find((row) => row.id === id)?.version)) return { success: false, reason: "refresh_required" };
  // Move affected rows out of their unique ordinal scopes before writing their final sequence.
  const temporaryOrdinalStart = Math.max(...rows.map((row) => row.ordinal)) + rows.length + 1;
  for (const [index, row] of [...reordered, item].entries()) await transaction.update(tripPlanItems).set({ ordinal: temporaryOrdinalStart + index }).where(eq(tripPlanItems.id, row.id));
  const destinationRows = newScope.slice(); destinationRows.splice(destination, 0, item);
  const sourceRows = item.parentItemId === nextParentId ? destinationRows : oldScope;
  for (const [ordinal, row] of destinationRows.entries()) await transaction.update(tripPlanItems).set({ parentItemId: nextParentId, ordinal, version: row.version + 1, updatedAt: new Date() }).where(eq(tripPlanItems.id, row.id));
  if (item.parentItemId !== nextParentId) for (const [ordinal, row] of sourceRows.entries()) await transaction.update(tripPlanItems).set({ ordinal, version: row.version + 1, updatedAt: new Date() }).where(eq(tripPlanItems.id, row.id));
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, session.userId, project.version);
  await recordAggregateAudit(transaction, session, "update", "trip_plan_item_reorder", item.id, tripProjectId, aggregateVersion, changedIds.size);
  return { success: true, aggregateVersion, itemId: item.id };
}

// Story 7.5: a dedicated state-only change primitive so a `change-item-state`
// operation does not require reconstructing the full InternalPlanItemInput
// shape. A state-only change must not touch label/notes/ordinal/plannedAt/
// transport/accommodation fields. Validates the backup-state/backup-target
// consistency and the same-project/no-cycle backup rule via the shared
// validatePlanReferencesRules helper (no inline reimplementation).
export async function changeInternalTripPlanItemStateInTransaction(
  transaction: Transaction,
  session: { userId: string; email: string },
  tripProjectId: string,
  expectedAggregateVersion: number,
  itemId: string,
  expectedItemVersion: number,
  nextState: TripPlanItemState,
  backupTargetItemId: string | null,
): Promise<AggregateMutationResult> {
  if ((nextState === "backup") !== (backupTargetItemId !== null)) return { success: false, reason: "invalid" };
  const project = await lockAggregate(transaction, tripProjectId, session.userId, expectedAggregateVersion);
  if (!project.success) return project;
  const [item] = await transaction.select().from(tripPlanItems).where(and(eq(tripPlanItems.id, itemId), eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, session.userId))).limit(1);
  if (!item) return { success: false, reason: "not_found" };
  if (item.version !== expectedItemVersion) return { success: false, reason: "refresh_required" };
  // Reuse the shared same-project/no-cycle rules for a backup target that is new
  // for this item (Story 7.4 review finding 9). Load every plan item in the
  // project once so the cycle walk is exact.
  if (backupTargetItemId !== null && backupTargetItemId !== item.backupTargetItemId) {
    const referenceRows = await transaction
      .select({ id: tripPlanItems.id, kind: tripPlanItems.kind, tripProjectId: tripPlanItems.tripProjectId, backupTargetItemId: tripPlanItems.backupTargetItemId })
      .from(tripPlanItems)
      .where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, session.userId)));
    const refError = validatePlanReferencesRules(
      tripProjectId,
      { kind: item.kind, parentItemId: item.parentItemId, backupTargetItemId },
      referenceRows,
      itemId,
    );
    if (refError) return { success: false, reason: "invalid" };
  }
  await transaction
    .update(tripPlanItems)
    .set({ state: nextState, backupTargetItemId, version: item.version + 1, updatedAt: new Date() })
    .where(eq(tripPlanItems.id, itemId));
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, session.userId, project.version);
  await recordAggregateAudit(transaction, session, "update", "trip_plan_item", itemId, tripProjectId, aggregateVersion);
  return { success: true, aggregateVersion, itemId };
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
    })
    .from(tripProjects)
    .where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId)))
    .limit(1);

  return project ?? null;
}

function normalizeTripProjectInput(input: TripProjectInput) {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Trip project title is required.");
  }

  if (title.length > maxTitleLength) {
    throw new Error(`Trip project title must be ${maxTitleLength} characters or fewer.`);
  }

  const startDate = normalizeTripDate(input.startDate);
  const endDate = normalizeTripDate(input.endDate);

  if (startDate && endDate && startDate > endDate) {
    throw new Error("Trip project end date cannot be before the start date.");
  }

  return {
    title,
    origin: normalizeOptionalText(input.origin, maxTripFieldLength),
    destination: normalizeOptionalText(input.destination, maxTripFieldLength),
    startDate,
    endDate,
    travelers: normalizeOptionalText(input.travelers, maxTripFieldLength),
    notes: normalizeOptionalText(input.notes, maxNotesLength),
  };
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new Error(`Trip project field must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

function normalizeTripDate(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (!tripDatePattern.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    throw new Error("Trip project dates must use the YYYY-MM-DD format.");
  }

  return trimmed;
}

// Story 7.5: exported so the apply orchestrator in trip-change-proposals.ts
// can normalize a proposal operation's item/constraints draft into the same
// internal shape the public primitives use, then pass the already-normalized
// values to the *InTransaction helpers (which accept ReturnType<typeof
// normalizePlanItem> / normalizeConstraints directly).
export function normalizePlanItem(input: InternalPlanItemInput) {
  const label = normalizeRequiredSingleLine(input.label, 160, "plan item label");
  const notes = normalizeNullableSingleLine(input.notes, 1_000, "plan item notes");
  const transportOriginLabel = normalizeNullableSingleLine(input.transportOriginLabel, 160, "transport origin");
  const transportDestinationLabel = normalizeNullableSingleLine(input.transportDestinationLabel, 160, "transport destination");
  const accommodationPlaceAreaLabel = normalizeNullableSingleLine(input.accommodationPlaceAreaLabel, 160, "accommodation area");
  const isAnchor = input.kind === "anchor";
  const validAnchorRoles: TripPlanAnchorRole[] = ["origin", "destination", "region", "required_stop", "accommodation"];
  const validTypes: TripPlanItemType[] = ["transport", "visit", "food", "rest", "accommodation"];
  if ((isAnchor && (!input.anchorRole || !validAnchorRoles.includes(input.anchorRole) || input.type)) || (!isAnchor && (!input.type || !validTypes.includes(input.type) || input.anchorRole))) throw new Error("Invalid trip plan discriminator.");
  if (!Number.isInteger(input.ordinal) || input.ordinal < 0) throw new Error("Invalid trip plan ordinal.");
  if ((input.state === "backup") !== Boolean(input.backupTargetItemId)) throw new Error("Invalid trip plan backup target.");
  if (input.type !== "transport" && (transportOriginLabel || transportDestinationLabel)) throw new Error("Invalid trip plan transport location.");
  if (input.type !== "accommodation" && accommodationPlaceAreaLabel) throw new Error("Invalid trip plan accommodation location.");
  return { ...input, label, notes, transportOriginLabel, transportDestinationLabel, accommodationPlaceAreaLabel, anchorRole: input.anchorRole ?? null, type: input.type ?? null, parentItemId: input.parentItemId ?? null, backupTargetItemId: input.backupTargetItemId ?? null, plannedAt: input.plannedAt ?? null };
}

async function lockAggregate(transaction: Transaction, tripProjectId: string, userId: string, expectedAggregateVersion: number): Promise<{ success: true; version: number } | Extract<AggregateMutationResult, { success: false }>> {
  const [project] = await transaction.select({ version: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId))).limit(1).for("update");
  if (!project) return { success: false, reason: "not_found" };
  if (project.version !== expectedAggregateVersion) return { success: false, reason: "refresh_required" };
  return { success: true, version: project.version };
}

async function advanceAggregate(transaction: Transaction, tripProjectId: string, userId: string, version: number) {
  const aggregateVersion = version + 1;
  await transaction.update(tripProjects).set({ aggregateVersion, updatedAt: new Date() }).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId)));
  return aggregateVersion;
}

async function recordAggregateAudit(transaction: Transaction, actor: { userId: string; email: string }, operation: "create" | "update" | "delete", targetType: string, targetId: string, tripProjectId: string, aggregateVersion: number, count?: number) {
  await recordAuditEvent({ actor: toUserAuditActor({ userId: actor.userId, email: actor.email }), operation, targetType, targetId, afterSummary: JSON.stringify({ tripProjectId, aggregateVersion, ...(count === undefined ? {} : { count }) }) }, transaction);
}

async function validatePlanReferences(transaction: Transaction, tripProjectId: string, userId: string, values: ReturnType<typeof normalizePlanItem>, itemId?: string) {
  // Load every plan item in the project once and delegate the same-project
  // parent/backup/no-cycle rules to the pure shared helper in plan-references.ts.
  // This keeps the DB-backed command path and the proposal validator (which uses
  // already-loaded knownItems) on the exact same rule set, avoiding divergence
  // (Story 7.4 review finding 9).
  const rows = await transaction
    .select({ id: tripPlanItems.id, kind: tripPlanItems.kind, tripProjectId: tripPlanItems.tripProjectId, backupTargetItemId: tripPlanItems.backupTargetItemId })
    .from(tripPlanItems)
    .where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, userId)));
  const error = validatePlanReferencesRules(tripProjectId, { kind: values.kind, parentItemId: values.parentItemId, backupTargetItemId: values.backupTargetItemId }, rows, itemId);
  if (error) throw new Error(error);
}

// Story 7.5: exported so the apply orchestrator can normalize a proposal's
// constraints draft before delegating to upsertInternalTripProjectConstraintsInTransaction.
export function normalizeConstraints(input: unknown) {
  const allowed = new Set(["adultCount", "childCount", "children", "vehicleType", "evChargingNeed", "drivingToleranceHours", "budgetCurrency", "budgetMinVnd", "budgetMaxVnd", "preferenceTags", "avoidItems"]);
  if (!isPlainRecord(input) || Object.keys(input).some((key) => !allowed.has(key))) throw new Error("Invalid trip constraints fields.");
  const values = input as InternalConstraintsInput;
  const adultCount = values.adultCount ?? null; const childCount = values.childCount ?? null;
  if (!Number.isInteger(adultCount ?? 0) || !Number.isInteger(childCount ?? 0) || (adultCount === null && childCount === null) || (adultCount ?? 0) + (childCount ?? 0) < 1 || (adultCount ?? 0) + (childCount ?? 0) > 20) throw new Error("Invalid trip constraints travelers.");
  if (values.vehicleType !== null && values.vehicleType !== undefined && !["car", "motorcycle", "ev"].includes(values.vehicleType)) throw new Error("Invalid trip constraints vehicle.");
  if (values.evChargingNeed !== null && values.evChargingNeed !== undefined && (!["none", "preferred", "required"].includes(values.evChargingNeed) || values.vehicleType !== "ev")) throw new Error("Invalid trip constraints EV need.");
  if (values.drivingToleranceHours !== null && values.drivingToleranceHours !== undefined && (!Number.isInteger(values.drivingToleranceHours) || values.drivingToleranceHours < 1 || values.drivingToleranceHours > 12)) throw new Error("Invalid trip constraints driving tolerance.");
  const hasBudget = values.budgetMinVnd !== null && values.budgetMinVnd !== undefined || values.budgetMaxVnd !== null && values.budgetMaxVnd !== undefined || values.budgetCurrency !== null && values.budgetCurrency !== undefined;
  if (hasBudget && (values.budgetCurrency !== "VND" || !Number.isInteger(values.budgetMinVnd) || !Number.isInteger(values.budgetMaxVnd) || values.budgetMinVnd! < 0 || values.budgetMaxVnd! < values.budgetMinVnd! || values.budgetMaxVnd! > 1_000_000_000)) throw new Error("Invalid trip constraints budget.");
  const childComfortTags = new Set(["car_seat", "stroller", "nap_breaks", "short_drive_blocks", "quiet_time"]);
  const childPreferenceTags = new Set(["animals", "beach", "culture", "food", "nature", "outdoor", "playground"]);
  const preferenceTags = new Set(["beach", "culture", "family_friendly", "food", "nature", "quiet", "road_trip", "scenic_route"]);
  if (values.children !== null && values.children !== undefined && (!Array.isArray(values.children) || values.children.length > 10 || values.children.some((child) => !isChildConstraint(child, childComfortTags, childPreferenceTags)))) throw new Error("Invalid trip constraints children.");
  if (values.preferenceTags !== null && values.preferenceTags !== undefined && (!Array.isArray(values.preferenceTags) || values.preferenceTags.length > 20 || new Set(values.preferenceTags).size !== values.preferenceTags.length || values.preferenceTags.some((tag) => !preferenceTags.has(tag)))) throw new Error("Invalid trip constraints preferences.");
  if (values.avoidItems !== null && values.avoidItems !== undefined && (!Array.isArray(values.avoidItems) || values.avoidItems.length > 20 || values.avoidItems.some((item) => !isAvoidItem(item)))) throw new Error("Invalid trip constraints avoid items.");
  return { adultCount, childCount, children: values.children ?? null, vehicleType: values.vehicleType ?? null, evChargingNeed: values.evChargingNeed ?? null, drivingToleranceHours: values.drivingToleranceHours ?? null, budgetCurrency: values.budgetCurrency ?? null, budgetMinVnd: values.budgetMinVnd ?? null, budgetMaxVnd: values.budgetMaxVnd ?? null, preferenceTags: values.preferenceTags ?? null, avoidItems: values.avoidItems ?? null };
}

function normalizeRequiredSingleLine(value: string, maxLength: number, field: string) { const normalized = normalizeNullableSingleLine(value, maxLength, field); if (!normalized) throw new Error(`Invalid trip plan ${field}.`); return normalized; }
function normalizeNullableSingleLine(value: string | null | undefined, maxLength: number, field: string) { if (value === null || value === undefined) return null; const normalized = value.trim(); if (!normalized || normalized.length > maxLength || /[\r\n]/.test(normalized)) throw new Error(`Invalid trip plan ${field}.`); return normalized; }
function isPlainRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function isChildConstraint(value: unknown, comfortTags: Set<string>, preferenceTags: Set<string>): value is { ageMin: number; ageMax: number; comfortTags: string[]; preferenceTags: string[] } { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "ageMax,ageMin,comfortTags,preferenceTags") return false; const child = value as { ageMin?: unknown; ageMax?: unknown; comfortTags?: unknown; preferenceTags?: unknown }; return Number.isInteger(child.ageMin) && Number.isInteger(child.ageMax) && (child.ageMin as number) >= 0 && (child.ageMax as number) <= 17 && (child.ageMin as number) <= (child.ageMax as number) && isTagArray(child.comfortTags, comfortTags, 6) && isTagArray(child.preferenceTags, preferenceTags, 6); }
function isTagArray(value: unknown, allowed: Set<string>, maxLength: number): value is string[] { return Array.isArray(value) && value.length <= maxLength && new Set(value).size === value.length && value.every((tag) => typeof tag === "string" && allowed.has(tag)); }
function isAvoidItem(value: unknown): boolean { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "category,label") return false; const item = value as { category?: unknown; label?: unknown }; return (item.category === "place" || item.category === "activity") && typeof item.label === "string" && item.label.trim().length > 0 && item.label.trim().length <= 120 && !/[\r\n]/.test(item.label); }

function formatTripProjectAuditSummary(project: Pick<OwnedTripProjectSummary, "title" | "origin" | "destination" | "startDate" | "endDate" | "travelers" | "notes">) {
  return JSON.stringify({
    titleLength: project.title.length,
    hasOrigin: Boolean(project.origin),
    hasDestination: Boolean(project.destination),
    hasStartDate: Boolean(project.startDate),
    hasEndDate: Boolean(project.endDate),
    hasTravelers: Boolean(project.travelers),
    hasNotes: Boolean(project.notes),
  });
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
