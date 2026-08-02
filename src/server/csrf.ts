import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { BffTransportConfig } from "@xuyenviet/config";

type CsrfRequest = { headers: Headers; cookies: { get(name: string): { value: string } | undefined } };
export const csrfCookieName = "xv_bff_csrf";
export const csrfHeaderName = "X-XuyenViet-CSRF";
const maxCsrfTokenLength = 87;

export type IssuedCsrfToken = {
  token: string;
  cookie: {
    name: typeof csrfCookieName;
    value: string;
    secure: true;
    sameSite: "strict";
    path: "/";
    maxAge: number;
  };
};

export function issueCsrfToken(config: Pick<BffTransportConfig, "csrfSigningSecret" | "csrfLifetimeSeconds">, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000).toString();
  const nonce = randomBytes(24).toString("base64url");
  const payload = `${issuedAt}.${nonce}`;
  return `${payload}.${signature(payload, config.csrfSigningSecret)}`;
}

export function issueCsrfTokenWithCookie(config: Pick<BffTransportConfig, "csrfSigningSecret" | "csrfLifetimeSeconds">, now = Date.now()): IssuedCsrfToken {
  const token = issueCsrfToken(config, now);
  return {
    token,
    // Omitting Domain makes this a host-only cookie.
    cookie: { name: csrfCookieName, value: token, secure: true, sameSite: "strict", path: "/", maxAge: config.csrfLifetimeSeconds },
  };
}

export function validateCsrfRequest(request: CsrfRequest, config: Pick<BffTransportConfig, "bffOrigin" | "csrfSigningSecret" | "csrfLifetimeSeconds">, now = Date.now()): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== config.bffOrigin || (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "same-site")) return false;
  const cookie = request.cookies.get(csrfCookieName)?.value;
  const header = request.headers.get(csrfHeaderName);
  if (!cookie || !header || cookie.length > maxCsrfTokenLength || header.length > maxCsrfTokenLength || !equal(cookie, header)) return false;
  const [issuedAt, nonce, receivedSignature, ...extra] = cookie.split(".");
  if (extra.length || !/^[0-9]{1,10}$/.test(issuedAt ?? "") || !/^[A-Za-z0-9_-]{32}$/.test(nonce ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(receivedSignature ?? "")) return false;
  const issued = Number(issuedAt);
  if (issued > Math.floor(now / 1000) || issued + config.csrfLifetimeSeconds <= Math.floor(now / 1000)) return false;
  return equal(receivedSignature!, signature(`${issuedAt}.${nonce}`, config.csrfSigningSecret));
}

function signature(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }
function equal(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
