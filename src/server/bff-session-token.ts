import "server-only";

import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";

import { getDb } from "@/db/client";
import { sessions } from "@/db/schema";

// This is explicitly configured in Auth.js so the BFF never guesses a cookie name.
export const bffSessionCookieName = "xuyenviet.session-token";

export async function resolveBffSessionToken(userId: string): Promise<string | null> {
  const token = (await cookies()).get(bffSessionCookieName)?.value;
  return resolveBffSessionTokenValue(userId, token);
}

export async function resolveBffSessionTokenValue(userId: string, token: string | undefined): Promise<string | null> {
  if (!token) {
    return null;
  }

  const session = await getDb()
    .select({ sessionToken: sessions.sessionToken })
    .from(sessions)
    .where(and(eq(sessions.sessionToken, token), eq(sessions.userId, userId), gt(sessions.expires, new Date())))
    .limit(1);

  return session[0]?.sessionToken ?? null;
}
