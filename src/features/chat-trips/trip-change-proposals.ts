import "server-only";

import { and, asc, desc, eq, isNotNull, lte } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  tripChangeProposals,
  tripPlanChangeHistory,
  tripPlanItems,
  tripProjectConstraints,
  tripProjects,
  type TripChangeProposalStatus,
  type TripPlanAnchorRole,
  type TripPlanChangeHistoryActorClass,
  type TripPlanChangeHistoryOperationClass,
  type TripPlanItemKind,
  type TripPlanItemState,
  type TripPlanItemType,
} from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
import {
  changeInternalTripPlanItemStateInTransaction,
  createTripPlanItemInTransaction,
  deleteTripPlanItemInTransaction,
  normalizeConstraints,
  normalizePlanItem,
  reorderTripPlanItemInTransaction,
  updateTripPlanItemInTransaction,
  upsertInternalTripProjectConstraintsInTransaction,
  type InternalConstraintsInput,
  type InternalPlanItemInput,
  type InternalReorderInput,
} from "@/features/chat-trips/trip-projects";
import { tripPlanItemStateLabels } from "@/features/chat-trips/trip-home-labels";
import { validatePlanReferencesRules, type PlanItemReference } from "@/features/chat-trips/plan-references";
import { getAuthenticatedSession } from "@/server/auth";

// Story 7.4: Chat/Trips owns the Trip Change Proposal command/read boundary.
// AI Orchestration produces an untrusted draft; this module is the only
// persistence path. Story 7.5 ADDS the terminal proposal commands
// (apply/dismiss/expire), expire-on-read wiring, and the plan history read.
// No plan state is mutated by the 7.4 draft path; only apply mutates plan
// state, and only inside one locked transaction.

// Story 7.5: the canonical system actor for Trip Planning, mirroring the
// system-knowledge-pipeline pattern verbatim (migration 0064 reserves the
// user row; the audit_events.actorUserId FK requires it to exist).
const systemTripPlanningActorId = "system-trip-planning";
const systemTripPlanningActorEmail = "system-trip-planning@xuyenviet.invalid";
const systemTripPlanningActor = { userId: systemTripPlanningActorId, email: systemTripPlanningActorEmail };
const systemTripPlanningActorSystem = "system-trip-planning";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;

const maxRationaleLength = 500;
const maxLabelLength = 160;
const maxNotesLength = 1_000;
const maxAlternativeSummaryLength = 280;
const maxOperations = 20;
const maxAlternatives = 5;
// P2: the DB check constraint bounds octet_length(safeBeforeAfterSummary::text)
// at 8192 bytes. deriveBeforeAfter caps at maxOperations entries but does not
// bound bytes (notes before/after can be up to 1000 chars each). This limit
// leaves headroom for jsonb::text representation differences.
const maxSafeSummaryBytes = 8000;
const validAffectedItemChanges: readonly TripChangeProposalAffectedItemRef["change"][] = [
  "create",
  "update",
  "remove",
  "reorder",
  "change-state",
  "upsert-constraints",
];
// P6: recognized ordering-precondition keys. Any other key → fail closed.
const recognizedOrderingPreconditionKeys = new Set(["parentItemId", "ordinal", "expectedChangedItemVersions"]);

// P18: thrown inside the apply transaction when an operation fails-by-return so
// Drizzle rolls back the entire transaction (a returned value commits). The
// outer catch maps this to its specific reason; other errors propagate.
class ProposalOperationFailure extends Error {
  constructor(readonly reason: "refresh_required" | "not_found" | "expired") {
    super(`Proposal operation failed: ${reason}`);
    this.name = "ProposalOperationFailure";
  }
}

const validKinds: readonly TripPlanItemKind[] = ["anchor", "leg", "activity"];
const validAnchorRoles: readonly TripPlanAnchorRole[] = ["origin", "destination", "region", "required_stop", "accommodation"];
const validTypes: readonly TripPlanItemType[] = ["transport", "visit", "food", "rest", "accommodation"];
const validStates: readonly TripPlanItemState[] = ["idea", "planned", "confirmed", "backup"];

const validVehicleTypes = new Set(["car", "motorcycle", "ev"]);
const validEvNeeds = new Set(["none", "preferred", "required"]);
const comfortTagSet = new Set(["car_seat", "stroller", "nap_breaks", "short_drive_blocks", "quiet_time"]);
const childPreferenceTagSet = new Set(["animals", "beach", "culture", "food", "nature", "outdoor", "playground"]);
const tripPreferenceTagSet = new Set(["beach", "culture", "family_friendly", "food", "nature", "quiet", "road_trip", "scenic_route"]);

