export type YoutubeDiscoveryPolicyAuditSummary = Readonly<{
  version: number;
  enabled: boolean;
  minimumCandidateScore: number;
  priorityScoreWeight: number;
  freshnessScoreWeight: number;
  relevanceWeight: number;
  expectedValueWeight: number;
  freshnessFitWeight: number;
  commercialRiskWeight: number;
  duplicateRiskWeight: number;
  deferMinimum: number;
  considerMinimum: number;
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
    && (value.pausedReason === null ? value.enabled : value.pausedReason === "operator" ? !value.enabled && value.nextRunAt === null : value.enabled && value.nextRunAt === null)
    ? value as AdminYoutubeDiscoveryQuery : null;
}

export function parseAdminYoutubeDiscoveryQueryList(value: unknown): AdminYoutubeDiscoveryQueryList | null {
  return record(value) && exactKeys(value, ["items"]) && Array.isArray(value.items) && value.items.length <= 200 && value.items.every((item) => parseAdminYoutubeDiscoveryQuery(item) !== null) ? value as AdminYoutubeDiscoveryQueryList : null;
}

export const adminYoutubeDiscoveryReviewPageSize = 20;
type ReviewRecommendation = "consider";
type ReviewFactor = "relevance" | "expected_value" | "freshness_fit";
type ReviewPenalty = "commercial_risk" | "duplicate_risk";
type ReviewReason = "eligible_score_band";
type ReviewQueryReason = "coverage_gap" | "freshness_risk" | "unresolved_conflict" | "anonymized_demand" | "operator_request";
type ReviewSignal = "recent_discussion" | "stale_or_changed_warning" | "practical_question_demand" | "creator_responsiveness" | "commercial_risk" | "contradictory_discussion";
type ReviewPriorCaptureOutcome = "eligible" | "already_compatible" | "unavailable";
export type AdminYoutubeDiscoveryReviewQueueItem = Readonly<{ recommendationId: string; canonicalUrl: string; title: string | null; channelName: string | null; publishedAt: string | null; durationSeconds: number | null; recommendation: ReviewRecommendation; reason: ReviewReason; actionAvailability: "available" | "reconciling" }>;
export type AdminYoutubeDiscoveryReviewQueue = Readonly<{ items: AdminYoutubeDiscoveryReviewQueueItem[]; nextCursor: string | null }>;
export type AdminYoutubeDiscoveryReviewDetail = Readonly<AdminYoutubeDiscoveryReviewQueueItem & { queryText: string; queryReason: ReviewQueryReason; score: number; factors: ReviewFactor[]; penalties: ReviewPenalty[]; signals: ReviewSignal[]; priorCaptureOutcome: ReviewPriorCaptureOutcome }>;
export type AdminYoutubeDiscoveryAcceptReviewResult = Readonly<{ outcome: "submitted" | "duplicate" | "failed" | "reconciling" }>;
export type AdminYoutubeDiscoveryDeferReviewResult = Readonly<{ outcome: "deferred" }>;
export type AdminYoutubeDiscoverySkipReviewResult = Readonly<{ outcome: "skipped" }>;

export function parseAdminYoutubeDiscoveryAcceptCommand(value: unknown): Record<string, never> | null { return record(value) && exactKeys(value, []) ? {} : null; }
export function parseAdminYoutubeDiscoveryDeferCommand(value: unknown): Record<string, never> | null { return record(value) && exactKeys(value, []) ? {} : null; }
export function parseAdminYoutubeDiscoverySkipCommand(value: unknown): Record<string, never> | null { return record(value) && exactKeys(value, []) ? {} : null; }
export function parseAdminYoutubeDiscoveryAcceptReviewResult(value: unknown): AdminYoutubeDiscoveryAcceptReviewResult | null {
  return record(value) && exactKeys(value, ["outcome"]) && (value.outcome === "submitted" || value.outcome === "duplicate" || value.outcome === "failed" || value.outcome === "reconciling") ? value as AdminYoutubeDiscoveryAcceptReviewResult : null;
}
export function parseAdminYoutubeDiscoveryDeferReviewResult(value: unknown): AdminYoutubeDiscoveryDeferReviewResult | null { return record(value) && exactKeys(value, ["outcome"]) && value.outcome === "deferred" ? value as AdminYoutubeDiscoveryDeferReviewResult : null; }
export function parseAdminYoutubeDiscoverySkipReviewResult(value: unknown): AdminYoutubeDiscoverySkipReviewResult | null { return record(value) && exactKeys(value, ["outcome"]) && value.outcome === "skipped" ? value as AdminYoutubeDiscoverySkipReviewResult : null; }
export type AdminYoutubeDiscoveryReviewCursor = Readonly<{ score: number; createdAt: string; recommendationId: string }>;

