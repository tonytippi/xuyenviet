/** Browser-safe transport shapes for the versioned planning-context boundary. */
export const planningDeliverableKinds = ["itinerary", "route_comparison", "accommodation", "food", "activity"] as const;
export type PlanningDeliverableKind = (typeof planningDeliverableKinds)[number];
export const planningScopeKinds = ["journey", "day_range", "leg", "place", "destination_stay", "transit_stay", "meal", "activity", "group", "deliverable"] as const;
export type PlanningScopeKind = (typeof planningScopeKinds)[number];
export const planningScopeRelations = ["equal", "ancestor", "descendant", "overlap", "sibling", "unrelated"] as const;
export type PlanningScopeRelation = (typeof planningScopeRelations)[number];

export type PlanningVersionRefs = Readonly<{ profileVersion: string; policyVersion: string; comparatorVersion: string; valueSchemaVersions: Readonly<Record<string, string>> }>;
export type PlanningScopeNode = Readonly<{ id: string; kind: PlanningScopeKind; parentId: string | null; overlapWith: readonly string[] }>;
export type PlanningDeliverableRequest = Readonly<{ id: string; kind: PlanningDeliverableKind; scopeId: string }>;
export type PlanningContextProposal = Readonly<{ versions: PlanningVersionRefs; scopes: readonly PlanningScopeNode[]; deliverables: readonly PlanningDeliverableRequest[] }>;
export type PlanningContextProfileRef = Readonly<{ kind: PlanningDeliverableKind; profileVersion: string; policyVersion: string; comparatorVersion: string; valueSchemaVersions: Readonly<Record<string, string>> }>;
export type ResolvedPlanningDeliverable = Readonly<{ id: string; kind: PlanningDeliverableKind; scopeId: string; profile: PlanningContextProfileRef }>;
export type ValidatedPlanningContext = Readonly<{ graphDigest: string; versions: PlanningVersionRefs; scopes: readonly PlanningScopeNode[]; deliverables: readonly ResolvedPlanningDeliverable[] }>;

export function parsePlanningContextProposal(value: unknown): PlanningContextProposal | null {
  if (!record(value) || !exactKeys(value, ["versions", "scopes", "deliverables"]) || !versions(value.versions) || !Array.isArray(value.scopes) || !Array.isArray(value.deliverables) || value.scopes.length > 200 || value.deliverables.length > 50) return null;
  return value.scopes.every(scopeNode) && value.deliverables.every(deliverable) ? value as PlanningContextProposal : null;
}

export function parseValidatedPlanningContext(value: unknown): ValidatedPlanningContext | null {
  if (!record(value) || !exactKeys(value, ["graphDigest", "versions", "scopes", "deliverables"]) || !digest(value.graphDigest) || !versions(value.versions) || !Array.isArray(value.scopes) || !Array.isArray(value.deliverables) || !value.scopes.every(scopeNode)) return null;
  return value.deliverables.every((item) => record(item) && exactKeys(item, ["id", "kind", "scopeId", "profile"]) && identifier(item.id) && deliverableKind(item.kind) && identifier(item.scopeId) && profileRef(item.profile)) ? value as ValidatedPlanningContext : null;
}

function profileRef(value: unknown): boolean { return record(value) && exactKeys(value, ["kind", "profileVersion", "policyVersion", "comparatorVersion", "valueSchemaVersions"]) && deliverableKind(value.kind) && version(value.profileVersion) && version(value.policyVersion) && version(value.comparatorVersion) && versionMap(value.valueSchemaVersions); }
function scopeNode(value: unknown): boolean { return record(value) && exactKeys(value, ["id", "kind", "parentId", "overlapWith"]) && identifier(value.id) && scopeKind(value.kind) && (value.parentId === null || identifier(value.parentId)) && Array.isArray(value.overlapWith) && value.overlapWith.length <= 20 && value.overlapWith.every(identifier) && new Set(value.overlapWith).size === value.overlapWith.length; }
function deliverable(value: unknown): boolean { return record(value) && exactKeys(value, ["id", "kind", "scopeId"]) && identifier(value.id) && deliverableKind(value.kind) && identifier(value.scopeId); }
function versions(value: unknown): boolean { return record(value) && exactKeys(value, ["profileVersion", "policyVersion", "comparatorVersion", "valueSchemaVersions"]) && version(value.profileVersion) && version(value.policyVersion) && version(value.comparatorVersion) && versionMap(value.valueSchemaVersions); }
function versionMap(value: unknown): boolean { return record(value) && Object.keys(value).length > 0 && Object.keys(value).length <= 40 && Object.entries(value).every(([key, item]) => identifier(key) && version(item)); }
function version(value: unknown): boolean { return typeof value === "string" && /^[a-z][a-z0-9_.-]{0,63}:v[1-9][0-9]*$/.test(value); }
function digest(value: unknown): boolean { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function identifier(value: unknown): value is string { return typeof value === "string" && value.trim() === value && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value); }
function deliverableKind(value: unknown): value is PlanningDeliverableKind { return typeof value === "string" && (planningDeliverableKinds as readonly string[]).includes(value); }
function scopeKind(value: unknown): value is PlanningScopeKind { return typeof value === "string" && (planningScopeKinds as readonly string[]).includes(value); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).length === keys.length && keys.every((key) => key in value); }
