import Link from "next/link";

import { grantAdminUserRoleForm, revokeAdminUserRoleForm } from "@/features/admin/actions";
import { listAdminUsers } from "@/features/admin/users";

type AdminUsersPageProps = {
  searchParams: Promise<{ page?: string; search?: string }>;
};

const roles = ["operator", "admin"] as const;

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const roster = await listAdminUsers({ page: params.page, search: params.search });
  const previousHref = getRosterHref(roster.page - 1, roster.search);
  const nextHref = getRosterHref(roster.page + 1, roster.search);

  return (
    <div className="grid gap-6">
      <section className="rounded-[2rem] bg-[#10251e] p-6 text-white shadow-[0_24px_70px_rgba(16,37,30,0.24)] sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e5bd82]">Kiểm soát truy cập</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Người dùng và vai trò</h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-[#c9d7d1]">Chỉ quản trị viên mới có thể xem danh sách này hoặc cấp, thu hồi quyền vận hành.</p>
      </section>

      <form className="grid gap-3 rounded-[1.5rem] border border-[#d8c9ad] bg-white/80 p-4 sm:grid-cols-[1fr_auto] sm:p-5">
        <label className="grid gap-2 text-sm font-semibold text-[#17342c]" htmlFor="user-search">
          Tìm theo tên hoặc email
          <input className="min-h-12 rounded-xl border border-[#cdbb99] bg-[#fffdf8] px-4 text-base font-normal outline-none focus:ring-4 focus:ring-[#e5bd82]/35" defaultValue={roster.search} id="user-search" name="search" placeholder="Nhập tên hoặc email" type="search" />
        </label>
        <button className="mt-auto min-h-12 rounded-xl bg-[#1f5f46] px-5 font-semibold text-white transition hover:bg-[#173f31] focus:outline-none focus:ring-4 focus:ring-[#1f5f46]/30" type="submit">Tìm kiếm</button>
      </form>

      <section className="overflow-hidden rounded-[1.5rem] border border-[#d8c9ad] bg-white/80">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#e2d3ba] px-5 py-4">
          <h2 className="text-xl font-semibold text-[#17342c]">{roster.total} tài khoản</h2>
          <p className="text-sm text-[#4f625a]">Trang {roster.page} / {roster.totalPages}</p>
        </div>
        {roster.items.length === 0 ? (
          <p className="px-5 py-12 text-center text-[#4f625a]">Không tìm thấy người dùng phù hợp.</p>
        ) : (
          <ul className="divide-y divide-[#e2d3ba]">
            {roster.items.map((user) => (
              <li className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" key={user.id}>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    {user.image ? <span aria-hidden="true" className="size-10 rounded-full border border-[#d8c9ad] bg-cover bg-center" style={{ backgroundImage: `url("${user.image}")` }} /> : <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-[#dce9df] font-semibold text-[#1f5f46]">{(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}</span>}
                    <div className="min-w-0"><p className="truncate font-semibold text-[#17342c]">{user.name || "Chưa đặt tên"}</p><p className="truncate text-sm text-[#4f625a]">{user.email ?? "Không có email"}</p></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className={`rounded-full px-3 py-1 ${user.emailVerified ? "bg-[#dce9df] text-[#1f5f46]" : "bg-[#f3e6cf] text-[#8c4f13]"}`}>{user.emailVerified ? "Email đã xác thực" : "Email chưa xác thực"}</span>
                    {user.roles.length === 0 ? <span className="rounded-full bg-[#eee9df] px-3 py-1 text-[#4f625a]">Traveler</span> : user.roles.map((role) => <span className="rounded-full bg-[#17342c] px-3 py-1 text-white" key={role}>{role}</span>)}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:w-[18rem]">
                  {roles.map((role) => user.roles.includes(role) ? (
                    <form action={revokeAdminUserRoleForm} key={role}><input name="userId" type="hidden" value={user.id} /><input name="role" type="hidden" value={role} /><button className="min-h-11 w-full rounded-xl border border-[#b85d45] px-3 text-sm font-semibold text-[#9b321e] transition hover:bg-[#fff0eb] focus:outline-none focus:ring-4 focus:ring-[#b85d45]/20" type="submit">Thu hồi {role}</button></form>
                  ) : (
                    <form action={grantAdminUserRoleForm} key={role}><input name="userId" type="hidden" value={user.id} /><input name="role" type="hidden" value={role} /><button className="min-h-11 w-full rounded-xl border border-[#1f5f46] px-3 text-sm font-semibold text-[#1f5f46] transition hover:bg-[#eaf3ed] focus:outline-none focus:ring-4 focus:ring-[#1f5f46]/20" type="submit">Cấp {role}</button></form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="flex items-center justify-between gap-4" aria-label="Phân trang người dùng">
        {roster.page > 1 ? <Link className="min-h-11 rounded-xl border border-[#cdbb99] px-4 py-3 font-semibold text-[#17342c]" href={previousHref}>Trang trước</Link> : <span />}
        {roster.page < roster.totalPages ? <Link className="min-h-11 rounded-xl bg-[#1f5f46] px-4 py-3 font-semibold text-white" href={nextHref}>Trang sau</Link> : null}
      </nav>
    </div>
  );
}

function getRosterHref(page: number, search: string) {
  const parameters = new URLSearchParams({ page: String(page) });
  if (search) parameters.set("search", search);
  return `/admin/users?${parameters.toString()}`;
}
