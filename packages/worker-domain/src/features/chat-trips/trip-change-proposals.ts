import { and, eq } from "drizzle-orm";

import { getDb, normalizeConstraints, normalizePlanItem } from "@xuyenviet/database";
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
const unsafeContentPatterns = [
  /;\s*(?:drop|delete|insert|update|alter|create|truncate|grant|revoke)\s+/i,
  /\b(?:https?:\/\/|file:\/\/|\/\/[a-z0-9-]+\.[a-z]{2,})\b/i,
  /^\s*[{[]\s*["{[]/,
];

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
export type KnownPlanItem = { id: string; kind: TripPlanItemKind; anchorRole: TripPlanAnchorRole | null; type: TripPlanItemType | null; state: TripPlanItemState; label: string; notes: string | null; plannedAt: Date | null; ordinal: number; parentItemId: string | null; backupTargetItemId: string | null; transportOriginLabel: string | null; transportDestinationLabel: string | null; accommodationPlaceAreaLabel: string | null };
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
  let references: PlanItemReference[] = context.knownItems.map((item) => ({ id: item.id, kind: item.kind, tripProjectId: context.tripProjectId, parentItemId: item.parentItemId, backupTargetItemId: item.backupTargetItemId }));
  const valid: TripChangeProposalOperation[] = [];
  const rejected: RejectedOperation[] = [];
  operations.forEach((value, index) => {
    if (!isRecord(value) || typeof value.kind !== "string") return rejected.push({ index, reason: "operation invalid" });
    if (value.kind === "create-item" && isRecord(value.item) && hasOnlyKeys(value, ["kind", "item", "parentItemId", "ordinal"]) && isOrdinal(value.ordinal)) {
      const parentItemId = stringOrNull(value.parentItemId);
      const item = normalizeDraftItem(value.item, parentItemId, value.ordinal);
      if (!item || parentItemId === undefined || validatePlanReferencesRules(context.tripProjectId, item, references)) return rejected.push({ index, reason: "create-item invalid" });
      references.push({ id: `proposal-create-${index}`, kind: item.kind, tripProjectId: context.tripProjectId, parentItemId, backupTargetItemId: item.backupTargetItemId ?? null });
      return valid.push({ kind: "create-item", item, parentItemId, ordinal: value.ordinal });
    }
    if ((value.kind === "update-item" || value.kind === "remove-item" || value.kind === "reorder-item" || value.kind === "change-item-state") && (typeof value.itemId !== "string" || !known.has(value.itemId))) return rejected.push({ index, reason: "item references unknown or cross-project item" });
    if (value.kind === "update-item" && isRecord(value.changes) && hasOnlyKeys(value, ["kind", "itemId", "changes"])) {
      const knownItem = known.get(value.itemId as string)!;
      const changes = normalizeItemChanges(value.changes, knownItem);
      if (!changes || validatePlanReferencesRules(context.tripProjectId, { kind: knownItem.kind, parentItemId: knownItem.parentItemId, backupTargetItemId: changes.backupTargetItemId ?? knownItem.backupTargetItemId }, references, knownItem.id)) return rejected.push({ index, reason: "update-item invalid" });
      if (changes.backupTargetItemId !== undefined) {
        knownItem.backupTargetItemId = changes.backupTargetItemId;
        const reference = references.find((item) => item.id === knownItem.id);
        if (reference) reference.backupTargetItemId = changes.backupTargetItemId;
      }
      return valid.push({ kind: "update-item", itemId: knownItem.id, changes });
    }
    if (value.kind === "remove-item" && hasOnlyKeys(value, ["kind", "itemId"])) {
      const itemId = value.itemId as string;
      if (references.some((item) => item.parentItemId === itemId || item.backupTargetItemId === itemId)) return rejected.push({ index, reason: "remove-item references surviving item" });
      valid.push({ kind: "remove-item", itemId });
      known.delete(itemId);
      references = references.filter((item) => item.id !== itemId);
      return;
    }
    if (value.kind === "reorder-item" && hasOnlyKeys(value, ["kind", "itemId", "parentItemId", "ordinal"]) && isOrdinal(value.ordinal)) {
      const item = known.get(value.itemId as string)!;
      const parentItemId = stringOrNull(value.parentItemId);
      if (parentItemId === undefined || validatePlanReferencesRules(context.tripProjectId, { kind: item.kind, parentItemId, backupTargetItemId: item.backupTargetItemId }, references, item.id)) return rejected.push({ index, reason: "reorder-item references invalid" });
      item.parentItemId = parentItemId;
      const reference = references.find((entry) => entry.id === item.id);
      if (reference) reference.parentItemId = parentItemId;
      return valid.push({ kind: "reorder-item", itemId: item.id, parentItemId, ordinal: value.ordinal });
    }
    if (value.kind === "change-item-state" && hasOnlyKeys(value, ["kind", "itemId", "state", "backupTargetItemId"]) && typeof value.state === "string" && validStates.includes(value.state as TripPlanItemState)) {
      const item = known.get(value.itemId as string)!;
      const backupTargetItemId = stringOrNull(value.backupTargetItemId);
      if (backupTargetItemId === undefined || (value.state === "backup") !== (backupTargetItemId !== null) || validatePlanReferencesRules(context.tripProjectId, { kind: item.kind, parentItemId: item.parentItemId, backupTargetItemId }, references, item.id)) return rejected.push({ index, reason: "change-item-state invalid" });
      item.state = value.state as TripPlanItemState;
      item.backupTargetItemId = backupTargetItemId;
      const reference = references.find((entry) => entry.id === item.id);
      if (reference) reference.backupTargetItemId = backupTargetItemId;
      return valid.push({ kind: "change-item-state", itemId: item.id, state: value.state as TripPlanItemState, backupTargetItemId });
    }
    if (value.kind === "upsert-constraints" && hasOnlyKeys(value, ["kind", "constraints", "expectedConstraintsVersion"]) && isRecord(value.constraints)) {
      try {
        const constraints = normalizeConstraints(value.constraints);
        const expectedConstraintsVersion = value.expectedConstraintsVersion;
        if (expectedConstraintsVersion !== undefined && expectedConstraintsVersion !== null && (typeof expectedConstraintsVersion !== "number" || !Number.isInteger(expectedConstraintsVersion) || expectedConstraintsVersion < 1)) throw new Error();
        return valid.push({ kind: "upsert-constraints", constraints, expectedConstraintsVersion: typeof expectedConstraintsVersion === "number" ? expectedConstraintsVersion : null });
      } catch {
        return rejected.push({ index, reason: "upsert-constraints invalid" });
      }
    }
    rejected.push({ index, reason: "operation invalid" });
  });
  if (!rejected.length && hasCrossOperationReferenceFailure(valid, references, context.tripProjectId)) return { valid: [], rejected: [{ index: -1, reason: "proposal references invalid" }] };
  return { valid, rejected };
}

export async function persistAiTripChangeProposalDraftInTransaction(transaction: Transaction, owner: { userId: string }, input: PersistAiTripChangeProposalDraftInput, expiresAtValidatedAt = Date.now()): Promise<PersistAiTripChangeProposalDraftResult> {
  const rationale = normalizeSafeSingleLine(input.rationale, maxRationaleLength);
  if (!rationale || !Number.isInteger(input.expectedAggregateVersion) || input.expectedAggregateVersion < 1) return { success: false, reason: "invalid" };
  if (input.expiresAt && (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime()) || input.expiresAt.getTime() <= expiresAtValidatedAt)) return { success: false, reason: "invalid" };
  const alternatives = normalizeAlternatives(input.alternatives);
  if (alternatives === null) return { success: false, reason: "invalid" };
  const [project] = await transaction.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, input.tripProjectId), eq(tripProjects.userId, owner.userId))).limit(1).for("update");
  if (!project) return { success: false, reason: "not_found" };
  if (project.aggregateVersion !== input.expectedAggregateVersion) return { success: false, reason: "refresh_required" };
  const rows = await transaction.select({ id: tripPlanItems.id, kind: tripPlanItems.kind, anchorRole: tripPlanItems.anchorRole, type: tripPlanItems.type, state: tripPlanItems.state, label: tripPlanItems.label, notes: tripPlanItems.notes, plannedAt: tripPlanItems.plannedAt, ordinal: tripPlanItems.ordinal, parentItemId: tripPlanItems.parentItemId, backupTargetItemId: tripPlanItems.backupTargetItemId, transportOriginLabel: tripPlanItems.transportOriginLabel, transportDestinationLabel: tripPlanItems.transportDestinationLabel, accommodationPlaceAreaLabel: tripPlanItems.accommodationPlaceAreaLabel }).from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, input.tripProjectId), eq(tripPlanItems.userId, owner.userId)));
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
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) { return Object.keys(value).every((key) => allowed.includes(key)); }
function isOrdinal(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function stringOrNull(value: unknown): string | null | undefined { if (value === null || value === undefined) return null; return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function normalizeDraftItem(item: Record<string, unknown>, parentItemId: string | null | undefined, ordinal: number): TripChangeProposalItemDraft | null {
  if (!hasOnlyKeys(item, ["kind", "anchorRole", "type", "state", "label", "notes", "plannedAt", "transportOriginLabel", "transportDestinationLabel", "accommodationPlaceAreaLabel", "backupTargetItemId"])) return null;
  const backupTargetItemId = stringOrNull(item.backupTargetItemId);
  const plannedAt = item.plannedAt === null || item.plannedAt === undefined || item.plannedAt === "" ? null : typeof item.plannedAt === "string" && !Number.isNaN(Date.parse(item.plannedAt)) ? new Date(item.plannedAt) : undefined;
  const label = normalizeSafeSingleLine(item.label, 160);
  const notes = normalizeNullableSafeSingleLine(item.notes, 1_000);
  const transportOriginLabel = normalizeNullableSafeSingleLine(item.transportOriginLabel, 160);
  const transportDestinationLabel = normalizeNullableSafeSingleLine(item.transportDestinationLabel, 160);
  const accommodationPlaceAreaLabel = normalizeNullableSafeSingleLine(item.accommodationPlaceAreaLabel, 160);
  if (parentItemId === undefined || backupTargetItemId === undefined || plannedAt === undefined || !label || notes === undefined || transportOriginLabel === undefined || transportDestinationLabel === undefined || accommodationPlaceAreaLabel === undefined || typeof item.kind !== "string" || !validKinds.includes(item.kind as TripPlanItemKind) || typeof item.state !== "string" || !validStates.includes(item.state as TripPlanItemState)) return null;
  try {
    const normalized = normalizePlanItem({ kind: item.kind as TripPlanItemKind, anchorRole: item.anchorRole as TripPlanAnchorRole | null, type: item.type as TripPlanItemType | null, state: item.state as TripPlanItemState, label, notes, plannedAt, ordinal, parentItemId, backupTargetItemId, transportOriginLabel, transportDestinationLabel, accommodationPlaceAreaLabel });
    return { ...normalized, plannedAt: normalized.plannedAt?.toISOString() ?? null };
  } catch { return null; }
}
function normalizeItemChanges(changes: Record<string, unknown>, known: KnownPlanItem): TripChangeProposalItemChanges | null {
  const allowed = new Set(["label", "notes", "plannedAt", "state", "backupTargetItemId", "transportOriginLabel", "transportDestinationLabel", "accommodationPlaceAreaLabel"]);
  if (Object.keys(changes).length === 0 || Object.keys(changes).some((key) => !allowed.has(key))) return null;
  const backupTargetItemId = changes.backupTargetItemId === undefined ? known.backupTargetItemId : stringOrNull(changes.backupTargetItemId);
  const plannedAt = changes.plannedAt === undefined ? known.plannedAt : changes.plannedAt === null || changes.plannedAt === "" ? null : typeof changes.plannedAt === "string" && !Number.isNaN(Date.parse(changes.plannedAt)) ? new Date(changes.plannedAt) : undefined;
  const label = changes.label === undefined ? known.label : normalizeSafeSingleLine(changes.label, 160);
  const notes = changes.notes === undefined ? known.notes : normalizeNullableSafeSingleLine(changes.notes, 1_000);
  const transportOriginLabel = changes.transportOriginLabel === undefined ? known.transportOriginLabel : normalizeNullableSafeSingleLine(changes.transportOriginLabel, 160);
  const transportDestinationLabel = changes.transportDestinationLabel === undefined ? known.transportDestinationLabel : normalizeNullableSafeSingleLine(changes.transportDestinationLabel, 160);
  const accommodationPlaceAreaLabel = changes.accommodationPlaceAreaLabel === undefined ? known.accommodationPlaceAreaLabel : normalizeNullableSafeSingleLine(changes.accommodationPlaceAreaLabel, 160);
  if (backupTargetItemId === undefined || plannedAt === undefined || !label || notes === undefined || transportOriginLabel === undefined || transportDestinationLabel === undefined || accommodationPlaceAreaLabel === undefined || changes.state !== undefined && (typeof changes.state !== "string" || !validStates.includes(changes.state as TripPlanItemState))) return null;
  try {
    normalizePlanItem({ kind: known.kind, anchorRole: known.anchorRole, type: known.type, state: (changes.state ?? known.state) as TripPlanItemState, label, notes, plannedAt, ordinal: known.ordinal, parentItemId: known.parentItemId, backupTargetItemId, transportOriginLabel, transportDestinationLabel, accommodationPlaceAreaLabel });
  } catch { return null; }
  return {
    ...(changes.label === undefined ? {} : { label }),
    ...(changes.notes === undefined ? {} : { notes }),
    ...(changes.plannedAt === undefined ? {} : { plannedAt: plannedAt?.toISOString() ?? null }),
    ...(changes.state === undefined ? {} : { state: changes.state as TripPlanItemState }),
    ...(changes.backupTargetItemId === undefined ? {} : { backupTargetItemId }),
    ...(changes.transportOriginLabel === undefined ? {} : { transportOriginLabel }),
    ...(changes.transportDestinationLabel === undefined ? {} : { transportDestinationLabel }),
    ...(changes.accommodationPlaceAreaLabel === undefined ? {} : { accommodationPlaceAreaLabel }),
  };
}
function hasCrossOperationReferenceFailure(operations: TripChangeProposalOperation[], references: PlanItemReference[], tripProjectId: string) {
  const proposed = new Map(references.map((item) => [item.id, { ...item }]));
  for (const operation of operations) if (operation.kind === "remove-item") proposed.delete(operation.itemId);
  for (const operation of operations) {
    if (operation.kind === "update-item" && operation.changes.backupTargetItemId !== undefined) {
      const item = proposed.get(operation.itemId); if (item) item.backupTargetItemId = operation.changes.backupTargetItemId;
    }
    if (operation.kind === "change-item-state") {
      const item = proposed.get(operation.itemId); if (item) item.backupTargetItemId = operation.backupTargetItemId ?? null;
    }
    if (operation.kind === "reorder-item") {
      const item = proposed.get(operation.itemId); if (item) item.parentItemId = operation.parentItemId ?? null;
    }
  }
  return [...proposed.values()].some((item) => Boolean(validatePlanReferencesRules(tripProjectId, item, [...proposed.values()], item.id)));
}
function normalizeSafeSingleLine(value: unknown, maximum: number): string | null { if (typeof value !== "string") return null; const normalized = value.trim(); return normalized && normalized.length <= maximum && !/[\r\n]/.test(normalized) && !unsafeContentPatterns.some((pattern) => pattern.test(normalized)) ? normalized : null; }
function normalizeNullableSafeSingleLine(value: unknown, maximum: number): string | null | undefined { if (value === null || value === undefined) return null; return typeof value === "string" ? normalizeSafeSingleLine(value, maximum) ?? undefined : undefined; }
function normalizeAlternatives(value: unknown): TripChangeProposalAlternativeSummary[] | null { if (value === null || value === undefined) return []; if (!Array.isArray(value) || value.length > maxAlternatives) return null; const alternatives = value.map((entry) => isRecord(entry) && hasOnlyKeys(entry, ["summary"]) ? normalizeSafeSingleLine(entry.summary, 280) : null); return alternatives.every((summary): summary is string => summary !== null) ? alternatives.map((summary) => ({ summary })) : null; }
