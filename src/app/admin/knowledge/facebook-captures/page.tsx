import Link from "next/link";

import { facebookCaptureReviewStatusValues, type FacebookCaptureReviewStatus } from "@/db/schema";
import { sourceKnowledgeDraftExtractionPromptVersion } from "@/features/ai/prompts";
import { extractAndApproveFacebookCaptureDraftsForm } from "@/features/knowledge/actions";
import { listAdminFacebookCaptureReviewStatusCounts, listAdminFacebookCaptureReviews, parseFacebookCaptureReviewStatus } from "@/features/knowledge/facebook-capture-review-admin";

import { ApproveAllSubmitStatus } from "./[reviewId]/approve-all-submit-status";

type FacebookCaptureReviewQueuePageProps = {
  searchParams: Promise<{
    approveAllQueued?: string;
    jobId?: string;
    page?: string;
    status?: string;
  }>;
};

const pageSize = 25;
const rawTextPreviewLength = 420;

const statusLabels: Record<FacebookCaptureReviewStatus, string> = {
  needs_review: "Cần duyệt",
  rejected: "Đã từ chối",
  extracted: "Đã trích xuất",
  extracted_approved: "Đã trích xuất và duyệt",
  extraction_failed: "Trích xuất lỗi",
};

const emptyStateCopy: Record<FacebookCaptureReviewStatus, { title: string; body: string }> = {
  needs_review: {
    title: "Chưa có capture cần duyệt",
    body: "Nếu vừa lưu link Facebook, hãy chạy công cụ capture trước; nếu đã xử lý xong, kiểm tra các filter Đã trích xuất, Đã trích xuất và duyệt, hoặc Đã từ chối.",
  },
  rejected: {
    title: "Chưa có capture đã từ chối",
    body: "Capture đã từ chối không còn nằm trong hàng đợi cần xử lý và chưa tạo thẻ tri thức cho traveler.",
  },
  extracted: {
    title: "Chưa có capture đã trích xuất",
    body: "Capture đã trích xuất sẽ liên kết tới bản nháp để vận hành duyệt tiếp. Nguồn Facebook/cộng đồng vẫn chưa xác minh cho tới khi thẻ được phê duyệt.",
  },
  extracted_approved: {
    title: "Chưa có capture đã trích xuất và duyệt",
    body: "Capture ở trạng thái này đã tạo thẻ approved nhưng vẫn giữ guardrail confidence cho nguồn Facebook/cộng đồng.",
  },
  extraction_failed: {
    title: "Chưa có capture trích xuất lỗi",
    body: "Nếu AI trích xuất lỗi, capture sẽ xuất hiện tại đây để vận hành kiểm tra an toàn trước khi thử lại hoặc từ chối.",
  },
};

const nextActionCopy: Record<FacebookCaptureReviewStatus, string> = {
  needs_review: "Kiểm tra raw text trong chi tiết rồi trích xuất bản nháp hoặc từ chối.",
  rejected: "Đã loại khỏi hàng đợi xử lý; chỉ mở lại nếu cần capture lại.",
  extracted: "Mở thẻ nháp đã liên kết để duyệt tiếp trước khi dùng cho traveler.",
  extracted_approved: "Đã tạo thẻ approved; kiểm tra thư viện nếu cần rà soát provenance.",
  extraction_failed: "Kiểm tra lỗi an toàn trong chi tiết, thử lại hoặc từ chối capture.",
};

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

function formatRawTextPreview(value: string | null) {
  const text = value?.trim().replace(/\s+/g, " ");

  if (!text) {
    return "Chưa có nội dung text.";
  }

  return text.length > rawTextPreviewLength ? `${text.slice(0, rawTextPreviewLength).trim()}...` : text;
}

function buildStatusHref(status: FacebookCaptureReviewStatus, page = 1) {
  const params = new URLSearchParams({ status });

  if (page > 1) {
    params.set("page", String(page));
  }

  return `/admin/knowledge/facebook-captures?${params.toString()}`;
}

