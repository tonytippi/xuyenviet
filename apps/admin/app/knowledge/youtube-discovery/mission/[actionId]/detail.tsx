"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseAdminYoutubeDiscoveryMissionDetail } from "@xuyenviet/contracts";

function origin() { const value = process.env.NEXT_PUBLIC_API_ORIGIN; if (!value) throw new Error("NEXT_PUBLIC_API_ORIGIN is required."); return value; }
function signIn() { window.location.assign(`${origin()}/auth/google?${new URLSearchParams({ returnUrl: window.location.href })}`); }
const operationalDisclaimer = "Xếp hạng chỉ là bối cảnh vận hành, không phải xác minh, bằng chứng, hoàn tất thu thập hoặc phê duyệt xuất bản.";

export function MissionDetail({ actionId }: { actionId: string }) {
  const [detail, setDetail] = useState<ReturnType<typeof parseAdminYoutubeDiscoveryMissionDetail>>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);
  const load = useCallback(async (cursor: string | null = null, append = false, signal?: AbortSignal) => {
    const id = ++request.current;
    if (append) setLoadingMore(true);
    try {
      const search = cursor ? `?${new URLSearchParams({ cursor })}` : "";
      const response = await fetch(`${origin()}/v1/admin/knowledge/youtube-discovery/mission/${encodeURIComponent(actionId)}${search}`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store", signal });
      if (response.status === 401) { signIn(); return; }
      const parsed = parseAdminYoutubeDiscoveryMissionDetail(await response.json().catch(() => null));
      if (!response.ok || !parsed || id !== request.current) throw new Error("unavailable");
      setDetail((current) => append && current ? { ...parsed, candidates: { items: [...current.candidates.items, ...parsed.candidates.items], nextCursor: parsed.candidates.nextCursor } } : parsed);
      setUnavailable(false);
    } catch (error) { if ((error as Error).name !== "AbortError" && id === request.current) setUnavailable(true); } finally { if (id === request.current) setLoadingMore(false); }
  }, [actionId]);
  useEffect(() => { const controller = new AbortController(); void load(null, false, controller.signal); return () => controller.abort(); }, [actionId, load]);
  if (unavailable) return <section><h1 className="text-2xl font-bold">Nhu cầu Discovery</h1><p className="mt-3 text-slate-700">Nhu cầu trong liên kết không khả dụng.</p></section>;
  if (!detail) return <section aria-live="polite"><h1 className="text-2xl font-bold">Nhu cầu Discovery</h1><p className="mt-3 text-slate-700">Đang tải dấu vết an toàn.</p></section>;
  return <main className="mx-auto max-w-4xl min-w-0"><h1 className="text-3xl font-bold">Dấu vết nhu cầu Discovery</h1><p className="mt-3">Ưu tiên {detail.coverage.priority} · {detail.coverage.location ?? "Địa điểm chưa có"}</p><section className="mt-6 border p-4"><h2 className="font-semibold">Truy vấn liên kết</h2><p className="mt-2">{detail.query.origin === "system" ? "Hệ thống đề xuất" : "Operator tạo"} · {detail.query.reason}</p><p className="mt-2">Lần chạy mới nhất: {detail.latestRun.state === "unavailable" ? "Chưa có lần chạy" : detail.latestRun.state}</p></section><section className="mt-6 border p-4"><h2 className="font-semibold">Ứng viên đã xếp hạng</h2><p className="mt-2 text-sm text-slate-600">{operationalDisclaimer}</p>{detail.candidates.items.map((candidate) => <article className="mt-3 border-t pt-3" key={`${candidate.actionId}:${candidate.candidateId}`}><p>Ứng viên hạng {candidate.rank + 1}</p>{candidate.reviewAvailable && candidate.recommendationId ? <Link className="mt-2 inline-flex min-h-11 items-center border border-emerald-900 px-4 font-semibold" href={`/knowledge/youtube-discovery-review?recommendationId=${encodeURIComponent(candidate.recommendationId)}`}>Mở hàng đợi xem xét</Link> : <p className="mt-1 text-sm text-slate-600">Bản ghi truy vết không có hành động xem xét.</p>}</article>)}{detail.candidates.nextCursor ? <button className="mt-4 min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-50" disabled={loadingMore} onClick={() => void load(detail.candidates.nextCursor, true)} type="button">{loadingMore ? "Đang tải" : "Tải thêm ứng viên"}</button> : null}</section></main>;
}
