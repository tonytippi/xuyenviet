"use client";

export default function LoginPage() {
  function signIn() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN;
    if (!apiOrigin) throw new Error("NEXT_PUBLIC_API_ORIGIN is required.");
    window.location.assign(`${apiOrigin}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/` })}`);
  }

  return <main className="grid min-h-screen place-items-center bg-[#0d1714] px-5 text-[#fbf7ed]"><section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#101f1a] p-7 shadow-2xl"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#e5bd82]">XuyenViet Ops</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Đăng nhập quản trị</h1><p className="mt-4 leading-7 text-[#b9c9c1]">Đăng nhập bằng tài khoản Google đã được cấp quyền vận hành để truy cập Admin Console.</p><button className="mt-7 w-full rounded-2xl bg-[#e5bd82] px-4 py-3 font-semibold text-[#17342c] transition hover:bg-[#f2cf99] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/25" onClick={signIn} type="button">Đăng nhập với Google</button></section></main>;
}
