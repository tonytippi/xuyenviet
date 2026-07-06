import "server-only";

import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { userRoles, type UserRole } from "@/db/schema";

export type AuthenticatedSession = {
  userId: string;
  email: string;
};

export type AuthenticatedSessionWithRoles = AuthenticatedSession & {
  roles: UserRole[];
};

export class AdminAuthorizationError extends Error {
  constructor() {
    super("Admin access is required.");
    this.name = "AdminAuthorizationError";
  }
}

export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const email = session?.user?.email;

    if (!userId || !email) {
      return null;
    }

    return { userId, email };
  } catch {
    return null;
  }
}

export async function getUserRoles(userId: string): Promise<UserRole[]> {
  const rows = await getDb().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));

  return rows.map((row) => row.role);
}

export function hasAdminAccess(roles: UserRole[]) {
  return roles.includes("admin") || roles.includes("operator");
}

export async function getAuthenticatedSessionWithRoles(): Promise<AuthenticatedSessionWithRoles | null> {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  return {
    ...session,
    roles: await getUserRoles(session.userId),
  };
}

export async function requireAdminSession(): Promise<AuthenticatedSessionWithRoles> {
  const session = await getAuthenticatedSessionWithRoles();

  if (!session || !hasAdminAccess(session.roles)) {
    throw new AdminAuthorizationError();
  }

  return session;
}
