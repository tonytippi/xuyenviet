import { and, eq } from "drizzle-orm";

import { getDb } from "@xuyenviet/database";
import { tripChangeProposals, tripPlanItems, tripProjects, type TripChangeProposalStatus, type TripPlanAnchorRole, type TripPlanItemKind, type TripPlanItemState, type TripPlanItemType } from "@xuyenviet/database";
import { createSystemAuditActor } from "../audit/actors";
import { recordAuditEvent } from "../audit/events";
import { recordPlanHistory } from "../audit/history";
import { validatePlanReferencesRules, type PlanItemReference } from "./plan-references";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;

const maxRationaleLength = 500;
const maxOperations = 20;
const maxAlternatives = 5;
const validKinds: readonly TripPlanItemKind[] = ["anchor", "leg", "activity"];
const validStates: readonly TripPlanItemState[] = ["idea", "planned", "confirmed", "backup"];

export type TripChangeProposalItemDraft = { kind: TripPlanItemKind; anchorRole?: TripPlanAnchorRole | null; type?: TripPlanItemType | null; state: TripPlanItemState; label: string; notes?: string | null; plannedAt?: string | null; transportOriginLabel?: string | null; transportDestinationLabel?: string | null; accommodationPlaceAreaLabel?: string | null; backupTargetItemId?: string | null };
export type TripChangeProposalItemChanges = { label?: string; notes?: string | null; plannedAt?: string | null; state?: TripPlanItemState; backupTargetItemId?: string | null; transportOriginLabel?: string | null; transportDestinationLabel?: string | null; accommodationPlaceAreaLabel?: string | null };
export type TripChangeProposalConstraintsDraft = Record<string, unknown>;
export type TripChangeProposalOperation =
  | { kind: "create-item"; item: TripChangeProposalItemDraft; parentItemId?: string | null; ordinal: number }
  | { kind: "update-item"; itemId: string; changes: TripChangeProposalItemChanges }
  | { kind: "remove-item"; itemId: string }
  | { kind: "reorder-item"; itemId: string; parentItemId?: string | null; ordinal: number }
  | { kind: "change-item-state"; itemId: string; state: TripPlanItemState; backupTargetItemId?: string | null }
  | { kind: "upsert-constraints"; constraints: TripChangeProposalConstraintsDraft; expectedConstraintsVersion?: number | null };
export type RejectedOperation = { index: number; reason: string };
export type KnownPlanItem = { id: string; kind: TripPlanItemKind; anchorRole: TripPlanAnchorRole | null; type: TripPlanItemType | null; state: TripPlanItemState; parentItemId: string | null; backupTargetItemId: string | null };
export type ValidateProposalOperationsContext = { knownItems: KnownPlanItem[]; tripProjectId: string };
export type TripChangeProposalAffectedItemRef = { itemId: string; kind: TripPlanItemKind; label: string; change: "create" | "update" | "remove" | "reorder" | "change-state" | "upsert-constraints" };
export type TripChangeProposalBeforeAfterSummary = { operation: string; before: string | null; after: string | null };
export type TripChangeProposalAlternativeSummary = { summary: string };
export type OwnedTripChangeProposalSummary = { id: string; tripProjectId: string; status: TripChangeProposalStatus; rationale: string; expiresAt: Date | null; createdAt: Date; affectedItems: TripChangeProposalAffectedItemRef[]; beforeAfter: TripChangeProposalBeforeAfterSummary[]; alternatives: TripChangeProposalAlternativeSummary[]; hasAlternatives: boolean };
export type PersistAiTripChangeProposalDraftInput = { tripProjectId: string; expectedAggregateVersion: number; expectedItemVersions?: Record<string, number> | null; operations: unknown; rationale: string; alternatives?: unknown; orderingPreconditions?: unknown; expiresAt?: Date | null; sourceAssistantMessageId?: string | null };
export type PersistAiTripChangeProposalDraftResult = { success: true; proposal: OwnedTripChangeProposalSummary } | { success: false; reason: "not_found" | "invalid" | "refresh_required" };

