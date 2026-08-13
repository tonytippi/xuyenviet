import { createHash } from "node:crypto";

import type { PlanningContextProfileRef, PlanningContextProposal, PlanningDeliverableKind, PlanningScopeKind, PlanningScopeNode, PlanningScopeRelation, ValidatedPlanningContext } from "@xuyenviet/contracts";
import { parsePlanningContextProposal, planningScopeKinds } from "@xuyenviet/contracts";

type Materiality = "required" | "conditional" | "optional";
type Condition = "always" | "destination_stay" | "transit_stay";
type ValueType = "text" | "enum";
export type PlanningContextField = Readonly<{ key: string; materiality: Materiality; condition: Condition; scopes: readonly PlanningScopeKind[]; valueSchemaVersion: string; valueType: ValueType; allowedValues: readonly string[]; precedence: "nearest_ancestor" | "explicit_compatible"; safeAssumption: "none" | "permitted" }>;
export type PlanningContextProfile = Readonly<{ kind: PlanningDeliverableKind; version: string; fields: readonly PlanningContextField[]; completeness: "all_required" | "conditional_required" }>;
export type PlanningContextPolicy = Readonly<{ version: string; comparatorVersion: string; maxNodes: number; maxDeliverables: number; maxDepth: number; maxParents: number; maxValues: number; maxTextLength: number; maxIdentifierLength: number }>;
export type ScopedPlanningValue = Readonly<{ key: string; value: string; scopeId: string; schemaVersion: string; precedence: "nearest_ancestor" | "explicit_compatible" }>;
export type EffectivePlanningValue = Readonly<{ status: "resolved"; value: ScopedPlanningValue } | { status: "missing" } | { status: "ambiguous" }>;
export type PlanningCompleteness = Readonly<{ ready: boolean; missing: readonly string[]; assumed: readonly string[] }>;

const profileVersion = "planning-profile:v6";
const policyVersion = "planning-policy:v6";
const comparatorVersion = "planning-comparator:v6";
const valueSchemas = deepFreeze({ direction: "direction:v1", party: "party:v1", vehicle: "vehicle:v1", stay_style: "stay-style:v1", transit_style: "transit-style:v1", destination: "destination:v1", food_style: "food-style:v1", activity_style: "activity-style:v1" });
const fields = {
  direction: field("direction", "required", "always", ["journey", "day_range", "leg"], "direction", "text", [], "nearest_ancestor", "none"),
  party: field("party", "required", "always", ["journey", "group"], "party", "text", [], "nearest_ancestor", "none"),
  vehicle: field("vehicle", "required", "always", ["journey", "leg"], "vehicle", "enum", ["car", "motorcycle", "ev"], "nearest_ancestor", "none"),
  destination: field("destination", "required", "always", ["journey", "place"], "destination", "text", [], "nearest_ancestor", "none"),
  stayStyle: field("stay_style", "conditional", "destination_stay", ["journey", "place", "destination_stay"], "stay_style", "text", [], "explicit_compatible", "none"),
  transitStyle: field("transit_style", "conditional", "transit_stay", ["journey", "leg", "transit_stay"], "transit_style", "text", [], "explicit_compatible", "permitted"),
  foodStyle: field("food_style", "optional", "always", ["journey", "place", "meal"], "food_style", "text", [], "explicit_compatible", "permitted"),
  activityStyle: field("activity_style", "optional", "always", ["journey", "place", "activity"], "activity_style", "text", [], "explicit_compatible", "permitted"),
} as const;

const profiles = deepFreeze({
  itinerary: { kind: "itinerary", version: profileVersion, fields: [fields.direction, fields.party, fields.vehicle], completeness: "all_required" },
  route_comparison: { kind: "route_comparison", version: profileVersion, fields: [fields.direction, fields.vehicle, fields.destination], completeness: "all_required" },
  accommodation: { kind: "accommodation", version: profileVersion, fields: [fields.party, fields.destination, fields.stayStyle, fields.transitStyle], completeness: "conditional_required" },
  food: { kind: "food", version: profileVersion, fields: [fields.party, fields.destination, fields.foodStyle], completeness: "all_required" },
  activity: { kind: "activity", version: profileVersion, fields: [fields.party, fields.destination, fields.activityStyle], completeness: "all_required" },
} satisfies Record<PlanningDeliverableKind, PlanningContextProfile>);

