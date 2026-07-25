import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  tripChangeProposals,
  tripPlanItems,
  tripProjects,
  type TripChangeProposalStatus,
  type TripPlanAnchorRole,
  type TripPlanItemKind,
  type TripPlanItemState,
  type TripPlanItemType,
} from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
import { getAuthenticatedSession } from "@/server/auth";

// Story 7.4: Chat/Trips owns the Trip Change Proposal command/read boundary.
// AI Orchestration produces an untrusted draft; this module is the only
// persistence path. No plan state is mutated here.

const maxRationaleLength = 500;
const maxLabelLength = 160;
const maxNotesLength = 1_000;
const maxAlternativeSummaryLength = 280;
const maxOperations = 20;
const maxAlternatives = 5;

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
};

export type PersistAiTripChangeProposalDraftInput = {
  tripProjectId: string;
  expectedAggregateVersion: number;
  expectedItemVersions?: Record<string, number> | null;
  operations: unknown;
  rationale: string;
  alternatives?: unknown;
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
    const parsed = parseOperation(raw, index, knownById);
    if (parsed.kind === "ok") {
      valid.push(parsed.value);
    } else {
      rejected.push({ index, reason: parsed.reason });
    }
  });

  return { valid, rejected };
}

type ParseResult = { kind: "ok"; value: TripChangeProposalOperation } | { kind: "err"; reason: string };

function parseOperation(raw: unknown, index: number, knownById: Map<string, KnownPlanItem>): ParseResult {
  if (!isRecord(raw)) return { kind: "err", reason: "operation must be an object" };
  const opKind = raw.kind;
  if (typeof opKind !== "string") return { kind: "err", reason: "operation kind missing" };

  switch (opKind) {
    case "create-item":
      return parseCreateItem(raw, knownById);
    case "update-item":
      return parseUpdateItem(raw, knownById);
    case "remove-item":
      return parseRemoveItem(raw, knownById);
    case "reorder-item":
      return parseReorderItem(raw, knownById);
    case "change-item-state":
      return parseChangeItemState(raw, knownById);
    case "upsert-constraints":
      return parseUpsertConstraints(raw);
    default:
      return { kind: "err", reason: `unknown operation kind "${opKind}"` };
  }
}

function parseCreateItem(raw: Record<string, unknown>, knownById: Map<string, KnownPlanItem>): ParseResult {
  const item = raw.item;
  if (!isRecord(item)) return { kind: "err", reason: "create-item.item missing" };
  const itemDraft = parseItemDraft(item);
  if (typeof itemDraft === "string") return { kind: "err", reason: itemDraft };

  const parentItemId = parseOptionalStringId(raw.parentItemId);
  if (parentItemId === "invalid") return { kind: "err", reason: "create-item.parentItemId invalid" };
  const parentId = parentItemId ?? null;
  if (parentId !== null) {
    if (itemDraft.kind !== "activity") return { kind: "err", reason: "parentItemId only allowed for activities" };
    const parent = knownById.get(parentId);
    if (!parent || parent.kind !== "leg") return { kind: "err", reason: "parentItemId must reference a leg in the same project" };
  } else if (itemDraft.kind === "activity") {
    return { kind: "err", reason: "activities require a parentItemId referencing a leg" };
  }

  if (itemDraft.backupTargetItemId) {
    const target = knownById.get(itemDraft.backupTargetItemId);
    if (!target) return { kind: "err", reason: "backupTargetItemId must reference an item in the same project" };
  }

  const ordinal = parseOrdinal(raw.ordinal);
  if (typeof ordinal === "string") return { kind: "err", reason: ordinal };

  return { kind: "ok", value: { kind: "create-item", item: itemDraft, parentItemId: parentId, ordinal } };
}

function parseUpdateItem(raw: Record<string, unknown>, knownById: Map<string, KnownPlanItem>): ParseResult {
  const itemId = parseRequiredStringId(raw.itemId);
  if (itemId === "invalid") return { kind: "err", reason: "update-item.itemId missing or invalid" };
  const known = knownById.get(itemId);
  if (!known) return { kind: "err", reason: "update-item.itemId references unknown or cross-project item" };

  const changes = raw.changes;
  if (!isRecord(changes)) return { kind: "err", reason: "update-item.changes missing" };
  const parsedChanges = parseItemChanges(changes, known);
  if (typeof parsedChanges === "string") return { kind: "err", reason: parsedChanges };

  if (parsedChanges.backupTargetItemId !== undefined && parsedChanges.backupTargetItemId !== null) {
    const target = knownById.get(parsedChanges.backupTargetItemId);
    if (!target) return { kind: "err", reason: "backupTargetItemId must reference an item in the same project" };
  }

  return { kind: "ok", value: { kind: "update-item", itemId, changes: parsedChanges } };
}

function parseRemoveItem(raw: Record<string, unknown>, knownById: Map<string, KnownPlanItem>): ParseResult {
  const itemId = parseRequiredStringId(raw.itemId);
  if (itemId === "invalid") return { kind: "err", reason: "remove-item.itemId missing or invalid" };
  if (!knownById.has(itemId)) return { kind: "err", reason: "remove-item.itemId references unknown or cross-project item" };
  return { kind: "ok", value: { kind: "remove-item", itemId } };
}