// Targeted unsafe-content guard: reject executable SQL fragments, URL/route
// payloads, and JSON provider payloads inside bounded text fields. Normal
// Vietnamese travel text never trips these patterns.
const unsafeContentPatterns = [
  /;\s*(?:drop|delete|insert|update|alter|create|truncate|grant|revoke)\s+/i,
  /\b(?:https?:\/\/|file:\/\/|\/\/[a-z0-9-]+\.[a-z]{2,})\b/i,
  /^\s*[{[]\s*["{[]/,
];

export type TripChangeProposalItemDraft = {
  kind: TripPlanItemKind;
  anchorRole?: TripPlanAnchorRole | null;
  type?: TripPlanItemType | null;
  state: TripPlanItemState;
  label: string;
  notes?: string | null;
  plannedAt?: string | null;
  transportOriginLabel?: string | null;
  transportDestinationLabel?: string | null;
  accommodationPlaceAreaLabel?: string | null;
  backupTargetItemId?: string | null;
};

export type TripChangeProposalItemChanges = {
  label?: string;
  notes?: string | null;
  plannedAt?: string | null;
  state?: TripPlanItemState;
  backupTargetItemId?: string | null;
  transportOriginLabel?: string | null;
  transportDestinationLabel?: string | null;
  accommodationPlaceAreaLabel?: string | null;
};

export type TripChangeProposalConstraintsDraft = {
  adultCount?: number | null;
  childCount?: number | null;
  children?: unknown[] | null;
  vehicleType?: "car" | "motorcycle" | "ev" | null;
  evChargingNeed?: "none" | "preferred" | "required" | null;
  drivingToleranceHours?: number | null;
  budgetCurrency?: "VND" | null;
  budgetMinVnd?: number | null;
  budgetMaxVnd?: number | null;
  preferenceTags?: string[] | null;
  avoidItems?: unknown[] | null;
};

export type TripChangeProposalOperation =
  | { kind: "create-item"; item: TripChangeProposalItemDraft; parentItemId?: string | null; ordinal: number }
  | { kind: "update-item"; itemId: string; changes: TripChangeProposalItemChanges }
  | { kind: "remove-item"; itemId: string }
  | { kind: "reorder-item"; itemId: string; parentItemId?: string | null; ordinal: number }
  | { kind: "change-item-state"; itemId: string; state: TripPlanItemState; backupTargetItemId?: string | null }
  | { kind: "upsert-constraints"; constraints: TripChangeProposalConstraintsDraft; expectedConstraintsVersion?: number | null };

export type RejectedOperation = { index: number; reason: string };

export type ValidateProposalOperationsContext = {
  knownItems: KnownPlanItem[];
  tripProjectId: string;
};

export type KnownPlanItem = {
  id: string;
  kind: TripPlanItemKind;
  anchorRole: TripPlanAnchorRole | null;
  type: TripPlanItemType | null;
  state: TripPlanItemState;
  parentItemId: string | null;
  backupTargetItemId: string | null;
  // Optional fields used only by the affected-item / before-after derivation in
  // the owner-facing summary. The pure validator ignores them. Loaded by the
  // persistence and read paths so the review card can show real labels and
  // before/after impact (Story 7.4 review findings 2 and 3).
  label?: string;
  ordinal?: number;
  notes?: string | null;
  plannedAt?: string | null;
  transportOriginLabel?: string | null;
  transportDestinationLabel?: string | null;
  accommodationPlaceAreaLabel?: string | null;
};

export type TripChangeProposalAffectedItemRef = {
  itemId: string;
  kind: TripPlanItemKind;
  label: string;
  change: "create" | "update" | "remove" | "reorder" | "change-state" | "upsert-constraints";
};

export type TripChangeProposalBeforeAfterSummary = {
  operation: string;
  before: string | null;
  after: string | null;
};

export type TripChangeProposalAlternativeSummary = {
  summary: string;
};

export type OwnedTripChangeProposalSummary = {
  id: string;
  tripProjectId: string;
  status: TripChangeProposalStatus;
  rationale: string;
  expiresAt: Date | null;
  createdAt: Date;
  affectedItems: TripChangeProposalAffectedItemRef[];
  beforeAfter: TripChangeProposalBeforeAfterSummary[];
  alternatives: TripChangeProposalAlternativeSummary[];
  hasAlternatives: boolean;
  // Story 7.5: terminal fields for client reconciliation. Present on every
  // summary but null until the proposal reaches a terminal status. Added
  // additively so the 7.4 draft path and read model remain unchanged.
  terminalTimestamp?: Date | null;
};

export type PersistAiTripChangeProposalDraftInput = {
  tripProjectId: string;
  expectedAggregateVersion: number;
  expectedItemVersions?: Record<string, number> | null;
  operations: unknown;
  rationale: string;
  alternatives?: unknown;
  orderingPreconditions?: unknown;
  expiresAt?: Date | null;
  sourceAssistantMessageId?: string | null;
};

export type PersistAiTripChangeProposalDraftResult =
  | { success: true; proposal: OwnedTripChangeProposalSummary }
  | { success: false; reason: "unauthenticated" | "not_found" | "invalid" | "refresh_required" };

export function validateProposalOperations(
  operations: unknown,
  context: ValidateProposalOperationsContext,
): { valid: TripChangeProposalOperation[]; rejected: RejectedOperation[] } {
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > maxOperations) {
    return { valid: [], rejected: [{ index: -1, reason: "operations must be a non-empty array of at most 20 entries" }] };
  }

  const knownById = new Map<string, KnownPlanItem>();
  for (const item of context.knownItems) {
    if (item && typeof item.id === "string" && item.id) {
      knownById.set(item.id, item);
    }
  }

  const valid: TripChangeProposalOperation[] = [];
  const rejected: RejectedOperation[] = [];

  operations.forEach((raw, index) => {
    const parsed = parseOperation(raw, index, knownById, context.tripProjectId);
    if (parsed.kind === "ok") {
      valid.push(parsed.value);
    } else {
      rejected.push({ index, reason: parsed.reason });
    }
  });

  return { valid, rejected };
}

type ParseResult = { kind: "ok"; value: TripChangeProposalOperation } | { kind: "err"; reason: string };

function parseOperation(raw: unknown, index: number, knownById: Map<string, KnownPlanItem>, contextTripProjectId: string): ParseResult {
  if (!isRecord(raw)) return { kind: "err", reason: "operation must be an object" };
  const opKind = raw.kind;
  if (typeof opKind !== "string") return { kind: "err", reason: "operation kind missing" };

  switch (opKind) {
    case "create-item":
      return parseCreateItem(raw, knownById, contextTripProjectId);
    case "update-item":
      return parseUpdateItem(raw, knownById, contextTripProjectId);
    case "remove-item":
      return parseRemoveItem(raw, knownById);
    case "reorder-item":
      return parseReorderItem(raw, knownById, contextTripProjectId);
    case "change-item-state":
      return parseChangeItemState(raw, knownById, contextTripProjectId);
    case "upsert-constraints":
      return parseUpsertConstraints(raw);
    default:
      return { kind: "err", reason: `unknown operation kind "${opKind}"` };
  }
}

function knownItemsToReferences(knownById: Map<string, KnownPlanItem>, tripProjectId: string): PlanItemReference[] {
  const references: PlanItemReference[] = [];
  for (const item of knownById.values()) {
    references.push({ id: item.id, kind: item.kind, tripProjectId, backupTargetItemId: item.backupTargetItemId });
  }
  return references;
}

function parseCreateItem(raw: Record<string, unknown>, knownById: Map<string, KnownPlanItem>, contextTripProjectId: string): ParseResult {
  const item = raw.item;
  if (!isRecord(item)) return { kind: "err", reason: "create-item.item missing" };
  const itemDraft = parseItemDraft(item);
  if (typeof itemDraft === "string") return { kind: "err", reason: itemDraft };

  const parentItemId = parseOptionalStringId(raw.parentItemId);
  if (parentItemId === "invalid") return { kind: "err", reason: "create-item.parentItemId invalid" };
  const parentId = parentItemId ?? null;
  // Story 7.4 review finding 7: activities may omit parentItemId. The system
  // prompt says "activities may carry parent_item_id" (optional) and Story 7.1
  // validatePlanReferences allows null parent for activities. Reuse the shared
  // same-project/no-cycle rules (finding 9) for the parent/backup references.
  const references = knownItemsToReferences(knownById, contextTripProjectId);
  const refError = validatePlanReferencesRules(
    contextTripProjectId,
    { kind: itemDraft.kind, parentItemId: parentId, backupTargetItemId: itemDraft.backupTargetItemId },
    references,
  );
  if (refError) return { kind: "err", reason: refError };

  const ordinal = parseOrdinal(raw.ordinal);
  if (typeof ordinal === "string") return { kind: "err", reason: ordinal };

  return { kind: "ok", value: { kind: "create-item", item: itemDraft, parentItemId: parentId, ordinal } };
}

function parseUpdateItem(raw: Record<string, unknown>, knownById: Map<string, KnownPlanItem>, contextTripProjectId: string): ParseResult {
  const itemId = parseRequiredStringId(raw.itemId);
  if (itemId === "invalid") return { kind: "err", reason: "update-item.itemId missing or invalid" };
  const known = knownById.get(itemId);
  if (!known) return { kind: "err", reason: "update-item.itemId references unknown or cross-project item" };

  const changes = raw.changes;
  if (!isRecord(changes)) return { kind: "err", reason: "update-item.changes missing" };
  const parsedChanges = parseItemChanges(changes, known);
  if (typeof parsedChanges === "string") return { kind: "err", reason: parsedChanges };

  // Reuse the shared same-project/no-cycle rules (finding 9) for a backup target
  // change that introduces a new target. parseItemChanges already validated the
  // backup-state/backup-target consistency; here we ensure the new target is
  // same-project and does not create a backup cycle.
  if (parsedChanges.backupTargetItemId !== undefined && parsedChanges.backupTargetItemId !== null && parsedChanges.backupTargetItemId !== known.backupTargetItemId) {
    const references = knownItemsToReferences(knownById, contextTripProjectId);
    const refError = validatePlanReferencesRules(
      contextTripProjectId,
      { kind: known.kind, parentItemId: known.parentItemId, backupTargetItemId: parsedChanges.backupTargetItemId },
      references,
      itemId,
    );
    if (refError) return { kind: "err", reason: refError };
  }

  return { kind: "ok", value: { kind: "update-item", itemId, changes: parsedChanges } };
}

function parseRemoveItem(raw: Record<string, unknown>, knownById: Map<string, KnownPlanItem>): ParseResult {
  const itemId = parseRequiredStringId(raw.itemId);
  if (itemId === "invalid") return { kind: "err", reason: "remove-item.itemId missing or invalid" };
  if (!knownById.has(itemId)) return { kind: "err", reason: "remove-item.itemId references unknown or cross-project item" };
  return { kind: "ok", value: { kind: "remove-item", itemId } };
}

function parseReorderItem(raw: Record<string, unknown>, knownById: Map<string, KnownPlanItem>, contextTripProjectId: string): ParseResult {
  const itemId = parseRequiredStringId(raw.itemId);
  if (itemId === "invalid") return { kind: "err", reason: "reorder-item.itemId missing or invalid" };
  const known = knownById.get(itemId);
  if (!known) return { kind: "err", reason: "reorder-item.itemId references unknown or cross-project item" };

  const parentItemId = parseOptionalStringId(raw.parentItemId);
  if (parentItemId === "invalid") return { kind: "err", reason: "reorder-item.parentItemId invalid" };
  const parentId = parentItemId ?? null;
  // Reuse the shared same-project parent rules (finding 9). Activities may carry
  // a parent leg; non-activities must not carry a parent.
  if (parentId !== null) {
    const references = knownItemsToReferences(knownById, contextTripProjectId);
    const refError = validatePlanReferencesRules(
      contextTripProjectId,
      { kind: known.kind, parentItemId: parentId, backupTargetItemId: known.backupTargetItemId },
      references,
      itemId,
    );
    if (refError) return { kind: "err", reason: refError };
  }

  const ordinal = parseOrdinal(raw.ordinal);
  if (typeof ordinal === "string") return { kind: "err", reason: ordinal };

  return { kind: "ok", value: { kind: "reorder-item", itemId, parentItemId: parentId, ordinal } };
}

function parseChangeItemState(raw: Record<string, unknown>, knownById: Map<string, KnownPlanItem>, contextTripProjectId: string): ParseResult {
  const itemId = parseRequiredStringId(raw.itemId);
  if (itemId === "invalid") return { kind: "err", reason: "change-item-state.itemId missing or invalid" };
  const known = knownById.get(itemId);
  if (!known) return { kind: "err", reason: "change-item-state.itemId references unknown or cross-project item" };

  const state = raw.state;
  if (typeof state !== "string" || !validStates.includes(state as TripPlanItemState)) {
    return { kind: "err", reason: "change-item-state.state invalid" };
  }
  const nextState = state as TripPlanItemState;

  const backupTargetRaw = parseOptionalStringId(raw.backupTargetItemId);
  if (backupTargetRaw === "invalid") return { kind: "err", reason: "change-item-state.backupTargetItemId invalid" };
  const backupTargetItemId = backupTargetRaw ?? null;
  if ((nextState === "backup") !== (backupTargetItemId !== null)) {
    return { kind: "err", reason: "backup state requires backupTargetItemId and vice versa" };
  }
  // Reuse the shared same-project/no-cycle rules (finding 9) for a backup target
  // that is new for this item.
  if (backupTargetItemId !== null && backupTargetItemId !== known.backupTargetItemId) {
    const references = knownItemsToReferences(knownById, contextTripProjectId);
    const refError = validatePlanReferencesRules(
      contextTripProjectId,
      { kind: known.kind, parentItemId: known.parentItemId, backupTargetItemId },
      references,
      itemId,
    );
    if (refError) return { kind: "err", reason: refError };
  }

  return { kind: "ok", value: { kind: "change-item-state", itemId, state: nextState, backupTargetItemId } };
}

function parseUpsertConstraints(raw: Record<string, unknown>): ParseResult {
  const constraints = raw.constraints;
  if (!isRecord(constraints)) return { kind: "err", reason: "upsert-constraints.constraints missing" };
  const validated = validateConstraintsDraft(constraints);
  if (typeof validated === "string") return { kind: "err", reason: validated };

  const expectedConstraintsVersionRaw = raw.expectedConstraintsVersion;
  let expectedConstraintsVersion: number | null | undefined = undefined;
  if (expectedConstraintsVersionRaw === null) {
    expectedConstraintsVersion = null;
  } else if (expectedConstraintsVersionRaw === undefined) {
    expectedConstraintsVersion = undefined;
  } else if (typeof expectedConstraintsVersionRaw === "number" && Number.isInteger(expectedConstraintsVersionRaw) && expectedConstraintsVersionRaw >= 1) {
    expectedConstraintsVersion = expectedConstraintsVersionRaw;
  } else {
    return { kind: "err", reason: "upsert-constraints.expectedConstraintsVersion invalid" };
  }

  return { kind: "ok", value: { kind: "upsert-constraints", constraints: validated, expectedConstraintsVersion } };
}

function parseItemDraft(item: Record<string, unknown>): TripChangeProposalItemDraft | string {
  const kind = item.kind;
  if (typeof kind !== "string" || !validKinds.includes(kind as TripPlanItemKind)) return "item.kind invalid";
  const itemKind = kind as TripPlanItemKind;

  const anchorRoleRaw = item.anchorRole;
  const typeRaw = item.type;
  let anchorRole: TripPlanAnchorRole | null | undefined = undefined;
  let type: TripPlanItemType | null | undefined = undefined;

  if (itemKind === "anchor") {
    if (typeof anchorRoleRaw !== "string" || !validAnchorRoles.includes(anchorRoleRaw as TripPlanAnchorRole)) return "item.anchorRole invalid for anchor";
    anchorRole = anchorRoleRaw as TripPlanAnchorRole;
    if (typeRaw !== null && typeRaw !== undefined) return "anchor must not carry a type";
    type = null;
  } else {
    if (typeof typeRaw !== "string" || !validTypes.includes(typeRaw as TripPlanItemType)) return "item.type invalid for leg/activity";
    type = typeRaw as TripPlanItemType;
    if (anchorRoleRaw !== null && anchorRoleRaw !== undefined) return "leg/activity must not carry an anchorRole";
    anchorRole = null;
  }

  const state = item.state;
  if (typeof state !== "string" || !validStates.includes(state as TripPlanItemState)) return "item.state invalid";
  const itemState = state as TripPlanItemState;

  const label = parseBoundedLabel(item.label);
  if (label === undefined) return "label must be 1-160 chars single-line";

  const notes = parseBoundedNotes(item.notes);
  if (notes === undefined) return "notes must be 1-1000 chars single-line";

  const plannedAt = parseOptionalPlannedAt(item.plannedAt);
  if (plannedAt === undefined) return "plannedAt must be a valid ISO date";

  const transportOriginLabel = parseBoundedOptionalLabel(item.transportOriginLabel);
  if (transportOriginLabel === undefined) return "transportOriginLabel must be 1-160 chars single-line";
  const transportDestinationLabel = parseBoundedOptionalLabel(item.transportDestinationLabel);
  if (transportDestinationLabel === undefined) return "transportDestinationLabel must be 1-160 chars single-line";
  const accommodationPlaceAreaLabel = parseBoundedOptionalLabel(item.accommodationPlaceAreaLabel);
  if (accommodationPlaceAreaLabel === undefined) return "accommodationPlaceAreaLabel must be 1-160 chars single-line";

  if (type !== "transport" && (transportOriginLabel || transportDestinationLabel)) return "transport fields only allowed on transport type";
  if (type !== "accommodation" && accommodationPlaceAreaLabel) return "accommodation area only allowed on accommodation type";

  const backupTargetRaw = parseOptionalStringId(item.backupTargetItemId);
  if (backupTargetRaw === "invalid") return "item.backupTargetItemId invalid";
  const backupTargetItemId = backupTargetRaw ?? null;
  if ((itemState === "backup") !== (backupTargetItemId !== null)) return "backup state requires backupTargetItemId and vice versa";

  return {
    kind: itemKind,
    anchorRole,
    type,
    state: itemState,
    label,
    notes,
    plannedAt,
    transportOriginLabel,
    transportDestinationLabel,
    accommodationPlaceAreaLabel,
    backupTargetItemId,
  };
}

function parseItemChanges(changes: Record<string, unknown>, known: KnownPlanItem): TripChangeProposalItemChanges | string {
  const allowed = new Set(["label", "notes", "plannedAt", "state", "backupTargetItemId", "transportOriginLabel", "transportDestinationLabel", "accommodationPlaceAreaLabel"]);
  for (const key of Object.keys(changes)) {
    if (!allowed.has(key)) return `changes field "${key}" not permitted`;
  }

  const result: TripChangeProposalItemChanges = {};

  if (changes.label !== undefined) {
    const label = parseBoundedLabel(changes.label);
    if (label === undefined) return "label must be 1-160 chars single-line";
    result.label = label;
  }

  if (changes.notes !== undefined) {
    const notes = parseBoundedNotes(changes.notes);
    if (notes === undefined) return "notes must be 1-1000 chars single-line";
    result.notes = notes;
  }

  if (changes.plannedAt !== undefined) {
    const plannedAt = parseOptionalPlannedAt(changes.plannedAt);
    if (plannedAt === undefined) return "plannedAt must be a valid ISO date";
    result.plannedAt = plannedAt;
  }

  if (changes.state !== undefined) {
    if (typeof changes.state !== "string" || !validStates.includes(changes.state as TripPlanItemState)) return "changes.state invalid";
    result.state = changes.state as TripPlanItemState;
  }

  if (changes.backupTargetItemId !== undefined) {
    const backupTargetRaw = parseOptionalStringId(changes.backupTargetItemId);
    if (backupTargetRaw === "invalid") return "changes.backupTargetItemId invalid";
    result.backupTargetItemId = backupTargetRaw ?? null;
  }

  if (changes.transportOriginLabel !== undefined) {
    const v = parseBoundedOptionalLabel(changes.transportOriginLabel);
    if (v === undefined) return "transportOriginLabel must be 1-160 chars single-line";
    result.transportOriginLabel = v;
  }

  if (changes.transportDestinationLabel !== undefined) {
    const v = parseBoundedOptionalLabel(changes.transportDestinationLabel);
    if (v === undefined) return "transportDestinationLabel must be 1-160 chars single-line";
    result.transportDestinationLabel = v;
  }

  if (changes.accommodationPlaceAreaLabel !== undefined) {
    const v = parseBoundedOptionalLabel(changes.accommodationPlaceAreaLabel);
    if (v === undefined) return "accommodationPlaceAreaLabel must be 1-160 chars single-line";
    result.accommodationPlaceAreaLabel = v;
  }

  const itemType = known.type;
  if (result.transportOriginLabel !== undefined || result.transportDestinationLabel !== undefined) {
    if (itemType !== "transport") return "transport fields only allowed on transport type";
  }
  if (result.accommodationPlaceAreaLabel !== undefined) {
    if (itemType !== "accommodation") return "accommodation area only allowed on accommodation type";
  }
  if (result.state !== undefined || result.backupTargetItemId !== undefined) {
    const nextState = result.state ?? known.state;
    const nextBackup = result.backupTargetItemId !== undefined ? result.backupTargetItemId : known.backupTargetItemId;
    if ((nextState === "backup") !== (nextBackup !== null)) {
      return "backup state requires backupTargetItemId and vice versa";
    }
  }

  return result;
}

// Mirrors the Story 7.1 travel-relevant constraints allowlist (AD-29).
function validateConstraintsDraft(input: Record<string, unknown>): TripChangeProposalConstraintsDraft | string {
  const allowed = new Set(["adultCount", "childCount", "children", "vehicleType", "evChargingNeed", "drivingToleranceHours", "budgetCurrency", "budgetMinVnd", "budgetMaxVnd", "preferenceTags", "avoidItems"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) return `constraints field "${key}" not permitted`;
  }

  const adultCountRaw = input.adultCount;
  const childCountRaw = input.childCount;
  const adultCount = adultCountRaw === undefined || adultCountRaw === null ? null : adultCountRaw;
  const childCount = childCountRaw === undefined || childCountRaw === null ? null : childCountRaw;
  if (adultCount !== null && !Number.isInteger(adultCount)) return "adultCount must be an integer";
  if (childCount !== null && !Number.isInteger(childCount)) return "childCount must be an integer";
  if (adultCount === null && childCount === null) return "at least one of adultCount or childCount is required";
  const adultNum = (adultCount as number | null) ?? 0;
  const childNum = (childCount as number | null) ?? 0;
  if (adultNum + childNum < 1 || adultNum + childNum > 20) return "traveler count must be between 1 and 20";
  if (adultCount !== null && (adultNum < 0 || adultNum > 20)) return "adultCount out of range";
  if (childCount !== null && (childNum < 0 || childNum > 20)) return "childCount out of range";

  const vehicleTypeRaw = input.vehicleType === undefined || input.vehicleType === null ? null : input.vehicleType;
  if (vehicleTypeRaw !== null && (typeof vehicleTypeRaw !== "string" || !validVehicleTypes.has(vehicleTypeRaw))) return "vehicleType invalid";
  const vehicleType = vehicleTypeRaw as "car" | "motorcycle" | "ev" | null;

  const evChargingNeedRaw = input.evChargingNeed === undefined || input.evChargingNeed === null ? null : input.evChargingNeed;
  if (evChargingNeedRaw !== null && (typeof evChargingNeedRaw !== "string" || !validEvNeeds.has(evChargingNeedRaw) || vehicleType !== "ev")) return "evChargingNeed invalid or requires vehicleType=ev";
  const evChargingNeed = evChargingNeedRaw as "none" | "preferred" | "required" | null;

  const drivingToleranceRaw = input.drivingToleranceHours === undefined || input.drivingToleranceHours === null ? null : input.drivingToleranceHours;
  if (drivingToleranceRaw !== null && (typeof drivingToleranceRaw !== "number" || !Number.isInteger(drivingToleranceRaw) || drivingToleranceRaw < 1 || drivingToleranceRaw > 12)) return "drivingToleranceHours must be between 1 and 12";
  const drivingToleranceHours = drivingToleranceRaw as number | null;

  const hasBudget = input.budgetCurrency !== undefined || input.budgetMinVnd !== undefined || input.budgetMaxVnd !== undefined;
  let budgetMinVnd: number | null = null;
  let budgetMaxVnd: number | null = null;
  if (hasBudget) {
    if (input.budgetCurrency !== "VND") return "budgetCurrency must be VND";
    if (typeof input.budgetMinVnd !== "number" || !Number.isInteger(input.budgetMinVnd)) return "budget bounds must be integers";
    if (typeof input.budgetMaxVnd !== "number" || !Number.isInteger(input.budgetMaxVnd)) return "budget bounds must be integers";
    budgetMinVnd = input.budgetMinVnd as number;
    budgetMaxVnd = input.budgetMaxVnd as number;
    if (budgetMinVnd < 0 || budgetMaxVnd > 1_000_000_000 || budgetMinVnd > budgetMaxVnd) return "budget bounds out of range";
  }

  let children: unknown[] | null = null;
  if (input.children !== undefined && input.children !== null) {
    if (!Array.isArray(input.children) || input.children.length > 10) return "children must be an array of at most 10";
    for (const child of input.children) {
      if (!isChildConstraint(child)) return "children entry shape invalid";
    }
    children = input.children;
  }

  let preferenceTags: string[] | null = null;
  if (input.preferenceTags !== undefined && input.preferenceTags !== null) {
    if (!Array.isArray(input.preferenceTags) || input.preferenceTags.length > 20) return "preferenceTags must be an array of at most 20";
    const tags = input.preferenceTags as unknown[];
    if (new Set(tags).size !== tags.length) return "preferenceTags must be unique";
    if (!tags.every((tag) => typeof tag === "string" && tripPreferenceTagSet.has(tag))) return "preferenceTags contains unknown tag";
    preferenceTags = tags as string[];
  }

  let avoidItems: unknown[] | null = null;
  if (input.avoidItems !== undefined && input.avoidItems !== null) {
    if (!Array.isArray(input.avoidItems) || input.avoidItems.length > 20) return "avoidItems must be an array of at most 20";
    if (!(input.avoidItems as unknown[]).every((item) => isAvoidItem(item))) return "avoidItems entry shape invalid";
    avoidItems = input.avoidItems;
  }

  return {
    adultCount: adultCount as number | null,
    childCount: childCount as number | null,
    children,
    vehicleType,
    evChargingNeed,
    drivingToleranceHours,
    budgetCurrency: hasBudget ? "VND" : null,
    budgetMinVnd,
    budgetMaxVnd,
    preferenceTags,
    avoidItems,
  };
}

function isChildConstraint(value: unknown): boolean {
  if (!isRecord(value) || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "ageMax,ageMin,comfortTags,preferenceTags") return false;
  const child = value as { ageMin?: unknown; ageMax?: unknown; comfortTags?: unknown; preferenceTags?: unknown };
  return (
    Number.isInteger(child.ageMin) &&
    Number.isInteger(child.ageMax) &&
    (child.ageMin as number) >= 0 &&
    (child.ageMax as number) <= 17 &&
    (child.ageMin as number) <= (child.ageMax as number) &&
    isTagArray(child.comfortTags, comfortTagSet, 6) &&
    isTagArray(child.preferenceTags, childPreferenceTagSet, 6)
  );
}

function isTagArray(value: unknown, allowed: Set<string>, maxLength: number): boolean {
  return Array.isArray(value) && value.length <= maxLength && new Set(value).size === value.length && value.every((tag) => typeof tag === "string" && allowed.has(tag));
}

function isAvoidItem(value: unknown): boolean {
  if (!isRecord(value) || Array.isArray(value)) return false;
  const item = value as { category?: unknown; label?: unknown };
  if (item.category !== "place" && item.category !== "activity") return false;
  if (typeof item.label !== "string") return false;
  const trimmed = item.label.trim();
  return trimmed.length > 0 && trimmed.length <= 120 && !/[\r\n]/.test(item.label);
}

function parseBoundedLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLabelLength || /[\r\n]/.test(trimmed)) return undefined;
  if (containsUnsafeContent(trimmed)) return undefined;
  return trimmed;
}

