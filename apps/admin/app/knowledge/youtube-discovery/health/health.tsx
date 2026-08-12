"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { parseAdminYoutubeDiscoveryEnablementResult, parseAdminYoutubeDiscoveryHealthOverview, type AdminYoutubeDiscoveryHealthOverview } from "@xuyenviet/contracts";

function origin() { const value = process.env.NEXT_PUBLIC_API_ORIGIN; if (!value) throw new Error("NEXT_PUBLIC_API_ORIGIN is required."); return value; }
function signIn() { window.location.assign(`${origin()}/auth/google?${new URLSearchParams({ returnUrl: window.location.href })}`); }
const runCopy = { no_run: "Chưa có lần chạy", queued: "Đang chờ", running: "Đang chạy", retrying: "Đang thử lại", completed: "Đã hoàn tất", failed: "Đã thất bại", cancelled: "Đã hủy", unavailable: "Không khả dụng" } as const;
const incidentCopy = { provider_rate_limited: "Nhà cung cấp giới hạn tốc độ", triage_schema_invalid: "Dữ liệu phân loại không hợp lệ", execution_persistent_failure: "Thực thi thất bại liên tục" } as const;

export function YoutubeDiscoveryHealth() {
  const [health, setHealth] = useState<AdminYoutubeDiscoveryHealthOverview | null>(null);
  const [status, setStatus] = useState("Đang tải sức khỏe Discovery.");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [retryCommand, setRetryCommand] = useState<{ enabled: boolean } | null>(null);
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  async function load(preserveConfirmedHealth = false) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller; const request = ++sequence.current;
    setFailed(false); setStatus("Đang tải sức khỏe Discovery.");
    try {
      const response = await fetch(`${origin()}/v1/admin/knowledge/youtube-discovery/health`, { credentials: "include", cache: "no-store", signal: controller.signal, headers: { "x-request-id": crypto.randomUUID() } });
      if (response.status === 401) { signIn(); return false; }
      const parsed = parseAdminYoutubeDiscoveryHealthOverview(await response.json().catch(() => null));
      if (!response.ok || !parsed) throw new Error("unavailable");
      if (request === sequence.current) { setHealth(parsed); setStatus("Đã tải sức khỏe Discovery an toàn."); return true; }
      return false;
    } catch { if (request === sequence.current && !controller.signal.aborted) { if (!preserveConfirmedHealth) setFailed(true); setStatus("Không thể tải sức khỏe Discovery lúc này."); } return false; }
  }
  useEffect(() => { void load(); return () => active.current?.abort(); }, []);
  async function setEnabled(enabled: boolean, retry = false) {
    if (!health || pending || !retry && health.policy.enabled === enabled) return;
    setRetryCommand({ enabled });
    setPending(true); setStatus("Đang cập nhật trạng thái Discovery.");
    try {
      const requestId = crypto.randomUUID();
      const csrfResponse = await fetch(`${origin()}/auth/csrf`, { credentials: "include", cache: "no-store", headers: { "x-request-id": requestId } });
      if (csrfResponse.status === 401) { signIn(); return; }
      const csrfBody = await csrfResponse.json().catch(() => null);
      const csrfToken = csrfBody && typeof csrfBody === "object" && !Array.isArray(csrfBody) && Object.keys(csrfBody).length === 1 && typeof (csrfBody as { csrfToken?: unknown }).csrfToken === "string" ? (csrfBody as { csrfToken: string }).csrfToken : null;
      if (!csrfResponse.ok || !csrfToken) throw new Error("unavailable");
      const response = await fetch(`${origin()}/v1/admin/knowledge/youtube-discovery/enablement`, { method: "POST", credentials: "include", cache: "no-store", headers: { "content-type": "application/json", "x-request-id": requestId, "x-xuyenviet-csrf": csrfToken, Origin: window.location.origin }, body: JSON.stringify({ enabled }) });
      if (response.status === 401) { signIn(); return; }
      const result = parseAdminYoutubeDiscoveryEnablementResult(await response.json().catch(() => null));
      if (!response.ok || !result) throw new Error("unavailable");
       setHealth((current) => current ? {
         ...current,
         policy: { ...current.policy, enabled: result.enabled },
         // Do not retain a pre-command future schedule when reconciliation fails.
         querySchedule: result.enabled
           ? { enabled: null, cadenceMinutes: null, nextRunAt: null, lastUpdatedAt: null, freshness: "unavailable" }
           : { ...current.querySchedule, enabled: false, nextRunAt: null, freshness: "unavailable" },
         latestQueryRun: result.enabled || current.latestQueryRun.state !== "retrying"
           ? current.latestQueryRun
           : { ...current.latestQueryRun, nextRunAt: null },
       } : current);
      setStatus(result.enabled ? "Discovery đã bật." : "Discovery đã tắt.");
      if (await load(true)) setRetryCommand(null);
    } catch { setStatus("Không thể cập nhật Discovery. Trạng thái đã xác nhận được giữ nguyên, hãy thử lại."); }
    finally { setPending(false); }
  }
  if (failed) return <main><h1 className="text-3xl font-bold">Sức khỏe Discovery</h1><p role="status" aria-live="polite" className="mt-4">{status}</p><button className="mt-4 min-h-11 border border-emerald-900 px-4 font-semibold" onClick={() => void load()} type="button">Thử lại</button></main>;
  if (!health) return <main><h1 className="text-3xl font-bold">Sức khỏe Discovery</h1><p role="status" aria-live="polite" className="mt-4">{status}</p></main>;
  return <main className="mx-auto max-w-5xl min-w-0 text-slate-900"><header><p className="text-sm font-semibold text-emerald-800">YOUTUBE DISCOVERY</p><h1 className="mt-2 text-3xl font-bold">Sức khỏe Discovery</h1><p role="status" aria-live="polite" className="mt-3 text-slate-600">{status}</p><p className="mt-1 text-sm text-slate-600">{lastUpdatedNote(health.lastUpdatedAt)}</p></header><section className="mt-6 grid gap-4 sm:grid-cols-2"><PolicyControl enabled={health.policy.enabled} pending={pending} retryCommand={retryCommand} onChange={setEnabled} /><Card title="Lập kế hoạch" value={runCopy[health.planning.state]} note={runNote(health.planning, "Chưa có lần chạy lập kế hoạch")} /><Card title="Lần chạy truy vấn gần nhất" value={runCopy[health.latestQueryRun.state]} note={runNote(health.latestQueryRun, "Chưa có lần chạy truy vấn")} /><Card title="Lịch truy vấn" value={health.querySchedule.enabled === false ? "Đang tắt" : health.querySchedule.freshness === "unavailable" ? "Không khả dụng" : "Đang bật"} note={scheduleNote(health.querySchedule)} /><Card title="Hàng đợi xem xét" value={`${health.backlog.pending} cần xem, ${health.backlog.deferred} để sau`} note={health.backlog.deferredAge === "available" ? `Để sau lâu nhất: ${format(health.backlog.oldestDeferredAt!)}. ${lastUpdatedNote(health.backlog.lastUpdatedAt)}` : `Tuổi để sau không khả dụng cho dữ liệu cũ hoặc chưa có. ${lastUpdatedNote(health.backlog.lastUpdatedAt)}`} /></section><PausedRuns runs={health.pausedRuns} /><Throughput throughput={health.throughput} /><section className="mt-6 border border-[#b8c4b9] bg-[#fbf7ed] p-5"><h2 className="font-semibold">Telemetry sử dụng AI</h2><p className="mt-3 text-sm">{usageNote(health.usage)}</p></section><Incidents incidents={health.incidents} /></main>;
}

