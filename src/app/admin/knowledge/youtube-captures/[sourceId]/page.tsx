import Link from "next/link";
import { notFound } from "next/navigation";

import { sourceKnowledgeDraftExtractionPromptVersion } from "@/features/ai/prompts";
import { extractKnowledgeDraftsFromYoutubeCaptureForm } from "@/features/knowledge/actions";
import { getAdminYoutubeCaptureReviewDetail } from "@/features/knowledge/youtube-capture-review-admin";

type YoutubeCaptureDetailPageProps = {
  params: Promise<{ sourceId: string }>;
  searchParams: Promise<{ extractQueued?: string; jobId?: string; activeJob?: string; alreadyExtracted?: string; extractError?: string }>;
};

export default async function YoutubeCaptureDetailPage({ params, searchParams }: YoutubeCaptureDetailPageProps) {
  const [{ sourceId }, query] = await Promise.all([params, searchParams]);
  const capture = await getAdminYoutubeCaptureReviewDetail(sourceId);
  if (!capture) notFound();

  const hasExtractionCards = capture.existingCards.some((card) => card.aiPromptVersion === sourceKnowledgeDraftExtractionPromptVersion);
  const canExtract = !capture.activeExtractionJob && !hasExtractionCards;

  return (
    <div>
      <Link className="text-sm font-semibold text-[#1f5f46] underline underline-offset-4" href="/admin/knowledge/youtube-captures">Quay lại hàng đợi YouTube</Link>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Evidence YouTube cần vận hành kiểm tra</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{capture.sourceLabel}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">Evidence này chỉ dành cho vận hành. Hãy kiểm tra claim, timestamp, confidence và freshness trước khi tạo bản nháp; bản nháp vẫn cần phê duyệt riêng trước khi dùng cho traveler.</p>

      {(query.extractQueued || query.alreadyExtracted || query.extractError) && <section className="mt-6 rounded-2xl border border-[#d8c9ad] bg-white/80 p-4 text-sm leading-6 text-[#17342c]">{query.extractQueued && <p>Yêu cầu trích xuất đã được đưa vào hàng đợi. Bạn có thể quay lại sau để xem bản nháp.{query.jobId ? ` Job: ${query.jobId}.` : null}</p>}{query.alreadyExtracted && <p>Video này đã có thẻ được trích xuất. Kiểm tra các thẻ liên kết thay vì trích xuất lại.</p>}{query.extractError && <p>{query.extractError}</p>}</section>}

      {capture.activeExtractionJob && <section className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] p-4 text-sm leading-6 text-[#17342c]"><p className="font-semibold">Đang trích xuất bằng AI</p><p className="mt-1">Không cần bấm lại; hệ thống sẽ cập nhật khi hoàn tất.</p><p className="mt-1 text-[#4f625a]">Job {capture.activeExtractionJob.id} · {capture.activeExtractionJob.mode} · {capture.activeExtractionJob.status} · lần thử {capture.activeExtractionJob.attemptCount}/{capture.activeExtractionJob.maxAttempts}</p></section>}

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#f4ead7] p-5 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Nguồn YouTube/cộng đồng, chưa xác minh</p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <Info label="URL video" value={capture.sourceCanonicalUrl ?? capture.sourceUrl ?? "Chưa có"} />
          <Info label="Trust mặc định" value={`${capture.sourceType}/${capture.verificationStatus} · official: ${capture.official ? "có" : "không"} · partner: ${capture.partner ? "có" : "không"}`} />
          <Info label="Capture metadata an toàn" value={[capture.captureMethod, capture.capturedAt ? formatDate(capture.capturedAt) : null, capture.model, capture.promptVersion].filter(Boolean).join(" · ") || "Chưa có"} />
          <Info label="Evidence hợp lệ" value={`${capture.evidenceCount} mục`} />
        </dl>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Evidence đã capture</h2>
        <p className="mt-3 rounded-2xl border border-[#d99a93] bg-[#fff0ee] p-3 text-sm font-semibold leading-6 text-[#9b2f29]">Chỉ hiển thị evidence đã được parse và giới hạn theo schema. Không hiển thị JSON thô, prompt, provider payload hoặc transcript.</p>
        <div className="mt-5 grid gap-4">
          {capture.evidence.map((item, index) => <article key={`${item.timestamp_start_seconds}-${item.timestamp_end_seconds}-${index}`} className="rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] p-4"><div className="flex flex-wrap gap-2 text-sm font-semibold"><span className="rounded-full bg-[#f4ead7] px-3 py-1 text-[#8c4f13]">{item.category}</span><span className="rounded-full bg-[#edf7ef] px-3 py-1 text-[#1f5f46]">{item.confidence}</span><span className="rounded-full bg-white px-3 py-1 text-[#4f625a]">{item.evidence_type}</span></div><h3 className="mt-4 text-lg font-semibold text-[#17342c]">{item.claim_vi}</h3><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Info label="Timestamp" value={`${formatTimestamp(item.timestamp_start_seconds)} - ${formatTimestamp(item.timestamp_end_seconds)}`} /><Info label="Freshness-sensitive" value={item.freshness_sensitive ? "Có" : "Không"} /><Info label="Excerpt evidence" value={item.evidence_excerpt} /><Info label="Điều kiện / chưa chắc chắn" value={item.uncertainty_or_condition ?? "Chưa có"} /></dl></article>)}
        </div>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6"><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Thẻ tri thức đã liên kết</h2><div className="mt-4 grid gap-3">{capture.existingCards.length === 0 ? <p className="rounded-2xl bg-[#fbf7ed] p-3 text-[#4f625a]">Chưa có thẻ draft/approved liên kết với video này.</p> : capture.existingCards.map((card) => <div key={card.id} className="rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] p-4 text-sm text-[#4f625a]">{card.status === "approved" || card.status === "draft" ? <Link className="font-semibold text-[#17342c] underline underline-offset-4" href={card.status === "approved" ? `/admin/knowledge/approved/${encodeURIComponent(card.id)}` : `/admin/knowledge/drafts/${encodeURIComponent(card.id)}`}>{card.title}</Link> : <p className="font-semibold text-[#17342c]">{card.title}</p>}<p className="mt-1">{card.type} · {card.status} · prompt: {card.aiPromptVersion}</p></div>)}</div></section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#fbf7ed] p-5 sm:p-6"><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Hành động vận hành</h2>{canExtract ? <div className="mt-4 rounded-2xl border border-[#d8c9ad] bg-white/75 p-4"><p className="text-sm font-semibold text-[#17342c]">AI sẽ tạo thẻ nháp để bạn duyệt. Chưa có thẻ nào được phê duyệt hoặc dùng cho câu trả lời của khách.</p><form action={extractKnowledgeDraftsFromYoutubeCaptureForm} className="mt-4"><input name="sourceId" type="hidden" value={capture.sourceId} /><button className="min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" type="submit">Trích xuất bản nháp</button></form></div> : <p className="mt-4 rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm leading-6 text-[#4f625a]">{capture.activeExtractionJob ? "Video này đang được trích xuất bằng AI. Không cần bấm lại." : "Video này đã có thẻ liên kết. Kiểm tra bản nháp hoặc thẻ đã duyệt thay vì trích xuất lại."}</p>}</section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white/70 p-3"><dt className="font-semibold text-[#17342c]">{label}</dt><dd className="mt-1 break-words text-[#4f625a]">{value}</dd></div>; }
function formatDate(value: string) { return new Date(value).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }); }
function formatTimestamp(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
