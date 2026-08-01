import { NextRequest, NextResponse } from "next/server";

import { adminSessionCookie, clearAdminTransactionCookie } from "../../../../server/cookies";
import { completeOAuthCallback } from "../../../../server/identity";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.origin !== process.env.XV_ADMIN_BFF_ORIGIN) return NextResponse.redirect(new URL("/sign-in", url));
  const sessionId = await completeOAuthCallback(url.searchParams.get("code"), url.searchParams.get("state"), request.cookies.get("__Host-xuyenviet-admin-oauth")?.value ?? null);
  const response = NextResponse.redirect(new URL(sessionId ? "/" : "/sign-in", url));
  response.cookies.set(clearAdminTransactionCookie());
  if (sessionId) response.cookies.set(adminSessionCookie(sessionId));
  return response;
}