export function validateProposalOperations(operations: unknown, context: ValidateProposalOperationsContext): { valid: TripChangeProposalOperation[]; rejected: RejectedOperation[] } {
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > maxOperations) return { valid: [], rejected: [{ index: -1, reason: "operations must be a non-empty array of at most 20 entries" }] };
  const known = new Map(context.knownItems.map((item) => [item.id, item]));
  const references: PlanItemReference[] = context.knownItems.map((item) => ({ id: item.id, kind: item.kind, tripProjectId: context.tripProjectId, backupTargetItemId: item.backupTargetItemId }));
  const valid: TripChangeProposalOperation[] = [];
  const rejected: RejectedOperation[] = [];
  operations.forEach((value, index) => {
    if (!isRecord(value) || typeof value.kind !== "string") return rejected.push({ index, reason: "operation invalid" });
    if (value.kind === "create-item" && isRecord(value.item) && isValidItem(value.item) && isOrdinal(value.ordinal)) {
      const parentItemId = stringOrNull(value.parentItemId);
      if (parentItemId === undefined || validatePlanReferencesRules(context.tripProjectId, { kind: value.item.kind as TripPlanItemKind, parentItemId, backupTargetItemId: stringOrNull(value.item.backupTargetItemId) ?? null }, references)) return rejected.push({ index, reason: "create-item references invalid" });
      return valid.push({ kind: "create-item", item: value.item as TripChangeProposalItemDraft, parentItemId, ordinal: value.ordinal });
    }
    if ((value.kind === "update-item" || value.kind === "remove-item" || value.kind === "reorder-item" || value.kind === "change-item-state") && (typeof value.itemId !== "string" || !known.has(value.itemId))) return rejected.push({ index, reason: "item references unknown or cross-project item" });
    if (value.kind === "update-item" && isRecord(value.changes)) return valid.push({ kind: "update-item", itemId: value.itemId as string, changes: value.changes as TripChangeProposalItemChanges });
    if (value.kind === "remove-item") return valid.push({ kind: "remove-item", itemId: value.itemId as string });
    if (value.kind === "reorder-item" && isOrdinal(value.ordinal)) return valid.push({ kind: "reorder-item", itemId: value.itemId as string, parentItemId: stringOrNull(value.parentItemId) ?? null, ordinal: value.ordinal });
    if (value.kind === "change-item-state" && typeof value.state === "string" && validStates.includes(value.state as TripPlanItemState)) return valid.push({ kind: "change-item-state", itemId: value.itemId as string, state: value.state as TripPlanItemState, backupTargetItemId: stringOrNull(value.backupTargetItemId) ?? null });
    if (value.kind === "upsert-constraints" && isRecord(value.constraints)) return valid.push({ kind: "upsert-constraints", constraints: value.constraints, expectedConstraintsVersion: typeof value.expectedConstraintsVersion === "number" ? value.expectedConstraintsVersion : null });
    rejected.push({ index, reason: "operation invalid" });
  });
  return { valid, rejected };
}

