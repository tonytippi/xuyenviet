import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";
import { PublicAskForm } from "@/components/public-ask-form";
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
    <div className="flex min-h-[100dvh] flex-col bg-[#ffffff] text-[#202020]">
      <header className="flex h-16 items-center justify-between gap-4 border-b border-[#ececec] px-4 sm:px-6">
        <Link className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.025em] focus:outline-none" href="/">
          <BrandMark className="size-8" />
          <span>XuyenViet</span>
        </Link>
        <nav className="flex items-center gap-3" aria-label="Lối vào công khai">
          <a
            className="hidden min-h-9 items-center rounded-lg px-3 text-sm font-medium text-[#5f5f5f] transition hover:bg-[#f5f5f5] sm:inline-flex"
            href="#product-preview"
          >
            Khám phá
          </a>
          <a
            className="inline-flex min-h-9 items-center rounded-lg bg-[#202020] px-3.5 text-sm font-medium text-white transition hover:bg-[#383838] active:translate-y-px"
            href={signInHref}
            style={{ color: "#ffffff" }}
          >
            Đăng nhập Google
          </a>
        </nav>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <section className="w-full max-w-[760px] text-center">
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl">
            Mình sẽ đi đâu?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-[#6b6b6b]">
            Hỏi XuyenViet để lên tuyến đường, chọn điểm dừng, nơi ở và những điều cần kiểm chứng cho chuyến đi của bạn.
          </p>

          <PublicAskForm nextPath={nextPath} referralCode={referralCode} />
          <p className="mx-auto mt-3 max-w-xl text-xs leading-5 text-[#8a8a8a]">
            Đăng nhập để bắt đầu cuộc trò chuyện và lưu kế hoạch của bạn.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-2" aria-label="Gợi ý bắt đầu">
            {starterPrompts.map(({ icon: Icon, label }) => (
              <a
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#e2e2e2] bg-[#fafafa] px-3 text-sm font-medium text-[#4a4a4a] transition hover:bg-[#f3f3f3] active:translate-y-px"
                href={signInHref}
                key={label}
              >
                <Icon className="public-starter-icon size-4 text-[#167c5a]" />
                {label}
              </a>
            ))}
          </div>

          <section className="mx-auto mt-12 grid w-full max-w-[680px] gap-px overflow-hidden rounded-2xl border border-[#e6e6e6] bg-[#e6e6e6] text-left sm:grid-cols-[1.05fr_0.95fr]" id="product-preview" aria-label="Xem trước sản phẩm">
            <article className="bg-white p-5">
              <h2 className="text-base font-semibold">Trò chuyện, rồi đi sâu hơn.</h2>
              <p className="mt-3 text-sm leading-6 text-[#6b6b6b]">
                Khi bạn chọn một địa điểm, khách sạn, nguồn hoặc chặng đường trong câu trả lời, XuyenViet mở panel chi tiết để xem nhanh thông tin liên quan.
              </p>
            </article>
            <article className="grid gap-2 bg-[#fafafa] p-4" aria-label="Ví dụ panel chi tiết">
              {previewRows.map(({ icon: Icon, ...row }) => (
                <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 rounded-xl bg-white p-3" key={row.title}>
                  <span className="grid size-8 place-items-center rounded-lg bg-[#edf7f2] text-sm font-black text-[#167c5a]" aria-hidden="true">
                    <Icon className="public-preview-icon size-4" />
                  </span>
                  <span>
                    <strong className="block text-sm text-[#303030]">{row.title}</strong>
                    <span className="text-xs text-[#777]">{row.description}</span>
                  </span>
                </div>
              ))}
            </article>
          </section>
        </section>
      </main>

      <footer className="border-t border-[#f0f0f0] px-5 py-4 text-center text-xs leading-5 text-[#858585]" id="quyen-rieng-tu">
        Quyền riêng tư: XuyenViet chỉ lưu nội dung cần thiết để hỗ trợ cuộc trò chuyện và kế hoạch chuyến đi; bạn có thể xoá chúng bất cứ lúc nào. Câu trả lời AI có thể chứa thông tin du lịch thay đổi theo thời gian. Hãy kiểm tra giá, giờ mở cửa, tình trạng đường và đặt chỗ trước khi quyết định.
      </footer>
    </div>
  );
}
