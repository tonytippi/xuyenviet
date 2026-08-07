export const requestRoles = ["traveler", "operator", "admin"] as const;
export * from "./youtube-discovery";
export type RequestRole = (typeof requestRoles)[number];

export type RequestPrincipal = {
  userId: string;
  sessionId: string;
  roles: RequestRole[];
  authorizationVersion: number;
  name?: string | null;
  email?: string | null;
};

export const adminCapabilities = ["admin.workspace.read", "admin.role.governance", "admin.ai-model-catalog.write", "admin.knowledge.write"] as const;
export type AdminCapability = (typeof adminCapabilities)[number];

/** Shared role policy used by API controllers and domain ports. */
export function permitsAdminCapability(roles: readonly RequestRole[], capability: AdminCapability): boolean {
  if (capability === "admin.workspace.read" || capability === "admin.knowledge.write") return roles.includes("operator") || roles.includes("admin");
  return roles.includes("admin");
}

export type AdminOverviewCoverage = {
  targetActiveCards: number;
  activeEvidenceGroundedCards: number;
  remainingActiveCards: number;
  isComplete: boolean;
  activeCommunityObservations: number;
  activeCommunityPatterns: number;
  caveatOnlyHighRiskCards: number;
  pendingReviewCards: number;
  pendingVerificationCards: number;
  actionableWork: Array<{ kind: "recommendation"; reason: string; priority: number; count: number } | { kind: "source_intake"; reason: "create" | "update" | "conflict"; priority: null; count: number }>;
  byType: Array<{ type: string; count: number }>;
  byRouteOrLocation: Array<{ routeOrLocation: string; count: number }>;
};

/** Aggregate-only operational projection. It intentionally contains no source or card material. */
export type AdminOverview = {
  sourcesReadyForProcessing: number;
  processingJobs: number;
  failedProcessingJobs: number;
  draftsAwaitingReview: number;
  openRecommendations: number;
  activeKnowledgeCards: number;
  coverage: AdminOverviewCoverage;
};

export const adminQualityRanges = ["7d", "30d", "90d", "all"] as const;
export const adminQualityPromptTypes = ["magic_moment_family_trip", "sparse_data", "freshness_sensitive", "service_activity", "route_logistics"] as const;
export type AdminQualityPromptType = (typeof adminQualityPromptTypes)[number];
export type AdminQualityQuery = { promptType: AdminQualityPromptType | "all"; range: (typeof adminQualityRanges)[number] };
export type AdminQualityDashboard = {
  filters: { promptType: AdminQualityQuery["promptType"]; range: AdminQualityQuery["range"]; since: string | null };
  feedback: { total: number; useful: number; notUseful: number; usefulRate: number | null };
  evaluation: { totalResults: number; scoredResults: number; failedResults: number; averageScore: number | null; averageByDimension: Record<string, number | null>; counterMetrics: { unsupportedClaims: number; missingUncertainty: number; noBetterThanGeneric: number } };
  readiness: { status: "ready" | "not_ready"; checks: Array<{ key: string; label: string; passed: boolean; current: number; target: number; missing: number; message: string }>; missingSignals: string[]; diagnostics: { zeroCountTypes: string[]; zeroCountRoutes: string[]; evaluationQualityGaps: number } };
  recentResults: Array<{ promptType: AdminQualityPromptType; status: string; createdAt: string; averageScore: number | null; flags: Record<string, boolean>; likelyIssues: string[] }>;
  policySignals: Record<string, unknown>;
};

export function parseAdminQualityQuery(value: unknown): AdminQualityQuery | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "promptType" && key !== "range")) return null;
  const promptType = value.promptType === undefined ? "all" : value.promptType;
  const range = value.range === undefined ? "30d" : value.range;
  return (promptType === "all" || adminQualityPromptTypes.includes(promptType as AdminQualityPromptType)) && adminQualityRanges.includes(range as AdminQualityQuery["range"]) ? { promptType: promptType as AdminQualityQuery["promptType"], range: range as AdminQualityQuery["range"] } : null;
}

/** Quality is aggregate-only: reject unexpected keys and any non-ISO timestamps. */
export function parseAdminQualityDashboard(value: unknown): AdminQualityDashboard | null {
  if (!isRecord(value) || !hasExactKeys(value, ["filters", "feedback", "evaluation", "readiness", "recentResults", "policySignals"])) return null;
  const filters = value.filters;
  const feedback = value.feedback;
  const evaluation = value.evaluation;
  const readiness = value.readiness;
  if (!isRecord(filters) || !hasExactKeys(filters, ["promptType", "range", "since"]) || !parseAdminQualityQuery({ promptType: filters.promptType, range: filters.range }) || !isRecord(feedback) || !hasExactKeys(feedback, ["total", "useful", "notUseful", "usefulRate"]) || !isRecord(evaluation) || !hasExactKeys(evaluation, ["totalResults", "scoredResults", "failedResults", "averageScore", "averageByDimension", "counterMetrics"]) || !isRecord(readiness) || !hasExactKeys(readiness, ["status", "checks", "missingSignals", "diagnostics"]) || !Array.isArray(value.recentResults) || value.recentResults.length > 10 || !isRecord(value.policySignals)) return null;
  const nonNegative = (item: unknown) => Number.isSafeInteger(item) && (item as number) >= 0;
  if (![feedback.total, feedback.useful, feedback.notUseful, evaluation.totalResults, evaluation.scoredResults, evaluation.failedResults].every(nonNegative) || !(feedback.usefulRate === null || typeof feedback.usefulRate === "number") || !(evaluation.averageScore === null || typeof evaluation.averageScore === "number")) return null;
  const since = filters.since;
  if (!(since === null || isoTimestamp(since)) || !value.recentResults.every(isAdminQualityRecentResult) || containsAdminQualityInternalDetail(value.policySignals)) return null;
  return value as AdminQualityDashboard;
}

function isAdminQualityRecentResult(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["promptType", "status", "createdAt", "averageScore", "flags", "likelyIssues"])
    && adminQualityPromptTypes.includes(value.promptType as AdminQualityPromptType)
    && typeof value.status === "string" && value.status.length <= 64
    && isoTimestamp(value.createdAt)
    && (value.averageScore === null || typeof value.averageScore === "number")
    && isRecord(value.flags) && Object.values(value.flags).every((flag) => typeof flag === "boolean")
    && Array.isArray(value.likelyIssues) && value.likelyIssues.every((issue) => typeof issue === "string" && issue.length <= 160);
}

function containsAdminQualityInternalDetail(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsAdminQualityInternalDetail);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, item]) => ["id", "runId", "resultId", "assistantMessageId", "retrievalDecisionId", "provenanceId", "comment", "comments", "detail", "details"].includes(key) || containsAdminQualityInternalDetail(item));
}

export const adminKnowledgeClosedSamplingPolicyLimit = 100;
export type AdminKnowledgeClosedSamplingPolicy = { cohortKey: string; enrollmentSealedAt: string; candidateCount: number; selectedCount: number };
/** Coverage is aggregate-only; sampling selection and policy sealing remain Worker-owned. */
export type AdminKnowledgeCoverage = { progress: AdminOverviewCoverage; sampling: { closedPolicies: AdminKnowledgeClosedSamplingPolicy[]; obligations: { pending: number; passed: number; failed: number }; actionableWork: number } };

export function parseAdminKnowledgeCoverage(value: unknown): AdminKnowledgeCoverage | null {
  if (!isRecord(value) || !hasExactKeys(value, ["progress", "sampling"]) || !isRecord(value.sampling) || !hasExactKeys(value.sampling, ["closedPolicies", "obligations", "actionableWork"]) || !Array.isArray(value.sampling.closedPolicies) || value.sampling.closedPolicies.length > adminKnowledgeClosedSamplingPolicyLimit || !isRecord(value.sampling.obligations) || !hasExactKeys(value.sampling.obligations, ["pending", "passed", "failed"])) return null;
  const progress = parseAdminOverview({ sourcesReadyForProcessing: 0, processingJobs: 0, failedProcessingJobs: 0, draftsAwaitingReview: 0, openRecommendations: 0, activeKnowledgeCards: 0, coverage: value.progress })?.coverage;
  const sampling = value.sampling as { closedPolicies: unknown[]; obligations: { pending: unknown; passed: unknown; failed: unknown }; actionableWork: unknown };
  return progress && [progress.targetActiveCards, progress.activeEvidenceGroundedCards, progress.remainingActiveCards, progress.activeCommunityObservations, progress.activeCommunityPatterns, progress.caveatOnlyHighRiskCards, progress.pendingReviewCards, progress.pendingVerificationCards, sampling.actionableWork, sampling.obligations.pending, sampling.obligations.passed, sampling.obligations.failed].every((item: unknown) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0) && progress.actionableWork.length <= 1_000 && progress.byType.length <= 100 && progress.byRouteOrLocation.length <= 100 && sampling.closedPolicies.every((policy: unknown) => isRecord(policy) && hasExactKeys(policy, ["cohortKey", "enrollmentSealedAt", "candidateCount", "selectedCount"]) && boundedText(policy.cohortKey, 160) && isoTimestamp(policy.enrollmentSealedAt) && Number.isSafeInteger(policy.candidateCount) && (policy.candidateCount as number) >= 0 && Number.isSafeInteger(policy.selectedCount) && (policy.selectedCount as number) >= 0 && (policy.selectedCount as number) <= (policy.candidateCount as number)) ? value as AdminKnowledgeCoverage : null;
}

export const adminKnowledgeIntakeSourceLimit = 100;
export const adminFacebookCapturePageSize = 25;
export const adminFacebookCaptureMaxPage = 200;
export const adminFacebookCaptureQueueStatuses = ["queued", "running", "completed", "failed", "not_started"] as const;
export type AdminFacebookCaptureQueueStatus = (typeof adminFacebookCaptureQueueStatuses)[number];
export type AdminKnowledgeOperatorCard = { id: string; lifecycleState: "draft" | "pending_operator" | "active" | "suppressed" | "archived" | "rejected"; knowledgeState: "community_observation" | "community_pattern" | "conditional" | "conflicted"; verificationRequirement: "none" | "operator_required" | "failed" };
export type AdminFacebookCaptureCandidate = { type: string; title: string; summary: string; processingStatus: "queued" | "processing" | "completed" | "failed"; aiDisposition: "apply" | "needs_operator" | "discard" | null; outcomeReasonCode: string | null; card: AdminKnowledgeOperatorCard | null };
export type AdminFacebookCaptureJob = { status: "queued" | "running" | "completed" | "failed"; updatedAt: string; lastErrorCode: string | null; candidateCount: number; completedCandidateCount: number; needsOperatorCandidateCount: number; failedCandidateCount: number };
export type AdminFacebookCapture = { id: string; sourceLabel: string; displayUrl: string | null; capturedAt: string | null; captureMethod: string | null; updatedAt: string; ingestionJob: AdminFacebookCaptureJob | null };
export type AdminFacebookCaptureQueue = { status: AdminFacebookCaptureQueueStatus; page: number; pageSize: number; totalCount: number; counts: Record<AdminFacebookCaptureQueueStatus, number>; items: AdminFacebookCapture[] };
export type AdminFacebookCaptureContent = { id: string; capturedAt: string; captureMethod: string | null; rawText: string | null };
export type AdminFacebookCaptureDetail = AdminFacebookCapture & { capture: AdminFacebookCaptureContent | null; candidates: AdminFacebookCaptureCandidate[]; canRecapture: boolean; canRerunIngestion: boolean };
export type AdminFacebookCaptureCommandResult = { status: "updated" | "not_found" | "not_rerunnable" | "invalid_transition" | "already_extracted" | "stale_review" };

