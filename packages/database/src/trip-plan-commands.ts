import { and, eq } from "drizzle-orm";

import { toUserAuditActor } from "./actors";
import { getDb } from "./client";
import { validatePlanReferencesRules } from "./plan-references";
import { isCanonicalRoutePathId } from "./route-coverage";
import { auditEvents, tripPlanItems, tripProjectConstraints, tripProjects, type TripPlanAnchorRole, type TripPlanItemKind, type TripPlanItemState, type TripPlanItemType } from "./schema";

export type TripPlanCommandTransaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;
export type TripPlanCommandActor = { userId: string; email: string };
export type AggregateMutationResult = { success: true; aggregateVersion: number; itemId?: string } | { success: false; reason: "unauthenticated" | "not_found" | "refresh_required" | "invalid" };
export type InternalPlanItemInput = { kind: TripPlanItemKind; anchorRole?: TripPlanAnchorRole | null; type?: TripPlanItemType | null; state: TripPlanItemState; label: string; notes?: string | null; plannedAt?: Date | null; ordinal: number; parentItemId?: string | null; backupTargetItemId?: string | null; transportOriginLabel?: string | null; transportDestinationLabel?: string | null; accommodationPlaceAreaLabel?: string | null };
export type InternalConstraintsInput = { adultCount?: number | null; childCount?: number | null; children?: unknown[] | null; vehicleType?: "car" | "motorcycle" | "ev" | null; evChargingNeed?: "none" | "preferred" | "required" | null; drivingToleranceHours?: number | null; budgetCurrency?: "VND" | null; budgetMinVnd?: number | null; budgetMaxVnd?: number | null; preferenceTags?: string[] | null; avoidItems?: unknown[] | null };
export type InternalReorderInput = { itemId: string; expectedItemVersion: number; parentItemId?: string | null; ordinal: number; expectedChangedItemVersions: Record<string, number> };

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

export async function createTripPlanItemInTransaction(transaction: TripPlanCommandTransaction, actor: TripPlanCommandActor, tripProjectId: string, expectedAggregateVersion: number, values: ReturnType<typeof normalizePlanItem>): Promise<AggregateMutationResult> {
  const project = await lockAggregate(transaction, tripProjectId, actor.userId, expectedAggregateVersion); if (!project.success) return project;
  await validateReferences(transaction, tripProjectId, actor.userId, values);
  const [item] = await transaction.insert(tripPlanItems).values({ tripProjectId, userId: actor.userId, ...values }).returning({ id: tripPlanItems.id });
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, actor.userId, project.version);
  await recordAggregateAudit(transaction, actor, "create", "trip_plan_item", item.id, tripProjectId, aggregateVersion);
  return { success: true, aggregateVersion, itemId: item.id };
}

export async function upsertInternalTripProjectConstraintsInTransaction(transaction: TripPlanCommandTransaction, actor: TripPlanCommandActor, tripProjectId: string, expectedAggregateVersion: number, expectedConstraintsVersion: number | null, values: ReturnType<typeof normalizeConstraints>): Promise<AggregateMutationResult> {
  const project = await lockAggregate(transaction, tripProjectId, actor.userId, expectedAggregateVersion); if (!project.success) return project;
  const [existing] = await transaction.select({ version: tripProjectConstraints.version }).from(tripProjectConstraints).where(and(eq(tripProjectConstraints.tripProjectId, tripProjectId), eq(tripProjectConstraints.userId, actor.userId))).limit(1);
  if (existing && existing.version !== expectedConstraintsVersion || !existing && expectedConstraintsVersion !== null) return { success: false, reason: "refresh_required" };
  if (existing) await transaction.update(tripProjectConstraints).set({ ...values, version: existing.version + 1, updatedAt: new Date() }).where(and(eq(tripProjectConstraints.tripProjectId, tripProjectId), eq(tripProjectConstraints.userId, actor.userId)));
  else await transaction.insert(tripProjectConstraints).values({ tripProjectId, userId: actor.userId, ...values });
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, actor.userId, project.version);
  await recordAggregateAudit(transaction, actor, existing ? "update" : "create", "trip_project_constraints", tripProjectId, tripProjectId, aggregateVersion);
  return { success: true, aggregateVersion };
}