function parseBoundedNotes(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxNotesLength || /[\r\n]/.test(trimmed)) return undefined;
  if (containsUnsafeContent(trimmed)) return undefined;
  return trimmed;
}

function parseBoundedOptionalLabel(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLabelLength || /[\r\n]/.test(trimmed)) return undefined;
  if (containsUnsafeContent(trimmed)) return undefined;
  return trimmed;
}

function parseOptionalPlannedAt(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (Number.isNaN(Date.parse(trimmed))) return undefined;
  return trimmed;
}

function parseOrdinal(value: unknown): number | string {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return "ordinal must be a non-negative integer";
  return value;
}

function parseRequiredStringId(value: unknown): string | "invalid" {
  if (typeof value !== "string" || !value.trim()) return "invalid";
  return value.trim();
}

function parseOptionalStringId(value: unknown): string | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function containsUnsafeContent(value: string): boolean {
  return unsafeContentPatterns.some((pattern) => pattern.test(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function persistAiTripChangeProposalDraft(
  input: PersistAiTripChangeProposalDraftInput,
): Promise<PersistAiTripChangeProposalDraftResult> {
  const session = await getAuthenticatedSession();
  if (!session) return { success: false, reason: "unauthenticated" };

  const rationaleResult = normalizeRationale(input.rationale);
  if (!rationaleResult.ok) return { success: false, reason: "invalid" };
  const rationale = rationaleResult.value;

  const alternatives = normalizeAlternatives(input.alternatives);
  if (alternatives === "invalid") return { success: false, reason: "invalid" };

  if (!Number.isInteger(input.expectedAggregateVersion) || input.expectedAggregateVersion < 1) {
    return { success: false, reason: "invalid" };
  }

  try {
    return await getDb().transaction(async (transaction) => {
      const [project] = await transaction
        .select({ aggregateVersion: tripProjects.aggregateVersion })
        .from(tripProjects)
        .where(and(eq(tripProjects.id, input.tripProjectId), eq(tripProjects.userId, session.userId)))
        .limit(1)
        .for("update");

      if (!project) return { success: false, reason: "not_found" };
      if (project.aggregateVersion !== input.expectedAggregateVersion) {
        return { success: false, reason: "refresh_required" };
      }

      // Validate operations against the current aggregate before persisting.
      // The dev judges omission of interdependent operations unsafe in 7.4, so
      // any rejected operation rejects the whole draft (no proposal row written).
      // Load the full projection (label/ordinal/notes/plannedAt/transport/
      // accommodation) so the owner-facing summary can derive real affected items
      // and before/after impact (Story 7.4 review findings 2 and 3).
      const knownItemRows = await transaction
        .select({
          id: tripPlanItems.id,
          kind: tripPlanItems.kind,
          anchorRole: tripPlanItems.anchorRole,
          type: tripPlanItems.type,
          state: tripPlanItems.state,
          parentItemId: tripPlanItems.parentItemId,
          backupTargetItemId: tripPlanItems.backupTargetItemId,
          label: tripPlanItems.label,
          ordinal: tripPlanItems.ordinal,
          notes: tripPlanItems.notes,
          plannedAt: tripPlanItems.plannedAt,
          transportOriginLabel: tripPlanItems.transportOriginLabel,
          transportDestinationLabel: tripPlanItems.transportDestinationLabel,
          accommodationPlaceAreaLabel: tripPlanItems.accommodationPlaceAreaLabel,
        })
        .from(tripPlanItems)
        .where(and(eq(tripPlanItems.tripProjectId, input.tripProjectId), eq(tripPlanItems.userId, session.userId)));

      const knownItems: KnownPlanItem[] = knownItemRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        anchorRole: row.anchorRole,
        type: row.type,
        state: row.state,
        parentItemId: row.parentItemId,
        backupTargetItemId: row.backupTargetItemId,
        label: row.label,
        ordinal: row.ordinal,
        notes: row.notes,
        plannedAt: row.plannedAt ? row.plannedAt.toISOString() : null,
        transportOriginLabel: row.transportOriginLabel,
        transportDestinationLabel: row.transportDestinationLabel,
        accommodationPlaceAreaLabel: row.accommodationPlaceAreaLabel,
      }));

      const { valid, rejected } = validateProposalOperations(input.operations, { knownItems, tripProjectId: input.tripProjectId });
      if (rejected.length > 0 || valid.length === 0) {
        return { success: false, reason: "invalid" };
      }

      const [inserted] = await transaction
        .insert(tripChangeProposals)
        .values({
          tripProjectId: input.tripProjectId,
          userId: session.userId,
          creatorClass: "ai_orchestration",
          status: "pending",
          rationale,
          operations: valid as unknown as Record<string, unknown>,
          expectedAggregateVersion: input.expectedAggregateVersion,
          expectedItemVersions: (input.expectedItemVersions ?? null) as Record<string, number> | null,
          orderingPreconditions: (input.orderingPreconditions ?? null) as Record<string, unknown> | null,
          alternatives: alternatives as unknown as Record<string, unknown> | null,
          expiresAt: input.expiresAt ?? null,
          sourceAssistantMessageId: input.sourceAssistantMessageId ?? null,
        })
        .returning({
          id: tripChangeProposals.id,
          status: tripChangeProposals.status,
          rationale: tripChangeProposals.rationale,
          operations: tripChangeProposals.operations,
          alternatives: tripChangeProposals.alternatives,
          expiresAt: tripChangeProposals.expiresAt,
          createdAt: tripChangeProposals.createdAt,
        });

      await recordAuditEvent(
        {
          actor: session,
          operation: "create",
          targetType: "trip_change_proposal",
          targetId: inserted.id,
          afterSummary: JSON.stringify({
            tripProjectId: input.tripProjectId,
            proposalId: inserted.id,
            status: inserted.status,
            expectedAggregateVersion: input.expectedAggregateVersion,
          }),
          actorClass: "user",
        },
        transaction,
      );

      const summary = toOwnedSummary(inserted, input.tripProjectId, valid, knownItems);
      return { success: true, proposal: summary };
    });
  } catch (error) {
    console.error("Failed to persist AI trip change proposal draft.", {
      tripProjectId: input.tripProjectId,
      userId: session.userId,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    return { success: false, reason: "invalid" };
  }
}

export async function listPendingProposalsForTripProject(
  tripProjectId: string,
): Promise<OwnedTripChangeProposalSummary[] | null> {
  const session = await getAuthenticatedSession();
  if (!session) return null;

  // Story 7.5: expire-on-read. Before returning the pending list, expire every
  // elapsed pending proposal in its own fenced transaction so Trip Home focus
  // and the workspace panel never treat an elapsed proposal as pending. The
  // expire command is idempotent and runs in its own transaction; the read is
  // NOT nested inside the expire transaction (avoid holding locks across reads).
  await expireElapsedPendingProposals(tripProjectId, session.userId, new Date());

  const rows = await getDb()
    .select({
      id: tripChangeProposals.id,
      status: tripChangeProposals.status,
      rationale: tripChangeProposals.rationale,
      operations: tripChangeProposals.operations,
      alternatives: tripChangeProposals.alternatives,
      expiresAt: tripChangeProposals.expiresAt,
      createdAt: tripChangeProposals.createdAt,
      terminalTimestamp: tripChangeProposals.terminalTimestamp,
    })
    .from(tripChangeProposals)
    .where(and(
      eq(tripChangeProposals.tripProjectId, tripProjectId),
      eq(tripChangeProposals.userId, session.userId),
      eq(tripChangeProposals.status, "pending"),
    ))
    .orderBy(asc(tripChangeProposals.createdAt), asc(tripChangeProposals.id));

  if (rows.length === 0) return [];

  // Load the current plan items so the owner-facing summary can derive real
  // affected-item labels and before/after impact (Story 7.4 review findings 2
  // and 3). A proposal may reference items that no longer exist; those fall back
  // to a safe minimal projection (finding 2 fallback).
  const knownItems = await loadKnownItemsForSummary(tripProjectId, session.userId);

  return rows.map((row) => toOwnedSummary(row, tripProjectId, row.operations, knownItems));
}

export async function getProposalForOwnerReview(
  tripProjectId: string,
  proposalId: string,
): Promise<OwnedTripChangeProposalSummary | null> {
  const session = await getAuthenticatedSession();
  if (!session) return null;

  // Story 7.5: expire-on-read. If this specific proposal is elapsed and still
  // pending, expire it before returning so the review card renders the expired
  // state instead of a stale pending state.
  await expireElapsedPendingProposals(tripProjectId, session.userId, new Date(), proposalId);

  const [row] = await getDb()
    .select({
      id: tripChangeProposals.id,
      status: tripChangeProposals.status,
      rationale: tripChangeProposals.rationale,
      operations: tripChangeProposals.operations,
      alternatives: tripChangeProposals.alternatives,
      expiresAt: tripChangeProposals.expiresAt,
      createdAt: tripChangeProposals.createdAt,
      terminalTimestamp: tripChangeProposals.terminalTimestamp,
    })
    .from(tripChangeProposals)
    .where(and(
      eq(tripChangeProposals.id, proposalId),
      eq(tripChangeProposals.tripProjectId, tripProjectId),
      eq(tripChangeProposals.userId, session.userId),
    ))
    .limit(1);

  if (!row) return null;
  const knownItems = await loadKnownItemsForSummary(tripProjectId, session.userId);
  return toOwnedSummary(row, tripProjectId, row.operations, knownItems);
}

// Story 7.5: expire every elapsed pending proposal for the owner scope in its
// own fenced transaction. When `proposalId` is supplied, only that proposal is
// considered (used by getProposalForOwnerReview). The read is NOT nested inside
// the expire transaction. Owner scope is enforced via the (tripProjectId,
// userId) predicate inside expireTripChangeProposal.
async function expireElapsedPendingProposals(tripProjectId: string, userId: string, now: Date, proposalId?: string) {
  const rows = await getDb()
    .select({ id: tripChangeProposals.id })
    .from(tripChangeProposals)
    .where(and(
      eq(tripChangeProposals.tripProjectId, tripProjectId),
      eq(tripChangeProposals.userId, userId),
      eq(tripChangeProposals.status, "pending"),
      isNotNull(tripChangeProposals.expiresAt),
      lte(tripChangeProposals.expiresAt, now),
      ...(proposalId ? [eq(tripChangeProposals.id, proposalId)] : []),
    ));
  for (const row of rows) {
    // Q1: expire-on-read is a best-effort side effect. P11 made
    // expireTripChangeProposal re-throw transient DB errors so the worker can
    // retry; the read path must NOT inherit that throw — a momentary DB blip
    // during expire would fail the user's entire pending-proposals/proposal-
    // review read (Trip Home / workspace panel error). Wrap each call so a
    // transient expire error is logged and skipped; the next read retries
    // expire, and the pending filter below still drops any row that did expire.
    try {
      await expireTripChangeProposal({ tripProjectId, proposalId: row.id, now });
    } catch (error) {
      console.error("Transient error expiring elapsed pending proposal on read; skipping.", {
        tripProjectId,
        proposalId: row.id,
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      });
    }
  }
}

async function loadKnownItemsForSummary(tripProjectId: string, userId: string): Promise<KnownPlanItem[]> {
  const rows = await getDb()
    .select({
      id: tripPlanItems.id,
      kind: tripPlanItems.kind,
      anchorRole: tripPlanItems.anchorRole,
      type: tripPlanItems.type,
      state: tripPlanItems.state,
      parentItemId: tripPlanItems.parentItemId,
      backupTargetItemId: tripPlanItems.backupTargetItemId,
      label: tripPlanItems.label,
      ordinal: tripPlanItems.ordinal,
      notes: tripPlanItems.notes,
      plannedAt: tripPlanItems.plannedAt,
      transportOriginLabel: tripPlanItems.transportOriginLabel,
      transportDestinationLabel: tripPlanItems.transportDestinationLabel,
      accommodationPlaceAreaLabel: tripPlanItems.accommodationPlaceAreaLabel,
    })
    .from(tripPlanItems)
    .where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, userId)));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    anchorRole: row.anchorRole,
    type: row.type,
    state: row.state,
    parentItemId: row.parentItemId,
    backupTargetItemId: row.backupTargetItemId,
    label: row.label,
    ordinal: row.ordinal,
    notes: row.notes,
    plannedAt: row.plannedAt ? row.plannedAt.toISOString() : null,
    transportOriginLabel: row.transportOriginLabel,
    transportDestinationLabel: row.transportDestinationLabel,
    accommodationPlaceAreaLabel: row.accommodationPlaceAreaLabel,
  }));
}