export function parseAdminFacebookCaptureQueueQuery(value: unknown): { status: AdminFacebookCaptureQueueStatus; page: number } | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "status" && key !== "page")) return null;
  const status = value.status === undefined ? "queued" : value.status;
  const page = value.page === undefined ? 1 : Number(value.page);
  return adminFacebookCaptureQueueStatuses.includes(status as AdminFacebookCaptureQueueStatus) && Number.isInteger(page) && page >= 1 && page <= adminFacebookCaptureMaxPage ? { status: status as AdminFacebookCaptureQueueStatus, page } : null;
}
export function parseAdminFacebookCaptureRecaptureRequest(value: unknown): { reason: string } | null { return isRecord(value) && hasExactKeys(value, ["reason"]) && typeof value.reason === "string" && value.reason.trim() === value.reason && value.reason.length >= 1 && value.reason.length <= 500 && !/[\r\n\u0000]/.test(value.reason) ? { reason: value.reason } : null; }
export function parseAdminFacebookCaptureCommandResult(value: unknown): AdminFacebookCaptureCommandResult | null { return isRecord(value) && hasExactKeys(value, ["status"]) && ["updated", "not_found", "not_rerunnable", "invalid_transition", "already_extracted", "stale_review"].includes(value.status as string) ? value as AdminFacebookCaptureCommandResult : null; }
export function parseAdminFacebookCaptureQueue(value: unknown): AdminFacebookCaptureQueue | null {
  if (!isRecord(value) || !hasExactKeys(value, ["status", "page", "pageSize", "totalCount", "counts", "items"]) || !adminFacebookCaptureQueueStatuses.includes(value.status as AdminFacebookCaptureQueueStatus) || !Number.isInteger(value.page) || !Number.isInteger(value.pageSize) || value.pageSize !== adminFacebookCapturePageSize || !Number.isInteger(value.totalCount) || (value.totalCount as number) < 0 || !isRecord(value.counts) || !Array.isArray(value.items) || value.items.length > adminFacebookCapturePageSize) return null;
  const counts = value.counts as Record<string, unknown>;
  return adminFacebookCaptureQueueStatuses.every((status) => Number.isInteger(counts[status]) && (counts[status] as number) >= 0) && value.items.every(isAdminFacebookCapture) ? value as AdminFacebookCaptureQueue : null;
}
export function parseAdminFacebookCaptureDetail(value: unknown): AdminFacebookCaptureDetail | null { if (!isRecord(value) || !hasExactKeys(value, ["id", "sourceLabel", "displayUrl", "capturedAt", "captureMethod", "updatedAt", "ingestionJob", "capture", "candidates", "canRecapture", "canRerunIngestion"]) || !Array.isArray(value.candidates) || value.candidates.length > 100 || typeof value.canRecapture !== "boolean" || typeof value.canRerunIngestion !== "boolean") return null; const { capture: content, candidates, canRecapture: _canRecapture, canRerunIngestion: _canRerunIngestion, ...capture } = value; return isAdminFacebookCapture(capture) && (content === null || isAdminFacebookCaptureContent(content)) && candidates.every(isAdminFacebookCaptureCandidate) ? value as AdminFacebookCaptureDetail : null; }
function isAdminFacebookCapture(value: unknown): value is AdminFacebookCapture {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "sourceLabel", "displayUrl", "capturedAt", "captureMethod", "updatedAt", "ingestionJob"]) || !identifier(value.id) || !boundedText(value.sourceLabel, 500) || !(value.displayUrl === null || typeof value.displayUrl === "string" && safeDisplayUrl(value.displayUrl)) || !["capturedAt", "captureMethod"].every((key) => typeof value[key] === "string" || value[key] === null) || !isoTimestamp(value.updatedAt)) return false;
  const job = value.ingestionJob;
  return job === null || isRecord(job) && hasExactKeys(job, ["status", "updatedAt", "lastErrorCode", "candidateCount", "completedCandidateCount", "needsOperatorCandidateCount", "failedCandidateCount"]) && ["queued", "running", "completed", "failed"].includes(job.status as string) && isoTimestamp(job.updatedAt) && (typeof job.lastErrorCode === "string" && safeIngestionErrorCode(job.lastErrorCode) || job.lastErrorCode === null) && [job.candidateCount, job.completedCandidateCount, job.needsOperatorCandidateCount, job.failedCandidateCount].every((count) => Number.isInteger(count) && (count as number) >= 0);
}
function safeIngestionErrorCode(value: string) { return ["discovery_model_unavailable", "discovery_gateway_http_error", "discovery_gateway_network_error", "discovery_invalid_gateway_response", "discovery_client_stream_aborted", "discovery_invalid_output", "discovery_invalid_candidate", "discovery_missing_evidence", "discovery_invalid_evidence", "discovery_ungrounded_evidence", "discovery_failed", "relation_decision_failed", "invalid_relation", "stale_capture", "retry_exhausted"].includes(value); }
function isAdminFacebookCaptureContent(value: unknown): value is AdminFacebookCaptureContent { return isRecord(value) && hasExactKeys(value, ["id", "capturedAt", "captureMethod", "rawText"]) && identifier(value.id) && isoTimestamp(value.capturedAt) && (value.captureMethod === null || boundedText(value.captureMethod, 80)) && (value.rawText === null || typeof value.rawText === "string" && value.rawText.length > 0 && value.rawText.length <= 120_000); }
function isAdminFacebookCaptureCandidate(value: unknown): value is AdminFacebookCaptureCandidate { if (!isRecord(value) || !hasExactKeys(value, ["type", "title", "summary", "processingStatus", "aiDisposition", "outcomeReasonCode", "card"]) || !boundedText(value.type, 80) || !boundedText(value.title, 160) || !boundedText(value.summary, 1200) || !["queued", "processing", "completed", "failed"].includes(value.processingStatus as string) || ![null, "apply", "needs_operator", "discard"].includes(value.aiDisposition as null) || !(value.outcomeReasonCode === null || boundedText(value.outcomeReasonCode, 120))) return false; if (value.processingStatus === "completed" ? value.aiDisposition === null || value.outcomeReasonCode === null : value.aiDisposition !== null || value.outcomeReasonCode !== null) return false; return value.card === null || isRecord(value.card) && hasExactKeys(value.card, ["id", "lifecycleState", "knowledgeState", "verificationRequirement"]) && identifier(value.card.id) && ["draft", "pending_operator", "active", "suppressed", "archived", "rejected"].includes(value.card.lifecycleState as string) && ["community_observation", "community_pattern", "conditional", "conflicted"].includes(value.card.knowledgeState as string) && ["none", "operator_required", "failed"].includes(value.card.verificationRequirement as string); }
export const adminYoutubeCapturePageSize = 25;
export const adminYoutubeCaptureMaxPage = 200;
export const adminYoutubeEvidenceCategories = ["road_condition", "route", "toll", "fuel", "charging", "rest_stop", "parking", "accommodation", "food", "attraction", "safety", "weather", "cost"] as const;
export type AdminYoutubeEvidenceCategory = (typeof adminYoutubeEvidenceCategories)[number];
export type AdminYoutubeCaptureEvidence = { category: AdminYoutubeEvidenceCategory; claim: string; evidenceType: "spoken" | "on_screen" | "both"; timestampStartSeconds: number; timestampEndSeconds: number; confidence: "high" | "medium" | "low"; freshnessSensitive: boolean; excerpt: string; uncertaintyOrCondition: string | null };
export type AdminYoutubeCaptureIngestionJob = AdminFacebookCaptureJob;
export type AdminYoutubeCapture = { sourceId: string; sourceLabel: string; displayUrl: string | null; createdAt: string; capturedAt: string | null; captureMethod: "gemini_youtube_url"; evidenceCount: number; ingestionJob: AdminYoutubeCaptureIngestionJob | null };
export type AdminYoutubeCaptureQueue = { page: number; pageSize: number; totalCount: number; items: AdminYoutubeCapture[] };
export type AdminYoutubeCaptureDetail = AdminYoutubeCapture & { evidence: AdminYoutubeCaptureEvidence[] };

export function parseAdminYoutubeCaptureQueueQuery(value: unknown): { page: number } | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "page")) return null;
  const page = value.page === undefined ? 1 : Number(value.page);
  return Number.isInteger(page) && page >= 1 && page <= adminYoutubeCaptureMaxPage ? { page } : null;
}
export function parseAdminYoutubeCaptureQueue(value: unknown): AdminYoutubeCaptureQueue | null {
  if (!isRecord(value) || !hasExactKeys(value, ["page", "pageSize", "totalCount", "items"]) || !Number.isInteger(value.page) || (value.page as number) < 1 || (value.page as number) > adminYoutubeCaptureMaxPage || value.pageSize !== adminYoutubeCapturePageSize || !Number.isInteger(value.totalCount) || (value.totalCount as number) < 0 || !Array.isArray(value.items) || value.items.length > adminYoutubeCapturePageSize || !value.items.every(isAdminYoutubeCapture)) return null;
  return value as AdminYoutubeCaptureQueue;
}
export function parseAdminYoutubeCaptureDetail(value: unknown): AdminYoutubeCaptureDetail | null {
  if (!isRecord(value) || !hasExactKeys(value, ["sourceId", "sourceLabel", "displayUrl", "createdAt", "capturedAt", "captureMethod", "evidenceCount", "ingestionJob", "evidence"]) || !Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 80) return null;
  const { evidence, ...capture } = value;
  return isAdminYoutubeCapture(capture) && evidence.every(isAdminYoutubeCaptureEvidence) ? value as AdminYoutubeCaptureDetail : null;
}
function isAdminYoutubeCapture(value: unknown): value is AdminYoutubeCapture {
  if (!isRecord(value) || !hasExactKeys(value, ["sourceId", "sourceLabel", "displayUrl", "createdAt", "capturedAt", "captureMethod", "evidenceCount", "ingestionJob"]) || !identifier(value.sourceId) || !boundedText(value.sourceLabel, 500) || !isoTimestamp(value.createdAt) || value.captureMethod !== "gemini_youtube_url" || !(value.displayUrl === null || typeof value.displayUrl === "string" && safeDisplayUrl(value.displayUrl)) || !(value.capturedAt === null || typeof value.capturedAt === "string") || !Number.isInteger(value.evidenceCount) || (value.evidenceCount as number) < 1 || (value.evidenceCount as number) > 80) return false;
  if (typeof value.displayUrl === "string" && value.displayUrl.length > 500 || typeof value.capturedAt === "string" && !isoTimestamp(value.capturedAt)) return false;
  const job = value.ingestionJob;
  return job === null || isRecord(job) && hasExactKeys(job, ["status", "updatedAt", "lastErrorCode", "candidateCount", "completedCandidateCount", "needsOperatorCandidateCount", "failedCandidateCount"]) && ["queued", "running", "completed", "failed"].includes(job.status as string) && isoTimestamp(job.updatedAt) && (job.lastErrorCode === null || boundedText(job.lastErrorCode, 120)) && [job.candidateCount, job.completedCandidateCount, job.needsOperatorCandidateCount, job.failedCandidateCount].every((count) => Number.isInteger(count) && (count as number) >= 0);
}
function isAdminYoutubeCaptureEvidence(value: unknown): value is AdminYoutubeCaptureEvidence {
  return isRecord(value) && hasExactKeys(value, ["category", "claim", "evidenceType", "timestampStartSeconds", "timestampEndSeconds", "confidence", "freshnessSensitive", "excerpt", "uncertaintyOrCondition"])
    && adminYoutubeEvidenceCategories.includes(value.category as AdminYoutubeEvidenceCategory) && boundedText(value.claim, 500) && ["spoken", "on_screen", "both"].includes(value.evidenceType as string) && Number.isInteger(value.timestampStartSeconds) && (value.timestampStartSeconds as number) >= 0 && Number.isInteger(value.timestampEndSeconds) && (value.timestampEndSeconds as number) >= (value.timestampStartSeconds as number) && ["high", "medium", "low"].includes(value.confidence as string) && typeof value.freshnessSensitive === "boolean" && boundedText(value.excerpt, 240) && (value.uncertaintyOrCondition === null || boundedText(value.uncertaintyOrCondition, 400));
}
function boundedText(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum; }
function isoTimestamp(value: unknown): value is string { return typeof value === "string" && value.length <= 100 && !Number.isNaN(Date.parse(value)); }
const unsafeDisplayUrlContent = /cookie|token|secret|password|provider\s*payload|provider[_-]?payload|prompt|response|<html|<!doctype/i;
function safeDisplayUrl(value: string) {
  if (value.length > 500) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || unsafeDisplayUrlContent.test(`${url.origin}${url.pathname}${url.hash}`)) return false;
    return [...url.searchParams].every(([key, item]) => !(/token|secret|code|key|signature|password/i.test(key) || unsafeDisplayUrlContent.test(item)) || item === "[redacted]");
  } catch { return false; }
}
export const adminKnowledgeSeedBatchUrlLimit = 50;
export type AdminKnowledgeIntakeSource = { id: string; displayUrl: string | null; displayTitle: string; kind: "url" | "facebook" | "youtube"; processed: boolean; eligibility: "eligible" | "withdrawn"; removalReason: "withdrawn" | "inaccessible" | "removed" | null; createdAt: string };
export type AdminKnowledgeIntake = { sources: AdminKnowledgeIntakeSource[] };
export type AdminKnowledgeIntakeQuery = { kind?: AdminKnowledgeIntakeSource["kind"]; processed?: boolean };
export type AdminKnowledgeSeedBatchRequest = { urls: string[]; label?: string | null; publisher?: string | null; collectedDate?: string | null };
export type AdminKnowledgeSeedBatchResponse = { batchId: string; totalItems: number; submittedCount: number; failedCount: number; duplicateCount: number };
export type AdminKnowledgeSourceRemovalRequest = { reason: "withdrawn" | "inaccessible" | "removed" };
export type AdminKnowledgeSourceRemovalResponse = { status: "completed" | "already_completed"; sourceId: string; changedCardCount: number };

