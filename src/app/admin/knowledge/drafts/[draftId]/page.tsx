import Link from "next/link";
import { notFound } from "next/navigation";

import { rejectKnowledgeDraftForm, updateKnowledgeDraftForm } from "@/features/knowledge/actions";
import { getKnowledgeDraftForReview } from "@/features/knowledge/review";
import { knowledgeCardTypeValues, knowledgeConfidenceValues } from "@/db/schema";

type KnowledgeDraftDetailPageProps = {
  params: Promise<{
    draftId: string;
  }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function KnowledgeDraftDetailPage({ params, searchParams }: KnowledgeDraftDetailPageProps) {
  const [{ draftId }, query] = await Promise.all([params, searchParams]);
  const draft = await getKnowledgeDraftForReview(draftId);

  if (!draft) {
    notFound();
  }

  const detailsJson = JSON.stringify(draft.practicalDetails, null, 2);

  return (
    <div>
      <Link className="text-sm font-semibold text-[#1f5f46] underline underline-offset-4" href="/admin/knowledge/drafts">
        Quay lại hàng đợi
      </Link>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Sửa bản nháp AI</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{draft.title}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Chỉnh trường cấu trúc trước các story phê duyệt sau này. Lưu vẫn giữ bản nháp ở trạng thái cần duyệt; từ chối không tạo tri thức truy xuất.
      </p>

      {query.error ? (
        <p className="mt-6 rounded-2xl border border-[#d99a93] bg-[#fff0ee] px-4 py-3 font-semibold text-[#9b2f29]" role="alert">
          {query.error}
        </p>
      ) : null}
      {query.saved ? (
        <p className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] px-4 py-3 font-semibold text-[#1f5f46]" role="status">
          Đã lưu chỉnh sửa. Bản nháp vẫn cần duyệt và chưa được phê duyệt.
        </p>
      ) : null}

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#f4ead7] p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Nguồn an toàn liên kết</h2>
        <div className="mt-4 grid gap-3">
          {draft.sources.map((source) => (
            <div key={source.id} className="rounded-2xl border border-[#d8c9ad] bg-white/70 p-4 text-sm text-[#4f625a]">
              <p className="font-semibold text-[#17342c]">{source.label}</p>
              <p className="mt-2">
                {source.kind} · {source.sourceType}/{source.verificationStatus} · hỗ trợ: {source.supportLevel}
              </p>
              <p className="mt-1">{source.publisher ? `${source.publisher} · ` : ""}{source.collectedDate ?? "Chưa có ngày thu thập"}</p>
              {source.canonicalUrl || source.url ? <p className="mt-1 break-all">{source.canonicalUrl ?? source.url}</p> : null}
              <p className="mt-1">Official: {source.official ? "có" : "không"} · Partner: {source.partner ? "có" : "không"}</p>
            </div>
          ))}
        </div>
      </section>

      <form action={updateKnowledgeDraftForm} className="mt-8 grid gap-6 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <input name="draftId" type="hidden" value={draft.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label className="font-semibold text-[#17342c]" htmlFor="type">Loại thẻ</label>
            <select className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" defaultValue={draft.type} id="type" name="type">
              {knowledgeCardTypeValues.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="font-semibold text-[#17342c]" htmlFor="confidence">Độ tin cậy</label>
            <select className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" defaultValue={draft.confidence} id="confidence" name="confidence">
              {knowledgeConfidenceValues.map((confidence) => (
                <option key={confidence} value={confidence}>{confidence}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-[#17342c]" htmlFor="title">Tiêu đề</label>
          <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" defaultValue={draft.title} id="title" maxLength={160} name="title" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label className="font-semibold text-[#17342c]" htmlFor="locationName">Địa điểm</label>
            <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" defaultValue={draft.locationName ?? ""} id="locationName" maxLength={160} name="locationName" />
          </div>
          <div className="grid gap-2">
            <label className="font-semibold text-[#17342c]" htmlFor="routeSegment">Cung đường</label>
            <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" defaultValue={draft.routeSegment ?? ""} id="routeSegment" maxLength={160} name="routeSegment" />
          </div>
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-[#17342c]" htmlFor="summary">Tóm tắt</label>
          <textarea className="min-h-36 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 py-3 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" defaultValue={draft.summary} id="summary" maxLength={1200} name="summary" />
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-[#17342c]" htmlFor="practicalDetails">Chi tiết thực tế JSON</label>
          <textarea className="min-h-40 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 py-3 font-mono text-sm outline-none focus:ring-4 focus:ring-[#e5bd82]" defaultValue={detailsJson} id="practicalDetails" name="practicalDetails" />
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-[#17342c]" htmlFor="tags">Tags, phân tách bằng dấu phẩy</label>
          <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" defaultValue={draft.tags.join(", ")} id="tags" name="tags" />
        </div>

        <label className="flex items-start gap-3 text-sm font-semibold text-[#4f625a]">
          <input className="mt-1 size-4 accent-[#1f5f46]" defaultChecked={draft.freshnessSensitive} name="freshnessSensitive" type="checkbox" />
          Freshness-sensitive: giá, lịch, giờ mở cửa, khuyến mãi, tình trạng đường hoặc thông tin dễ thay đổi.
        </label>

        <button className="min-h-12 w-fit rounded-2xl bg-[#1f5f46] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(31,95,70,0.22)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" type="submit">
          Lưu bản nháp
        </button>
      </form>

      <form action={rejectKnowledgeDraftForm} className="mt-6 rounded-[1.5rem] border border-[#d99a93] bg-[#fff0ee] p-5 sm:p-6">
        <input name="draftId" type="hidden" value={draft.id} />
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#9b2f29]">Từ chối bản nháp</h2>
        <p className="mt-3 max-w-2xl leading-7 text-[#6d3f3a]">Hành động này chuyển bản nháp sang rejected, bỏ khỏi hàng đợi mặc định và không tạo phê duyệt, retrieval hay embedding.</p>
        <button className="mt-5 min-h-12 rounded-2xl bg-[#9b2f29] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#7d2521] focus:outline-none focus:ring-4 focus:ring-[#d99a93]" type="submit">
          Từ chối bản nháp
        </button>
      </form>
    </div>
  );
}
