import Link from "next/link";
import { AccountIcon, ChatIcon, ProjectIcon, SourceIcon } from "@/components/ui/icons";

const starterPrompts = [
  { label: "Tuyến đường Hà Nội - Huế 5 ngày", icon: ProjectIcon },
  { label: "Khách sạn phù hợp gia đình", icon: AccountIcon },
  { label: "Điểm dừng an toàn cho trẻ nhỏ", icon: ChatIcon },
  { label: "Nguồn nào cần kiểm chứng?", icon: SourceIcon },
];

const previewRows = [
  { title: "Asia Park", description: "điểm dừng buổi tối", icon: ProjectIcon },
  { title: "Nơi ở gần đó", description: "gợi ý khu vực lưu trú", icon: AccountIcon },
  { title: "Nguồn tham khảo", description: "đã duyệt · chính thức · web", icon: SourceIcon },
];

type HomeProps = {
  searchParams?: Promise<{
    ref?: string | string[];
  }>;
};

function getFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim());
  }

  return value?.trim() ? value : undefined;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const referralCode = getFirstParam(params?.ref);
  const nextPath = "/ai-ask";
  const signInParams = new URLSearchParams({ next: nextPath });

  if (referralCode) {
    signInParams.set("ref", referralCode);
  }

  const signInHref = `/sign-in?${signInParams.toString()}`;

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_18%_12%,rgba(20,83,45,0.12),transparent_30%),radial-gradient(circle_at_86%_14%,rgba(217,119,6,0.11),transparent_28%),linear-gradient(180deg,#fffdf8_0%,#ffffff_52%)]">
      <header className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
        <Link className="flex items-center gap-3 font-black tracking-[-0.03em] text-[#1f2937] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" href="/">
          <span className="grid size-10 place-items-center rounded-[0.9rem] bg-[linear-gradient(135deg,#14532d,#0f766e)] text-sm font-black text-white">
            XV
          </span>
          <span>XuyenViet</span>
        </Link>
        <nav className="flex items-center gap-3" aria-label="Lối vào công khai">
          <a
            className="hidden min-h-10 items-center rounded-full border border-[#e5e0d6] bg-white/70 px-4 py-2 text-sm font-bold text-[#1f2937] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82] sm:inline-flex"
            href="#product-preview"
          >
            Khám phá
          </a>
          <a
            className="inline-flex min-h-10 items-center rounded-full bg-[#14532d] px-4 py-2 text-sm font-bold text-white shadow-[0_12px_30px_rgba(20,83,45,0.24)] transition hover:bg-[#0f3f22] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
            href={signInHref}
          >
            Đăng nhập Google
          </a>
        </nav>
      </header>

      <main className="grid flex-1 place-items-center px-5 py-8 text-center sm:px-8 lg:px-12">
        <section className="w-full max-w-5xl">
          <p className="mx-auto mb-5 inline-flex rounded-full border border-[#14532d]/15 bg-[#e8f3ec]/85 px-4 py-2 text-sm font-extrabold text-[#14532d]">
            Vietnam road trips · AI-first
          </p>
          <h1 className="mx-auto max-w-4xl text-5xl font-black leading-[0.96] tracking-[-0.075em] text-[#1f2937] sm:text-7xl lg:text-8xl">
            Lên kế hoạch xuyên Việt trong một cuộc trò chuyện.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#6b7280] sm:text-xl">
            Hỏi bằng tiếng Việt. XuyenViet gợi ý tuyến đường, điểm dừng, khách sạn, nguồn tham khảo và các lưu ý cần kiểm chứng.
          </p>

          <form
            action="/sign-in"
            aria-label="Hộp hỏi AI yêu cầu đăng nhập"
            className="mx-auto mt-9 grid w-full max-w-3xl gap-3 rounded-[1.75rem] border border-[#e5e0d6] bg-white/90 p-3 text-left shadow-[0_24px_80px_rgba(31,41,55,0.12)] sm:grid-cols-[minmax(0,1fr)_auto]"
            method="get"
          >
            <input name="next" type="hidden" value={nextPath} />
            {referralCode ? <input name="ref" type="hidden" value={referralCode} /> : null}
            <label className="sr-only" htmlFor="public-ask-draft">
              Câu hỏi chuyến đi
            </label>
            <input
              className="min-h-14 rounded-2xl border-0 bg-transparent px-4 text-base text-[#1f2937] outline-none placeholder:text-[#6b7280] focus:ring-4 focus:ring-[#8fb59f]"
              id="public-ask-draft"
              maxLength={500}
              name="draft"
              placeholder="Bạn muốn đi đâu? Ví dụ: Hà Nội đi Huế 5 ngày cùng gia đình..."
              type="text"
            />
            <button
              className="min-h-14 rounded-2xl bg-[#14532d] px-6 text-base font-black text-white transition hover:bg-[#0f3f22] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
              type="submit"
              aria-label="Đăng nhập để hỏi AI"
            >
              <span>Đăng nhập để hỏi</span>
              <span className="ml-2" aria-hidden="true">→</span>
            </button>
          </form>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#6b7280]">
            Bạn cần đăng nhập trước khi XuyenViet tạo hội thoại, dùng nguồn tham khảo hoặc gọi AI.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3" aria-label="Gợi ý bắt đầu">
            {starterPrompts.map(({ icon: Icon, label }) => (
              <a
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e5e0d6] bg-white/75 px-4 py-2 text-sm font-bold text-[#1f2937] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
                href={signInHref}
                key={label}
              >
                <Icon className="public-starter-icon size-4 text-[#14532d]" />
                {label}
              </a>
            ))}
          </div>

          <section className="mx-auto mt-11 grid w-full max-w-5xl gap-4 text-left lg:grid-cols-[1.1fr_0.9fr]" id="product-preview" aria-label="Xem trước sản phẩm">
            <article className="rounded-3xl border border-[#e5e0d6] bg-white/80 p-6 shadow-[0_16px_48px_rgba(31,41,55,0.08)]">
              <h2 className="text-xl font-extrabold text-[#1f2937]">Trò chuyện ở giữa. Chi tiết ở bên phải.</h2>
              <p className="mt-3 text-base leading-7 text-[#6b7280]">
                Khi bạn chọn một địa điểm, khách sạn, nguồn hoặc chặng đường trong câu trả lời, XuyenViet mở panel chi tiết để xem nhanh thông tin liên quan.
              </p>
            </article>
            <article className="grid gap-3 rounded-3xl border border-[#e5e0d6] bg-white/80 p-5 shadow-[0_16px_48px_rgba(31,41,55,0.08)]" aria-label="Ví dụ panel chi tiết">
              {previewRows.map(({ icon: Icon, ...row }) => (
                <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 rounded-2xl bg-[#f8fafc] p-3" key={row.title}>
                  <span className="grid size-8 place-items-center rounded-xl bg-[#e8f3ec] text-sm font-black text-[#14532d]" aria-hidden="true">
                    <Icon className="public-preview-icon size-4" />
                  </span>
                  <span>
                    <strong className="block text-sm text-[#1f2937]">{row.title}</strong>
                    <span className="text-xs text-[#6b7280]">{row.description}</span>
                  </span>
                </div>
              ))}
            </article>
          </section>
        </section>
      </main>

      <footer className="px-5 py-5 text-center text-sm leading-6 text-[#6b7280]" id="quyen-rieng-tu">
        Quyền riêng tư: XuyenViet chỉ lưu nội dung cần thiết để hỗ trợ cuộc trò chuyện và kế hoạch chuyến đi; bạn có thể xoá chúng bất cứ lúc nào. Câu trả lời AI có thể chứa thông tin du lịch thay đổi theo thời gian. Hãy kiểm tra giá, giờ mở cửa, tình trạng đường và đặt chỗ trước khi quyết định.
      </footer>
    </div>
  );
}
