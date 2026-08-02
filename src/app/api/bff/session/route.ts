import { NextResponse } from "next/server";

import { getAuthenticatedSession } from "@/server/auth";
import { BffCredentialError, mintWebBffCredential } from "@/server/bff-credentials";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    // The credential is consumed only by server-side BFF-to-API calls.
    await mintWebBffCredential();
    return NextResponse.json({ authenticated: true, user: { id: session.userId } });
  } catch (error) {
    if (error instanceof BffCredentialError) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    throw error;
  }
}
