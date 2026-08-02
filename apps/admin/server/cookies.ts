import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

const localTransport = process.env.APP_ENV === "local" && process.env.XV_ADMIN_LOCAL_TRANSPORT === "true";
export const adminSessionCookieName = localTransport ? "xv-local-admin-session" : "__Host-xuyenviet-admin-session";
export const adminTransactionCookieName = localTransport ? "xv-local-admin-oauth" : "__Host-xuyenviet-admin-oauth";
export const adminCsrfCookieName = localTransport ? "xv-local-admin-csrf" : "__Host-xuyenviet-admin-csrf";

const hostOnly = { httpOnly: true, secure: !localTransport, sameSite: "strict" as const, path: "/" };
export function adminSessionCookie(value: string): ResponseCookie { return { name: adminSessionCookieName, value, ...hostOnly, maxAge: 60 * 60 * 8 }; }
// Google redirects are cross-site top-level navigations, so the transaction must be Lax.
export function adminTransactionCookie(value: string): ResponseCookie { return { name: adminTransactionCookieName, value, httpOnly: true, secure: !localTransport, sameSite: "lax", path: "/", maxAge: 10 * 60 }; }
export function clearAdminSessionCookie(): ResponseCookie { return { name: adminSessionCookieName, value: "", ...hostOnly, maxAge: 0 }; }
export function clearAdminTransactionCookie(): ResponseCookie { return { name: adminTransactionCookieName, value: "", ...hostOnly, maxAge: 0 }; }
export function adminCsrfCookie(value: string, maxAge: number): ResponseCookie { return { name: adminCsrfCookieName, value, secure: !localTransport, sameSite: "strict", path: "/", maxAge }; }