export function encodeAdminYoutubeDiscoveryReviewCursor(cursor: AdminYoutubeDiscoveryReviewCursor): string {
  if (!reviewCursor(cursor)) throw new Error("Invalid YouTube Discovery review cursor.");
  return `ydr2.${btoa(JSON.stringify(cursor)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}
export function parseAdminYoutubeDiscoveryReviewCursor(value: unknown): AdminYoutubeDiscoveryReviewCursor | null {
  if (typeof value !== "string" || !/^ydr2\.[A-Za-z0-9_-]{1,512}$/.test(value)) return null;
  try { const encoded = value.slice(5).replaceAll("-", "+").replaceAll("_", "/"); const parsed: unknown = JSON.parse(atob(encoded + "=".repeat((4 - encoded.length % 4) % 4))); return reviewCursor(parsed) ? parsed : null; } catch { return null; }
}
export function parseAdminYoutubeDiscoveryReviewQueueItem(value: unknown): AdminYoutubeDiscoveryReviewQueueItem | null {
  if (!record(value) || !exactKeys(value, ["recommendationId", "canonicalUrl", "title", "channelName", "publishedAt", "durationSeconds", "recommendation", "reason", "actionAvailability"])) return null;
  const duration = value.durationSeconds;
  return identifier(value.recommendationId) && canonicalUrl(value.canonicalUrl) && nullableText(value.title, 200) && nullableText(value.channelName, 160) && (value.publishedAt === null || isoTimestamp(value.publishedAt)) && (duration === null || typeof duration === "number" && Number.isSafeInteger(duration) && duration >= 0 && duration <= 86_400) && value.recommendation === "consider" && value.reason === "eligible_score_band" && (value.actionAvailability === "available" || value.actionAvailability === "reconciling") ? value as AdminYoutubeDiscoveryReviewQueueItem : null;
}
export function parseAdminYoutubeDiscoveryReviewQueue(value: unknown): AdminYoutubeDiscoveryReviewQueue | null {
  return record(value) && exactKeys(value, ["items", "nextCursor"]) && Array.isArray(value.items) && value.items.length <= adminYoutubeDiscoveryReviewPageSize && value.items.every((item) => parseAdminYoutubeDiscoveryReviewQueueItem(item) !== null) && (value.nextCursor === null || parseAdminYoutubeDiscoveryReviewCursor(value.nextCursor) !== null) ? value as AdminYoutubeDiscoveryReviewQueue : null;
}
export function parseAdminYoutubeDiscoveryReviewDetail(value: unknown): AdminYoutubeDiscoveryReviewDetail | null {
  if (!record(value) || !exactKeys(value, ["recommendationId", "canonicalUrl", "title", "channelName", "publishedAt", "durationSeconds", "recommendation", "reason", "actionAvailability", "queryText", "queryReason", "score", "factors", "penalties", "signals", "priorCaptureOutcome"]) || !parseAdminYoutubeDiscoveryReviewQueueItem({ recommendationId: value.recommendationId, canonicalUrl: value.canonicalUrl, title: value.title, channelName: value.channelName, publishedAt: value.publishedAt, durationSeconds: value.durationSeconds, recommendation: value.recommendation, reason: value.reason, actionAvailability: value.actionAvailability })) return null;
  return safeQueryText(value.queryText) && ["coverage_gap", "freshness_risk", "unresolved_conflict", "anonymized_demand", "operator_request"].includes(value.queryReason as string) && finiteScore(value.score) && codes(value.factors, ["relevance", "expected_value", "freshness_fit"], 3) && codes(value.penalties, ["commercial_risk", "duplicate_risk"], 2) && (value.factors as unknown[]).length + (value.penalties as unknown[]).length <= 5 && codes(value.signals, ["recent_discussion", "stale_or_changed_warning", "practical_question_demand", "creator_responsiveness", "commercial_risk", "contradictory_discussion"], 6) && (value.priorCaptureOutcome === "eligible" || value.priorCaptureOutcome === "already_compatible" || value.priorCaptureOutcome === "unavailable") ? value as AdminYoutubeDiscoveryReviewDetail : null;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every((key) => key in value); }
function identifier(value: unknown): value is string { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 128; }
function safeQueryText(value: unknown): value is string { return typeof value === "string" && value.trim() === value && /^[\p{L}\p{N} '-]{1,240}$/u.test(value); }
function isoTimestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value; }
function reviewCursorTimestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) && isoTimestamp(`${value.slice(0, 23)}Z`); }
function nullableText(value: unknown, maximum: number): boolean { return value === null || typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum && !/[\x00-\x1F\x7F]/.test(value); }
function canonicalUrl(value: unknown): boolean { return typeof value === "string" && /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{6,20}$/.test(value); }
function finiteScore(value: unknown): boolean { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1; }
function codes(value: unknown, allowed: readonly string[], maximum: number): boolean { return Array.isArray(value) && value.length <= maximum && value.every((code) => typeof code === "string" && allowed.includes(code)) && new Set(value).size === value.length; }
function reviewCursor(value: unknown): value is AdminYoutubeDiscoveryReviewCursor { return record(value) && exactKeys(value, ["score", "createdAt", "recommendationId"]) && finiteScore(value.score) && reviewCursorTimestamp(value.createdAt) && identifier(value.recommendationId); }