export function parseAdminKnowledgeSeedBatchRequest(value: unknown): AdminKnowledgeSeedBatchRequest | null {
  if (!isRecord(value) || !hasExactKeys(value, ["urls", "label", "publisher", "collectedDate"].filter((key) => key in value))) return null;
  if (!Array.isArray(value.urls) || value.urls.length < 1 || value.urls.length > adminKnowledgeSeedBatchUrlLimit || !value.urls.every((url) => typeof url === "string" && url.trim() === url && url.length > 0 && url.length <= 2048)) return null;
  const optional = (item: unknown, length: number) => item === undefined || item === null || typeof item === "string" && item.trim() === item && item.length > 0 && item.length <= length && !/[\r\n]/.test(item);
  return optional(value.label, 160) && optional(value.publisher, 160) && (value.collectedDate === undefined || value.collectedDate === null || typeof value.collectedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.collectedDate) && !Number.isNaN(Date.parse(value.collectedDate))) ? value as AdminKnowledgeSeedBatchRequest : null;
}
export function parseAdminKnowledgeSourceRemovalRequest(value: unknown): AdminKnowledgeSourceRemovalRequest | null { return isRecord(value) && hasExactKeys(value, ["reason"]) && ["withdrawn", "inaccessible", "removed"].includes(value.reason as string) ? value as AdminKnowledgeSourceRemovalRequest : null; }
export function parseAdminKnowledgeSeedBatchResponse(value: unknown): AdminKnowledgeSeedBatchResponse | null { return isRecord(value) && hasExactKeys(value, ["batchId", "totalItems", "submittedCount", "failedCount", "duplicateCount"]) && typeof value.batchId === "string" && value.batchId.length > 0 && [value.totalItems, value.submittedCount, value.failedCount, value.duplicateCount].every((count) => Number.isInteger(count) && (count as number) >= 0) ? value as AdminKnowledgeSeedBatchResponse : null; }
export function parseAdminKnowledgeSourceRemovalResponse(value: unknown): AdminKnowledgeSourceRemovalResponse | null { return isRecord(value) && hasExactKeys(value, ["status", "sourceId", "changedCardCount"]) && (value.status === "completed" || value.status === "already_completed") && typeof value.sourceId === "string" && value.sourceId.length > 0 && Number.isInteger(value.changedCardCount) && (value.changedCardCount as number) >= 0 ? value as AdminKnowledgeSourceRemovalResponse : null; }
export function parseAdminKnowledgeIntakeQuery(value: unknown): AdminKnowledgeIntakeQuery | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "kind" && key !== "processed")) return null;
  if (value.kind !== undefined && !["url", "facebook", "youtube"].includes(value.kind as string)) return null;
  if (value.processed !== undefined && value.processed !== "true" && value.processed !== "false") return null;
  return { ...(value.kind === undefined ? {} : { kind: value.kind as AdminKnowledgeIntakeSource["kind"] }), ...(value.processed === undefined ? {} : { processed: value.processed === "true" }) };
}
export function parseAdminKnowledgeIntake(value: unknown): AdminKnowledgeIntake | null {
  if (!isRecord(value) || !hasExactKeys(value, ["sources"]) || !Array.isArray(value.sources) || value.sources.length > adminKnowledgeIntakeSourceLimit) return null;
  const validSource = (source: unknown) => isRecord(source) && hasExactKeys(source, ["id", "displayUrl", "displayTitle", "kind", "processed", "eligibility", "removalReason", "createdAt"]) && typeof source.id === "string" && (source.displayUrl === null || typeof source.displayUrl === "string" && safeDisplayUrl(source.displayUrl)) && typeof source.displayTitle === "string" && ["url", "facebook", "youtube"].includes(source.kind as string) && typeof source.processed === "boolean" && ["eligible", "withdrawn"].includes(source.eligibility as string) && (source.removalReason === null || ["withdrawn", "inaccessible", "removed"].includes(source.removalReason as string)) && typeof source.createdAt === "string";
  return value.sources.every(validSource) ? value as AdminKnowledgeIntake : null;
}

export type AdminKnowledgeCard = { id: string; type: string; title: string; locationName: string | null; routeSegment: string | null; summary: string; conditions: string[]; practicalDetails: Record<string, string | string[]>; tags: string[]; confidence: string; freshnessSensitive: boolean; lifecycleState: "draft" | "pending_operator" | "active" | "suppressed" | "archived" | "rejected"; knowledgeState: "community_observation" | "community_pattern" | "conditional" | "conflicted"; verificationRequirement: "none" | "operator_required" | "failed"; updatedAt: string; createdAt: string; sources: Array<{ id: string; label: string; kind: string; sourceType: string; verificationStatus: string; supportLevel: string; publisher: string | null; collectedDate: string | null; official: boolean; partner: boolean }>; indexStatus: { state: string; label: string; documentStatus: string | null; indexedAt: string | null } | null };
export type AdminKnowledgeCardList = { items: AdminKnowledgeCard[] };
export type AdminKnowledgeRecommendationResult = { status: "resolved" | "stale" | "unavailable" | "invalid_action" | "invalid_edit" | "invalid_sampling_reason" | "invalid_evidence" | "invalid_verification" | "insufficient_support"; cardId?: string };
const reviewId = (value: unknown) => identifier(value);
const safeString = (value: unknown, maximum: number, nullable = false) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum || nullable && value === null;
function safeDetails(value: unknown) { return isRecord(value) && Object.keys(value).length <= 20 && Object.entries(value).every(([key, item]) => safeString(key, 60) && (safeString(item, 500) || Array.isArray(item) && item.length <= 40 && item.every((entry) => safeString(entry, 500)))); }
function safeSource(value: unknown) { return isRecord(value) && hasExactKeys(value, ["id", "label", "kind", "sourceType", "verificationStatus", "supportLevel", "publisher", "collectedDate", "official", "partner"]) && reviewId(value.id) && safeString(value.label, 160) && ["kind", "sourceType", "verificationStatus", "supportLevel"].every((key) => safeString(value[key], 80)) && safeString(value.publisher, 160, true) && safeString(value.collectedDate, 32, true) && typeof value.official === "boolean" && typeof value.partner === "boolean"; }
function safeCard(value: unknown): value is AdminKnowledgeCard { return isRecord(value) && hasExactKeys(value, ["id", "type", "title", "locationName", "routeSegment", "summary", "conditions", "practicalDetails", "tags", "confidence", "freshnessSensitive", "lifecycleState", "knowledgeState", "verificationRequirement", "updatedAt", "createdAt", "sources", "indexStatus"]) && reviewId(value.id) && safeString(value.type, 80) && safeString(value.title, 160) && safeString(value.locationName, 160, true) && safeString(value.routeSegment, 160, true) && safeString(value.summary, 1200) && Array.isArray(value.conditions) && value.conditions.length <= 20 && value.conditions.every((condition) => safeString(condition, 500)) && safeDetails(value.practicalDetails) && Array.isArray(value.tags) && value.tags.length <= 12 && value.tags.every((tag) => safeString(tag, 40)) && safeString(value.confidence, 80) && typeof value.freshnessSensitive === "boolean" && ["draft", "pending_operator", "active", "suppressed", "archived", "rejected"].includes(value.lifecycleState as string) && ["community_observation", "community_pattern", "conditional", "conflicted"].includes(value.knowledgeState as string) && ["none", "operator_required", "failed"].includes(value.verificationRequirement as string) && isoTimestamp(value.updatedAt) && isoTimestamp(value.createdAt) && Array.isArray(value.sources) && value.sources.every(safeSource) && (value.indexStatus === null || isRecord(value.indexStatus) && hasExactKeys(value.indexStatus, ["state", "label", "documentStatus", "indexedAt"]) && safeString(value.indexStatus.state, 80) && safeString(value.indexStatus.label, 160) && safeString(value.indexStatus.documentStatus, 80, true) && safeString(value.indexStatus.indexedAt, 100, true) && (value.indexStatus.indexedAt === null || isoTimestamp(value.indexStatus.indexedAt))); }
export function parseAdminKnowledgeCardListQuery(value: unknown) { return isRecord(value) && Object.keys(value).every((key) => key === "lifecycleState" || key === "q") && ["draft", "pending_operator", "active", "suppressed", "archived", "rejected"].includes(value.lifecycleState as string) && (value.q === undefined || safeString(value.q, 240)) ? { lifecycleState: value.lifecycleState as AdminKnowledgeCard["lifecycleState"], q: value.q as string | undefined } : null; }
export function parseAdminKnowledgeCardList(value: unknown): AdminKnowledgeCardList | null { return isRecord(value) && hasExactKeys(value, ["items"]) && Array.isArray(value.items) && value.items.length <= 200 && value.items.every(safeCard) ? value as AdminKnowledgeCardList : null; }
export function parseAdminKnowledgeCard(value: unknown): AdminKnowledgeCard | null { return safeCard(value) ? value : null; }
export function parseAdminKnowledgeRecommendationListQuery(value: unknown) { return isRecord(value) && Object.keys(value).every((key) => ["workStatus", "workType", "page"].includes(key)) && (value.workStatus === undefined || ["actionable", "completed", "inactive"].includes(value.workStatus as string)) && (value.workType === undefined || ["risk", "missing_context", "verification", "relation", "sampling"].includes(value.workType as string)) && (value.page === undefined || Number.isInteger(Number(value.page)) && Number(value.page) >= 1 && Number(value.page) <= 200) ? { ...(value.workStatus === undefined ? {} : { workStatus: value.workStatus }), ...(value.workType === undefined ? {} : { workType: value.workType }), ...(value.page === undefined ? {} : { page: Number(value.page) }) } : null; }
export type AdminKnowledgeRecommendationCard = { id: string; title: string; summary: string; lifecycleState: AdminKnowledgeCard["lifecycleState"]; knowledgeState: AdminKnowledgeCard["knowledgeState"]; verificationRequirement: AdminKnowledgeCard["verificationRequirement"] };
export type AdminKnowledgeRecommendationListItem = { id: string; status: "open" | "resolved" | "superseded"; resolution: string | null; workType: "risk" | "missing_context" | "verification" | "relation" | "sampling"; priority: number; createdAt: string; card: AdminKnowledgeRecommendationCard };
export type AdminKnowledgeRecommendationDetail = AdminKnowledgeRecommendationListItem & { card: AdminKnowledgeRecommendationCard & { type: string; locationName: string | null; routeSegment: string | null; tags: string[]; freshnessSensitive: boolean }; evidence: Array<{ quote: string; conditions: string[]; supportLevel: string; displayPolicy: string; capturedAt: string; sourceLabel: string; sourceKind: string; facebookReviewId: string | null }> };
export type AdminKnowledgeRecommendationList = { items: AdminKnowledgeRecommendationListItem[]; counts: { actionable: number; completed: number; inactive: number } };
function safeRecommendationCard(value: unknown, detail = false): value is AdminKnowledgeRecommendationCard { const keys = detail ? ["id", "title", "summary", "lifecycleState", "knowledgeState", "verificationRequirement", "type", "locationName", "routeSegment", "tags", "freshnessSensitive"] : ["id", "title", "summary", "lifecycleState", "knowledgeState", "verificationRequirement"]; return isRecord(value) && hasExactKeys(value, keys) && reviewId(value.id) && safeString(value.title, 160) && safeString(value.summary, 1200) && ["draft", "pending_operator", "active", "suppressed", "archived", "rejected"].includes(value.lifecycleState as string) && ["community_observation", "community_pattern", "conditional", "conflicted"].includes(value.knowledgeState as string) && ["none", "operator_required", "failed"].includes(value.verificationRequirement as string) && (!detail || safeString(value.type, 80) && safeString(value.locationName, 160, true) && safeString(value.routeSegment, 160, true) && Array.isArray(value.tags) && value.tags.length <= 12 && value.tags.every((tag) => safeString(tag, 40)) && typeof value.freshnessSensitive === "boolean"); }
function safeRecommendation(value: unknown, detail = false): value is AdminKnowledgeRecommendationListItem { const keys = detail ? ["id", "status", "resolution", "workType", "priority", "createdAt", "card", "evidence"] : ["id", "status", "resolution", "workType", "priority", "createdAt", "card"]; return isRecord(value) && hasExactKeys(value, keys) && reviewId(value.id) && ["open", "resolved", "superseded"].includes(value.status as string) && safeString(value.resolution, 80, true) && ["risk", "missing_context", "verification", "relation", "sampling"].includes(value.workType as string) && Number.isInteger(value.priority) && (value.priority as number) >= 1 && (value.priority as number) <= 100 && isoTimestamp(value.createdAt) && safeRecommendationCard(value.card, detail); }
export function parseAdminKnowledgeRecommendationList(value: unknown): AdminKnowledgeRecommendationList | null { return isRecord(value) && hasExactKeys(value, ["items", "counts"]) && Array.isArray(value.items) && value.items.length <= 25 && value.items.every((item) => safeRecommendation(item)) && isRecord(value.counts) && hasExactKeys(value.counts, ["actionable", "completed", "inactive"]) && [value.counts.actionable, value.counts.completed, value.counts.inactive].every((item) => Number.isInteger(item) && (item as number) >= 0) ? value as AdminKnowledgeRecommendationList : null; }
export function parseAdminKnowledgeRecommendationDetail(value: unknown): AdminKnowledgeRecommendationDetail | null { if (!isRecord(value) || !safeRecommendation(value, true)) return null; const evidence = (value as Record<string, unknown>).evidence; if (!Array.isArray(evidence) || evidence.length > 4) return null; return evidence.every((item: unknown) => isRecord(item) && hasExactKeys(item, ["quote", "conditions", "supportLevel", "displayPolicy", "capturedAt", "sourceLabel", "sourceKind", "facebookReviewId"]) && safeString(item.quote, 500) && Array.isArray(item.conditions) && item.conditions.length <= 10 && item.conditions.every((condition: unknown) => safeString(condition, 160)) && safeString(item.supportLevel, 80) && safeString(item.displayPolicy, 80) && isoTimestamp(item.capturedAt) && safeString(item.sourceLabel, 160) && safeString(item.sourceKind, 80) && (item.facebookReviewId === null || reviewId(item.facebookReviewId))) ? value as AdminKnowledgeRecommendationDetail : null; }
export function parseAdminKnowledgeRecommendationResolve(value: unknown) { if (!isRecord(value) || !("action" in value) || Object.keys(value).some((key) => !["action", "editSummary", "highSeverity"].includes(key))) return null; return ["accept_wording", "edit", "suppress", "restore", "verify", "promote", "resolve_relation", "sampling_pass", "sampling_fail"].includes(value.action as string) && (value.editSummary === undefined || safeString(value.editSummary, 1200)) && (value.highSeverity === undefined || typeof value.highSeverity === "boolean") && (!(value.highSeverity === true) || value.action === "sampling_fail") ? value : null; }
export function parseAdminKnowledgeRecommendationResult(value: unknown) { return isRecord(value) && Object.keys(value).every((key) => key === "status" || key === "cardId") && ["resolved", "stale", "unavailable", "invalid_action", "invalid_edit", "invalid_sampling_reason", "invalid_evidence", "invalid_verification", "insufficient_support"].includes(value.status as string) && (value.cardId === undefined || reviewId(value.cardId)) ? value as AdminKnowledgeRecommendationResult : null; }

