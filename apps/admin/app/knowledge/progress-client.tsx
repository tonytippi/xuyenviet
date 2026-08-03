"use client";

import { useEffect, useState } from "react";
import { parseAdminKnowledgeCoverage, parseAdminKnowledgeSamplingPolicySealResult, type AdminKnowledgeCoverage } from "@xuyenviet/contracts";

function origin() { const value = process.env.NEXT_PUBLIC_API_ORIGIN; if (!value) throw new Error("NEXT_PUBLIC_API_ORIGIN is required."); return value; }
function signIn() { window.location.assign(`${origin()}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/knowledge/progress` })}`); }
async function api(path: string, method = "GET") {
  const headers: Record<string, string> = { "x-request-id": crypto.randomUUID() };
  if (method !== "GET") {
    const csrf = await fetch(`${origin()}/auth/csrf`, { credentials: "include", headers });
    if (csrf.status === 401) { signIn(); throw new Error("signin"); }
    const payload: unknown = await csrf.json().catch(() => null);
    if (!payload || typeof payload !== "object" || typeof (payload as { csrfToken?: unknown }).csrfToken !== "string") throw new Error("csrf");
    headers["X-XuyenViet-CSRF"] = (payload as { csrfToken: string }).csrfToken;
  }
  const response = await fetch(`${origin()}${path}`, { method, credentials: "include", headers });
  if (response.status === 401) { signIn(); throw new Error("signin"); }
  if (!response.ok) throw new Error("request");
  return response.json() as Promise<unknown>;
}

export function KnowledgeProgress() {
  const [coverage, setCoverage] = useState<AdminKnowledgeCoverage | null>(null);
  const [message, setMessage] = useState("");
  const load = async () => { const parsed = parseAdminKnowledgeCoverage(await api("/v1/admin/knowledge/coverage")); if (!parsed) throw new Error("unsafe"); setCoverage(parsed); };
  useEffect(() => { void load().catch(() => setMessage("Không thể tải tiến độ an toàn.")); }, []);
  async function seal(policyId: string) {
    try {
      const result = parseAdminKnowledgeSamplingPolicySealResult(await api(`/v1/admin/knowledge/sampling-policies/${encodeURIComponent(policyId)}/seal`, "POST"));
      if (!result) throw new Error("unsafe");
      setMessage(result.status === "sealed" ? `Đã niêm phong ${result.candidateCount} mục, chọn ${result.selectedCount}.` : result.status === "incomplete" ? "Chưa thể niêm phong: bằng chứng tuyển chọn chưa đầy đủ." : "Đợt lấy mẫu không còn khả dụng.");
      await load();
    } catch { setMessage("Không thể niêm phong đợt lấy mẫu."); }
  }
  if (!coverage) return <main className="mx-auto max-w-5xl p-6" role="status">{message || "Đang tải..."}</main>;
  const progress = coverage.progress;
  const percent = Math.min(100, Math.round(progress.activeEvidenceGroundedCards / progress.targetActiveCards * 100));
  return <main className="mx-auto max-w-5xl p-6 text-slate-900"><p className="text-sm font-semibold text-emerald-800">MỨC ĐỘ BAO PHỦ TRI THỨC CÓ BẰNG CHỨNG</p><h1 className="mt-2 text-4xl font-bold">100 thẻ có bằng chứng đang hoạt động cho hành lang Hà Nội - TP.HCM.</h1><p className="mt-3 max-w-3xl text-slate-600">Chỉ hiển thị số liệu tổng hợp an toàn của thẻ hiện hành có evidence hợp lệ.</p><p className="mt-4" role="status">{message}</p><section className="mt-6 rounded-2xl border p-5"><p className="text-4xl font-bold">{progress.activeEvidenceGroundedCards}/{progress.targetActiveCards}</p><div className="mt-3 h-3 overflow-hidden rounded bg-slate-200"><div className="h-full bg-emerald-700" style={{ width: `${percent}%` }} /></div><p className="mt-3">{progress.isComplete ? "Đã đạt mục tiêu hiện hành." : `Còn thiếu ${progress.remainingActiveCards} thẻ.`}</p></section><section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["Quan sát cộng đồng", progress.activeCommunityObservations], ["Mẫu cộng đồng", progress.activeCommunityPatterns], ["Rủi ro cao", progress.caveatOnlyHighRiskCards], ["Cần kiểm tra", progress.pendingReviewCards], ["Cần xác minh", progress.pendingVerificationCards]].map(([label, count]) => <article className="rounded-xl border p-4" key={label as string}><p>{label}</p><p className="mt-2 text-3xl font-bold">{count}</p></article>)}</section><section className="mt-6 rounded-2xl border p-5"><h2 className="text-2xl font-bold">Niêm phong đợt lấy mẫu đã kết thúc</h2>{coverage.closedSamplingPolicies.filter((policy) => !policy.enrollmentSealedAt).map((policy) => <div className="mt-3 flex items-center justify-between rounded border p-3" key={policy.id}><span>{policy.cohortKey}</span><button className="rounded bg-emerald-800 px-3 py-2 text-white" onClick={() => void seal(policy.id)}>Niêm phong</button></div>) || null}</section><section className="mt-6 rounded-2xl border p-5"><h2 className="text-2xl font-bold">Công việc hiện hành</h2>{progress.actionableWork.map((item) => <p className="mt-2" key={`${item.kind}:${item.reason}:${item.priority}`}>{item.kind === "source_intake" ? "Nạp nguồn" : `Ưu tiên ${item.priority}`} · {item.reason}: {item.count}</p>)}</section></main>;
}
