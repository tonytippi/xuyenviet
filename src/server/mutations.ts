import "server-only";

import { getAuthenticatedSession } from "./auth";

type ServerMutationOptions<TResult> = {
  action: (session: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSession>>>) => Promise<TResult>;
};

export async function runAuthenticatedMutation<TResult>({ action }: ServerMutationOptions<TResult>): Promise<TResult> {
  const session = await getAuthenticatedSession();

  if (!session) {
    throw new Error("Authentication required for this server mutation.");
  }

  return action(session);
}
