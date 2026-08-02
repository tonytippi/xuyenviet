import { NextRequest, NextResponse } from "next/server";

import { adminBffResponse, readAdminUsers } from "../../../server/users";

export async function GET(request: NextRequest) {
  const value = (name: string): string | string[] | undefined => {
    const values = request.nextUrl.searchParams.getAll(name);
    return values.length === 0 ? undefined : values.length === 1 ? values[0] : values;
  };
  const result = await readAdminUsers(request, value("search"), value("cursor"));
  const response = adminBffResponse(result);
  return NextResponse.json(response.body, { status: response.status, headers: { "x-request-id": response.requestId } });
}
