import "server-only";

import { asc, count, ilike, inArray, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import { userRoles, users, type UserRole } from "@/db/schema";
import { requireExactAdminSession } from "@/server/auth";

const rosterPageSize = 25;
const maxRosterPage = 10_000;
const maxSearchLength = 120;

export type AdminUserRosterItem = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  emailVerified: Date | null;
  roles: UserRole[];
};

export type AdminUserRoster = {
  items: AdminUserRosterItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  search: string;
};

export async function listAdminUsers(input: { page?: number | string; search?: string } = {}): Promise<AdminUserRoster> {
  await requireExactAdminSession();

  const page = normalizePage(input.page);
  const search = normalizeSearch(input.search);
  const where = search
    ? or(ilike(users.name, `%${escapeLikePattern(search)}%`), ilike(users.email, `%${escapeLikePattern(search)}%`))
    : undefined;
  const db = getDb();
  const [totalRow] = await db.select({ value: count() }).from(users).where(where);
  const total = totalRow?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / rosterPageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image, emailVerified: users.emailVerified })
    .from(users)
    .where(where)
    .orderBy(asc(users.name), asc(users.email), asc(users.id))
    .limit(rosterPageSize)
    .offset((currentPage - 1) * rosterPageSize);
  const userIds = rows.map((row) => row.id);
  const roleRows = userIds.length === 0
    ? []
    : await db.select({ userId: userRoles.userId, role: userRoles.role }).from(userRoles).where(inArray(userRoles.userId, userIds)).orderBy(asc(userRoles.role));
  const rolesByUserId = new Map<string, UserRole[]>();

  for (const roleRow of roleRows) {
    const roles = rolesByUserId.get(roleRow.userId) ?? [];
    roles.push(roleRow.role);
    rolesByUserId.set(roleRow.userId, roles);
  }

  return {
    items: rows.map((row) => ({ ...row, roles: rolesByUserId.get(row.id) ?? [] })),
    page: currentPage,
    pageSize: rosterPageSize,
    total,
    totalPages,
    search,
  };
}

function normalizePage(value: number | string | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, maxRosterPage) : 1;
}

function normalizeSearch(value: string | undefined) {
  return typeof value === "string" ? value.trim().slice(0, maxSearchLength) : "";
}

function escapeLikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
