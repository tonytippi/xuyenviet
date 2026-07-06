import "server-only";

import { auth } from "@/auth";

export type AuthenticatedSession = {
  userId: string;
  email: string;
};

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