function normalizeRationale(value: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxRationaleLength || /[\r\n]/.test(trimmed)) return { ok: false };
  if (containsUnsafeContent(trimmed)) return { ok: false };
  return { ok: true, value: trimmed };
}

function normalizeAlternatives(value: unknown): unknown[] | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length > maxAlternatives) return "invalid";
  const normalized: TripChangeProposalAlternativeSummary[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return "invalid";
    const summary = entry.summary;
    if (typeof summary !== "string") return "invalid";
    const trimmed = summary.trim();
    if (!trimmed || trimmed.length > maxAlternativeSummaryLength || /[\r\n]/.test(trimmed)) return "invalid";
    if (containsUnsafeContent(trimmed)) return "invalid";
    normalized.push({ summary: trimmed });
  }
  return normalized;
}

function toOwnedSummary(
  row: {
    id: string;
    status: TripChangeProposalStatus;
    rationale: string;
    operations: unknown;
    alternatives: unknown;
    expiresAt: Date | null;
    createdAt: Date;
    terminalTimestamp?: Date | null;
  },
  tripProjectId: string,
  operations: unknown,
  knownItems: KnownPlanItem[] = [],
): OwnedTripChangeProposalSummary {
  const ops = Array.isArray(operations) ? operations : [];
  const knownById = new Map<string, KnownPlanItem>();
  for (const item of knownItems) {
    if (item && typeof item.id === "string" && item.id) knownById.set(item.id, item);
  }
  const affectedItems = deriveAffectedItems(ops, knownById);
  const beforeAfter = deriveBeforeAfter(ops, knownById);
  const alternativesRaw = Array.isArray(row.alternatives) ? row.alternatives : [];
  const alternatives: TripChangeProposalAlternativeSummary[] = alternativesRaw
    .map((entry) => (isRecord(entry) && typeof entry.summary === "string" ? { summary: entry.summary.slice(0, maxAlternativeSummaryLength) } : null))
    .filter((entry): entry is TripChangeProposalAlternativeSummary => entry !== null);

  return {
    id: row.id,
    tripProjectId,
    status: row.status,
    rationale: row.rationale,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    affectedItems,
    beforeAfter,
    alternatives,
    hasAlternatives: alternatives.length > 0,
    terminalTimestamp: row.terminalTimestamp ?? null,
  };
}

// Story 7.4 review finding 2: identify the affected item using the loaded known
// items instead of hardcoding kind="activity" and label="". When an item has been
// removed (no longer in the aggregate), fall back to a safe minimal projection
// so the review card still names the change without leaking a raw UUID.
function deriveAffectedItems(operations: unknown[], knownById: Map<string, KnownPlanItem>): TripChangeProposalAffectedItemRef[] {
  const refs: TripChangeProposalAffectedItemRef[] = [];
  for (const op of operations) {
    if (!isRecord(op)) continue;
    const kind = op.kind;
    if (kind === "create-item" && isRecord(op.item)) {
      const item = op.item;
      if (typeof item.kind === "string" && validKinds.includes(item.kind as TripPlanItemKind) && typeof item.label === "string") {
        refs.push({ itemId: "(mới)", kind: item.kind as TripPlanItemKind, label: item.label.slice(0, maxLabelLength), change: "create" });
      }
    } else if (kind === "update-item" && typeof op.itemId === "string") {
      const known = knownById.get(op.itemId);
      refs.push({ itemId: op.itemId, kind: known?.kind ?? "activity", label: known?.label ?? "(đã xoá)", change: "update" });
    } else if (kind === "remove-item" && typeof op.itemId === "string") {
      const known = knownById.get(op.itemId);
      refs.push({ itemId: op.itemId, kind: known?.kind ?? "activity", label: known?.label ?? "(đã xoá)", change: "remove" });
    } else if (kind === "reorder-item" && typeof op.itemId === "string") {
      const known = knownById.get(op.itemId);
      refs.push({ itemId: op.itemId, kind: known?.kind ?? "activity", label: known?.label ?? "(đã xoá)", change: "reorder" });
    } else if (kind === "change-item-state" && typeof op.itemId === "string") {
      const known = knownById.get(op.itemId);
      refs.push({ itemId: op.itemId, kind: known?.kind ?? "activity", label: known?.label ?? "(đã xoá)", change: "change-state" });
    } else if (kind === "upsert-constraints") {
      refs.push({ itemId: "constraints", kind: "activity", label: "Ràng buộc", change: "upsert-constraints" });
    }
  }
  return refs.slice(0, maxOperations);
}

