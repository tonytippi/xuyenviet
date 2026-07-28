import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { type FacebookCaptureReviewStatus } from "@/db/schema";
import { requestFacebookCaptureRecaptureForm, rerunFacebookCanonicalIngestionForm } from "@/features/knowledge/actions";
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

const candidateReasonDetails: Record<string, string> = {
  candidate_invalid_structure: "AI trả candidate không theo cấu trúc bắt buộc, ví dụ type không thuộc danh sách canonical hoặc thiếu object evidence.",
  candidate_missing_required_fields: "AI thiếu trường bắt buộc: type hợp lệ, title, summary, location/cung đường, freshness flag hoặc quote evidence.",
  candidate_sensitive_content: "Candidate hoặc quote có số điện thoại/email nên bị loại để không lưu thông tin liên hệ vào knowledge.",
  candidate_evidence_mismatch: "Candidate được hiển thị để vận hành kiểm tra, nhưng quote AI trả về không xuất hiện nguyên văn trong raw capture sau khi redaction. Hệ thống không tạo evidence, không gửi candidate sang judge và không xuất bản.",
  candidate_insufficient_travel_context: "Candidate không qua deterministic travel-context gate: nội dung có thể là quảng cáo, câu hỏi, nhận xét quá chung chung hoặc thiếu chi tiết du lịch có thể hành động.",
  invalid_discovery_candidate: "Candidate bị loại ở discovery cũ trước khi hệ thống lưu reason chi tiết. Xem raw AI response của lần xử lý hiện tại hoặc retry để có chẩn đoán cụ thể.",
  judge_evidence_not_grounded: "Bộ đánh giá không tìm được đoạn nguyên văn liên tục trong nội dung đã capture để làm bằng chứng. Candidate không được đối chiếu hoặc xuất bản.",
  judge_suppressed: "Bộ đánh giá đã xác nhận bằng chứng, nhưng quyết định nội dung này không nên được dùng hoặc xuất bản theo chính sách hiện hành.",
  judge_below_quality_threshold: "Bộ đánh giá đã xác nhận bằng chứng, nhưng các điểm chất lượng không đạt ngưỡng tối thiểu để dùng làm tri thức chuẩn.",
  relation_ambiguous: "Bằng chứng đủ điều kiện, nhưng hệ thống không thể xác định an toàn candidate nên gắn vào hay tạo quan hệ với thẻ tri thức nào.",
  relation_invalid: "Bộ đánh giá quan hệ trả về yêu cầu tạo mới kèm một thẻ đích, là cấu trúc không hợp lệ nên candidate được giữ lại để vận hành kiểm tra.",
  stale_relation_target: "Thẻ tri thức đích đã thay đổi hoặc không còn phù hợp trong lúc worker xử lý. Candidate được giữ lại để tránh gắn bằng chứng sai.",
  attach_condition_mismatch: "Điều kiện của candidate không khớp thẻ tri thức đích nên hệ thống không gắn bằng chứng vào thẻ đó.",
  conflict_condition_mismatch: "Điều kiện của candidate không khớp thẻ tri thức xung đột nên hệ thống không tạo xung đột trên thẻ đó.",
};

const candidateStageLabels: Record<string, string> = {
  queued: "Chờ xử lý",
  judging: "Đang đánh giá",
  relating: "Đang đối chiếu",
  published: "Đã xuất bản",
  suppressed: "Không xuất bản",
  review_recommended: "Cần kiểm tra",
  verify_first: "Cần xác minh",
  failed: "Lỗi xử lý",
};

