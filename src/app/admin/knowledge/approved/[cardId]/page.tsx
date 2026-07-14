import Link from "next/link";
import { notFound } from "next/navigation";

import { getApprovedKnowledgeCard } from "@/features/knowledge/review";

type ApprovedKnowledgeDetailPageProps = {
  params: Promise<{
    cardId: string;
  }>;
};

function formatDetailLabel(value: string) {
  return value.replaceAll("_", " ");
}

function stringifyDetailValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

export default async function ApprovedKnowledgeDetailPage({ params }: ApprovedKnowledgeDetailPageProps) {
  const { cardId } = await params;
  const card = await getApprovedKnowledgeCard(cardId);

  if (!card) {
    notFound();
  }

  const practicalDetails = Object.entries(card.practicalDetails);

  return (
    <div>
      <Link className="text-sm font-semibold text-[#1f5f46] underline underline-offset-4" href="/admin/knowledge/approved">
        Quay lại tri thức đã duyệt
      </Link>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Thẻ approved</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{card.title}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Đây là projection an toàn cho hậu kiểm nguồn và confidence. Không có raw text, raw metadata, storage key hoặc provider payload trên màn hình này.
      </p>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Nội dung đã phê duyệt</h2>
        <div className="mt-4 whitespace-pre-wrap break-words leading-7 text-[#4f625a]">{card.summary}</div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-[#fbf7ed] p-3">
            <dt className="font-semibold text-[#17342c]">Trạng thái</dt>
            <dd className="mt-1 text-[#4f625a]">{card.status} · cần duyệt: {card.needsReview ? "có" : "không"}</dd>
          </div>
          <div className="rounded-2xl bg-[#fbf7ed] p-3">
            <dt className="font-semibold text-[#17342c]">Loại / confidence</dt>
            <dd className="mt-1 text-[#4f625a]">{card.type} · {card.confidence}</dd>
          </div>
          <div className="rounded-2xl bg-[#fbf7ed] p-3">
            <dt className="font-semibold text-[#17342c]">Địa điểm / cung đường</dt>
            <dd className="mt-1 text-[#4f625a]">{[card.locationName, card.routeSegment].filter(Boolean).join(" · ") || "Chưa có"}</dd>
          </div>
          <div className="rounded-2xl bg-[#fbf7ed] p-3">
            <dt className="font-semibold text-[#17342c]">Freshness-sensitive</dt>
            <dd className="mt-1 text-[#4f625a]">{card.freshnessSensitive ? "Có" : "Không"}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          {card.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[#d8c9ad] bg-[#fbf7ed] px-3 py-1 text-sm font-semibold text-[#4f625a]">
              {tag}
            </span>
          ))}
        </div>
      </section>

      {practicalDetails.length > 0 ? (
        <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Chi tiết thực tế</h2>
          <dl className="mt-4 grid gap-3">
            {practicalDetails.map(([key, value]) => (
              <div key={key} className="rounded-2xl bg-[#fbf7ed] p-4">
                <dt className="font-semibold text-[#17342c]">{formatDetailLabel(key)}</dt>
                <dd className="mt-2 whitespace-pre-wrap break-words leading-7 text-[#4f625a]">
                  {Array.isArray(value) ? value.map((item) => stringifyDetailValue(item)).join("\n") : stringifyDetailValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#f4ead7] p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Nguồn an toàn liên kết</h2>
        <div className="mt-4 grid gap-3">
          {card.sources.map((source) => (
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
    </div>
  );
}
