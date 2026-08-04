"use client";

import { useEffect, useState } from "react";
import { parseAdminKnowledgeCoverage, type AdminKnowledgeCoverage } from "@xuyenviet/contracts";

function origin() { const value = process.env.NEXT_PUBLIC_API_ORIGIN; if (!value) throw new Error("NEXT_PUBLIC_API_ORIGIN is required."); return value; }
function signIn() { window.location.assign(`${origin()}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/knowledge/progress` })}`); }
async function api(path: string) { const response = await fetch(`${origin()}${path}`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() } }); if (response.status === 401) { signIn(); throw new Error("signin"); } if (!response.ok) throw new Error("request"); return response.json() as Promise<unknown>; }

export function KnowledgeProgress() {
  const [coverage, setCoverage] = useState<AdminKnowledgeCoverage | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { void api("/v1/admin/knowledge/coverage").then(parseAdminKnowledgeCoverage).then((value) => { if (!value) throw new Error("unsafe"); setCoverage(value); }).catch(() => setMessage("Không thể tải tiến độ an toàn.")); }, []);
  if (!coverage) return <main className="mx-auto max-w-5xl p-6" role="status">{message || "Đang tải..."}</main>;
  const progress = coverage.progress;
  const percent = progress.targetActiveCards ? Math.min(100, Math.round(progress.activeEvidenceGroundedCards / progress.targetActiveCards * 100)) : 0;
  return <main className="mx-auto max-w-5xl p-6 text-slate-900"><p className="text-sm font-semibold text-emerald-800">MỨC ĐỘ BAO PHỦ TRI THỨC CÓ BẰNG CHỨNG</p><h1 className="mt-2 text-4xl font-bold">Tri thức có bằng chứng cho hành lang Hà Nội - TP.HCM</h1><p className="mt-3 max-w-3xl text-slate-600">Chỉ hiển thị số liệu tổng hợp an toàn. Lấy mẫu chất lượng do Worker quản lý, không phải thao tác phê duyệt thẻ.</p><section className="mt-6 rounded-2xl border p-5"><p className="text-4xl font-bold">{progress.activeEvidenceGroundedCards}/{progress.targetActiveCards}</p><div className="mt-3 h-3 overflow-hidden rounded bg-slate-200"><div className="h-full bg-emerald-700" style={{ width: `${percent}%` }} /></div><p className="mt-3">{progress.isComplete ? "Đã đạt mục tiêu hiện hành." : `Còn thiếu ${progress.remainingActiveCards} thẻ.`}</p></section><section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["Quan sát cộng đồng", progress.activeCommunityObservations], ["Mẫu cộng đồng", progress.activeCommunityPatterns], ["Rủi ro cao", progress.caveatOnlyHighRiskCards], ["Cần kiểm tra", progress.pendingReviewCards], ["Cần xác minh", progress.pendingVerificationCards]].map(([label, count]) => <article className="rounded-xl border p-4" key={label as string}><p>{label}</p><p className="mt-2 text-3xl font-bold">{count}</p></article>)}</section><section className="mt-6 rounded-2xl border p-5"><h2 className="text-2xl font-bold">Lấy mẫu chất lượng</h2><p className="mt-2">Nghĩa vụ: {coverage.sampling.obligations.pending} chờ xử lý, {coverage.sampling.obligations.passed} đạt, {coverage.sampling.obligations.failed} không đạt.</p><p className="mt-2">Công việc lấy mẫu hiện hành: {coverage.sampling.actionableWork}.</p>{coverage.sampling.closedPolicies.map((policy) => <p className="mt-2" key={`${policy.cohortKey}-${policy.enrollmentSealedAt}`}>{policy.cohortKey}: {policy.selectedCount}/{policy.candidateCount} mục đã chọn.</p>)}</section></main>;
}
