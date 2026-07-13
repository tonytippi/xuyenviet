import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutCurrentUser } from "@/features/auth/actions";
import { getAuthenticatedSessionWithRoles, hasAdminAccess } from "@/server/auth";

type AdminLayoutProps = {
  children: React.ReactNode;
};

const adminNavItems = [
  { href: "/admin", label: "Tổng quan", eyebrow: "Command" },
  { href: "/admin/knowledge/intake", label: "Nạp nguồn", eyebrow: "Intake" },
  { href: "/admin/knowledge/facebook-captures", label: "Capture Facebook", eyebrow: "Queue" },
  { href: "/admin/knowledge/drafts", label: "Duyệt nháp", eyebrow: "Review" },
  { href: "/admin/knowledge/approved", label: "Tri thức duyệt", eyebrow: "Library" },
  { href: "/admin/knowledge/progress", label: "Seed 100 mục", eyebrow: "Progress" },
  { href: "/admin/quality", label: "Chất lượng MVP", eyebrow: "Signals" },
];

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await getAuthenticatedSessionWithRoles();

  if (!session) {
    redirect("/sign-in?next=/admin");
  }

  if (!hasAdminAccess(session.roles)) {
    return (
      <main className="min-h-screen bg-[#101c18] px-5 py-6 text-[#fbf7ed] sm:px-8 lg:px-12">
        <section className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#162820] p-6 shadow-[0_28px_120px_rgba(0,0,0,0.45)] sm:p-8 lg:p-10">
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-[#e5bd82]/20 blur-3xl" />
          <div className="absolute -bottom-28 left-10 size-80 rounded-full bg-[#1f5f46]/35 blur-3xl" />
          <div className="relative flex flex-col justify-center gap-6">
            <p className="w-fit rounded-full border border-[#e5bd82]/30 bg-[#e5bd82]/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#e5bd82]">Không có quyền quản trị</p>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
              Tài khoản này chưa được cấp quyền vận hành.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-[#b9c9c1]">
              XuyenViet đã kiểm tra vai trò trên máy chủ và chặn khu vực quản trị cho phiên đăng nhập hiện tại.
            </p>
            <Link
              className="min-h-12 w-fit rounded-2xl border border-white/15 bg-white px-5 py-4 text-base font-semibold text-[#17342c] shadow-[0_18px_45px_rgba(0,0,0,0.22)] transition hover:bg-[#fbf7ed] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/40"
              href="/ai-ask"
            >
              Quay lại AI Ask
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d1714] text-[#fbf7ed]">
      <section className="mx-auto grid min-h-screen max-w-[100rem] gap-0 lg:grid-cols-[19rem_1fr]">
        <aside className="relative overflow-hidden border-b border-white/10 bg-[#101f1a] px-5 py-5 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
          <div className="absolute -left-28 top-20 size-72 rounded-full bg-[#1f5f46]/30 blur-3xl" />
          <div className="absolute -right-24 top-0 size-56 rounded-full bg-[#e5bd82]/15 blur-3xl" />

          <div className="relative flex items-start justify-between gap-4 lg:block">
            <Link className="group block rounded-3xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.07]" href="/admin">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#e5bd82]">XuyenViet Ops</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">Admin Console</h1>
              <p className="mt-2 text-sm leading-6 text-[#9fb4aa]">Tri thức, chất lượng và vận hành AI-first.</p>
            </Link>

            <form action={signOutCurrentUser} className="lg:hidden">
              <button
                className="min-h-11 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.1] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/30"
                type="submit"
              >
                Đăng xuất
              </button>
            </form>
          </div>

          <nav className="relative mt-5 flex gap-3 overflow-x-auto pb-2 lg:mt-8 lg:grid lg:overflow-visible lg:pb-0" aria-label="Điều hướng quản trị">
            {adminNavItems.map((item) => (
              <Link
                className="group min-w-[11rem] rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:-translate-y-0.5 hover:border-[#e5bd82]/35 hover:bg-[#e5bd82]/10 focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/25 lg:min-w-0"
                href={item.href}
                key={item.href}
              >
                <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#8fb59f]">{item.eyebrow}</span>
                <span className="mt-1 block font-semibold text-[#fbf7ed]">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="relative mt-6 hidden rounded-3xl border border-[#e5bd82]/20 bg-[#e5bd82]/10 p-4 lg:block">
            <p className="text-sm font-semibold text-[#e5bd82]">Phiên vận hành</p>
            <p className="mt-2 text-sm leading-6 text-[#b9c9c1]">Quyền được xác thực server-side từ PostgreSQL trước khi render dashboard.</p>
          </div>

          <form action={signOutCurrentUser} className="relative mt-6 hidden lg:block">
            <button
              className="min-h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-base font-semibold text-white transition hover:bg-white/[0.1] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/30"
              type="submit"
            >
              Đăng xuất
            </button>
          </form>
        </aside>

        <div className="relative overflow-hidden bg-[#f3efe6] text-[#17342c]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(229,189,130,0.38),transparent_34%),radial-gradient(circle_at_20%_15%,rgba(31,95,70,0.16),transparent_30%)]" />
          <div className="relative min-h-screen px-5 py-6 sm:px-7 lg:px-10 lg:py-8">
            <div className="mx-auto max-w-6xl rounded-[2rem] border border-white/70 bg-[#fbf7ed]/82 p-5 shadow-[0_24px_90px_rgba(23,52,44,0.16)] backdrop-blur sm:p-7 lg:p-8">
              {children}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
