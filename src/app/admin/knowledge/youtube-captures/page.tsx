import Link from "next/link";

import { countAdminYoutubeCaptureReviews, listAdminYoutubeCaptureReviews } from "@/features/knowledge/youtube-capture-review-admin";

type YoutubeCaptureQueuePageProps = {
  searchParams: Promise<{ page?: string }>;
};

const pageSize = 25;

export default async function YoutubeCaptureQueuePage({ searchParams }: YoutubeCaptureQueuePageProps) {
  const params = await searchParams;
  const currentPage = parsePage(params.page);
  const offset = (currentPage - 1) * pageSize;
  const [captures, totalCount] = await Promise.all([listAdminYoutubeCaptureReviews({ limit: pageSize, offset }), countAdminYoutubeCaptureReviews()]);
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = offset + captures.length < totalCount;

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Nguồn YouTube/cộng đồng</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Hàng đợi duyệt evidence YouTube.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">Video đã được capture thành evidence có giới hạn. Mở chi tiết để kiểm tra claim, mốc thời gian, confidence và freshness trước khi tạo bản nháp.</p>

      <section className="mt-8 grid gap-4">
        {captures.length === 0 ? (
          <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Chưa có video đã capture cần kiểm tra</h2>
            <p className="mt-3 leading-7 text-[#4f625a]">Sau khi chạy `pnpm youtube:capture` thành công với evidence hợp lệ, video sẽ xuất hiện ở đây để chuyển sang hàng đợi bản nháp.</p>
          </div>
        ) : (
          captures.map((capture) => (
            <article key={capture.sourceId} className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 shadow-[0_12px_30px_rgba(41,33,18,0.08)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Evidence YouTube đã capture</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{capture.sourceLabel}</h2>
                  <p className="mt-3 inline-flex rounded-full border border-[#d8c9ad] bg-[#f4ead7] px-3 py-1 text-sm font-semibold text-[#8c4f13]">Nguồn YouTube/cộng đồng, chưa xác minh</p>
                </div>
                <Link className="min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 text-center font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" href={`/admin/knowledge/youtube-captures/${encodeURIComponent(capture.sourceId)}`}>Mở chi tiết duyệt</Link>
              </div>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Evidence hợp lệ" value={`${capture.evidenceCount} mục · ${Array.from(new Set(capture.evidence.map((item) => item.category))).join(", ")}`} />
                <Info label="Thời điểm capture" value={capture.capturedAt ? formatDate(capture.capturedAt) : formatDate(capture.createdAt)} />
                <Info label="Capture" value={[capture.captureMethod, capture.model].filter(Boolean).join(" · ") || "Chưa có"} />
                <Info label="Thẻ đã liên kết" value={capture.activeExtractionJob ? `Đang trích xuất · ${capture.activeExtractionJob.status}` : capture.existingCards.length ? `${capture.existingCards.length} thẻ` : "Chưa có"} />
              </dl>
            </article>
          ))
        )}
      </section>

      {(hasPreviousPage || hasNextPage) && <nav className="mt-8 flex flex-col gap-3 rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-4 text-sm font-semibold text-[#4f625a] sm:flex-row sm:items-center sm:justify-between" aria-label="Phân trang capture YouTube"><p>Trang {currentPage} · hiển thị {captures.length} / {totalCount} video đã capture.</p><div className="flex gap-2">{hasPreviousPage && <Link className="rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 py-2 text-[#17342c]" href={pageHref(currentPage - 1)}>Trang trước</Link>}{hasNextPage && <Link className="rounded-2xl border border-[#1f5f46] bg-[#1f5f46] px-4 py-2 text-white" href={pageHref(currentPage + 1)}>Trang sau</Link>}</div></nav>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-[#fbf7ed] p-3"><dt className="font-semibold text-[#17342c]">{label}</dt><dd className="mt-1 break-words text-[#4f625a]">{value}</dd></div>; }
function formatDate(value: Date | string) { return new Date(value).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }); }
function parsePage(value: string | undefined) { const page = Number.parseInt(value ?? "1", 10); return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10_000) : 1; }
function pageHref(page: number) { return `/admin/knowledge/youtube-captures?page=${page}`; }
