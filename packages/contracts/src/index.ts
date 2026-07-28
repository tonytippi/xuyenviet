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
