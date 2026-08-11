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
  actionQueueHighPriorityMaximum: number;
  actionQueueMaximumOperatorReviewAgeHours: number;
  actionQueueMaximumMissionStallHours: number;
  actionQueuePersistentIncidentFailureCount: number;
  actionQueuePersistentIncidentWindowHours: number;
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

export const adminYoutubeDiscoveryMissionPageSize = 20;
export type AdminYoutubeDiscoveryMissionCoverage = Readonly<{ actionId: string; priority: number; createdAt: string; corridor: string | null; location: string | null; routeSegment: string | null; taxonomy: string | null; freshness: "fresh" | "sensitive" | "unavailable"; conflict: "none" | "present" | "unavailable"; demand: "unavailable"; seasonalContext: "unavailable" }>;
export type AdminYoutubeDiscoveryMissionCandidate = Readonly<{ candidateId: string; actionId: string; priority: number; rank: number; rankedAt: string; rankingState: "discovered" | "enriched" | "triaged" | "recommended"; recommendationId: string | null; recommendation: "skip" | "defer" | "consider" | "unavailable"; candidateState: "pending" | "accepted" | "deferred" | "skipped" | "unavailable"; reviewAvailable: boolean }>;
export type AdminYoutubeDiscoveryMissionCoverageCursor = Readonly<{ version: 1; priority: number; createdAt: string; actionId: string }>;
export type AdminYoutubeDiscoveryMissionQueryCursor = Readonly<{ version: 1; priority: number; createdAt: string; id: string }>;
export type AdminYoutubeDiscoveryMissionCandidateCursor = Readonly<{ version: 1; actionId: string; priority: number; rank: number; rankedAt: string; candidateId: string }>;
export type AdminYoutubeDiscoveryMissionCoveragePage = Readonly<{ items: AdminYoutubeDiscoveryMissionCoverage[]; nextCursor: string | null }>;
export type AdminYoutubeDiscoveryMissionQueryPage = Readonly<{ items: AdminYoutubeDiscoveryQuery[]; nextCursor: string | null }>;
export type AdminYoutubeDiscoveryMissionCandidatePage = Readonly<{ items: AdminYoutubeDiscoveryMissionCandidate[]; nextCursor: string | null }>;
export type AdminYoutubeDiscoveryMissionRun = Readonly<{ state: "queued" | "running" | "retrying" | "completed" | "failed" | "cancelled" | "unavailable"; createdAt: string | null; retryCount: number | null; terminalCategory: "provider_rate_limited" | "triage_schema_invalid" | "execution_terminal" | "unavailable" }>;
export type AdminYoutubeDiscoveryMissionDetail = Readonly<{ coverage: AdminYoutubeDiscoveryMissionCoverage; query: AdminYoutubeDiscoveryQuery; latestRun: AdminYoutubeDiscoveryMissionRun; candidates: AdminYoutubeDiscoveryMissionCandidatePage }>;
export type AdminYoutubeDiscoveryMissionFunnel = Readonly<{ asOf: string; discovered: number; enriched: number; triaged: number; recommended: number; pendingReview: number; accepted: number; deferred: number; skipped: number }>;

