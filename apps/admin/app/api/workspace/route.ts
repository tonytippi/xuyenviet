import { NextResponse } from "next/server";

import { executeAdminBffRead } from "../../../server/bff-adapter";

// Bounded bootstrap proof for the new BFF; it returns no operator or domain data.
export async function GET(request: Request) {
  const result = await executeAdminBffRead({
    request: { headers: request.headers }, capability: "admin.workspace.read", path: "/v1/admin/workspace",
    parseResult: (value) => value && typeof value === "object" && (value as { ready?: unknown }).ready === true ? { ready: true } : null,
  });
  if (!result.ok) return NextResponse.json({ code: result.error.code }, { status: result.error.code === "unauthorized" ? 401 : result.error.code === "forbidden" ? 403 : 503, headers: { "x-request-id": result.error.requestId } });
  return NextResponse.json(result.value, { headers: { "x-request-id": result.requestId } });
}
