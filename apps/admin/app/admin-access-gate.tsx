"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const adminNavItems = [
  { href: "/", label: "Tổng quan", eyebrow: "Command" },
  { href: "/knowledge/intake", label: "Nạp nguồn", eyebrow: "Intake" },
  { href: "/knowledge/facebook-captures", label: "Capture Facebook", eyebrow: "Queue" },
  { href: "/knowledge/youtube-captures", label: "Capture YouTube", eyebrow: "Queue" },
  { href: "/knowledge/cards", label: "Thẻ tri thức", eyebrow: "Lifecycle" },
  { href: "/knowledge/recommendations", label: "Yêu cầu vận hành", eyebrow: "Ops queue" },
  { href: "/knowledge/progress", label: "Seed 100 mục", eyebrow: "Progress" },
  { href: "/quality", label: "Chất lượng MVP", eyebrow: "Signals" },
  { href: "/users", label: "Người dùng", eyebrow: "Access" },
  { href: "/ai-models", label: "AI Models", eyebrow: "Models & cost" },
  { href: "/guides", label: "Hướng dẫn vận hành", eyebrow: "Guide" },
];

function apiOrigin() {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (!origin) throw new Error("NEXT_PUBLIC_API_ORIGIN is required.");
  return origin;
}

export function AdminAccessGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [access, setAccess] = useState<"checking" | "granted" | "denied" | "unavailable">("checking");
  const [account, setAccount] = useState<{ name: string | null; email: string | null } | null>(null);

  useEffect(() => {
    if (pathname === "/login") return;
    void fetch(`${apiOrigin()}/v1/admin/workspace`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store" })
      .then((response) => {
        if (response.ok) setAccess("granted");
        else if (response.status === 401) window.location.replace("/login");
        else if (response.status === 403) {
          setAccess("denied");
          void fetch(`${apiOrigin()}/auth/session`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store" })
            .then((session) => session.ok ? session.json() as Promise<unknown> : null)
            .then((value) => {
              const profile = value && typeof value === "object" && "account" in value ? value.account : null;
              if (!profile || typeof profile !== "object") return;
              const name = "name" in profile && typeof profile.name === "string" ? profile.name : null;
              const email = "email" in profile && typeof profile.email === "string" ? profile.email : null;
              setAccount({ name, email });
            });
        }
        else setAccess("unavailable");
      })
      .catch(() => setAccess("unavailable"));
  }, [pathname]);

  if (pathname === "/login") return children;

  if (access !== "granted") {
    const message = access === "checking" ? "Đang xác thực phiên vận hành." : access === "denied" ? "Tài khoản này không có quyền truy cập trang quản trị." : "Không thể kết nối để xác thực quyền truy cập.";
    return <main className="grid min-h-screen place-items-center bg-[#0d1714] px-5 text-[#fbf7ed]"><section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#101f1a] p-7 shadow-2xl"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#e5bd82]">XuyenViet Ops</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Admin Console</h1><p className="mt-4 text-[#b9c9c1]" role="status">{message}</p>{access === "denied" && account ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8fb59f]">Đang đăng nhập</p><p className="mt-2 font-semibold text-white">{account.name ?? "Tài khoản Google"}</p>{account.email ? <p className="mt-1 text-sm text-[#b9c9c1]">{account.email}</p> : null}</div> : null}{access === "denied" ? <Link className="mt-6 inline-block font-semibold text-[#e5bd82] underline underline-offset-4" href="/login">Đăng nhập bằng tài khoản khác</Link> : null}</section></main>;
  }

  return (
    <main className="min-h-screen bg-[#0d1714] text-[#fbf7ed]">
      <section className="mx-auto grid min-h-screen max-w-[100rem] gap-0 lg:grid-cols-[19rem_1fr]">
        <aside className="relative overflow-hidden border-b border-white/10 bg-[#101f1a] px-5 py-5 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
          <div className="absolute -left-28 top-20 size-72 rounded-full bg-[#1f5f46]/30 blur-3xl" />
          <div className="absolute -right-24 top-0 size-56 rounded-full bg-[#e5bd82]/15 blur-3xl" />
          <div className="relative"><Link className="group block rounded-3xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.07]" href="/"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#e5bd82]">XuyenViet Ops</p><h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">Admin Console</h1><p className="mt-2 text-sm leading-6 text-[#9fb4aa]">Tri thức, chất lượng và vận hành AI-first.</p></Link></div>
          <nav className="relative mt-5 flex gap-3 overflow-x-auto pb-2 lg:mt-8 lg:grid lg:overflow-visible lg:pb-0" aria-label="Điều hướng quản trị">{adminNavItems.map((item) => <Link className="group min-w-[11rem] rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:-translate-y-0.5 hover:border-[#e5bd82]/35 hover:bg-[#e5bd82]/10 focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/25 lg:min-w-0" href={item.href} key={item.href}><span className="block text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#8fb59f]">{item.eyebrow}</span><span className="mt-1 block font-semibold text-[#fbf7ed]">{item.label}</span></Link>)}</nav>
        </aside>
        <div className="relative overflow-hidden bg-[#f3efe6] text-[#17342c]"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(229,189,130,0.38),transparent_34%),radial-gradient(circle_at_20%_15%,rgba(31,95,70,0.16),transparent_30%)]" /><div className="relative min-h-screen px-5 py-6 sm:px-7 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl rounded-[2rem] border border-white/70 bg-[#fbf7ed]/82 p-5 shadow-[0_24px_90px_rgba(23,52,44,0.16)] backdrop-blur sm:p-7 lg:p-8">{children}</div></div></div>
      </section>
    </main>
  );
}