export function encodeAdminYoutubeDiscoveryMissionCoverageCursor(cursor: AdminYoutubeDiscoveryMissionCoverageCursor): string { return missionCursor("ydmc1", cursor, missionCoverageCursor) ; }
export function encodeAdminYoutubeDiscoveryMissionQueryCursor(cursor: AdminYoutubeDiscoveryMissionQueryCursor): string { return missionCursor("ydmq1", cursor, missionQueryCursor); }
export function encodeAdminYoutubeDiscoveryMissionCandidateCursor(cursor: AdminYoutubeDiscoveryMissionCandidateCursor): string { return missionCursor("ydmn1", cursor, missionCandidateCursor); }
export function parseAdminYoutubeDiscoveryMissionCoverageCursor(value: unknown): AdminYoutubeDiscoveryMissionCoverageCursor | null { return parseMissionCursor(value, "ydmc1", missionCoverageCursor); }
export function parseAdminYoutubeDiscoveryMissionQueryCursor(value: unknown): AdminYoutubeDiscoveryMissionQueryCursor | null { return parseMissionCursor(value, "ydmq1", missionQueryCursor); }
export function parseAdminYoutubeDiscoveryMissionCandidateCursor(value: unknown): AdminYoutubeDiscoveryMissionCandidateCursor | null { return parseMissionCursor(value, "ydmn1", missionCandidateCursor); }
export function parseAdminYoutubeDiscoveryMissionCoverage(value: unknown): AdminYoutubeDiscoveryMissionCoverage | null { return record(value) && exactKeys(value, ["actionId", "priority", "createdAt", "corridor", "location", "routeSegment", "taxonomy", "freshness", "conflict", "demand", "seasonalContext"]) && missionActionId(value.actionId) && priority(value.priority) && isoTimestamp(value.createdAt) && [value.corridor, value.location, value.routeSegment, value.taxonomy].every((item) => nullableText(item, 160)) && ["fresh", "sensitive", "unavailable"].includes(value.freshness as string) && ["none", "present", "unavailable"].includes(value.conflict as string) && value.demand === "unavailable" && value.seasonalContext === "unavailable" ? value as AdminYoutubeDiscoveryMissionCoverage : null; }
export function parseAdminYoutubeDiscoveryMissionCandidate(value: unknown): AdminYoutubeDiscoveryMissionCandidate | null { return record(value) && exactKeys(value, ["candidateId", "actionId", "priority", "rank", "rankedAt", "rankingState", "recommendationId", "recommendation", "candidateState", "reviewAvailable"]) && identifier(value.candidateId) && missionActionId(value.actionId) && priority(value.priority) && Number.isSafeInteger(value.rank) && (value.rank as number) >= 0 && (value.rank as number) <= 49 && isoTimestamp(value.rankedAt) && ["discovered", "enriched", "triaged", "recommended"].includes(value.rankingState as string) && (value.recommendationId === null || identifier(value.recommendationId)) && ["skip", "defer", "consider", "unavailable"].includes(value.recommendation as string) && ["pending", "accepted", "deferred", "skipped", "unavailable"].includes(value.candidateState as string) && typeof value.reviewAvailable === "boolean" && (value.reviewAvailable ? value.recommendationId !== null && value.recommendation === "consider" && value.candidateState === "pending" : true) ? value as AdminYoutubeDiscoveryMissionCandidate : null; }
export function parseAdminYoutubeDiscoveryMissionCoveragePage(value: unknown): AdminYoutubeDiscoveryMissionCoveragePage | null { return missionPage(value, parseAdminYoutubeDiscoveryMissionCoverage, parseAdminYoutubeDiscoveryMissionCoverageCursor); }
export function parseAdminYoutubeDiscoveryMissionQueryPage(value: unknown): AdminYoutubeDiscoveryMissionQueryPage | null { return missionPage(value, parseAdminYoutubeDiscoveryQuery, parseAdminYoutubeDiscoveryMissionQueryCursor); }
export function parseAdminYoutubeDiscoveryMissionCandidatePage(value: unknown): AdminYoutubeDiscoveryMissionCandidatePage | null { return missionPage(value, parseAdminYoutubeDiscoveryMissionCandidate, parseAdminYoutubeDiscoveryMissionCandidateCursor); }
export function parseAdminYoutubeDiscoveryMissionDetail(value: unknown): AdminYoutubeDiscoveryMissionDetail | null { return record(value) && exactKeys(value, ["coverage", "query", "latestRun", "candidates"]) && parseAdminYoutubeDiscoveryMissionCoverage(value.coverage) !== null && parseAdminYoutubeDiscoveryQuery(value.query) !== null && parseMissionRun(value.latestRun) && parseAdminYoutubeDiscoveryMissionCandidatePage(value.candidates) !== null ? value as AdminYoutubeDiscoveryMissionDetail : null; }
export function parseAdminYoutubeDiscoveryMissionFunnel(value: unknown): AdminYoutubeDiscoveryMissionFunnel | null { return record(value) && exactKeys(value, ["asOf", "discovered", "enriched", "triaged", "recommended", "pendingReview", "accepted", "deferred", "skipped"]) && isoTimestamp(value.asOf) && Object.values(value).slice(1).every((item) => Number.isSafeInteger(item) && (item as number) >= 0) ? value as AdminYoutubeDiscoveryMissionFunnel : null; }

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

