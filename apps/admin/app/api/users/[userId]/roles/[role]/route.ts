import { NextRequest, NextResponse } from "next/server";

import { adminBffResponse, mutateAdminUserRole } from "../../../../../../server/users";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ userId: string; role: string }> }) {
  const { userId, role } = await params;
  const result = await mutateAdminUserRole(request, userId, role, "revoke");
  const response = adminBffResponse(result);
  return NextResponse.json(response.body, { status: response.status, headers: { "x-request-id": response.requestId } });
}
