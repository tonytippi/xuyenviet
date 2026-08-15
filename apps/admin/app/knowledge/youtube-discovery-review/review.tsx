"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseAdminYoutubeDiscoveryAcceptReviewResult, parseAdminYoutubeDiscoveryBrowsePage, parseAdminYoutubeDiscoveryDeferReviewResult, parseAdminYoutubeDiscoveryForeignFallbackList, parseAdminYoutubeDiscoveryReviewDetail, parseAdminYoutubeDiscoveryReviewQueue, parseAdminYoutubeDiscoverySkipReviewResult, type AdminYoutubeDiscoveryBrowseFilter, type AdminYoutubeDiscoveryBrowseItem, type AdminYoutubeDiscoveryForeignFallbackItem, type AdminYoutubeDiscoveryReviewDetail, type AdminYoutubeDiscoveryReviewQueueItem } from "@xuyenviet/contracts";
import { youtubeDiscoveryReviewCopy } from "./review-copy";

const factors = { ...youtubeDiscoveryReviewCopy.factor, ...youtubeDiscoveryReviewCopy.penalty };
const signals = youtubeDiscoveryReviewCopy.signal;
const capture = youtubeDiscoveryReviewCopy.priorCaptureOutcome;
const languageFit = youtubeDiscoveryReviewCopy.languageFit;
const fallbackLanguageFit = youtubeDiscoveryReviewCopy.fallbackLanguageFit;
function origin() { const value = process.env.NEXT_PUBLIC_API_ORIGIN; if (!value) throw new Error("NEXT_PUBLIC_API_ORIGIN is required."); return value; }
function signIn() { window.location.assign(`${origin()}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/knowledge/youtube-discovery` })}`); }

export function YoutubeDiscoveryReview() {
  const searchParams = useSearchParams();
  const requestedRecommendationId = validRecommendationId(searchParams.get("recommendationId")) ? searchParams.get("recommendationId") : null;
  const [items, setItems] = useState<AdminYoutubeDiscoveryReviewQueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminYoutubeDiscoveryReviewDetail | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [status, setStatus] = useState("Đang tải hàng đợi xem xét.");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeciding, setIsDeciding] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [needsDecisionRefresh, setNeedsDecisionRefresh] = useState(false);
  const [queueFocusToken, setQueueFocusToken] = useState(0);
  const [browseFilter, setBrowseFilterState] = useState<AdminYoutubeDiscoveryBrowseFilter>("consider");
  const [browseItems, setBrowseItems] = useState<AdminYoutubeDiscoveryBrowseItem[]>([]);
  const [browseCursor, setBrowseCursor] = useState<string | null>(null);
  const [browseStatus, setBrowseStatus] = useState("Đang tải lịch sử khuyến nghị.");
  const [fallbackItems, setFallbackItems] = useState<AdminYoutubeDiscoveryForeignFallbackItem[]>([]);
  const [fallbackStatus, setFallbackStatus] = useState("Đang tải nguồn ngoại ngữ bổ sung.");
  const [isLoadingBrowseMore, setIsLoadingBrowseMore] = useState(false);
  const selectedId = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const detailRequestId = useRef(0);
  const decisionRequestId = useRef(0);
  const queueGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const loadingMore = useRef(false);
  const browseGeneration = useRef(0);
  const loadingBrowseMore = useRef(false);
  const focusAfterDecision = useRef(false);
  const focusQueueAfterDecision = useRef(false);
  const focusSelectedRowAfterReturn = useRef(false);
  const focusSelectedRowAfterDecision = useRef(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const queueHeading = useRef<HTMLHeadingElement>(null);
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
      if (initial && queue.items[0] && !requestedRecommendationId && selectedId.current === null && selectionAtStart === selectionGeneration.current) choose(queue.items[0], preserveStatus);
      if (!preserveStatus) setStatus(queue.items.length ? `Đã tải ${queue.items.length} mục xem xét.` : "Không còn ứng viên cần xem xét.");
      return queue;
    } finally { if (!initial) { loadingMore.current = false; setIsLoadingMore(false); } }
  }
  async function loadBrowse(filter: AdminYoutubeDiscoveryBrowseFilter, nextCursor: string | null, initial = false) {
    const generation = initial ? ++browseGeneration.current : browseGeneration.current;
    if (!initial) {
      if (loadingBrowseMore.current || nextCursor !== browseCursor) return;
      loadingBrowseMore.current = true;
      setIsLoadingBrowseMore(true);
    }
    try {
      const params = new URLSearchParams({ filter }); if (nextCursor) params.set("cursor", nextCursor);
      const { response, body } = await request(`/v1/admin/knowledge/youtube-discovery/browse?${params}`);
      const page = parseAdminYoutubeDiscoveryBrowsePage(body);
      if (!response.ok || !page) throw new Error("unsafe response");
      if (generation !== browseGeneration.current) return;
      setBrowseItems((current) => initial ? page.items : [...current, ...page.items.filter((item) => !new Set(current.map(({ recommendationId }) => recommendationId)).has(item.recommendationId))]);
      setBrowseCursor(page.nextCursor); setBrowseStatus(page.items.length ? `Đã tải ${page.items.length} khuyến nghị.` : "Không có khuyến nghị phù hợp.");
    } catch { if (generation === browseGeneration.current) setBrowseStatus("Không thể tải lịch sử khuyến nghị."); }
    finally { if (!initial && generation === browseGeneration.current) { loadingBrowseMore.current = false; setIsLoadingBrowseMore(false); } }
  }
  async function loadFallback() {
    try {
      const { response, body } = await request("/v1/admin/knowledge/youtube-discovery/fallback");
      const fallback = parseAdminYoutubeDiscoveryForeignFallbackList(body);
      if (!response.ok || !fallback) throw new Error("unsafe response");
      setFallbackItems(fallback.items); setFallbackStatus(fallback.items.length ? `Hiển thị ${fallback.items.length} nguồn ngoại ngữ bổ sung.` : "Không có nguồn ngoại ngữ bổ sung.");
    } catch { setFallbackStatus("Không thể tải nguồn ngoại ngữ bổ sung."); }
  }
  async function loadDetail(recommendationId: string, preserveStatus = false) {
    const requestId = ++detailRequestId.current;
    try {
      const { response, body } = await request(`/v1/admin/knowledge/youtube-discovery/review/${encodeURIComponent(recommendationId)}`);
      const parsed = parseAdminYoutubeDiscoveryReviewDetail(body);
      if (!response.ok || !parsed) throw new Error("unsafe response");
      if (requestId !== detailRequestId.current || recommendationId !== selectedId.current) return;
      setDetail(parsed); setIsReconciling(parsed.actionAvailability === "reconciling");
      if (focusAfterDecision.current) { focusAfterDecision.current = false; setNeedsDecisionRefresh(false); detailHeading.current?.focus(); }
      if (!preserveStatus) setStatus(`Đã chọn ${parsed.title ?? "ứng viên không có tiêu đề"}.`);
    } catch {
      if (requestId !== detailRequestId.current || recommendationId !== selectedId.current) return;
      if (focusAfterDecision.current) { focusAfterDecision.current = false; setIsReconciling(true); setNeedsDecisionRefresh(true); detailHeading.current?.focus(); }
      setStatus("Không thể tải chi tiết ứng viên.");
    }
  }
  async function admitDeepLink(recommendationId: string) {
    const requestId = ++detailRequestId.current;
    try {
      const { response, body } = await request(`/v1/admin/knowledge/youtube-discovery/review/${encodeURIComponent(recommendationId)}`);
      const parsed = parseAdminYoutubeDiscoveryReviewDetail(body);
      if (!response.ok || !parsed || requestId !== detailRequestId.current) throw new Error("unavailable");
      decisionRequestId.current += 1; selectionGeneration.current += 1; selectedId.current = recommendationId;
      setSelected(recommendationId); setDetail(parsed); setIsReconciling(parsed.actionAvailability === "reconciling"); setStatus(`Đã chọn ${parsed.title ?? "ứng viên không có tiêu đề"}.`);
    } catch { if (requestId === detailRequestId.current) setStatus("Ứng viên trong liên kết không còn khả dụng."); }
  }
  useEffect(() => { void load(null, true).then(() => heading.current?.focus()).catch(() => setStatus("Không thể tải hàng đợi xem xét.")); void loadFallback(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (browseFilter !== "consider") void loadBrowse(browseFilter, null, true); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseFilter]);
  function setBrowseFilter(filter: AdminYoutubeDiscoveryBrowseFilter) { if (filter === browseFilter) return; ++browseGeneration.current; loadingBrowseMore.current = false; setBrowseItems([]); setBrowseCursor(null); setIsLoadingBrowseMore(false); setBrowseStatus("Đang tải lịch sử khuyến nghị."); setBrowseFilterState(filter); }
  useEffect(() => { if (requestedRecommendationId) void admitDeepLink(requestedRecommendationId); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedRecommendationId]);
  useEffect(() => { if (showDetail) detailHeading.current?.focus(); }, [showDetail]);
  useEffect(() => {
    if (showDetail) return;
    if (focusQueueAfterDecision.current) { focusQueueAfterDecision.current = false; queueHeading.current?.focus(); }
    if (focusSelectedRowAfterReturn.current) { focusSelectedRowAfterReturn.current = false; selectedRow.current?.focus(); }
    if (focusSelectedRowAfterDecision.current) { focusSelectedRowAfterDecision.current = false; selectedRow.current?.focus(); }
  }, [items, selected, showDetail, queueFocusToken]);
  function choose(item: AdminYoutubeDiscoveryReviewQueueItem, preserveStatus = false, retainReconciliation = false) {
    decisionRequestId.current += 1; selectionGeneration.current += 1; setIsAccepting(false); setIsDeciding(false); selectedId.current = item.recommendationId; setSelected(item.recommendationId); setDetail(null); setIsReconciling(retainReconciliation || item.actionAvailability === "reconciling"); void loadDetail(item.recommendationId, preserveStatus);
  }
  function openDetail() { if (detail) setShowDetail(true); else setStatus("Đang tải chi tiết ứng viên."); }
  function returnToQueue() { focusSelectedRowAfterReturn.current = true; setShowDetail(false); }
  async function csrf() {
    const value = await request("/auth/csrf");
    const nonce = value.body && typeof value.body === "object" && !Array.isArray(value.body) && typeof (value.body as Record<string, unknown>).csrfToken === "string" ? (value.body as Record<string, string>).csrfToken : null;
    if (!value.response.ok || !nonce) throw new Error("unsafe csrf");
    return nonce;
  }
  async function postDecision(recommendationId: string, action: "accept" | "defer" | "skip", nonce: string) {
    const response = await fetch(`${origin()}/v1/admin/knowledge/youtube-discovery/review/${encodeURIComponent(recommendationId)}/${action}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-request-id": crypto.randomUUID(), "x-xuyenviet-csrf": nonce, Origin: window.location.origin }, body: "{}", cache: "no-store" });
    if (response.status === 401) { signIn(); throw new Error("signin"); }
    const body = await response.json().catch(() => null);
    const result = action === "accept" ? parseAdminYoutubeDiscoveryAcceptReviewResult(body) : action === "defer" ? parseAdminYoutubeDiscoveryDeferReviewResult(body) : parseAdminYoutubeDiscoverySkipReviewResult(body);
    if (!response.ok || !result) throw new Error("unsafe response");
    return result;
  }
  async function accept() {
    if (!detail || isAccepting || isDeciding || isReconciling || detail.actionAvailability === "reconciling") return;
    const recommendationId = detail.recommendationId; const requestId = ++decisionRequestId.current; let dispatched = false;
    setIsAccepting(true); setStatus(youtubeDiscoveryReviewCopy.accept.pending);
    try {
      const nonce = await csrf(); dispatched = true; const result = await postDecision(recommendationId, "accept", nonce);
      if (requestId !== decisionRequestId.current || recommendationId !== selectedId.current) return;
      setStatus(youtubeDiscoveryReviewCopy.accept[result.outcome]);
      if (result.outcome === "reconciling") setIsReconciling(true);
      if (result.outcome === "submitted" || result.outcome === "duplicate") await refreshAfterDecision(recommendationId, requestId);
    } catch {
      if (requestId !== decisionRequestId.current || recommendationId !== selectedId.current) return;
      if (!dispatched) { setStatus(youtubeDiscoveryReviewCopy.accept.failed); return; }
      setIsReconciling(true); setNeedsDecisionRefresh(true); setStatus(youtubeDiscoveryReviewCopy.accept.reconciling); void refreshAfterDecision(recommendationId, requestId, true).catch(() => setStatus("Không thể làm mới trạng thái quyết định."));
    } finally { if (requestId === decisionRequestId.current && recommendationId === selectedId.current) setIsAccepting(false); }
  }
  async function terminalDecision(action: "defer" | "skip") {
    if (!detail || isAccepting || isDeciding || isReconciling || detail.actionAvailability === "reconciling") return;
    const recommendationId = detail.recommendationId; const requestId = ++decisionRequestId.current; let dispatched = false;
    setIsDeciding(true); setStatus(youtubeDiscoveryReviewCopy[action].pending);
    try {
      const nonce = await csrf(); dispatched = true; const result = await postDecision(recommendationId, action, nonce);
      if (requestId !== decisionRequestId.current || recommendationId !== selectedId.current) return;
      if (result.outcome !== (action === "defer" ? "deferred" : "skipped")) throw new Error("unsafe response");
      setStatus(action === "defer" ? youtubeDiscoveryReviewCopy.defer.deferred : youtubeDiscoveryReviewCopy.skip.skipped);
      await refreshAfterDecision(recommendationId, requestId);
    } catch {
      if (requestId !== decisionRequestId.current || recommendationId !== selectedId.current) return;
      if (!dispatched) { setStatus(youtubeDiscoveryReviewCopy[action].failed); return; }
      setIsReconciling(true); setNeedsDecisionRefresh(true); setStatus("Đang làm mới trạng thái quyết định."); void refreshAfterDecision(recommendationId, requestId, true).catch(() => setStatus("Không thể làm mới trạng thái quyết định."));
    }
    finally { if (requestId === decisionRequestId.current && recommendationId === selectedId.current) setIsDeciding(false); }
  }
  async function refreshAfterDecision(recommendationId: string, requestId: number, retainReconciliation = false) {
    if (requestId !== decisionRequestId.current || recommendationId !== selectedId.current) return;
    const queue = await load(null, true, true);
    if (!queue || requestId !== decisionRequestId.current || recommendationId !== selectedId.current) return;
    selectedId.current = null; selectionGeneration.current += 1; setSelected(null); setDetail(null);
    if (queue.items.length === 0) { setIsReconciling(false); setNeedsDecisionRefresh(false); focusQueueAfterDecision.current = true; setShowDetail(false); setQueueFocusToken((current) => current + 1); return; }
    if (!retainReconciliation) { focusSelectedRowAfterDecision.current = true; setShowDetail(false); }
    else focusAfterDecision.current = true;
    choose(queue.items[0], true, retainReconciliation);
  }
  const actionsDisabled = isAccepting || isDeciding || isReconciling || detail?.actionAvailability === "reconciling";
  async function retryDecisionRefresh() {
    if (!selectedId.current) return;
    const recommendationId = selectedId.current;
    const requestId = decisionRequestId.current;
    setStatus("Đang làm mới trạng thái quyết định.");
    try { await refreshAfterDecision(recommendationId, requestId, true); }
    catch { setStatus("Không thể làm mới trạng thái quyết định."); }
  }
  const inspector = <section aria-labelledby="candidate-detail" className="min-w-0 rounded-xl border p-4"><button className="mb-4 min-h-11 rounded border px-4 font-semibold lg:hidden" disabled={isAccepting || isDeciding} onClick={returnToQueue} type="button">Quay lại hàng đợi</button><h2 id="candidate-detail" ref={detailHeading} tabIndex={-1} className="text-xl font-bold outline-none">Chi tiết ứng viên</h2>{detail ? <div className="mt-4 grid gap-4">{detail.thumbnailUrl ? <img alt={`Ảnh xem trước: ${detail.title ?? "video không có tiêu đề"}`} className="max-h-52 w-full rounded object-cover" src={detail.thumbnailUrl} /> : null}<dl className="grid gap-3"><div><dt className="font-semibold">Tiêu đề</dt><dd>{detail.title ?? "Video không có tiêu đề"}</dd></div><div><dt className="font-semibold">Kênh</dt><dd>{detail.channelName ?? "Kênh không có tên"}</dd></div><div><dt className="font-semibold">Thời lượng</dt><dd>{duration(detail.durationSeconds)}</dd></div><div><dt className="font-semibold">Ngày đăng</dt><dd>{published(detail.publishedAt)}</dd></div><div><dt className="font-semibold">URL chuẩn</dt><dd className="break-all">{detail.canonicalUrl}</dd></div><div><dt className="font-semibold">Ngôn ngữ và điều kiện</dt><dd>{languageFit[detail.languageFit]} · {youtubeDiscoveryReviewCopy.eligibilityReason[detail.eligibilityReason]}</dd></div><div><dt className="font-semibold">Lượt xem</dt><dd>{detail.viewCount === null ? "Chưa có dữ liệu" : new Intl.NumberFormat("vi-VN").format(detail.viewCount)}</dd></div><div><dt className="font-semibold">Truy vấn khám phá</dt><dd>{detail.queryText}</dd><dd className="text-sm text-slate-600">{youtubeDiscoveryReviewCopy.queryReason[detail.queryReason]}</dd></div><div><dt className="font-semibold">Lý do xếp hạng</dt><dd>{youtubeDiscoveryReviewCopy.reason[detail.reason]}</dd></div><div><dt className="font-semibold">Kết quả thu thập trước</dt><dd>{capture[detail.priorCaptureOutcome]}</dd></div></dl><p className="text-sm text-slate-600">Các chỉ số video chỉ là ngữ cảnh xem xét, không chứng minh tính đúng đắn, thu thập hay xuất bản.</p><div><p className="font-semibold">Yếu tố và lưu ý</p><div className="mt-2 flex flex-wrap gap-2">{[...detail.factors, ...detail.penalties].map((code) => <span className="rounded-full border px-3 py-1 text-sm" key={code}>{factors[code]}</span>)}</div></div><div><p className="font-semibold">Tín hiệu dẫn xuất</p><div className="mt-2 flex flex-wrap gap-2">{detail.signals.map((signal) => <span className="rounded-full border px-3 py-1 text-sm" key={signal}>{signals[signal]}</span>)}</div></div><p aria-live="polite" className="text-sm text-slate-600">{isReconciling || detail.actionAvailability === "reconciling" ? youtubeDiscoveryReviewCopy.accept.reconciling : "Chọn một quyết định cho ứng viên này."}</p><div className="flex flex-wrap gap-3"><button className="min-h-11 rounded bg-emerald-800 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={actionsDisabled} onClick={() => void accept()} type="button">{isAccepting ? "Đang chấp nhận..." : "Chấp nhận"}</button><button className="min-h-11 rounded border px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60" disabled={actionsDisabled} onClick={() => void terminalDecision("defer")} type="button">{isDeciding ? "Đang xử lý..." : "Để sau"}</button><button className="min-h-11 rounded border px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60" disabled={actionsDisabled} onClick={() => void terminalDecision("skip")} type="button">{isDeciding ? "Đang xử lý..." : "Bỏ qua"}</button></div></div> : <p className="mt-4 text-slate-600">Chọn một ứng viên để xem chi tiết.</p>}{needsDecisionRefresh ? <button className="mt-4 min-h-11 rounded border px-4 font-semibold" onClick={() => void retryDecisionRefresh()} type="button">Làm mới trạng thái quyết định</button> : null}</section>;
  const tabs = ([ ["consider", "Cần xem xét"], ["defer", "Để sau"], ["skip", "Bỏ qua"], ["all", "Tất cả"] ] as const);
  const isConsiderTab = browseFilter === "consider";
  const considerSurface = <><div className="mt-6 lg:grid lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)] lg:gap-6"><div className={showDetail ? "hidden lg:block" : "block"}><div className="grid gap-2">{items.map((item) => <button aria-pressed={selected === item.recommendationId} className="min-h-11 rounded-lg border p-3 text-left outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800 aria-pressed:border-emerald-800 aria-pressed:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isAccepting || isDeciding || isReconciling} key={item.recommendationId} onClick={() => choose(item)} ref={selected === item.recommendationId ? selectedRow : undefined} type="button"><div className="flex gap-3">{item.thumbnailUrl ? <img alt="" className="h-16 w-24 rounded object-cover" src={item.thumbnailUrl} /> : null}<div className="min-w-0"><strong>{item.title ?? "Video không có tiêu đề"}</strong><span className="mt-1 block text-sm text-slate-600">{item.channelName ?? "Kênh không có tên"} · {languageFit[item.languageFit]} · {youtubeDiscoveryReviewCopy.eligibilityReason[item.eligibilityReason]}</span><span className="mt-1 block text-sm">{published(item.publishedAt)} · {duration(item.durationSeconds)}{item.viewCount !== null ? ` · ${new Intl.NumberFormat("vi-VN").format(item.viewCount)} lượt xem` : ""}</span></div></div></button>)}</div>{selected ? <button className="mt-4 min-h-11 rounded border px-4 font-semibold lg:hidden" disabled={!detail || isAccepting || isDeciding || isReconciling} onClick={openDetail} type="button">Xem chi tiết đã chọn</button> : null}{cursor ? <button className="mt-4 min-h-11 rounded border px-4 disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoadingMore || isAccepting || isDeciding || isReconciling} onClick={() => void load(cursor).catch(() => setStatus("Không thể tải thêm ứng viên."))} type="button">{isLoadingMore ? "Đang tải..." : "Tải thêm"}</button> : items.length > 0 ? <p className="mt-4 text-sm text-slate-600">Đã tải hết hàng đợi.</p> : null}</div><div className={showDetail ? "block" : "hidden lg:block"}>{inspector}</div></div><section aria-labelledby="foreign-fallback" className="mt-8 rounded-xl border p-4"><h2 id="foreign-fallback" className="text-xl font-bold">Nguồn ngoại ngữ bổ sung</h2><p className="mt-2 text-sm text-slate-600">Bản xem mới nhất, tối đa 20 nguồn. Chỉ đọc, không thuộc hàng đợi ưu tiên, xếp hạng hoặc hành động xem xét. Các chỉ số chỉ là ngữ cảnh, không phải bằng chứng thu thập, tính đúng đắn hay xuất bản.</p><p aria-live="polite" className="mt-3 text-sm text-slate-600">{fallbackStatus}</p>{fallbackStatus === "Không thể tải nguồn ngoại ngữ bổ sung." ? <button className="mt-3 min-h-11 rounded border px-4 font-semibold" onClick={() => void loadFallback()} type="button">Thử lại tải nguồn bổ sung</button> : null}<div className="mt-3 grid gap-3 sm:grid-cols-2">{fallbackItems.map((item) => <article className="min-w-0 rounded border p-3" key={item.canonicalUrl}>{item.thumbnailUrl ? <img alt={`Ảnh xem trước: ${item.title ?? "video nguồn bổ sung"}`} className="mb-3 h-32 w-full rounded object-cover" src={item.thumbnailUrl} /> : null}<p className="font-semibold">{item.title ?? "Video không có tiêu đề"}</p><p className="text-sm text-slate-600">{item.channelName ?? "Kênh không có tên"}</p><p className="mt-1 text-sm">{published(item.publishedAt)} · {duration(item.durationSeconds)}{item.viewCount !== null ? ` · ${new Intl.NumberFormat("vi-VN").format(item.viewCount)} lượt xem` : ""}</p><p className="mt-1 text-sm text-slate-600">{fallbackLanguageFit[item.languageFit]} · {youtubeDiscoveryReviewCopy.fallbackReason[item.eligibilityReason]}</p><p className="mt-1 text-sm text-slate-600">Truy vấn: {item.queryText}</p><a className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline" href={item.canonicalUrl} rel="noreferrer" target="_blank">Mở URL</a></article>)}</div></section></>;
  const browseSurface = <div className="mt-4"><p className="text-sm text-slate-600">Chỉ đọc. Các quyết định chỉ áp dụng cho hàng đợi “Consider” đang chờ.</p><p aria-live="polite" className="mt-3 text-sm text-slate-600">{browseStatus}</p><div className="mt-3 grid gap-3">{browseItems.map((item) => <article className="rounded-lg border p-3" key={item.recommendationId}><a className="break-all font-semibold text-emerald-800 underline" href={item.canonicalUrl} rel="noreferrer" target="_blank">{item.canonicalUrl}</a><p className="mt-1">{item.title ?? "Video không có tiêu đề"} · {item.channelName ?? "Kênh không có tên"}</p><p className="text-sm text-slate-600">{item.publishedAt ? `Đăng ${new Intl.DateTimeFormat("vi-VN").format(new Date(item.publishedAt))}` : "Chưa rõ ngày đăng"}{item.durationSeconds !== null ? ` · ${Math.floor(item.durationSeconds / 60)} phút` : ""} · Đề xuất lúc {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</p><p className="text-sm text-slate-600">{youtubeDiscoveryReviewCopy.recommendation[item.recommendation]} · {youtubeDiscoveryReviewCopy.reason[item.reason]} · Điểm {item.score.toFixed(2)}</p><div className="mt-2 flex flex-wrap gap-2">{item.factors.map((code, index) => <span className="rounded-full border px-2 py-1 text-xs" key={`factor-${index}-${code}`}>{factors[code]}</span>)}{item.penalties.map((code, index) => <span className="rounded-full border px-2 py-1 text-xs" key={`penalty-${index}-${code}`}>{factors[code]}</span>)}{item.signals.map((code, index) => <span className="rounded-full border px-2 py-1 text-xs" key={`signal-${index}-${code}`}>{signals[code]}</span>)}</div></article>)}</div>{browseCursor ? <button className="mt-4 min-h-11 rounded border px-4 disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoadingBrowseMore} onClick={() => void loadBrowse(browseFilter, browseCursor).catch(() => setBrowseStatus("Không thể tải thêm khuyến nghị."))} type="button">{isLoadingBrowseMore ? "Đang tải..." : "Tải thêm"}</button> : browseItems.length > 0 ? <p className="mt-4 text-sm text-slate-600">Đã tải hết khuyến nghị.</p> : null}</div>;
  return <main className="mx-auto max-w-7xl p-4 text-slate-900 sm:p-8"><header><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-emerald-800">YOUTUBE DISCOVERY</p><h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold outline-none">Youtube Discovery</h1><p className="mt-3 text-slate-600">Duyệt từng URL ứng viên. Xếp hạng không xác nhận nội dung, thu thập hay xuất bản.</p></div><Link className="inline-flex min-h-11 items-center rounded border border-emerald-900 px-4 font-semibold text-emerald-900" href="/knowledge/youtube-discovery/health">Sức khỏe Discovery</Link></div></header><p aria-live="polite" className="mt-4" role="status">{status}</p><section aria-labelledby="review-queue" className="mt-6 min-w-0"><h2 id="review-queue" ref={queueHeading} tabIndex={-1} className="text-xl font-bold outline-none">Hàng đợi</h2><div aria-label="Lọc hàng đợi" className="mt-3 flex flex-wrap gap-2">{tabs.map(([filter, label]) => <button aria-pressed={browseFilter === filter} className="min-h-11 rounded border px-4 aria-pressed:border-emerald-800 aria-pressed:bg-emerald-50" key={filter} onClick={() => setBrowseFilter(filter)} type="button">{label}</button>)}</div>{isConsiderTab ? considerSurface : browseSurface}</section></main>;
}

function validRecommendationId(value: string | null): value is string { return value !== null && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function duration(value: number | null) { if (value === null) return "Chưa rõ thời lượng"; const hours = Math.floor(value / 3600); const minutes = Math.floor(value % 3600 / 60); const seconds = value % 60; return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`; }
function published(value: string | null) { return value ? `${new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value))} (${relativeAge(value)})` : "Chưa rõ ngày đăng"; }
function relativeAge(value: string) { const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)); return days === 0 ? "hôm nay" : days === 1 ? "1 ngày trước" : `${days} ngày trước`; }
