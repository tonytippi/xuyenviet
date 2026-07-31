import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminYoutubeCaptureReviewDetail } from "@/features/knowledge/youtube-capture-review-admin";
import { knowledgeCardStatusLabels, knowledgeCardTypeLabels, sourceTypeLabels, verificationStatusLabels } from "@/features/knowledge/display-labels";

type YoutubeCaptureDetailPageProps = {
  params: Promise<{ sourceId: string }>;
  searchParams: Promise<{ extractQueued?: string; jobId?: string; activeJob?: string; alreadyExtracted?: string; extractError?: string }>;
};

export default async function YoutubeCaptureDetailPage({ params, searchParams }: YoutubeCaptureDetailPageProps) {
  const [{ sourceId }] = await Promise.all([params, searchParams]);
  const capture = await getAdminYoutubeCaptureReviewDetail(sourceId);
  if (!capture) notFound();


  return (
    <div>
      <Link className="text-sm font-semibold text-[#1f5f46] underline underline-offset-4" href="/admin/knowledge/youtube-captures">Quay lại hàng đợi YouTube</Link>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Bằng chứng YouTube cần vận hành kiểm tra</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{capture.sourceLabel}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">Bằng chứng này chỉ dành cho vận hành. Hãy kiểm tra nội dung, mốc thời gian, độ tin cậy và thời điểm cần cập nhật trước khi tạo bản nháp; bản nháp vẫn cần phê duyệt riêng trước khi dùng cho du khách.</p>

      <section className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] p-4 text-sm leading-6 text-[#17342c]"><p className="font-semibold">Trạng thái xử lý tri thức</p><p className="mt-1">{capture.ingestionJob ? formatIngestionStage(capture.ingestionJob.stage) : "Đang chờ tạo tác vụ xử lý chính."}</p>{capture.ingestionJob ? <p className="mt-1 text-[#4f625a]">Job {capture.ingestionJob.id} · lần thử {capture.ingestionJob.attemptCount}/{capture.ingestionJob.maxAttempts}</p> : null}</section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#f4ead7] p-5 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Nguồn YouTube/cộng đồng, chưa xác minh</p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <Info label="URL video" value={capture.sourceCanonicalUrl ?? capture.sourceUrl ?? "Chưa có"} />
          <Info label="Mức độ tin cậy mặc định" value={`${sourceTypeLabels[capture.sourceType] ?? capture.sourceType}/${verificationStatusLabels[capture.verificationStatus] ?? capture.verificationStatus} · chính thức: ${capture.official ? "có" : "không"} · đối tác: ${capture.partner ? "có" : "không"}`} />
          <Info label="Thông tin thu thập an toàn" value={[capture.captureMethod, capture.capturedAt ? formatDate(capture.capturedAt) : null, capture.model, capture.promptVersion].filter(Boolean).join(" · ") || "Chưa có"} />
          <Info label="Bằng chứng hợp lệ" value={`${capture.evidenceCount} mục`} />
        </dl>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Bằng chứng đã thu thập</h2>
        <p className="mt-3 rounded-2xl border border-[#d99a93] bg-[#fff0ee] p-3 text-sm font-semibold leading-6 text-[#9b2f29]">Chỉ hiển thị bằng chứng đã được xử lý và giới hạn theo cấu trúc dữ liệu. Không hiển thị JSON thô, chỉ dẫn AI, dữ liệu từ nhà cung cấp hoặc bản chép lời.</p>
        <div className="mt-5 grid gap-4">
          {capture.evidence.map((item, index) => <article key={`${item.timestamp_start_seconds}-${item.timestamp_end_seconds}-${index}`} className="rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] p-4"><div className="flex flex-wrap gap-2 text-sm font-semibold"><span className="rounded-full bg-[#f4ead7] px-3 py-1 text-[#8c4f13]">{item.category}</span><span className="rounded-full bg-[#edf7ef] px-3 py-1 text-[#1f5f46]">{item.confidence}</span><span className="rounded-full bg-white px-3 py-1 text-[#4f625a]">{item.evidence_type}</span></div><h3 className="mt-4 text-lg font-semibold text-[#17342c]">{item.claim_vi}</h3><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Info label="Mốc thời gian" value={`${formatTimestamp(item.timestamp_start_seconds)} - ${formatTimestamp(item.timestamp_end_seconds)}`} /><Info label="Cần cập nhật theo thời điểm" value={item.freshness_sensitive ? "Có" : "Không"} /><Info label="Trích đoạn bằng chứng" value={item.evidence_excerpt} /><Info label="Điều kiện / chưa chắc chắn" value={item.uncertainty_or_condition ?? "Chưa có"} /></dl></article>)}
        </div>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6"><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Thẻ tri thức đã liên kết</h2><div className="mt-4 grid gap-3">{capture.existingCards.length === 0 ? <p className="rounded-2xl bg-[#fbf7ed] p-3 text-[#4f625a]">Chưa có thẻ nháp hoặc đã phê duyệt liên kết với video này.</p> : capture.existingCards.map((card) => <div key={card.id} className="rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] p-4 text-sm text-[#4f625a]">{card.status === "approved" || card.status === "draft" ? <Link className="font-semibold text-[#17342c] underline underline-offset-4" href={card.status === "approved" ? `/admin/knowledge/approved/${encodeURIComponent(card.id)}` : `/admin/knowledge/drafts/${encodeURIComponent(card.id)}`}>{card.title}</Link> : <p className="font-semibold text-[#17342c]">{card.title}</p>}<p className="mt-1">{knowledgeCardTypeLabels[card.type] ?? card.type} · {knowledgeCardStatusLabels[card.status] ?? card.status} · phiên bản chỉ dẫn AI: {card.aiPromptVersion}</p></div>)}</div></section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#fbf7ed] p-5 sm:p-6"><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Xử lý tự động</h2><p className="mt-4 rounded-2xl border border-[#d8c9ad] bg-white/75 p-4 text-sm leading-6 text-[#4f625a]">Video đã capture được tự động đưa vào quy trình tri thức chính. Quy trình này có thể tạo mục cần kiểm tra hoặc thẻ tri thức theo chính sách; không tạo bản nháp qua một hàng đợi riêng.</p></section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white/70 p-3"><dt className="font-semibold text-[#17342c]">{label}</dt><dd className="mt-1 break-words text-[#4f625a]">{value}</dd></div>; }
function formatDate(value: string) { return new Date(value).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }); }
function formatTimestamp(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function formatIngestionStage(value: string) { return ({ queued: "Đang chờ xử lý", triaging: "Đang sàng lọc", extracting: "Đang trích xuất", judging: "Đang đánh giá", relating: "Đang đối chiếu", published: "Đã xuất bản", suppressed: "Không dùng", review_recommended: "Cần kiểm tra", verify_first: "Cần xác minh", failed: "Xử lý thất bại" })[value] ?? value; }
