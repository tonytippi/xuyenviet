"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { parseAdminYoutubeDiscoveryActionRequiredQueue, type AdminYoutubeDiscoveryActionRequiredItem } from "@xuyenviet/contracts";

function origin() { const value = process.env.NEXT_PUBLIC_API_ORIGIN; if (!value) throw new Error("NEXT_PUBLIC_API_ORIGIN is required."); return value; }
function signIn() { window.location.assign(`${origin()}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/knowledge/youtube-discovery` })}`); }
function destination(item: AdminYoutubeDiscoveryActionRequiredItem) {
  if (item.destination === "review") return `/knowledge/youtube-discovery-review?recommendationId=${encodeURIComponent(item.actionId)}`;
  if (item.destination === "knowledge_recommendation") return `/knowledge/recommendations/${encodeURIComponent(item.actionId)}`;
  return item.destination === "mission" ? `/knowledge/youtube-discovery/mission/${encodeURIComponent(item.actionId)}` : `/knowledge/youtube-discovery/health/${encodeURIComponent(item.actionId)}`;
}
const typeCopy = { candidate_review: "Ứng viên", mission_need: "Nhu cầu", health_incident: "Sức khỏe", knowledge_recommendation: "Tri thức" } as const;
const reasonCopy = { review_pending: "Cần xem", review_aged: "Cần xem đã quá hạn", mission_no_progress: "Không có tiến triển", mission_disabled: "Discovery đang tắt", mission_no_enabled_query: "Chưa có truy vấn đang bật", provider_rate_limited: "Bị giới hạn nhà cung cấp", triage_schema_invalid: "Dữ liệu phân loại không hợp lệ", execution_persistent_failure: "Lỗi thực thi lặp lại", knowledge_risk: "Rủi ro cần xử lý", knowledge_relation: "Liên kết cần xử lý" } as const;

export function YoutubeDiscoveryActionRequired() {
  const [items, setItems] = useState<AdminYoutubeDiscoveryActionRequiredItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState("Đang tải việc cần xử lý.");
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const loadMore = useRef<HTMLButtonElement>(null);
  async function load(next: string | null, append = false) {
    setLoading(true);
    try {
      const response = await fetch(`${origin()}/v1/admin/knowledge/youtube-discovery/action-required${next ? `?${new URLSearchParams({ cursor: next })}` : ""}`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store" });
      if (response.status === 401) { signIn(); return; }
      const queue = parseAdminYoutubeDiscoveryActionRequiredQueue(await response.json().catch(() => null));
      if (!response.ok || !queue) throw new Error("unsafe response");
      setUnavailable(false);
      setItems((current) => append ? [...current, ...queue.items.filter((item) => !current.some((existing) => existing.kind === item.kind && existing.actionId === item.actionId))] : queue.items);
      setCursor(queue.nextCursor);
      const start = append ? items.length + 1 : queue.items.length ? 1 : 0;
      setStatus(queue.items.length ? `Đã tải mục ${start}-${start + queue.items.length - 1}.` : "Không còn việc cần xử lý.");
      if (append) requestAnimationFrame(() => loadMore.current?.focus());
    } catch { setUnavailable(true); setStatus("Không thể tải việc cần xử lý lúc này."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(null); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <main className="mx-auto max-w-3xl text-slate-900"><header><p className="text-sm font-semibold text-emerald-800">YOUTUBE DISCOVERY</p><h1 tabIndex={-1} className="mt-2 text-3xl font-bold outline-none">Việc cần xử lý</h1><p className="mt-3 text-slate-600">Chỉ hiển thị việc cần chú ý. Xếp hạng không xác nhận nội dung, thu thập hay xuất bản.</p></header><p aria-live="polite" role="status" className="mt-4 text-sm text-slate-700">{status}</p>{items.length ? <ol className="mt-6 grid gap-3">{items.map((item) => <li className="min-w-0 border border-[#b8c4b9] bg-[#fbf7ed] p-4" key={`${item.kind}:${item.actionId}`}><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{typeCopy[item.kind]}</p><h2 className="mt-1 font-semibold">{reasonCopy[item.reason]}</h2><p className="mt-1 text-sm"><span className="font-medium">Trạng thái:</span> {reasonCopy[item.reason]}</p><p className="mt-1 text-sm text-slate-600">Ưu tiên {item.priority} · {new Intl.DateTimeFormat("vi-VN").format(new Date(item.occurredAt))}</p><Link className="mt-3 inline-flex min-h-11 items-center rounded border border-emerald-900 px-4 font-semibold text-emerald-900 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800" href={destination(item)}>Mở việc này</Link></li>)}</ol> : unavailable ? <section className="mt-8 border border-amber-700 bg-[#fbf7ed] p-5"><h2 className="font-semibold">Chưa thể tải việc cần xử lý</h2><p className="mt-2 text-slate-600">Hãy thử lại trước khi kết luận không còn việc cần xử lý.</p><button className="mt-4 inline-flex min-h-11 items-center rounded border border-emerald-900 px-4 font-semibold text-emerald-900" onClick={() => void load(null)} type="button">Thử lại</button></section> : !loading ? <section className="mt-8 border border-[#b8c4b9] bg-[#fbf7ed] p-5"><h2 className="font-semibold">Không còn việc cần xử lý</h2><p className="mt-2 text-slate-600">Bạn có thể xem nhu cầu phủ sóng hoặc sức khỏe Discovery khi cần.</p><div className="mt-4 flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded border border-emerald-900 px-4 font-semibold text-emerald-900" href="/knowledge/youtube-discovery/mission">Nhu cầu</Link><Link className="inline-flex min-h-11 items-center rounded border border-emerald-900 px-4 font-semibold text-emerald-900" href="/knowledge/youtube-discovery/health">Sức khỏe</Link></div></section> : null}{cursor ? <button ref={loadMore} className="mt-6 min-h-11 rounded border border-emerald-900 px-4 font-semibold text-emerald-900 disabled:opacity-50" disabled={loading} onClick={() => void load(cursor, true)} type="button">{loading ? "Đang tải" : "Tải thêm"}</button> : null}</main>;
}
