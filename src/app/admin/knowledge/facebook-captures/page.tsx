import Link from "next/link";

import { type KnowledgeIngestionStage } from "@/db/schema";
import { facebookCaptureQueueFilters, listAdminFacebookCaptureQueue, listAdminFacebookCaptureQueueCounts, parseFacebookCaptureQueueFilter, type FacebookCaptureQueueFilter } from "@/features/knowledge/facebook-capture-review-admin";

type FacebookCaptureReviewQueuePageProps = {
  searchParams: Promise<{
    page?: string;
    status?: string;
  }>;
};

const pageSize = 25;
const filterLabels: Record<FacebookCaptureQueueFilter, string> = { in_progress: "Đang xử lý", needs_attention: "Cần kiểm tra", failed: "Xử lý thất bại", published: "Đã xuất bản", suppressed: "Đã giữ lại" };
const emptyStateCopy: Record<FacebookCaptureQueueFilter, { title: string; body: string }> = {
  in_progress: { title: "Chưa có nội dung đang xử lý", body: "Các tác vụ đang chạy, đang chờ tạo hoặc đang chờ thu thập lại sẽ xuất hiện tại đây." },
  needs_attention: { title: "Chưa có nội dung cần kiểm tra", body: "Các nội dung cần vận hành kiểm tra hoặc xác minh trước sẽ xuất hiện tại đây." },
  failed: { title: "Chưa có nội dung xử lý thất bại", body: "Các nội dung có tác vụ xử lý thất bại sẽ xuất hiện tại đây để vận hành kiểm tra." },
  published: { title: "Chưa có dữ liệu nhập đã xuất bản", body: "Các nội dung có tác vụ xử lý chính ở trạng thái đã xuất bản sẽ xuất hiện tại đây." },
  suppressed: { title: "Chưa có dữ liệu nhập bị giữ lại", body: "Các nội dung có tác vụ xử lý chính ở trạng thái bị giữ lại sẽ xuất hiện tại đây." },
};

const ingestionStageLabels: Record<KnowledgeIngestionStage, string> = {
  queued: "Đang chờ xử lý",
  triaging: "Đang sàng lọc",
  extracting: "Đang trích xuất bằng chứng",
  judging: "Đang đánh giá bằng chứng",
  relating: "Đang đối chiếu thẻ liên quan",
  published: "Đã xuất bản chính thức",
  suppressed: "Đã giữ lại, không xuất bản",
  review_recommended: "Cần vận hành kiểm tra",
  verify_first: "Cần xác minh trước",
  failed: "Xử lý thất bại",
} as const;

function formatDate(value: Date | string | null) {
  if (!value) {
    return "Chưa có";
  }

  return new Date(value).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" });
}

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildFilterHref(filter: FacebookCaptureQueueFilter, page = 1) {
  const params = new URLSearchParams({ status: filter });

  if (page > 1) {
    params.set("page", String(page));
  }

  return `/admin/knowledge/facebook-captures?${params.toString()}`;
}

