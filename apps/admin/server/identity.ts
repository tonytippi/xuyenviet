import "server-only";

import { cookies } from "next/headers";
import { SignJWT, importJWK } from "jose";

import { apiAudience, futureAdminSchemaCompatibilityConsumer, permitsAdminCapability, type AdminIdentityHandoff, type AdminIdentityHandoffResponse, type AdminReadinessResponse, type RequestRole } from "@xuyenviet/contracts";
import { getAdminBffConfig } from "@xuyenviet/config";

import { adminSessionCookieName } from "./cookies";

export async function requireOperator(): Promise<AdminIdentityHandoff | null> {
  const sessionId = (await cookies()).get(adminSessionCookieName)?.value;
  return sessionId ? resolveHandoff(sessionId) : null;
}

export async function mintAdminCredential(capability = "admin.workspace.read"): Promise<string> {
  const identity = await requireOperator();
  if (!identity) throw new AdminAuthorizationDeniedError("unauthorized");
  if (!permitsAdminCapability(identity.roles, capability as "admin.workspace.read" | "admin.role.governance" | "admin.ai-model-catalog.write")) throw new AdminAuthorizationDeniedError("forbidden");
  const config = getAdminBffConfig();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: identity.sessionId, roles: [...identity.roles].sort(), rv: identity.authorizationVersion, jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: "ES256", kid: config.signing.active.kid }).setSubject(identity.subject).setIssuer("xuyenviet-admin-bff").setAudience(apiAudience)
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + config.signing.maxLifetimeSeconds).sign(await importJWK(config.signing.active.privateKey, "ES256"));
}

export async function completeOAuthCallback(code: string | null, state: string | null, transactionId: string | null): Promise<string | null> {
  if (!code || !state || !transactionId) return null;
  const response = await serviceRequest("/internal/admin-identity/oauth/callback", { code, state, transactionId });
  if (!response.ok) return null;
  const value: unknown = await response.json().catch(() => null);
  return value && typeof value === "object" && validSessionId((value as { sessionId?: unknown }).sessionId) ? (value as { sessionId: string }).sessionId : null;
}

export async function beginOAuth(callbackUrl: string): Promise<{ redirectUrl: string; transactionId: string } | null> {
  try {
    const response = await serviceRequest("/internal/admin-identity/oauth/start", { callbackUrl });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok || !value || typeof value !== "object") return null;
    const result = value as { redirectUrl?: unknown; transactionId?: unknown };
    return typeof result.redirectUrl === "string" && validSessionId(result.transactionId) ? { redirectUrl: result.redirectUrl, transactionId: result.transactionId } : null;
  } catch (error) {
    if (error instanceof AdminAuthorizationDeniedError) throw error;
    return null;
  }
}

export async function logout(): Promise<boolean> {
  const sessionId = (await cookies()).get(adminSessionCookieName)?.value;
  if (!sessionId) return true;
  const identity = await resolveHandoff(sessionId);
  if (!identity || identity.sessionId !== sessionId) return false;
  try { return (await serviceRequest("/internal/admin-identity/revoke", { sessionId, subject: identity.subject })).ok; } catch { return false; }
}

export async function adminReady(): Promise<boolean> {
  try { const response = await serviceRequest("/internal/admin-identity/readiness", { declaration: futureAdminSchemaCompatibilityConsumer.declaration }); const value = await response.json() as AdminReadinessResponse; return response.ok && value?.ready === true; } catch { return false; }
}

async function resolveHandoff(sessionId: string): Promise<AdminIdentityHandoff | null> {
  try {
    const response = await serviceRequest("/internal/admin-identity/handoff", { sessionId });
    if (response.status === 401) throw new AdminAuthorizationDeniedError("unauthorized");
    if (response.status === 403) throw new AdminAuthorizationDeniedError("forbidden");
    if (!response.ok) throw new Error("Admin identity handoff is unavailable.");
    const value = await response.json() as AdminIdentityHandoffResponse;
    if (!validIdentity(value?.identity)) throw new AdminAuthorizationDeniedError("unauthorized");
    return value.identity;
  } catch { return null; }
}
export class AdminAuthorizationDeniedError extends Error {
  constructor(readonly code: "unauthorized" | "forbidden") { super("Admin access denied."); }
}
export async function serviceRequest(path: string, body: unknown): Promise<Response> {
  const config = getAdminBffConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.transport.requestTimeoutMs);
  try {
    return await fetch(new URL(path, config.handoffUrl), { method: "POST", headers: { authorization: `Bearer ${config.handoffServiceToken}`, "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: controller.signal });
  } finally { clearTimeout(timeout); }
}
function validSessionId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 256; }
function validIdentity(value: unknown): value is AdminIdentityHandoff {
  if (!value || typeof value !== "object") return false;
  const identity = value as AdminIdentityHandoff;
  return validSessionId(identity.subject) && validSessionId(identity.sessionId)
    && Number.isInteger(identity.authorizationVersion) && identity.authorizationVersion >= 1
    && Array.isArray(identity.roles) && identity.roles.length > 0 && identity.roles.every((role): role is RequestRole => ["traveler", "operator", "admin"].includes(role))
    && identity.roles.some((role) => role === "operator" || role === "admin")
    && identity.roles.every((role, index) => index === 0 || identity.roles[index - 1]! < role);
}