const candidateStageClasses: Record<string, string> = {
  queued: "border-[#d8c9ad] bg-[#fbf7ed] text-[#6d5635]",
  judging: "border-[#9bbbd2] bg-[#edf6fb] text-[#175474]",
  relating: "border-[#9bbbd2] bg-[#edf6fb] text-[#175474]",
  published: "border-[#8fb59f] bg-[#edf7ef] text-[#1f5f46]",
  suppressed: "border-[#d99a93] bg-[#fff0ee] text-[#9b2f29]",
  review_recommended: "border-[#e3b568] bg-[#fff7dd] text-[#8c4f13]",
  verify_first: "border-[#c8a6d8] bg-[#f8eefb] text-[#6f357d]",
  failed: "border-[#d99a93] bg-[#fff0ee] text-[#9b2f29]",
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
  const ingestionRerun = getSearchParam(query.ingestionRerun) === "1";
  const ingestionRerunError = getSearchParam(query.ingestionRerunError) === "1";
  const canRerunIngestion = review.ingestionJob?.protocolVersion === 2;
  const candidateStage = getSearchParam(query.candidateStage);
  const candidateReason = getSearchParam(query.candidateReason);
  const v2IngestionJob = review.ingestionJob?.protocolVersion === 2 ? review.ingestionJob : null;
  const candidates = v2IngestionJob?.candidates.filter((candidate) => (!candidateStage || candidate.stage === candidateStage) && (!candidateReason || candidate.outcomeReasonCode === candidateReason)) ?? [];
  const candidateStages = v2IngestionJob ? [...new Set(v2IngestionJob.candidates.map((candidate) => candidate.stage))] : [];
  const candidateReasons = v2IngestionJob ? [...new Set(v2IngestionJob.candidates.flatMap((candidate) => candidate.outcomeReasonCode ? [candidate.outcomeReasonCode] : []))] : [];

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

      {(rejected || rejectError || rejectStatus || reopened || reopenError || reopenStatus || recaptureRequested || recaptureError || recaptureStatus || ingestionRerun || ingestionRerunError) && (
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
            {ingestionRerun ? <p>Đã đưa canonical ingestion về hàng đợi chạy lại với pipeline hiện hành và cùng capture version.</p> : null}
            {ingestionRerunError ? <p>Canonical ingestion hiện không thể chạy lại. Kiểm tra job v2 và capture version hiện tại.</p> : null}
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] p-4 text-sm leading-6 text-[#17342c]">
        <p className="font-semibold">Trạng thái canonical ingestion</p>
        {review.ingestionJob ? (
          <>
            <p className="mt-1">{ingestionStageLabels[review.ingestionJob.stage]}. Worker tự xử lý và không cần thao tác phê duyệt/extract từ màn hình này.</p>
            <p className="mt-1 text-[#4f625a]">Job {review.ingestionJob.id} · lần thử {review.ingestionJob.attemptCount}/{review.ingestionJob.maxAttempts} · cập nhật {formatDate(review.ingestionJob.updatedAt)}</p>
            {review.ingestionJob.protocolVersion === 2 ? <p className="mt-1 text-[#4f625a]">Đa-fact v2: {review.ingestionJob.terminalCandidateCount}/{review.ingestionJob.discoveredCandidateCount} candidate đã hoàn tất · lỗi {review.ingestionJob.failedCandidateCount}.</p> : <p className="mt-1 text-[#4f625a]">Job legacy v1: kết quả lịch sử theo một candidate, không chuyển đổi sang v2.</p>}
            {review.ingestionJob.lastErrorCode ? <p className="mt-1 text-[#9b2f29]">Lý do: {ingestionReasonDetails[review.ingestionJob.lastErrorCode] ?? `Mã lỗi an toàn: ${review.ingestionJob.lastErrorCode}`}</p> : null}
          </>
        ) : <p className="mt-1">Chưa có canonical job cho capture version này. Kiểm tra deployment của knowledge-ingestion worker nếu trạng thái không được tạo sau capture.</p>}
      </section>

      {v2IngestionJob ? (
        <section className="mt-6 rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm text-[#17342c]">
          <p className="font-semibold">Candidate canonical an toàn</p>
          <p className="mt-1 text-[#4f625a]">Màu trạng thái: xanh lá đã xuất bản, đỏ không xuất bản/lỗi, vàng cần kiểm tra, tím cần xác minh, xanh dương đang xử lý.</p>
          {v2IngestionJob.candidateHasMore ? <p className="mt-1 text-[#4f625a]">Hiển thị {v2IngestionJob.candidates.length}/{v2IngestionJob.candidateTotalCount} candidate gần nhất theo thứ tự xử lý.</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterLink active={!candidateStage && !candidateReason} href={`/admin/knowledge/facebook-captures/${encodeURIComponent(reviewId)}`}>Tất cả ({v2IngestionJob.candidates.length})</FilterLink>
            {candidateStages.map((stage) => <FilterLink active={candidateStage === stage && !candidateReason} href={candidateFilterHref(reviewId, stage)} key={stage}>{candidateStageLabels[stage] ?? stage} ({v2IngestionJob.candidates.filter((candidate) => candidate.stage === stage).length})</FilterLink>)}
          </div>
          {candidateReasons.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{candidateReasons.map((reason) => <FilterLink active={candidateReason === reason} href={candidateFilterHref(reviewId, undefined, reason)} key={reason}>{reason} ({v2IngestionJob.candidates.filter((candidate) => candidate.outcomeReasonCode === reason).length})</FilterLink>)}</div> : null}
          <div className="mt-3 grid gap-2">
            {candidates.length === 0 ? <p className="rounded-xl bg-[#fbf7ed] p-3 text-[#4f625a]">Không có candidate khớp bộ lọc.</p> : candidates.map((candidate) => <div className="rounded-xl bg-[#fbf7ed] p-3" key={candidate.id}>
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{candidate.title}</p><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${candidateStageClasses[candidate.stage] ?? candidateStageClasses.queued}`}>{candidateStageLabels[candidate.stage] ?? candidate.stage}</span></div>
              <p className="mt-1 text-[#4f625a]">{candidate.type} · {candidate.locationName ?? candidate.routeSegment ?? "Không rõ phạm vi"}</p>
              {candidate.outcomeReasonCode ? <p className="mt-1 font-medium text-[#8c4f13]">Lý do: {candidate.outcomeReasonCode}</p> : null}
              <p className="mt-2 leading-6 text-[#4f625a]">{candidate.summary}</p>
              {candidate.conditions.length > 0 ? <p className="mt-2 text-[#4f625a]">Điều kiện: {candidate.conditions.join(" · ")}</p> : null}
              {candidate.judgmentSummary ? <p className="mt-2 text-[#4f625a]">Judge: {candidate.judgmentSummary}</p> : null}
              {candidate.outcomeReasonCode === "judge_below_quality_threshold" && candidate.scores ? <JudgmentScoreBreakdown scores={candidate.scores} /> : null}
              {isRejectedQuoteDiagnostic(candidate) ? <p className="mt-2 rounded-lg border border-[#d8c9ad] bg-white/70 p-2 leading-6 text-[#4f625a]">Quote AI bị từ chối: {candidate.rejectedQuoteText}</p> : null}
              {candidate.outcomeReasonCode && candidateReasonDetails[candidate.outcomeReasonCode] ? <p className="mt-2 rounded-lg border border-[#d8c9ad] bg-white/70 p-2 text-[#4f625a]">Diễn giải: {candidateReasonDetails[candidate.outcomeReasonCode]}</p> : null}
              {candidate.knowledgeCardId ? <Link className="mt-2 inline-block text-[#1f5f46] underline" href={`/admin/knowledge/approved/${encodeURIComponent(candidate.knowledgeCardId)}`}>Mở thẻ tri thức</Link> : null}
            </div>)}
          </div>
        </section>
      ) : null}

      {review.ingestionJob?.rawDiscoveryResponse ? <section className="mt-6 rounded-[1.5rem] border border-[#d99a93] bg-[#fff0ee] p-5 sm:p-6"><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#9b2f29]">Raw AI discovery response</h2><p className="mt-3 text-sm leading-6 text-[#9b2f29]">Chỉ admin được xem payload completion này để debug. Nó có thể chứa lại nội dung từ bài Facebook; không dùng làm evidence hoặc nội dung traveler-facing.</p><pre className="mt-5 max-h-[36rem] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-[#d99a93] bg-white/75 p-5 text-sm leading-6 text-[#17342c]">{review.ingestionJob.rawDiscoveryResponse}</pre></section> : null}

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
            {canRerunIngestion ? (
              <form action={rerunFacebookCanonicalIngestionForm} className="mb-4 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] p-4">
                <input name="reviewId" type="hidden" value={review.id} />
                <p className="text-sm font-semibold leading-6 text-[#17342c]">Chạy lại với pipeline hiện hành</p>
                <p className="mt-2 text-sm leading-6 text-[#4f625a]">Dùng sau khi thay đổi extraction hoặc judgment code. Hệ thống xóa candidate vận hành cũ, hủy lease worker đang chạy và chạy lại discovery với cùng raw capture. Raw capture và các thẻ tri thức đã tạo không bị thay đổi.</p>
                <button className="mt-4 min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" type="submit">
                  Re-run current pipeline
                </button>
             </form>
           ) : null}
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

function candidateFilterHref(reviewId: string, stage?: string, reason?: string) {
  const params = new URLSearchParams();
  if (stage) params.set("candidateStage", stage);
  if (reason) params.set("candidateReason", reason);
  const query = params.toString();
  return `/admin/knowledge/facebook-captures/${encodeURIComponent(reviewId)}${query ? `?${query}` : ""}`;
}

function FilterLink({ active, href, children }: { active: boolean; href: string; children: ReactNode }) {
  return <Link className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? "border-[#1f5f46] bg-[#1f5f46] text-white" : "border-[#d8c9ad] bg-white/70 text-[#4f625a] hover:border-[#8c4f13]"}`} href={href}>{children}</Link>;
}

const judgmentScoreRequirements = [
  { key: "relevance", label: "Mức liên quan", minimum: .75, comparison: "atLeast" },
  { key: "extractability", label: "Khả năng trích xuất", minimum: .70, comparison: "atLeast" },
  { key: "evidenceGrounding", label: "Độ khớp bằng chứng", minimum: .90, comparison: "atLeast" },
  { key: "specificity", label: "Độ cụ thể", minimum: .65, comparison: "atLeast" },
  { key: "actionability", label: "Khả năng áp dụng", minimum: .65, comparison: "atLeast" },
  { key: "firstHandLikelihood", label: "Khả năng là trải nghiệm trực tiếp", minimum: .55, comparison: "atLeast" },
  { key: "spamCommercialRisk", label: "Rủi ro quảng cáo", minimum: .25, comparison: "atMost" },
] as const;

function JudgmentScoreBreakdown({ scores }: { scores: Record<string, number> }) {
  const evaluated = judgmentScoreRequirements.flatMap((requirement) => typeof scores[requirement.key] === "number" ? [{ ...requirement, score: scores[requirement.key] }] : []);
  const failures = evaluated.filter(({ score, minimum, comparison }) => comparison === "atLeast" ? score < minimum : score > minimum);
  if (evaluated.length === 0) return null;

  return <div className="mt-2 rounded-lg border border-[#d99a93] bg-white/70 p-2 text-[#4f625a]">
    <p className="font-semibold text-[#9b2f29]">Tiêu chí chưa đạt: {failures.length > 0 ? failures.map(({ label }) => label).join(" · ") : "Không có dữ liệu điểm không đạt"}</p>
    <div className="mt-2 grid gap-1 sm:grid-cols-2">
      {evaluated.map(({ key, label, score, minimum, comparison }) => {
        const passed = comparison === "atLeast" ? score >= minimum : score <= minimum;
        return <p className={passed ? "text-[#4f625a]" : "font-semibold text-[#9b2f29]"} key={key}>{label}: {(score * 100).toFixed(0)}% {comparison === "atLeast" ? `(cần từ ${(minimum * 100).toFixed(0)}%)` : `(tối đa ${(minimum * 100).toFixed(0)}%)`}</p>;
      })}
    </div>
  </div>;
}

function isRejectedQuoteDiagnostic(value: object): value is { rejectedQuoteText: string } {
  return "rejectedQuoteText" in value && typeof value.rejectedQuoteText === "string";
}
