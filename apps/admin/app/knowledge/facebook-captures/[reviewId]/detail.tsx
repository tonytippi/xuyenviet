"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseAdminFacebookCaptureCommandResult, parseAdminFacebookCaptureDetail, type AdminFacebookCaptureDetail } from "@xuyenviet/contracts";

function origin() { const value = process.env.NEXT_PUBLIC_API_ORIGIN; if (!value) throw new Error("NEXT_PUBLIC_API_ORIGIN is required."); return value; }
function signIn() { window.location.assign(`${origin()}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/knowledge/facebook-captures` })}`); }
function formatTimestamp(value: string | null) { if (!value || Number.isNaN(Date.parse(value))) return "Chưa có"; return `${new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value))} (GMT+7)`; }
const lifecycleLabels = { draft: "Bản nháp", pending_operator: "Chờ vận hành", active: "Đang hoạt động", suppressed: "Tạm ẩn", archived: "Đã lưu trữ", rejected: "Đã từ chối" };
const knowledgeStateLabels = { community_observation: "Quan sát cộng đồng", community_pattern: "Mẫu từ cộng đồng", conditional: "Có điều kiện", conflicted: "Có mâu thuẫn" };
const verificationLabels = { none: "Không cần xác minh", operator_required: "Cần operator xác minh", failed: "Xác minh không đạt" };

export function FacebookCaptureDetail({ reviewId }: { reviewId: string }) {
  const [detail, setDetail] = useState<AdminFacebookCaptureDetail | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(path: string, method = "GET", body?: unknown) {
    const headers: Record<string, string> = { "x-request-id": crypto.randomUUID() };
    if (method !== "GET") {
      const csrf = await fetch(`${origin()}/auth/csrf`, { credentials: "include", headers, cache: "no-store" });
      if (csrf.status === 401) { signIn(); throw new Error("signin"); }
      const token = (await csrf.json().catch(() => null) as { csrfToken?: unknown } | null)?.csrfToken;
      if (!csrf.ok || typeof token !== "string") throw new Error("csrf unavailable");
      headers["X-XuyenViet-CSRF"] = token;
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${origin()}${path}`, { method, credentials: "include", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.status === 401) { signIn(); throw new Error("signin"); }
    const value = await response.json().catch(() => null);
    if (!response.ok) throw new Error("request failed");
    return value;
  }

  async function load() { const parsed = parseAdminFacebookCaptureDetail(await request(`/v1/admin/knowledge/facebook-captures/${encodeURIComponent(reviewId)}`)); if (!parsed) throw new Error("unsafe response"); setDetail(parsed); }
  useEffect(() => { void load().catch(() => setMessage("Không thể tải chi tiết an toàn.")); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId]);
  async function command(kind: "recapture" | "rerun") { setBusy(true); setMessage(""); try { const result = parseAdminFacebookCaptureCommandResult(await request(`/v1/admin/knowledge/facebook-captures/${encodeURIComponent(reviewId)}/${kind === "rerun" ? "ingestion-rerun" : "recapture"}`, "POST", kind === "recapture" ? { reason: "Operator requested recapture" } : undefined)); if (!result) throw new Error("unsafe response"); setMessage(result.status === "updated" ? "Đã cập nhật tác vụ." : `Không thể thực hiện: ${result.status}.`); await load(); } catch { setMessage("Không thể cập nhật tác vụ."); } finally { setBusy(false); } }

  return <main className="mx-auto max-w-4xl p-4 text-slate-900 sm:p-8">
    <Link className="text-emerald-800 underline" href="/knowledge/facebook-captures">Quay lại hàng đợi</Link>
    <h1 className="mt-4 text-3xl font-bold">{detail?.sourceLabel ?? "Chi tiết thu thập Facebook"}</h1>
    <p className="mt-3 text-slate-600">Nội dung nguồn này chỉ hiển thị trong chi tiết vận hành. Tác vụ kỹ thuật, quyết định AI và vòng đời thẻ được hiển thị riêng biệt.</p>
    <p className="mt-3" role="status">{message}</p>
    {detail && <>
      <section className="mt-6 rounded-xl border p-4"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="font-semibold">URL</dt><dd className="break-all">{detail.displayUrl ?? "Không có"}</dd></div><div><dt className="font-semibold">Tác vụ kỹ thuật</dt><dd>{detail.ingestionJob?.status ?? "Chưa có tác vụ"}</dd></div>{detail.ingestionJob?.status === "failed" && detail.ingestionJob.lastErrorCode && <div><dt className="font-semibold">Mã lỗi</dt><dd>{detail.ingestionJob.lastErrorCode}</dd></div>}<div><dt className="font-semibold">Kết quả ứng viên</dt><dd>{detail.ingestionJob ? `${detail.ingestionJob.completedCandidateCount}/${detail.ingestionJob.candidateCount} đã xử lý` : "Không có"}</dd></div><div><dt className="font-semibold">Thu thập</dt><dd>{formatTimestamp(detail.capturedAt)}</dd></div></dl></section>
      <section className="mt-6"><h2 className="text-xl font-bold">Nội dung capture hiện tại</h2><article className="mt-3 rounded-xl border p-4"><p className="text-sm text-slate-600">{detail.capture ? formatTimestamp(detail.capture.capturedAt) : "Source này chưa có capture hiện tại."}</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-sm leading-6">{detail.capture?.rawText ?? "Nội dung của phiên bản hiện tại đã bị xóa theo chính sách lưu giữ hoặc chưa có dữ liệu văn bản."}</pre></article></section>
      <section className="mt-6 grid gap-3"><h2 className="text-xl font-bold">Ứng viên được trích xuất</h2>{detail.candidates.length ? detail.candidates.map((candidate, index) => <article className="rounded-xl border p-4" key={index}><p><strong>{candidate.title}</strong> · {candidate.type}</p><p className="mt-2 whitespace-pre-wrap">{candidate.summary}</p><p className="mt-3"><strong>Xử lý:</strong> {candidate.processingStatus}</p><p><strong>Quyết định AI:</strong> {candidate.aiDisposition ?? "Chưa có"} · {candidate.outcomeReasonCode ?? "Chưa có lý do"}</p>{candidate.card && <p><strong>Thẻ hiện tại:</strong> {lifecycleLabels[candidate.card.lifecycleState]} · {knowledgeStateLabels[candidate.card.knowledgeState]} · {verificationLabels[candidate.card.verificationRequirement]}</p>}</article>) : <p className="rounded-xl border p-4 text-slate-600">Không có ứng viên được trích xuất từ capture hiện tại.</p>}</section>
      <section className="mt-6 flex gap-3">{detail.canRerunIngestion && <button className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void command("rerun")}>Chạy lại ingestion</button>}{detail.canRecapture && <button className="rounded border border-emerald-700 px-4 py-2 text-emerald-800 disabled:opacity-50" disabled={busy} onClick={() => void command("recapture")}>Yêu cầu thu thập lại</button>}</section>
    </>}
  </main>;
}
