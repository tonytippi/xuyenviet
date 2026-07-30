export const bffIssuers = ["xuyenviet-web-bff", "xuyenviet-admin-bff"] as const;
export type BffIssuer = (typeof bffIssuers)[number];

export const apiAudience = "api.railway.internal" as const;
export const requestRoles = ["traveler", "operator", "admin"] as const;
export type RequestRole = (typeof requestRoles)[number];

export type InternalCredentialClaims = {
  sub: string;
  sid: string;
  roles: RequestRole[];
  rv: number;
  jti: string;
  iss: BffIssuer;
  aud: typeof apiAudience;
  iat: number;
  nbf: number;
  exp: number;
};

export type RequestPrincipal = {
  userId: string;
  sessionId: string;
  roles: RequestRole[];
  authorizationVersion: number;
  issuer: BffIssuer;
  tokenId: string;
};

export type SafeFieldViolation = { field: string; code: string; message: string };
export const safeApiErrorCodes = ["unauthorized", "forbidden", "validation_error", "csrf_invalid", "request_timeout", "internal_error"] as const;
export type SafeApiErrorCode = (typeof safeApiErrorCodes)[number];
export type SafeApiError = {
  code: SafeApiErrorCode;
  message: string;
  requestId: string;
  violations?: SafeFieldViolation[];
};

export const conversationSummaryLimit = 100;
export type ConversationSummary = { id: string; updatedAt: string; preview: string };
export type ConversationSummaryListResponse = { summaries: ConversationSummary[] };
export type ApiVersionResponse = { version: "v1"; conversationSummaryLimit: number };
export type HealthResponse = { status: "ok" };

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

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> { return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function isIdentifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value; }
function isNullableIdentifier(value: unknown): value is string | null { return value === null || isIdentifier(value); }
function isNullableInteger(value: unknown): value is number | null { return value === null || typeof value === "number" && Number.isInteger(value) && value >= 0; }
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

export function isBffIssuer(value: unknown): value is BffIssuer {
  return typeof value === "string" && (bffIssuers as readonly string[]).includes(value);
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
