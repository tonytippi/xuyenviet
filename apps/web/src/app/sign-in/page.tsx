import Link from "next/link";
import { headers } from "next/headers";

import { BrandMark } from "@/components/ui/brand-mark";
import { getApiReturnUrl, normalizePublicAskDraft } from "@/features/auth/redirects";

type SignInPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
    ref?: string | string[];
    draft?: string | string[];
    error?: string | string[];
  }>;
};

function getFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim());
  }

  return value?.trim() ? value : undefined;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const requestedNextPath = getFirstParam(params?.next);
  const nextPath = requestedNextPath === "/ai-ask" ? requestedNextPath : undefined;
  const referralCode = getFirstParam(params?.ref);
  const publicDraft = normalizePublicAskDraft(getFirstParam(params?.draft));
  const travelerReturnUrl = `${nextPath ?? "/ai-ask"}${referralCode || publicDraft ? `?${new URLSearchParams({ ...(referralCode ? { ref: referralCode } : {}), ...(publicDraft ? { draft: publicDraft } : {}) }).toString()}` : ""}`;
  const origin = `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")}`;
  const apiReturnUrl = getApiReturnUrl(origin, travelerReturnUrl);
  const hasAuthError = Boolean(getFirstParam(params?.error));
  const gateMessage = "Đăng nhập để tiếp tục với XuyenViet.";

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-white px-5 py-6">
      <section className="w-full max-w-[420px]">
        <div className="text-center">
          <Link
            className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.025em] text-[#202020]"
            href="/"
          >
            <BrandMark className="size-8" />
            XuyenViet
          </Link>

          <h1 className="mt-8 text-3xl font-semibold tracking-[-0.045em] text-[#202020] sm:text-4xl">
            Đăng nhập để tiếp tục
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-[#6b6b6b]">
            Lên kế hoạch và lưu hành trình của bạn với XuyenViet.
          </p>
        </div>

        <div className="mt-8 grid gap-4 rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4">
          {nextPath ? (
            <p className="rounded-xl bg-[#edf7f2] px-3 py-2.5 text-sm leading-5 text-[#285c49]">
              {gateMessage}
            </p>
          ) : null}
          {hasAuthError ? (
            <p className="rounded-xl bg-[#fff1ee] px-3 py-2.5 text-sm leading-5 text-[#8a3831]" role="alert">
              Đăng nhập chưa hoàn tất. Vui lòng thử lại.
            </p>
          ) : null}
          <a href={`/auth/google?returnUrl=${encodeURIComponent(apiReturnUrl)}${referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ""}`}
              className="min-h-12 w-full rounded-xl bg-[#202020] px-5 py-4 text-center text-base font-medium text-white transition hover:bg-[#383838] active:translate-y-px"
              style={{ color: "#fff" }}
            >
              Tiếp tục với Google
          </a>
          <p className="text-center text-xs leading-5 text-[#858585]">
            Chúng tôi chỉ dùng tài khoản Google để bảo vệ và đồng bộ hành trình của bạn.
          </p>
        </div>
      </section>
    </main>
  );
}
