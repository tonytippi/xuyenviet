import { NextResponse } from "next/server";

import { clearAdminSessionCookie } from "../../../../server/cookies";
import { getAdminBffConfig } from "@xuyenviet/config";
import { validateAdminCsrfRequest } from "../../../../server/csrf";
import { logout } from "../../../../server/identity";

export async function POST(request: Request) {
  const cookies = { get: (name: string) => request.headers.get("cookie")?.split(/;\s*/).map((item) => item.split("=", 2)).find(([key]) => key === name)?.[1] ? { value: request.headers.get("cookie")!.split(/;\s*/).map((item) => item.split("=", 2)).find(([key]) => key === name)![1]! } : undefined };
  if (!validateAdminCsrfRequest({ headers: request.headers, cookies }, getAdminBffConfig().transport)) return NextResponse.json({ code: "csrf_invalid" }, { status: 403 });
  if (!await logout()) return NextResponse.json({ code: "internal_error" }, { status: 503 });
  const response = NextResponse.json({ ok: true }); response.cookies.set(clearAdminSessionCookie()); return response;
}
