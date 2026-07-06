import "server-only";

import { getDb } from "@/db/client";
import { recordAuditEvent, type AuditEventInput } from "@/features/audit/events";

import { getAuthenticatedSession, requireAdminSession, type AuthenticatedSession } from "./auth";

type MutationTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

type ServerMutationOptions<TResult> = {
  action: (session: AuthenticatedSession) => Promise<TResult>;
};

type AuditMetadata = Omit<AuditEventInput, "actor">;

type AuditedServerMutationOptions<TResult> = {
  action: (session: AuthenticatedSession, transaction: MutationTransaction) => Promise<TResult>;
  audit: AuditMetadata;
};

export async function runAuthenticatedMutation<TResult>({ action }: ServerMutationOptions<TResult>): Promise<TResult> {
  const session = await getAuthenticatedSession();

  if (!session) {
    throw new Error("Authentication required for this server mutation.");
  }

  return action(session);
}

export async function runAuditedAuthenticatedMutation<TResult>({
  action,
  audit,
}: AuditedServerMutationOptions<TResult>): Promise<TResult> {
  const session = await getAuthenticatedSession();

  if (!session) {
    throw new Error("Authentication required for this server mutation.");
  }

  return getDb().transaction(async (transaction) => {
    const result = await action(session, transaction);
    await recordAuditEvent({ actor: session, ...audit }, transaction);

    return result;
  });
}

export async function runAuditedAdminMutation<TResult>({
  action,
  audit,
}: AuditedServerMutationOptions<TResult>): Promise<TResult> {
  const session = await requireAdminSession();

  return getDb().transaction(async (transaction) => {
    const result = await action(session, transaction);
    await recordAuditEvent({ actor: session, ...audit }, transaction);

    return result;
  });
}
