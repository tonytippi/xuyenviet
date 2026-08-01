import { NextResponse } from "next/server";

import { getAdminBffConfig } from "@xuyenviet/config";

import { adminTransactionCookie } from "../../server/cookies";
import { beginOAuth } from "../../server/identity";

// The API Identity boundary owns Google state, PKCE, and provider exchange.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  if (origin !== requiredOrigin()) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  const oauth = await beginOAuth(`${origin}/api/auth/callback`);
  if (!oauth) return NextResponse.json({ code: "internal_error" }, { status: 503 });
  const redirect = NextResponse.redirect(oauth.redirectUrl);
  redirect.cookies.set(adminTransactionCookie(oauth.transactionId));
  return redirect;
}

function requiredOrigin() { return getAdminBffConfig().transport.bffOrigin; }
