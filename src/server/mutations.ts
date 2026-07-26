import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { userRoles } from "@/db/schema";
import { toUserAuditActor } from "@/features/audit/actors";
import { recordAuditEvent, type AuditEventInput } from "@/features/audit/events";

import { getAuthenticatedSession, requireAdminSession, requireExactAdminSession, type AuthenticatedSession } from "./auth";

type MutationTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

type ServerMutationOptions<TResult> = {
  action: (session: AuthenticatedSession) => Promise<TResult>;
};

type AuditMetadata = Omit<AuditEventInput, "actor">;

type AuditedServerMutationOptions<TResult> = {
  action: (session: AuthenticatedSession, transaction: MutationTransaction) => Promise<TResult>;
  audit: AuditMetadata;
};

type AuditedExactAdminMutationOptions<TResult> = {
  action: (session: AuthenticatedSession, transaction: MutationTransaction) => Promise<TResult>;
  audit: (result: TResult) => AuditMetadata | undefined;
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
    await recordAuditEvent({ ...audit, actor: toUserAuditActor({ userId: session.userId, email: session.email }) }, transaction);

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
    await recordAuditEvent({ ...audit, actor: toUserAuditActor({ userId: session.userId, email: session.email }) }, transaction);

    return result;
  });
}

export async function runAuditedExactAdminMutation<TResult>({
  action,
  audit,
}: AuditedExactAdminMutationOptions<TResult>): Promise<TResult> {
  const session = await requireExactAdminSession();

  return getDb().transaction(async (transaction) => {
    // Serialize role management so authorization remains valid through the mutation.
    await transaction.execute(sql`select pg_advisory_xact_lock(727556452)`);
    const [currentAdminRole] = await transaction
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, session.userId), eq(userRoles.role, "admin")))
      .limit(1);

    if (!currentAdminRole) {
      throw new Error("Exact administrator access is required for this server mutation.");
    }

    const result = await action(session, transaction);
    const auditMetadata = audit(result);

    if (auditMetadata) {
      await recordAuditEvent({ ...auditMetadata, actor: toUserAuditActor({ userId: session.userId, email: session.email }) }, transaction);
    }

    return result;
  });
}
