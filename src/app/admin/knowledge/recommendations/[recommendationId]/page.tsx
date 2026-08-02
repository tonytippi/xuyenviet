import Link from "next/link";
import { notFound } from "next/navigation";

import { getKnowledgeRecommendationDetail } from "@/features/knowledge/recommendations";
import { evidenceSupportLevelLabels, knowledgeCardTypeLabels, recommendationReasonLabels } from "@/features/knowledge/display-labels";

import { RecommendationActionForm } from "./recommendation-action-form";

type Props = { params: Promise<{ recommendationId: string }>; searchParams: Promise<{ error?: string; resolved?: string }> };

const candidateStageLabels: Record<string, string> = { published: "Đã xuất bản", suppressed: "Không xuất bản", review_recommended: "Cần kiểm tra", verify_first: "Cần xác minh trước", failed: "Xử lý lỗi" };
const candidateReasonLabels: Record<string, string> = { attach_condition_mismatch: "Điều kiện không khớp để gắn bằng chứng", conflict_condition_mismatch: "Điều kiện không khớp để tạo xung đột", relation_ambiguous: "Không xác định được thẻ liên quan", stale_relation_target: "Thẻ đích đã thay đổi hoặc không còn phù hợp" };
const judgeDecisionLabels: Record<string, string> = { publish: "Đủ điều kiện xuất bản", review_recommended: "Cần vận hành kiểm tra", verify_first: "Cần xác minh trước", suppress: "Không xuất bản" };

function formatDate(value: Date) {
  return value.toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" });
}

const practicalDetailLabels: Record<string, string> = {
  ordered_stops: "Các điểm dừng theo thứ tự",
  tips: "Gợi ý thực tế",
  warnings: "Lưu ý",
  cost_notes: "Lưu ý chi phí",
  parking_notes: "Lưu ý đỗ xe",
  kid_notes: "Lưu ý khi đi cùng trẻ em",
};

function formatPracticalDetail(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" · ");
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function actionsFor(reason: string) {
  if (reason === "verification") return ["verify", "edit", "suppress"];
  if (reason === "sampling") return ["sampling_pass", "sampling_fail", "suppress"];
  if (reason === "conflict" || reason === "relation" || reason === "missing_context") return ["verify", "resolve_relation", "edit", "suppress"];
  return ["accept_wording", "edit", "suppress", "restore"];
}

