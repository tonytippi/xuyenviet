import Image from "next/image";
import Link from "next/link";

import { suppressKnowledgeRecommendationFromQueueForm, verifyKnowledgeRecommendationFromQueueForm } from "@/features/knowledge/actions";
import { getKnowledgeRecommendationWorkStatusCounts, knowledgeRecommendationWorkStatusValues, listKnowledgeRecommendations, type KnowledgeRecommendationWorkStatus } from "@/features/knowledge/recommendations";
import { knowledgeRecommendationReasonValues, type KnowledgeRecommendationReason } from "@/db/schema";

type Props = { searchParams: Promise<{ error?: string; page?: string; reason?: string; workStatus?: string }> };

const recommendationReasonLabels: Record<string, string> = {
  risk: "Rủi ro",
  weak_evidence: "Bằng chứng yếu",
  freshness: "Thông tin có thể đã cũ",
  conflict: "Có thông tin mâu thuẫn",
  duplicate_risk: "Nguy cơ trùng lặp",
  missing_context: "Thiếu ngữ cảnh",
  verification: "Cần xác minh",
  relation: "Cần đối chiếu thẻ liên quan",
  sampling: "Kiểm tra lấy mẫu",
};

const workStatusLabels: Record<KnowledgeRecommendationWorkStatus, string> = {
  actionable: "Cần xử lý",
  completed: "Đã hoàn tất",
  inactive: "Không còn hiệu lực",
};

const resolutionLabels: Record<string, string> = {
  accepted: "Đã chấp nhận cách diễn đạt",
  edited: "Đã chỉnh sửa nội dung",
  suppressed: "Đã ẩn khỏi xuất bản",
  restored: "Đã khôi phục xuất bản",
  verified: "Đã xác minh và xuất bản",
  relation_resolved: "Đã xử lý quan hệ thẻ",
  sampling_passed: "Mẫu đã đạt yêu cầu",
  sampling_failed: "Mẫu không đạt yêu cầu",
};

function isWorkStatus(value: string | undefined): value is KnowledgeRecommendationWorkStatus {
  return value !== undefined && knowledgeRecommendationWorkStatusValues.includes(value as KnowledgeRecommendationWorkStatus);
}

function isRecommendationReason(value: string | undefined): value is KnowledgeRecommendationReason {
  return value !== undefined && knowledgeRecommendationReasonValues.includes(value as KnowledgeRecommendationReason);
}

