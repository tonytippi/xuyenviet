import Link from "next/link";

import { listApprovedKnowledgeCardsWithIndexStatus, getApprovedKnowledgeIndexStatuses, type ApprovedKnowledgeIndexStatus } from "@/features/knowledge/review";
import { searchApprovedKnowledgeWithCandidateCount } from "@/features/knowledge/search";

type ApprovedKnowledgePageProps = {
  searchParams: Promise<{
    approved?: string;
    q?: string;
  }>;
};

const searchLimit = 10;

export default async function ApprovedKnowledgePage({ searchParams }: ApprovedKnowledgePageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const searchMode = query.length > 0;
  const searchResult = searchMode ? await searchApprovedKnowledgeWithCandidateCount(query, { limit: searchLimit }) : null;
  const cards = searchMode ? [] : await listApprovedKnowledgeCardsWithIndexStatus();
  const searchIndexStatuses = searchResult ? await getApprovedKnowledgeIndexStatuses(searchResult.results.map((card) => card.id)) : new Map<string, ApprovedKnowledgeIndexStatus>();

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Tri thức đã phê duyệt</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Nguồn và confidence sau phê duyệt.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
          Hiển thị thẻ approved, metadata nguồn an toàn và trạng thái index. Thẻ chưa có evidence được đánh dấu chờ evidence và không thể index hay dùng cho traveler. Màn hình này không đọc raw source material.
      </p>

      <form className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-4 shadow-[0_12px_30px_rgba(41,33,18,0.08)] sm:p-5" action="/admin/knowledge/approved">
        <label className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]" htmlFor="approved-knowledge-search">
          Tìm trong index approved
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            className="min-h-12 flex-1 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-[#17342c] outline-none transition placeholder:text-[#7a8b83] focus:border-[#1f5f46] focus:ring-4 focus:ring-[#8fb59f]/40"
            defaultValue={query}
            id="approved-knowledge-search"
            name="q"
            placeholder="Ví dụ: chỗ đỗ xe Huế, lặn ngắm san hô Quy Nhơn"
            type="search"
          />
          <button className="min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" type="submit">
            Tìm kiếm
          </button>
          {searchMode ? (
            <Link className="min-h-12 rounded-2xl border border-[#8fb59f] px-5 py-3 text-center font-semibold text-[#1f5f46] transition hover:bg-[#edf7ef] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" href="/admin/knowledge/approved">
              Xóa tìm kiếm
            </Link>
          ) : null}
        </div>
        <p className="mt-3 text-sm leading-6 text-[#4f625a]">Kết quả dùng cùng search index với AI Ask; worker chịu trách nhiệm index và refresh.</p>
      </form>

      {params.approved ? (
        <p className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] px-4 py-3 font-semibold text-[#1f5f46]" role="status">
          Thẻ {params.approved} đã được phê duyệt. Kiểm tra source, confidence và freshness tại danh sách này.
        </p>
      ) : null}

      <section className="mt-8 grid gap-4">
        {searchMode ? (
          <>
            <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-[#fbf7ed] p-5">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Kết quả search: {query}</h2>
              <p className="mt-3 leading-7 text-[#4f625a]">
                Tìm thấy {searchResult?.candidateCount ?? 0} thẻ indexed, hiển thị {searchResult?.results.length ?? 0} kết quả phù hợp nhất.
              </p>
            </div>
            {searchResult?.results.length === 0 ? (
              <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Không tìm thấy trong search index</h2>
                <p className="mt-3 leading-7 text-[#4f625a]">Thử từ khóa khác hoặc kiểm tra worker indexing nếu thẻ expected chưa xuất hiện.</p>
              </div>
            ) : (
              searchResult?.results.map((card) => <ApprovedKnowledgeCardArticle card={{ ...card, indexStatus: searchIndexStatuses.get(card.id) ?? null }} key={card.id} score={card.score} />)
            )}
          </>
        ) : cards.length === 0 ? (
          <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Chưa có thẻ approved</h2>
              <p className="mt-3 leading-7 text-[#4f625a]">Phê duyệt bản nháp đã kiểm tra để thẻ xuất hiện ở đây.</p>
          </div>
        ) : (
          cards.map((card) => <ApprovedKnowledgeCardArticle card={card} key={card.id} />)
        )}
      </section>
    </div>
  );
}

type ApprovedKnowledgeCardArticleProps = {
  card: {
    id: string;
    type: string;
    title: string;
    locationName: string | null;
    routeSegment: string | null;
    summary: string;
    tags: string[];
    confidence: string;
    freshnessSensitive: boolean;
    updatedAt: Date;
    sources: Array<{
      id: string;
      kind: string;
      url: string | null;
      canonicalUrl: string | null;
      label: string;
      publisher: string | null;
      collectedDate: string | null;
      sourceType: string;
      verificationStatus: string;
      supportLevel: string;
    }>;
    indexStatus: ApprovedKnowledgeIndexStatus | null;
  };
  score?: number;
};

function ApprovedKnowledgeCardArticle({ card, score }: ApprovedKnowledgeCardArticleProps) {
  return (
    <article className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 shadow-[0_12px_30px_rgba(41,33,18,0.08)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">{card.type} · approved</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{card.title}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
            {card.indexStatus ? <IndexStatusBadge status={card.indexStatus} /> : null}
            {typeof score === "number" ? <span className="rounded-full border border-[#d8c9ad] bg-[#fbf7ed] px-3 py-1 text-[#4f625a]">Score: {score}</span> : null}
          </div>
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
        {card.indexStatus ? (
          <div className="rounded-2xl bg-[#fbf7ed] p-3">
            <dt className="font-semibold text-[#17342c]">Index / eligibility</dt>
            <dd className="mt-1 text-[#4f625a]">
              {card.indexStatus.label}
              {card.indexStatus.indexedAt ? ` · ${card.indexStatus.indexedAt.toISOString()}` : ""}
            </dd>
          </div>
        ) : null}
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
  );
}

function IndexStatusBadge({ status }: { status: ApprovedKnowledgeIndexStatus }) {
  const className = status.state === "indexed" ? "border-[#8fb59f] bg-[#edf7ef] text-[#1f5f46]" : "border-[#d8c9ad] bg-[#f4ead7] text-[#8c4f13]";
  return <span className={`rounded-full border px-3 py-1 ${className}`}>{status.label}</span>;
}
