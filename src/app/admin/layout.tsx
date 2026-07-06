import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutCurrentUser } from "@/features/auth/actions";
import { getAuthenticatedSessionWithRoles, hasAdminAccess } from "@/server/auth";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await getAuthenticatedSessionWithRoles();

  if (!session) {
    redirect("/sign-in?next=/admin");
  }

  if (!hasAdminAccess(session.roles)) {
    return (
      <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
        <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl flex-col justify-center gap-6 rounded-[2rem] border border-[#d8c9ad] bg-[#fbf7ed]/90 p-6 shadow-[0_24px_80px_rgba(41,33,18,0.14)] sm:p-8 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9b2f29]">Không có quyền quản trị</p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-[#17342c] sm:text-5xl">
            Tài khoản này chưa được cấp quyền vận hành.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-[#4f625a]">
            XuyenViet đã kiểm tra vai trò trên máy chủ và chặn khu vực quản trị cho phiên đăng nhập hiện tại.
          </p>
          <Link
            className="min-h-12 w-fit rounded-2xl border border-[#d8c9ad] bg-white/75 px-5 py-4 text-base font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
            href="/ai-ask"
          >
            Quay lại AI Ask
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#17342c] px-5 py-6 text-[#fbf7ed] sm:px-8 lg:px-12">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 rounded-[2rem] border border-[#41695d] bg-[#203f35] p-6 shadow-[0_24px_80px_rgba(9,24,19,0.28)] sm:p-8 lg:grid-cols-[17rem_1fr] lg:p-10">
        <aside className="rounded-[1.5rem] border border-[#5f8176] bg-[#17342c] p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#e5bd82]">Admin</p>
          <nav className="mt-8 grid gap-3" aria-label="Điều hướng quản trị">
            <span className="rounded-2xl bg-[#fbf7ed] px-4 py-3 font-semibold text-[#17342c]">Tổng quan vận hành</span>
          </nav>
        </aside>

        <div className="flex flex-col justify-between gap-10 rounded-[1.5rem] border border-[#5f8176] bg-[#fbf7ed] p-6 text-[#17342c] sm:p-8">
          {children}
          <form action={signOutCurrentUser}>
            <button
              className="min-h-12 w-fit rounded-2xl border border-[#d8c9ad] bg-white/75 px-5 py-4 text-base font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
              type="submit"
            >
              Đăng xuất
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
