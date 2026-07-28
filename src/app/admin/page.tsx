import Link from "next/link";

import { getAdminOverview } from "@/features/admin/overview";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const overview = await getAdminOverview();
  const coveragePercent = Math.min(100, Math.round((overview.coverage.activeEvidenceGroundedCards / overview.coverage.targetActiveCards) * 100));
  const priorityWork = [
    { label: "Bản nháp cần duyệt", count: overview.draftsAwaitingReview, href: "/admin/knowledge/drafts", detail: "Kiểm tra claim, evidence và điều kiện trước khi công bố." },
    { label: "Khuyến nghị đang mở", count: overview.openRecommendations, href: "/admin/knowledge/recommendations", detail: "Xử lý rủi ro, freshness, mâu thuẫn và các việc sampling." },
    { label: "Cần xác minh", count: overview.coverage.pendingVerificationCards, href: "/admin/knowledge/recommendations?reason=verification", detail: "Các thẻ chưa đủ điều kiện để dùng rộng rãi cho traveler." },
  ];

  return (
    <div className="grid gap-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#10251e] p-6 text-white shadow-[0_24px_70px_rgba(16,37,30,0.24)] sm:p-8 lg:p-10">
        <div className="absolute -right-20 -top-24 size-72 rounded-full bg-[#e5bd82]/25 blur-3xl" />
        <div className="absolute -bottom-24 left-10 size-80 rounded-full bg-[#1f5f46]/45 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-end">
          <div>
            <p className="w-fit rounded-full border border-[#e5bd82]/30 bg-[#e5bd82]/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-[#e5bd82]">
              Tổng quan vận hành
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
              Bắt đầu từ việc đang chặn chất lượng.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#c9d7d1]">
              Luồng mới: nạp nguồn, theo dõi xử lý AI, duyệt tri thức, giải quyết khuyến nghị, rồi kiểm chứng tín hiệu chất lượng. Chỉ tri thức hiện hành có evidence hợp lệ mới được tính vào coverage.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 backdrop-blur">
            <p className="text-sm font-semibold text-[#e5bd82]">Mục tiêu seed hiện hành</p>
            <p className="mt-3 text-5xl font-semibold tracking-[-0.06em] text-white">{overview.coverage.activeEvidenceGroundedCards}<span className="text-2xl text-[#c9d7d1]">/{overview.coverage.targetActiveCards}</span></p>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15" aria-label={`Đã đạt ${coveragePercent}% mục tiêu seed`}>
              <div className="h-full rounded-full bg-[#e5bd82]" style={{ width: `${coveragePercent}%` }} />
            </div>
            <p className="mt-3 text-sm leading-6 text-[#c9d7d1]">{overview.coverage.isComplete ? "Đã đủ coverage mục tiêu cho corridor." : `Còn thiếu ${overview.coverage.remainingActiveCards} thẻ có evidence hợp lệ.`}</p>
            <Link className="mt-5 inline-flex min-h-11 items-center rounded-2xl bg-white px-4 py-3 font-semibold text-[#17342c] transition hover:bg-[#fbf7ed] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/40" href="/admin/knowledge/progress">Mở coverage</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Nguồn còn hiệu lực" value={overview.sourcesReadyForProcessing} detail="Nguồn có thể đi tiếp trong pipeline." href="/admin/knowledge/intake" />
        <Metric label="Đang xử lý AI" value={overview.processingJobs} detail="Đang sàng lọc, trích xuất hoặc đối chiếu." href="/admin/knowledge/facebook-captures" />
        <Metric label="Tri thức active" value={overview.activeKnowledgeCards} detail="Thẻ canonical hiện được phép dùng theo policy." href="/admin/knowledge/approved" />
        <Metric label="Lỗi pipeline" value={overview.failedProcessingJobs} detail="Job thất bại cần được kiểm tra hoặc chạy lại." href="/admin/knowledge/facebook-captures?status=failed" tone={overview.failedProcessingJobs > 0 ? "warning" : "default"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.75rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Ưu tiên tiếp theo</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#17342c]">Dọn hàng đợi trước khi tăng coverage.</h2>
            </div>
            <Link className="font-semibold text-[#1f5f46] underline underline-offset-4" href="/admin/knowledge/recommendations">Xem toàn bộ khuyến nghị</Link>
          </div>
          <div className="mt-5 grid gap-3">
            {priorityWork.map((item, index) => (
              <Link className="group flex gap-4 rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4 transition hover:border-[#1f5f46]/35 hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/35" href={item.href} key={item.label}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1f5f46] text-sm font-semibold text-white">{index + 1}</span>
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-baseline justify-between gap-2 font-semibold text-[#17342c]">{item.label}<strong className="text-2xl tracking-[-0.04em]">{item.count}</strong></span><span className="mt-1 block leading-6 text-[#4f625a]">{item.detail}</span></span>
              </Link>
            ))}
          </div>
        </div>

        <aside className="rounded-[1.75rem] border border-[#1f5f46]/20 bg-[#17342c] p-5 text-white sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e5bd82]">Sức khỏe kho tri thức</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Các tín hiệu cần theo dõi.</h2>
          <p className="mt-3 leading-7 text-[#c9d7d1]">Các số liệu này cho biết tri thức đang dùng còn vướng việc review, xác minh hoặc cần lưu ý về mức độ tin cậy.</p>
          <dl className="mt-5 grid gap-3">
            <StatusLine label="Cần review" detail="Số thẻ tri thức còn cần người vận hành kiểm tra." value={overview.coverage.pendingReviewCards} href="/admin/knowledge/drafts" />
            <StatusLine label="Cảnh báo rủi ro cao" detail="Thẻ có evidence nhưng chưa chắc chắn hoặc cần xác minh; chỉ nên dùng kèm cảnh báo hoặc điều kiện." value={overview.coverage.caveatOnlyHighRiskCards} href="/admin/knowledge/recommendations" />
            <StatusLine label="Tri thức từ cộng đồng" detail="Thông tin được tổng hợp từ chia sẻ của cộng đồng du lịch và đang có thể dùng cho traveler theo chính sách hiện hành." value={overview.coverage.activeCommunityObservations + overview.coverage.activeCommunityPatterns} href="/admin/knowledge/progress" />
          </dl>
          <Link className="mt-6 inline-flex min-h-11 items-center rounded-2xl bg-white px-4 py-3 font-semibold text-[#17342c] transition hover:bg-[#fbf7ed] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/40" href="/admin/quality">Kiểm tra chất lượng MVP</Link>
        </aside>
      </section>

      <section className="rounded-[1.75rem] border border-[#d8c9ad] bg-white/70 p-5 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Flow vận hành</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#17342c]">Từ nguồn thô đến câu trả lời có trách nhiệm.</h2>
        <ol className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FlowStep number="01" title="Nạp nguồn" detail="Lưu URL và metadata an toàn." href="/admin/knowledge/intake" />
          <FlowStep number="02" title="Theo dõi xử lý" detail="Capture, trích xuất và sàng lọc AI." href="/admin/knowledge/facebook-captures" />
          <FlowStep number="03" title="Duyệt tri thức" detail="Đánh giá claim và evidence trước khi dùng." href="/admin/knowledge/drafts" />
          <FlowStep number="04" title="Giải quyết tín hiệu" detail="Xử lý risk, freshness và sampling." href="/admin/knowledge/recommendations" />
          <FlowStep number="05" title="Đo chất lượng" detail="Theo dõi eval, feedback và readiness." href="/admin/quality" />
        </ol>
      </section>
    </div>
  );
}

