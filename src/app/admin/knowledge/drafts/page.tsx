import Link from "next/link";

import { listKnowledgeDraftsForReview } from "@/features/knowledge/review";

type KnowledgeDraftsPageProps = {
  searchParams: Promise<{
    error?: string;
    rejected?: string;
  }>;
};

export default async function KnowledgeDraftsPage({ searchParams }: KnowledgeDraftsPageProps) {
  const params = await searchParams;
  const drafts = await listKnowledgeDraftsForReview();

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Duyệt bản nháp AI</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Hàng đợi tri thức cần vận hành kiểm tra.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Chỉ hiển thị trường bản nháp và metadata nguồn an toàn. Nội dung thô, file ảnh, storage key và payload nhà cung cấp không được tải lên giao diện này.
      </p>

      {params.rejected ? (
        <p className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] px-4 py-3 font-semibold text-[#1f5f46]" role="status">
          Đã từ chối bản nháp. Bản nháp đó không còn nằm trong hàng đợi mặc định.
        </p>
      ) : null}
      {params.error ? (
        <p className="mt-6 rounded-2xl border border-[#d99a93] bg-[#fff0ee] px-4 py-3 font-semibold text-[#9b2f29]" role="alert">
          {params.error}
        </p>
      ) : null}

      <section className="mt-8 grid gap-4">
        {drafts.length === 0 ? (
          <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Chưa có bản nháp cần duyệt</h2>
            <p className="mt-3 leading-7 text-[#4f625a]">Hãy nạp nguồn và chạy trích xuất AI để tạo bản nháp mới.</p>
          </div>
        ) : (
          drafts.map((draft) => (
            <article key={draft.id} className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 shadow-[0_12px_30px_rgba(41,33,18,0.08)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">{draft.type}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{draft.title}</h2>
                </div>
                <Link className="min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 text-center font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" href={`/admin/knowledge/drafts/${draft.id}`}>
                  Sửa / từ chối
                </Link>
              </div>

              <p className="mt-4 leading-7 text-[#4f625a]">{draft.summary}</p>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Địa điểm / cung đường</dt>
                  <dd className="mt-1 text-[#4f625a]">{[draft.locationName, draft.routeSegment].filter(Boolean).join(" · ") || "Chưa có"}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Trạng thái</dt>
                  <dd className="mt-1 text-[#4f625a]">{draft.status} · cần duyệt: {draft.needsReview ? "có" : "không"}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Độ tin cậy</dt>
                  <dd className="mt-1 text-[#4f625a]">{draft.confidence}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Freshness-sensitive</dt>
                  <dd className="mt-1 text-[#4f625a]">{draft.freshnessSensitive ? "Có" : "Không"}</dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {draft.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-[#d8c9ad] bg-[#fbf7ed] px-3 py-1 text-sm font-semibold text-[#4f625a]">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-[#d8c9ad] bg-[#f4ead7] p-4">
                <p className="font-semibold text-[#17342c]">Nguồn an toàn</p>
                <ul className="mt-3 grid gap-2 text-sm text-[#4f625a]">
                  {draft.sources.map((source) => (
                    <li key={source.id}>
                      {source.label} · {source.kind} · {source.sourceType}/{source.verificationStatus}
                      {source.collectedDate ? ` · ${source.collectedDate}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
