import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, Req } from "@nestjs/common";

import { managedUserRoles, parseAdminUserRosterCursor, parseAdminUserRosterQuery, parseUserRoleCommand, type RequestPrincipal } from "@xuyenviet/contracts";
import { changeGovernedUserRole, listGovernedUsers, type UserRoleGovernancePort } from "@xuyenviet/domain";

import { RequiresAdminCapability } from "../auth/admin-capability.decorator";

export const USER_ROLE_GOVERNANCE_PORT = Symbol("USER_ROLE_GOVERNANCE_PORT");

class UserRoleBody {
  role!: "operator" | "admin";

  static parse(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false as const };
    const body = value as Record<string, unknown>;
    return Object.keys(body).length === 1 && (managedUserRoles as readonly string[]).includes(body.role as string)
      ? { ok: true as const, value: { role: body.role as "operator" | "admin" } } : { ok: false as const };
  }
}

@Controller("v1/admin/users")
@RequiresAdminCapability("admin.role.governance")
export class AdminUsersController {
  constructor(@Inject(USER_ROLE_GOVERNANCE_PORT) private readonly governance: UserRoleGovernancePort) {}

  @Get()
  async list(@Query() query: Record<string, unknown>) {
    const parsed = parseAdminUserRosterQuery(query);
    if (!parsed) throw invalid();
    return listGovernedUsers(this.governance, { cursor: parsed.cursor ? parseAdminUserRosterCursor(parsed.cursor) : null, search: parsed.search });
  }

  @Post(":userId/roles")
  @HttpCode(HttpStatus.OK)
  async grant(@Param("userId") userId: string, @Body() body: UserRoleBody, @Req() request: { principal?: RequestPrincipal }) {
    const parsed = UserRoleBody.parse(body);
    return this.change(request.principal, userId, parsed.ok ? parsed.value.role : "", "grant");
  }

  @Delete(":userId/roles/:role")
  async revoke(@Param("userId") userId: string, @Param("role") role: string, @Req() request: { principal?: RequestPrincipal }) {
    return this.change(request.principal, userId, role, "revoke");
  }

  private async change(principal: RequestPrincipal | undefined, userId: string, role: string, operation: "grant" | "revoke") {
    const input = parseUserRoleCommand({ targetUserId: userId, role, operation });
    if (!input) throw invalid();
    try {
      if (!principal) throw invalid();
      return await changeGovernedUserRole(this.governance, principal, input);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({ code: "validation_error" });
    }
  }
}

function invalid() { return new BadRequestException({ code: "validation_error" }); }
