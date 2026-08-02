import { NextRequest, NextResponse } from "next/server";

import { adminBffResponse, mutateAdminUserRole } from "../../../../../server/users";

export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const body: unknown = await request.json().catch(() => null);
  const role = body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 1 && Object.prototype.hasOwnProperty.call(body, "role")
    ? (body as { role: unknown }).role
    : null;
  const result = await mutateAdminUserRole(request, (await params).userId, role, "grant");
  const response = adminBffResponse(result);
  return NextResponse.json(response.body, { status: response.status, headers: { "x-request-id": response.requestId } });
}