// Vietnamese labels for the structured fields an update-item can change, so the
// before/after impact reads naturally in the review card (Story 7.4 review
// finding 3) and the change-item-state row shows Vietnamese state labels instead
// of raw English enums (finding 5).
const changeFieldLabels: Record<string, string> = {
  label: "Tên",
  notes: "Ghi chú",
  plannedAt: "Thời gian",
  state: "Trạng thái",
  backupTargetItemId: "Phương án B",
  transportOriginLabel: "Điểm đi",
  transportDestinationLabel: "Điểm đến",
  accommodationPlaceAreaLabel: "Khu vực lưu trú",
};

function describeKnownFieldValue(known: KnownPlanItem | undefined, field: string, knownById: Map<string, KnownPlanItem>): string | null {
  if (!known) return null;
  switch (field) {
    case "label":
      return known.label ?? null;
    case "notes":
      return known.notes ?? null;
    case "plannedAt":
      return known.plannedAt ?? null;
    case "state":
      return tripPlanItemStateLabels[known.state] ?? known.state;
    case "backupTargetItemId":
      if (!known.backupTargetItemId) return null;
      return knownById.get(known.backupTargetItemId)?.label ?? known.backupTargetItemId;
    case "transportOriginLabel":
      return known.transportOriginLabel ?? null;
    case "transportDestinationLabel":
      return known.transportDestinationLabel ?? null;
    case "accommodationPlaceAreaLabel":
      return known.accommodationPlaceAreaLabel ?? null;
    default:
      return null;
  }
}

function describeChangeValue(field: string, value: unknown, knownById: Map<string, KnownPlanItem>): string | null {
  if (value === null || value === undefined) return null;
  if (field === "state" && typeof value === "string") {
    return tripPlanItemStateLabels[value as TripPlanItemState] ?? value;
  }
  if (field === "backupTargetItemId" && typeof value === "string") {
    return knownById.get(value)?.label ?? value;
  }
  if (typeof value === "string") return value;
  return null;
}

// Story 7.4 review finding 3: derive a real before/after impact instead of
// before=null and a comma-joined list of field NAMES. For update-item, emit one
// entry per changed field so each before→after is precise. For change-item-state
// (finding 5), show the Vietnamese state label, not the raw English enum. For
// reorder-item, show the before/after ordinal. For remove-item, show the removed
// label as `before` so the owner can see what is being removed.
function deriveBeforeAfter(operations: unknown[], knownById: Map<string, KnownPlanItem>): TripChangeProposalBeforeAfterSummary[] {
  const summaries: TripChangeProposalBeforeAfterSummary[] = [];
  for (const op of operations) {
    if (!isRecord(op)) continue;
    const kind = op.kind;
    if (kind === "create-item" && isRecord(op.item) && typeof op.item.label === "string") {
      summaries.push({ operation: "Tạo mục mới", before: null, after: op.item.label.slice(0, maxLabelLength) });
    } else if (kind === "update-item" && isRecord(op.changes) && typeof op.itemId === "string") {
      const known = knownById.get(op.itemId);
      const knownLabel = known?.label ?? "(đã xoá)";
      for (const [field, newValue] of Object.entries(op.changes)) {
        if (!(field in changeFieldLabels)) continue;
        const before = describeKnownFieldValue(known, field, knownById);
        const after = describeChangeValue(field, newValue, knownById);
        const fieldLabel = changeFieldLabels[field] ?? field;
        const operation = `Cập nhật ${fieldLabel} · ${knownLabel}`;
        summaries.push({ operation, before, after });
      }
    } else if (kind === "remove-item" && typeof op.itemId === "string") {
      const known = knownById.get(op.itemId);
      summaries.push({ operation: "Xoá mục", before: known?.label ?? "(đã xoá)", after: null });
    } else if (kind === "reorder-item" && typeof op.itemId === "string") {
      const known = knownById.get(op.itemId);
      const knownLabel = known?.label ?? "(đã xoá)";
      const beforeOrdinal = known?.ordinal !== undefined ? `vị trí ${known.ordinal}` : null;
      const afterOrdinal = typeof op.ordinal === "number" ? `vị trí ${op.ordinal}` : null;
      summaries.push({ operation: `Sắp xếp lại · ${knownLabel}`, before: beforeOrdinal, after: afterOrdinal });
    } else if (kind === "change-item-state" && typeof op.itemId === "string" && typeof op.state === "string") {
      const known = knownById.get(op.itemId);
      const knownLabel = known?.label ?? "(đã xoá)";
      const before = known ? (tripPlanItemStateLabels[known.state] ?? known.state) : null;
      const after = tripPlanItemStateLabels[op.state as TripPlanItemState] ?? op.state;
      summaries.push({ operation: `Đổi trạng thái · ${knownLabel}`, before, after });
    } else if (kind === "upsert-constraints") {
      summaries.push({ operation: "Cập nhật ràng buộc", before: null, after: null });
    }
  }
  return summaries.slice(0, maxOperations);
}

// P2: bound the jsonb byte length of { entries: [...] } to satisfy the
// trip_plan_change_history_safe_summary_check (octet_length <= 8192). Trim
// entries from the end (preserving the most important earlier operations)
// until the serialized payload fits within the safe limit.
function boundBeforeAfterSummary(entries: TripChangeProposalBeforeAfterSummary[]): Record<string, unknown> {
  for (let count = entries.length; count > 0; count--) {
    const payload = { entries: entries.slice(0, count) };
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") <= maxSafeSummaryBytes) {
      return payload;
    }
  }
  return { entries: [] };
}

// ===========================================================================
// Story 7.5: Terminal proposal commands (apply / dismiss / expire) and the
// owner-scoped plan history read. These are the only paths that mutate a
// proposal to a terminal status and the only path that applies typed
// operations to plan state (apply). dismiss/expire never mutate plan state.
// ===========================================================================

export type ApplyApprovedTripChangeInput = {
  tripProjectId: string;
  proposalId: string;
};

export type ApplyApprovedTripChangeResult =
  | { success: true; aggregateVersion: number; proposal: OwnedTripChangeProposalSummary }
  | { success: false; reason: "unauthenticated" | "not_found" | "refresh_required" | "expired" };

export type DismissTripChangeProposalInput = {
  tripProjectId: string;
  proposalId: string;
};

export type DismissTripChangeProposalResult =
  | { success: true; proposal: OwnedTripChangeProposalSummary }
  | { success: false; reason: "unauthenticated" | "not_found" };

export type ExpireTripChangeProposalInput = {
  tripProjectId: string;
  proposalId: string;
  now?: Date;
};

export type ExpireTripChangeProposalResult =
  | { success: true; proposal: OwnedTripChangeProposalSummary }
  | { success: false; reason: "not_found" };

export type TripPlanChangeHistoryRow = {
  id: string;
  proposalId: string | null;
  operationClass: TripPlanChangeHistoryOperationClass;
  actorClass: TripPlanChangeHistoryActorClass;
  actorSystem: string | null;
  actorUserId: string | null;
  createdAt: Date;
  affectedItemReferences: TripChangeProposalAffectedItemRef[];
  safeBeforeAfterSummary: TripChangeProposalBeforeAfterSummary[];
};

const maxPlanHistoryPreview = 20;

