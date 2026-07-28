import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { type FacebookCaptureReviewStatus } from "@/db/schema";
import { requestFacebookCaptureRecaptureForm, rerunFacebookCanonicalIngestionForm } from "@/features/knowledge/actions";
import { getAdminFacebookCaptureReviewDetail, getFacebookCaptureQueueFilterForStage } from "@/features/knowledge/facebook-capture-review-admin";

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
  queued: "Đang chờ hệ thống nhận tác vụ",
  triaging: "Đang sàng lọc nội dung",
  extracting: "Đang trích xuất mục và bằng chứng",
  judging: "Đang đánh giá chất lượng bằng chứng",
  relating: "Đang đối chiếu thẻ tri thức liên quan",
   published: "Đã xuất bản tri thức chuẩn",
  suppressed: "Đã giữ lại, không xuất bản",
  review_recommended: "Cần vận hành kiểm tra",
  verify_first: "Cần xác minh trước khi dùng",
  failed: "Xử lý thất bại",
} as const;

const ingestionReasonDetails: Record<string, string> = {
  candidate_invalid_structure: "AI không trả về mục trích xuất theo cấu trúc được yêu cầu. Kiểm tra lại văn bản thô; thu thập lại nếu nội dung thiếu hoặc sai.",
  candidate_missing_required_fields: "AI không xác định đủ loại thông tin, tiêu đề, tóm tắt, địa điểm/cung đường hoặc trích dẫn làm bằng chứng. Kiểm tra văn bản thô; thu thập lại nếu thiếu ngữ cảnh địa điểm hoặc hành trình.",
  candidate_sensitive_content: "Mục trích xuất có thông tin nhạy cảm nên bị loại theo chính sách. Không xuất bản nội dung này.",
  candidate_evidence_mismatch: "Bằng chứng AI trích xuất không khớp chính xác với văn bản đã thu thập. Thu thập lại nếu văn bản bị mất, sai hoặc không đầy đủ.",
  candidate_insufficient_travel_context: "Nội dung không đủ ngữ cảnh du lịch thực tế, hoặc mang tính quảng cáo, câu hỏi hay cảm nhận chung. Không cần thao tác thêm trừ khi văn bản đã thu thập bị sai.",
};