export async function persistAiTripChangeProposalDraftInTransaction(transaction: Transaction, owner: { userId: string }, input: PersistAiTripChangeProposalDraftInput, expiresAtValidatedAt = Date.now()): Promise<PersistAiTripChangeProposalDraftResult> {
  const rationale = input.rationale?.trim();
  if (!rationale || rationale.length > maxRationaleLength || /[\r\n]/.test(rationale) || !Number.isInteger(input.expectedAggregateVersion) || input.expectedAggregateVersion < 1) return { success: false, reason: "invalid" };
  if (input.expiresAt && (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime()) || input.expiresAt.getTime() <= expiresAtValidatedAt)) return { success: false, reason: "invalid" };
  const alternatives = normalizeAlternatives(input.alternatives);
  if (alternatives === null) return { success: false, reason: "invalid" };
  const [project] = await transaction.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, input.tripProjectId), eq(tripProjects.userId, owner.userId))).limit(1).for("update");
  if (!project) return { success: false, reason: "not_found" };
  if (project.aggregateVersion !== input.expectedAggregateVersion) return { success: false, reason: "refresh_required" };
  const rows = await transaction.select({ id: tripPlanItems.id, kind: tripPlanItems.kind, anchorRole: tripPlanItems.anchorRole, type: tripPlanItems.type, state: tripPlanItems.state, parentItemId: tripPlanItems.parentItemId, backupTargetItemId: tripPlanItems.backupTargetItemId }).from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, input.tripProjectId), eq(tripPlanItems.userId, owner.userId)));
  const { valid, rejected } = validateProposalOperations(input.operations, { knownItems: rows, tripProjectId: input.tripProjectId });
  if (rejected.length || !valid.length) return { success: false, reason: "invalid" };
  const [proposal] = await transaction.insert(tripChangeProposals).values({ tripProjectId: input.tripProjectId, userId: owner.userId, creatorClass: "ai_orchestration", status: "pending", rationale, operations: valid as unknown as Record<string, unknown>, expectedAggregateVersion: input.expectedAggregateVersion, expectedItemVersions: (input.expectedItemVersions ?? null) as Record<string, number> | null, orderingPreconditions: (input.orderingPreconditions ?? null) as Record<string, unknown> | null, alternatives: alternatives as unknown as Record<string, unknown> | null, expiresAt: input.expiresAt ?? null, sourceAssistantMessageId: input.sourceAssistantMessageId ?? null }).returning();
  await recordAuditEvent({ actor: createSystemAuditActor("system-ai-orchestration"), operation: "create", targetType: "trip_change_proposal", targetId: proposal.id, afterSummary: JSON.stringify({ tripProjectId: input.tripProjectId, proposalId: proposal.id, status: proposal.status, expectedAggregateVersion: input.expectedAggregateVersion }) }, transaction);
  return { success: true, proposal: { id: proposal.id, tripProjectId: input.tripProjectId, status: proposal.status, rationale: proposal.rationale, expiresAt: proposal.expiresAt, createdAt: proposal.createdAt, affectedItems: [], beforeAfter: [], alternatives, hasAlternatives: alternatives.length > 0 } };
}

export async function expireTripChangeProposalInTransaction(transaction: Transaction, input: { tripProjectId: string; proposalId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const [proposal] = await transaction.select({ id: tripChangeProposals.id, tripProjectId: tripChangeProposals.tripProjectId, userId: tripChangeProposals.userId, status: tripChangeProposals.status, expiresAt: tripChangeProposals.expiresAt }).from(tripChangeProposals).where(and(eq(tripChangeProposals.id, input.proposalId), eq(tripChangeProposals.tripProjectId, input.tripProjectId))).limit(1).for("update");
  if (!proposal) return { success: false as const, reason: "not_found" as const };
  if (proposal.status !== "pending" || !proposal.expiresAt || proposal.expiresAt.getTime() > now.getTime()) return { success: true as const };
  await transaction.update(tripChangeProposals).set({ status: "expired", terminalTimestamp: now, updatedAt: now }).where(eq(tripChangeProposals.id, proposal.id));
  const actor = createSystemAuditActor("system-trip-planning");
  await recordPlanHistory({ tripProjectId: proposal.tripProjectId, userId: proposal.userId, proposalId: proposal.id, actor, operationClass: "expire", affectedItemReferences: [], safeBeforeAfterSummary: { entries: [] } }, transaction);
  await recordAuditEvent({ actor, operation: "expire", targetType: "trip_change_proposal", targetId: proposal.id, afterSummary: JSON.stringify({ tripProjectId: proposal.tripProjectId, proposalId: proposal.id }) }, transaction);
  return { success: true as const };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isOrdinal(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function stringOrNull(value: unknown): string | null | undefined { if (value === null || value === undefined) return null; return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function isValidItem(item: Record<string, unknown>) { return typeof item.kind === "string" && validKinds.includes(item.kind as TripPlanItemKind) && typeof item.label === "string" && item.label.trim().length > 0 && item.label.length <= 160 && typeof item.state === "string" && validStates.includes(item.state as TripPlanItemState); }
function normalizeAlternatives(value: unknown): TripChangeProposalAlternativeSummary[] | null { if (value === null || value === undefined) return []; if (!Array.isArray(value) || value.length > maxAlternatives || value.some((entry) => !isRecord(entry) || typeof entry.summary !== "string" || !entry.summary.trim() || entry.summary.length > 280)) return null; return value.map((entry) => ({ summary: (entry as { summary: string }).summary.trim() })); }
