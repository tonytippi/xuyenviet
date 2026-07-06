import { redirect } from "next/navigation";

import { AiAskComposer } from "@/features/ai/ai-ask-composer";
import { signOutCurrentUser } from "@/features/auth/actions";
import { getAuthenticatedSession } from "@/server/auth";

type AiAskPageProps = {
  searchParams?: Promise<{
    ref?: string | string[];
  }>;
};

function getFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim());
  }

  return value;
}

const examplePrompts = [
  "Hà Nội đi Đà Nẵng 7 ngày cùng gia đình nên dừng ở đâu?",
  "Đi Tây Bắc bằng ô tô tự lái mùa mưa cần lưu ý gì?",
  "TP. HCM đi Đà Lạt cuối tuần, lịch trình nào đỡ mệt?",
];

export default async function AiAskPage({ searchParams }: AiAskPageProps) {
  const params = await searchParams;
  const referralCode = getFirstParam(params?.ref);
  const session = await getAuthenticatedSession();

  if (!session) {
    const signInParams = new URLSearchParams({ next: "/ai-ask" });

    if (referralCode) {
      signInParams.set("ref", referralCode);
    }

    redirect(`/sign-in?${signInParams.toString()}`);
  }

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col gap-6 rounded-[2rem] border border-[#d8c9ad] bg-[#fbf7ed]/90 p-5 shadow-[0_24px_80px_rgba(41,33,18,0.14)] sm:p-8 lg:p-10">
        <header className="flex flex-col gap-4 border-b border-[#d8c9ad] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">AI Ask</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17342c] sm:text-5xl">Hỏi trợ lý chuyến đi Việt Nam</h1>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <p className="rounded-full border border-[#d8c9ad] bg-white/70 px-4 py-2 text-sm font-semibold text-[#17342c]">{session.email}</p>
            <form action={signOutCurrentUser}>
              <button
                className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-white/75 px-4 py-3 text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
                type="submit"
              >
                Đăng xuất
              </button>
            </form>
          </div>
        </header>

        <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-h-[34rem] flex-col justify-between gap-5 rounded-[1.5rem] border border-[#d8c9ad] bg-[#fffdf8]/80 p-4 sm:p-5">
            <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center gap-5 py-8 text-center">
              <p className="mx-auto w-fit rounded-full border border-[#c47a24]/45 bg-[#fff8ec] px-4 py-2 text-sm font-semibold text-[#8c4f13]">
                Bắt đầu bằng một câu hỏi hành trình
              </p>
              <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[#17342c] sm:text-4xl">Bạn đang muốn đi đâu?</h2>
              <p className="text-base leading-7 text-[#4f625a] sm:text-lg">
                Ví dụ: Hà Nội đi Đà Nẵng 7 ngày cùng gia đình. Hãy hỏi rộng trước; những bước sau sẽ nối lưu hội thoại và câu trả lời AI.
              </p>
              <div className="rounded-2xl border border-dashed border-[#d8c9ad] bg-white/65 p-5 text-left" aria-label="Khu vực tin nhắn đang chờ câu hỏi đầu tiên">
                <p className="text-sm font-semibold text-[#17342c]">Khu vực hội thoại</p>
                <p className="mt-2 text-sm leading-6 text-[#5d6f67]">Chưa có tin nhắn. Câu trả lời thật và nguồn tham chiếu sẽ xuất hiện ở các story sau, không hiển thị dữ liệu giả ở bước này.</p>
              </div>
            </div>

            <AiAskComposer />
          </div>

          <aside className="flex flex-col gap-4">
            <section className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5">
              <h2 className="text-lg font-semibold text-[#17342c]">Gợi ý câu hỏi</h2>
              <div className="mt-4 grid gap-3">
                {examplePrompts.map((prompt) => (
                  <p className="rounded-2xl border border-[#c47a24]/35 bg-[#fff8ec] p-4 text-sm font-semibold leading-6 text-[#8c4f13]" key={prompt}>
                    {prompt}
                  </p>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5">
              <h2 className="text-lg font-semibold text-[#17342c]">Lưu trữ hội thoại</h2>
              <p className="mt-3 text-sm leading-6 text-[#4f625a]">
                Thông tin chuyến đi có thể được lưu để tiếp tục kế hoạch trong các bước sau. Thông báo này không chặn việc đặt câu hỏi.
              </p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