export default async function KnowledgeRecommendationPage({ params, searchParams }: Props) {
  const { recommendationId } = await params;
  const notice = await searchParams;
  const recommendation = await getKnowledgeRecommendationDetail(recommendationId);
  if (!recommendation) notFound();
  const stale = recommendation.contentVersion !== recommendation.card.contentVersion || recommendation.evidenceSetRevision !== recommendation.card.evidenceSetRevision;
  const actions = actionsFor(recommendation.reason);

  return <div>
    <Link className="text-sm font-semibold text-[#1f5f46] underline" href="/admin/knowledge/recommendations">Quay lại hàng đợi</Link>
    <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Khuyến nghị: {recommendationReasonLabels[recommendation.reason] ?? recommendation.reason}</p>
    <h1 className="mt-3 text-4xl font-semibold text-[#17342c]">{recommendation.card.title}</h1>
    <p className="mt-4 text-lg leading-8 text-[#4f625a]">Phiên bản đã khuyến nghị: nội dung {recommendation.contentVersion}, tập bằng chứng {recommendation.evidenceSetRevision}. Hiện tại: {recommendation.card.contentVersion}/{recommendation.card.evidenceSetRevision}. {stale ? "Khuyến nghị đã cũ, không thể xử lý." : ""}</p>
    {recommendation.reason === "verification" ? <p className="mt-4 rounded-xl border border-[#8fb59f] bg-[#edf7ef] p-4 text-sm leading-6 text-[#17342c]">Bạn là điểm phê duyệt cuối: chọn <strong>Xác nhận và xuất bản</strong> để xuất bản ngay cả khi chỉ có một nguồn. Có thể sửa nội dung tự do trước khi lưu; hệ thống vẫn ghi nhật ký kiểm toán, phiên bản nội dung và giữ bằng chứng hiện có.</p> : null}
    {notice.error ? <p className="mt-5 rounded-xl bg-[#f4ead7] p-4">Không thể xử lý: {notice.error}</p> : null}
    {notice.resolved ? <p className="mt-5 rounded-xl bg-[#edf7ef] p-4">Đã xử lý an toàn.</p> : null}
    {recommendation.candidate ? <section className="mt-7 rounded-2xl border border-[#d8c9ad] bg-[#f4ead7] p-5">
      <h2 className="text-xl font-semibold">Mục trích xuất ban đầu của AI</h2>
      <p className="mt-2 text-sm leading-6 text-[#4f625a]">Đây là bản ghi từ quy trình xử lý đã tạo thẻ này. Dùng để đối chiếu với thẻ tri thức trước khi quyết định xử lý.</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-white/70 p-3"><dt className="font-semibold">Trạng thái quy trình</dt><dd className="mt-1 text-[#4f625a]">{candidateStageLabels[recommendation.candidate.stage] ?? recommendation.candidate.stage}</dd></div>
        <div className="rounded-xl bg-white/70 p-3"><dt className="font-semibold">Lý do giữ lại</dt><dd className="mt-1 text-[#4f625a]">{recommendation.candidate.outcomeReasonCode ? candidateReasonLabels[recommendation.candidate.outcomeReasonCode] ?? recommendation.candidate.outcomeReasonCode : recommendation.candidate.judgeDecision === "verify_first" ? "Thông tin cần xác minh trước khi xuất bản" : "Không có lý do giữ lại riêng"}</dd></div>
        <div className="rounded-xl bg-white/70 p-3"><dt className="font-semibold">Quyết định đánh giá AI</dt><dd className="mt-1 text-[#4f625a]">{recommendation.candidate.judgeDecision ? judgeDecisionLabels[recommendation.candidate.judgeDecision] ?? recommendation.candidate.judgeDecision : "Chưa có"}</dd></div>
        <div className="rounded-xl bg-white/70 p-3"><dt className="font-semibold">Thời điểm trích xuất</dt><dd className="mt-1 text-[#4f625a]">{formatDate(recommendation.candidate.createdAt)}</dd></div>
      </dl>
      <h3 className="mt-5 text-lg font-semibold">{recommendation.candidate.title}</h3>
      <p className="mt-2 leading-7 text-[#4f625a]">{recommendation.candidate.summary}</p>
      <p className="mt-3 text-sm text-[#4f625a]">Điều kiện: {recommendation.candidate.conditions.join(" · ") || "Không có"}</p>
      <p className="mt-2 text-sm text-[#4f625a]">Phạm vi: {[recommendation.candidate.locationName, recommendation.candidate.routeSegment].filter(Boolean).join(" · ") || "Chưa xác định"} · thông tin dễ thay đổi: {recommendation.candidate.freshnessSensitive ? "có" : "không"}</p>
      {Object.keys(recommendation.candidate.practicalDetails).length > 0 ? <dl className="mt-3 grid gap-2 text-sm">{Object.entries(recommendation.candidate.practicalDetails).map(([key, value]) => <div className="rounded-xl bg-white/70 p-3" key={key}><dt className="font-semibold text-[#17342c]">{practicalDetailLabels[key] ?? key.replaceAll("_", " ")}</dt><dd className="mt-1 leading-6 text-[#4f625a]">{formatPracticalDetail(value)}</dd></div>)}</dl> : null}
      {recommendation.candidate.judgmentSummary ? <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm leading-6 text-[#4f625a]"><span className="font-semibold text-[#17342c]">Nhận định AI: </span>{recommendation.candidate.judgmentSummary}</p> : null}
      {recommendation.candidate.tags.length > 0 ? <p className="mt-3 text-sm text-[#4f625a]"><span className="font-semibold text-[#17342c]">Nhãn mục đề xuất: </span>{recommendation.candidate.tags.join(" · ")}</p> : null}
    </section> : null}
    <section className="mt-7 rounded-2xl border border-[#d8c9ad] bg-white/75 p-5">
      <h2 className="text-xl font-semibold">Bối cảnh để đánh giá</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-[#fbf7ed] p-3"><dt className="font-semibold">Loại tri thức</dt><dd className="mt-1 text-[#4f625a]">{knowledgeCardTypeLabels[recommendation.card.type] ?? recommendation.card.type}</dd></div>
        <div className="rounded-xl bg-[#fbf7ed] p-3"><dt className="font-semibold">Phạm vi</dt><dd className="mt-1 text-[#4f625a]">{[recommendation.card.locationName, recommendation.card.routeSegment].filter(Boolean).join(" · ") || "Chưa xác định"}</dd></div>
        <div className="rounded-xl bg-[#fbf7ed] p-3"><dt className="font-semibold">Lý do cần xử lý</dt><dd className="mt-1 text-[#4f625a]">{recommendationReasonLabels[recommendation.reason] ?? recommendation.reason}</dd></div>
        <div className="rounded-xl bg-[#fbf7ed] p-3"><dt className="font-semibold">Độ mới cần lưu ý</dt><dd className="mt-1 text-[#4f625a]">{recommendation.card.freshnessSensitive ? "Có: cần đối chiếu điều kiện hiện tại trước khi xuất bản" : "Không đánh dấu là thông tin dễ thay đổi"}</dd></div>
      </dl>
      {recommendation.card.tags.length > 0 ? <p className="mt-4 text-sm text-[#4f625a]"><span className="font-semibold text-[#17342c]">Nhãn: </span>{recommendation.card.tags.join(" · ")}</p> : null}
      <h3 className="mt-5 text-lg font-semibold">Nội dung và bằng chứng</h3>
      <p className="mt-3 whitespace-pre-wrap text-[#4f625a]">{recommendation.card.summary}</p>
      <p className="mt-3 text-sm">Điều kiện: {recommendation.card.conditions.join(" · ") || "Không có"}</p>
        <ul className="mt-4 grid gap-3">{recommendation.evidence.map((item) => <li className="rounded-xl bg-[#fbf7ed] p-3 text-sm text-[#4f625a]" key={item.id}><p className="whitespace-pre-wrap text-[#17342c]">{item.quoteText}</p><p className="mt-2">Nguồn: {item.sourceLabel} · thu thập {formatDate(item.capturedAt)} · mức hỗ trợ: {evidenceSupportLevelLabels[item.supportLevel] ?? item.supportLevel}</p><p className="mt-1">Điều kiện bằng chứng: {item.conditions.join(" · ") || "Không có"}</p>{item.facebookReviewId ? <Link className="mt-2 inline-block font-semibold text-[#1f5f46] underline" href={`/admin/knowledge/facebook-captures/${encodeURIComponent(item.facebookReviewId)}`}>Mở bản thu thập Facebook để đối chiếu</Link> : null}</li>)}</ul>
    </section>
    <RecommendationActionForm actions={actions} contentVersion={recommendation.contentVersion} disabled={stale || recommendation.status === "resolved" || recommendation.status === "superseded"} evidenceSetRevision={recommendation.evidenceSetRevision} recommendationId={recommendation.id} />
  </div>;
}