export async function updateTripPlanItemInTransaction(transaction: TripPlanCommandTransaction, actor: TripPlanCommandActor, tripProjectId: string, expectedAggregateVersion: number, itemId: string, expectedItemVersion: number, values: ReturnType<typeof normalizePlanItem>): Promise<AggregateMutationResult> {
  const project = await lockAggregate(transaction, tripProjectId, actor.userId, expectedAggregateVersion); if (!project.success) return project;
  const [item] = await transaction.select().from(tripPlanItems).where(and(eq(tripPlanItems.id, itemId), eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, actor.userId))).limit(1);
  if (!item) return { success: false, reason: "not_found" }; if (item.version !== expectedItemVersion) return { success: false, reason: "refresh_required" };
  await validateReferences(transaction, tripProjectId, actor.userId, values, itemId);
  await transaction.update(tripPlanItems).set({ ...values, version: item.version + 1, updatedAt: new Date() }).where(eq(tripPlanItems.id, itemId));
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, actor.userId, project.version);
  await recordAggregateAudit(transaction, actor, "update", "trip_plan_item", itemId, tripProjectId, aggregateVersion);
  return { success: true, aggregateVersion, itemId };
}

export async function deleteTripPlanItemInTransaction(transaction: TripPlanCommandTransaction, actor: TripPlanCommandActor, tripProjectId: string, expectedAggregateVersion: number, itemId: string, expectedItemVersion: number): Promise<AggregateMutationResult> {
  const project = await lockAggregate(transaction, tripProjectId, actor.userId, expectedAggregateVersion); if (!project.success) return project;
  const [item] = await transaction.select({ version: tripPlanItems.version }).from(tripPlanItems).where(and(eq(tripPlanItems.id, itemId), eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, actor.userId))).limit(1);
  if (!item) return { success: false, reason: "not_found" }; if (item.version !== expectedItemVersion) return { success: false, reason: "refresh_required" };
  const [dependent] = await transaction.select({ id: tripPlanItems.id }).from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, actor.userId), eq(tripPlanItems.parentItemId, itemId))).limit(1);
  const [backup] = await transaction.select({ id: tripPlanItems.id }).from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, actor.userId), eq(tripPlanItems.backupTargetItemId, itemId))).limit(1);
  if (dependent || backup) return { success: false, reason: "invalid" };
  await transaction.delete(tripPlanItems).where(eq(tripPlanItems.id, itemId));
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, actor.userId, project.version);
  await recordAggregateAudit(transaction, actor, "delete", "trip_plan_item", itemId, tripProjectId, aggregateVersion);
  return { success: true, aggregateVersion, itemId };
}

