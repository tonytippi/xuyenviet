import type { AdminUserRosterCursor, AdminUserRosterPage, ManagedUserRole, RequestPrincipal, UserRoleCommandResult, UserRoleOperation } from "@xuyenviet/contracts";

export type UserRoleGovernancePort = {
  listUsers(input: { cursor: AdminUserRosterCursor | null; search: string }): Promise<AdminUserRosterPage>;
  withinRoleGovernanceTransaction<T>(operation: (transaction: UserRoleGovernanceTransactionPort) => Promise<T>): Promise<T>;
};

/** Persistence operations are deliberately granular so the domain owns their order and policy. */
export type UserRoleGovernanceTransactionPort = {
  lockRoleGovernance(): Promise<void>;
  loadLiveExactAdmin(principal: RequestPrincipal): Promise<{ userId: string; email: string }>;
  requireTargetUser(userId: string): Promise<void>;
  lockTargetRoles(userId: string): Promise<void>;
  listAdministratorUserIds(): Promise<string[]>;
  grantRole(userId: string, role: ManagedUserRole): Promise<boolean>;
  revokeRole(userId: string, role: ManagedUserRole): Promise<boolean>;
  incrementAuthorizationVersion(userId: string): Promise<void>;
  recordRoleAudit(input: { actorUserId: string; actorEmail: string; targetUserId: string; role: ManagedUserRole; operation: UserRoleOperation }): Promise<void>;
};

/** The port owns no persistence policy; its database adapter preserves the role transaction invariant. */
export async function listGovernedUsers(port: UserRoleGovernancePort, input: { cursor: AdminUserRosterCursor | null; search: string }) {
  return port.listUsers(input);
}

export async function changeGovernedUserRole(port: UserRoleGovernancePort, principal: RequestPrincipal, input: { targetUserId: string; role: ManagedUserRole; operation: UserRoleOperation }): Promise<UserRoleCommandResult> {
  if (!input.targetUserId.trim() || (input.role !== "operator" && input.role !== "admin") || (input.operation !== "grant" && input.operation !== "revoke")) {
    throw new Error("Role governance input is invalid.");
  }
  return port.withinRoleGovernanceTransaction(async (transaction) => {
    await transaction.lockRoleGovernance();
    const actor = await transaction.loadLiveExactAdmin(principal);
    await transaction.requireTargetUser(input.targetUserId);
    await transaction.lockTargetRoles(input.targetUserId);

    if (input.operation === "revoke" && input.role === "admin") {
      const administrators = await transaction.listAdministratorUserIds();
      if (administrators.length === 1 && administrators[0] === input.targetUserId) {
        throw new Error("Cannot revoke the final administrator role.");
      }
    }

    const changed = input.operation === "grant"
      ? await transaction.grantRole(input.targetUserId, input.role)
      : await transaction.revokeRole(input.targetUserId, input.role);
    if (changed) {
      await transaction.incrementAuthorizationVersion(input.targetUserId);
      await transaction.recordRoleAudit({ actorUserId: actor.userId, actorEmail: actor.email, targetUserId: input.targetUserId, role: input.role, operation: input.operation });
    }
    return { ...input, changed };
  });
}