// AD-30: only applyApprovedTripChange may apply a proposal. In one transaction
// it authenticates the owner, locks the Trip Project, verifies proposal
// ownership/status/expiry, expected aggregate/item versions, and ordering/parent
// preconditions, applies all operations or none, records actor-correct
// audit/change-history rows, marks the proposal `applied`, and advances affected
// item/project versions. A conflict, expired proposal, missing item, or
// unauthorized request applies nothing and returns a safe refresh-required
// (or expired / not_found) result.
export async function applyApprovedTripChange(
  input: ApplyApprovedTripChangeInput,
): Promise<ApplyApprovedTripChangeResult> {
  const session = await getAuthenticatedSession();
  if (!session) return { success: false, reason: "unauthenticated" };

  const now = new Date();
  try {
    return await getDb().transaction(async (transaction) => {
      // Lock the Trip Project FOR UPDATE by (id, userId).
      const [project] = await transaction
        .select({ id: tripProjects.id, aggregateVersion: tripProjects.aggregateVersion, userId: tripProjects.userId })
        .from(tripProjects)
        .where(and(eq(tripProjects.id, input.tripProjectId), eq(tripProjects.userId, session.userId)))
        .limit(1)
        .for("update");
      if (!project) return { success: false, reason: "not_found" } as const;

      // Lock the proposal FOR UPDATE by (id, tripProjectId, userId).
      const [proposalRow] = await transaction
        .select({
          id: tripChangeProposals.id,
          status: tripChangeProposals.status,
          rationale: tripChangeProposals.rationale,
          operations: tripChangeProposals.operations,
          alternatives: tripChangeProposals.alternatives,
          expiresAt: tripChangeProposals.expiresAt,
          createdAt: tripChangeProposals.createdAt,
          expectedAggregateVersion: tripChangeProposals.expectedAggregateVersion,
          expectedItemVersions: tripChangeProposals.expectedItemVersions,
          orderingPreconditions: tripChangeProposals.orderingPreconditions,
        })
        .from(tripChangeProposals)
        .where(and(
          eq(tripChangeProposals.id, input.proposalId),
          eq(tripChangeProposals.tripProjectId, input.tripProjectId),
          eq(tripChangeProposals.userId, session.userId),
        ))
        .limit(1)
        .for("update");
      if (!proposalRow) return { success: false, reason: "not_found" } as const;

      // Idempotent re-apply: an already-terminal proposal is no-longer-applicable.
      if (proposalRow.status !== "pending") return { success: false, reason: "not_found" } as const;

      // Expired: refuse without calling expire (the next read will expire it).
      // Apply writes NO history row on failure.
      if (proposalRow.expiresAt && proposalRow.expiresAt.getTime() <= now.getTime()) {
        return { success: false, reason: "expired" } as const;
      }

      // Aggregate version fence.
      if (project.aggregateVersion !== proposalRow.expectedAggregateVersion) {
        return { success: false, reason: "refresh_required" } as const;
      }

      // Load the full current aggregate (plan items + constraints) so we can
      // verify item version fences, re-validate ordering preconditions, detect
      // cross-operation backup cycles, and execute every op in the same
      // transaction. The *InTransaction helpers re-lock the aggregate (same
      // transaction, safe) and re-verify the running version we thread forward.
      const itemRows = await transaction
        .select()
        .from(tripPlanItems)
        .where(and(eq(tripPlanItems.tripProjectId, input.tripProjectId), eq(tripPlanItems.userId, session.userId)));
      const itemById = new Map<string, typeof itemRows[number]>();
      for (const row of itemRows) itemById.set(row.id, row);

      const [constraintsRow] = await transaction
        .select({ version: tripProjectConstraints.version })
        .from(tripProjectConstraints)
        .where(and(eq(tripProjectConstraints.tripProjectId, input.tripProjectId), eq(tripProjectConstraints.userId, session.userId)))
        .limit(1);

      const operations = Array.isArray(proposalRow.operations) ? (proposalRow.operations as unknown[]) : [];
      const expectedItemVersions = (proposalRow.expectedItemVersions ?? null) as Record<string, number> | null;

      // Pre-validate every operation's fences BEFORE the first mutation (7.1
      // recovery: validate all fences before transaction/persistence). A failure
      // here applies nothing.
      const fenceFailure = validateOperationFences(operations, itemById, expectedItemVersions, proposalRow.orderingPreconditions);
      if (fenceFailure) return { success: false, reason: fenceFailure } as const;

      // Cross-operation backup cycle check (deferred 7.4 finding): simulate the
      // post-apply backup targets and reject if a cycle forms.
      const cycleFailure = detectCrossOperationBackupCycle(operations, itemRows, input.tripProjectId);
      if (cycleFailure) return { success: false, reason: "refresh_required" } as const;

      // Execute every operation through the matching *InTransaction helper,
      // threading the SAME transaction and the running aggregate version. Each
      // helper advances the aggregate version inside the shared transaction.
      // P1: update itemById and expectedItemVersions as each op executes so a
      // subsequent op touching the same item sees the post-op version.
      // P18: on op failure, THROW inside the transaction so Drizzle rolls back
      // every prior mutation (returning from the callback commits). The outer
      // catch maps ProposalOperationFailure to its specific reason.
      let runningAggregateVersion = project.aggregateVersion;
      for (const op of operations) {
        const result = await executeProposalOperationInTransaction(transaction, session, input.tripProjectId, runningAggregateVersion, op, itemById, constraintsRow?.version ?? null, expectedItemVersions);
        if (!result.success) throw new ProposalOperationFailure(result.reason);
        runningAggregateVersion = result.aggregateVersion;
      }

      // All ops succeeded. Mark the proposal applied + terminal timestamp.
      const terminalTimestamp = new Date();
      await transaction
        .update(tripChangeProposals)
        .set({ status: "applied", terminalTimestamp, updatedAt: terminalTimestamp })
        .where(and(eq(tripChangeProposals.id, input.proposalId), eq(tripChangeProposals.userId, session.userId)));

      // Write exactly one safe history row (operationClass = 'apply',
      // actorClass = 'user'). Reuse the 7.4 deriveAffectedItems /
      // deriveBeforeAfter so the owner-facing summary is consistent across
      // draft/apply/dismiss/expire. Never persist raw model prompts/responses.
      const knownItems = itemRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        anchorRole: row.anchorRole,
        type: row.type,
        state: row.state,
        parentItemId: row.parentItemId,
        backupTargetItemId: row.backupTargetItemId,
        label: row.label,
        ordinal: row.ordinal,
        notes: row.notes,
        plannedAt: row.plannedAt ? row.plannedAt.toISOString() : null,
        transportOriginLabel: row.transportOriginLabel,
        transportDestinationLabel: row.transportDestinationLabel,
        accommodationPlaceAreaLabel: row.accommodationPlaceAreaLabel,
      }));
      const knownById = new Map<string, KnownPlanItem>();
      for (const item of knownItems) knownById.set(item.id, item);
      const affectedItems = deriveAffectedItems(operations, knownById);
      const beforeAfter = deriveBeforeAfter(operations, knownById);

      await transaction.insert(tripPlanChangeHistory).values({
        tripProjectId: input.tripProjectId,
        userId: session.userId,
        proposalId: input.proposalId,
        actorUserId: session.userId,
        actorClass: "user",
        actorSystem: null,
        operationClass: "apply",
        affectedItemReferences: affectedItems as unknown as Record<string, unknown>,
        safeBeforeAfterSummary: boundBeforeAfterSummary(beforeAfter),
      });

      // Record the apply audit row (actorClass = 'user').
      await recordAuditEvent(
        {
          actor: session,
          operation: "apply",
          targetType: "trip_change_proposal",
          targetId: input.proposalId,
          afterSummary: JSON.stringify({ tripProjectId: input.tripProjectId, proposalId: input.proposalId, aggregateVersion: runningAggregateVersion }),
          actorClass: "user",
        },
        transaction,
      );

      const summary = toOwnedSummary(
        {
          id: proposalRow.id,
          status: "applied",
          rationale: proposalRow.rationale,
          operations: proposalRow.operations,
          alternatives: proposalRow.alternatives,
          expiresAt: proposalRow.expiresAt,
          createdAt: proposalRow.createdAt,
          terminalTimestamp,
        },
        input.tripProjectId,
        proposalRow.operations,
        knownItems,
      );

      return { success: true, aggregateVersion: runningAggregateVersion, proposal: summary } as const;
    });
  } catch (error) {
    // P18/P10: ProposalOperationFailure carries the specific op-failure reason
    // (the transaction was rolled back by the throw). Structural validation
    // errors ("Invalid trip plan"/"Invalid trip constraints") map to
    // refresh_required. Transient DB errors (connection, deadlock, serialization)
    // are re-thrown so the caller can distinguish retryable failures from real
    // version conflicts — the server action and client catch handle them with
    // a "try again" message rather than a misleading "refresh".
    if (error instanceof ProposalOperationFailure) {
      return { success: false, reason: error.reason };
    }
    if (error instanceof Error && (error.message.startsWith("Invalid trip plan") || error.message.startsWith("Invalid trip constraints"))) {
      return { success: false, reason: "refresh_required" };
    }
    console.error("Failed to apply approved trip change proposal.", {
      tripProjectId: input.tripProjectId,
      proposalId: input.proposalId,
      userId: session.userId,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    throw error;
  }
}

// Pre-validate every operation's fences against the current aggregate before
// the first mutation. Returns a failure reason or null when all fences pass.
function validateOperationFences(
  operations: unknown[],
  itemById: Map<string, { id: string; version: number }>,
  expectedItemVersions: Record<string, number> | null,
  orderingPreconditionsRaw: unknown,
): "refresh_required" | null {
  for (const op of operations) {
    if (!isRecord(op)) return "refresh_required";
    const kind = op.kind;
    if (kind === "update-item" || kind === "remove-item" || kind === "change-item-state") {
      const itemId = typeof op.itemId === "string" ? op.itemId : null;
      if (!itemId) return "refresh_required";
      const current = itemById.get(itemId);
      if (!current) return "refresh_required";
      const expected = expectedItemVersions?.[itemId];
      if (expected === undefined || current.version !== expected) return "refresh_required";
    } else if (kind === "reorder-item") {
      const itemId = typeof op.itemId === "string" ? op.itemId : null;
      if (!itemId) return "refresh_required";
      const current = itemById.get(itemId);
      if (!current) return "refresh_required";
      const expected = expectedItemVersions?.[itemId];
      if (expected === undefined || current.version !== expected) return "refresh_required";
    }
  }

  // Re-validate ordering preconditions when present. Treat the precondition as
  // opaque structured data and re-check the fields the validator recognizes
  // (parentItemId, ordinal, expectedChangedItemVersions). P6: if a precondition
  // field is unrecognizable, fail closed → refresh_required.
  if (orderingPreconditionsRaw !== null && orderingPreconditionsRaw !== undefined) {
    if (!isRecord(orderingPreconditionsRaw)) return "refresh_required";
    for (const key of Object.keys(orderingPreconditionsRaw)) {
      if (!recognizedOrderingPreconditionKeys.has(key)) return "refresh_required";
    }
    const captured = orderingPreconditionsRaw.expectedChangedItemVersions;
    if (captured !== undefined && captured !== null) {
      if (!isRecord(captured)) return "refresh_required";
      for (const [itemId, expectedVersion] of Object.entries(captured)) {
        if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) return "refresh_required";
        const current = itemById.get(itemId);
        if (!current) return "refresh_required";
        if (current.version !== expectedVersion) return "refresh_required";
      }
    }
  }

  return null;
}

// Cross-operation backup cycle check (deferred 7.4 second review finding):
// two change-item-state ops in one proposal (A→backup B, B→backup A) each
// validated independently against the pre-operation snapshot in 7.4, so a
// latent mutual-backup cycle can be persisted. Simulate the post-apply backup
// targets and run the shared validatePlanReferencesRules cycle check against
// the simulated set; if a cycle forms, return refresh_required.
function detectCrossOperationBackupCycle(
  operations: unknown[],
  currentItems: Array<{ id: string; kind: string; backupTargetItemId: string | null }>,
  tripProjectId: string,
): boolean {
  const changeStateOps = operations.filter((op): op is { kind: "change-item-state"; itemId: string; state: TripPlanItemState; backupTargetItemId?: string | null } => {
    return isRecord(op) && op.kind === "change-item-state" && typeof op.itemId === "string";
  });
  if (changeStateOps.length < 2) return false;

  // Build the simulated post-apply reference set.
  const simulated = new Map<string, PlanItemReference>();
  for (const item of currentItems) {
    simulated.set(item.id, { id: item.id, kind: item.kind, tripProjectId, backupTargetItemId: item.backupTargetItemId });
  }
  for (const op of changeStateOps) {
    const existing = simulated.get(op.itemId);
    if (existing) {
      simulated.set(op.itemId, { ...existing, backupTargetItemId: op.backupTargetItemId ?? null });
    }
  }

  for (const op of changeStateOps) {
    const error = validatePlanReferencesRules(
      tripProjectId,
      { kind: simulated.get(op.itemId)?.kind ?? "leg", parentItemId: null, backupTargetItemId: op.backupTargetItemId ?? null },
      [...simulated.values()],
      op.itemId,
    );
    if (error) return true;
  }
  return false;
}

