import Link from "next/link";

import { signInWithGoogle } from "@/features/auth/actions";
import { normalizePublicAskDraft } from "@/features/auth/redirects";

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

function buildHref(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();

  return queryString ? `${path}?${queryString}` : path;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const requestedNextPath = getFirstParam(params?.next);
  const nextPath = requestedNextPath === "/ai-ask" || requestedNextPath === "/admin" ? requestedNextPath : undefined;
  const referralCode = getFirstParam(params?.ref);
  const publicDraft = normalizePublicAskDraft(getFirstParam(params?.draft));
  const hasAuthError = Boolean(getFirstParam(params?.error));
  const aiAskHref = buildHref("/ai-ask", { ref: referralCode, draft: publicDraft });
  const gateMessage = nextPath === "/admin" ? "Đăng nhập để vào khu vực quản trị." : "Đăng nhập để hỏi AI.";

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col justify-between gap-10 rounded-[2rem] border border-[#d8c9ad] bg-[#fbf7ed]/90 p-6 shadow-[0_24px_80px_rgba(41,33,18,0.14)] sm:p-8 lg:p-10">
        <div>
          <Link
            className="mb-7 inline-flex rounded-full border border-[#d8c9ad] bg-white/65 px-4 py-2 text-sm font-semibold text-[#1f5f46] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
            href="/"
          >
            Về trang giới thiệu
          </Link>

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Đăng nhập</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[#17342c] sm:text-6xl">
            Đăng nhập Google để mở AI Ask cho hành trình của bạn.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4f625a]">
            XuyenViet sẽ dùng tài khoản Google để nhận diện người dùng, bảo vệ câu hỏi AI và chuẩn bị cho lịch trình cá nhân trong các bước tiếp theo.
          </p>
          {nextPath ? (
            <p className="mt-5 max-w-2xl rounded-2xl border border-[#c47a24]/45 bg-[#fff8ec] px-5 py-4 text-base leading-7 text-[#5d3f1d]">
              {gateMessage} Cổng bảo vệ đã chặn truy cập vì chưa có phiên đăng nhập hợp lệ.
            </p>
          ) : null}
          {hasAuthError ? (
            <p className="mt-5 max-w-2xl rounded-2xl border border-[#b94a48]/45 bg-[#fff1ee] px-5 py-4 text-base leading-7 text-[#71322d]">
              Đăng nhập Google chưa hoàn tất. Vui lòng thử lại hoặc kiểm tra cấu hình OAuth nếu bạn đang chạy môi trường phát triển.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 rounded-[1.5rem] border border-dashed border-[#c47a24]/60 bg-[#fff8ec] p-5 sm:p-6">
          <form action={signInWithGoogle}>
            <input name="next" type="hidden" value={nextPath ?? "/ai-ask"} />
            {referralCode ? <input name="ref" type="hidden" value={referralCode} /> : null}
            {publicDraft ? <input name="draft" type="hidden" value={publicDraft} /> : null}
            <button
              className="min-h-12 w-full rounded-2xl bg-[#1f5f46] px-5 py-4 text-center text-base font-semibold text-white shadow-[0_12px_30px_rgba(31,95,70,0.22)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
              type="submit"
            >
              Tiếp tục với Google
            </button>
          </form>
          <p className="text-sm leading-6 text-[#5d6f67]">
            XuyenViet dùng Auth.js để mở OAuth Google và lưu phiên đăng nhập trong PostgreSQL. Không có kiểm tra allowlist email cho người dùng thường.
          </p>
          <Link
            className="rounded-2xl border border-[#d8c9ad] bg-white/75 px-5 py-4 text-center text-base font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
            href={aiAskHref}
          >
            Thử mở cổng AI Ask
          </Link>
        </div>
      </section>
    </main>
  );
}