export default async function FacebookCaptureReviewQueuePage({ searchParams }: FacebookCaptureReviewQueuePageProps) {
  const params = await searchParams;
  const status = parseFacebookCaptureReviewStatus(params.status);
  const currentPage = parsePage(params.page);
  const offset = (currentPage - 1) * pageSize;
  const [reviews, statusCounts] = await Promise.all([listAdminFacebookCaptureReviews({ status, limit: pageSize, offset }), listAdminFacebookCaptureReviewStatusCounts()]);
  const emptyState = emptyStateCopy[status];
  const totalCount = statusCounts[status];
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = offset + reviews.length < totalCount;
  const approveAllQueued = params.approveAllQueued === "1";
  const queuedJobId = params.jobId?.trim();

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Nguồn Facebook/cộng đồng</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Hàng đợi duyệt capture Facebook.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Nguồn Facebook/cộng đồng, chưa xác minh. Hàng đợi mặc định ưu tiên capture còn cần vận hành xử lý; danh sách chỉ hiển thị tóm tắt, mở chi tiết để đọc toàn bộ raw text trước khi trích xuất.
      </p>

      {approveAllQueued ? (
        <p className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] p-4 text-sm font-semibold leading-6 text-[#1f5f46]">
          Yêu cầu trích xuất và phê duyệt tất cả đã được đưa vào hàng đợi. Không cần bấm lại; hệ thống sẽ cập nhật khi hoàn tất.{queuedJobId ? ` Job: ${queuedJobId}.` : null}
        </p>
      ) : null}

      <section className="mt-6 rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {facebookCaptureReviewStatusValues.map((item) => (
            <Link
              className={`rounded-2xl border p-4 transition focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/35 ${
                item === status ? "border-[#1f5f46] bg-[#1f5f46] text-white" : "border-[#d8c9ad] bg-[#fbf7ed] text-[#4f625a] hover:bg-[#f4ead7]"
              }`}
              href={buildStatusHref(item)}
              key={item}
            >
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{item === "needs_review" || item === "extraction_failed" ? "Cần xử lý" : "Lịch sử"}</span>
              <span className="mt-2 block text-2xl font-semibold tracking-[-0.03em]">{statusCounts[item]}</span>
              <span className="mt-1 block text-sm font-semibold">{statusLabels[item]}</span>
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
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">{statusLabels[review.status]}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{review.sourceLabel}</h2>
                  <p className="mt-3 inline-flex rounded-full border border-[#d8c9ad] bg-[#f4ead7] px-3 py-1 text-sm font-semibold text-[#8c4f13]">Nguồn Facebook/cộng đồng, chưa xác minh</p>
                </div>
                <Link className="min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 text-center font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" href={`/admin/knowledge/facebook-captures/${encodeURIComponent(review.id)}`}>
                  Mở chi tiết duyệt
                </Link>
              </div>

              <div className="mt-5 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] p-3 text-sm leading-6 text-[#1f5f46]">
                <span className="font-semibold">Bước tiếp theo: </span>
                {nextActionCopy[review.status]}
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">URL</dt>
                  <dd className="mt-1 break-all text-[#4f625a]">{review.sourceCanonicalUrl ?? review.sourceUrl ?? "Chưa có"}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Thời điểm capture</dt>
                  <dd className="mt-1 text-[#4f625a]">{review.capturedAt ?? formatDate(review.createdAt)}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Tác giả / timestamp hiển thị</dt>
                  <dd className="mt-1 text-[#4f625a]">{[review.authorText, review.timestampText].filter(Boolean).join(" · ") || "Chưa có"}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Trust</dt>
                  <dd className="mt-1 text-[#4f625a]">{review.sourceType}/{review.verificationStatus} · official: {review.official ? "có" : "không"} · partner: {review.partner ? "có" : "không"}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Thẻ đã liên kết</dt>
                  <dd className="mt-1 text-[#4f625a]">{review.existingCards.length === 0 ? "Chưa có" : `${review.existingCards.length} thẻ`}</dd>
                </div>
                {review.status === "rejected" ? (
                  <div className="rounded-2xl bg-[#fbf7ed] p-3 sm:col-span-2">
                    <dt className="font-semibold text-[#17342c]">Lý do từ chối</dt>
                    <dd className="mt-1 text-[#4f625a]">{review.rejectionReason ?? "Chưa có"}</dd>
                    <dd className="mt-2 text-[#4f625a]">Capture đã từ chối không còn nằm trong hàng đợi cần xử lý và chưa tạo thẻ tri thức cho traveler.</dd>
                  </div>
                ) : null}
                <div className="rounded-2xl bg-[#fbf7ed] p-3 sm:col-span-2">
                  <dt className="font-semibold text-[#17342c]">Preview nội dung đã capture</dt>
                  <dd className="mt-2 break-words text-[#4f625a]">{formatRawTextPreview(review.rawText)}</dd>
                  <dd className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8c4f13]">Mở chi tiết để đọc toàn bộ raw text</dd>
                </div>
               </dl>
                {canExtractAndApproveAllFromQueue(review) ? (
                  <form action={extractAndApproveFacebookCaptureDraftsForm} className="mt-5 rounded-2xl border border-[#d99a93] bg-[#fff7f2] p-4">
                    <input name="reviewId" type="hidden" value={review.id} />
                    <input name="returnTo" type="hidden" value="facebook_capture_queue" />
                    <p className="text-sm font-semibold leading-6 text-[#9b2f29]">AI sẽ tạo và phê duyệt ngay tất cả thẻ từ capture này. Chỉ dùng sau khi đã kiểm tra nội dung, trust/confidence và freshness.</p>
                    <label className="mt-3 flex gap-3 rounded-2xl border border-[#d8c9ad] bg-white/80 p-3 text-sm font-semibold leading-6 text-[#17342c]">
                      <input className="mt-1 size-4 accent-[#1f5f46]" name="approveAllConfirmed" type="checkbox" />
                      <span>Tôi xác nhận capture này có thể được trích xuất và phê duyệt tất cả.</span>
                    </label>
                    <div className="mt-4">
                      <ApproveAllSubmitStatus />
                    </div>
                  </form>
                ) : null}
              </article>
          ))
        )}
      </section>

      {(hasPreviousPage || hasNextPage) && (
        <nav className="mt-8 flex flex-col gap-3 rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-4 text-sm font-semibold text-[#4f625a] sm:flex-row sm:items-center sm:justify-between" aria-label="Phân trang capture Facebook">
          <p>
            Trang {currentPage} · hiển thị {reviews.length} / {totalCount} capture trong trạng thái {statusLabels[status]}.
          </p>
          <div className="flex gap-2">
            {hasPreviousPage ? (
              <Link className="rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 py-2 text-[#17342c] transition hover:bg-[#f4ead7]" href={buildStatusHref(status, currentPage - 1)}>
                Trang trước
              </Link>
            ) : null}
            {hasNextPage ? (
              <Link className="rounded-2xl border border-[#1f5f46] bg-[#1f5f46] px-4 py-2 text-white transition hover:bg-[#194d39]" href={buildStatusHref(status, currentPage + 1)}>
                Trang sau
              </Link>
            ) : null}
          </div>
        </nav>
      )}
    </div>
  );
}

function canExtractAndApproveAllFromQueue(review: Awaited<ReturnType<typeof listAdminFacebookCaptureReviews>>[number]) {
  return (review.status === "needs_review" || review.status === "extraction_failed")
    && Boolean(review.rawText?.trim())
    && review.sourceType === "community"
    && !review.activeExtractionJob
    && !review.existingCards.some((card) => card.aiPromptVersion === sourceKnowledgeDraftExtractionPromptVersion);
}
