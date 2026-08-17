export const planningSessionIntents = ["trip_planning"] as const;
export const planningSessionStatuses = ["collecting", "ready", "superseded"] as const;
export const planningSessionSlotNames = [
  "origin",
  "destination",
  "start_date",
  "end_date",
  "duration",
  "adults",
  "children",
  "children_ages",
  "budget",
  "hotel_style",
  "driving_tolerance",
  "vehicle_needs",
  "food_preferences",
  "activity_preferences",
  "itinerary_constraints",
  "avoid_places",
  "prior_trips",
  "notes",
] as const;

export type PlanningSessionIntent = (typeof planningSessionIntents)[number];
export type PlanningSessionStatus = (typeof planningSessionStatuses)[number];
export type PlanningSessionSlotName = (typeof planningSessionSlotNames)[number];
export const planningModes = ["current_plan", "explore_change", "validate_proposal", "unscoped_answer"] as const;
export type PlanningMode = (typeof planningModes)[number];
export type PlanningExecutionRef = {
  mode: PlanningMode;
  tripProjectId: string | null;
  tripAggregateVersion: number | null;
  proposalId: string | null;
  proposalUpdatedAt: string | null;
  sessionRevision: number | null;
};
export type CanonicalRoutePathReference = string;
export type RouteResolution =
  | { kind: "selected"; pathId: CanonicalRoutePathReference }
  | { kind: "complete"; pathIds: CanonicalRoutePathReference[] }
  | { kind: "partial"; pathIds: CanonicalRoutePathReference[] }
  | { kind: "ambiguous"; pathIds: CanonicalRoutePathReference[] }
  | { kind: "unsupported" }
  | { kind: "stale"; pathId: string };
export type PlanningContextSession = {
  intent: PlanningSessionIntent;
  slots: Partial<Record<PlanningSessionSlotName, string>>;
  missingSlots: PlanningSessionSlotName[];
  status: PlanningSessionStatus;
  sourceMessageIds: string[];
  revision: number;
};

const maxSlotValueLength = 500;
const maxSourceMessageIds = 40;
const maxPayloadBytes = 8192;
const maxPostgresInteger = 2_147_483_647;

/** Rejects all operational, provider, and nested data before it reaches session storage. */
export function parsePlanningContextSession(value: unknown): PlanningContextSession | null {
  if (!isRecord(value) || !hasExactKeys(value, ["intent", "slots", "missingSlots", "status", "sourceMessageIds", "revision"])) return null;
  if (!planningSessionIntents.includes(value.intent as PlanningSessionIntent) || !planningSessionStatuses.includes(value.status as PlanningSessionStatus) || !isPlainRecord(value.slots) || !Array.isArray(value.missingSlots) || !Array.isArray(value.sourceMessageIds) || !positiveInteger(value.revision)) return null;
  const slots = value.slots;
  const missingSlots = value.missingSlots;
  const sourceMessageIds = value.sourceMessageIds;
  const slotEntries = Object.entries(slots);
  if (slotEntries.length > planningSessionSlotNames.length || !slotEntries.every(([name, slotValue]) => planningSessionSlotNames.includes(name as PlanningSessionSlotName) && boundedText(slotValue, maxSlotValueLength))) return null;
  if (missingSlots.length > planningSessionSlotNames.length || !uniqueStrings(missingSlots) || !missingSlots.every((name) => planningSessionSlotNames.includes(name as PlanningSessionSlotName)) || missingSlots.some((name) => name in slots)) return null;
  if (sourceMessageIds.length > maxSourceMessageIds || !uniqueStrings(sourceMessageIds) || !sourceMessageIds.every((id) => boundedText(id, 128))) return null;
  if (new TextEncoder().encode(JSON.stringify(value)).length > maxPayloadBytes) return null;
  return value as PlanningContextSession;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isPlainRecord(value: unknown): value is Record<string, unknown> { return isRecord(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function hasExactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every((key) => key in value); }
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= maxPostgresInteger; }
function boundedText(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum; }
function uniqueStrings(values: unknown[]): values is string[] { return values.every((value) => typeof value === "string") && new Set(values).size === values.length; }