export function parseAdminOverview(value: unknown): AdminOverview | null {
  if (!isRecord(value) || !hasExactKeys(value, ["sourcesReadyForProcessing", "processingJobs", "failedProcessingJobs", "draftsAwaitingReview", "openRecommendations", "activeKnowledgeCards", "coverage"])) return null;
  const count = (item: unknown) => Number.isInteger(item) && (item as number) >= 0;
  const coverage = value.coverage;
  return count(value.sourcesReadyForProcessing) && count(value.processingJobs) && count(value.failedProcessingJobs) && count(value.draftsAwaitingReview) && count(value.openRecommendations) && count(value.activeKnowledgeCards)
    && isRecord(coverage) && hasExactKeys(coverage, ["targetActiveCards", "activeEvidenceGroundedCards", "remainingActiveCards", "isComplete", "activeCommunityObservations", "activeCommunityPatterns", "caveatOnlyHighRiskCards", "pendingReviewCards", "pendingVerificationCards", "actionableWork", "byType", "byRouteOrLocation"])
    && count(coverage.targetActiveCards) && count(coverage.activeEvidenceGroundedCards) && count(coverage.remainingActiveCards) && typeof coverage.isComplete === "boolean" && count(coverage.activeCommunityObservations) && count(coverage.activeCommunityPatterns) && count(coverage.caveatOnlyHighRiskCards) && count(coverage.pendingReviewCards) && count(coverage.pendingVerificationCards)
    && Array.isArray(coverage.actionableWork) && coverage.actionableWork.every((item) => isRecord(item) && hasExactKeys(item, ["kind", "reason", "priority", "count"]) && (item.kind === "recommendation" && typeof item.reason === "string" && count(item.priority) || item.kind === "source_intake" && ["create", "update", "conflict"].includes(item.reason as string) && item.priority === null) && count(item.count))
    && Array.isArray(coverage.byType) && coverage.byType.every((item) => isRecord(item) && hasExactKeys(item, ["type", "count"]) && typeof item.type === "string" && count(item.count))
    && Array.isArray(coverage.byRouteOrLocation) && coverage.byRouteOrLocation.every((item) => isRecord(item) && hasExactKeys(item, ["routeOrLocation", "count"]) && typeof item.routeOrLocation === "string" && count(item.count))
    ? value as AdminOverview
    : null;
}

export const aiGatewayModelPurposes = ["ai_ask_initial_answer", "extraction", "embeddings", "evaluation"] as const;
export type AiGatewayModelPurpose = (typeof aiGatewayModelPurposes)[number];
export type AdminAiGatewayModel = { id: string; gatewayModelName: string; displayLabel: string; purpose: AiGatewayModelPurpose; active: boolean; defaultForPurpose: boolean; supportsTextInput: boolean; supportsImageInput: boolean; supportsImageOutput: boolean; supportsEmbeddings: boolean; supportsExtraction: boolean; supportsEvaluation: boolean; supportsStreaming: boolean; supportsCachePricing: boolean; pricingCurrency: string | null; inputTokenPriceMicros: number | null; outputTokenPriceMicros: number | null; cacheReadTokenPriceMicros: number | null; cacheWriteTokenPriceMicros: number | null; pricingUnitTokens: number; pricingVersion: string | null; pricingEffectiveAt: string };
export type AdminAiGatewayModelInput = Omit<AdminAiGatewayModel, "id">;
export type AdminAiGatewayModelUpdate = Partial<AdminAiGatewayModelInput>;

export function parseAdminAiGatewayModelInput(value: unknown, partial = false): AdminAiGatewayModelInput | AdminAiGatewayModelUpdate | null {
  if (!isRecord(value)) return null;
  const keys = ["gatewayModelName", "displayLabel", "purpose", "active", "defaultForPurpose", "supportsTextInput", "supportsImageInput", "supportsImageOutput", "supportsEmbeddings", "supportsExtraction", "supportsEvaluation", "supportsStreaming", "supportsCachePricing", "pricingCurrency", "inputTokenPriceMicros", "outputTokenPriceMicros", "cacheReadTokenPriceMicros", "cacheWriteTokenPriceMicros", "pricingUnitTokens", "pricingVersion", "pricingEffectiveAt"];
  if (!Object.keys(value).every((key) => keys.includes(key)) || partial && Object.keys(value).length === 0 || !partial && !keys.every((key) => key in value)) return null;
  const text = (item: unknown, maximum: number, nullable = false) => typeof item === "string" && item.trim() === item && item.length > 0 && item.length <= maximum ? item : nullable && item === null ? null : undefined;
  const integer = (item: unknown, nullable = false) => Number.isInteger(item) && (item as number) >= 0 && (item as number) <= 2_147_483_647 ? item as number : nullable && item === null ? null : undefined;
  const parsed: Record<string, unknown> = {};
  for (const key of Object.keys(value)) parsed[key] = value[key];
  if ("gatewayModelName" in parsed && text(parsed.gatewayModelName, 500) === undefined || "displayLabel" in parsed && text(parsed.displayLabel, 500) === undefined || "purpose" in parsed && !(aiGatewayModelPurposes as readonly string[]).includes(parsed.purpose as string) || ["active", "defaultForPurpose", "supportsTextInput", "supportsImageInput", "supportsImageOutput", "supportsEmbeddings", "supportsExtraction", "supportsEvaluation", "supportsStreaming", "supportsCachePricing"].some((key) => key in parsed && typeof parsed[key] !== "boolean") || ["inputTokenPriceMicros", "outputTokenPriceMicros", "cacheReadTokenPriceMicros", "cacheWriteTokenPriceMicros"].some((key) => key in parsed && integer(parsed[key], true) === undefined) || "pricingUnitTokens" in parsed && (!Number.isInteger(parsed.pricingUnitTokens) || (parsed.pricingUnitTokens as number) <= 0 || (parsed.pricingUnitTokens as number) > 2_147_483_647) || "pricingCurrency" in parsed && text(parsed.pricingCurrency, 16, true) === undefined || "pricingVersion" in parsed && text(parsed.pricingVersion, 500, true) === undefined || "pricingEffectiveAt" in parsed && (typeof parsed.pricingEffectiveAt !== "string" || Number.isNaN(Date.parse(parsed.pricingEffectiveAt)))) return null;
  return parsed as AdminAiGatewayModelInput | AdminAiGatewayModelUpdate;
}

export function parseAdminAiGatewayModel(value: unknown): AdminAiGatewayModel | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "active,cacheReadTokenPriceMicros,cacheWriteTokenPriceMicros,defaultForPurpose,displayLabel,gatewayModelName,id,inputTokenPriceMicros,outputTokenPriceMicros,pricingCurrency,pricingEffectiveAt,pricingUnitTokens,pricingVersion,purpose,supportsCachePricing,supportsEmbeddings,supportsEvaluation,supportsExtraction,supportsImageInput,supportsImageOutput,supportsStreaming,supportsTextInput") return null;
  const { id, ...input } = value;
  return typeof id === "string" && id.length > 0 && parseAdminAiGatewayModelInput(input) ? value as AdminAiGatewayModel : null;
}

export type SafeFieldViolation = { field: string; code: string; message: string };
export const safeApiErrorCodes = ["unauthorized", "forbidden", "validation_error", "csrf_invalid", "request_timeout", "internal_error"] as const;
export type SafeApiErrorCode = (typeof safeApiErrorCodes)[number];
export type SafeApiError = {
  code: SafeApiErrorCode;
  message: string;
  requestId: string;
  violations?: SafeFieldViolation[];
};

export const adminUserRosterPageSize = 25;
export const adminUserRosterSearchMaxLength = 120;
export const managedUserRoles = ["operator", "admin"] as const;
export type ManagedUserRole = (typeof managedUserRoles)[number];
export type UserRoleOperation = "grant" | "revoke";
export type AdminUserRosterCursor = { name: string | null; email: string | null; id: string };
export type AdminUserRosterItem = { id: string; name: string | null; email: string | null; image: string | null; emailVerified: string | null; roles: RequestRole[]; usage: { aiRequestCount: string; inputTokens: string; outputTokens: string } };
export type AdminUserRosterPage = { items: AdminUserRosterItem[]; nextCursor: string | null; search: string };
export type UserRoleCommandResult = { targetUserId: string; role: ManagedUserRole; operation: UserRoleOperation; changed: boolean };

export function parseAdminUserRosterQuery(value: unknown): { cursor: string | null; search: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => key !== "cursor" && key !== "search")) return null;
  const search = query.search === undefined ? "" : typeof query.search === "string" ? query.search.trim() : null;
  const cursor = query.cursor === undefined || query.cursor === "" ? null : typeof query.cursor === "string" ? query.cursor : null;
  return search === null || search.length > adminUserRosterSearchMaxLength || cursor !== null && !parseAdminUserRosterCursor(cursor) ? null : { cursor, search };
}

export function encodeAdminUserRosterCursor(cursor: AdminUserRosterCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function parseAdminUserRosterCursor(value: unknown): AdminUserRosterCursor | null {
  if (typeof value !== "string" || value.length < 4 || value.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const cursor = parsed as Record<string, unknown>;
    return Object.keys(cursor).length === 3 && typeof cursor.id === "string" && cursor.id.length > 0 && cursor.id.length <= 128
      && (typeof cursor.name === "string" && cursor.name.length <= 512 || cursor.name === null)
      && (typeof cursor.email === "string" && cursor.email.length <= 512 || cursor.email === null)
      ? { id: cursor.id, name: cursor.name as string | null, email: cursor.email as string | null }
      : null;
  } catch { return null; }
}

export function parseUserRoleCommand(value: unknown): { targetUserId: string; role: ManagedUserRole; operation: UserRoleOperation } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  return Object.keys(input).sort().join(",") === "operation,role,targetUserId" && typeof input.targetUserId === "string" && input.targetUserId.trim().length > 0 && input.targetUserId.trim().length <= 128
    && (managedUserRoles as readonly string[]).includes(input.role as string) && (input.operation === "grant" || input.operation === "revoke")
    ? { targetUserId: input.targetUserId.trim(), role: input.role as ManagedUserRole, operation: input.operation } : null;
}

export function parseUserRoleCommandResult(value: unknown): UserRoleCommandResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (Object.keys(result).sort().join(",") !== "changed,operation,role,targetUserId" || typeof result.changed !== "boolean") return null;
  const parsed = parseUserRoleCommand({ targetUserId: result.targetUserId, role: result.role, operation: result.operation });
  return parsed ? { ...parsed, changed: result.changed } : null;
}

export function parseAdminUserRosterPage(value: unknown): AdminUserRosterPage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const page = value as Record<string, unknown>;
  if (Object.keys(page).sort().join(",") !== "items,nextCursor,search" || !Array.isArray(page.items) || page.items.length > adminUserRosterPageSize || typeof page.search !== "string" || page.search.length > adminUserRosterSearchMaxLength || page.nextCursor !== null && !parseAdminUserRosterCursor(page.nextCursor)) return null;
  const items = page.items.map((item): AdminUserRosterItem | null => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const user = item as Record<string, unknown>;
    const usage = user.usage;
    return Object.keys(user).sort().join(",") === "email,emailVerified,id,image,name,roles,usage" && typeof user.id === "string" && user.id.length > 0 && user.id.length <= 128
      && (typeof user.name === "string" && user.name.length <= 512 || user.name === null) && (typeof user.email === "string" && user.email.length <= 512 || user.email === null)
      && (typeof user.image === "string" && user.image.length <= 2_000 || user.image === null) && (typeof user.emailVerified === "string" || user.emailVerified === null)
      && Array.isArray(user.roles) && user.roles.every(isRequestRole) && usage && typeof usage === "object" && !Array.isArray(usage)
      && typeof (usage as Record<string, unknown>).aiRequestCount === "string" && typeof (usage as Record<string, unknown>).inputTokens === "string" && typeof (usage as Record<string, unknown>).outputTokens === "string"
      ? user as AdminUserRosterItem : null;
  });
  return items.some((item) => item === null) ? null : { items: items as AdminUserRosterItem[], nextCursor: page.nextCursor as string | null, search: page.search };
}