export const adminYoutubeDiscoveryActionRequiredPageSize = 20;
export type AdminYoutubeDiscoveryActionRequiredKind = "candidate_review" | "mission_need" | "health_incident" | "knowledge_recommendation";
type AdminYoutubeDiscoveryActionRequiredBase = Readonly<{ actionId: string; priority: number; occurredAt: string }>;
export type AdminYoutubeDiscoveryActionRequiredItem =
  | Readonly<AdminYoutubeDiscoveryActionRequiredBase & { kind: "candidate_review"; destination: "review"; reason: "review_pending" | "review_aged" }>
  | Readonly<AdminYoutubeDiscoveryActionRequiredBase & { kind: "mission_need"; destination: "mission"; reason: "mission_no_progress" | "mission_disabled" | "mission_no_enabled_query" }>
  | Readonly<AdminYoutubeDiscoveryActionRequiredBase & { kind: "health_incident"; destination: "health"; reason: "provider_rate_limited" | "triage_schema_invalid" | "execution_persistent_failure" }>
  | Readonly<AdminYoutubeDiscoveryActionRequiredBase & { kind: "knowledge_recommendation"; destination: "knowledge_recommendation"; reason: "knowledge_risk" | "knowledge_relation" }>;
export type AdminYoutubeDiscoveryActionRequiredCursor = Readonly<{ version: 1; urgency: number; priority: number; occurredAt: string; kind: AdminYoutubeDiscoveryActionRequiredKind; actionId: string }>;
export type AdminYoutubeDiscoveryActionRequiredQueue = Readonly<{ items: AdminYoutubeDiscoveryActionRequiredItem[]; nextCursor: string | null }>;

