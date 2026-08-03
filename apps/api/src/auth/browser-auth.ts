import { createHmac } from "node:crypto";

import type { BrowserAuthConfig } from "@xuyenviet/config";

export const BROWSER_AUTH_CONFIG = Symbol("BROWSER_AUTH_CONFIG");
export type BrowserAuthConfigProvider = { config?: BrowserAuthConfig };
export function csrfNonce(config: BrowserAuthConfig, sessionId: string) { return createHmac("sha256", config.csrfKey).update(`nonce.${sessionId}`).digest("base64url"); }
export function csrfHash(config: BrowserAuthConfig, sessionId: string, csrfToken: string) { return createHmac("sha256", config.csrfKey).update(`${sessionId}.${csrfToken}`).digest("base64url"); }
export function cookieValue(cookie: string | undefined, name: string): string | null { const item = cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`)); const value = item?.slice(name.length + 1); return value && /^[A-Za-z0-9_-]{32,256}$/.test(value) ? value : null; }
