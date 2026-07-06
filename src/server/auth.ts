import "server-only";

export type AuthenticatedSession = {
  userId: string;
  email: string;
};

export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  return null;
}
