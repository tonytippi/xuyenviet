"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { parseAdminYoutubeCaptureDetail, type AdminYoutubeCaptureDetail } from "@xuyenviet/contracts";

function origin() { const value = process.env.NEXT_PUBLIC_API_ORIGIN; if (!value) throw new Error("NEXT_PUBLIC_API_ORIGIN is required."); return value; }
function signIn() { window.location.assign(`${origin()}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/knowledge/youtube-captures` })}`); }
function formatTimestamp(value: string | null) { if (!value || Number.isNaN(Date.parse(value))) return "Chưa có"; return `${new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value))} (GMT+7)`; }
function formatVideoTimestamp(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
const jobStatusLabels = { queued: "Đang chờ", running: "Đang xử lý", completed: "Đã hoàn thành", failed: "Không thành công" };
const categoryLabels = { road_condition: "Tình trạng đường", route: "Tuyến đường", toll: "Phí đường bộ", fuel: "Nhiên liệu", charging: "Sạc xe", rest_stop: "Điểm nghỉ", parking: "Đỗ xe", accommodation: "Lưu trú", food: "Ăn uống", attraction: "Điểm tham quan", safety: "An toàn", weather: "Thời tiết", cost: "Chi phí" };
const evidenceTypeLabels = { spoken: "Lời nói", on_screen: "Trên màn hình", both: "Lời nói và hình ảnh" };
const confidenceLabels = { high: "Cao", medium: "Trung bình", low: "Thấp" };
export function YoutubeCaptureDetail({ sourceId }: { sourceId: string }) {
  const [detail, setDetail] = useState<AdminYoutubeCaptureDetail | null>(null); const [message, setMessage] = useState("");
  useEffect(() => { const load = async () => { const response = await fetch(`${origin()}/v1/admin/knowledge/youtube-captures/${encodeURIComponent(sourceId)}`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store" }); if (response.status === 401) { signIn(); return; } const parsed = parseAdminYoutubeCaptureDetail(await response.json().catch(() => null)); if (!response.ok || !parsed) throw new Error("unsafe response"); setDetail(parsed); }; void load().catch(() => setMessage("Không thể tải chi tiết bằng chứng YouTube.")); }, [sourceId]);
  return <main className="mx-auto max-w-4xl p-4 text-slate-900 sm:p-8">
    <Link className="text-emerald-800 underline" href="/knowledge/youtube-captures">Quay lại hàng đợi</Link>
    <h1 className="mt-4 text-3xl font-bold">{detail?.sourceLabel ?? "Chi tiết thu thập YouTube"}</h1>
    <p className="mt-3 text-slate-600">Nguồn này chỉ hiển thị bằng chứng có cấu trúc. Nội dung nguồn thô và dữ liệu thực thi AI không được hiển thị trong vận hành.</p>
    <p className="mt-3" role="status">{message}</p>
    {detail && <>
      <section className="mt-6 rounded-xl border p-4"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="font-semibold">URL</dt><dd className="break-all">{detail.displayUrl ?? "Không có"}</dd></div><div><dt className="font-semibold">Tác vụ kỹ thuật</dt><dd>{detail.ingestionJob ? jobStatusLabels[detail.ingestionJob.status] : "Chưa có tác vụ"}</dd></div>{detail.ingestionJob?.status === "failed" && detail.ingestionJob.lastErrorCode && <div><dt className="font-semibold">Mã lỗi</dt><dd>{detail.ingestionJob.lastErrorCode}</dd></div>}<div><dt className="font-semibold">Kết quả ứng viên</dt><dd>{detail.ingestionJob ? `${detail.ingestionJob.completedCandidateCount}/${detail.ingestionJob.candidateCount} đã xử lý` : "Không có"}</dd></div><div><dt className="font-semibold">Thu thập</dt><dd>{formatTimestamp(detail.capturedAt)}</dd></div><div><dt className="font-semibold">Bằng chứng đã trích xuất</dt><dd>{detail.evidenceCount} mục</dd></div></dl></section>
      <section className="mt-6 grid gap-3"><h2 className="text-xl font-bold">Bằng chứng được trích xuất</h2>{detail.evidence.map((item, index) => <article className="rounded-xl border p-4" key={`${item.timestampStartSeconds}-${index}`}><p><strong>{categoryLabels[item.category]}</strong> · {evidenceTypeLabels[item.evidenceType]} · Độ tin cậy {confidenceLabels[item.confidence]}</p><p className="mt-2 whitespace-pre-wrap">{item.claim}</p><p className="mt-3 text-sm text-slate-600"><strong>Đoạn video:</strong> {formatVideoTimestamp(item.timestampStartSeconds)} - {formatVideoTimestamp(item.timestampEndSeconds)}</p><p className="mt-2 text-sm text-slate-600"><strong>Trích đoạn:</strong> {item.excerpt}</p><p className="mt-2 text-sm"><strong>Độ mới:</strong> {item.freshnessSensitive ? "Cần kiểm tra lại theo thời điểm hiện tại" : "Không nhạy cảm theo thời điểm"}</p>{item.uncertaintyOrCondition && <p className="mt-2 text-sm"><strong>Điều kiện/Lưu ý:</strong> {item.uncertaintyOrCondition}</p>}</article>)}</section>
    </>}
  </main>;
}
