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
export type SafeApiError = {
  code: string;
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
