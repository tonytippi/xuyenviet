import Link from "next/link";
import { notFound } from "next/navigation";

import { resolveKnowledgeRecommendationForm } from "@/features/knowledge/actions";
import { getKnowledgeRecommendationDetail } from "@/features/knowledge/recommendations";

type Props = { params: Promise<{ recommendationId: string }>; searchParams: Promise<{ error?: string; resolved?: string }> };

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
    <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Khuyến nghị {recommendation.reason}</p>
    <h1 className="mt-3 text-4xl font-semibold text-[#17342c]">{recommendation.card.title}</h1>
    <p className="mt-4 text-lg leading-8 text-[#4f625a]">Phiên bản đã khuyến nghị: nội dung {recommendation.contentVersion}, evidence {recommendation.evidenceSetRevision}. Hiện tại: {recommendation.card.contentVersion}/{recommendation.card.evidenceSetRevision}. {stale ? "Khuyến nghị đã cũ, không thể xử lý." : ""}</p>
    {notice.error ? <p className="mt-5 rounded-xl bg-[#f4ead7] p-4">Không thể xử lý: {notice.error}</p> : null}
    {notice.resolved ? <p className="mt-5 rounded-xl bg-[#edf7ef] p-4">Đã xử lý an toàn.</p> : null}
    <section className="mt-7 rounded-2xl border border-[#d8c9ad] bg-white/75 p-5">
      <h2 className="text-xl font-semibold">Fact và evidence giới hạn</h2>
      <p className="mt-3 whitespace-pre-wrap text-[#4f625a]">{recommendation.card.summary}</p>
      <p className="mt-3 text-sm">Điều kiện: {recommendation.card.conditions.join(" · ") || "Không có"}</p>
      <ul className="mt-4 grid gap-2">{recommendation.evidence.map((item) => <li className="rounded-xl bg-[#fbf7ed] p-3 text-sm text-[#4f625a]" key={item.id}>{item.quoteText} · {item.supportLevel} · {item.displayPolicy}</li>)}</ul>
    </section>
    <form action={resolveKnowledgeRecommendationForm} className="mt-7 grid gap-4 rounded-2xl border border-[#d8c9ad] bg-white/75 p-5">
      <input name="recommendationId" type="hidden" value={recommendation.id} />
      <input name="contentVersion" type="hidden" value={recommendation.contentVersion} />
      <input name="evidenceSetRevision" type="hidden" value={recommendation.evidenceSetRevision} />
      <label className="grid gap-2 font-semibold">Lệnh xử lý
        <select className="min-h-11 rounded-xl border border-[#d8c9ad] px-3" defaultValue={actions[0]} disabled={stale || recommendation.status === "resolved" || recommendation.status === "superseded"} name="action">
          {actions.map((action) => <option key={action} value={action}>{action}</option>)}
        </select>
      </label>
      <label className="grid gap-2 font-semibold">Fact đã chỉnh sửa (chỉ dùng với edit)<textarea className="min-h-24 rounded-xl border border-[#d8c9ad] p-3" name="editSummary" /></label>
      {recommendation.reason === "sampling" ? <><label className="grid gap-2 font-semibold">Mã kết quả lấy mẫu<select className="min-h-11 rounded-xl border border-[#d8c9ad] px-3" name="samplingDispositionReason" required><option value="">Chọn mã bắt buộc</option>{["confirmed", "minor_issue", "insufficient_evidence", "stale_or_changed", "material_error", "safety_risk"].map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label><label className="grid gap-2 font-semibold">Lý do bổ sung (tùy chọn, tối đa 500 ký tự)<textarea className="min-h-20 rounded-xl border border-[#d8c9ad] p-3" maxLength={500} name="samplingRationale" /></label><label className="flex gap-2"><input name="highSeverity" type="checkbox" /> Lỗi lấy mẫu nghiêm trọng</label></> : null}
      <button className="min-h-11 rounded-xl bg-[#1f5f46] px-4 font-semibold text-white disabled:opacity-50" disabled={stale || recommendation.status === "resolved" || recommendation.status === "superseded"} type="submit">Lưu xử lý</button>
    </form>
  </div>;
}