// Execute a single proposal operation through the matching *InTransaction
// helper, threading the shared transaction and the running aggregate version.
async function executeProposalOperationInTransaction(
  transaction: Transaction,
  session: { userId: string; email: string },
  tripProjectId: string,
  runningAggregateVersion: number,
  op: unknown,
  itemById: Map<string, { id: string; kind: TripPlanItemKind; anchorRole: TripPlanAnchorRole | null; type: TripPlanItemType | null; state: TripPlanItemState; label: string; notes: string | null; plannedAt: Date | null; ordinal: number; parentItemId: string | null; backupTargetItemId: string | null; transportOriginLabel: string | null; transportDestinationLabel: string | null; accommodationPlaceAreaLabel: string | null; version: number }>,
  currentConstraintsVersion: number | null,
  expectedItemVersions: Record<string, number> | null,
): Promise<{ success: true; aggregateVersion: number } | { success: false; reason: "refresh_required" | "not_found" | "expired" }> {
  if (!isRecord(op)) return { success: false, reason: "refresh_required" };
  const kind = op.kind;

  if (kind === "create-item") {
    const itemDraft = op.item;
    if (!isRecord(itemDraft)) return { success: false, reason: "refresh_required" };
    const input = itemDraftToInternalInput(itemDraft);
    if (!input) return { success: false, reason: "refresh_required" };
    const values = normalizePlanItem(input);
    const result = await createTripPlanItemInTransaction(transaction, session, tripProjectId, runningAggregateVersion, values);
    if (!result.success) return { success: false, reason: mapHelperFailure(result.reason) };
    // P1: add the newly created item to itemById so subsequent ops (e.g.
    // reorder in the same scope) see it in the in-memory aggregate.
    if (result.itemId) {
      itemById.set(result.itemId, {
        id: result.itemId,
        kind: values.kind,
        anchorRole: values.anchorRole,
        type: values.type,
        state: values.state,
        label: values.label,
        notes: values.notes,
        plannedAt: values.plannedAt,
        ordinal: values.ordinal,
        parentItemId: values.parentItemId,
        backupTargetItemId: values.backupTargetItemId,
        transportOriginLabel: values.transportOriginLabel,
        transportDestinationLabel: values.transportDestinationLabel,
        accommodationPlaceAreaLabel: values.accommodationPlaceAreaLabel,
        version: 1,
      });
    }
    return { success: true, aggregateVersion: result.aggregateVersion };
  }

  if (kind === "update-item") {
    const itemId = typeof op.itemId === "string" ? op.itemId : null;
    if (!itemId) return { success: false, reason: "refresh_required" };
    const current = itemById.get(itemId);
    if (!current) return { success: false, reason: "refresh_required" };
    const changes = op.changes;
    if (!isRecord(changes)) return { success: false, reason: "refresh_required" };
    const input = mergeChangesToInternalInput(current, changes);
    if (!input) return { success: false, reason: "refresh_required" };
    const values = normalizePlanItem(input);
    const expectedItemVersion = expectedItemVersions?.[itemId];
    if (expectedItemVersion === undefined) return { success: false, reason: "refresh_required" };
    const result = await updateTripPlanItemInTransaction(transaction, session, tripProjectId, runningAggregateVersion, itemId, expectedItemVersion, values);
    if (!result.success) return { success: false, reason: mapHelperFailure(result.reason) };
    // P1: advance the in-memory version so a subsequent op on the same item
    // passes the version fence instead of failing with a misleading
    // refresh_required.
    const nextVersion = expectedItemVersion + 1;
    itemById.set(itemId, {
      ...current,
      kind: values.kind,
      anchorRole: values.anchorRole,
      type: values.type,
      state: values.state,
      label: values.label,
      notes: values.notes,
      ordinal: values.ordinal,
      parentItemId: values.parentItemId,
      backupTargetItemId: values.backupTargetItemId,
      transportOriginLabel: values.transportOriginLabel,
      transportDestinationLabel: values.transportDestinationLabel,
      accommodationPlaceAreaLabel: values.accommodationPlaceAreaLabel,
      version: nextVersion,
    });
    if (expectedItemVersions) expectedItemVersions[itemId] = nextVersion;
    return { success: true, aggregateVersion: result.aggregateVersion };
  }

  if (kind === "remove-item") {
    const itemId = typeof op.itemId === "string" ? op.itemId : null;
    if (!itemId) return { success: false, reason: "refresh_required" };
    const expectedItemVersion = expectedItemVersions?.[itemId];
    if (expectedItemVersion === undefined) return { success: false, reason: "refresh_required" };
    const result = await deleteTripPlanItemInTransaction(transaction, session, tripProjectId, runningAggregateVersion, itemId, expectedItemVersion);
    if (!result.success) return { success: false, reason: mapHelperFailure(result.reason) };
    // P1: remove from in-memory state so subsequent ops see a consistent
    // aggregate (a deleted item cannot be referenced again).
    itemById.delete(itemId);
    if (expectedItemVersions) delete expectedItemVersions[itemId];
    return { success: true, aggregateVersion: result.aggregateVersion };
  }

  if (kind === "reorder-item") {
    const itemId = typeof op.itemId === "string" ? op.itemId : null;
    if (!itemId) return { success: false, reason: "refresh_required" };
    const expectedItemVersion = expectedItemVersions?.[itemId];
    if (expectedItemVersion === undefined) return { success: false, reason: "refresh_required" };
    const parentItemId = parseOptionalParent(op.parentItemId);
    if (parentItemId === "invalid") return { success: false, reason: "refresh_required" };
    const ordinal = typeof op.ordinal === "number" && Number.isInteger(op.ordinal) && op.ordinal >= 0 ? op.ordinal : null;
    if (ordinal === null) return { success: false, reason: "refresh_required" };
    const expectedChangedItemVersions = deriveExpectedChangedItemVersions(itemById, itemId, parentItemId);
    const reorderInput: InternalReorderInput = { itemId, expectedItemVersion, parentItemId, ordinal, expectedChangedItemVersions };
    const result = await reorderTripPlanItemInTransaction(transaction, session, tripProjectId, runningAggregateVersion, reorderInput);
    if (!result.success) return { success: false, reason: mapHelperFailure(result.reason) };
    // P1: every changed item's version advances by 1 inside the helper. Update
    // the in-memory state so a subsequent op touching any of these items
    // passes the version fence.
    for (const changedId of Object.keys(expectedChangedItemVersions)) {
      const changedItem = itemById.get(changedId);
      if (changedItem) {
        const nextVer = changedItem.version + 1;
        itemById.set(changedId, {
          ...changedItem,
          ...(changedId === itemId ? { parentItemId, ordinal } : {}),
          version: nextVer,
        });
        if (expectedItemVersions) expectedItemVersions[changedId] = nextVer;
      }
    }
    return { success: true, aggregateVersion: result.aggregateVersion };
  }

  if (kind === "change-item-state") {
    const itemId = typeof op.itemId === "string" ? op.itemId : null;
    if (!itemId) return { success: false, reason: "refresh_required" };
    const nextState = typeof op.state === "string" && validStates.includes(op.state as TripPlanItemState) ? (op.state as TripPlanItemState) : null;
    if (!nextState) return { success: false, reason: "refresh_required" };
    const backupTarget = parseOptionalParent(op.backupTargetItemId);
    if (backupTarget === "invalid") return { success: false, reason: "refresh_required" };
    const expectedItemVersion = expectedItemVersions?.[itemId];
    if (expectedItemVersion === undefined) return { success: false, reason: "refresh_required" };
    const result = await changeInternalTripPlanItemStateInTransaction(transaction, session, tripProjectId, runningAggregateVersion, itemId, expectedItemVersion, nextState, backupTarget);
    if (!result.success) return { success: false, reason: mapHelperFailure(result.reason) };
    // P1: advance the in-memory version so a subsequent change-item-state on
    // the same item passes the version fence.
    const nextVersion = expectedItemVersion + 1;
    const current = itemById.get(itemId);
    if (current) {
      itemById.set(itemId, { ...current, state: nextState, backupTargetItemId: backupTarget, version: nextVersion });
    }
    if (expectedItemVersions) expectedItemVersions[itemId] = nextVersion;
    return { success: true, aggregateVersion: result.aggregateVersion };
  }

  if (kind === "upsert-constraints") {
    const constraints = op.constraints;
    if (!isRecord(constraints)) return { success: false, reason: "refresh_required" };
    const expectedConstraintsVersionRaw = op.expectedConstraintsVersion;
    let expectedConstraintsVersion: number | null;
    if (expectedConstraintsVersionRaw === null || expectedConstraintsVersionRaw === undefined) expectedConstraintsVersion = null;
    else if (typeof expectedConstraintsVersionRaw === "number" && Number.isInteger(expectedConstraintsVersionRaw) && expectedConstraintsVersionRaw >= 1) expectedConstraintsVersion = expectedConstraintsVersionRaw;
    else return { success: false, reason: "refresh_required" };
    let values: ReturnType<typeof normalizeConstraints>;
    try {
      values = normalizeConstraints(constraints as InternalConstraintsInput);
    } catch {
      return { success: false, reason: "refresh_required" };
    }
    const result = await upsertInternalTripProjectConstraintsInTransaction(transaction, session, tripProjectId, runningAggregateVersion, expectedConstraintsVersion, values);
    if (!result.success) return { success: false, reason: mapHelperFailure(result.reason) };
    return { success: true, aggregateVersion: result.aggregateVersion };
  }

  return { success: false, reason: "refresh_required" };
}

function itemDraftToInternalInput(item: Record<string, unknown>): InternalPlanItemInput | null {
  const kind = item.kind;
  if (typeof kind !== "string" || !validKinds.includes(kind as TripPlanItemKind)) return null;
  const ordinal = typeof item.ordinal === "number" && Number.isInteger(item.ordinal) && item.ordinal >= 0 ? item.ordinal : null;
  if (ordinal === null) return null;
  const parentItemId = parseOptionalParent(item.parentItemId);
  if (parentItemId === "invalid") return null;
  return {
    kind: kind as TripPlanItemKind,
    anchorRole: (item.anchorRole ?? null) as TripPlanAnchorRole | null,
    type: (item.type ?? null) as TripPlanItemType | null,
    state: (typeof item.state === "string" && validStates.includes(item.state as TripPlanItemState) ? item.state : "idea") as TripPlanItemState,
    label: typeof item.label === "string" ? item.label : "",
    notes: (item.notes ?? null) as string | null,
    plannedAt: null,
    ordinal,
    parentItemId,
    backupTargetItemId: parseOptionalParent(item.backupTargetItemId),
    transportOriginLabel: (item.transportOriginLabel ?? null) as string | null,
    transportDestinationLabel: (item.transportDestinationLabel ?? null) as string | null,
    accommodationPlaceAreaLabel: (item.accommodationPlaceAreaLabel ?? null) as string | null,
  };
}

function mergeChangesToInternalInput(current: { kind: TripPlanItemKind; anchorRole: TripPlanAnchorRole | null; type: TripPlanItemType | null; state: TripPlanItemState; label: string; notes: string | null; plannedAt: Date | null; ordinal: number; parentItemId: string | null; backupTargetItemId: string | null; transportOriginLabel: string | null; transportDestinationLabel: string | null; accommodationPlaceAreaLabel: string | null }, changes: Record<string, unknown>): InternalPlanItemInput | null {
  const parentItemId = changes.parentItemId !== undefined ? parseOptionalParent(changes.parentItemId) : current.parentItemId;
  if (parentItemId === "invalid") return null;
  const backupTargetItemId = changes.backupTargetItemId !== undefined ? parseOptionalParent(changes.backupTargetItemId) : current.backupTargetItemId;
  if (backupTargetItemId === "invalid") return null;
  return {
    kind: current.kind,
    anchorRole: current.anchorRole,
    type: current.type,
    state: (changes.state !== undefined && typeof changes.state === "string" && validStates.includes(changes.state as TripPlanItemState) ? (changes.state as TripPlanItemState) : current.state),
    label: typeof changes.label === "string" ? changes.label : current.label,
    notes: changes.notes !== undefined ? (typeof changes.notes === "string" ? changes.notes : null) : current.notes,
    plannedAt: current.plannedAt,
    ordinal: current.ordinal,
    parentItemId,
    backupTargetItemId,
    transportOriginLabel: changes.transportOriginLabel !== undefined ? (typeof changes.transportOriginLabel === "string" ? changes.transportOriginLabel : null) : current.transportOriginLabel,
    transportDestinationLabel: changes.transportDestinationLabel !== undefined ? (typeof changes.transportDestinationLabel === "string" ? changes.transportDestinationLabel : null) : current.transportDestinationLabel,
    accommodationPlaceAreaLabel: changes.accommodationPlaceAreaLabel !== undefined ? (typeof changes.accommodationPlaceAreaLabel === "string" ? changes.accommodationPlaceAreaLabel : null) : current.accommodationPlaceAreaLabel,
  };
}

function parseOptionalParent(value: unknown): string | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

// Map a *InTransaction helper failure reason to the apply orchestrator's
// failure reasons. The helpers can return unauthenticated (never happens inside
// apply because we already have a session), not_found, refresh_required, or
// invalid (malformed values detected at mutation time). Inside apply, an
// `invalid` means the proposal's operation would break a structural rule
// against the current aggregate — the owner must refresh. unauthenticated is
// impossible (we hold a session) but mapped to refresh_required defensively.
function mapHelperFailure(reason: "unauthenticated" | "not_found" | "refresh_required" | "invalid"): "refresh_required" | "not_found" | "expired" {
  if (reason === "not_found") return "not_found";
  return "refresh_required";
}

// Derive the expectedChangedItemVersions map for a reorder operation from the
// currently-loaded scope, mirroring the reorder helper's own derivation so the
// fence it enforces matches what we pass.
function deriveExpectedChangedItemVersions(
  itemById: Map<string, { id: string; parentItemId: string | null; ordinal: number; version: number }>,
  itemId: string,
  nextParentId: string | null,
): Record<string, number> {
  const rows = [...itemById.values()];
  const item = rows.find((row) => row.id === itemId);
  if (!item) return {};
  const sameScope = (row: { parentItemId: string | null }, parentId: string | null) => row.parentItemId === parentId;
  const oldScope = rows.filter((row) => sameScope(row, item.parentItemId) && row.id !== item.id);
  const newScope = item.parentItemId === nextParentId ? oldScope : rows.filter((row) => sameScope(row, nextParentId));
  const reordered = item.parentItemId === nextParentId ? oldScope : [...oldScope, ...newScope];
  const changedIds = new Set([...reordered.map((row) => row.id), item.id]);
  const result: Record<string, number> = {};
  for (const id of changedIds) {
    const row = rows.find((candidate) => candidate.id === id);
    if (row) result[id] = row.version;
  }
  return result;
}

