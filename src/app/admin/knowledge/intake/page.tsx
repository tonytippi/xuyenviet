import Link from "next/link";

import { extractKnowledgeDraftsFromSourceForm, submitTravelSourceForm, suggestKnowledgeFromSourceUrlForm } from "@/features/knowledge/actions";
import { listKnowledgeSourceSuggestionTraces } from "@/features/knowledge/suggestions";

type KnowledgeIntakePageProps = {
  searchParams: Promise<{
    error?: string;
    extractError?: string;
    extracted?: string;
    suggestError?: string;
    suggested?: string;
    suggestionActions?: string;
    success?: string;
    sourceId?: string;
  }>;
};

export default async function KnowledgeIntakePage({ searchParams }: KnowledgeIntakePageProps) {
  const params = await searchParams;
  const suggestionTraces = params.sourceId ? await listKnowledgeSourceSuggestionTraces(params.sourceId) : [];

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Nạp nguồn tri thức</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Gửi nguồn du lịch để AI đọc ở bước sau.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Form này chỉ lưu metadata nguồn an toàn và phần thô dành riêng cho vận hành. Chưa tạo thẻ tri thức, chưa duyệt, và chưa gọi AI.
      </p>

      {params.error ? (
        <p className="mt-6 rounded-2xl border border-[#d99a93] bg-[#fff0ee] px-4 py-3 font-semibold text-[#9b2f29]" role="alert">
          {params.error}
        </p>
      ) : null}
      {params.success ? (
        <div className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] px-4 py-3 font-semibold text-[#1f5f46]" role="status">
          <p>Đã lưu nguồn an toàn để AI đọc ở bước sau{params.sourceId ? `: ${params.sourceId}` : ""}.</p>
          <Link className="mt-3 inline-flex rounded-xl border border-[#8fb59f] bg-white/70 px-3 py-2 text-sm text-[#17342c] transition hover:bg-white" href="/admin/knowledge/drafts">
            Mở hàng đợi duyệt bản nháp
          </Link>
        </div>
      ) : null}
      {params.extractError ? (
        <p className="mt-6 rounded-2xl border border-[#d99a93] bg-[#fff0ee] px-4 py-3 font-semibold text-[#9b2f29]" role="alert">
          {params.extractError}
        </p>
      ) : null}
      {params.extracted ? (
        <div className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] px-4 py-3 font-semibold text-[#1f5f46]" role="status">
          <p>AI đã tạo {params.extracted} bản nháp tri thức cần duyệt cho nguồn {params.sourceId ?? "đã chọn"}.</p>
          <Link className="mt-3 inline-flex rounded-xl border border-[#8fb59f] bg-white/70 px-3 py-2 text-sm text-[#17342c] transition hover:bg-white" href="/admin/knowledge/drafts">
            Duyệt các bản nháp AI
          </Link>
        </div>
      ) : null}
      {params.suggestError ? (
        <p className="mt-6 rounded-2xl border border-[#d99a93] bg-[#fff0ee] px-4 py-3 font-semibold text-[#9b2f29]" role="alert">
          {params.suggestError}
        </p>
      ) : null}
      {params.suggested ? (
        <div className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] px-4 py-3 font-semibold text-[#1f5f46]" role="status">
          <p>
            AI đã lưu {params.suggested} gợi ý cho nguồn {params.sourceId ?? "đã chọn"}
            {params.suggestionActions ? `: ${params.suggestionActions}` : ""}.
          </p>
          <Link className="mt-3 inline-flex rounded-xl border border-[#8fb59f] bg-white/70 px-3 py-2 text-sm text-[#17342c] transition hover:bg-white" href="/admin/knowledge/drafts">
            Duyệt gợi ý create/update/conflict
          </Link>
        </div>
      ) : null}
      {suggestionTraces.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-[#d8c9ad] bg-white/70 p-4 text-sm text-[#17342c]">
          <h2 className="text-base font-semibold">Gợi ý đã lưu cho nguồn này</h2>
          <div className="mt-3 grid gap-3">
            {suggestionTraces.map((trace) => (
              <article key={trace.id} className="rounded-xl border border-[#e2d3ba] bg-[#fbf7ed] p-3">
                <p className="font-semibold uppercase tracking-[0.12em] text-[#8c4f13]">{trace.action}</p>
                <p className="mt-1 text-[#4f625a]">{trace.rationale ?? trace.conflictSummary ?? trace.afterSummary ?? trace.beforeSummary ?? "Đã lưu trace gợi ý để vận hành kiểm tra."}</p>
                {trace.targetCardId ? <p className="mt-2 text-xs text-[#4f625a]">Target card: {trace.targetCardId}</p> : null}
                {trace.suggestedCardId ? (
                  <Link className="mt-2 inline-flex text-xs font-semibold text-[#1f5f46] underline" href={`/admin/knowledge/drafts/${encodeURIComponent(trace.suggestedCardId)}`}>
                    Mở bản nháp gợi ý
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <form action={submitTravelSourceForm} className="mt-8 grid gap-6 rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5 sm:p-6">
        <div className="grid gap-2">
          <label className="font-semibold text-[#17342c]" htmlFor="url">
            URL hoặc link Facebook
          </label>
          <input
            className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]"
            id="url"
            name="url"
            placeholder="https://example.com/bai-viet"
            type="url"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label className="font-semibold text-[#17342c]" htmlFor="label">
              Nhãn nguồn an toàn
            </label>
            <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" id="label" maxLength={200} name="label" />
          </div>
          <div className="grid gap-2">
            <label className="font-semibold text-[#17342c]" htmlFor="publisher">
              Nhà xuất bản / cộng đồng
            </label>
            <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" id="publisher" maxLength={160} name="publisher" />
          </div>
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-[#17342c]" htmlFor="collectedDate">
            Ngày thu thập / kiểm tra
          </label>
          <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" id="collectedDate" name="collectedDate" type="date" />
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-[#17342c]" htmlFor="rawText">
            Nội dung đã sao chép hoặc văn bản dán
          </label>
          <textarea
            className="min-h-40 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 py-3 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]"
            id="rawText"
            maxLength={20000}
            name="rawText"
            placeholder="Dán nội dung bài viết, ghi chú cộng đồng hoặc đoạn văn bản thô..."
          />
          <label className="flex items-start gap-3 text-sm font-semibold text-[#4f625a]">
            <input className="mt-1 size-4 accent-[#1f5f46]" name="copiedCommunityContent" type="checkbox" />
            Đánh dấu là nội dung cộng đồng đã sao chép. Nguồn sẽ mặc định community/unverified và không official/partner.
          </label>
        </div>

        <fieldset className="grid gap-4 rounded-2xl border border-[#d8c9ad] p-4">
          <legend className="px-2 font-semibold text-[#17342c]">Metadata ảnh chụp</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" name="screenshotFileName" placeholder="ten-file.png" />
            <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" name="screenshotMimeType" placeholder="image/png" />
            <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" min={1} name="screenshotByteSize" placeholder="Dung lượng byte" type="number" />
          </div>
          <input className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]" name="screenshotStorageKey" placeholder="Storage key nếu đã có" />
        </fieldset>

        <button
          className="min-h-12 w-fit rounded-2xl bg-[#1f5f46] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(31,95,70,0.22)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
          type="submit"
        >
          Lưu nguồn để AI đọc sau
        </button>
      </form>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#f4ead7] p-5 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Bước 4.2</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Trích xuất bản nháp tri thức từ nguồn đã lưu</h2>
        <p className="mt-3 max-w-2xl leading-7 text-[#4f625a]">
          Chỉ chạy với nguồn có văn bản thô đọc được. AI tạo bản nháp cần duyệt, không phê duyệt, không embedding và không đưa vào truy xuất cho khách.
        </p>
        <form action={extractKnowledgeDraftsFromSourceForm} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="extractSourceId">
            Source ID
          </label>
          <input
            className="min-h-12 flex-1 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]"
            id="extractSourceId"
            name="sourceId"
            placeholder="Dán source ID để trích xuất"
            defaultValue={params.sourceId ?? ""}
          />
          <button
            className="min-h-12 rounded-2xl bg-[#8c4f13] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(140,79,19,0.18)] transition hover:bg-[#713f0f] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
            type="submit"
          >
            Tạo bản nháp bằng AI
          </button>
        </form>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Bước 4.4</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Gợi ý tạo mới hoặc cập nhật từ URL</h2>
        <p className="mt-3 max-w-2xl leading-7 text-[#4f625a]">
          Chỉ chạy với nguồn kind=url đã có văn bản thô đọc được. AI so với thẻ draft/approved hiện có và lưu metadata gợi ý để vận hành duyệt; không cập nhật thẻ approved.
        </p>
        <form action={suggestKnowledgeFromSourceUrlForm} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="suggestSourceId">
            Source ID
          </label>
          <input
            className="min-h-12 flex-1 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]"
            id="suggestSourceId"
            name="sourceId"
            placeholder="Dán source ID URL để AI gợi ý"
            defaultValue={params.sourceId ?? ""}
          />
          <button
            className="min-h-12 rounded-2xl bg-[#17342c] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(23,52,44,0.18)] transition hover:bg-[#102720] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
            type="submit"
          >
            Gợi ý create/update
          </button>
        </form>
      </section>
    </div>
  );
}
