import "server-only";

import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { accounts, userRoles, users } from "@/db/schema";
import { createSystemAuditActor } from "@/features/audit/actors";
import { recordAuditEvent } from "@/features/audit/events";

type RoleGovernanceTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export type RoleGovernanceDependencies = Readonly<{
  database: ReturnType<typeof getDb>;
  recordAuditEvent?: typeof recordAuditEvent;
}>;

export async function bootstrapInitialAdmin(
  initialAdminEmail: string | undefined,
  dependencies: RoleGovernanceDependencies = { database: getDb() },
) {
  const email = normalizeEmail(initialAdminEmail);
  if (!email) throw new Error("INITIAL_ADMIN_EMAIL is required.");
  const auditRecorder = dependencies.recordAuditEvent ?? recordAuditEvent;

  return dependencies.database.transaction(async (transaction) => {
    await lockBootstrapRoleGovernance(transaction);
    await lockBootstrapCandidates(transaction);
    const administrators = await transaction
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.role, "admin"))
      .for("update");

    if (administrators.length > 0) throw new Error("Initial administrator bootstrap has already completed.");

    const candidates = await transaction
      .selectDistinct({ id: users.id, email: users.email })
      .from(users)
      .innerJoin(accounts, eq(accounts.userId, users.id))
      .where(sql`${users.email} is not null`);
    const targets = candidates
      .filter((user) => normalizeEmail(user.email) === email)
      .slice(0, 2);
    if (targets.length !== 1) throw new Error("INITIAL_ADMIN_EMAIL must identify exactly one authenticated user.");
    const [candidate] = targets;
    const [target] = await transaction
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, candidate.id))
      .for("update");
    if (!target || normalizeEmail(target.email) !== email) {
      throw new Error("INITIAL_ADMIN_EMAIL must identify exactly one authenticated user.");
    }

    const [account] = await transaction
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(eq(accounts.userId, target.id))
      .limit(1)
      .for("update");
    if (!account) throw new Error("INITIAL_ADMIN_EMAIL must identify a user with a linked Auth.js account.");

    const changed = await grantBootstrapRole(transaction, target.id, "admin");
    if (!changed) throw new Error("Initial administrator bootstrap has already completed.");

    await incrementBootstrapAuthorizationVersion(transaction, target.id);
    await auditRecorder({
      actor: createSystemAuditActor("system-admin-bootstrap"),
      operation: "create",
      targetType: "user_role",
      targetId: target.id,
      afterSummary: JSON.stringify({ role: "admin" }),
    }, transaction);

    return { targetUserId: target.id, role: "admin" as const };
  });
}

async function lockBootstrapRoleGovernance(transaction: RoleGovernanceTransaction) {
  await transaction.execute(sql`select pg_advisory_xact_lock(727556452)`);
}

async function lockBootstrapCandidates(transaction: RoleGovernanceTransaction) {
  // JavaScript Unicode normalization prevents a database predicate lock over the candidate set.
  // Block user/email and Auth.js account writes until the selected candidate is granted.
  await transaction.execute(sql`lock table users, accounts in share row exclusive mode`);
}

async function grantBootstrapRole(transaction: RoleGovernanceTransaction, userId: string, role: "admin") {
  const inserted = await transaction.insert(userRoles).values({ userId, role }).onConflictDoNothing().returning({ userId: userRoles.userId });
  return inserted.length > 0;
}

async function incrementBootstrapAuthorizationVersion(transaction: RoleGovernanceTransaction, userId: string) {
  await transaction.update(users).set({ authorizationVersion: sql`${users.authorizationVersion} + 1` }).where(eq(users.id, userId));
}

export function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || undefined;
}
