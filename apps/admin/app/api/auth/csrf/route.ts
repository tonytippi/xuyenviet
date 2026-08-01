import { NextResponse } from "next/server";

import { getAdminBffConfig } from "@xuyenviet/config";

import { adminCsrfCookie } from "../../../../server/cookies";
import { issueAdminCsrfToken } from "../../../../server/csrf";

// This exposes only a signed anti-CSRF nonce, never session or identity data.
export async function GET() {
  const config = getAdminBffConfig();
  const token = issueAdminCsrfToken(config.transport);
  const response = NextResponse.json({ token });
  response.cookies.set(adminCsrfCookie(token, config.transport.csrfLifetimeSeconds));
  return response;
}
