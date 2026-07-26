import Link from "next/link";
import { notFound } from "next/navigation";

import { type FacebookCaptureReviewStatus } from "@/db/schema";
import { requestFacebookCaptureRecaptureForm } from "@/features/knowledge/actions";
import { getAdminFacebookCaptureReviewDetail } from "@/features/knowledge/facebook-capture-review-admin";

type FacebookCaptureReviewDetailPageProps = {
  params: Promise<{
    reviewId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const statusLabels: Record<FacebookCaptureReviewStatus, string> = {
  needs_review: "Cần duyệt",
  rejected: "Đã từ chối",
  extracted: "Đã trích xuất",
  extracted_approved: "Đã trích xuất và duyệt",
  extraction_failed: "Trích xuất lỗi",
};

const ingestionStageLabels = {
  queued: "Đang chờ worker nhận job",
  triaging: "Đang sàng lọc nội dung",
  extracting: "Đang trích xuất candidate và evidence",
  judging: "Đang đánh giá chất lượng evidence",
  relating: "Đang đối chiếu thẻ tri thức liên quan",
  published: "Đã xuất bản canonical knowledge",
  suppressed: "Đã giữ lại, không xuất bản",
  review_recommended: "Cần vận hành kiểm tra",
  verify_first: "Cần xác minh trước khi dùng",
  failed: "Xử lý thất bại",
} as const;

const ingestionReasonDetails: Record<string, string> = {
  candidate_invalid_structure: "AI không trả về candidate theo cấu trúc được yêu cầu. Kiểm tra lại raw text; recapture nếu nội dung thiếu hoặc sai.",
  candidate_missing_required_fields: "AI không xác định đủ loại thông tin, tiêu đề, tóm tắt, địa điểm/cung đường hoặc evidence quote. Kiểm tra raw text; recapture nếu thiếu ngữ cảnh địa điểm hoặc hành trình.",
  candidate_sensitive_content: "Candidate có thông tin nhạy cảm nên bị loại theo chính sách. Không xuất bản nội dung này.",
  candidate_evidence_mismatch: "Evidence AI trích xuất không khớp chính xác với raw text capture. Recapture nếu text bị mất, sai hoặc không đầy đủ.",
  candidate_insufficient_travel_context: "Nội dung không đủ ngữ cảnh du lịch thực tế, hoặc mang tính quảng cáo, câu hỏi hay cảm nhận chung. Không cần thao tác thêm trừ khi raw text capture bị sai.",
};

function formatDate(value: Date | string | null) {
  if (!value) {
    return "Chưa có";
  }

  return new Date(value).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" });
}

export default async function FacebookCaptureReviewDetailPage({ params, searchParams }: FacebookCaptureReviewDetailPageProps) {
  const { reviewId } = await params;
  const query = (await searchParams) ?? {};
  const review = await getAdminFacebookCaptureReviewDetail(reviewId);

  if (!review) {
    notFound();
  }

  const canRecapture = review.status === "needs_review" || review.status === "extraction_failed" || review.status === "rejected";
  const rejected = getSearchParam(query.rejected) === "1";
  const rejectError = getSearchParam(query.rejectError);
  const rejectStatus = getSearchParam(query.rejectStatus);
  const reopened = getSearchParam(query.reopened) === "1";
  const reopenError = getSearchParam(query.reopenError);
  const reopenStatus = getSearchParam(query.reopenStatus);
  const recaptureRequested = getSearchParam(query.recaptureRequested) === "1";
  const recaptureError = getSearchParam(query.recaptureError);
  const recaptureStatus = getSearchParam(query.recaptureStatus);

  return (
    <div>
      <Link className="text-sm font-semibold text-[#1f5f46] underline underline-offset-4" href={`/admin/knowledge/facebook-captures?status=${review.status}`}>
        Quay lại hàng đợi Facebook
      </Link>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Capture Facebook cần vận hành kiểm tra</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{review.sourceLabel}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Nội dung này chỉ dành cho vận hành. Canonical ingestion xử lý capture tự động; chỉ outcome đủ điều kiện mới có thể được dùng cho câu trả lời của khách.
      </p>

      {(rejected || rejectError || rejectStatus || reopened || reopenError || reopenStatus || recaptureRequested || recaptureError || recaptureStatus) && (
        <section className="mt-6 rounded-2xl border border-[#d8c9ad] bg-white/80 p-4 text-sm leading-6 text-[#17342c]">
          {rejected ? <p>Đã từ chối capture. Nội dung này không còn nằm trong hàng đợi cần xử lý và chưa tạo thẻ tri thức.</p> : null}
          {rejectError ? <p>Lý do từ chối không an toàn hoặc capture này không thể từ chối.</p> : null}
          {rejectStatus ? <p>Capture này không chuyển sang trạng thái từ chối ({rejectStatus}). Kiểm tra trạng thái hiện tại trước khi thử lại.</p> : null}
          {reopened ? <p>Đã mở lại nguồn để capture lại. Chạy công cụ capture Facebook để lấy text mới rồi duyệt lại.</p> : null}
          {reopenError ? <p>Lý do mở lại không an toàn hoặc capture này không thể mở lại.</p> : null}
          {reopenStatus ? <p>Capture này không thể mở lại để capture lại ({reopenStatus}). Kiểm tra trạng thái hiện tại trước khi thử lại.</p> : null}
          {recaptureRequested ? <p>Đã đưa capture này về hàng đợi recapture. Chạy công cụ capture Facebook để lấy text mới rồi quay lại duyệt.</p> : null}
          {recaptureError ? <p>Lý do recapture không an toàn hoặc capture này không thể recapture.</p> : null}
          {recaptureStatus ? <p>Capture này không thể recapture ({recaptureStatus}). Kiểm tra trạng thái review và thẻ liên kết hiện có.</p> : null}
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] p-4 text-sm leading-6 text-[#17342c]">
        <p className="font-semibold">Trạng thái canonical ingestion</p>
        {review.ingestionJob ? (
          <>
            <p className="mt-1">{ingestionStageLabels[review.ingestionJob.stage]}. Worker tự xử lý và không cần thao tác phê duyệt/extract từ màn hình này.</p>
            <p className="mt-1 text-[#4f625a]">Job {review.ingestionJob.id} · lần thử {review.ingestionJob.attemptCount}/{review.ingestionJob.maxAttempts} · cập nhật {formatDate(review.ingestionJob.updatedAt)}</p>
            {review.ingestionJob.lastErrorCode ? <p className="mt-1 text-[#9b2f29]">Lý do: {ingestionReasonDetails[review.ingestionJob.lastErrorCode] ?? `Mã lỗi an toàn: ${review.ingestionJob.lastErrorCode}`}</p> : null}
          </>
        ) : <p className="mt-1">Chưa có canonical job cho capture version này. Kiểm tra deployment của knowledge-ingestion worker nếu trạng thái không được tạo sau capture.</p>}
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#f4ead7] p-5 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Nguồn Facebook/cộng đồng, chưa xác minh</p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Trạng thái review</dt>
            <dd className="mt-1 text-[#4f625a]">{statusLabels[review.status]}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Trust mặc định</dt>
            <dd className="mt-1 text-[#4f625a]">{review.sourceType}/{review.verificationStatus} · official: {review.official ? "có" : "không"} · partner: {review.partner ? "có" : "không"}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">URL nguồn</dt>
            <dd className="mt-1 break-all text-[#4f625a]">{review.sourceCanonicalUrl ?? review.sourceUrl ?? "Chưa có"}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Final URL capture</dt>
            <dd className="mt-1 break-all text-[#4f625a]">{review.finalUrl ?? "Chưa có"}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Capture metadata an toàn</dt>
            <dd className="mt-1 text-[#4f625a]">{review.captureMethod ?? "Chưa có"} · {review.capturedAt ?? formatDate(review.createdAt)}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Nhóm / tác giả / ngày đăng gốc</dt>
            <dd className="mt-1 text-[#4f625a]">{[review.groupName, review.authorText, review.postCreatedAt ? formatDate(review.postCreatedAt) : null].filter(Boolean).join(" · ") || "Chưa có metadata bài viết đáng tin cậy"}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Reviewer</dt>
            <dd className="mt-1 text-[#4f625a]">{review.reviewerUserId ?? "Chưa có"} · {formatDate(review.reviewedAt)}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Lỗi / lý do từ chối</dt>
            <dd className="mt-1 text-[#4f625a]">{review.rejectionReason ?? review.extractionError ?? "Chưa có"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Nội dung bài viết đã capture</h2>
        <p className="mt-3 rounded-2xl border border-[#d99a93] bg-[#fff0ee] p-3 text-sm font-semibold leading-6 text-[#9b2f29]">
          Raw text chỉ hiển thị trong route admin/operator này. Không hiển thị cookie, token, local storage, HTML dump, hidden data, provider payload hoặc browser profile.
        </p>
        <div className="mt-5 whitespace-pre-wrap break-words rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] p-5 text-base leading-8 text-[#17342c] sm:p-6">
          {review.rawText ?? "Chưa có nội dung text."}
        </div>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Thẻ tri thức đã liên kết</h2>
        <div className="mt-4 grid gap-3">
          {review.existingCards.length === 0 ? (
            <p className="rounded-2xl bg-[#fbf7ed] p-3 text-[#4f625a]">Chưa có thẻ tri thức liên kết với capture này.</p>
          ) : (
            review.existingCards.map((card) => (
              <div key={card.id} className="rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] p-4 text-sm text-[#4f625a]">
                {card.status === "approved" || card.status === "draft" ? (
                  <Link className="font-semibold text-[#17342c] underline underline-offset-4" href={card.status === "approved" ? `/admin/knowledge/approved/${encodeURIComponent(card.id)}` : `/admin/knowledge/drafts/${encodeURIComponent(card.id)}`}>
                    {card.title}
                  </Link>
                ) : (
                  <p className="font-semibold text-[#17342c]">{card.title}</p>
                )}
                <p className="mt-1">{card.type} · {card.status} · prompt: {card.aiPromptVersion}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#fbf7ed] p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Hành động vận hành</h2>
        <p className="mt-4 rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm leading-6 text-[#4f625a]">Các thẻ tri thức được tạo và quyết định publication bằng canonical ingestion pipeline. Màn hình này chỉ theo dõi trạng thái và hỗ trợ recapture khi nội dung capture có vấn đề.</p>
        <div className="mt-4">
          {canRecapture ? (
            <form action={requestFacebookCaptureRecaptureForm} className="rounded-2xl border border-[#d8c9ad] bg-white/75 p-4">
              <input name="reviewId" type="hidden" value={review.id} />
              <input name="recaptureReason" type="hidden" value="Operator requested recapture from detail page" />
              <p className="text-sm font-semibold leading-6 text-[#17342c]">Recapture</p>
              <p className="mt-2 text-sm leading-6 text-[#4f625a]">
                Xóa text capture hiện tại và đưa nguồn về hàng đợi capture lại. Dùng khi text bị lỗi, mất ký tự, chọn nhầm bài, hoặc cần lấy lại bằng script mới.
              </p>
              <button className="mt-4 min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" type="submit">
                Recapture
              </button>
            </form>
          ) : null}
          {!canRecapture ? <p className="rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm leading-6 text-[#4f625a]">Recapture không khả dụng với trạng thái review hiện tại.</p> : null}
        </div>
      </section>
    </div>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
