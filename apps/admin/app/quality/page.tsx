"use client";

import { useEffect, useState } from "react";
import { adminQualityPromptTypes, adminQualityRanges, parseAdminQualityDashboard, type AdminQualityDashboard } from "@xuyenviet/contracts";

function apiOrigin() { const origin = process.env.NEXT_PUBLIC_API_ORIGIN; if (!origin) throw new Error("NEXT_PUBLIC_API_ORIGIN is required."); return origin; }
function signIn() { window.location.assign(`${apiOrigin()}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/quality` })}`); }

export default function QualityPage() {
  const [query, setQuery] = useState({ promptType: "all", range: "30d" });
  const [dashboard, setDashboard] = useState<AdminQualityDashboard | null>(null);
  const [status, setStatus] = useState("Đang tải tín hiệu chất lượng.");
  useEffect(() => {
    const search = new URLSearchParams(query);
    void fetch(`${apiOrigin()}/v1/admin/quality?${search}`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store" })
      .then(async (response) => { if (response.status === 401) { signIn(); return null; } const parsed = parseAdminQualityDashboard(await response.json().catch(() => null)); if (!response.ok || !parsed) throw new Error("quality unavailable"); return parsed; })
      .then((result) => { if (result) { setDashboard(result); setStatus(""); } })
      .catch(() => setStatus("Không thể tải tín hiệu chất lượng. Vui lòng thử lại."));
  }, [query]);
  if (!dashboard) return <main className="mx-auto max-w-6xl p-4 text-slate-900 sm:p-8"><h1 className="text-3xl font-bold">Chất lượng MVP</h1><p className="mt-4" role="status">{status}</p></main>;
  const metrics = [["Phản hồi hữu ích", `${dashboard.feedback.useful}/${dashboard.feedback.total}`], ["Đã chấm điểm", `${dashboard.evaluation.scoredResults}/${dashboard.evaluation.totalResults}`], ["Điểm trung bình", dashboard.evaluation.averageScore === null ? "N/A" : `${dashboard.evaluation.averageScore}/10`], ["Sẵn sàng", dashboard.readiness.status === "ready" ? "Sẵn sàng" : "Chưa đủ"]];
  return <main className="mx-auto max-w-6xl p-4 text-slate-900 sm:p-8"><header className="rounded-2xl bg-emerald-950 p-6 text-white"><p className="text-sm font-semibold text-amber-200">CHẤT LƯỢNG MVP</p><h1 className="mt-2 text-4xl font-bold">Tín hiệu an toàn cho câu trả lời.</h1><p className="mt-3 text-emerald-100">Chỉ đọc số liệu tổng hợp, không hiển thị nội dung nguồn, prompt, hay mã truy xuất.</p></header><form className="mt-6 flex flex-wrap gap-3" onSubmit={(event) => event.preventDefault()}><label>Prompt <select value={query.promptType} onChange={(event) => setQuery({ ...query, promptType: event.target.value })}><option value="all">Tất cả</option>{adminQualityPromptTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Khoảng thời gian <select value={query.range} onChange={(event) => setQuery({ ...query, range: event.target.value })}>{adminQualityRanges.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></form><section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <article className="rounded-xl border p-4" key={label}><p className="text-sm font-semibold text-emerald-800">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></article>)}</section><section className="mt-6 grid gap-6 lg:grid-cols-2"><div className="rounded-xl border p-5"><h2 className="text-2xl font-bold">Bảy cổng sẵn sàng</h2><ul className="mt-4 grid gap-3">{dashboard.readiness.checks.map((check) => <li className="rounded-lg bg-slate-50 p-3" key={check.key}><strong>{check.passed ? "Đạt" : "Thiếu tín hiệu"}: </strong>{check.label}<p className="mt-1 text-sm text-slate-600">{check.message}</p></li>)}</ul></div><div className="rounded-xl border p-5"><h2 className="text-2xl font-bold">Chỉ số đối trọng</h2><dl className="mt-4 grid gap-3">{Object.entries(dashboard.evaluation.counterMetrics).map(([label, value]) => <div className="flex justify-between rounded-lg bg-slate-50 p-3" key={label}><dt>{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl><h2 className="mt-6 text-2xl font-bold">Kết quả gần đây</h2><ul className="mt-4 grid gap-2">{dashboard.recentResults.map((result, index) => <li className="rounded-lg bg-slate-50 p-3" key={`${result.createdAt}-${index}`}>{result.promptType}: {result.averageScore === null ? "chưa chấm" : `${result.averageScore}/10`} ({result.status})</li>)}</ul></div></section></main>;
}