// AD-30: dismissTripChangeProposal is an idempotent terminal action that never
// mutates plan state. It authenticates the owner, locks the proposal FOR UPDATE,
// and if status = 'pending' sets status = 'dismissed' + terminalTimestamp,
// writes exactly one trip_plan_change_history 'dismiss' row (actorClass =
// 'user'), and records an audit_events 'dismiss' row. If the proposal is
// already terminal, it is a no-op that returns the current summary WITHOUT
// writing a second history row (idempotent).
export async function dismissTripChangeProposal(
  input: DismissTripChangeProposalInput,
): Promise<DismissTripChangeProposalResult> {
  const session = await getAuthenticatedSession();
  if (!session) return { success: false, reason: "unauthenticated" };

  try {
    return await getDb().transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          id: tripChangeProposals.id,
          status: tripChangeProposals.status,
          rationale: tripChangeProposals.rationale,
          operations: tripChangeProposals.operations,
          alternatives: tripChangeProposals.alternatives,
          expiresAt: tripChangeProposals.expiresAt,
          createdAt: tripChangeProposals.createdAt,
          terminalTimestamp: tripChangeProposals.terminalTimestamp,
        })
        .from(tripChangeProposals)
        .where(and(
          eq(tripChangeProposals.id, input.proposalId),
          eq(tripChangeProposals.tripProjectId, input.tripProjectId),
          eq(tripChangeProposals.userId, session.userId),
        ))
        .limit(1)
        .for("update");
      if (!row) return { success: false, reason: "not_found" } as const;

      // Idempotent: already-terminal proposals return the current summary
      // WITHOUT writing a second history row.
      if (row.status !== "pending") {
        const knownItems = await loadKnownItemsForSummary(input.tripProjectId, session.userId);
        return { success: true, proposal: toOwnedSummary(row, input.tripProjectId, row.operations, knownItems) } as const;
      }

      const terminalTimestamp = new Date();
      await transaction
        .update(tripChangeProposals)
        .set({ status: "dismissed", terminalTimestamp, updatedAt: terminalTimestamp })
        .where(and(eq(tripChangeProposals.id, input.proposalId), eq(tripChangeProposals.userId, session.userId)));

      const knownItems = await loadKnownItemsForSummary(input.tripProjectId, session.userId);
      const knownById = new Map<string, KnownPlanItem>();
      for (const item of knownItems) knownById.set(item.id, item);
      const operations = Array.isArray(row.operations) ? row.operations : [];
      const affectedItems = deriveAffectedItems(operations, knownById);
      const beforeAfter = deriveBeforeAfter(operations, knownById);

      await transaction.insert(tripPlanChangeHistory).values({
        tripProjectId: input.tripProjectId,
        userId: session.userId,
        proposalId: input.proposalId,
        actorUserId: session.userId,
        actorClass: "user",
        actorSystem: null,
        operationClass: "dismiss",
        affectedItemReferences: affectedItems as unknown as Record<string, unknown>,
        safeBeforeAfterSummary: boundBeforeAfterSummary(beforeAfter),
      });

      await recordAuditEvent(
        {
          actor: session,
          operation: "dismiss",
          targetType: "trip_change_proposal",
          targetId: input.proposalId,
          afterSummary: JSON.stringify({ tripProjectId: input.tripProjectId, proposalId: input.proposalId }),
          actorClass: "user",
        },
        transaction,
      );

      return { success: true, proposal: toOwnedSummary({ ...row, status: "dismissed", terminalTimestamp }, input.tripProjectId, row.operations, knownItems) } as const;
    });
  } catch (error) {
    // P11: do not map transient DB errors to not_found (misleading "proposal
    // gone" when it is still pending). Only structural errors are safe to map;
    // everything else is re-thrown so the caller can retry.
    if (error instanceof Error && (error.message.startsWith("Invalid trip plan") || error.message.startsWith("Invalid trip constraints"))) {
      return { success: false, reason: "not_found" };
    }
    console.error("Failed to dismiss trip change proposal.", {
      tripProjectId: input.tripProjectId,
      proposalId: input.proposalId,
      userId: session.userId,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    throw error;
  }
}

// AD-30: expireTripChangeProposal mirrors dismiss but sets status = 'expired',
// actorClass = 'system', actorSystem = 'system-trip-planning', actorUserId =
// null. Idempotent on already-terminal rows. No plan state mutation. Callable
// without an authenticated session (the worker path): owner scope is enforced
// via the (tripProjectId, userId) predicate using the proposal row's userId
// column (loaded inside the transaction), so the worker does not need a session.
// P5: the core body is extracted as expireTripChangeProposalInTransaction so
// the expiry worker can share its outer transaction (FOR UPDATE SKIP LOCKED
// lock held while expire runs, preventing concurrent workers from claiming the
// same rows).
export async function expireTripChangeProposal(
  input: ExpireTripChangeProposalInput,
): Promise<ExpireTripChangeProposalResult> {
  try {
    return await getDb().transaction(async (transaction) => expireTripChangeProposalInTransaction(transaction, input));
  } catch (error) {
    // P11: do not map transient DB errors to not_found. Re-throw so the worker
    // and reads can retry; only structural errors are safe to map.
    if (error instanceof Error && (error.message.startsWith("Invalid trip plan") || error.message.startsWith("Invalid trip constraints"))) {
      return { success: false, reason: "not_found" };
    }
    console.error("Failed to expire trip change proposal.", {
      tripProjectId: input.tripProjectId,
      proposalId: input.proposalId,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    throw error;
  }
}

export async function expireTripChangeProposalInTransaction(
  transaction: Transaction,
  input: ExpireTripChangeProposalInput,
): Promise<ExpireTripChangeProposalResult> {
  const now = input.now ?? new Date();
  const [row] = await transaction
    .select({
      id: tripChangeProposals.id,
      tripProjectId: tripChangeProposals.tripProjectId,
      userId: tripChangeProposals.userId,
      status: tripChangeProposals.status,
      rationale: tripChangeProposals.rationale,
      operations: tripChangeProposals.operations,
      alternatives: tripChangeProposals.alternatives,
      expiresAt: tripChangeProposals.expiresAt,
      createdAt: tripChangeProposals.createdAt,
      terminalTimestamp: tripChangeProposals.terminalTimestamp,
    })
    .from(tripChangeProposals)
    .where(and(
      eq(tripChangeProposals.id, input.proposalId),
      eq(tripChangeProposals.tripProjectId, input.tripProjectId),
    ))
    .limit(1)
    .for("update");
  // Cross-owner / missing: return not_found without leaking existence.
  if (!row) return { success: false, reason: "not_found" } as const;

  // Idempotent: already-terminal proposals return the current summary
  // WITHOUT writing a second history row.
  if (row.status !== "pending") {
    const knownItems = await loadKnownItemsForSummary(row.tripProjectId, row.userId);
    return { success: true, proposal: toOwnedSummary(row, row.tripProjectId, row.operations, knownItems) } as const;
  }

  const terminalTimestamp = now;
  await transaction
    .update(tripChangeProposals)
    .set({ status: "expired", terminalTimestamp, updatedAt: terminalTimestamp })
    .where(eq(tripChangeProposals.id, input.proposalId));

  const knownItems = await loadKnownItemsForSummary(row.tripProjectId, row.userId);
  const knownById = new Map<string, KnownPlanItem>();
  for (const item of knownItems) knownById.set(item.id, item);
  const operations = Array.isArray(row.operations) ? row.operations : [];
  const affectedItems = deriveAffectedItems(operations, knownById);
  const beforeAfter = deriveBeforeAfter(operations, knownById);

  await transaction.insert(tripPlanChangeHistory).values({
    tripProjectId: row.tripProjectId,
    userId: row.userId,
    proposalId: input.proposalId,
    actorUserId: null,
    actorClass: "system",
    actorSystem: systemTripPlanningActorSystem,
    operationClass: "expire",
    affectedItemReferences: affectedItems as unknown as Record<string, unknown>,
    safeBeforeAfterSummary: boundBeforeAfterSummary(beforeAfter),
  });

  // P12: record the expire audit row via recordAuditEvent (spec line 190: reuse
  // it for apply/dismiss/expire) so normalizeAuditSummary's 2000-char cap
  // applies consistently. The system-trip-planning actor mirrors the
  // system-knowledge-pipeline pattern verbatim.
  await recordAuditEvent(
    {
      actor: systemTripPlanningActor,
      operation: "expire",
      targetType: "trip_change_proposal",
      targetId: input.proposalId,
      afterSummary: JSON.stringify({ tripProjectId: row.tripProjectId, proposalId: input.proposalId }),
      actorClass: "system",
      actorSystem: systemTripPlanningActorSystem,
    },
    transaction,
  );

  return { success: true, proposal: toOwnedSummary({ ...row, status: "expired", terminalTimestamp }, row.tripProjectId, row.operations, knownItems) } as const;
}

// Story 7.5 (AC4): the owner-scoped plan history read. Returns
// TripPlanChangeHistoryRow[] ordered by createdAt descending, or null when
// unauthenticated. Cross-owner reads return null (no existence leak). Never
// exposes raw model prompts/responses — the 7.4 deriveBeforeAfter output
// already strips raw model content and the history row stores only the safe
// structured summary.
export async function listPlanHistoryForTripProject(
  tripProjectId: string,
): Promise<TripPlanChangeHistoryRow[] | null> {
  const session = await getAuthenticatedSession();
  if (!session) return null;

  // P16: cross-owner reads return null (no existence leak), matching spec line
  // 57/150. Check ownership via the composite (id, userId) predicate before
  // querying history. A non-owner gets null even if the project exists.
  const [owned] = await getDb()
    .select({ id: tripProjects.id })
    .from(tripProjects)
    .where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId)))
    .limit(1);
  if (!owned) return null;

  const rows = await getDb()
    .select({
      id: tripPlanChangeHistory.id,
      proposalId: tripPlanChangeHistory.proposalId,
      actorClass: tripPlanChangeHistory.actorClass,
      actorSystem: tripPlanChangeHistory.actorSystem,
      actorUserId: tripPlanChangeHistory.actorUserId,
      operationClass: tripPlanChangeHistory.operationClass,
      affectedItemReferences: tripPlanChangeHistory.affectedItemReferences,
      safeBeforeAfterSummary: tripPlanChangeHistory.safeBeforeAfterSummary,
      createdAt: tripPlanChangeHistory.createdAt,
    })
    .from(tripPlanChangeHistory)
    .where(and(eq(tripPlanChangeHistory.tripProjectId, tripProjectId), eq(tripPlanChangeHistory.userId, session.userId)))
    .orderBy(desc(tripPlanChangeHistory.createdAt), desc(tripPlanChangeHistory.id))
    .limit(maxPlanHistoryPreview);

  return rows.map((row) => ({
    id: row.id,
    proposalId: row.proposalId,
    operationClass: row.operationClass,
    actorClass: row.actorClass,
    actorSystem: row.actorSystem,
    actorUserId: row.actorUserId,
    createdAt: row.createdAt,
    affectedItemReferences: mapAffectedReferences(row.affectedItemReferences),
    safeBeforeAfterSummary: mapBeforeAfterSummary(row.safeBeforeAfterSummary),
  }));
}

function mapAffectedReferences(raw: unknown): TripChangeProposalAffectedItemRef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const kind = entry.kind;
      const change = entry.change;
      if (typeof entry.itemId !== "string" || typeof kind !== "string" || typeof change !== "string") return null;
      if (!validKinds.includes(kind as TripPlanItemKind)) return null;
      // P15: validate change against the allowed set so a corrupted value
      // does not render an undefined label (blank change prefix) in the
      // history panel.
      if (!validAffectedItemChanges.includes(change as TripChangeProposalAffectedItemRef["change"])) return null;
      return {
        itemId: entry.itemId,
        kind: kind as TripPlanItemKind,
        label: typeof entry.label === "string" ? entry.label.slice(0, maxLabelLength) : "",
        change: change as TripChangeProposalAffectedItemRef["change"],
      } satisfies TripChangeProposalAffectedItemRef;
    })
    .filter((entry): entry is TripChangeProposalAffectedItemRef => entry !== null)
    .slice(0, maxOperations);
}

function mapBeforeAfterSummary(raw: unknown): TripChangeProposalBeforeAfterSummary[] {
  // The history row stores { entries: [...] } (apply/dismiss/expire write this
  // shape). Accept either the wrapped object or a bare array for resilience.
  let entries: unknown = raw;
  if (isRecord(raw) && Array.isArray(raw.entries)) entries = raw.entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (!isRecord(entry)) return null;
      if (typeof entry.operation !== "string") return null;
      return {
        operation: entry.operation,
        before: typeof entry.before === "string" ? entry.before : null,
        after: typeof entry.after === "string" ? entry.after : null,
      } satisfies TripChangeProposalBeforeAfterSummary;
    })
    .filter((entry): entry is TripChangeProposalBeforeAfterSummary => entry !== null)
    .slice(0, maxOperations);
}

// Story 7.5: a safe client-facing mapper that produces a Vietnamese summary for
// each plan history row: operation label, actor label, ICT timestamp, affected
// item labels (resolved via the current aggregate where possible; falling back
// to "(đã xoá)" for removed items), and the safe before/after summary. Never
// includes raw model prompts/responses.
export type PlanHistoryRowView = {
  operationLabel: string;
  actorLabel: string;
  timestampLabel: string;
  affectedItemLabels: string[];
  beforeAfter: TripChangeProposalBeforeAfterSummary[];
  proposalId: string | null;
};

const planHistoryOperationLabels: Record<TripPlanChangeHistoryOperationClass, string> = {
  apply: "Áp dụng",
  dismiss: "Giữ kế hoạch",
  expire: "Đã hết hạn",
};

export function formatPlanHistoryRow(row: TripPlanChangeHistoryRow): PlanHistoryRowView {
  const ictMs = row.createdAt.getTime() + 7 * 60 * 60 * 1000;
  const ict = new Date(ictMs);
  const year = ict.getUTCFullYear();
  const month = ict.getUTCMonth() + 1;
  const day = ict.getUTCDate();
  const hours = ict.getUTCHours();
  const minutes = ict.getUTCMinutes();
  const timestampLabel = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} giờ Việt Nam`;
  const actorLabel = row.actorClass === "system" ? "Hệ thống" : "Bạn";
  return {
    operationLabel: planHistoryOperationLabels[row.operationClass] ?? row.operationClass,
    actorLabel,
    timestampLabel,
    affectedItemLabels: row.affectedItemReferences.map((item) => item.label || "(đã xoá)"),
    beforeAfter: row.safeBeforeAfterSummary,
    proposalId: row.proposalId,
  };
}

// Re-export the system actor constants for the expiry worker so it can pass the
// canonical system actor to any future audit path without redefining it.
export const tripPlanningSystemActor = systemTripPlanningActor;