export function encodeAdminYoutubeDiscoveryActionRequiredCursor(cursor: AdminYoutubeDiscoveryActionRequiredCursor): string {
  if (!actionCursor(cursor)) throw new Error("Invalid YouTube Discovery action-required cursor.");
  return `yda1.${btoa(JSON.stringify(cursor)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}
export function parseAdminYoutubeDiscoveryActionRequiredCursor(value: unknown): AdminYoutubeDiscoveryActionRequiredCursor | null {
  if (typeof value !== "string" || !/^yda1\.[A-Za-z0-9_-]{1,512}$/.test(value)) return null;
  try { const encoded = value.slice(5).replaceAll("-", "+").replaceAll("_", "/"); const parsed: unknown = JSON.parse(atob(encoded + "=".repeat((4 - encoded.length % 4) % 4))); return actionCursor(parsed) ? parsed : null; } catch { return null; }
}
export function parseAdminYoutubeDiscoveryActionRequiredItem(value: unknown): AdminYoutubeDiscoveryActionRequiredItem | null {
  if (!record(value) || !exactKeys(value, ["kind", "actionId", "destination", "reason", "priority", "occurredAt"])) return null;
  const combination = (value.kind === "candidate_review" && value.destination === "review" && (value.reason === "review_pending" || value.reason === "review_aged"))
    || (value.kind === "mission_need" && value.destination === "mission" && (value.reason === "mission_no_progress" || value.reason === "mission_disabled" || value.reason === "mission_no_enabled_query"))
    || (value.kind === "health_incident" && value.destination === "health" && (value.reason === "provider_rate_limited" || value.reason === "triage_schema_invalid" || value.reason === "execution_persistent_failure"))
    || (value.kind === "knowledge_recommendation" && value.destination === "knowledge_recommendation" && (value.reason === "knowledge_risk" || value.reason === "knowledge_relation"));
  return combination && identifier(value.actionId) && Number.isSafeInteger(value.priority) && (value.priority as number) >= 1 && (value.priority as number) <= 100 && isoTimestamp(value.occurredAt) ? value as AdminYoutubeDiscoveryActionRequiredItem : null;
}
export function parseAdminYoutubeDiscoveryActionRequiredQueue(value: unknown): AdminYoutubeDiscoveryActionRequiredQueue | null {
  return record(value) && exactKeys(value, ["items", "nextCursor"]) && Array.isArray(value.items) && value.items.length <= adminYoutubeDiscoveryActionRequiredPageSize && value.items.every((item) => parseAdminYoutubeDiscoveryActionRequiredItem(item) !== null) && (value.nextCursor === null || parseAdminYoutubeDiscoveryActionRequiredCursor(value.nextCursor) !== null) ? value as AdminYoutubeDiscoveryActionRequiredQueue : null;
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
function actionCursor(value: unknown): value is AdminYoutubeDiscoveryActionRequiredCursor { return record(value) && exactKeys(value, ["version", "urgency", "priority", "occurredAt", "kind", "actionId"]) && value.version === 1 && Number.isSafeInteger(value.urgency) && (value.urgency as number) >= 0 && (value.urgency as number) <= 9 && Number.isSafeInteger(value.priority) && (value.priority as number) >= 1 && (value.priority as number) <= 100 && isoTimestamp(value.occurredAt) && (value.kind === "candidate_review" || value.kind === "mission_need" || value.kind === "health_incident" || value.kind === "knowledge_recommendation") && identifier(value.actionId); }
function priority(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 100; }
function missionActionId(value: unknown): value is string { return typeof value === "string" && /^mission-[a-f0-9]{32}$/.test(value); }
function missionCursor<T>(prefix: string, cursor: T, valid: (value: unknown) => value is T): string { if (!valid(cursor)) throw new Error("Invalid YouTube Discovery Mission cursor."); return `${prefix}.${btoa(JSON.stringify(cursor)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`; }
function parseMissionCursor<T>(value: unknown, prefix: string, valid: (value: unknown) => value is T): T | null { if (typeof value !== "string" || !new RegExp(`^${prefix}\\.[A-Za-z0-9_-]{1,512}$`).test(value)) return null; try { const encoded = value.slice(prefix.length + 1).replaceAll("-", "+").replaceAll("_", "/"); const parsed: unknown = JSON.parse(atob(encoded + "=".repeat((4 - encoded.length % 4) % 4))); return valid(parsed) ? parsed : null; } catch { return null; } }
function missionCoverageCursor(value: unknown): value is AdminYoutubeDiscoveryMissionCoverageCursor { return record(value) && exactKeys(value, ["version", "priority", "createdAt", "actionId"]) && value.version === 1 && priority(value.priority) && isoTimestamp(value.createdAt) && missionActionId(value.actionId); }
function missionQueryCursor(value: unknown): value is AdminYoutubeDiscoveryMissionQueryCursor { return record(value) && exactKeys(value, ["version", "priority", "createdAt", "id"]) && value.version === 1 && priority(value.priority) && isoTimestamp(value.createdAt) && identifier(value.id); }
function missionCandidateCursor(value: unknown): value is AdminYoutubeDiscoveryMissionCandidateCursor { return record(value) && exactKeys(value, ["version", "actionId", "priority", "rank", "rankedAt", "candidateId"]) && value.version === 1 && missionActionId(value.actionId) && priority(value.priority) && Number.isSafeInteger(value.rank) && (value.rank as number) >= 0 && (value.rank as number) <= 49 && isoTimestamp(value.rankedAt) && identifier(value.candidateId); }
function missionPage<T>(value: unknown, item: (value: unknown) => T | null, cursor: (value: unknown) => unknown): { items: T[]; nextCursor: string | null } | null { return record(value) && exactKeys(value, ["items", "nextCursor"]) && Array.isArray(value.items) && value.items.length <= adminYoutubeDiscoveryMissionPageSize && value.items.every((entry) => item(entry) !== null) && (value.nextCursor === null || cursor(value.nextCursor) !== null) ? value as { items: T[]; nextCursor: string | null } : null; }
function parseMissionRun(value: unknown): value is AdminYoutubeDiscoveryMissionRun { return record(value) && exactKeys(value, ["state", "createdAt", "retryCount", "terminalCategory"]) && ["queued", "running", "retrying", "completed", "failed", "cancelled", "unavailable"].includes(value.state as string) && (value.createdAt === null || isoTimestamp(value.createdAt)) && (value.retryCount === null || Number.isSafeInteger(value.retryCount) && (value.retryCount as number) >= 0 && (value.retryCount as number) <= 10) && ["provider_rate_limited", "triage_schema_invalid", "execution_terminal", "unavailable"].includes(value.terminalCategory as string) && (value.state === "unavailable" ? value.createdAt === null && value.retryCount === null && value.terminalCategory === "unavailable" : value.createdAt !== null && value.retryCount !== null) ; }
