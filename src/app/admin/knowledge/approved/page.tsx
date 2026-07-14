import Link from "next/link";

import { listApprovedKnowledgeCards } from "@/features/knowledge/review";

type ApprovedKnowledgePageProps = {
  searchParams: Promise<{
    approved?: string;
  }>;
};

export default async function ApprovedKnowledgePage({ searchParams }: ApprovedKnowledgePageProps) {
  const [params, cards] = await Promise.all([searchParams, listApprovedKnowledgeCards()]);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Tri thức đã phê duyệt</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Nguồn và confidence sau phê duyệt.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Chỉ hiển thị thẻ approved cùng metadata nguồn an toàn. Màn hình này không đọc raw source material và chưa tạo embedding cho truy xuất.
      </p>

      {params.approved ? (
        <p className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] px-4 py-3 font-semibold text-[#1f5f46]" role="status">
          Thẻ {params.approved} đã được phê duyệt. Kiểm tra source, confidence và freshness tại danh sách này.
        </p>
      ) : null}

      <section className="mt-8 grid gap-4">
        {cards.length === 0 ? (
          <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Chưa có thẻ approved</h2>
            <p className="mt-3 leading-7 text-[#4f625a]">Phê duyệt bản nháp đã kiểm tra để thẻ xuất hiện ở đây.</p>
          </div>
        ) : (
          cards.map((card) => (
            <article key={card.id} className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 shadow-[0_12px_30px_rgba(41,33,18,0.08)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">{card.type} · {card.status}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{card.title}</h2>
                </div>
                <Link className="min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 text-center font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" href={`/admin/knowledge/approved/${card.id}`}>
                  Xem chi tiết
                </Link>
              </div>

              <p className="mt-4 leading-7 text-[#4f625a]">{card.summary}</p>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Địa điểm / cung đường</dt>
                  <dd className="mt-1 text-[#4f625a]">{[card.locationName, card.routeSegment].filter(Boolean).join(" · ") || "Chưa có"}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Confidence / freshness</dt>
                  <dd className="mt-1 text-[#4f625a]">{card.confidence} · freshness-sensitive: {card.freshnessSensitive ? "có" : "không"}</dd>
                </div>
                <div className="rounded-2xl bg-[#fbf7ed] p-3">
                  <dt className="font-semibold text-[#17342c]">Cập nhật</dt>
                  <dd className="mt-1 text-[#4f625a]">{card.updatedAt.toISOString()}</dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {card.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-[#d8c9ad] bg-[#fbf7ed] px-3 py-1 text-sm font-semibold text-[#4f625a]">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-[#d8c9ad] bg-[#f4ead7] p-4">
                <p className="font-semibold text-[#17342c]">Nguồn an toàn</p>
                <ul className="mt-3 grid gap-2 text-sm text-[#4f625a]">
                  {card.sources.map((source) => (
                    <li key={source.id}>
                      {source.label} · {source.kind} · {source.sourceType}/{source.verificationStatus} · hỗ trợ: {source.supportLevel}
                      {source.publisher ? ` · ${source.publisher}` : ""}
                      {source.collectedDate ? ` · ${source.collectedDate}` : ""}
                      {source.canonicalUrl || source.url ? ` · ${source.canonicalUrl ?? source.url}` : ""}
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