function Card({ title, value, note }: { title: string; value: string; note: string }) { return <section className="border border-[#b8c4b9] bg-[#fbf7ed] p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-xl font-bold">{value}</p><p className="mt-2 text-sm text-slate-600">{note}</p></section>; }
function PolicyControl({ enabled, pending, retryCommand, onChange }: { enabled: boolean | null; pending: boolean; retryCommand: { enabled: boolean } | null; onChange: (enabled: boolean, retry?: boolean) => void }) { const label = policyLabel(enabled); return <section className="border border-[#b8c4b9] bg-[#fbf7ed] p-5"><h2 className="font-semibold">Chính sách Discovery</h2><p className="mt-2 text-xl font-bold">{label}</p><p className="mt-2 text-sm text-slate-600">{enabled ? "Tắt sẽ dừng lập kế hoạch và công việc Discovery mới; không ảnh hưởng Knowledge hoặc youtube:capture thủ công." : "Discovery đang tắt. Hệ thống sẽ không tìm hoặc triage video mới."}</p>{enabled === false && <p className="mt-2 text-sm text-slate-600">Nguồn Knowledge đang chờ xử lý và YouTube Capture thủ công không bị ảnh hưởng.</p>}{enabled !== null && <button className="mt-3 min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-60" type="button" aria-pressed={enabled} disabled={pending} onClick={() => onChange(!enabled)}>{pending ? "Đang cập nhật" : enabled ? "Tắt Discovery" : "Bật Discovery"}</button>}{retryCommand && <button className="mt-3 min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-60" type="button" disabled={pending} onClick={() => onChange(retryCommand.enabled, true)}>Thử lại cập nhật Discovery</button>}</section>; }
function PausedRuns({ runs }: { runs: AdminYoutubeDiscoveryHealthOverview["pausedRuns"] }) { if (!runs.length) return null; const copy = { fencing_requested: "Đang dừng tác vụ", policy_revoked: "Đã hủy", completed_before_disabled: "Đã hoàn tất trước khi dừng" } as const; return <section className="mt-6 border border-[#b8c4b9] bg-[#fbf7ed] p-5"><h2 className="font-semibold">Công việc khi Discovery tắt</h2><p className="mt-2 text-sm text-slate-600">Thông tin giới hạn; không xác định nguyên nhân của từng lần chạy.</p><ul className="mt-3 space-y-2 text-sm">{runs.map((run) => <li key={run.runId}>{copy[run.state]}. {format(run.at)}.</li>)}</ul></section>; }
function Throughput({ throughput }: { throughput: AdminYoutubeDiscoveryHealthOverview["throughput"] }) { return <section className="mt-6 border border-[#b8c4b9] bg-[#fbf7ed] p-5"><h2 className="font-semibold">Thông lượng {throughput.windowHours} giờ</h2>{throughput.freshness === "unavailable" ? <p className="mt-3 text-sm">Dữ liệu thông lượng chưa sẵn sàng.</p> : throughput.freshness === "stale" ? <p className="mt-3 text-sm">Dữ liệu thông lượng có thể đã cũ. {lastUpdatedNote(throughput.lastUpdatedAt)}</p> : <><dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{(["discovered", "enriched", "triaged", "recommended"] as const).map((stage) => <div key={stage}><dt className="text-sm text-slate-600">{stage}</dt><dd className="text-xl font-bold">{throughput[stage]}</dd></div>)}</dl><p className="mt-3 text-sm text-slate-600">{lastUpdatedNote(throughput.lastUpdatedAt)}</p></>}</section>; }
function Incidents({ incidents }: { incidents: AdminYoutubeDiscoveryHealthOverview["incidents"] }) { return <section className="mt-6 border border-[#b8c4b9] bg-[#fbf7ed] p-5"><h2 className="font-semibold">Sự cố cần xử lý</h2>{incidents.length === 0 ? <p className="mt-3 text-sm">Không có sự cố cần xử lý.</p> : <ol className="mt-3 divide-y divide-[#b8c4b9] border-y border-[#b8c4b9]">{incidents.map((incident) => <li key={incident.actionId}><Link className="flex min-h-11 items-center justify-between gap-4 px-3 py-2 font-semibold underline decoration-2 underline-offset-4" href={`/knowledge/youtube-discovery/health/${encodeURIComponent(incident.actionId)}`} aria-label={`Mở sự cố: ${incidentCopy[incident.reason]}`}><span>{incidentCopy[incident.reason]}</span><span className="text-right text-sm font-normal">Ưu tiên {incident.priority}. Ghi nhận: {format(incident.occurredAt)}.</span></Link></li>)}</ol>}</section>; }
function format(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function policyLabel(enabled: boolean | null) { return enabled === null ? "Không khả dụng" : enabled ? "Đang bật" : "Đang tắt"; }
function runNote(run: AdminYoutubeDiscoveryHealthOverview["planning"], empty: string) { const updated = lastUpdatedNote(run.lastUpdatedAt); return run.freshness === "stale" ? `Cảnh báo: dữ liệu đã quá nhịp. ${updated}` : run.nextRunAt ? `Thử lại lúc: ${format(run.nextRunAt)}. ${updated}` : run.at ? `${format(run.at)}. ${updated}` : `${empty}. ${updated}`; }
function scheduleNote(schedule: AdminYoutubeDiscoveryHealthOverview["querySchedule"]) { const updated = lastUpdatedNote(schedule.lastUpdatedAt); return schedule.freshness === "stale" ? `Cảnh báo: lịch truy vấn đã quá nhịp. ${updated}` : schedule.nextRunAt ? `Lần tới: ${format(schedule.nextRunAt)}. ${updated}` : `Chưa có lịch lần tới. ${updated}`; }
function usageNote(usage: AdminYoutubeDiscoveryHealthOverview["usage"]) { const freshness = usage.freshness === "stale" ? " Cảnh báo: dữ liệu sử dụng AI đã cũ." : ""; if (usage.availability === "missing") return `Thiếu telemetry sử dụng AI trong 24 giờ qua.${freshness} ${lastUpdatedNote(usage.lastUpdatedAt)}`; if (usage.availability === "incomplete_usage") return `Telemetry sử dụng AI chưa đầy đủ: thiếu số token.${freshness} ${lastUpdatedNote(usage.lastUpdatedAt)}`; if (usage.availability === "incomplete_pricing") return `Telemetry sử dụng AI chưa đầy đủ: thiếu chi phí.${freshness} ${lastUpdatedNote(usage.lastUpdatedAt)}`; return `${usage.requests} yêu cầu, ${usage.totalTokens} token, ${usage.costMicros} micro-đồng.${freshness} ${lastUpdatedNote(usage.lastUpdatedAt)}`; }
function lastUpdatedNote(value: string | null) { return value ? `Cập nhật lần cuối: ${format(value)}.` : "Chưa có thời điểm cập nhật khả dụng."; }