export const conversationSummaryLimit = 100;
export type ConversationSummary = { id: string; updatedAt: string; preview: string };
export type ConversationSummaryListResponse = { summaries: ConversationSummary[] };
export type TripProjectSidebarSummary = { id: string; title: string; conversationId: string; updatedAt: string };
export type TripProjectSidebarListResponse = { projects: TripProjectSidebarSummary[] };
export type TravelerShellMessage = { id: string; role: "user" | "assistant"; content: string };
export type TravelerShellProjection = {
  conversation: { id: string; tripProjectId: string | null; messages: TravelerShellMessage[] } | null;
  tripProject: { id: string; title: string; origin: string | null; destination: string | null; startDate: string | null; endDate: string | null; travelers: string | null; primaryConversationId: string | null } | null;
  workspace: TravelerWorkspaceProjection | null;
};
export type TravelerWorkspaceProjection = { focus: { kind: "pending-proposal-with-expiry" | "pending-proposal" | "confirmed-item-gap" | "next-leg" | "preparation"; proposalId?: string; itemId?: string; reason: string; sortKey: string }; timelineGroups: Array<{ dateDivider: string | null; legId: string | null; entries: Array<{ id: string; kind: "anchor" | "leg" | "activity"; anchorRole: string | null; type: string | null; state: string; stateLabel: string; typeLabel: string; label: string; plannedAt: string | null; timeContext: string | null; placeContext: string | null; notesPreview: string | null; parentItemId: string | null; ordinal: number; depth: number }> }>; constraints: { adultCount: number | null; childCount: number | null; childrenSummary: Array<{ ageRange: string | null; comfortTags: string[]; preferenceTags: string[] }>; vehicleType: "car" | "motorcycle" | "ev" | null; evChargingNeed: "none" | "preferred" | "required" | null; drivingToleranceHours: number | null; budgetCurrency: "VND" | null; budgetMinVnd: number | null; budgetMaxVnd: number | null; preferenceTags: string[]; avoidItems: Array<{ category: "place" | "activity"; label: string }> } | null; planHistory: Array<{ proposalId: string | null; operationLabel: string; actorLabel: string; timestampLabel: string; affectedItemLabels: string[]; beforeAfter: Array<{ operation: string; before: string | null; after: string | null }> }>; pendingProposals: Array<{ id: string; expiresAt: string | null; createdAt: string; rationale: string | null; status: "pending"; affectedItems: Array<{ itemId: string; kind: "anchor" | "leg" | "activity"; label: string; change: "create" | "update" | "remove" | "reorder" | "change-state" | "upsert-constraints" }>; beforeAfter: Array<{ operation: string; before: string | null; after: string | null }>; alternatives: Array<{ summary: string }>; hasAlternatives: boolean }> };
export type TravelerShellResponse = { shell: TravelerShellProjection };
export type TravelerCommandFailure = "not_found" | "invalid_input" | "invalid_target" | "invalid_rating" | "comment_too_long" | "failed";
export type CreateTripProjectCommand = { title: string; origin?: string | null; destination?: string | null; startDate?: string | null; endDate?: string | null; travelers?: string | null; notes?: string | null };
export type DeleteOwnedResourceResult = { success: true } | { success: false; reason: "not_found" | "failed" };
export type CreateTripProjectResult = { success: true; project: { id: string; title: string; origin: string | null; destination: string | null; startDate: string | null; endDate: string | null; travelers: string | null; notes: string | null; updatedAt: string } } | { success: false; reason: "invalid_input" | "failed" };
export type SaveAnswerUsefulnessFeedbackCommand = { assistantMessageId: string; rating: "useful" | "not_useful"; comment?: string | null };
export type SaveAnswerUsefulnessFeedbackResult = { success: true; feedback: { rating: "useful" | "not_useful"; comment: string | null; updatedAt: string } } | { success: false; reason: TravelerCommandFailure };
export type TripChangeProposalCommand = { tripProjectId: string; proposalId: string; requiredSourceAssistantMessageId?: string; annotationBinding?: { conversationId: string; assistantMessageId: string; annotationId: "trip-change-proposal-apply" | "trip-change-proposal-dismiss"; command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss" } };
export type ApplyTripChangeProposalResult = { success: true; aggregateVersion: number; proposalStatus: "applied" } | { success: false; reason: "not_found" | "refresh_required" | "expired" | "failed" };
export type DismissTripChangeProposalResult = { success: true; proposalStatus: "dismissed" } | { success: false; reason: "not_found" | "expired" | "failed" };
export type AnnotationProposalActionCommand = { conversationId: string; assistantMessageId: string; annotationId: "trip-change-proposal-apply" | "trip-change-proposal-dismiss"; command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss" };
export type AnnotationProposalActionResult = ApplyTripChangeProposalResult | DismissTripChangeProposalResult;
export function parseCreateTripProjectResult(value: unknown): CreateTripProjectResult | null { if (!isRecord(value)) return null; if (value.success === false && (value.reason === "invalid_input" || value.reason === "failed") && hasExactKeys(value, ["success", "reason"])) return value as CreateTripProjectResult; if (!isRecord(value.project) || value.success !== true || !hasExactKeys(value, ["success", "project"])) return null; const project = value.project; return typeof project.id === "string" && typeof project.title === "string" && ["origin", "destination", "startDate", "endDate", "travelers", "notes"].every((key) => typeof project[key] === "string" || project[key] === null) && typeof project.updatedAt === "string" ? value as CreateTripProjectResult : null; }
export function parseDeleteOwnedResourceResult(value: unknown): DeleteOwnedResourceResult | null { if (!isRecord(value)) return null; if (value.success === true && hasExactKeys(value, ["success"])) return value as DeleteOwnedResourceResult; return value.success === false && (value.reason === "not_found" || value.reason === "failed") && hasExactKeys(value, ["success", "reason"]) ? value as DeleteOwnedResourceResult : null; }
export function parseSaveAnswerUsefulnessFeedbackResult(value: unknown): SaveAnswerUsefulnessFeedbackResult | null { return isRecord(value) && value.success === false && ["not_found", "invalid_input", "invalid_target", "invalid_rating", "comment_too_long", "failed"].includes(value.reason as string) && hasExactKeys(value, ["success", "reason"]) ? value as SaveAnswerUsefulnessFeedbackResult : isRecord(value) && value.success === true && isRecord(value.feedback) && hasExactKeys(value, ["success", "feedback"]) && (value.feedback.rating === "useful" || value.feedback.rating === "not_useful") && (typeof value.feedback.comment === "string" || value.feedback.comment === null) && typeof value.feedback.updatedAt === "string" ? value as SaveAnswerUsefulnessFeedbackResult : null; }
export function parseApplyTripChangeProposalResult(value: unknown): ApplyTripChangeProposalResult | null { return isRecord(value) && value.success === true && value.proposalStatus === "applied" && Number.isInteger(value.aggregateVersion) && (value.aggregateVersion as number) >= 1 && hasExactKeys(value, ["success", "aggregateVersion", "proposalStatus"]) ? value as ApplyTripChangeProposalResult : isRecord(value) && value.success === false && ["not_found", "refresh_required", "expired", "failed"].includes(value.reason as string) && hasExactKeys(value, ["success", "reason"]) ? value as ApplyTripChangeProposalResult : null; }
export function parseDismissTripChangeProposalResult(value: unknown): DismissTripChangeProposalResult | null { return isRecord(value) && value.success === true && value.proposalStatus === "dismissed" && hasExactKeys(value, ["success", "proposalStatus"]) ? value as DismissTripChangeProposalResult : isRecord(value) && value.success === false && ["not_found", "expired", "failed"].includes(value.reason as string) && hasExactKeys(value, ["success", "reason"]) ? value as DismissTripChangeProposalResult : null; }
export function parseAnnotationProposalActionResult(value: unknown): AnnotationProposalActionResult | null { return parseApplyTripChangeProposalResult(value) ?? parseDismissTripChangeProposalResult(value); }
export function parseCreateTripProjectCommand(value: unknown): CreateTripProjectCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Object.keys(input).every((key) => ["title", "origin", "destination", "startDate", "endDate", "travelers", "notes"].includes(key)) || typeof input.title !== "string") return null;
  const optional = ["origin", "destination", "startDate", "endDate", "travelers", "notes"] as const;
  if (optional.some((key) => input[key] !== undefined && input[key] !== null && typeof input[key] !== "string")) return null;
  return { title: input.title, ...Object.fromEntries(optional.filter((key) => input[key] !== undefined).map((key) => [key, input[key] as string | null])) };
}

export function parseSaveAnswerUsefulnessFeedbackCommand(value: unknown): SaveAnswerUsefulnessFeedbackCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  return Object.keys(input).every((key) => ["assistantMessageId", "rating", "comment"].includes(key)) && typeof input.assistantMessageId === "string" && input.assistantMessageId.trim().length > 0 && input.assistantMessageId.length <= 128 && (input.rating === "useful" || input.rating === "not_useful") && (input.comment === undefined || input.comment === null || typeof input.comment === "string")
    ? { assistantMessageId: input.assistantMessageId, rating: input.rating, ...(input.comment === undefined ? {} : { comment: input.comment }) } : null;
}

export function parseTripChangeProposalCommand(value: unknown): TripChangeProposalCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Object.keys(input).every((key) => ["tripProjectId", "proposalId", "requiredSourceAssistantMessageId", "annotationBinding"].includes(key)) || !identifier(input.tripProjectId) || !identifier(input.proposalId) || input.requiredSourceAssistantMessageId !== undefined && !identifier(input.requiredSourceAssistantMessageId)) return null;
  if (input.annotationBinding === undefined) return { tripProjectId: input.tripProjectId, proposalId: input.proposalId, ...(input.requiredSourceAssistantMessageId === undefined ? {} : { requiredSourceAssistantMessageId: input.requiredSourceAssistantMessageId }) };
  const binding = input.annotationBinding;
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return null;
  const item = binding as Record<string, unknown>;
  if (!isAnnotationProposalActionCommand(item)) return null;
  return { tripProjectId: input.tripProjectId, proposalId: input.proposalId, ...(input.requiredSourceAssistantMessageId === undefined ? {} : { requiredSourceAssistantMessageId: input.requiredSourceAssistantMessageId }), annotationBinding: item as TripChangeProposalCommand["annotationBinding"] };
}

export function parseAnnotationProposalActionCommand(value: unknown): AnnotationProposalActionCommand | null { return isAnnotationProposalActionCommand(value) ? value : null; }
function isAnnotationProposalActionCommand(value: unknown): value is AnnotationProposalActionCommand { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const item = value as Record<string, unknown>; return Object.keys(item).sort().join(",") === "annotationId,assistantMessageId,command,conversationId" && identifier(item.conversationId) && identifier(item.assistantMessageId) && (item.annotationId === "trip-change-proposal-apply" && item.command === "trip_change_proposal.apply" || item.annotationId === "trip-change-proposal-dismiss" && item.command === "trip_change_proposal.dismiss"); }

function identifier(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 128; }

export type ApiVersionResponse = { version: "v1"; conversationSummaryLimit: number };
export type HealthResponse = { status: "ok" };

export function correlationId(value?: string | null): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : crypto.randomUUID();
}

export type OperationalTelemetryEvent = {
  correlationId: string;
  capability: string;
  principalClass: "user" | "system" | "anonymous";
  resultCode: string;
  latencyMs: number;
  durableId?: string;
  jobLagMs?: number;
  retryCount?: number;
  leaseRecovery?: "none" | "recovered" | "contended";
  leaseRecoveryCount?: number;
  providerRequestId?: string;
};
export type OperationalTelemetrySink = { emit(event: OperationalTelemetryEvent): void | Promise<void> };

export type WorkerPollObservation = {
  capability: "knowledge.extraction" | "knowledge.ingestion" | "knowledge.indexing" | "knowledge.sampling" | "ai_ask.outbox";
  resultCode: "success" | "no_work" | "retry" | "failure" | "contended";
  durableId?: string;
  jobLagMs?: number;
  retryCount?: number;
  leaseRecovery?: "none" | "recovered" | "contended";
  leaseRecoveryCount?: number;
};

const telemetryCapabilities = new Set(["ai_ask.stream", "ai_ask.provider", "knowledge.extraction", "knowledge.ingestion", "knowledge.indexing", "knowledge.sampling", "ai_ask.outbox", "worker.startup", "worker.schema", "worker.drain", "worker.restart"]);
const telemetryResultCodes = new Set(["success", "failure", "no_work", "retry", "draining", "restarted", "recovered", "contended"]);

export function emitOperationalTelemetry(sink: OperationalTelemetrySink | undefined, event: OperationalTelemetryEvent): void {
  try {
    const normalized = normalizeOperationalTelemetryEvent(event);
    if (!sink || !normalized) return;
    Promise.resolve(sink.emit(normalized)).catch(() => undefined);
  } catch { /* Telemetry must not change the operation result. */ }
}

export function isOperationalTelemetryEvent(event: unknown): event is OperationalTelemetryEvent {
  try { return normalizeOperationalTelemetryEvent(event) !== null; } catch { return false; }
}

