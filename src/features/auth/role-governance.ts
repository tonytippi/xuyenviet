import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { RequestPrincipal } from "@xuyenviet/contracts";

import { getDb } from "@/db/client";
import { accounts, userRoles, users, type UserRole } from "@/db/schema";
import { createSystemAuditActor, createUserAuditActor } from "@/features/audit/actors";
import { recordAuditEvent } from "@/features/audit/events";

type RoleGovernanceTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export type ManagedUserRole = Extract<UserRole, "operator" | "admin">;

export type UserRoleChangeInput = Readonly<{
  targetUserId: string;
  role: ManagedUserRole;
  operation: "grant" | "revoke";
}>;

export type UserRoleDeltaResult = UserRoleChangeInput & Readonly<{ changed: boolean }>;

export type RoleGovernanceDependencies = Readonly<{
  database: ReturnType<typeof getDb>;
  recordAuditEvent?: typeof recordAuditEvent;
}>;

export async function changeUserRole(
  principal: RequestPrincipal,
  input: UserRoleChangeInput,
  dependencies: RoleGovernanceDependencies = { database: getDb() },
): Promise<UserRoleDeltaResult> {
  const targetUserId = normalizeRequiredString(input.targetUserId, "User id");
  const role = normalizeManagedRole(input.role);
  const operation = normalizeRoleOperation(input.operation);
  const auditRecorder = dependencies.recordAuditEvent ?? recordAuditEvent;

  return dependencies.database.transaction(async (transaction) => {
    await lockRoleGovernance(transaction);
    const actor = await requireLiveExactAdmin(transaction, principal);
    await requireTargetUser(transaction, targetUserId);
    await lockTargetRoles(transaction, targetUserId);

    if (operation === "revoke" && role === "admin") {
      const administrators = await transaction
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.role, "admin"))
        .for("update");

      if (administrators.some((administrator) => administrator.userId === targetUserId) && administrators.length === 1) {
        throw new Error("Cannot revoke the final administrator role.");
      }
    }

    const changed = operation === "grant"
      ? await grantRole(transaction, targetUserId, role)
      : await revokeRole(transaction, targetUserId, role);

    if (changed) {
      await incrementAuthorizationVersion(transaction, targetUserId);
      await auditRecorder({
        actor,
        operation: "update",
        targetType: "user_role",
        targetId: targetUserId,
        ...(operation === "grant"
          ? { afterSummary: JSON.stringify({ role }) }
          : { beforeSummary: JSON.stringify({ role }) }),
      }, transaction);
    }

    return { changed, targetUserId, role, operation };
  });
}

export async function bootstrapInitialAdmin(
  initialAdminEmail: string | undefined,
  dependencies: RoleGovernanceDependencies = { database: getDb() },
) {
  const email = normalizeEmail(initialAdminEmail);
  if (!email) throw new Error("INITIAL_ADMIN_EMAIL is required.");
  const auditRecorder = dependencies.recordAuditEvent ?? recordAuditEvent;

  return dependencies.database.transaction(async (transaction) => {
    await lockRoleGovernance(transaction);
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

    const changed = await grantRole(transaction, target.id, "admin");
    if (!changed) throw new Error("Initial administrator bootstrap has already completed.");

    await incrementAuthorizationVersion(transaction, target.id);
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

async function lockRoleGovernance(transaction: RoleGovernanceTransaction) {
  await transaction.execute(sql`select pg_advisory_xact_lock(727556452)`);
}

async function requireLiveExactAdmin(transaction: RoleGovernanceTransaction, principal: RequestPrincipal) {
  const [actor] = await transaction
    .select({ userId: users.id, email: users.email, authorizationVersion: users.authorizationVersion })
    .from(users)
    .where(eq(users.id, principal.userId))
    .limit(1)
    .for("update");
  const [adminRole] = await transaction
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, principal.userId), eq(userRoles.role, "admin")))
    .limit(1)
    .for("update");

  if (!actor?.email || !adminRole) throw new Error("Exact administrator access is required for role changes.");
  if (actor.authorizationVersion !== principal.authorizationVersion) throw new Error("Request principal is stale.");
  return createUserAuditActor({ userId: actor.userId, email: actor.email });
}

async function requireTargetUser(transaction: RoleGovernanceTransaction, userId: string) {
  const [target] = await transaction.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1).for("update");
  if (!target) throw new Error("User not found.");
}

async function lockTargetRoles(transaction: RoleGovernanceTransaction, userId: string) {
  await transaction.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId)).for("update");
}

async function grantRole(transaction: RoleGovernanceTransaction, userId: string, role: ManagedUserRole) {
  const inserted = await transaction.insert(userRoles).values({ userId, role }).onConflictDoNothing().returning({ userId: userRoles.userId });
  return inserted.length > 0;
}

async function revokeRole(transaction: RoleGovernanceTransaction, userId: string, role: ManagedUserRole) {
  const removed = await transaction.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, role))).returning({ userId: userRoles.userId });
  return removed.length > 0;
}

async function incrementAuthorizationVersion(transaction: RoleGovernanceTransaction, userId: string) {
  await transaction.update(users).set({ authorizationVersion: sql`${users.authorizationVersion} + 1` }).where(eq(users.id, userId));
}

function normalizeManagedRole(role: string): ManagedUserRole {
  if (role !== "operator" && role !== "admin") throw new Error("Role must be operator or admin.");
  return role;
}

function normalizeRoleOperation(operation: string): UserRoleChangeInput["operation"] {
  if (operation !== "grant" && operation !== "revoke") throw new Error("Role operation must be grant or revoke.");
  return operation;
}

function normalizeRequiredString(value: string, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || undefined;
}