export async function reorderTripPlanItemInTransaction(transaction: TripPlanCommandTransaction, actor: TripPlanCommandActor, tripProjectId: string, expectedAggregateVersion: number, input: InternalReorderInput): Promise<AggregateMutationResult> {
  if (!Number.isInteger(input.ordinal) || input.ordinal < 0) throw new Error("Invalid trip plan ordinal.");
  const project = await lockAggregate(transaction, tripProjectId, actor.userId, expectedAggregateVersion); if (!project.success) return project;
  const rows = await transaction.select().from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, actor.userId))).for("update");
  const item = rows.find((row) => row.id === input.itemId);
  if (!item) return { success: false, reason: "not_found" }; if (item.version !== input.expectedItemVersion) return { success: false, reason: "refresh_required" };
  const nextParentId = input.parentItemId ?? null;
  await validateReferences(transaction, tripProjectId, actor.userId, { ...item, parentItemId: nextParentId }, item.id);
  const sameScope = (row: typeof item, parentId: string | null) => row.parentItemId === parentId;
  const oldScope = rows.filter((row) => sameScope(row, item.parentItemId) && row.id !== item.id).sort((a, b) => a.ordinal - b.ordinal);
  const newScope = item.parentItemId === nextParentId ? oldScope : rows.filter((row) => sameScope(row, nextParentId)).sort((a, b) => a.ordinal - b.ordinal);
  const destination = Math.min(input.ordinal, newScope.length); const reordered = item.parentItemId === nextParentId ? oldScope : [...oldScope, ...newScope];
  const changedIds = new Set([...reordered.map((row) => row.id), item.id]);
  if (Object.keys(input.expectedChangedItemVersions).length !== changedIds.size || [...changedIds].some((id) => input.expectedChangedItemVersions[id] !== rows.find((row) => row.id === id)?.version)) return { success: false, reason: "refresh_required" };
  const temporaryOrdinalStart = Math.max(...rows.map((row) => row.ordinal)) + rows.length + 1;
  for (const [index, row] of [...reordered, item].entries()) await transaction.update(tripPlanItems).set({ ordinal: temporaryOrdinalStart + index }).where(eq(tripPlanItems.id, row.id));
  const destinationRows = newScope.slice(); destinationRows.splice(destination, 0, item); const sourceRows = item.parentItemId === nextParentId ? destinationRows : oldScope;
  for (const [ordinal, row] of destinationRows.entries()) await transaction.update(tripPlanItems).set({ parentItemId: nextParentId, ordinal, version: row.version + 1, updatedAt: new Date() }).where(eq(tripPlanItems.id, row.id));
  if (item.parentItemId !== nextParentId) for (const [ordinal, row] of sourceRows.entries()) await transaction.update(tripPlanItems).set({ ordinal, version: row.version + 1, updatedAt: new Date() }).where(eq(tripPlanItems.id, row.id));
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, actor.userId, project.version);
  await recordAggregateAudit(transaction, actor, "update", "trip_plan_item_reorder", item.id, tripProjectId, aggregateVersion, changedIds.size);
  return { success: true, aggregateVersion, itemId: item.id };
}

export async function changeInternalTripPlanItemStateInTransaction(transaction: TripPlanCommandTransaction, actor: TripPlanCommandActor, tripProjectId: string, expectedAggregateVersion: number, itemId: string, expectedItemVersion: number, state: TripPlanItemState, backupTargetItemId: string | null): Promise<AggregateMutationResult> {
  if ((state === "backup") !== (backupTargetItemId !== null)) return { success: false, reason: "invalid" };
  const project = await lockAggregate(transaction, tripProjectId, actor.userId, expectedAggregateVersion); if (!project.success) return project;
  const [item] = await transaction.select().from(tripPlanItems).where(and(eq(tripPlanItems.id, itemId), eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, actor.userId))).limit(1);
  if (!item) return { success: false, reason: "not_found" }; if (item.version !== expectedItemVersion) return { success: false, reason: "refresh_required" };
  await validateReferences(transaction, tripProjectId, actor.userId, { kind: item.kind, parentItemId: item.parentItemId, backupTargetItemId }, itemId);
  await transaction.update(tripPlanItems).set({ state, backupTargetItemId, version: item.version + 1, updatedAt: new Date() }).where(eq(tripPlanItems.id, itemId));
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, actor.userId, project.version);
  await recordAggregateAudit(transaction, actor, "update", "trip_plan_item", itemId, tripProjectId, aggregateVersion);
  return { success: true, aggregateVersion, itemId };
}

export async function setInternalTripPlanItemCanonicalRoutePathInTransaction(transaction: TripPlanCommandTransaction, actor: TripPlanCommandActor, tripProjectId: string, expectedAggregateVersion: number, itemId: string, expectedItemVersion: number, canonicalRoutePathId: string | null): Promise<AggregateMutationResult> {
  if (canonicalRoutePathId !== null && !isCanonicalRoutePathId(canonicalRoutePathId)) return { success: false, reason: "invalid" };
  const project = await lockAggregate(transaction, tripProjectId, actor.userId, expectedAggregateVersion); if (!project.success) return project;
  const [item] = await transaction.select({ version: tripPlanItems.version, type: tripPlanItems.type }).from(tripPlanItems).where(and(eq(tripPlanItems.id, itemId), eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, actor.userId))).limit(1);
  if (!item) return { success: false, reason: "not_found" }; if (item.version !== expectedItemVersion) return { success: false, reason: "refresh_required" }; if (item.type !== "transport") return { success: false, reason: "invalid" };
  await transaction.update(tripPlanItems).set({ canonicalRoutePathId, version: item.version + 1, updatedAt: new Date() }).where(eq(tripPlanItems.id, itemId));
  const aggregateVersion = await advanceAggregate(transaction, tripProjectId, actor.userId, project.version);
  await recordAggregateAudit(transaction, actor, "update", "trip_plan_item", itemId, tripProjectId, aggregateVersion);
  return { success: true, aggregateVersion, itemId };
}

