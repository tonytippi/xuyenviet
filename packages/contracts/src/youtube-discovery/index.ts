export type YoutubeDiscoveryPolicyAuditSummary = Readonly<{
  version: number;
  enabled: boolean;
  minimumCandidateScore: number;
  priorityScoreWeight: number;
  freshnessScoreWeight: number;
  cadenceMinutes: number;
  retentionDays: number;
  commentSignalTtlDays: number;
  maxConcurrentRuns: number;
  maxRetryAttempts: number;
  retryDelayMinutes: number;
}>;

export type YoutubeDiscoveryQueryProposalAuditSummary = Readonly<{
  origin: "system" | "operator";
  priority: number;
  enabled: boolean;
  cadenceMinutes: number;
}>;

export type YoutubeDiscoveryRunAuditSummary = Readonly<{
  policyVersionId: string;
  state: "queued" | "running" | "retrying" | "completed" | "failed" | "cancelled";
}>;

export function parseAdminYoutubeDiscoveryCommand(value: unknown, kind: "create" | "edit" | "priority" | "empty"): { queryText?: string; priority?: number; cadenceMinutes?: number } | null {
  if (kind === "empty" && value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const text = typeof input.queryText === "string" && input.queryText.trim() === input.queryText && /^[\p{L}\p{N} '-]{1,240}$/u.test(input.queryText);
  const priority = Number.isSafeInteger(input.priority) && (input.priority as number) >= 1 && (input.priority as number) <= 100;
  const cadence = Number.isSafeInteger(input.cadenceMinutes) && (input.cadenceMinutes as number) >= 15 && (input.cadenceMinutes as number) <= 10_080;
  if (kind === "empty") return Object.keys(input).length === 0 ? {} : null;
  if (kind === "create") return Object.keys(input).length === 3 && text && priority && cadence ? { queryText: input.queryText as string, priority: input.priority as number, cadenceMinutes: input.cadenceMinutes as number } : null;
  if (kind === "edit") return Object.keys(input).length === 1 && text ? { queryText: input.queryText as string } : null;
  return Object.keys(input).length === 1 && priority ? { priority: input.priority as number } : null;
}

export type AdminYoutubeDiscoveryQuery = { id: string; origin: "system" | "operator"; queryText: string; reason: "coverage_gap" | "freshness_risk" | "unresolved_conflict" | "anonymized_demand" | "operator_request"; priority: number; enabled: boolean; cadenceMinutes: number; nextRunAt: string | null; pausedReason: "operator" | "global" | null };
export type AdminYoutubeDiscoveryQueryList = { items: AdminYoutubeDiscoveryQuery[] };

export function parseAdminYoutubeDiscoveryQuery(value: unknown): AdminYoutubeDiscoveryQuery | null {
  if (!record(value) || !exactKeys(value, ["id", "origin", "queryText", "reason", "priority", "enabled", "cadenceMinutes", "nextRunAt", "pausedReason"])) return null;
  return identifier(value.id) && (value.origin === "system" || value.origin === "operator") && safeQueryText(value.queryText)
    && ["coverage_gap", "freshness_risk", "unresolved_conflict", "anonymized_demand", "operator_request"].includes(value.reason as string)
    && Number.isSafeInteger(value.priority) && (value.priority as number) >= 1 && (value.priority as number) <= 100
    && typeof value.enabled === "boolean" && Number.isSafeInteger(value.cadenceMinutes) && (value.cadenceMinutes as number) >= 15 && (value.cadenceMinutes as number) <= 10_080
    && (value.nextRunAt === null || isoTimestamp(value.nextRunAt)) && (value.pausedReason === null || value.pausedReason === "operator" || value.pausedReason === "global")
    && (value.pausedReason === null ? value.enabled : value.nextRunAt === null)
    ? value as AdminYoutubeDiscoveryQuery : null;
}

export function parseAdminYoutubeDiscoveryQueryList(value: unknown): AdminYoutubeDiscoveryQueryList | null {
  return record(value) && exactKeys(value, ["items"]) && Array.isArray(value.items) && value.items.length <= 200 && value.items.every((item) => parseAdminYoutubeDiscoveryQuery(item) !== null) ? value as AdminYoutubeDiscoveryQueryList : null;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every((key) => key in value); }
function identifier(value: unknown): value is string { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 128; }
function safeQueryText(value: unknown): value is string { return typeof value === "string" && value.trim() === value && /^[\p{L}\p{N} '-]{1,240}$/u.test(value); }
function isoTimestamp(value: unknown): value is string { return typeof value === "string" && value.length <= 100 && !Number.isNaN(Date.parse(value)); }