const candidateReasonDetails: Record<string, string> = {
  candidate_invalid_structure: "AI trả mục trích xuất không theo cấu trúc bắt buộc, ví dụ loại thông tin không thuộc danh sách chuẩn hoặc thiếu bằng chứng.",
  candidate_missing_required_fields: "AI thiếu trường bắt buộc: loại thông tin hợp lệ, tiêu đề, tóm tắt, địa điểm/cung đường, cờ cần cập nhật hoặc trích dẫn làm bằng chứng.",
  candidate_sensitive_content: "Mục trích xuất hoặc trích dẫn có số điện thoại/email nên bị loại để không lưu thông tin liên hệ vào kho tri thức.",
  candidate_evidence_mismatch: "Mục trích xuất được hiển thị để vận hành kiểm tra, nhưng trích dẫn AI trả về không xuất hiện nguyên văn trong nội dung đã thu thập sau khi che dữ liệu nhạy cảm. Hệ thống không tạo bằng chứng, không gửi mục sang bước đánh giá và không xuất bản.",
  candidate_insufficient_travel_context: "Mục trích xuất không qua bước kiểm tra ngữ cảnh du lịch xác định: nội dung có thể là quảng cáo, câu hỏi, nhận xét quá chung chung hoặc thiếu chi tiết du lịch có thể áp dụng.",
  invalid_discovery_candidate: "Mục trích xuất bị loại ở bước phát hiện cũ trước khi hệ thống lưu lý do chi tiết. Xem phản hồi AI thô của lần xử lý hiện tại hoặc chạy lại để có chẩn đoán cụ thể.",
  judge_evidence_not_grounded: "Bộ đánh giá không tìm được đoạn nguyên văn liên tục trong nội dung đã thu thập để làm bằng chứng. Mục trích xuất không được đối chiếu hoặc xuất bản.",
  judge_suppressed: "Bộ đánh giá đã xác nhận bằng chứng, nhưng quyết định nội dung này không nên được dùng hoặc xuất bản theo chính sách hiện hành.",
  judge_below_quality_threshold: "Bộ đánh giá đã xác nhận bằng chứng, nhưng các điểm chất lượng không đạt ngưỡng tối thiểu để dùng làm tri thức chuẩn.",
  relation_ambiguous: "Bằng chứng đủ điều kiện, nhưng hệ thống không thể xác định an toàn mục trích xuất nên gắn vào hay tạo quan hệ với thẻ tri thức nào.",
  relation_invalid: "Bộ đánh giá quan hệ yêu cầu tạo mới kèm một thẻ đích, là cấu trúc không hợp lệ nên mục trích xuất được giữ lại để vận hành kiểm tra.",
  stale_relation_target: "Thẻ tri thức đích đã thay đổi hoặc không còn phù hợp trong lúc hệ thống xử lý. Mục trích xuất được giữ lại để tránh gắn bằng chứng sai.",
  attach_condition_mismatch: "Điều kiện của mục trích xuất không khớp thẻ tri thức đích nên hệ thống không gắn bằng chứng vào thẻ đó.",
  conflict_condition_mismatch: "Điều kiện của mục trích xuất không khớp thẻ tri thức xung đột nên hệ thống không tạo xung đột trên thẻ đó.",
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

const knowledgeCardStatusLabels: Record<string, string> = {
  approved: "Đã phê duyệt",
  draft: "Bản nháp",
  rejected: "Đã từ chối",
  archived: "Đã lưu trữ",
  duplicate: "Trùng lặp",
  no_action: "Không cần xử lý",
};

const sourceTypeLabels: Record<string, string> = {
  curated: "Đã tuyển chọn",
  community: "Cộng đồng",
};

const verificationStatusLabels: Record<string, string> = {
  unverified: "Chưa xác minh",
  verified: "Đã xác minh",
};

const knowledgeCardTypeLabels: Record<string, string> = {
  place: "Địa điểm",
  food: "Ăn uống",
  hotel_area: "Khu vực lưu trú",
  activity: "Hoạt động",
  service: "Dịch vụ",
  route_note: "Lưu ý cung đường",
  warning: "Cảnh báo",
  cost_note: "Lưu ý chi phí",
  parking: "Đỗ xe",
  ev_charging: "Sạc xe điện",
  kid_friendly_tip: "Gợi ý cho trẻ em",
  discount_promotion: "Ưu đãi",
  general_travel_tip: "Mẹo du lịch chung",
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
       <Link className="text-sm font-semibold text-[#1f5f46] underline underline-offset-4" href={`/admin/knowledge/facebook-captures?status=${getFacebookCaptureQueueFilterForStage(review.ingestionJob?.stage ?? null)}`}>
        Quay lại hàng đợi Facebook
      </Link>
       <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Chi tiết thu thập Facebook</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{review.sourceLabel}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
         Nội dung này chỉ dành cho vận hành. Hệ thống tự xử lý nội dung đã thu thập; chỉ kết quả đủ điều kiện mới có thể dùng để trả lời khách.
      </p>

      {(rejected || rejectError || rejectStatus || reopened || reopenError || reopenStatus || recaptureRequested || recaptureError || recaptureStatus || ingestionRerun || ingestionRerunError) && (
        <section className="mt-6 rounded-2xl border border-[#d8c9ad] bg-white/80 p-4 text-sm leading-6 text-[#17342c]">
           {rejected ? <p>Đã từ chối nội dung đã thu thập. Nội dung này không còn nằm trong hàng đợi cần xử lý và chưa tạo thẻ tri thức.</p> : null}
           {rejectError ? <p>Lý do từ chối không an toàn hoặc nội dung đã thu thập này không thể từ chối.</p> : null}
           {rejectStatus ? <p>Nội dung đã thu thập này không chuyển sang trạng thái từ chối ({rejectStatus}). Kiểm tra trạng thái hiện tại trước khi thử lại.</p> : null}
           {reopened ? <p>Đã mở lại nguồn để thu thập lại. Chạy công cụ thu thập Facebook để lấy văn bản mới rồi duyệt lại.</p> : null}
           {reopenError ? <p>Lý do mở lại không an toàn hoặc nội dung đã thu thập này không thể mở lại.</p> : null}
           {reopenStatus ? <p>Nội dung đã thu thập này không thể mở lại để thu thập lại ({reopenStatus}). Kiểm tra trạng thái hiện tại trước khi thử lại.</p> : null}
           {recaptureRequested ? <p>Đã đưa nội dung này về hàng đợi thu thập lại. Chạy công cụ thu thập Facebook để lấy văn bản mới rồi quay lại duyệt.</p> : null}
           {recaptureError ? <p>Lý do thu thập lại không an toàn hoặc nội dung này không thể thu thập lại.</p> : null}
             {recaptureStatus ? <p>Nội dung này không thể thu thập lại ({recaptureStatus}). Kiểm tra trạng thái duyệt và các thẻ đã liên kết.</p> : null}
             {ingestionRerun ? <p>Đã đưa tác vụ xử lý chính vào hàng đợi chạy lại theo quy trình hiện hành, với cùng phiên bản nội dung đã thu thập.</p> : null}
             {ingestionRerunError ? <p>Tác vụ xử lý chính hiện không thể chạy lại. Kiểm tra tác vụ phiên bản 2 và phiên bản nội dung đã thu thập hiện tại.</p> : null}
        </section>
      )}

       <section className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] p-4 text-sm leading-6 text-[#17342c]">
          <p className="font-semibold">Trạng thái chính: xử lý tự động</p>
        {review.ingestionJob ? (
          <>
            <p className="mt-1">{ingestionStageLabels[review.ingestionJob.stage]}. Tiến trình xử lý tự động; không cần phê duyệt hay trích xuất từ màn hình này.</p>
            <p className="mt-1 text-[#4f625a]">Mã tác vụ {review.ingestionJob.id} · lần thử {review.ingestionJob.attemptCount}/{review.ingestionJob.maxAttempts} · cập nhật {formatDate(review.ingestionJob.updatedAt)}</p>
            {review.ingestionJob.protocolVersion === 2 ? <p className="mt-1 text-[#4f625a]">Nhiều mục phiên bản 2: {review.ingestionJob.terminalCandidateCount}/{review.ingestionJob.discoveredCandidateCount} mục đã hoàn tất · lỗi {review.ingestionJob.failedCandidateCount}.</p> : <p className="mt-1 text-[#4f625a]">Tác vụ cũ phiên bản 1: kết quả lịch sử theo một mục, không chuyển đổi sang phiên bản 2.</p>}
            {review.ingestionJob.lastErrorCode ? <p className="mt-1 text-[#9b2f29]">Lý do: {ingestionReasonDetails[review.ingestionJob.lastErrorCode] ?? `Mã lỗi an toàn: ${review.ingestionJob.lastErrorCode}`}</p> : null}
          </>
          ) : <p className="mt-1">Chưa có tác vụ xử lý chính cho phiên bản nội dung này. Nội dung {review.rawText?.trim() ? "đang chờ tạo tác vụ" : "đang chờ thu thập lại"}, chưa có kết quả xử lý.</p>}
      </section>

      {v2IngestionJob ? (
        <section className="mt-6 rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm text-[#17342c]">
          <p className="font-semibold">Các mục trích xuất an toàn</p>
          <p className="mt-1 text-[#4f625a]">Màu trạng thái: xanh lá đã xuất bản, đỏ không xuất bản/lỗi, vàng cần kiểm tra, tím cần xác minh, xanh dương đang xử lý.</p>
          {v2IngestionJob.candidateHasMore ? <p className="mt-1 text-[#4f625a]">Hiển thị {v2IngestionJob.candidates.length}/{v2IngestionJob.candidateTotalCount} mục gần nhất theo thứ tự xử lý.</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterLink active={!candidateStage && !candidateReason} href={`/admin/knowledge/facebook-captures/${encodeURIComponent(reviewId)}`}>Tất cả ({v2IngestionJob.candidates.length})</FilterLink>
            {candidateStages.map((stage) => <FilterLink active={candidateStage === stage && !candidateReason} href={candidateFilterHref(reviewId, stage)} key={stage}>{candidateStageLabels[stage] ?? stage} ({v2IngestionJob.candidates.filter((candidate) => candidate.stage === stage).length})</FilterLink>)}
          </div>
          {candidateReasons.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{candidateReasons.map((reason) => <FilterLink active={candidateReason === reason} href={candidateFilterHref(reviewId, undefined, reason)} key={reason}>{reason} ({v2IngestionJob.candidates.filter((candidate) => candidate.outcomeReasonCode === reason).length})</FilterLink>)}</div> : null}
          <div className="mt-3 grid gap-2">
            {candidates.length === 0 ? <p className="rounded-xl bg-[#fbf7ed] p-3 text-[#4f625a]">Không có mục nào khớp bộ lọc.</p> : candidates.map((candidate) => <div className="rounded-xl bg-[#fbf7ed] p-3" key={candidate.id}>
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{candidate.title}</p><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${candidateStageClasses[candidate.stage] ?? candidateStageClasses.queued}`}>{candidateStageLabels[candidate.stage] ?? candidate.stage}</span></div>
               <p className="mt-1 text-[#4f625a]">{knowledgeCardTypeLabels[candidate.type] ?? candidate.type} · {candidate.locationName ?? candidate.routeSegment ?? "Không rõ phạm vi"}</p>
              {candidate.outcomeReasonCode ? <p className="mt-1 font-medium text-[#8c4f13]">Lý do: {candidate.outcomeReasonCode}</p> : null}
              <p className="mt-2 leading-6 text-[#4f625a]">{candidate.summary}</p>
              {candidate.conditions.length > 0 ? <p className="mt-2 text-[#4f625a]">Điều kiện: {candidate.conditions.join(" · ")}</p> : null}
              {candidate.judgmentSummary ? <p className="mt-2 text-[#4f625a]">Kết quả đánh giá: {candidate.judgmentSummary}</p> : null}
              {candidate.outcomeReasonCode === "judge_below_quality_threshold" && candidate.scores ? <JudgmentScoreBreakdown scores={candidate.scores} /> : null}
              {isRejectedQuoteDiagnostic(candidate) ? <p className="mt-2 rounded-lg border border-[#d8c9ad] bg-white/70 p-2 leading-6 text-[#4f625a]">Trích dẫn AI bị từ chối: {candidate.rejectedQuoteText}</p> : null}
              {candidate.outcomeReasonCode && candidateReasonDetails[candidate.outcomeReasonCode] ? <p className="mt-2 rounded-lg border border-[#d8c9ad] bg-white/70 p-2 text-[#4f625a]">Diễn giải: {candidateReasonDetails[candidate.outcomeReasonCode]}</p> : null}
              {candidate.knowledgeCardId ? <Link className="mt-2 inline-block text-[#1f5f46] underline" href={`/admin/knowledge/approved/${encodeURIComponent(candidate.knowledgeCardId)}`}>Mở thẻ tri thức</Link> : null}
            </div>)}
          </div>
        </section>
      ) : null}

       {review.ingestionJob?.rawDiscoveryResponse ? <section className="mt-6 rounded-[1.5rem] border border-[#d99a93] bg-[#fff0ee] p-5 sm:p-6"><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#9b2f29]">Phản hồi thô từ bước phát hiện của AI</h2><p className="mt-3 text-sm leading-6 text-[#9b2f29]">Chỉ quản trị viên được xem dữ liệu phản hồi này để chẩn đoán lỗi. JSON hợp lệ được thụt lề để dễ đọc; dữ liệu có thể chứa lại nội dung bài Facebook, không dùng làm bằng chứng hoặc hiển thị cho khách.</p><pre className="mt-5 max-h-[36rem] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-[#d99a93] bg-white/75 p-5 text-sm leading-6 text-[#17342c]">{formatJsonForDisplay(review.ingestionJob.rawDiscoveryResponse)}</pre></section> : null}

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#f4ead7] p-5 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Nguồn Facebook/cộng đồng, chưa xác minh</p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-white/70 p-3">
              <dt className="font-semibold text-[#17342c]">Trạng thái duyệt/thu thập lại phụ</dt>
            <dd className="mt-1 text-[#4f625a]">{statusLabels[review.status]}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Mức độ tin cậy mặc định</dt>
            <dd className="mt-1 text-[#4f625a]">{sourceTypeLabels[review.sourceType] ?? review.sourceType}/{verificationStatusLabels[review.verificationStatus] ?? review.verificationStatus} · chính thức: {review.official ? "có" : "không"} · đối tác: {review.partner ? "có" : "không"}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">URL nguồn</dt>
            <dd className="mt-1 break-all text-[#4f625a]">{review.sourceCanonicalUrl ?? review.sourceUrl ?? "Chưa có"}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">URL sau khi thu thập</dt>
            <dd className="mt-1 break-all text-[#4f625a]">{review.finalUrl ?? "Chưa có"}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Thông tin thu thập an toàn</dt>
            <dd className="mt-1 text-[#4f625a]">{review.captureMethod ?? "Chưa có"} · {review.capturedAt ?? formatDate(review.createdAt)}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Nhóm / tác giả / ngày đăng gốc</dt>
            <dd className="mt-1 text-[#4f625a]">{[review.groupName, review.authorText, review.postCreatedAt ? formatDate(review.postCreatedAt) : null].filter(Boolean).join(" · ") || "Chưa có metadata bài viết đáng tin cậy"}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Người duyệt</dt>
            <dd className="mt-1 text-[#4f625a]">{review.reviewerUserId ?? "Chưa có"} · {formatDate(review.reviewedAt)}</dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <dt className="font-semibold text-[#17342c]">Lỗi / lý do từ chối</dt>
            <dd className="mt-1 text-[#4f625a]">{review.rejectionReason ?? review.extractionError ?? "Chưa có"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Nội dung bài viết đã thu thập</h2>
        <p className="mt-3 rounded-2xl border border-[#d99a93] bg-[#fff0ee] p-3 text-sm font-semibold leading-6 text-[#9b2f29]">
          Văn bản thô chỉ hiển thị tại trang quản trị này. Không hiển thị cookie, mã truy cập, bộ nhớ cục bộ, bản sao HTML, dữ liệu ẩn, dữ liệu từ nhà cung cấp hoặc hồ sơ trình duyệt.
        </p>
        <div className="mt-5 whitespace-pre-wrap break-words rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] p-5 text-base leading-8 text-[#17342c] sm:p-6">
          {review.rawText ?? "Chưa có nội dung text."}
        </div>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Thẻ tri thức đã liên kết</h2>
        <div className="mt-4 grid gap-3">
          {review.existingCards.length === 0 ? (
            <p className="rounded-2xl bg-[#fbf7ed] p-3 text-[#4f625a]">Chưa có thẻ tri thức liên kết với nội dung đã thu thập này.</p>
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
                <p className="mt-1">Loại: {knowledgeCardTypeLabels[card.type] ?? card.type} · trạng thái: {knowledgeCardStatusLabels[card.status] ?? card.status} · phiên bản hướng dẫn AI: {card.aiPromptVersion}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#fbf7ed] p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Hành động vận hành</h2>
        <p className="mt-4 rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm leading-6 text-[#4f625a]">Hệ thống tự tạo thẻ tri thức và quyết định xuất bản. Màn hình này chỉ theo dõi trạng thái và hỗ trợ thu thập lại khi nội dung đã thu thập có vấn đề.</p>
          <div className="mt-4">
            {canRerunIngestion ? (
              <form action={rerunFacebookCanonicalIngestionForm} className="mb-4 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] p-4">
                <input name="reviewId" type="hidden" value={review.id} />
                <p className="text-sm font-semibold leading-6 text-[#17342c]">Chạy lại theo quy trình hiện hành</p>
                <p className="mt-2 text-sm leading-6 text-[#4f625a]">Dùng sau khi thay đổi mã trích xuất hoặc đánh giá. Hệ thống xóa các mục xử lý cũ, hủy lượt xử lý đang chạy và phát hiện lại từ cùng văn bản thô. Văn bản thô và các thẻ tri thức đã tạo không bị thay đổi.</p>
                <button className="mt-4 min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" type="submit">
                  Chạy lại quy trình hiện hành
                </button>
             </form>
           ) : null}
           {canRecapture ? (
            <form action={requestFacebookCaptureRecaptureForm} className="rounded-2xl border border-[#d8c9ad] bg-white/75 p-4">
              <input name="reviewId" type="hidden" value={review.id} />
              <input name="recaptureReason" type="hidden" value="Operator requested recapture from detail page" />
              <p className="text-sm font-semibold leading-6 text-[#17342c]">Thu thập lại</p>
              <p className="mt-2 text-sm leading-6 text-[#4f625a]">
                Xóa văn bản hiện tại và đưa nguồn về hàng đợi thu thập lại. Dùng khi văn bản bị lỗi, mất ký tự, chọn nhầm bài hoặc cần thu thập bằng công cụ mới.
              </p>
              <button className="mt-4 min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" type="submit">
                Thu thập lại
              </button>
            </form>
          ) : null}
          {!canRecapture ? <p className="rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm leading-6 text-[#4f625a]">Không thể thu thập lại với trạng thái duyệt hiện tại.</p> : null}
        </div>
      </section>
    </div>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatJsonForDisplay(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
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