function parseReorderItem(raw: Record<string, unknown>, knownById: Map<string, KnownPlanItem>): ParseResult {
  const itemId = parseRequiredStringId(raw.itemId);
  if (itemId === "invalid") return { kind: "err", reason: "reorder-item.itemId missing or invalid" };
  const known = knownById.get(itemId);
  if (!known) return { kind: "err", reason: "reorder-item.itemId references unknown or cross-project item" };

  const parentItemId = parseOptionalStringId(raw.parentItemId);
  if (parentItemId === "invalid") return { kind: "err", reason: "reorder-item.parentItemId invalid" };
  const parentId = parentItemId ?? null;
  if (parentId !== null) {
    if (known.kind !== "activity") return { kind: "err", reason: "parentItemId only allowed for activities" };
    const parent = knownById.get(parentId);
    if (!parent || parent.kind !== "leg") return { kind: "err", reason: "parentItemId must reference a leg in the same project" };
  }

  const ordinal = parseOrdinal(raw.ordinal);
  if (typeof ordinal === "string") return { kind: "err", reason: ordinal };

  return { kind: "ok", value: { kind: "reorder-item", itemId, parentItemId: parentId, ordinal } };
}

function parseChangeItemState(raw: Record<string, unknown>, knownById: Map<string, KnownPlanItem>): ParseResult {
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
  if (backupTargetItemId) {
    const target = knownById.get(backupTargetItemId);
    if (!target) return { kind: "err", reason: "backupTargetItemId must reference an item in the same project" };
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
      const knownItemRows = await transaction
        .select({
          id: tripPlanItems.id,
          kind: tripPlanItems.kind,
          anchorRole: tripPlanItems.anchorRole,
          type: tripPlanItems.type,
          state: tripPlanItems.state,
          parentItemId: tripPlanItems.parentItemId,
          backupTargetItemId: tripPlanItems.backupTargetItemId,
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

      const summary = toOwnedSummary(inserted, input.tripProjectId, valid);
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

  const rows = await getDb()
    .select({
      id: tripChangeProposals.id,
      status: tripChangeProposals.status,
      rationale: tripChangeProposals.rationale,
      operations: tripChangeProposals.operations,
      alternatives: tripChangeProposals.alternatives,
      expiresAt: tripChangeProposals.expiresAt,
      createdAt: tripChangeProposals.createdAt,
    })
    .from(tripChangeProposals)
    .where(and(
      eq(tripChangeProposals.tripProjectId, tripProjectId),
      eq(tripChangeProposals.userId, session.userId),
      eq(tripChangeProposals.status, "pending"),
    ))
    .orderBy(asc(tripChangeProposals.createdAt), asc(tripChangeProposals.id));

  return rows.map((row) => toOwnedSummary(row, tripProjectId, row.operations));
}

export async function getProposalForOwnerReview(
  tripProjectId: string,
  proposalId: string,
): Promise<OwnedTripChangeProposalSummary | null> {
  const session = await getAuthenticatedSession();
  if (!session) return null;

  const [row] = await getDb()
    .select({
      id: tripChangeProposals.id,
      status: tripChangeProposals.status,
      rationale: tripChangeProposals.rationale,
      operations: tripChangeProposals.operations,
      alternatives: tripChangeProposals.alternatives,
      expiresAt: tripChangeProposals.expiresAt,
      createdAt: tripChangeProposals.createdAt,
    })
    .from(tripChangeProposals)
    .where(and(
      eq(tripChangeProposals.id, proposalId),
      eq(tripChangeProposals.tripProjectId, tripProjectId),
      eq(tripChangeProposals.userId, session.userId),
    ))
    .limit(1);

  if (!row) return null;
  return toOwnedSummary(row, tripProjectId, row.operations);
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
  },
  tripProjectId: string,
  operations: unknown,
): OwnedTripChangeProposalSummary {
  const ops = Array.isArray(operations) ? operations : [];
  const affectedItems = deriveAffectedItems(ops);
  const beforeAfter = deriveBeforeAfter(ops);
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
  };
}

function deriveAffectedItems(operations: unknown[]): TripChangeProposalAffectedItemRef[] {
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
      refs.push({ itemId: op.itemId, kind: "activity", label: "", change: "update" });
    } else if (kind === "remove-item" && typeof op.itemId === "string") {
      refs.push({ itemId: op.itemId, kind: "activity", label: "", change: "remove" });
    } else if (kind === "reorder-item" && typeof op.itemId === "string") {
      refs.push({ itemId: op.itemId, kind: "activity", label: "", change: "reorder" });
    } else if (kind === "change-item-state" && typeof op.itemId === "string") {
      refs.push({ itemId: op.itemId, kind: "activity", label: "", change: "change-state" });
    } else if (kind === "upsert-constraints") {
      refs.push({ itemId: "constraints", kind: "activity", label: "Ràng buộc", change: "upsert-constraints" });
    }
  }
  return refs.slice(0, maxOperations);
}

function deriveBeforeAfter(operations: unknown[]): TripChangeProposalBeforeAfterSummary[] {
  const summaries: TripChangeProposalBeforeAfterSummary[] = [];
  for (const op of operations) {
    if (!isRecord(op)) continue;
    const kind = op.kind;
    if (kind === "create-item" && isRecord(op.item) && typeof op.item.label === "string") {
      summaries.push({ operation: "Tạo mục mới", before: null, after: op.item.label.slice(0, maxLabelLength) });
    } else if (kind === "update-item" && isRecord(op.changes)) {
      const afterParts = Object.keys(op.changes).map((key) => key);
      summaries.push({ operation: "Cập nhật mục", before: null, after: afterParts.join(", ").slice(0, maxLabelLength) || "thay đổi" });
    } else if (kind === "remove-item") {
      summaries.push({ operation: "Xoá mục", before: null, after: null });
    } else if (kind === "reorder-item") {
      summaries.push({ operation: "Sắp xếp lại", before: null, after: null });
    } else if (kind === "change-item-state" && typeof op.state === "string") {
      summaries.push({ operation: "Đổi trạng thái", before: null, after: op.state });
    } else if (kind === "upsert-constraints") {
      summaries.push({ operation: "Cập nhật ràng buộc", before: null, after: null });
    }
  }
  return summaries.slice(0, maxOperations);
}