export default async function KnowledgeRecommendationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const workStatus = isWorkStatus(params.workStatus) ? params.workStatus : "actionable";
  const reason = isRecommendationReason(params.reason) ? params.reason : undefined;
  const [recommendations, workStatusCounts] = await Promise.all([
    listKnowledgeRecommendations({ page, workStatus, reason }),
    getKnowledgeRecommendationWorkStatusCounts(),
  ]);
  const query = new URLSearchParams();
  if (reason) query.set("reason", reason);
  if (workStatus !== "actionable") query.set("workStatus", workStatus);
  const pageHref = (nextPage: number) => {
    const nextQuery = new URLSearchParams(query);
    nextQuery.set("page", String(nextPage));
    return `/admin/knowledge/recommendations?${nextQuery}`;
  };
  return <div>
    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Hàng đợi vận hành</p>
    <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Khuyến nghị kiểm tra từ AI</h1>
    <p className="mt-5 max-w-3xl text-lg leading-8 text-[#4f625a]">Đây không phải hàng đợi phê duyệt. Mẫu chất lượng cho thẻ có rủi ro thấp đang hiển thị vẫn giữ nguyên khả năng phục vụ người dùng.</p>
    <section aria-label="Tổng quan hàng đợi" className="mt-7 grid gap-3 sm:grid-cols-3">{knowledgeRecommendationWorkStatusValues.map((value) => <Link className={`rounded-2xl border p-4 transition focus:outline-none focus:ring-4 ${workStatus === value ? "border-[#1f5f46] bg-[#edf7ef] focus:ring-[#8fb59f]" : "border-[#d8c9ad] bg-white/75 hover:border-[#8c4f13] focus:ring-[#d8c9ad]"}`} href={`/admin/knowledge/recommendations?${new URLSearchParams({ workStatus: value, ...(reason ? { reason } : {}) })}`} key={value}><p className="text-sm font-semibold text-[#4f625a]">{workStatusLabels[value]}</p><p className="mt-2 text-3xl font-semibold text-[#17342c]">{workStatusCounts[value]}</p><p className="mt-1 text-sm text-[#4f625a]">{value === "actionable" ? "Đang chờ quyết định" : value === "completed" ? "Đã có kết quả xử lý" : "Không cần thao tác thêm"}</p></Link>)}</section>
    <form className="mt-7 flex flex-wrap gap-3" action="/admin/knowledge/recommendations">
      <select aria-label="Trạng thái công việc" className="min-h-11 rounded-xl border border-[#d8c9ad] bg-white px-3" defaultValue={workStatus} name="workStatus">{knowledgeRecommendationWorkStatusValues.map((value) => <option key={value} value={value}>{workStatusLabels[value]}</option>)}</select>
      <select aria-label="Lý do kiểm tra" className="min-h-11 rounded-xl border border-[#d8c9ad] bg-white px-3" defaultValue={reason ?? ""} name="reason"><option value="">Mọi lý do</option>{Object.entries(recommendationReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button className="min-h-11 rounded-xl bg-[#1f5f46] px-4 font-semibold text-white" type="submit">Lọc</button>
    </form>
    {params.error ? <p className="mt-5 rounded-xl bg-[#f4ead7] p-4 text-sm text-[#17342c]">Không thể hoàn tất thao tác. Hãy mở mục để kiểm tra trạng thái và bằng chứng hiện tại.</p> : null}
    <section className="mt-7 grid gap-4">{recommendations.length === 0 ? <p className="rounded-2xl border border-[#d8c9ad] bg-white/70 p-5 text-[#4f625a]">Không có khuyến nghị phù hợp.</p> : recommendations.map((item) => <article className="rounded-2xl border border-[#d8c9ad] bg-white/75 p-5" key={item.id}><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><p className="text-sm font-semibold text-[#8c4f13]">{workStatusLabels[workStatus]} · {recommendationReasonLabels[item.reason] ?? item.reason}{workStatus === "actionable" ? ` · Ưu tiên ${item.priority}` : ""}</p><h2 className="mt-2 text-xl font-semibold text-[#17342c]">{item.card.title}</h2><p className="mt-2 text-[#4f625a]">{item.card.summary}</p><p className="mt-3 text-sm text-[#4f625a]">{workStatus === "completed" ? resolutionLabels[item.resolution ?? ""] ?? "Đã hoàn tất xử lý" : workStatus === "inactive" ? "Công việc này không còn đang hoạt động." : "Mở để đối chiếu bằng chứng và đưa ra quyết định."}</p></div><div className="flex h-fit flex-col gap-2">{workStatus === "actionable" && item.reason === "verification" ? <div className="flex gap-2"><form action={verifyKnowledgeRecommendationFromQueueForm}><input name="recommendationId" type="hidden" value={item.id} /><input name="contentVersion" type="hidden" value={item.contentVersion} /><input name="evidenceSetRevision" type="hidden" value={item.evidenceSetRevision} /><input name="page" type="hidden" value={page} />{reason ? <input name="reason" type="hidden" value={reason} /> : null}<button className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1f5f46] px-4 py-3 font-semibold text-white" type="submit"><Image alt="" height={20} src="https://img.icons8.com/?id=pIPl8tqh3igN&format=png&size=24" width={20} />Xác nhận</button></form><form action={suppressKnowledgeRecommendationFromQueueForm}><input name="recommendationId" type="hidden" value={item.id} /><input name="contentVersion" type="hidden" value={item.contentVersion} /><input name="evidenceSetRevision" type="hidden" value={item.evidenceSetRevision} /><input name="page" type="hidden" value={page} />{reason ? <input name="reason" type="hidden" value={reason} /> : null}<button className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#b85d45] bg-[#fff0eb] px-3 py-3 font-semibold text-[#9b321e] transition hover:bg-[#f9dcd4] focus:outline-none focus:ring-4 focus:ring-[#b85d45]/20" type="submit"><Image alt="" height={20} src="https://img.icons8.com/?id=fYgQxDaH069W&format=png&size=24" width={20} />Từ chối</button></form></div> : null}<Link className="flex items-center justify-center gap-2 rounded-xl border border-[#1f5f46] px-4 py-3 text-center font-semibold text-[#1f5f46]" href={`/admin/knowledge/recommendations/${item.id}`}><Image alt="" height={20} src="https://img.icons8.com/?id=ROz0QlSkNlRp&format=png&size=24" width={20} />{workStatus === "actionable" ? "Xem và xử lý" : "Xem chi tiết"}</Link></div></div></article>)}</section>
    <nav aria-label="Phân trang hàng đợi" className="mt-7 flex items-center justify-between gap-3">
      {page > 1 ? <Link className="rounded-xl border border-[#d8c9ad] px-4 py-3 font-semibold text-[#17342c]" href={pageHref(page - 1)}>Trang trước</Link> : <span />}
      {recommendations.length === 25 ? <Link className="rounded-xl bg-[#1f5f46] px-4 py-3 font-semibold text-white" href={pageHref(page + 1)}>Trang sau</Link> : null}
    </nav>
  </div>;
}