async function lockAggregate(transaction: TripPlanCommandTransaction, tripProjectId: string, userId: string, expectedAggregateVersion: number): Promise<{ success: true; version: number } | Extract<AggregateMutationResult, { success: false }>> { const [project] = await transaction.select({ version: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId))).limit(1).for("update"); if (!project) return { success: false, reason: "not_found" }; if (project.version !== expectedAggregateVersion) return { success: false, reason: "refresh_required" }; return { success: true, version: project.version }; }
async function advanceAggregate(transaction: TripPlanCommandTransaction, tripProjectId: string, userId: string, version: number) { const aggregateVersion = version + 1; await transaction.update(tripProjects).set({ aggregateVersion, updatedAt: new Date() }).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId))); return aggregateVersion; }
async function recordAggregateAudit(transaction: TripPlanCommandTransaction, actor: TripPlanCommandActor, operation: "create" | "update" | "delete", targetType: string, targetId: string, tripProjectId: string, aggregateVersion: number, count?: number) { const user = toUserAuditActor(actor); await transaction.insert(auditEvents).values({ actorUserId: user.userId, actorEmail: user.email, actorClass: "user", operation, targetType, targetId, afterSummary: JSON.stringify({ tripProjectId, aggregateVersion, ...(count === undefined ? {} : { count }) }) }); }
async function validateReferences(transaction: TripPlanCommandTransaction, tripProjectId: string, userId: string, values: { kind: TripPlanItemKind; parentItemId: string | null; backupTargetItemId: string | null }, itemId?: string) { const rows = await transaction.select({ id: tripPlanItems.id, kind: tripPlanItems.kind, tripProjectId: tripPlanItems.tripProjectId, backupTargetItemId: tripPlanItems.backupTargetItemId }).from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, userId))); const error = validatePlanReferencesRules(tripProjectId, values, rows, itemId); if (error) throw new Error(error); }
function normalizeRequiredSingleLine(value: string, maxLength: number, field: string) { const normalized = normalizeNullableSingleLine(value, maxLength, field); if (!normalized) throw new Error(`Invalid trip plan ${field}.`); return normalized; }
function normalizeNullableSingleLine(value: string | null | undefined, maxLength: number, field: string) { if (value === null || value === undefined) return null; const normalized = value.trim(); if (!normalized || normalized.length > maxLength || /[\r\n]/.test(normalized)) throw new Error(`Invalid trip plan ${field}.`); return normalized; }
function isPlainRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function isChildConstraint(value: unknown, comfortTags: Set<string>, preferenceTags: Set<string>) { if (!isPlainRecord(value) || Object.keys(value).sort().join(",") !== "ageMax,ageMin,comfortTags,preferenceTags") return false; const child = value as { ageMin?: unknown; ageMax?: unknown; comfortTags?: unknown; preferenceTags?: unknown }; return Number.isInteger(child.ageMin) && Number.isInteger(child.ageMax) && (child.ageMin as number) >= 0 && (child.ageMax as number) <= 17 && (child.ageMin as number) <= (child.ageMax as number) && isTagArray(child.comfortTags, comfortTags, 6) && isTagArray(child.preferenceTags, preferenceTags, 6); }
function isTagArray(value: unknown, allowed: Set<string>, maximum: number): value is string[] { return Array.isArray(value) && value.length <= maximum && new Set(value).size === value.length && value.every((tag) => typeof tag === "string" && allowed.has(tag)); }
function isAvoidItem(value: unknown) { return isPlainRecord(value) && Object.keys(value).sort().join(",") === "category,label" && (value.category === "place" || value.category === "activity") && typeof value.label === "string" && value.label.trim().length > 0 && value.label.trim().length <= 120 && !/[\r\n]/.test(value.label); }