export default async function FacebookCaptureReviewQueuePage({ searchParams }: FacebookCaptureReviewQueuePageProps) {
  const params = await searchParams;
  const filter = parseFacebookCaptureQueueFilter(params.status);
  const currentPage = parsePage(params.page);
  const offset = (currentPage - 1) * pageSize;
  const [reviews, statusCounts] = await Promise.all([listAdminFacebookCaptureQueue({ filter, limit: pageSize, offset }), listAdminFacebookCaptureQueueCounts()]);
  const emptyState = emptyStateCopy[filter];
  const totalCount = statusCounts[filter];
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = offset + reviews.length < totalCount;

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Nguồn Facebook/cộng đồng</p>
       <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Hàng đợi xử lý nội dung Facebook.</h1>
       <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
         Nguồn Facebook/cộng đồng, chưa xác minh. Tác vụ xử lý chính quyết định vị trí trong hàng đợi; trạng thái duyệt chỉ phục vụ kiểm tra nội dung đã thu thập, thu thập lại và lịch sử trích xuất.
      </p>

      <section className="mt-6 rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {facebookCaptureQueueFilters.map((item) => (
            <Link
              className={`rounded-2xl border p-4 transition focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/35 ${
                 item === filter ? "border-[#1f5f46] bg-[#1f5f46] text-white" : "border-[#d8c9ad] bg-[#fbf7ed] text-[#4f625a] hover:bg-[#f4ead7]"
              }`}
               href={buildFilterHref(item)}
              key={item}
            >
               <span className="block text-sm font-semibold uppercase tracking-[0.18em] opacity-80">{filterLabels[item]}</span>
               <span className="mt-3 block text-3xl font-semibold tracking-[-0.03em]">{statusCounts[item]}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4">
        {reviews.length === 0 ? (
          <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{emptyState.title}</h2>
            <p className="mt-3 leading-7 text-[#4f625a]">{emptyState.body}</p>
          </div>
        ) : (
           reviews.map((review) => (
            <article key={review.id} className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 shadow-[0_12px_30px_rgba(41,33,18,0.08)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                   <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">{review.ingestionJob ? ingestionStageLabels[review.ingestionJob.stage] : "Thao tác thu thập"}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{review.sourceLabel}</h2>
                  <p className="mt-3 inline-flex rounded-full border border-[#d8c9ad] bg-[#f4ead7] px-3 py-1 text-sm font-semibold text-[#8c4f13]">Nguồn Facebook/cộng đồng, chưa xác minh</p>
                </div>
                <Link className="min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 text-center font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" href={`/admin/knowledge/facebook-captures/${encodeURIComponent(review.id)}`}>
                   Mở chi tiết
                </Link>
              </div>

               <div className="mt-5 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] p-3 text-sm leading-6 text-[#1f5f46]">
                 <span className="font-semibold">Trạng thái chính: </span>
                  {review.ingestionJob ? `Xử lý chính: ${ingestionStageLabels[review.ingestionJob.stage]}.` : review.captureOperation === "recapture_pending" ? "Nội dung đang chờ thu thập lại; chưa có tác vụ xử lý cho phiên bản hiện tại." : "Nội dung đang chờ tạo tác vụ xử lý chính."}
               </div>

               <div className="mt-4 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] p-3 text-sm leading-6 text-[#4f625a]">
                   <span className="font-semibold text-[#17342c]">Duyệt/thu thập lại: </span>
                   {review.status === "needs_review" ? "Cần duyệt theo luồng cũ" : review.status}
               </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">URL</dt>
                  <dd className="mt-1 break-all text-[#4f625a]">{review.sourceCanonicalUrl ?? review.sourceUrl ?? "Chưa có"}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                   <dt className="font-semibold text-[#17342c]">Thời điểm thu thập</dt>
                  <dd className="mt-1 text-[#4f625a]">{review.capturedAt ?? formatDate(review.createdAt)}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Nhóm / tác giả / ngày đăng gốc</dt>
                   <dd className="mt-1 text-[#4f625a]">{[review.groupName, review.authorText, review.postCreatedAt ? formatDate(review.postCreatedAt) : null].filter(Boolean).join(" · ") || "Chưa có thông tin bài viết đáng tin cậy"}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                   <dt className="font-semibold text-[#17342c]">Mức độ tin cậy</dt>
                   <dd className="mt-1 text-[#4f625a]">{review.sourceType}/{review.verificationStatus} · chính thức: {review.official ? "có" : "không"} · đối tác: {review.partner ? "có" : "không"}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Thẻ đã liên kết</dt>
                  <dd className="mt-1 text-[#4f625a]">{review.existingCards.length === 0 ? "Chưa có" : `${review.existingCards.length} thẻ`}</dd>
                </div>
               </dl>
              </article>
          ))
        )}
      </section>

      {(hasPreviousPage || hasNextPage) && (
        <nav className="mt-8 flex flex-col gap-3 rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-4 text-sm font-semibold text-[#4f625a] sm:flex-row sm:items-center sm:justify-between" aria-label="Phân trang nội dung Facebook">
          <p>
             Trang {currentPage} · hiển thị {reviews.length} / {totalCount} nội dung trong nhóm {filterLabels[filter]}.
          </p>
          <div className="flex gap-2">
            {hasPreviousPage ? (
               <Link className="rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 py-2 text-[#17342c] transition hover:bg-[#f4ead7]" href={buildFilterHref(filter, currentPage - 1)}>
                Trang trước
              </Link>
            ) : null}
            {hasNextPage ? (
               <Link className="rounded-2xl border border-[#1f5f46] bg-[#1f5f46] px-4 py-2 text-white transition hover:bg-[#194d39]" href={buildFilterHref(filter, currentPage + 1)}>
                Trang sau
              </Link>
            ) : null}
          </div>
        </nav>
      )}
    </div>
  );
}