function Metric({ label, value, detail, href, tone = "default" }: { label: string; value: number; detail: string; href: string; tone?: "default" | "warning" }) {
  return <Link className={`rounded-[1.5rem] border p-5 shadow-[0_12px_36px_rgba(23,52,44,0.08)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/35 ${tone === "warning" ? "border-[#d99a93] bg-[#fff3df]" : "border-[#d8c9ad] bg-white/80"}`} href={href}><p className={`text-sm font-semibold uppercase tracking-[0.16em] ${tone === "warning" ? "text-[#9b2f29]" : "text-[#8c4f13]"}`}>{label}</p><p className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[#17342c]">{value}</p><p className="mt-2 leading-6 text-[#4f625a]">{detail}</p></Link>;
}

function StatusLine({ label, detail, value, href }: { label: string; detail: string; value: number; href: string }) {
  return <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3"><div><dt className="font-semibold text-white">{label}</dt><p className="mt-1 text-sm leading-6 text-[#c9d7d1]">{detail}</p></div><dd className="pt-0.5"><Link className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white underline underline-offset-4" href={href}>{value}</Link></dd></div>;
}

function FlowStep({ number, title, detail, href }: { number: string; title: string; detail: string; href: string }) {
  return <li><Link className="block h-full rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4 transition hover:border-[#1f5f46]/35 hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/35" href={href}><span className="text-sm font-semibold tracking-[0.16em] text-[#8c4f13]">{number}</span><h3 className="mt-3 text-lg font-semibold text-[#17342c]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#4f625a]">{detail}</p></Link></li>;
}