function normalizeOperationalTelemetryEvent(event: unknown): OperationalTelemetryEvent | null {
  if (!event || typeof event !== "object") return null;
  const descriptors = Object.getOwnPropertyDescriptors(event);
  const allowedKeys = new Set(["correlationId", "capability", "principalClass", "resultCode", "latencyMs", "durableId", "jobLagMs", "retryCount", "leaseRecovery", "leaseRecoveryCount", "providerRequestId"]);
  if (!Object.keys(descriptors).every((key) => allowedKeys.has(key))) return null;
  const values = Object.assign(Object.create(null), ...Object.entries(descriptors).map(([key, descriptor]) => ({ [key]: "value" in descriptor ? descriptor.value : undefined })));
  const candidateCorrelationId = values.correlationId;
  const capability = values.capability;
  const principalClass = values.principalClass;
  const resultCode = values.resultCode;
  const latencyMs = values.latencyMs;
  const durableId = values.durableId;
  const jobLagMs = values.jobLagMs;
  const retryCount = values.retryCount;
  const leaseRecovery = values.leaseRecovery;
  const leaseRecoveryCount = values.leaseRecoveryCount;
  const providerRequestId = values.providerRequestId;
  const userCapability = capability === "ai_ask.stream" || capability === "ai_ask.provider";
  const valid = Object.values(descriptors).every((descriptor) => "value" in descriptor)
    && isTelemetryText(candidateCorrelationId)
    && typeof capability === "string" && telemetryCapabilities.has(capability)
    && typeof resultCode === "string" && telemetryResultCodes.has(resultCode)
    && (principalClass === "user" ? userCapability : principalClass === "system" && !userCapability)
    && Number.isInteger(latencyMs) && latencyMs >= 0 && latencyMs <= 86_400_000
    && (durableId === undefined || isTelemetryText(durableId))
    && (jobLagMs === undefined || Number.isInteger(jobLagMs) && jobLagMs >= 0 && jobLagMs <= 31_536_000_000)
    && (retryCount === undefined || Number.isInteger(retryCount) && retryCount >= 0 && retryCount <= 10_000)
    && (leaseRecovery === undefined || ["none", "recovered", "contended"].includes(leaseRecovery))
    && (leaseRecoveryCount === undefined || Number.isInteger(leaseRecoveryCount) && leaseRecoveryCount >= 0 && leaseRecoveryCount <= 10_000)
    && (leaseRecoveryCount === undefined || leaseRecovery === "recovered")
    && (providerRequestId === undefined || isTelemetryText(providerRequestId));
  if (!valid) return null;
  // Do not pass caller-owned objects to a sink. A prototype toJSON or later
  // mutation must not influence the bounded object that is serialized.
  return Object.assign(Object.create(null), { correlationId: candidateCorrelationId, capability, principalClass, resultCode, latencyMs },
    durableId === undefined ? {} : { durableId }, jobLagMs === undefined ? {} : { jobLagMs }, retryCount === undefined ? {} : { retryCount },
    leaseRecovery === undefined ? {} : { leaseRecovery }, leaseRecoveryCount === undefined ? {} : { leaseRecoveryCount }, providerRequestId === undefined ? {} : { providerRequestId },
  ) as OperationalTelemetryEvent;
}

function isTelemetryText(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

let consoleTelemetryBlocked = false;
// stdout reports async write failures as stream errors even when a write
// callback receives the error. Console telemetry is strictly best-effort.
const telemetryStdout = typeof process !== "undefined" ? process.stdout : undefined;
telemetryStdout?.on("error", () => process.emitWarning("Operational telemetry stdout is unavailable."));

export const consoleOperationalTelemetrySink: OperationalTelemetrySink = {
  emit(event) {
    let normalized: OperationalTelemetryEvent | null;
    try { normalized = normalizeOperationalTelemetryEvent(event); } catch { return; }
    if (!normalized) return;
    // Never queue telemetry behind a blocked stdout consumer. Dropping these
    // best-effort events preserves the domain operation and bounds memory use.
    if (consoleTelemetryBlocked) return;
    try {
      if (!telemetryStdout || !telemetryStdout.write(`operational_telemetry ${JSON.stringify(normalized)}\n`, () => undefined)) {
        consoleTelemetryBlocked = true;
        telemetryStdout?.once("drain", () => { consoleTelemetryBlocked = false; });
      }
    } catch { /* Telemetry must not change the operation result. */ }
  },
};

function hasExactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value); }

export const planningContextPlanItemLimit = 60;
export const planningDetailProvenanceLimit = 100;
export const planningDetailAnnotationLimit = 20;
export const planningDetailQuickFactLimit = 6;
export type PlanningJsonValue = null | boolean | number | string | PlanningJsonValue[] | { [key: string]: PlanningJsonValue };
export type PlanningSourceCategory = "knowledge" | "web" | "trip_context" | "chat_context" | "general";
export type PlanningAnnotationType = "source" | "warning" | "trip_fact" | "action" | "place" | "hotel_area" | "route_segment" | "cost";
export type PlanningProvenance =
  | { id: string; rank: number; availability: "withdrawn"; unavailableLabel: "Nguồn này không còn khả dụng."; usedInPrompt: boolean; citedInAnswer: boolean }
  | { id: string; rank: number; availability: "available"; sourceCategory: PlanningSourceCategory; title: string; sourceType: string | null; url: string | null; checkedAt: string | null; confidenceLabel: string; verificationStatus: "verified" | "unverified"; usedInPrompt: boolean; citedInAnswer: boolean; retrievalScore: number | null; freshnessSensitive: boolean };
export type PlanningAnnotation = {
  id: string;
  start: number;
  end: number;
  text: string;
  type: PlanningAnnotationType;
  detail: {
    type: PlanningAnnotationType;
    label: string;
    section?: string;
    summary?: string;
    sourceCategory?: PlanningSourceCategory;
    owner?: { table: "assistant_response_provenance"; id: string };
    detail?: Record<string, string>;
    quickFacts?: Array<{ label: string; value: string }>;
    provenanceIds?: string[];
    action?: { command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss"; label: string; arguments: Record<string, never>; anchor: "trip-change-proposal-action.v1" };
    capability?: { command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss"; label: string; available: true };
  };
};
export type PlanningContextResponse = { context: TripAnswerContextResponse | null };
export type TripAnswerContextResponse = {
  version: 1; hasProjectScope: boolean; tripProjectId: string | null; aggregateVersion: number | null; primaryConversationId: string | null;
  anchors: Array<{ field: string; value: string; source: "conversation" | "trip_project" }>;
  planItems: Array<{ id: string; version: number; kind: string; anchorRole: string | null; type: string | null; state: string; label: string; ordinal: number; parentItemId: string | null }>;
  constraints: { version: number; values: Record<string, PlanningJsonValue> } | null;
  currentConversationFacts: Array<{ field: string; value: string; source: "conversation" | "trip_project" }>;
  conflicts: Array<{ field: string; canonicalValue: string; lowerPriorityValue: string; source: string; priority: "lower"; material: true }>;
};
export type PlanningAnswerDetailResponse = { detail: { conversationId: string; assistantMessageId: string; content: string; provenance: PlanningProvenance[]; annotations: PlanningAnnotation[] } | null };

export const aiAskMaxQuestionLength = 2_000;
export const aiAskMaxImageByteSize = 5 * 1024 * 1024;
export const aiAskMaxMultipartBodySize = 6 * 1024 * 1024;
export const aiAskAcceptedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type AiAskImageMimeType = (typeof aiAskAcceptedImageTypes)[number];

// This is deliberately the existing browser protocol. Correlation is a header,
// so adding a request identifier here would change the legacy NDJSON bytes.
export type AiAskStreamEvent =
  | { type: "preparing" }
  | { type: "delta"; content: string }
  | { type: "in_progress"; conversationId?: string; userMessage?: { id: string; content: string } }
  | { type: "done"; conversationId: string; userMessage: { id: string; content: string }; assistantMessage: { id: string; content: string; provenance?: unknown[] } }
  | { type: "error"; code?: "refresh_required"; conversationId?: string; userMessage?: { id: string; content: string }; errorMessage: string };

export type AiAskStreamInput = {
  question: string;
  conversationId?: string;
  tripProjectId?: string;
  idempotencyKey: string;
  image?: { fileName: string | null; mimeType: AiAskImageMimeType; byteSize: number; bytes: Uint8Array };
};

export function parseAiAskIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null;
}

export type TripCreationRecommendation = { kind: "none" } | { kind: "clarify"; question: string; actions: ["private_answer"] } | { kind: "offer"; decisionId: string; actions: ["save_trip", "private_answer"] };
export type TripContextRecommendation = { kind: "none" } | { kind: "clarify"; question: string; actions: ["private_answer"] } | { kind: "single"; decisionId: string; tripProjectId: string; title: string; actions: ["continue_in_trip", "private_answer"] } | { kind: "multiple"; decisionId: string; actions: ["private_answer"] };
export type TripRecommendationResponse = { tripCreationRecommendation: TripCreationRecommendation; tripContextRecommendation: TripContextRecommendation };
export type RecommendationDecisionCommand = { decisionId: string };
export type ContinueInTripCommand = { decisionId: string; tripProjectId: string };
export type AcceptTripCreationRecommendationCommand = { decisionId: string; idempotencyKey: string };
export type RecommendationActionResult = { success: true } | { success: false; reason: "not_found" | "refresh_required" | "failed" };
export type ContinueInTripResult = { success: true; destination: { tripProjectId: string; conversationId: string } } | { success: false; reason: "not_found" | "refresh_required" | "failed" };
export type AcceptTripCreationRecommendationResult = { success: true; destination: { tripProjectId: string; conversationId: string } } | { success: false; reason: "not_found" | "refresh_required" | "key_reused" | "failed" };

export function parseRecommendationDecisionCommand(value: unknown): RecommendationDecisionCommand | null { return hasOnlyKeys(value, ["decisionId"]) && isIdentifier(value.decisionId) ? { decisionId: value.decisionId } : null; }
export function parseContinueInTripCommand(value: unknown): ContinueInTripCommand | null { return hasOnlyKeys(value, ["decisionId", "tripProjectId"]) && isIdentifier(value.decisionId) && isIdentifier(value.tripProjectId) ? { decisionId: value.decisionId, tripProjectId: value.tripProjectId } : null; }
export function parseAcceptTripCreationRecommendationCommand(value: unknown): AcceptTripCreationRecommendationCommand | null { if (!hasOnlyKeys(value, ["decisionId", "idempotencyKey"]) || !isIdentifier(value.decisionId)) return null; const idempotencyKey = parseAiAskIdempotencyKey(value.idempotencyKey); return idempotencyKey ? { decisionId: value.decisionId, idempotencyKey } : null; }
export function parseTripRecommendationResponse(value: unknown): TripRecommendationResponse | null {
  if (!hasOnlyKeys(value, ["tripCreationRecommendation", "tripContextRecommendation"])) return null;
  const creation = value.tripCreationRecommendation;
  const context = value.tripContextRecommendation;
  const question = (item: unknown) => typeof item === "string" && item.length > 0 && item.length <= 240;
  const creationValid = hasOnlyKeys(creation, ["kind"]) && creation.kind === "none"
    || hasOnlyKeys(creation, ["kind", "question", "actions"]) && creation.kind === "clarify" && question(creation.question) && Array.isArray(creation.actions) && creation.actions.length === 1 && creation.actions[0] === "private_answer"
    || hasOnlyKeys(creation, ["kind", "decisionId", "actions"]) && creation.kind === "offer" && isIdentifier(creation.decisionId) && Array.isArray(creation.actions) && creation.actions.length === 2 && creation.actions[0] === "save_trip" && creation.actions[1] === "private_answer";
  const contextValid = hasOnlyKeys(context, ["kind"]) && context.kind === "none"
    || hasOnlyKeys(context, ["kind", "question", "actions"]) && context.kind === "clarify" && question(context.question) && Array.isArray(context.actions) && context.actions.length === 1 && context.actions[0] === "private_answer"
    || hasOnlyKeys(context, ["kind", "decisionId", "tripProjectId", "title", "actions"]) && context.kind === "single" && isIdentifier(context.decisionId) && isIdentifier(context.tripProjectId) && question(context.title) && Array.isArray(context.actions) && context.actions.length === 2 && context.actions[0] === "continue_in_trip" && context.actions[1] === "private_answer"
    || hasOnlyKeys(context, ["kind", "decisionId", "actions"]) && context.kind === "multiple" && isIdentifier(context.decisionId) && Array.isArray(context.actions) && context.actions.length === 1 && context.actions[0] === "private_answer";
  return creationValid && contextValid ? value as TripRecommendationResponse : null;
}
export function parseRecommendationActionResult(value: unknown): RecommendationActionResult | null { return hasOnlyKeys(value, ["success"]) && value.success === true ? { success: true } : hasOnlyKeys(value, ["success", "reason"]) && value.success === false && (value.reason === "not_found" || value.reason === "refresh_required" || value.reason === "failed") ? value as RecommendationActionResult : null; }
export function parseContinueInTripResult(value: unknown): ContinueInTripResult | null { return hasOnlyKeys(value, ["success", "destination"]) && value.success === true && hasOnlyKeys(value.destination, ["tripProjectId", "conversationId"]) && isIdentifier(value.destination.tripProjectId) && isIdentifier(value.destination.conversationId) ? value as ContinueInTripResult : hasOnlyKeys(value, ["success", "reason"]) && value.success === false && (value.reason === "not_found" || value.reason === "refresh_required" || value.reason === "failed") ? value as ContinueInTripResult : null; }
export function parseAcceptTripCreationRecommendationResult(value: unknown): AcceptTripCreationRecommendationResult | null { return hasOnlyKeys(value, ["success", "destination"]) && value.success === true && hasOnlyKeys(value.destination, ["tripProjectId", "conversationId"]) && isIdentifier(value.destination.tripProjectId) && isIdentifier(value.destination.conversationId) ? value as AcceptTripCreationRecommendationResult : hasOnlyKeys(value, ["success", "reason"]) && value.success === false && (value.reason === "not_found" || value.reason === "refresh_required" || value.reason === "key_reused" || value.reason === "failed") ? value as AcceptTripCreationRecommendationResult : null; }

export function parseAiAskStreamInput(value: {
  question: unknown;
  conversationId?: unknown;
  tripProjectId?: unknown;
  idempotencyKey: unknown;
  image?: { fileName: unknown; mimeType: unknown; byteSize: unknown; bytes: unknown } | undefined;
}): AiAskStreamInput | null {
  const question = typeof value.question === "string" ? value.question.trim() : "";
  const conversationId = optionalIdentifier(value.conversationId);
  const tripProjectId = optionalIdentifier(value.tripProjectId);
  const idempotencyKey = parseAiAskIdempotencyKey(value.idempotencyKey);
  if (!question || question.length > aiAskMaxQuestionLength || !idempotencyKey || (value.conversationId !== undefined && !conversationId) || (value.tripProjectId !== undefined && !tripProjectId)) return null;
  if (!value.image) return { question, ...(conversationId ? { conversationId } : {}), ...(tripProjectId ? { tripProjectId } : {}), idempotencyKey };
  const { fileName, mimeType, byteSize, bytes } = value.image;
  if (typeof fileName !== "string" && fileName !== null || !isAiAskImageMimeType(mimeType) || !Number.isInteger(byteSize) || typeof byteSize !== "number" || byteSize <= 0 || byteSize > aiAskMaxImageByteSize || !(bytes instanceof Uint8Array) || bytes.byteLength !== byteSize || !hasAiAskImageSignature(bytes, mimeType)) return null;
  const boundedName = fileName?.replace(/[\u0000-\u001f\u007f\\/]+/g, " ").trim().slice(0, 120) || null;
  return { question, ...(conversationId ? { conversationId } : {}), ...(tripProjectId ? { tripProjectId } : {}), idempotencyKey, image: { fileName: boundedName, mimeType, byteSize, bytes } };
}

export function isAiAskImageMimeType(value: unknown): value is AiAskImageMimeType {
  return typeof value === "string" && (aiAskAcceptedImageTypes as readonly string[]).includes(value);
}

export function hasAiAskImageSignature(bytes: Uint8Array, mimeType: AiAskImageMimeType): boolean {
  if (mimeType === "image/png") {
    return bytes.byteLength >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/jpeg") {
    return bytes.byteLength >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && (bytes[3] === 0xe0 || bytes[3] === 0xe1);
  }
  return bytes.byteLength >= 12
    && new TextDecoder("ascii").decode(bytes.subarray(0, 4)) === "RIFF"
    && new TextDecoder("ascii").decode(bytes.subarray(8, 12)) === "WEBP";
}

function optionalIdentifier(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" && value.length <= 128 && value.trim() === value ? value : null;
}

export function parseConversationSummaryListResponse(value: unknown): ConversationSummaryListResponse | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { summaries?: unknown }).summaries)) return null;
  const summaries = (value as { summaries: unknown[] }).summaries;
  if (summaries.length > conversationSummaryLimit || !summaries.every(isConversationSummary)) return null;
  return { summaries: summaries as ConversationSummary[] };
}

