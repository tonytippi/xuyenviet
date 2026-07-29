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

function isConversationSummary(value: unknown): value is ConversationSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.id === "string" && summary.id.length > 0 && summary.id.length <= 128
    && typeof summary.updatedAt === "string" && isUtcIsoTimestamp(summary.updatedAt)
    && typeof summary.preview === "string" && summary.preview.length <= 61;
}

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
