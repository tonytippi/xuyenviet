"use client";

import { useEffect, useState } from "react";
import { parseAdminOverview, type AdminOverview } from "@xuyenviet/contracts";

function apiOrigin() {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (!origin) throw new Error("NEXT_PUBLIC_API_ORIGIN is required.");
  return origin;
}

function signIn() {
  window.location.assign(`${apiOrigin()}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/` })}`);
}

export function AdminOverviewPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [status, setStatus] = useState("Đang tải tổng quan vận hành.");

  useEffect(() => {
    void fetch(`${apiOrigin()}/v1/admin/overview`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) { signIn(); return null; }
        const parsed = parseAdminOverview(await response.json().catch(() => null));
        if (!response.ok || !parsed) throw new Error("overview unavailable");
        return parsed;
      })
      .then((result) => { if (result) { setOverview(result); setStatus(""); } })
      .catch(() => setStatus("Không thể tải tổng quan vận hành. Vui lòng thử lại."));
  }, []);

  if (!overview) return <main className="mx-auto max-w-6xl p-4 text-slate-900 sm:p-8"><h1 className="text-3xl font-bold">Tổng quan vận hành</h1><p className="mt-4" role="status">{status}</p></main>;
  const coveragePercent = Math.min(100, Math.round(overview.coverage.activeEvidenceGroundedCards / overview.coverage.targetActiveCards * 100));
  const metrics = [["Nguồn còn hiệu lực", overview.sourcesReadyForProcessing], ["Đang xử lý AI", overview.processingJobs], ["Tri thức active", overview.activeKnowledgeCards], ["Lỗi pipeline", overview.failedProcessingJobs]];
  const health = [["Cần review", overview.coverage.pendingReviewCards], ["Cần xác minh", overview.coverage.pendingVerificationCards], ["Cảnh báo rủi ro cao", overview.coverage.caveatOnlyHighRiskCards], ["Tri thức từ cộng đồng", overview.coverage.activeCommunityObservations + overview.coverage.activeCommunityPatterns]];
  return <main className="mx-auto max-w-6xl p-4 text-slate-900 sm:p-8"><header className="rounded-2xl bg-emerald-950 p-6 text-white"><p className="text-sm font-semibold text-amber-200">TỔNG QUAN VẬN HÀNH</p><h1 className="mt-2 text-4xl font-bold">Bắt đầu từ việc đang chặn chất lượng.</h1><p className="mt-4 max-w-3xl text-emerald-100">Chỉ tri thức hiện hành có evidence hợp lệ mới được tính vào coverage.</p><div className="mt-6 rounded-xl border border-white/20 p-4"><p className="font-semibold text-amber-200">Mục tiêu seed hiện hành</p><p className="mt-2 text-4xl font-bold">{overview.coverage.activeEvidenceGroundedCards}<span className="text-xl text-emerald-100">/{overview.coverage.targetActiveCards}</span></p><div className="mt-3 h-2 overflow-hidden rounded bg-white/20"><div className="h-full bg-amber-300" style={{ width: `${coveragePercent}%` }} /></div><p className="mt-2 text-sm text-emerald-100">{overview.coverage.isComplete ? "Đã đủ coverage mục tiêu cho corridor." : `Còn thiếu ${overview.coverage.remainingActiveCards} thẻ có evidence hợp lệ.`}</p></div></header><section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <article className="rounded-xl border p-4" key={label as string}><p className="text-sm font-semibold text-emerald-800">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></article>)}</section><section className="mt-6 grid gap-6 lg:grid-cols-2"><div className="rounded-xl border p-5"><h2 className="text-2xl font-bold">Ưu tiên tiếp theo</h2><dl className="mt-4 grid gap-3">{[["Bản nháp cần duyệt", overview.draftsAwaitingReview], ["Khuyến nghị đang mở", overview.openRecommendations], ["Cần xác minh", overview.coverage.pendingVerificationCards]].map(([label, value]) => <div className="flex justify-between rounded-lg bg-slate-50 p-3" key={label as string}><dt>{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl></div><div className="rounded-xl bg-slate-900 p-5 text-white"><h2 className="text-2xl font-bold">Sức khỏe kho tri thức</h2><dl className="mt-4 grid gap-3">{health.map(([label, value]) => <div className="flex justify-between border-b border-white/10 pb-3" key={label as string}><dt>{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl></div></section></main>;
}
