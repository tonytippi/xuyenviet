"use client";

import { useEffect, useRef, useState } from "react";
import { parseAdminYoutubeDiscoveryAcceptReviewResult, parseAdminYoutubeDiscoveryReviewDetail, parseAdminYoutubeDiscoveryReviewQueue, type AdminYoutubeDiscoveryReviewDetail, type AdminYoutubeDiscoveryReviewQueueItem } from "@xuyenviet/contracts";
import { youtubeDiscoveryReviewCopy } from "./review-copy";

const recommendation = youtubeDiscoveryReviewCopy.recommendation.consider;
const factors = { ...youtubeDiscoveryReviewCopy.factor, ...youtubeDiscoveryReviewCopy.penalty };
const signals = youtubeDiscoveryReviewCopy.signal;
const capture = youtubeDiscoveryReviewCopy.priorCaptureOutcome;
function origin() { const value = process.env.NEXT_PUBLIC_API_ORIGIN; if (!value) throw new Error("NEXT_PUBLIC_API_ORIGIN is required."); return value; }
function signIn() { window.location.assign(`${origin()}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/knowledge/youtube-discovery-review` })}`); }

export function YoutubeDiscoveryReview() {
  const [items, setItems] = useState<AdminYoutubeDiscoveryReviewQueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminYoutubeDiscoveryReviewDetail | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [status, setStatus] = useState("Đang tải hàng đợi xem xét.");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const selectedId = useRef<string | null>(null);
  const detailRequestId = useRef(0);
  const acceptRequestId = useRef(0);
  const queueGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const loadingMore = useRef(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const selectedRow = useRef<HTMLButtonElement>(null);

  async function request(path: string) {
    const response = await fetch(`${origin()}${path}`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store" });
    if (response.status === 401) { signIn(); throw new Error("signin"); }
    return { response, body: await response.json().catch(() => null) };
  }
  async function load(nextCursor: string | null, initial = false, preserveStatus = false) {
    const generation = initial ? ++queueGeneration.current : queueGeneration.current;
    const selectionAtStart = selectionGeneration.current;
    if (!initial) {
      if (loadingMore.current || nextCursor !== cursor) return;
      loadingMore.current = true;
      setIsLoadingMore(true);
    }
    try {
      const { response, body } = await request(`/v1/admin/knowledge/youtube-discovery/review${nextCursor ? `?${new URLSearchParams({ cursor: nextCursor })}` : ""}`);
      const queue = parseAdminYoutubeDiscoveryReviewQueue(body);
      if (!response.ok || !queue) throw new Error("unsafe response");
      if (generation !== queueGeneration.current) return;
      setItems((current) => initial ? queue.items : [...current, ...queue.items.filter((item) => !new Set(current.map(({ recommendationId }) => recommendationId)).has(item.recommendationId))]);
      setCursor(queue.nextCursor);
      if (initial && queue.items[0] && selectedId.current === null && selectionAtStart === selectionGeneration.current) choose(queue.items[0], preserveStatus);
      if (!preserveStatus) setStatus(queue.items.length ? `Đã tải ${queue.items.length} mục xem xét.` : "Không còn ứng viên cần xem xét.");
    } finally {
      if (!initial) { loadingMore.current = false; setIsLoadingMore(false); }
    }
  }
  async function loadDetail(recommendationId: string, preserveStatus = false) {
    const requestId = ++detailRequestId.current;
    try {
      const { response, body } = await request(`/v1/admin/knowledge/youtube-discovery/review/${encodeURIComponent(recommendationId)}`);
      const parsed = parseAdminYoutubeDiscoveryReviewDetail(body);
      if (!response.ok || !parsed) throw new Error("unsafe response");
      if (requestId !== detailRequestId.current || recommendationId !== selectedId.current) return;
      setDetail(parsed);
      setIsReconciling(parsed.actionAvailability === "reconciling");
      if (!preserveStatus) setStatus(`Đã chọn ${parsed.title ?? "ứng viên không có tiêu đề"}.`);
    } catch {
      if (requestId === detailRequestId.current && recommendationId === selectedId.current) setStatus("Không thể tải chi tiết ứng viên.");
    }
  }
  useEffect(() => { void load(null, true).catch(() => setStatus("Không thể tải hàng đợi xem xét.")); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (showDetail) detailHeading.current?.focus(); }, [showDetail]);
  function choose(item: AdminYoutubeDiscoveryReviewQueueItem, preserveStatus = false) { acceptRequestId.current += 1; selectionGeneration.current += 1; setIsAccepting(false); selectedId.current = item.recommendationId; setSelected(item.recommendationId); setDetail(null); setIsReconciling(item.actionAvailability === "reconciling"); void loadDetail(item.recommendationId, preserveStatus); }
  function openDetail() { if (detail) setShowDetail(true); else setStatus("Đang tải chi tiết ứng viên."); }
  function returnToQueue() { setShowDetail(false); selectedRow.current?.focus(); }
  async function accept() {
    if (!detail || isAccepting || isReconciling || detail.actionAvailability === "reconciling") return;
    const recommendationId = detail.recommendationId;
    const requestId = ++acceptRequestId.current;
    setIsAccepting(true); setStatus(youtubeDiscoveryReviewCopy.accept.pending);
    try {
      const csrf = await request("/auth/csrf");
      const nonce = csrf.body && typeof csrf.body === "object" && !Array.isArray(csrf.body) && typeof (csrf.body as Record<string, unknown>).csrfToken === "string" ? (csrf.body as Record<string, string>).csrfToken : null;
      if (!csrf.response.ok || !nonce) throw new Error("unsafe csrf");
      const response = await fetch(`${origin()}/v1/admin/knowledge/youtube-discovery/review/${encodeURIComponent(recommendationId)}/accept`, { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-request-id": crypto.randomUUID(), "x-xuyenviet-csrf": nonce, Origin: window.location.origin }, body: "{}", cache: "no-store" });
      if (response.status === 401) { signIn(); throw new Error("signin"); }
      const result = parseAdminYoutubeDiscoveryAcceptReviewResult(await response.json().catch(() => null));
      if (!response.ok || !result) throw new Error("unsafe response");
      if (requestId !== acceptRequestId.current || recommendationId !== selectedId.current) return;
      setStatus(youtubeDiscoveryReviewCopy.accept[result.outcome]);
      if (result.outcome === "reconciling") setIsReconciling(true);
      if (result.outcome === "submitted" || result.outcome === "duplicate") { setIsAccepting(false); selectedId.current = null; selectionGeneration.current += 1; setSelected(null); setDetail(null); await load(null, true, true); }
    } catch { if (requestId === acceptRequestId.current && recommendationId === selectedId.current) setStatus(youtubeDiscoveryReviewCopy.accept.failed); }
    finally { if (requestId === acceptRequestId.current && recommendationId === selectedId.current) setIsAccepting(false); }
  }

  const queue = <section aria-label="Hàng đợi ứng viên" className="min-w-0"><h2 className="text-xl font-bold">Hàng đợi</h2><div className="mt-3 grid gap-2">{items.map((item) => <button aria-pressed={selected === item.recommendationId} className="min-h-11 rounded-lg border p-3 text-left outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800 aria-pressed:border-emerald-800 aria-pressed:bg-emerald-50" key={item.recommendationId} onClick={() => choose(item)} ref={selected === item.recommendationId ? selectedRow : undefined} type="button"><strong>{item.title ?? "Video không có tiêu đề"}</strong><span className="mt-1 block text-sm text-slate-600">{item.channelName ?? "Kênh không có tên"} · {recommendation}</span><span className="mt-1 block text-sm">{item.publishedAt ? new Intl.DateTimeFormat("vi-VN").format(new Date(item.publishedAt)) : "Chưa rõ ngày đăng"}{item.durationSeconds !== null ? ` · ${Math.floor(item.durationSeconds / 60)} phút` : ""}</span></button>)}</div>{selected ? <button className="mt-4 min-h-11 rounded border px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800 lg:hidden" disabled={!detail} onClick={openDetail} type="button">Xem chi tiết đã chọn</button> : null}{cursor ? <button className="mt-4 min-h-11 rounded border px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoadingMore} onClick={() => void load(cursor).catch(() => setStatus("Không thể tải thêm ứng viên."))} type="button">{isLoadingMore ? "Đang tải..." : "Tải thêm"}</button> : items.length > 0 ? <p className="mt-4 text-sm text-slate-600">Đã tải hết hàng đợi.</p> : null}</section>;
  const inspector = <section aria-labelledby="candidate-detail" className="min-w-0 rounded-xl border p-4"><button className="mb-4 min-h-11 rounded border px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800 lg:hidden" onClick={returnToQueue} type="button">Quay lại hàng đợi</button><h2 id="candidate-detail" ref={detailHeading} tabIndex={-1} className="text-xl font-bold outline-none">Chi tiết ứng viên</h2>{detail ? <div className="mt-4 grid gap-4"><dl className="grid gap-3"><div><dt className="font-semibold">URL chuẩn</dt><dd className="break-all">{detail.canonicalUrl}</dd></div><div><dt className="font-semibold">Truy vấn khám phá</dt><dd>{detail.queryText}</dd><dd className="text-sm text-slate-600">{youtubeDiscoveryReviewCopy.queryReason[detail.queryReason]}</dd></div><div><dt className="font-semibold">Lý do xếp hạng</dt><dd>{youtubeDiscoveryReviewCopy.reason[detail.reason]}</dd></div><div><dt className="font-semibold">Kết quả thu thập trước</dt><dd>{capture[detail.priorCaptureOutcome]}</dd></div></dl><div><p className="font-semibold">Yếu tố và lưu ý</p><div className="mt-2 flex flex-wrap gap-2">{[...detail.factors, ...detail.penalties].map((code) => <span className="rounded-full border px-3 py-1 text-sm" key={code}>{factors[code]}</span>)}</div></div><div><p className="font-semibold">Tín hiệu dẫn xuất</p><div className="mt-2 flex flex-wrap gap-2">{detail.signals.map((signal) => <span className="rounded-full border px-3 py-1 text-sm" key={signal}>{signals[signal]}</span>)}</div></div><details><summary className="cursor-pointer font-semibold">Xem điểm xếp hạng</summary><p className="mt-2 text-sm">Điểm {detail.score.toFixed(2)} chỉ là ngữ cảnh xếp hạng, không xác nhận nội dung hay trạng thái thu thập.</p></details><p aria-live="polite" className="text-sm text-slate-600">{isReconciling || detail.actionAvailability === "reconciling" ? youtubeDiscoveryReviewCopy.accept.reconciling : "Chọn Chấp nhận để thêm URL vào nguồn chờ xử lý."}</p><div className="flex flex-wrap gap-2"><button aria-label="Chấp nhận" className="min-h-11 rounded bg-emerald-800 px-4 font-semibold text-white disabled:opacity-60" disabled={isAccepting || isReconciling || detail.actionAvailability === "reconciling"} onClick={() => void accept()} type="button">Chấp nhận</button><button aria-label="Để sau, chưa khả dụng" disabled={isAccepting || isReconciling || detail.actionAvailability === "reconciling"} type="button">Để sau</button><button aria-label="Bỏ qua, chưa khả dụng" disabled={isAccepting || isReconciling || detail.actionAvailability === "reconciling"} type="button">Bỏ qua</button></div></div> : <p className="mt-4 text-slate-600">Chọn một ứng viên để xem chi tiết an toàn.</p>}</section>;
  return <main className="mx-auto max-w-7xl p-4 text-slate-900 sm:p-8"><header><p className="text-sm font-semibold text-emerald-800">YOUTUBE DISCOVERY</p><h1 className="mt-2 text-3xl font-bold">Xem xét ứng viên</h1><p className="mt-3 text-slate-600">Xếp hạng là ngữ cảnh vận hành, không xác nhận nội dung, thu thập hay xuất bản.</p></header><p aria-live="polite" className="mt-4" role="status">{status}</p><div className="mt-6 lg:grid lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)] lg:gap-6"><div className={showDetail ? "hidden lg:block" : "block"}>{queue}</div><div className={showDetail ? "block" : "hidden lg:block"}>{inspector}</div></div></main>;
}
