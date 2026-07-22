import Link from "next/link";

import { listKnowledgeRecommendations } from "@/features/knowledge/recommendations";

type Props = { searchParams: Promise<{ page?: string; reason?: string; status?: "open" | "in_review" | "resolved" | "superseded" }> };

export default async function KnowledgeRecommendationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const recommendations = await listKnowledgeRecommendations({ page, status: params.status, reason: params.reason as never });
  const query = new URLSearchParams();
  if (params.reason) query.set("reason", params.reason);
  if (params.status) query.set("status", params.status);
  const pageHref = (nextPage: number) => {
    const nextQuery = new URLSearchParams(query);
    nextQuery.set("page", String(nextPage));
    return `/admin/knowledge/recommendations?${nextQuery}`;
  };
  return <div>
    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Hàng đợi vận hành</p>
    <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Khuyến nghị kiểm tra từ AI</h1>
    <p className="mt-5 max-w-3xl text-lg leading-8 text-[#4f625a]">Đây không phải hàng đợi phê duyệt. Mẫu chất lượng cho thẻ low-risk đang active vẫn giữ nguyên khả năng phục vụ traveler.</p>
    <form className="mt-7 flex flex-wrap gap-3" action="/admin/knowledge/recommendations">
      <select className="min-h-11 rounded-xl border border-[#d8c9ad] bg-white px-3" defaultValue={params.reason ?? ""} name="reason"><option value="">Mọi lý do</option>{["risk", "weak_evidence", "freshness", "conflict", "duplicate_risk", "missing_context", "verification", "relation", "sampling"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <select className="min-h-11 rounded-xl border border-[#d8c9ad] bg-white px-3" defaultValue={params.status ?? ""} name="status"><option value="">Đang mở</option><option value="resolved">Đã xử lý</option><option value="superseded">Đã thay thế</option></select>
      <button className="min-h-11 rounded-xl bg-[#1f5f46] px-4 font-semibold text-white" type="submit">Lọc</button>
    </form>
    <section className="mt-7 grid gap-4">{recommendations.length === 0 ? <p className="rounded-2xl border border-[#d8c9ad] bg-white/70 p-5 text-[#4f625a]">Không có khuyến nghị phù hợp.</p> : recommendations.map((item) => <article className="rounded-2xl border border-[#d8c9ad] bg-white/75 p-5" key={item.id}><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><p className="text-sm font-semibold text-[#8c4f13]">P{item.priority} · {item.reason} · {item.status}</p><h2 className="mt-2 text-xl font-semibold text-[#17342c]">{item.card.title}</h2><p className="mt-2 text-[#4f625a]">{item.card.summary}</p><p className="mt-3 text-sm text-[#4f625a]">Phiên bản nội dung {item.contentVersion}/{item.card.contentVersion} · evidence {item.evidenceSetRevision}/{item.card.evidenceSetRevision} · {item.card.publicationState}, {item.card.knowledgeState}, {item.card.reviewState}, {item.card.verificationState}</p></div><Link className="h-fit rounded-xl bg-[#1f5f46] px-4 py-3 text-center font-semibold text-white" href={`/admin/knowledge/recommendations/${item.id}`}>Xem xử lý</Link></div></article>)}</section>
    <nav aria-label="Phân trang hàng đợi" className="mt-7 flex items-center justify-between gap-3">
      {page > 1 ? <Link className="rounded-xl border border-[#d8c9ad] px-4 py-3 font-semibold text-[#17342c]" href={pageHref(page - 1)}>Trang trước</Link> : <span />}
      {recommendations.length === 25 ? <Link className="rounded-xl bg-[#1f5f46] px-4 py-3 font-semibold text-white" href={pageHref(page + 1)}>Trang sau</Link> : null}
    </nav>
  </div>;
}