export const planningContextCatalog = deepFreeze({
  policy: { version: policyVersion, comparatorVersion, maxNodes: 100, maxDeliverables: 40, maxDepth: 12, maxParents: 1, maxValues: 10, maxTextLength: 2_000, maxIdentifierLength: 128 } satisfies PlanningContextPolicy,
  profiles,
  valueSchemas,
});

export const planningContextCatalogRecords = deepFreeze({
  profile: { id: profileVersion, version: 6, definition: { version: profileVersion, kinds: Object.keys(profiles).sort() }, digest: digest({ version: profileVersion, kinds: Object.keys(profiles).sort() }) },
  policy: { id: policyVersion, version: 6, definition: { ...planningContextCatalog.policy }, digest: digest(planningContextCatalog.policy) },
  valueSchemas: Object.entries(valueSchemas).sort(([left], [right]) => left.localeCompare(right)).map(([key, version]) => ({ id: version, key, version: 1, definition: { key, version, type: key === "vehicle" ? "enum" : "text" }, digest: digest({ key, version, type: key === "vehicle" ? "enum" : "text" }) })),
});

export function resolvePlanningContext(proposal: unknown): ValidatedPlanningContext | null {
  const parsed = parsePlanningContextProposal(proposal);
  if (!parsed || !pinsCatalog(parsed) || parsed.deliverables.length === 0) return null;
  if (parsed.deliverables.length > planningContextCatalog.policy.maxDeliverables) return null;
  const graph = validatePlanningScopeGraph(parsed.scopes);
  if (!graph) return null;
  const deliverables = coalescePlanningDeliverables(parsed.deliverables, graph);
  if (!deliverables || deliverables.length > planningContextCatalog.policy.maxDeliverables) return null;
  return deepFreeze({ graphDigest: canonicalPlanningGraphDigest(graph, deliverables, parsed.versions), versions: parsed.versions, scopes: graph, deliverables: deliverables.map((item) => ({ ...item, profile: profileRef(item.kind) })) });
}

export function validatePlanningScopeGraph(scopes: readonly PlanningScopeNode[], policy: PlanningContextPolicy = planningContextCatalog.policy): readonly PlanningScopeNode[] | null {
  if (!validPolicy(policy) || scopes.length === 0 || scopes.length > policy.maxNodes) return null;
  const byId = new Map<string, PlanningScopeNode>();
  for (const node of scopes) {
    if (!validNode(node, policy) || byId.has(node.id) || node.parentId === node.id || node.overlapWith.includes(node.id)) return null;
    byId.set(node.id, node);
  }
  for (const node of scopes) {
    if (node.parentId !== null && (!byId.has(node.parentId) || policy.maxParents < 1)) return null;
    if (node.overlapWith.some((id) => !byId.has(id) || id === node.parentId || !byId.get(id)!.overlapWith.includes(node.id))) return null;
    let depth = 0; let cursor: PlanningScopeNode | undefined = node; const seen = new Set<string>();
    while (cursor?.parentId) { if (seen.has(cursor.id) || depth >= policy.maxDepth) return null; seen.add(cursor.id); cursor = byId.get(cursor.parentId); depth += 1; }
  }
  return deepFreeze([...scopes].map((node) => ({ ...node, overlapWith: [...node.overlapWith].sort() })).sort((left, right) => left.id.localeCompare(right.id)));
}