export function parseTripProjectSidebarListResponse(value: unknown): TripProjectSidebarListResponse | null {
  if (!hasOnlyKeys(value, ["projects"]) || !Array.isArray(value.projects) || value.projects.length > conversationSummaryLimit) return null;
  const projects = value.projects;
  if (!projects.every((project) => hasOnlyKeys(project, ["id", "title", "conversationId", "updatedAt"])
    && isIdentifier(project.id) && isBoundedString(project.title, 160) && isIdentifier(project.conversationId) && typeof project.updatedAt === "string" && isUtcIsoTimestamp(project.updatedAt))) return null;
  if (new Set(projects.map((project) => project.id)).size !== projects.length) return null;
  return { projects: projects as TripProjectSidebarSummary[] };
}

export function parseTravelerShellResponse(value: unknown): TravelerShellResponse | null {
  if (!hasOnlyKeys(value, ["shell"]) || !hasOnlyKeys(value.shell, ["conversation", "tripProject", "workspace"])) return null;
  const shell = value.shell;
  const conversation = shell.conversation;
  const tripProject = shell.tripProject;
  const workspace = shell.workspace;
  if (conversation !== null && (!hasOnlyKeys(conversation, ["id", "tripProjectId", "messages"]) || !isIdentifier(conversation.id) || !isNullableIdentifier(conversation.tripProjectId) || !Array.isArray(conversation.messages) || conversation.messages.length > 200 || !conversation.messages.every((message) => hasOnlyKeys(message, ["id", "role", "content"]) && isIdentifier(message.id) && (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.length <= 20_000))) return null;
  if (tripProject !== null && (!hasOnlyKeys(tripProject, ["id", "title", "origin", "destination", "startDate", "endDate", "travelers", "primaryConversationId"]) || !isIdentifier(tripProject.id) || !isBoundedString(tripProject.title, 200) || ![tripProject.origin, tripProject.destination, tripProject.startDate, tripProject.endDate, tripProject.travelers].every((item) => item === null || typeof item === "string" && item.length <= 500) || !isNullableIdentifier(tripProject.primaryConversationId))) return null;
  if (workspace !== null && !isTravelerWorkspace(workspace)) return null;
  return { shell: { conversation: conversation as TravelerShellProjection["conversation"], tripProject: tripProject as TravelerShellProjection["tripProject"], workspace: workspace as TravelerShellProjection["workspace"] } };
}

export function parsePlanningContextResponse(value: unknown): PlanningContextResponse | null {
  if (!hasOnlyKeys(value, ["context"])) return null;
  if (value.context === null) return { context: null };
  const context = value.context;
  if (!hasOnlyKeys(context, ["version", "hasProjectScope", "tripProjectId", "aggregateVersion", "primaryConversationId", "anchors", "planItems", "constraints", "currentConversationFacts", "conflicts"]) || context.version !== 1 || typeof context.hasProjectScope !== "boolean" || !isNullableIdentifier(context.tripProjectId) || !isNullableInteger(context.aggregateVersion) || !isNullableIdentifier(context.primaryConversationId)) return null;
  const anchors = parseFactList(context.anchors, planningContextPlanItemLimit);
  const planItems = parsePlanItemList(context.planItems);
  const constraints = parseConstraints(context.constraints);
  const currentConversationFacts = parseFactList(context.currentConversationFacts, 18);
  const conflicts = parseConflictList(context.conflicts);
  if (!anchors || !planItems || constraints === undefined || !currentConversationFacts || !conflicts) return null;
  return { context: { version: 1, hasProjectScope: context.hasProjectScope, tripProjectId: context.tripProjectId, aggregateVersion: context.aggregateVersion, primaryConversationId: context.primaryConversationId, anchors, planItems, constraints, currentConversationFacts, conflicts } };
}

export function parsePlanningAnswerDetailResponse(value: unknown): PlanningAnswerDetailResponse | null {
  if (!hasOnlyKeys(value, ["detail"])) return null;
  if (value.detail === null) return { detail: null };
  const detail = value.detail;
  if (!hasOnlyKeys(detail, ["conversationId", "assistantMessageId", "content", "provenance", "annotations"]) || !isIdentifier(detail.conversationId) || !isIdentifier(detail.assistantMessageId) || typeof detail.content !== "string" || detail.content.length > 20_000) return null;
  const provenance = parsePlanningProvenance(detail.provenance);
  if (!provenance) return null;
  const annotations = parsePlanningAnnotations(detail.annotations, detail.content, new Set(provenance.filter((item): item is Extract<PlanningProvenance, { availability: "available" }> => item.availability === "available").map((item) => item.id)));
  if (!annotations) return null;
  return { detail: { conversationId: detail.conversationId, assistantMessageId: detail.assistantMessageId, content: detail.content, provenance, annotations } };
}

function isConversationSummary(value: unknown): value is ConversationSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.id === "string" && summary.id.length > 0 && summary.id.length <= 128
    && typeof summary.updatedAt === "string" && isUtcIsoTimestamp(summary.updatedAt)
    && typeof summary.preview === "string" && summary.preview.length <= 61;
}

