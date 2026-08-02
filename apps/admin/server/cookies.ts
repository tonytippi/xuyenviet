import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export const adminSessionCookieName = "__Host-xuyenviet-admin-session";
export const adminTransactionCookieName = "__Host-xuyenviet-admin-oauth";
export const adminCsrfCookieName = "__Host-xuyenviet-admin-csrf";

const hostOnly = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/" };
export function adminSessionCookie(value: string): ResponseCookie { return { name: adminSessionCookieName, value, ...hostOnly, maxAge: 60 * 60 * 8 }; }
// Google redirects are cross-site top-level navigations, so the transaction must be Lax.
export function adminTransactionCookie(value: string): ResponseCookie { return { name: adminTransactionCookieName, value, httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 60 }; }
export function clearAdminSessionCookie(): ResponseCookie { return { name: adminSessionCookieName, value: "", ...hostOnly, maxAge: 0 }; }
export function clearAdminTransactionCookie(): ResponseCookie { return { name: adminTransactionCookieName, value: "", ...hostOnly, maxAge: 0 }; }
export function adminCsrfCookie(value: string, maxAge: number): ResponseCookie { return { name: adminCsrfCookieName, value, secure: true, sameSite: "strict", path: "/", maxAge }; }