export function canonicalPlanningGraphDigest(scopes: readonly PlanningScopeNode[], deliverables: readonly { kind: PlanningDeliverableKind; scopeId: string }[], versions: PlanningContextProposal["versions"]): string {
  const canonical = { versions: canonicalVersions(versions), scopes: [...scopes].map((node) => ({ id: node.id, kind: node.kind, parentId: node.parentId, overlapWith: [...node.overlapWith].sort() })).sort(compareJson), deliverables: [...new Set(deliverables.map((item) => JSON.stringify({ kind: item.kind, scopeId: item.scopeId })))].map((item) => JSON.parse(item) as { kind: PlanningDeliverableKind; scopeId: string }).sort(compareJson) };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function coalescePlanningDeliverables(deliverables: readonly { id: string; kind: PlanningDeliverableKind; scopeId: string }[], scopes: readonly PlanningScopeNode[]): readonly { id: string; kind: PlanningDeliverableKind; scopeId: string }[] | null {
  const scopesById = new Set(scopes.map((scope) => scope.id)); const result = new Map<string, { id: string; kind: PlanningDeliverableKind; scopeId: string }>();
  for (const item of deliverables) {
    if (!validIdentifier(item.id) || !scopesById.has(item.scopeId)) return null;
    const key = `${item.kind}\u0000${item.scopeId}`;
    const existing = result.get(key);
    if (!existing || item.id.localeCompare(existing.id) < 0) result.set(key, { ...item });
  }
  return deepFreeze([...result.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.scopeId.localeCompare(right.scopeId)));
}

export function comparePlanningScopes(scopes: readonly PlanningScopeNode[], leftId: string, rightId: string): PlanningScopeRelation | null {
  const graph = validatePlanningScopeGraph(scopes);
  if (!graph) return null;
  const byId = new Map(graph.map((scope) => [scope.id, scope])); const left = byId.get(leftId); const right = byId.get(rightId);
  if (!left || !right) return null;
  if (left.id === right.id) return "equal";
  if (ancestors(byId, right).has(left.id)) return "ancestor";
  if (ancestors(byId, left).has(right.id)) return "descendant";
  if (left.overlapWith.includes(right.id)) return "overlap";
  return left.parentId !== null && left.parentId === right.parentId ? "sibling" : "unrelated";
}

export function validatePlanningValues(profile: PlanningContextProfile, scopes: readonly PlanningScopeNode[], values: readonly ScopedPlanningValue[]): readonly ScopedPlanningValue[] {
  const graph = validatePlanningScopeGraph(scopes); if (!graph || !catalogProfile(profile)) return [];
  const byId = new Map(graph.map((scope) => [scope.id, scope])); const fieldsByKey = new Map(profile.fields.map((item) => [item.key, item])); const counts = new Map<string, number>(); const valid: ScopedPlanningValue[] = [];
  for (const value of values) {
    const definition = fieldsByKey.get(value.key); const scope = byId.get(value.scopeId); const count = counts.get(value.key) ?? 0;
    if (!definition || !scope || count >= planningContextCatalog.policy.maxValues || value.schemaVersion !== definition.valueSchemaVersion || !definition.scopes.includes(scope.kind) || value.precedence !== definition.precedence || !validValue(value.value, definition)) continue;
    counts.set(value.key, count + 1); valid.push(deepFreeze({ ...value }));
  }
  return deepFreeze(valid);
}

export function evaluateEffectivePlanningValue(profile: PlanningContextProfile, fieldKey: string, scopes: readonly PlanningScopeNode[], targetScopeId: string, values: readonly ScopedPlanningValue[]): EffectivePlanningValue {
  const graph = validatePlanningScopeGraph(scopes); if (!graph) return { status: "missing" };
  const definition = profile.fields.find((field) => field.key === fieldKey);
  if (!definition || !catalogProfile(profile)) return { status: "missing" };
  const applicable = validatePlanningValues(profile, graph, values).filter((value) => value.key === fieldKey && value.value.length > 0 && comparePlanningScopes(graph, value.scopeId, targetScopeId) !== null);
  if (applicable.some((value) => comparePlanningScopes(graph, value.scopeId, targetScopeId) === "overlap")) return { status: "ambiguous" };
  const candidates = applicable.filter((value) => { const relation = comparePlanningScopes(graph, value.scopeId, targetScopeId); return relation === "equal" || relation === "ancestor"; });
  if (candidates.length === 0) return { status: "missing" };
  const nearest = candidates.filter((candidate) => !candidates.some((other) => comparePlanningScopes(graph, candidate.scopeId, other.scopeId) === "ancestor"));
  return nearest.length === 1 ? { status: "resolved", value: nearest[0]! } : { status: "ambiguous" };
}

export function evaluatePlanningCompleteness(profile: PlanningContextProfile, scopes: readonly PlanningScopeNode[], targetScopeId: string, values: readonly ScopedPlanningValue[]): PlanningCompleteness {
  const graph = validatePlanningScopeGraph(scopes); const target = graph?.find((scope) => scope.id === targetScopeId);
  if (!graph || !target || !catalogProfile(profile)) return deepFreeze({ ready: false, missing: profile.fields.filter((field) => field.materiality !== "optional").map((field) => field.key).sort(), assumed: [] });
  const validated = validatePlanningValues(profile, graph, values); const missing: string[] = []; const assumed: string[] = [];
  for (const definition of profile.fields) {
    if (definition.materiality === "optional" || !fieldApplies(definition, graph, target)) continue;
    const state = evaluateEffectivePlanningValue(profile, definition.key, graph, target.id, validated);
    if (state.status === "resolved") continue;
    if (definition.safeAssumption === "permitted") assumed.push(definition.key); else missing.push(definition.key);
  }
  return deepFreeze({ ready: missing.length === 0, missing: missing.sort(), assumed: assumed.sort() });
}

function field(key: string, materiality: Materiality, condition: Condition, scopes: PlanningScopeKind[], schema: keyof typeof valueSchemas, valueType: ValueType, allowedValues: string[], precedence: PlanningContextField["precedence"], safeAssumption: PlanningContextField["safeAssumption"]): PlanningContextField { return deepFreeze({ key, materiality, condition, scopes, valueSchemaVersion: valueSchemas[schema], valueType, allowedValues, precedence, safeAssumption }); }
function fieldApplies(definition: PlanningContextField, graph: readonly PlanningScopeNode[], target: PlanningScopeNode): boolean {
  if (definition.condition === "always") return true;
  const byId = new Map(graph.map((scope) => [scope.id, scope]));
  const kinds = [target.kind, ...[...ancestors(byId, target)].map((id) => byId.get(id)?.kind)];
  return definition.condition === "destination_stay" ? kinds.includes("destination_stay") : kinds.includes("transit_stay");
}
function catalogProfile(profile: PlanningContextProfile): boolean { return planningContextCatalog.profiles[profile.kind] === profile; }
function pinsCatalog(proposal: PlanningContextProposal): boolean { return proposal.versions.profileVersion === profileVersion && proposal.versions.policyVersion === policyVersion && proposal.versions.comparatorVersion === comparatorVersion && Object.entries(valueSchemas).every(([key, version]) => proposal.versions.valueSchemaVersions[key] === version) && Object.keys(proposal.versions.valueSchemaVersions).length === Object.keys(valueSchemas).length; }
function profileRef(kind: PlanningDeliverableKind): PlanningContextProfileRef { return deepFreeze({ kind, profileVersion, policyVersion, comparatorVersion, valueSchemaVersions: { ...valueSchemas } }); }
function validNode(node: PlanningScopeNode, policy: PlanningContextPolicy): boolean { return typeof node.kind === "string" && (planningScopeKinds as readonly string[]).includes(node.kind) && validIdentifier(node.id, policy.maxIdentifierLength) && (node.parentId === null || validIdentifier(node.parentId, policy.maxIdentifierLength)) && Array.isArray(node.overlapWith) && node.overlapWith.length <= 20 && new Set(node.overlapWith).size === node.overlapWith.length && node.overlapWith.every((id) => validIdentifier(id, policy.maxIdentifierLength)); }
function validIdentifier(value: string, maximum = planningContextCatalog.policy.maxIdentifierLength): boolean { return value.length > 0 && value.length <= maximum && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value); }
function validPolicy(policy: PlanningContextPolicy): boolean { return [policy.maxNodes, policy.maxDeliverables, policy.maxDepth, policy.maxParents, policy.maxValues, policy.maxTextLength, policy.maxIdentifierLength].every((value) => Number.isSafeInteger(value) && value >= 1); }
function validValue(value: string, definition: PlanningContextField): boolean { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= planningContextCatalog.policy.maxTextLength && !/[\u0000-\u001F\u007F]/.test(value) && (definition.valueType !== "enum" || definition.allowedValues.includes(value)); }
function canonicalVersions(versions: PlanningContextProposal["versions"]) { return { profileVersion: versions.profileVersion, policyVersion: versions.policyVersion, comparatorVersion: versions.comparatorVersion, valueSchemaVersions: Object.fromEntries(Object.entries(versions.valueSchemaVersions).sort(([left], [right]) => left.localeCompare(right))) }; }
function ancestors(byId: ReadonlyMap<string, PlanningScopeNode>, node: PlanningScopeNode): Set<string> { const result = new Set<string>(); let current: PlanningScopeNode | undefined = node; while (current.parentId) { const parent = byId.get(current.parentId); if (!parent || result.has(parent.id)) return new Set(); result.add(parent.id); current = parent; } return result; }
function compareJson<T>(left: T, right: T): number { return JSON.stringify(left).localeCompare(JSON.stringify(right)); }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item); } return value; }
