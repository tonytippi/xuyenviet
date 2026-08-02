import { NextRequest, NextResponse } from "next/server";

import { adminSessionCookie, adminTransactionCookieName, clearAdminTransactionCookie } from "../../../../server/cookies";
import { completeOAuthCallback } from "../../../../server/identity";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.origin !== process.env.XV_ADMIN_BFF_ORIGIN) return NextResponse.redirect(new URL("/sign-in", url));
  const sessionId = await completeOAuthCallback(url.searchParams.get("code"), url.searchParams.get("state"), request.cookies.get(adminTransactionCookieName)?.value ?? null);
  if (!sessionId) {
    const response = NextResponse.json({ code: "unauthorized", message: "Google account does not have an operator or admin role." }, { status: 401 });
    response.cookies.set(clearAdminTransactionCookie());
    return response;
  }
  const response = NextResponse.redirect(new URL("/", url));
  response.cookies.set(clearAdminTransactionCookie());
  response.cookies.set(adminSessionCookie(sessionId));
  return response;
}
