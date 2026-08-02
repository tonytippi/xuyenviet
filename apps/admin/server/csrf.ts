import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { BffCsrfConfig } from "@xuyenviet/config";

import { adminCsrfCookieName } from "./cookies";

export const adminCsrfHeaderName = "X-XuyenViet-Admin-CSRF";
const maxTokenLength = 87;

export function issueAdminCsrfToken(config: Pick<BffCsrfConfig, "csrfSigningSecret" | "csrfLifetimeSeconds">, now = Date.now()): string {
  const payload = `${Math.floor(now / 1000)}.${randomBytes(24).toString("base64url")}`;
  return `${payload}.${signature(payload, config.csrfSigningSecret)}`;
}

export function validateAdminCsrfRequest(request: { headers: Headers; cookies: { get(name: string): { value: string } | undefined } }, config: BffCsrfConfig, now = Date.now()): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== config.bffOrigin || (fetchSite !== "same-origin" && fetchSite !== "same-site")) return false;
  const cookie = request.cookies.get(adminCsrfCookieName)?.value;
  const header = request.headers.get(adminCsrfHeaderName);
  if (!cookie || !header || cookie.length > maxTokenLength || header.length > maxTokenLength || !equal(cookie, header)) return false;
  const [issuedAt, nonce, receivedSignature, ...extra] = cookie.split(".");
  if (extra.length || !/^[0-9]{1,10}$/.test(issuedAt ?? "") || !/^[A-Za-z0-9_-]{32}$/.test(nonce ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(receivedSignature ?? "")) return false;
  const issued = Number(issuedAt);
  if (issued > Math.floor(now / 1000) || issued + config.csrfLifetimeSeconds <= Math.floor(now / 1000)) return false;
  return equal(receivedSignature!, signature(`${issuedAt}.${nonce}`, config.csrfSigningSecret));
}

function signature(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }
function equal(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
