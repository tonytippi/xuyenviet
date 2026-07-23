import Link from "next/link";

import { getActiveEvidenceGroundedSeedCoverage } from "@/features/knowledge/batch-intake";

export const dynamic = "force-dynamic";

export default async function KnowledgeProgressPage() {
  const progress = await getActiveEvidenceGroundedSeedCoverage();
  const percent = Math.min(100, Math.round((progress.activeEvidenceGroundedCards / progress.targetActiveCards) * 100));

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Bao phủ seed có bằng chứng</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">100 thẻ có bằng chứng đang hoạt động cho hành lang Hà Nội - TP.HCM.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Chỉ đếm thẻ hiện hành có metadata truy xuất đầy đủ, evidence bị chặn theo span còn giữ lại và nguồn vẫn đủ điều kiện. Phê duyệt lịch sử không phải là tuyên bố sẵn sàng. Màn hình chỉ hiển thị aggregate an toàn.
      </p>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 shadow-[0_12px_30px_rgba(41,33,18,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Thẻ hoạt động có bằng chứng</p>
            <p className="mt-2 text-5xl font-semibold tracking-[-0.05em] text-[#17342c]">
              {progress.activeEvidenceGroundedCards}/{progress.targetActiveCards}
            </p>
          </div>
          <p className="rounded-full border border-[#d8c9ad] bg-[#fbf7ed] px-4 py-2 text-sm font-semibold text-[#4f625a]">
            {progress.isComplete ? "Đủ mục tiêu seed hiện hành" : `Còn thiếu ${progress.remainingActiveCards} thẻ`}
          </p>
        </div>
        <div className="mt-5 h-4 overflow-hidden rounded-full bg-[#e2d3ba]" aria-label={`Đã đạt ${percent}% mục tiêu seed`}>
          <div className="h-full rounded-full bg-[#1f5f46]" style={{ width: `${percent}%` }} />
        </div>
      </section>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ProgressSignal label="Quan sát cộng đồng đang tính" count={progress.activeCommunityObservations} />
        <ProgressSignal label="Mẫu cộng đồng đang tính" count={progress.activeCommunityPatterns} />
        <ProgressSignal label="Chỉ cảnh báo rủi ro cao" count={progress.caveatOnlyHighRiskCards} />
        <ProgressSignal label="Cần review" count={progress.pendingReviewCards} />
        <ProgressSignal label="Cần xác minh" count={progress.pendingVerificationCards} />
      </dl>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Công việc hiện hành để thu hẹp khoảng trống</h2>
        <p className="mt-2 leading-7 text-[#4f625a]">Chỉ gồm khuyến nghị mở hoặc đang xử lý có phiên bản nội dung và evidence trùng với thẻ hiện tại.</p>
        {progress.actionableWork.length === 0 ? <p className="mt-4 text-[#4f625a]">Chưa có khuyến nghị hiện hành cho corridor.</p> : (
          <ul className="mt-4 grid gap-3">
            {progress.actionableWork.map((item) => <li className="flex items-center justify-between gap-4 rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4" key={`${item.priority}:${item.reason}`}><span className="font-semibold text-[#17342c]">P{item.priority} · {item.reason}</span><span className="rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-[#4f625a]">{item.count}</span></li>)}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap gap-4">
          <Link className="font-semibold text-[#1f5f46] underline underline-offset-4" href="/admin/knowledge/intake">Mở nạp nguồn</Link>
          <Link className="font-semibold text-[#1f5f46] underline underline-offset-4" href="/admin/knowledge/recommendations">Mở khuyến nghị</Link>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <ProgressList title="Phân bổ theo loại thẻ" empty="Chưa có thẻ corridor đủ điều kiện." items={progress.byType.map((item) => ({ label: item.type, count: item.count }))} />
        <ProgressList title="Phân bổ theo route/location" empty="Chưa có route/location corridor đủ điều kiện." items={progress.byRouteOrLocation.map((item) => ({ label: item.routeOrLocation, count: item.count }))} />
      </section>
    </div>
  );
}

function ProgressSignal({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] p-4">
      <dt className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8c4f13]">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold text-[#17342c]">{count}</dd>
    </div>
  );
}

function ProgressList({ title, empty, items }: { title: string; empty: string; items: Array<{ label: string; count: number }> }) {
  return (
    <section className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5 sm:p-6">
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 leading-7 text-[#4f625a]">{empty}</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {items.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-4 rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4">
              <span className="font-semibold text-[#17342c]">{item.label}</span>
              <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-[#4f625a]">{item.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
