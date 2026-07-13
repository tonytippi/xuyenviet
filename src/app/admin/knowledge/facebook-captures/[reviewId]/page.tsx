import Link from "next/link";
import { notFound } from "next/navigation";

import { type FacebookCaptureReviewStatus } from "@/db/schema";
import { sourceKnowledgeDraftExtractionPromptVersion } from "@/features/ai/prompts";
import { extractAndApproveFacebookCaptureDraftsForm, extractKnowledgeDraftsFromFacebookCaptureForm, requestFacebookCaptureRecaptureForm } from "@/features/knowledge/actions";
import { getAdminFacebookCaptureReviewDetail } from "@/features/knowledge/facebook-capture-review-admin";

import { ApproveAllSubmitStatus } from "./approve-all-submit-status";

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

  const hasExtractionCards = review.existingCards.some((card) => card.aiPromptVersion === sourceKnowledgeDraftExtractionPromptVersion);
  const isRetryableExtractionStatus = review.status === "needs_review" || review.status === "extraction_failed";
  const canExtract = isRetryableExtractionStatus && Boolean(review.rawText?.trim()) && review.sourceType === "community" && !hasExtractionCards;
  const canExtractAndApproveAll = canExtract;
  const canRecapture = (review.status === "needs_review" || review.status === "extraction_failed" || review.status === "rejected") && !hasExtractionCards;
  const draftCards = review.existingCards.filter((card) => card.status === "draft");
  const approvedCards = review.existingCards.filter((card) => card.status === "approved");
  const extractedCount = getSearchParam(query.extracted);
  const approvedAllCount = getSearchParam(query.approvedAll);
  const rejected = getSearchParam(query.rejected) === "1";
  const rejectError = getSearchParam(query.rejectError);
  const rejectStatus = getSearchParam(query.rejectStatus);
  const reopened = getSearchParam(query.reopened) === "1";
  const reopenError = getSearchParam(query.reopenError);
  const reopenStatus = getSearchParam(query.reopenStatus);
  const recaptureRequested = getSearchParam(query.recaptureRequested) === "1";
  const recaptureError = getSearchParam(query.recaptureError);
  const recaptureStatus = getSearchParam(query.recaptureStatus);
  const extractError = getSearchParam(query.extractError);
  const approveAllError = getSearchParam(query.approveAllError);
  const approveAllStatus = getSearchParam(query.approveAllStatus);
  const approveAllRecoveryStatus = getSearchParam(query.approveAllRecoveryStatus);
  const approvalFailed = getSearchParam(query.approvalFailed) === "1";
  const approvalError = getSearchParam(query.approvalError);
  const recoveryStatus = getSearchParam(query.recoveryStatus);
  const failureStatus = getSearchParam(query.failureStatus);
  const errorCode = getSearchParam(query.errorCode);
  const errorDetail = getSearchParam(query.errorDetail);
  const statusReason = getSearchParam(query.statusReason);
  const alreadyExtracted = getSearchParam(query.alreadyExtracted) === "1";

  return (
    <div>
      <Link className="text-sm font-semibold text-[#1f5f46] underline underline-offset-4" href={`/admin/knowledge/facebook-captures?status=${review.status}`}>
        Quay lại hàng đợi Facebook
      </Link>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Capture Facebook cần vận hành kiểm tra</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{review.sourceLabel}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Nội dung này chỉ dành cho vận hành. Chưa trích xuất, chưa duyệt, chưa dùng cho câu trả lời của khách.
      </p>

      {(extractedCount || approvedAllCount || rejected || rejectError || rejectStatus || reopened || reopenError || reopenStatus || recaptureRequested || recaptureError || recaptureStatus || extractError || approveAllError || approveAllStatus || approveAllRecoveryStatus || approvalFailed || recoveryStatus || alreadyExtracted) && (
        <section className="mt-6 rounded-2xl border border-[#d8c9ad] bg-white/80 p-4 text-sm leading-6 text-[#17342c]">
          {extractedCount ? (
            <div>
              <p>
                Đã tạo {extractedCount} bản nháp. Mở{" "}
                <Link className="font-semibold text-[#1f5f46] underline underline-offset-4" href="/admin/knowledge/drafts">
                  hàng đợi bản nháp
                </Link>{" "}
                để kiểm tra trước khi phê duyệt.
              </p>
              {draftCards.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {draftCards.map((card) => (
                    <Link className="rounded-xl border border-[#8fb59f] bg-[#edf7ef] px-3 py-2 font-semibold text-[#1f5f46]" href={`/admin/knowledge/drafts/${encodeURIComponent(card.id)}`} key={card.id}>
                      Mở draft: {card.title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {rejected ? <p>Đã từ chối capture. Nội dung này không còn nằm trong hàng đợi cần xử lý và chưa tạo thẻ tri thức.</p> : null}
          {rejectError ? <p>Lý do từ chối không an toàn hoặc capture này không thể từ chối.</p> : null}
          {rejectStatus ? <p>Capture này không chuyển sang trạng thái từ chối ({rejectStatus}). Kiểm tra trạng thái hiện tại trước khi thử lại.</p> : null}
          {reopened ? <p>Đã mở lại nguồn để capture lại. Chạy công cụ capture Facebook để lấy text mới rồi duyệt lại.</p> : null}
          {reopenError ? <p>Lý do mở lại không an toàn hoặc capture này không thể mở lại.</p> : null}
          {reopenStatus ? <p>Capture này không thể mở lại để capture lại ({reopenStatus}). Kiểm tra trạng thái hiện tại trước khi thử lại.</p> : null}
          {recaptureRequested ? <p>Đã đưa capture này về hàng đợi recapture. Chạy công cụ capture Facebook để lấy text mới rồi quay lại duyệt.</p> : null}
          {recaptureError ? <p>Lý do recapture không an toàn hoặc capture này không thể recapture.</p> : null}
          {recaptureStatus ? <p>Capture này không thể recapture ({recaptureStatus}). Kiểm tra trạng thái review và thẻ liên kết hiện có.</p> : null}
          {approvedAllCount ? (
            <div>
              <p>
                Đã trích xuất và phê duyệt {approvedAllCount} thẻ. Confidence nguồn Facebook/cộng đồng vẫn được giữ theo guardrail. Mở{" "}
                <Link className="font-semibold text-[#1f5f46] underline underline-offset-4" href="/admin/knowledge/approved">
                  danh sách thẻ đã duyệt
                </Link>
                .
              </p>
              {approvedCards.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {approvedCards.map((card) => (
                    <Link className="rounded-xl border border-[#8fb59f] bg-[#edf7ef] px-3 py-2 font-semibold text-[#1f5f46]" href={`/admin/knowledge/approved/${encodeURIComponent(card.id)}`} key={card.id}>
                      Mở thẻ approved: {card.title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {extractError ? (
            <p>
              Không thể trích xuất capture này.
              {failureStatus === "updated" ? " Trạng thái đã chuyển sang Trích xuất lỗi để bạn kiểm tra hoặc thử lại." : " Trạng thái review có thể đã thay đổi; kiểm tra trạng thái và thẻ liên kết hiện có trước khi thử lại."}
            </p>
          ) : null}
          {approveAllError ? (
            <p>
              {approveAllError}
              {failureStatus === "updated" ? " Trạng thái đã được cập nhật an toàn nếu phù hợp." : " Kiểm tra trạng thái review và thẻ liên kết hiện có trước khi thử lại."}
              {errorCode ? ` Mã lỗi an toàn: ${errorCode}.` : null}
              {errorDetail ? ` Chi tiết an toàn: ${errorDetail}.` : null}
              {failureStatus ? ` Cập nhật trạng thái lỗi: ${failureStatus}.` : null}
              {statusReason ? ` Lý do cập nhật trạng thái: ${statusReason}.` : null}
            </p>
          ) : null}
          {approveAllStatus ? <p>Capture này không còn ở trạng thái có thể trích xuất và phê duyệt tất cả ({approveAllStatus}).</p> : null}
          {approveAllRecoveryStatus ? <p>Không thể hoàn tất cập nhật trạng thái approve-all ({approveAllRecoveryStatus}). Kiểm tra trạng thái review và các thẻ liên kết hiện có.</p> : null}
          {approvalFailed ? (
            <p>
              Đã tạo bản nháp nhưng chưa phê duyệt toàn bộ. Kiểm tra{" "}
              <Link className="font-semibold text-[#1f5f46] underline underline-offset-4" href="/admin/knowledge/drafts">
                hàng đợi bản nháp
              </Link>{" "}
              trước khi thử lại.
              {approvalError ? ` Mã lỗi an toàn: ${approvalError}.` : null}
            </p>
          ) : null}
          {recoveryStatus ? <p>Không thể hoàn tất cập nhật trạng thái sau khi trích xuất ({recoveryStatus}). Kiểm tra trạng thái review và các thẻ liên kết hiện có.</p> : null}
          {alreadyExtracted ? <p>Capture này đã có thẻ được trích xuất. Kiểm tra các thẻ liên kết thay vì trích xuất lại.</p> : null}
        </section>
      )}

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
            <dt className="font-semibold text-[#17342c]">Tác giả / timestamp hiển thị</dt>
            <dd className="mt-1 text-[#4f625a]">{[review.authorText, review.timestampText].filter(Boolean).join(" · ") || "Chưa có"}</dd>
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
            <p className="rounded-2xl bg-[#fbf7ed] p-3 text-[#4f625a]">Chưa có thẻ draft/approved liên kết với capture này.</p>
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
        {canExtract ? (
          <div className="mt-4 rounded-2xl border border-[#d8c9ad] bg-white/75 p-4">
            <p className="text-sm font-semibold text-[#17342c]">AI sẽ tạo thẻ nháp để bạn duyệt. Chưa có thẻ nào được phê duyệt hoặc dùng cho câu trả lời của khách.</p>
            <form action={extractKnowledgeDraftsFromFacebookCaptureForm} className="mt-4">
              <input name="reviewId" type="hidden" value={review.id} />
              <button className="min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" type="submit">
                Trích xuất bản nháp
              </button>
            </form>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm leading-6 text-[#4f625a]">
            Capture này đã có thẻ liên kết hoặc không còn ở trạng thái có thể trích xuất mới. Kiểm tra bản nháp hoặc thẻ đã duyệt thay vì trích xuất lại.
          </p>
        )}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {canExtractAndApproveAll ? (
            <div className="rounded-2xl border border-[#d99a93] bg-[#fff7f2] p-4">
              <p className="text-sm font-semibold leading-6 text-[#9b2f29]">Hành động này tạo thẻ bằng AI rồi phê duyệt ngay. Chỉ dùng khi capture đáng tin cậy và đã được kiểm tra.</p>
              <form action={extractAndApproveFacebookCaptureDraftsForm} className="mt-4 space-y-4">
                <input name="reviewId" type="hidden" value={review.id} />
                <label className="flex gap-3 rounded-2xl border border-[#d8c9ad] bg-white/80 p-3 text-sm font-semibold leading-6 text-[#17342c]">
                  <input className="mt-1 size-4 accent-[#1f5f46]" name="approveAllConfirmed" type="checkbox" />
                  <span>Tôi đã kiểm tra nội dung capture, trust/confidence và freshness; có thể trích xuất và phê duyệt tất cả thẻ được tạo.</span>
                </label>
                <ApproveAllSubmitStatus />
              </form>
            </div>
          ) : (
            <p className="rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm leading-6 text-[#4f625a]">Extract & Approve All chỉ khả dụng khi capture đang cần duyệt hoặc trích xuất lỗi, có raw text đọc được, chưa có thẻ trích xuất và vẫn là nguồn Facebook/cộng đồng chưa xác minh.</p>
          )}
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
          {!canRecapture ? <p className="rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm leading-6 text-[#4f625a]">Recapture chỉ khả dụng khi capture chưa có thẻ trích xuất được liên kết.</p> : null}
        </div>
      </section>
    </div>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
