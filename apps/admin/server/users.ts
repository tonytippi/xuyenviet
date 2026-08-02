import "server-only";

import { correlationId, parseAdminUserRosterPage, parseAdminUserRosterQuery, parseUserRoleCommand, parseUserRoleCommandResult, type SafeApiError } from "@xuyenviet/contracts";

import { executeAdminBffMutation, executeAdminBffRead } from "./bff-adapter";

export function parseExpectedAdminUserRosterPage(value: unknown, search: string) {
  const page = parseAdminUserRosterPage(value);
  return page?.search === search ? page : null;
}

export async function readAdminUsers(request: Request, search: unknown, cursor: unknown) {
  const query = parseAdminUserRosterQuery({ ...(search === undefined ? {} : { search }), ...(cursor === undefined ? {} : { cursor }) });
  if (!query) return invalidInput(request.headers);
  const parameters = new URLSearchParams();
  if (query.search) parameters.set("search", query.search);
  if (query.cursor) parameters.set("cursor", query.cursor);
  return executeAdminBffRead({ request, capability: "admin.role.governance", path: `/v1/admin/users?${parameters.toString()}`, parseResult: (value) => parseExpectedAdminUserRosterPage(value, query.search) });
}

export async function mutateAdminUserRole(request: Request & { cookies: { get(name: string): { value: string } | undefined } }, userId: unknown, role: unknown, operation: unknown) {
  const command = parseUserRoleCommand({ targetUserId: userId, role, operation });
  if (!command) return invalidInput(request.headers);
  return executeAdminBffMutation({ request, rawInput: { role: command.role }, parseInput: (value) => value && typeof value === "object" && Object.keys(value).length === 1 && (value as { role?: unknown }).role === command.role ? { role: command.role } : null, parseResult: parseUserRoleCommandResult, capability: "admin.role.governance", path: command.operation === "grant" ? `/v1/admin/users/${encodeURIComponent(command.targetUserId)}/roles` : `/v1/admin/users/${encodeURIComponent(command.targetUserId)}/roles/${command.role}`, method: command.operation === "grant" ? "POST" : "DELETE" });
}

function invalidInput(headers: Headers): { ok: false; error: SafeApiError } {
  return { ok: false, error: { code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: correlationId(headers.get("x-request-id")) } };
}

export function adminBffResponse(result: { ok: true; value: unknown; requestId: string } | { ok: false; error: SafeApiError; status?: number }) {
  return result.ok
    ? { body: result.value, status: 200, requestId: result.requestId }
    : { body: result.error, status: result.status ?? (result.error.code === "unauthorized" ? 401 : result.error.code === "forbidden" || result.error.code === "csrf_invalid" ? 403 : result.error.code === "validation_error" ? 400 : result.error.code === "request_timeout" ? 408 : 503), requestId: result.error.requestId };
}