function isTravelerWorkspace(value: unknown): value is TravelerWorkspaceProjection { return hasOnlyKeys(value, ["focus", "timelineGroups", "constraints", "planHistory", "pendingProposals"]) && isWorkspaceFocus(value.focus) && Array.isArray(value.timelineGroups) && value.timelineGroups.length <= 60 && value.timelineGroups.every(isTimelineGroup) && (value.constraints === null || isWorkspaceConstraints(value.constraints)) && Array.isArray(value.planHistory) && value.planHistory.length <= 20 && value.planHistory.every(isHistoryEntry) && Array.isArray(value.pendingProposals) && value.pendingProposals.length <= 20 && value.pendingProposals.every(isPendingProposal); }
function isWorkspaceFocus(value: unknown) { if (!isRecord(value) || !isBoundedString(value.reason, 500) || !isBoundedString(value.sortKey, 500)) return false; if (value.kind === "preparation") return hasOnlyKeys(value, ["kind", "reason", "sortKey"]); if (value.kind === "pending-proposal" || value.kind === "pending-proposal-with-expiry") return hasOnlyKeys(value, ["kind", "proposalId", "reason", "sortKey"]) && isIdentifier(value.proposalId); return (value.kind === "confirmed-item-gap" || value.kind === "next-leg") && hasOnlyKeys(value, ["kind", "itemId", "reason", "sortKey"]) && isIdentifier(value.itemId); }
function isTimelineGroup(value: unknown) { return hasOnlyKeys(value, ["dateDivider", "legId", "entries"]) && (value.dateDivider === null || typeof value.dateDivider === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.dateDivider)) && isNullableIdentifier(value.legId) && Array.isArray(value.entries) && value.entries.length <= 60 && value.entries.every(isTimelineEntry); }
function isTimelineEntry(value: unknown) { return hasOnlyKeys(value, ["id", "kind", "anchorRole", "type", "state", "stateLabel", "typeLabel", "label", "plannedAt", "timeContext", "placeContext", "notesPreview", "parentItemId", "ordinal", "depth"]) && isIdentifier(value.id) && isOneOf(value.kind, ["anchor", "leg", "activity"]) && isNullableOneOf(value.anchorRole, ["origin", "destination", "region", "required_stop", "accommodation"]) && isNullableOneOf(value.type, ["transport", "visit", "food", "rest", "accommodation"]) && isOneOf(value.state, ["idea", "planned", "confirmed", "backup"]) && isBoundedString(value.stateLabel, 160) && isBoundedString(value.typeLabel, 160) && isBoundedString(value.label, 160) && isNullableUtcTimestamp(value.plannedAt) && isNullableBoundedString(value.timeContext, 160) && isNullableBoundedString(value.placeContext, 500) && isNullableBoundedString(value.notesPreview, 80) && isNullableIdentifier(value.parentItemId) && isNonnegativeInteger(value.ordinal) && isNonnegativeInteger(value.depth) && value.depth <= 1; }
function isWorkspaceConstraints(value: unknown) { return hasOnlyKeys(value, ["adultCount", "childCount", "childrenSummary", "vehicleType", "evChargingNeed", "drivingToleranceHours", "budgetCurrency", "budgetMinVnd", "budgetMaxVnd", "preferenceTags", "avoidItems"]) && isNullableIntegerInRange(value.adultCount, 20) && isNullableIntegerInRange(value.childCount, 20) && (value.adultCount !== null || value.childCount !== null) && (value.adultCount ?? 0) + (value.childCount ?? 0) >= 1 && (value.adultCount ?? 0) + (value.childCount ?? 0) <= 20 && Array.isArray(value.childrenSummary) && value.childrenSummary.length <= 10 && value.childrenSummary.every((child) => hasOnlyKeys(child, ["ageRange", "comfortTags", "preferenceTags"]) && isNullableBoundedString(child.ageRange, 32) && isBoundedStringArray(child.comfortTags, 6, 160) && isBoundedStringArray(child.preferenceTags, 6, 160)) && isNullableOneOf(value.vehicleType, ["car", "motorcycle", "ev"]) && isNullableOneOf(value.evChargingNeed, ["none", "preferred", "required"]) && (value.evChargingNeed === null || value.vehicleType === "ev") && isNullableIntegerInRange(value.drivingToleranceHours, 12) && (value.budgetCurrency === null || value.budgetCurrency === "VND") && isNullableIntegerInRange(value.budgetMinVnd, 1_000_000_000) && isNullableIntegerInRange(value.budgetMaxVnd, 1_000_000_000) && (value.budgetCurrency === null ? value.budgetMinVnd === null && value.budgetMaxVnd === null : value.budgetMinVnd !== null && value.budgetMaxVnd !== null && value.budgetMinVnd <= value.budgetMaxVnd) && isBoundedStringArray(value.preferenceTags, 20, 160) && Array.isArray(value.avoidItems) && value.avoidItems.length <= 20 && value.avoidItems.every((item) => hasOnlyKeys(item, ["category", "label"]) && (item.category === "place" || item.category === "activity") && isBoundedString(item.label, 120)); }
function isHistoryEntry(value: unknown) { return hasOnlyKeys(value, ["proposalId", "operationLabel", "actorLabel", "timestampLabel", "affectedItemLabels", "beforeAfter"]) && isNullableIdentifier(value.proposalId) && isBoundedString(value.operationLabel, 160) && isBoundedString(value.actorLabel, 160) && isBoundedString(value.timestampLabel, 160) && isBoundedStringArray(value.affectedItemLabels, 20, 160) && isBeforeAfterList(value.beforeAfter); }
function isPendingProposal(value: unknown) { return hasOnlyKeys(value, ["id", "expiresAt", "createdAt", "rationale", "status", "affectedItems", "beforeAfter", "alternatives", "hasAlternatives"]) && isIdentifier(value.id) && isNullableUtcTimestamp(value.expiresAt) && typeof value.createdAt === "string" && isUtcIsoTimestamp(value.createdAt) && isNullableBoundedString(value.rationale, 500) && value.status === "pending" && Array.isArray(value.affectedItems) && value.affectedItems.length <= 20 && value.affectedItems.every(isPendingProposalAffectedItem) && isBeforeAfterList(value.beforeAfter) && Array.isArray(value.alternatives) && value.alternatives.length <= 5 && value.alternatives.every((item) => hasOnlyKeys(item, ["summary"]) && isBoundedString(item.summary, 280)) && typeof value.hasAlternatives === "boolean"; }
function isPendingProposalAffectedItem(value: unknown) { return hasOnlyKeys(value, ["itemId", "kind", "label", "change"]) && isOneOf(value.kind, ["anchor", "leg", "activity"]) && isBoundedString(value.label, 160) && isOneOf(value.change, ["create", "update", "remove", "reorder", "change-state", "upsert-constraints"]) && (value.change === "create" ? isIdentifier(value.itemId) || value.itemId === "(mới)" : isIdentifier(value.itemId) && value.itemId !== "(mới)"); }
function isBeforeAfterList(value: unknown) { return Array.isArray(value) && value.length <= 20 && value.every((item) => hasOnlyKeys(item, ["operation", "before", "after"]) && isBoundedString(item.operation, 500) && isNullableBoundedString(item.before, 1_000) && isNullableBoundedString(item.after, 1_000)); }
function isBoundedStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] { return Array.isArray(value) && value.length <= maxItems && value.every((item) => isBoundedString(item, maxLength)); }

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> { return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function isIdentifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value; }
function isNullableIdentifier(value: unknown): value is string | null { return value === null || isIdentifier(value); }
function isNullableInteger(value: unknown): value is number | null { return value === null || typeof value === "number" && Number.isInteger(value) && value >= 0; }
function isNullableIntegerInRange(value: unknown, maximum: number): value is number | null { return value === null || typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum; }
function isBoundedString(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value; }
function parseFactList(value: unknown, limit: number): TripAnswerContextResponse["anchors"] | null { return Array.isArray(value) && value.length <= limit && value.every((item) => hasOnlyKeys(item, ["field", "value", "source"]) && isBoundedString(item.field, 128) && isBoundedString(item.value, 500) && (item.source === "conversation" || item.source === "trip_project")) ? value.map((item) => ({ field: item.field as string, value: item.value as string, source: item.source as "conversation" | "trip_project" })) : null; }
function parsePlanItemList(value: unknown): TripAnswerContextResponse["planItems"] | null { return Array.isArray(value) && value.length <= planningContextPlanItemLimit && value.every((item) => hasOnlyKeys(item, ["id", "version", "kind", "anchorRole", "type", "state", "label", "ordinal", "parentItemId"]) && isIdentifier(item.id) && isPositiveInteger(item.version) && isOneOf(item.kind, ["anchor", "leg", "activity"]) && isNullableOneOf(item.anchorRole, ["origin", "destination", "region", "required_stop", "accommodation"]) && isNullableOneOf(item.type, ["transport", "visit", "food", "rest", "accommodation"]) && isOneOf(item.state, ["idea", "planned", "confirmed", "backup"]) && isBoundedString(item.label, 160) && isNonnegativeInteger(item.ordinal) && isNullableIdentifier(item.parentItemId)) ? value as TripAnswerContextResponse["planItems"] : null; }
function parseConstraints(value: unknown): TripAnswerContextResponse["constraints"] | undefined { if (value === null) return null; if (!hasOnlyKeys(value, ["version", "values"]) || !isPositiveInteger(value.version) || !isPlanningJsonObject(value.values, 0)) return undefined; return { version: value.version, values: value.values }; }
function parseConflictList(value: unknown): TripAnswerContextResponse["conflicts"] | null { return Array.isArray(value) && value.length <= 32 && value.every((item) => hasOnlyKeys(item, ["field", "canonicalValue", "lowerPriorityValue", "source", "priority", "material"]) && isBoundedString(item.field, 128) && isBoundedString(item.canonicalValue, 500) && isBoundedString(item.lowerPriorityValue, 500) && isOneOf(item.source, ["legacy_project", "project_chat", "conversation_chat"]) && item.priority === "lower" && item.material === true) ? value as TripAnswerContextResponse["conflicts"] : null; }
function parsePlanningProvenance(value: unknown): PlanningProvenance[] | null {
  if (!Array.isArray(value) || value.length > planningDetailProvenanceLimit || !value.every(isPlanningProvenance)) return null;
  const provenance = value as PlanningProvenance[];
  return new Set(provenance.map((item) => item.id)).size === provenance.length && provenance.every((item, index) => index === 0 || provenance[index - 1]!.rank < item.rank) ? provenance : null;
}
function isPlanningProvenance(value: unknown): value is PlanningProvenance { if (!isRecord(value) || !isIdentifier(value.id) || !isPositiveInteger(value.rank) || typeof value.usedInPrompt !== "boolean" || typeof value.citedInAnswer !== "boolean") return false; if (value.availability === "withdrawn") return hasOnlyKeys(value, ["id", "rank", "availability", "unavailableLabel", "usedInPrompt", "citedInAnswer"]) && value.unavailableLabel === "Nguồn này không còn khả dụng."; return hasOnlyKeys(value, ["id", "rank", "availability", "sourceCategory", "title", "sourceType", "url", "checkedAt", "confidenceLabel", "verificationStatus", "usedInPrompt", "citedInAnswer", "retrievalScore", "freshnessSensitive"]) && value.availability === "available" && isSourceCategory(value.sourceCategory) && isBoundedString(value.title, 500) && isNullableBoundedString(value.sourceType, 160) && isNullableUrl(value.url) && isNullableUtcTimestamp(value.checkedAt) && isBoundedString(value.confidenceLabel, 160) && (value.verificationStatus === "verified" || value.verificationStatus === "unverified") && (value.retrievalScore === null || typeof value.retrievalScore === "number" && Number.isFinite(value.retrievalScore)) && typeof value.freshnessSensitive === "boolean"; }
function parsePlanningAnnotations(value: unknown, content: string, availableProvenanceIds: Set<string>): PlanningAnnotation[] | null {
  if (!Array.isArray(value) || value.length > planningDetailAnnotationLimit || !value.every((item) => isPlanningAnnotation(item, content, availableProvenanceIds))) return null;
  const annotations = value as PlanningAnnotation[];
  return new Set(annotations.map((item) => item.id)).size === annotations.length && annotations.every((item, index) => index === 0 || annotations[index - 1]!.end <= item.start) ? annotations : null;
}
function isPlanningAnnotation(value: unknown, content: string, availableProvenanceIds: Set<string>): value is PlanningAnnotation { return hasOnlyKeys(value, ["id", "start", "end", "text", "type", "detail"]) && isIdentifier(value.id) && isNonnegativeInteger(value.start) && isPositiveInteger(value.end) && value.end > value.start && value.end <= content.length && content.slice(value.start, value.end) === value.text && isBoundedString(value.text, 2_000) && isAnnotationType(value.type) && isPlanningAnnotationDetail(value.detail, value.type, value.text, availableProvenanceIds, value.id); }
function isPlanningAnnotationDetail(value: unknown, type: PlanningAnnotationType, text: string, availableProvenanceIds: Set<string>, annotationId: string): boolean { if (!isRecord(value) || !isAnnotationType(value.type) || value.type !== type || value.label !== text || Object.keys(value).some((key) => !["type", "label", "section", "summary", "sourceCategory", "owner", "detail", "quickFacts", "provenanceIds", "action", "capability"].includes(key)) || !isBoundedString(value.label, 2_000) || (value.section !== undefined && !isBoundedString(value.section, 160)) || (value.summary !== undefined && !isBoundedString(value.summary, 500)) || (value.sourceCategory !== undefined && !isSourceCategory(value.sourceCategory)) || (value.owner !== undefined && (!hasOnlyKeys(value.owner, ["table", "id"]) || value.owner.table !== "assistant_response_provenance" || !isIdentifier(value.owner.id))) || (value.detail !== undefined && !isSafeDetail(value.detail)) || (value.quickFacts !== undefined && !isQuickFacts(value.quickFacts)) || (value.provenanceIds !== undefined && !isProvenanceIds(value.provenanceIds))) return false; const provenanceIds = Array.isArray(value.provenanceIds) ? value.provenanceIds as string[] : undefined; const ownerId = isRecord(value.owner) && typeof value.owner.id === "string" ? value.owner.id : undefined; if (provenanceIds && !provenanceIds.every((id) => availableProvenanceIds.has(id))) return false; if (type !== "warning" && type !== "trip_fact" && type !== "action" && (!provenanceIds || provenanceIds.length === 0)) return false; if (ownerId !== undefined && (!provenanceIds || !provenanceIds.includes(ownerId))) return false; if ((value.action !== undefined || value.capability !== undefined) && type !== "action") return false; if (value.action !== undefined && (!isAction(value.action, text) || !isExpectedAction(annotationId, value.action))) return false; if (value.capability !== undefined && (!isCapability(value.capability, text) || !isExpectedAction(annotationId, value.capability))) return false; return value.capability === undefined || value.action !== undefined && sameActionCommand(value.capability, value.action); }
function isSafeDetail(value: unknown): boolean { return isRecord(value) && Object.keys(value).length <= planningDetailQuickFactLimit && Object.entries(value).every(([key, item]) => ["Loại", "Độ tin cậy", "Trạng thái", "URL", "Ngày kiểm tra", "Độ mới", "Nhãn nguồn"].includes(key) && isBoundedString(item, 160)); }
function isQuickFacts(value: unknown): boolean { return Array.isArray(value) && value.length <= planningDetailQuickFactLimit && value.every((item) => hasOnlyKeys(item, ["label", "value"]) && isBoundedString(item.label, 160) && isBoundedString(item.value, 160)); }
function isProvenanceIds(value: unknown): boolean { return Array.isArray(value) && value.length <= planningDetailQuickFactLimit && value.every(isIdentifier) && new Set(value).size === value.length; }
function isAction(value: unknown, text: string): boolean { return hasOnlyKeys(value, ["command", "label", "arguments", "anchor"]) && isActionCommand(value.command) && value.label === text && hasOnlyKeys(value.arguments, []) && value.anchor === "trip-change-proposal-action.v1"; }
function isCapability(value: unknown, text: string): boolean { return hasOnlyKeys(value, ["command", "label", "available"]) && isActionCommand(value.command) && value.label === text && value.available === true; }
function sameActionCommand(capability: unknown, action: unknown): boolean { return isRecord(capability) && isRecord(action) && capability.command === action.command; }
function isExpectedAction(annotationId: string, action: unknown): boolean { return isRecord(action) && (annotationId === "trip-change-proposal-apply" && action.command === "trip_change_proposal.apply" || annotationId === "trip-change-proposal-dismiss" && action.command === "trip_change_proposal.dismiss"); }
function isActionCommand(value: unknown): boolean { return value === "trip_change_proposal.apply" || value === "trip_change_proposal.dismiss"; }
function isSourceCategory(value: unknown): value is PlanningSourceCategory { return isOneOf(value, ["knowledge", "web", "trip_context", "chat_context", "general"]); }
function isAnnotationType(value: unknown): value is PlanningAnnotationType { return isOneOf(value, ["source", "warning", "trip_fact", "action", "place", "hotel_area", "route_segment", "cost"]); }
function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T { return typeof value === "string" && choices.includes(value as T); }
function isNullableOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T | null { return value === null || isOneOf(value, choices); }
function isPositiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 1; }
function isNonnegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function isNullableBoundedString(value: unknown, maximum: number): boolean { return value === null || isBoundedString(value, maximum); }
function isNullableUrl(value: unknown): boolean { if (value === null) return true; if (!isBoundedString(value, 2_000)) return false; try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; } }
function isNullableUtcTimestamp(value: unknown): boolean { return value === null || typeof value === "string" && isUtcIsoTimestamp(value); }
function isPlanningJsonObject(value: unknown, depth: number): value is Record<string, PlanningJsonValue> { return isRecord(value) && Object.keys(value).length <= 24 && Object.entries(value).every(([key, item]) => isBoundedString(key, 128) && isPlanningJsonValue(item, depth + 1)); }
function isPlanningJsonValue(value: unknown, depth: number): value is PlanningJsonValue { if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 500) return true; if (depth > 4) return false; return Array.isArray(value) ? value.length <= 12 && value.every((item) => isPlanningJsonValue(item, depth + 1)) : isPlanningJsonObject(value, depth); }

function isUtcIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}


export function isRequestRole(value: unknown): value is RequestRole {
  return typeof value === "string" && (requestRoles as readonly string[]).includes(value);
}

export function parseSafeApiError(value: unknown): SafeApiError | null {
  if (!value || typeof value !== "object") return null;
  const error = value as Record<string, unknown>;
  if (!isSafeApiErrorCode(error.code) || typeof error.message !== "string" || !isRequestId(error.requestId)) return null;
  if (error.violations === undefined) return { code: error.code, message: error.message, requestId: error.requestId };
  if (!Array.isArray(error.violations) || error.violations.length > 20 || !error.violations.every(isSafeFieldViolation)) return null;
  return { code: error.code, message: error.message, requestId: error.requestId, violations: error.violations };
}

function isSafeApiErrorCode(value: unknown): value is SafeApiErrorCode {
  return typeof value === "string" && (safeApiErrorCodes as readonly string[]).includes(value);
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isSafeFieldViolation(value: unknown): value is SafeFieldViolation {
  if (!value || typeof value !== "object") return false;
  const violation = value as Record<string, unknown>;
  return typeof violation.field === "string" && violation.field.length > 0 && violation.field.length <= 128
    && typeof violation.code === "string" && violation.code.length > 0 && violation.code.length <= 64
    && typeof violation.message === "string" && violation.message.length > 0 && violation.message.length <= 256;
}
