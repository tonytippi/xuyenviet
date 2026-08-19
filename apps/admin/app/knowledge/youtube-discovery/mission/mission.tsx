"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  parseAdminKnowledgeProvinceCoverageList,
  parseAdminKnowledgeProvinceSuggestion,
  parseAdminYoutubeDiscoveryImmediateRunResult,
  parseAdminYoutubeDiscoveryMissionCandidatePage,
  parseAdminYoutubeDiscoveryMissionCoveragePage,
  parseAdminYoutubeDiscoveryMissionFunnel,
  parseAdminYoutubeDiscoveryMissionQueryPage,
  parseAdminYoutubeDiscoveryQuery,
  parseAdminYoutubeDiscoveryQueryProgress,
  type AdminKnowledgeProvinceCoverage,
  type AdminKnowledgeProvinceSuggestion,
  type AdminYoutubeDiscoveryMissionCandidate,
  type AdminYoutubeDiscoveryMissionCoverage,
  type AdminYoutubeDiscoveryQuery,
} from "@xuyenviet/contracts";

type View = "coverage" | "province" | "queries" | "candidates" | "funnel";
type Draft = { queryText: string; priority: string; cadenceMinutes: string };
type ProvinceSuggestionState = { value: AdminYoutubeDiscoveryProvinceSuggestion; draft: Draft } | null;
type AdminYoutubeDiscoveryProvinceSuggestion = AdminKnowledgeProvinceSuggestion;

const emptyDraft: Draft = { queryText: "", priority: "50", cadenceMinutes: "60" };
const views: Array<{ id: View; label: string }> = [
  { id: "province", label: "Phủ sóng tỉnh/thành" },
  { id: "coverage", label: "Nhu cầu phủ sóng" },
  { id: "queries", label: "Truy vấn" },
  { id: "candidates", label: "Ứng viên" },
  { id: "funnel", label: "Luồng Discovery" },
];

function origin() {
  const value = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (!value) throw new Error("NEXT_PUBLIC_API_ORIGIN is required.");
  return value;
}

function signIn() {
  window.location.assign(`${origin()}/auth/google?${new URLSearchParams({ returnUrl: window.location.href })}`);
}

function validView(value: string | null): value is View {
  return views.some((view) => view.id === value);
}

function searchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll("đ", "d").replaceAll("Đ", "D").toLocaleLowerCase("vi").trim();
}

export function filterProvinceCoverage(items: AdminKnowledgeProvinceCoverage[], search: string) {
  const needle = searchText(search);
  if (!needle) return items;
  return items.filter((item) => [item.currentName, ...item.legacyNames].some((name) => searchText(name).includes(needle)));
}

export function validateMissionQueryDraft(draft: Draft, create: boolean): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  const text = draft.queryText.trim();
  if ((create || draft.queryText) && (!text || text.length > 240 || !/^[\p{L}\p{N} '-]+$/u.test(text))) errors.queryText = "Nhập truy vấn dài từ 1 đến 240 ký tự.";
  if (!/^\d+$/.test(draft.priority) || Number(draft.priority) < 1 || Number(draft.priority) > 100) errors.priority = "Ưu tiên phải từ 1 đến 100.";
  if (create && (!/^\d+$/.test(draft.cadenceMinutes) || Number(draft.cadenceMinutes) < 15 || Number(draft.cadenceMinutes) > 10_080)) errors.cadenceMinutes = "Chu kỳ phải từ 15 đến 10080 phút.";
  return errors;
}

async function csrf() {
  const response = await fetch(`${origin()}/auth/csrf`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store" });
  if (response.status === 401) {
    signIn();
    throw new Error("signin");
  }
  const body = await response.json().catch(() => null);
  const token = body && typeof body === "object" && typeof (body as { csrfToken?: unknown }).csrfToken === "string" ? (body as { csrfToken: string }).csrfToken : null;
  if (!response.ok || !token) throw new Error("csrf");
  return token;
}

async function post(path: string, body: object) {
  const token = await csrf();
  const response = await fetch(`${origin()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-request-id": crypto.randomUUID(), "x-xuyenviet-csrf": token, Origin: window.location.origin },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 401) signIn();
  return { response, body: await response.json().catch(() => null) };
}

export function YoutubeDiscoveryMission() {
  const [view, setView] = useState<View>("province");
  const [items, setItems] = useState<Array<AdminYoutubeDiscoveryMissionCoverage | AdminYoutubeDiscoveryQuery | AdminYoutubeDiscoveryMissionCandidate>>([]);
  const [provinces, setProvinces] = useState<AdminKnowledgeProvinceCoverage[]>([]);
  const [funnel, setFunnel] = useState<ReturnType<typeof parseAdminYoutubeDiscoveryMissionFunnel>>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState("Đang tải phủ sóng tỉnh, thành phố.");
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const more = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const sync = () => {
      const current = new URLSearchParams(window.location.search).get("view");
      if (!validView(current) && current !== null) window.history.replaceState(null, "", `${window.location.pathname}?view=province`);
      setView(validView(current) ? current : "province");
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  async function load(next: string | null, append = false, selected = view) {
    const id = ++request.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    try {
      const path = selected === "province" ? "province-coverage" : `mission/${selected === "funnel" ? "funnel" : `${selected}${next ? `?${new URLSearchParams({ cursor: next })}` : ""}`}`;
      const response = await fetch(`${origin()}/v1/admin/knowledge/youtube-discovery/${path}`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store", signal: controller.signal });
      if (response.status === 401) {
        signIn();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || id !== request.current) throw new Error("unavailable");
      if (selected === "province") {
        const parsed = parseAdminKnowledgeProvinceCoverageList(body);
        if (!parsed) throw new Error("unsafe");
        setProvinces(parsed.items);
        setItems([]);
        setFunnel(null);
        setCursor(null);
        setUnavailable(false);
        setStatus(`Hiển thị ${parsed.items.length} tỉnh, thành phố hiện hành.`);
        requestAnimationFrame(() => heading.current?.focus());
        return;
      }
      if (selected === "funnel") {
        const parsed = parseAdminYoutubeDiscoveryMissionFunnel(body);
        if (!parsed) throw new Error("unsafe");
        setFunnel(parsed);
        setItems([]);
        setCursor(null);
        setUnavailable(false);
        setStatus("Đã tải luồng Discovery hiện tại.");
        return;
      }
      const parsed = selected === "coverage" ? parseAdminYoutubeDiscoveryMissionCoveragePage(body) : selected === "queries" ? parseAdminYoutubeDiscoveryMissionQueryPage(body) : parseAdminYoutubeDiscoveryMissionCandidatePage(body);
      if (!parsed) throw new Error("unsafe");
      const page = parsed.items;
      setFunnel(null);
      setItems((current) => append ? [...current, ...page.filter((entry) => !current.some((existing) => JSON.stringify(existing) === JSON.stringify(entry)))] : page);
      setCursor(parsed.nextCursor);
      setUnavailable(false);
      setStatus(page.length ? `Hiển thị ${append ? items.length + 1 : 1}-${append ? items.length + page.length : page.length} mục.` : "Không có mục phù hợp.");
      requestAnimationFrame(() => append ? more.current?.focus() : heading.current?.focus());
    } catch (error) {
      if ((error as Error).name !== "AbortError" && id === request.current) {
        setUnavailable(true);
        setStatus("Không thể tải dữ liệu Nhu cầu Discovery lúc này.");
      }
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load(null, false, view);
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function select(next: View) {
    const search = new URLSearchParams(window.location.search);
    search.set("view", next);
    window.history.pushState(null, "", `${window.location.pathname}?${search}`);
    setView(next);
  }

  const queries = view === "queries" ? items.filter((item): item is AdminYoutubeDiscoveryQuery => !("actionId" in item) && !("candidateId" in item)) : [];
  return <main className="mx-auto max-w-5xl min-w-0 text-slate-900">
    <header><p className="text-sm font-semibold text-emerald-800">YOUTUBE DISCOVERY</p><h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold outline-none">Nhu cầu Discovery</h1><p className="mt-3 text-slate-600">Theo dõi dữ liệu vận hành an toàn do máy chủ xác nhận.</p></header>
    <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Chọn chế độ Nhu cầu Discovery">{views.map((entry) => <button className="min-h-11 rounded border border-emerald-900 px-4 font-semibold outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800" aria-pressed={view === entry.id} onClick={() => select(entry.id)} type="button" key={entry.id}>{entry.label}</button>)}</div>
    <p aria-live="polite" role="status" className="mt-4 text-sm text-slate-700">{status}</p>
    {unavailable ? <section className="mt-6 border border-amber-700 bg-[#fbf7ed] p-5"><h2 className="font-semibold">Chưa thể tải dữ liệu</h2><button className="mt-4 min-h-11 border border-emerald-900 px-4 font-semibold" onClick={() => void load(null, false)} type="button">Thử lại</button></section> : funnel ? <Funnel value={funnel} /> : <section className="mt-6 overflow-hidden border border-[#b8c4b9] bg-[#fbf7ed]">
      {view === "province" ? <ProvinceCoverage provinces={provinces} setStatus={setStatus} /> : null}
      {view === "queries" ? <><QueryManagement queries={queries} reload={() => load(null, false, "queries")} setStatus={setStatus} /><ImmediateRuns queries={queries} setStatus={setStatus} /></> : null}
      {view !== "province" && view !== "queries" ? <div className="grid gap-px">{items.map((item) => <MissionRow item={item} key={"actionId" in item ? `${item.actionId}:${"candidateId" in item ? item.candidateId : ""}` : item.id} />)}</div> : null}
      {!items.length && !provinces.length && !loading && view !== "queries" && view !== "province" ? <p className="p-5 text-slate-600">Không có dữ liệu cho chế độ này.</p> : null}
      {cursor ? <div className="border-t border-[#b8c4b9] p-4"><button ref={more} disabled={loading} className="min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-50" onClick={() => void load(cursor, true)} type="button">{loading ? "Đang tải" : "Tải thêm"}</button></div> : null}
    </section>}
  </main>;
}

export function ProvinceCoverage({ provinces, setStatus }: { provinces: AdminKnowledgeProvinceCoverage[]; setStatus: (value: string) => void }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ProvinceSuggestionState>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const detail = provinces.find((item) => item.canonicalProvinceId === selectedId) ?? null;
  const filtered = filterProvinceCoverage(provinces, search);
  const firstError = useRef<HTMLInputElement>(null);
  const suggestionRequest = useRef(0);
  const immediateConfirmation = useRef<string | null>(null);
  const [immediateQuery, setImmediateQuery] = useState<AdminYoutubeDiscoveryQuery | null>(null);

  function choose(item: AdminKnowledgeProvinceCoverage) {
    suggestionRequest.current += 1;
    setSelectedId(item.canonicalProvinceId);
    setSuggestion(null);
    setSuggesting(false);
    setCreating(false);
    setImmediateQuery(null);
    immediateConfirmation.current = null;
    setErrors({});
    setStatus(`Đã chọn ${item.currentName}.`);
  }

  async function requestSuggestion() {
    if (!detail || suggesting || creating) return;
    const id = ++suggestionRequest.current;
    const canonicalProvinceId = detail.canonicalProvinceId;
    setSuggesting(true);
    setSuggestion(null);
    setStatus(`Đang đề xuất truy vấn cho ${detail.currentName}.`);
    try {
      const result = await post("/v1/admin/knowledge/youtube-discovery/province-suggestion", { canonicalProvinceId });
      const parsed = parseAdminKnowledgeProvinceSuggestion(result.body);
      if (!result.response.ok || !parsed || parsed.canonicalProvinceId !== canonicalProvinceId) throw new Error("suggestion");
      if (id !== suggestionRequest.current) return;
      setSuggestion({ value: parsed, draft: { queryText: parsed.queryText, priority: "50", cadenceMinutes: "60" } });
      setStatus("Đã có đề xuất. Bạn có thể sửa, bỏ qua hoặc tạo truy vấn theo lịch.");
    } catch {
      if (id !== suggestionRequest.current) return;
      setStatus("Chưa thể tạo đề xuất lúc này. Hãy thử lại; không có truy vấn hoặc lượt chạy nào được tạo.");
    } finally {
      if (id === suggestionRequest.current) setSuggesting(false);
    }
  }

  async function createQuery(immediate = false) {
    if (!suggestion || creating) return;
    const id = suggestionRequest.current;
    const next = validateMissionQueryDraft(suggestion.draft, true);
    if (Object.keys(next).length) {
      setErrors(next);
      requestAnimationFrame(() => firstError.current?.focus());
      return;
    }
    setCreating(true);
    setStatus(immediate ? "Đang tạo truy vấn và xếp lượt chạy ngay." : "Đang tạo truy vấn theo lịch.");
    try {
      let query: AdminYoutubeDiscoveryQuery | null = null;
      if (immediate && immediateQuery) query = immediateQuery;
      else {
        const result = await post("/v1/admin/knowledge/youtube-discovery", { queryText: suggestion.draft.queryText.trim(), priority: Number(suggestion.draft.priority), cadenceMinutes: Number(suggestion.draft.cadenceMinutes) });
        query = parseAdminYoutubeDiscoveryQuery(result.body);
        if (!result.response.ok || !query || id !== suggestionRequest.current) throw new Error("create");
        if (immediate) setImmediateQuery(query);
      }
      if (immediate) {
        const confirmationKey = immediateConfirmation.current ?? crypto.randomUUID().replaceAll("-", "");
        immediateConfirmation.current = confirmationKey;
        const admitted = await post(`/v1/admin/knowledge/youtube-discovery/${encodeURIComponent(query.id)}/immediate`, { confirmationKey });
        if (!admitted.response.ok || !parseAdminYoutubeDiscoveryImmediateRunResult(admitted.body)) throw new Error("immediate");
        immediateConfirmation.current = null;
        setImmediateQuery(null);
      }
      setSuggestion(null);
      setErrors({});
      setStatus(immediate ? "Đã tạo truy vấn và xếp lượt chạy ngay. Worker sẽ xử lý khi còn năng lực." : "Đã tạo truy vấn theo lịch. Truy vấn chưa chạy ngay.");
    } catch {
      if (id !== suggestionRequest.current) return;
      setErrors({ queryText: "Không thể tạo truy vấn. Bản nháp vẫn được giữ lại." });
      setStatus("Không thể tạo truy vấn. Bản nháp vẫn được giữ lại.");
      requestAnimationFrame(() => firstError.current?.focus());
    } finally {
      if (id === suggestionRequest.current) setCreating(false);
    }
  }

  return <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <section aria-label="Danh sách tỉnh, thành phố" className="min-w-0"><label className="grid gap-1 font-semibold">Tìm tỉnh, thành phố hoặc tên cũ<input className="min-h-11 border border-slate-500 bg-white px-3 font-normal" value={search} onChange={(event) => setSearch(event.target.value)} /></label><p className="mt-2 text-sm text-slate-600">Tìm theo tên hiện hành hoặc tên cũ chính thức.</p><div className="mt-3 grid gap-2">{filtered.map((item) => <button aria-pressed={selectedId === item.canonicalProvinceId} className="min-h-11 border border-[#b8c4b9] bg-white px-3 py-2 text-left outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800" key={item.canonicalProvinceId} onClick={() => choose(item)} type="button"><span className="block font-semibold">{item.currentName}</span><span className="block text-sm text-slate-600">{item.legacyNames.length ? `Tên cũ: ${item.legacyNames.join(", ")}` : "Không có tên cũ chính thức"}</span></button>)}</div>{!filtered.length ? <p className="mt-3 text-slate-600">Không tìm thấy tỉnh, thành phố phù hợp.</p> : null}</section>
    <section aria-label="Chi tiết phủ sóng tỉnh, thành phố" className="min-w-0 border-t border-[#b8c4b9] pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">{detail ? <><h2 className="text-xl font-bold">{detail.currentName}</h2><p className="mt-2 text-sm text-slate-600">Mã phạm vi ổn định: {detail.canonicalProvinceId}</p><dl className="mt-4 grid gap-2 text-sm"><div><dt className="font-semibold">Tên cũ chính thức</dt><dd>{detail.legacyNames.length ? detail.legacyNames.join(", ") : "Không có"}</dd></div><div><dt className="font-semibold">Chủ đề Knowledge đang hoạt động</dt><dd>{detail.topics.length ? detail.topics.map((topic) => `${topic.topic}: ${topic.count}`).join("; ") : "Chưa có"}</dd></div><div><dt className="font-semibold">Ngữ cảnh cần làm mới</dt><dd>{detail.freshnessSensitiveCount}</dd></div><div><dt className="font-semibold">Cập nhật gần nhất</dt><dd>{detail.latestUpdatedAt ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(detail.latestUpdatedAt)) : "Chưa có"}</dd></div></dl><p className="mt-4 text-sm text-slate-600">Các số liệu này là ngữ cảnh vận hành, không phải kết luận đủ hoặc thiếu phủ sóng.</p><button className="mt-4 min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-50" disabled={suggesting || creating} onClick={() => void requestSuggestion()} type="button">{suggesting ? "Đang đề xuất" : "Đề xuất truy vấn tiếng Việt"}</button>{suggestion ? <SuggestionEditor suggestion={suggestion} errors={errors} creating={creating} locked={immediateQuery !== null} firstError={firstError} onChange={(draft) => setSuggestion({ ...suggestion, draft })} onDismiss={() => { suggestionRequest.current += 1; setSuggestion(null); setImmediateQuery(null); setErrors({}); setStatus("Đã bỏ qua đề xuất này. Không có thay đổi nào được lưu."); }} onCreate={() => void createQuery()} onImmediate={() => void createQuery(true)} /> : null}</> : <p className="text-slate-600">Chọn một tỉnh, thành phố để xem chi tiết và yêu cầu đề xuất tạm thời.</p>}</section>
  </div>;
}

function SuggestionEditor({ suggestion, errors, creating, locked, firstError, onChange, onDismiss, onCreate, onImmediate }: { suggestion: NonNullable<ProvinceSuggestionState>; errors: Partial<Record<keyof Draft, string>>; creating: boolean; locked: boolean; firstError: React.RefObject<HTMLInputElement | null>; onChange: (draft: Draft) => void; onDismiss: () => void; onCreate: () => void; onImmediate: () => void }) {
  const draft = suggestion.draft;
  return <section className="mt-5 border-t border-[#b8c4b9] pt-4" aria-label="Đề xuất truy vấn tạm thời"><h3 className="font-semibold">Đề xuất tạm thời</h3><p className="mt-2 text-sm"><span className="font-semibold">Nhu cầu:</span> {suggestion.value.need}</p><p className="mt-2 text-sm"><span className="font-semibold">Lý do:</span> {suggestion.value.reason}</p><label className="mt-3 grid gap-1 font-semibold">Truy vấn YouTube<input disabled={locked} ref={errors.queryText ? firstError : undefined} aria-describedby={errors.queryText ? "province-query-error" : undefined} aria-invalid={Boolean(errors.queryText)} className="min-h-11 border border-slate-500 bg-white px-3 font-normal disabled:opacity-60" value={draft.queryText} onChange={(event) => onChange({ ...draft, queryText: event.target.value })} /></label>{errors.queryText ? <p id="province-query-error" className="mt-1 text-sm text-red-800">{errors.queryText}</p> : null}<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 font-semibold">Ưu tiên<input disabled={locked} inputMode="numeric" className="min-h-11 border border-slate-500 bg-white px-3 font-normal disabled:opacity-60" value={draft.priority} onChange={(event) => onChange({ ...draft, priority: event.target.value })} /></label><label className="grid gap-1 font-semibold">Chu kỳ (phút)<input disabled={locked} inputMode="numeric" className="min-h-11 border border-slate-500 bg-white px-3 font-normal disabled:opacity-60" value={draft.cadenceMinutes} onChange={(event) => onChange({ ...draft, cadenceMinutes: event.target.value })} /></label></div><div className="mt-4 flex flex-wrap gap-2"><button className="min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-50" disabled={creating || locked} onClick={onCreate} type="button">{creating ? "Đang tạo" : "Tạo truy vấn"}</button><button className="min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-50" disabled={creating} onClick={onImmediate} type="button">Chạy ngay</button><button className="min-h-11 border border-slate-500 px-4 font-semibold" onClick={onDismiss} type="button">Bỏ qua đề xuất</button></div><p className="mt-3 text-sm text-slate-600">Tạo truy vấn chỉ lập lịch đề xuất; Chạy ngay tạo truy vấn rồi xếp một lượt Discovery có xác nhận rõ ràng.</p></section>;
}

function QueryManagement({ queries, reload, setStatus }: { queries: AdminYoutubeDiscoveryQuery[]; reload: () => Promise<void>; setStatus: (value: string) => void }) {
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, Partial<Record<keyof Draft, string>>>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const commands = useRef<Record<string, number>>({});
  const firstError = useRef<HTMLInputElement>(null);
  async function submit(key: string, path: string, body: object, draft: Draft | null, create = false) {
    const id = (commands.current[key] ?? 0) + 1;
    commands.current[key] = id;
    setPending((current) => ({ ...current, [key]: true }));
    setStatus("Đang cập nhật truy vấn.");
    try {
      const result = await post(path, body);
      if (!result.response.ok || !parseAdminYoutubeDiscoveryQuery(result.body) || id !== commands.current[key]) throw new Error("command");
      if (create) setCreateDraft(emptyDraft);
      setErrors((current) => ({ ...current, [key]: {} }));
      setStatus("Đã cập nhật truy vấn. Đang làm mới danh sách.");
      await reload();
    } catch {
      if (id !== commands.current[key]) return;
      setStatus("Không thể cập nhật truy vấn. Bản nháp vẫn được giữ lại.");
      if (draft) {
        const next = validateMissionQueryDraft(draft, create);
        setErrors((current) => ({ ...current, [key]: Object.keys(next).length ? next : { queryText: "Yêu cầu bị từ chối hoặc không khả dụng. Hãy thử lại." } }));
        requestAnimationFrame(() => firstError.current?.focus());
      }
    } finally {
      if (id === commands.current[key]) setPending((current) => ({ ...current, [key]: false }));
    }
  }
  function create() { const next = validateMissionQueryDraft(createDraft, true); if (Object.keys(next).length) { setErrors((current) => ({ ...current, create: next })); requestAnimationFrame(() => firstError.current?.focus()); return; } void submit("create", "/v1/admin/knowledge/youtube-discovery", { queryText: createDraft.queryText.trim(), priority: Number(createDraft.priority), cadenceMinutes: Number(createDraft.cadenceMinutes) }, createDraft, true); }
  return <div className="p-4"><h2 className="font-semibold">Quản lý truy vấn</h2><form className="mt-3 grid gap-3 border-b border-[#b8c4b9] pb-5" noValidate onSubmit={(event) => { event.preventDefault(); create(); }}><label className="grid gap-1">Truy vấn mới<input ref={errors.create?.queryText ? firstError : undefined} aria-describedby={errors.create?.queryText ? "create-query-error" : undefined} aria-invalid={Boolean(errors.create?.queryText)} className="min-h-11 border border-slate-500 px-3" value={createDraft.queryText} onChange={(event) => setCreateDraft({ ...createDraft, queryText: event.target.value })} /></label>{errors.create?.queryText ? <p id="create-query-error" className="text-sm text-red-800">{errors.create.queryText}</p> : null}<div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1">Ưu tiên<input inputMode="numeric" className="min-h-11 border border-slate-500 px-3" value={createDraft.priority} onChange={(event) => setCreateDraft({ ...createDraft, priority: event.target.value })} /></label><label className="grid gap-1">Chu kỳ (phút)<input inputMode="numeric" className="min-h-11 border border-slate-500 px-3" value={createDraft.cadenceMinutes} onChange={(event) => setCreateDraft({ ...createDraft, cadenceMinutes: event.target.value })} /></label></div><button className="min-h-11 w-fit border border-emerald-900 px-4 font-semibold disabled:opacity-50" disabled={pending.create} type="submit">{pending.create ? "Đang tạo" : "Tạo truy vấn"}</button></form><div className="grid gap-px">{queries.map((query) => { const draft = drafts[query.id] ?? { queryText: query.queryText, priority: String(query.priority), cadenceMinutes: String(query.cadenceMinutes) }; const editing = query.origin === "operator"; const textKey = `${query.id}:text`; const priorityKey = `${query.id}:priority`; const toggleKey = `${query.id}:toggle`; return <article className="min-w-0 border-b border-[#b8c4b9] py-4" key={query.id}><p className="font-semibold">{query.origin === "system" ? "Hệ thống đề xuất" : "Operator tạo"}</p><p className="mt-1 text-sm">{query.reason} · Ưu tiên {query.priority} · {query.pausedReason === "global" ? "Tạm dừng do Discovery đang tắt" : query.pausedReason === "operator" ? "Tạm dừng bởi operator" : query.nextRunAt ?? "Chưa có lịch chạy"}</p>{editing ? <label className="mt-3 grid gap-1">Nội dung truy vấn<input aria-label={`Nội dung truy vấn ${query.id}`} className="min-h-11 border border-slate-500 px-3" value={draft.queryText} onChange={(event) => setDrafts({ ...drafts, [query.id]: { ...draft, queryText: event.target.value } })} /></label> : <p className="mt-3 text-sm text-slate-600">Nội dung hệ thống không thể chỉnh sửa: {query.queryText}</p>}<div className="mt-3 flex flex-wrap gap-2">{editing ? <button disabled={pending[textKey]} className="min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-50" onClick={() => { const next = validateMissionQueryDraft(draft, false); if (next.queryText) { setErrors({ ...errors, [query.id]: next }); return; } void submit(textKey, `/v1/admin/knowledge/youtube-discovery/${encodeURIComponent(query.id)}/text`, { queryText: draft.queryText.trim() }, draft); }} type="button">{pending[textKey] ? "Đang lưu" : "Lưu nội dung"}</button> : null}<button disabled={pending[priorityKey]} className="min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-50" onClick={() => { const next = validateMissionQueryDraft({ ...draft, queryText: "" }, false); if (next.priority) { setErrors({ ...errors, [query.id]: next }); return; } void submit(priorityKey, `/v1/admin/knowledge/youtube-discovery/${encodeURIComponent(query.id)}/priority`, { priority: Number(draft.priority) }, draft); }} type="button">{pending[priorityKey] ? "Đang lưu" : "Cập nhật ưu tiên"}</button><label className="sr-only" htmlFor={`priority-${query.id}`}>Ưu tiên {query.id}</label><input id={`priority-${query.id}`} inputMode="numeric" className="min-h-11 w-20 border border-slate-500 px-3" value={draft.priority} onChange={(event) => setDrafts({ ...drafts, [query.id]: { ...draft, priority: event.target.value } })} /><button disabled={pending[toggleKey]} className="min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-50" onClick={() => void submit(toggleKey, `/v1/admin/knowledge/youtube-discovery/${encodeURIComponent(query.id)}/${query.enabled ? "pause" : "resume"}`, {}, null)} type="button">{pending[toggleKey] ? "Đang lưu" : query.enabled ? "Tạm dừng" : "Tiếp tục"}</button></div>{errors[query.id]?.queryText || errors[query.id]?.priority ? <p className="mt-2 text-sm text-red-800">{errors[query.id].queryText ?? errors[query.id].priority}</p> : null}</article>; })}</div>{!queries.length ? <p className="pt-4 text-slate-600">Chưa có truy vấn.</p> : null}</div>;
}

function MissionRow({ item }: { item: AdminYoutubeDiscoveryMissionCoverage | AdminYoutubeDiscoveryQuery | AdminYoutubeDiscoveryMissionCandidate }) { if ("candidateId" in item) return <article className="min-w-0 border-b border-[#b8c4b9] p-4"><p className="font-semibold">Ứng viên hạng {item.rank + 1}</p><p className="mt-1 text-sm">Trạng thái xem xét: {item.candidateState === "unavailable" ? "Chưa có khuyến nghị hiện tại" : item.candidateState}; khuyến nghị: {item.recommendation === "unavailable" ? "Chưa có" : item.recommendation}; giai đoạn: {item.rankingState}.</p><p className="mt-2 text-sm text-slate-600">Xếp hạng chỉ là bối cảnh vận hành, không phải xác minh, bằng chứng, hoàn tất thu thập hoặc phê duyệt xuất bản.</p>{item.reviewAvailable && item.recommendationId ? <Link className="mt-3 inline-flex min-h-11 items-center border border-emerald-900 px-4 font-semibold" href={`/knowledge/youtube-discovery-review?recommendationId=${encodeURIComponent(item.recommendationId)}`}>Mở hàng đợi xem xét</Link> : <p className="mt-2 text-sm text-slate-600">Bản ghi truy vết không có hành động xem xét.</p>}</article>; if ("actionId" in item) return <article className="min-w-0 border-b border-[#b8c4b9] p-4"><p className="font-semibold">Nhu cầu ưu tiên {item.priority}</p><dl className="mt-1 grid gap-1 text-sm"><div><dt className="inline font-semibold">Hành lang: </dt><dd className="inline">{item.corridor ?? "Chưa có"}</dd></div><div><dt className="inline font-semibold">Địa điểm: </dt><dd className="inline">{item.location ?? "Chưa có"}</dd></div><div><dt className="inline font-semibold">Tuyến: </dt><dd className="inline">{item.routeSegment ?? "Chưa có"}</dd></div><div><dt className="inline font-semibold">Phân loại: </dt><dd className="inline">{item.taxonomy ?? "Chưa có"}</dd></div><div><dt className="inline font-semibold">Độ mới: </dt><dd className="inline">{item.freshness === "unavailable" ? "Không khả dụng" : item.freshness === "sensitive" ? "Nhạy cảm" : "Ổn định"}</dd></div><div><dt className="inline font-semibold">Xung đột: </dt><dd className="inline">{item.conflict === "unavailable" ? "Không khả dụng" : item.conflict === "present" ? "Có" : "Không có"}</dd></div><div><dt className="inline font-semibold">Nhu cầu: </dt><dd className="inline">Không khả dụng</dd></div><div><dt className="inline font-semibold">Mùa vụ: </dt><dd className="inline">Không khả dụng</dd></div></dl><Link className="mt-3 inline-flex min-h-11 items-center border border-emerald-900 px-4 font-semibold" href={`/knowledge/youtube-discovery/mission/${encodeURIComponent(item.actionId)}`}>Xem dấu vết</Link></article>; return null; }

export function ImmediateRuns({ queries, setStatus }: { queries: AdminYoutubeDiscoveryQuery[]; setStatus: (value: string) => void }) {
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, NonNullable<ReturnType<typeof parseAdminYoutubeDiscoveryQueryProgress>>>>({});
  const confirmations = useRef<Record<string, string>>({});
  async function refresh(query: AdminYoutubeDiscoveryQuery, runId?: string) {
    const suffix = runId ? `?${new URLSearchParams({ runId })}` : "";
    const response = await fetch(`${origin()}/v1/admin/knowledge/youtube-discovery/${encodeURIComponent(query.id)}/progress${suffix}`, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() }, cache: "no-store" });
    if (response.status === 401) signIn();
    const value = parseAdminYoutubeDiscoveryQueryProgress(await response.json().catch(() => null));
    if (!response.ok || !value) throw new Error("progress");
    if (runId && value.run.runId !== runId) throw new Error("progress_run");
    setProgress((current) => ({ ...current, [query.id]: value }));
    return value;
  }
  async function run(query: AdminYoutubeDiscoveryQuery) {
    setPending((value) => ({ ...value, [query.id]: true }));
    const confirmationKey = confirmations.current[query.id] ?? crypto.randomUUID().replaceAll("-", "");
    confirmations.current[query.id] = confirmationKey;
    try { const result = await post(`/v1/admin/knowledge/youtube-discovery/${encodeURIComponent(query.id)}/immediate`, { confirmationKey }); const admitted = parseAdminYoutubeDiscoveryImmediateRunResult(result.body); if (!result.response.ok || !admitted) throw new Error("admission"); const value = await refresh(query, admitted.runId); if (confirmations.current[query.id] === confirmationKey) delete confirmations.current[query.id]; setStatus(value.run.state === "queued" ? "Đã xếp lượt chạy ngay. Worker sẽ xử lý khi còn năng lực." : "Đã cập nhật tiến độ Discovery."); }
    catch { setStatus("Chưa thể chạy ngay. Discovery có thể đang tạm dừng hoặc yêu cầu không khả dụng."); }
    finally { setPending((value) => ({ ...value, [query.id]: false })); }
  }
  return <section className="border-t border-[#b8c4b9] p-4" aria-label="Chạy Discovery ngay"><h2 className="font-semibold">Chạy ngay</h2><div className="mt-3 grid gap-3">{queries.map((query) => { const value = progress[query.id]; const label = value?.run.nextRetryAt ? "Đang thử lại" : value?.run.state === "queued" ? "Đang chờ" : value?.run.state === "running" ? "Đang chạy" : value?.run.state === "completed" ? "Hoàn tất" : value?.run.state === "failed" ? "Thất bại" : value?.run.state === "cancelled" ? "Đã hủy" : null; return <article className="border border-[#b8c4b9] bg-white p-3" key={query.id}><p className="font-semibold">{query.queryText}</p><div className="mt-3 flex flex-wrap gap-2"><button className="min-h-11 border border-emerald-900 px-4 font-semibold disabled:opacity-50" disabled={!query.enabled || query.pausedReason !== null || pending[query.id]} onClick={() => void run(query)} type="button">{pending[query.id] ? "Đang xếp lượt chạy" : "Chạy ngay"}</button><button className="min-h-11 border border-slate-500 px-4 font-semibold disabled:opacity-50" disabled={pending[query.id]} onClick={() => void refresh(query, value?.run.runId).then((next) => setStatus(next.run.state === "queued" ? "Lượt chạy đang chờ Worker xử lý." : "Đã làm mới tiến độ Discovery.")).catch(() => setStatus("Chưa thể làm mới tiến độ Discovery lúc này."))} type="button">Làm mới tiến độ</button></div>{!query.enabled || query.pausedReason ? <p className="mt-2 text-sm text-slate-600">Truy vấn hoặc Discovery đang tạm dừng.</p> : null}{value && label ? <div className="mt-3 text-sm" aria-live="polite"><p>{label}. Bắt đầu: {value.run.claimedAt ? new Intl.DateTimeFormat("vi-VN", { timeStyle: "short" }).format(new Date(value.run.claimedAt)) : "chưa nhận"}; kết thúc: {value.run.terminalAt ? new Intl.DateTimeFormat("vi-VN", { timeStyle: "short" }).format(new Date(value.run.terminalAt)) : "chưa có"}. Ứng viên: {value.candidateCount}. Công việc: chờ {value.jobs.queued}, đang xử lý {value.jobs.running}, thử lại {value.jobs.retrying}, hoàn tất {value.jobs.completed}, thất bại {value.jobs.failed}, đã hủy {value.jobs.cancelled}.</p><p className="mt-1">Lần thử: {value.run.retryCount}.{value.run.nextRetryAt ? ` Sẽ thử lại sau ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value.run.nextRetryAt))}.` : value.run.state === "failed" ? " Lượt chạy đã thất bại an toàn; hãy tạo xác nhận mới khi đã xử lý nguyên nhân." : ""}</p>{value.reviewAvailable ? <Link className="mt-3 inline-flex min-h-11 items-center border border-emerald-900 px-4 font-semibold" href="/knowledge/youtube-discovery-review">Xem video</Link> : null}</div> : null}</article>; })}</div></section>;
}

function Funnel({ value }: { value: NonNullable<ReturnType<typeof parseAdminYoutubeDiscoveryMissionFunnel>> }) {
  const counts = { discovered: value.discovered, enriched: value.enriched, triaged: value.triaged, recommended: value.recommended, pendingReview: value.pendingReview, accepted: value.accepted, deferred: value.deferred, skipped: value.skipped };
  return <section className="mt-6 border border-[#b8c4b9] bg-[#fbf7ed] p-5"><h2 className="font-semibold">Luồng Discovery hiện tại</h2><p className="mt-2 text-sm text-slate-600">Tại thời điểm {new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value.asOf))}</p><dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(counts).map(([key, count]) => <div key={key}><dt className="text-sm text-slate-600">{key}</dt><dd className="text-xl font-bold">{count}</dd></div>)}</dl><YoutubeDiscoveryMissionQuality quality={value.quality} /></section>;
}

export function YoutubeDiscoveryMissionQuality({ quality }: { quality: NonNullable<ReturnType<typeof parseAdminYoutubeDiscoveryMissionFunnel>>["quality"] }) {
  const thresholdMet = quality.vietnameseFitPercent !== null && quality.vietnameseFitPercent >= 80;
  return <section className="mt-6 border-t pt-4"><h3 className="font-semibold">Chất lượng ưu tiên tiếng Việt</h3><p className="mt-2 text-sm text-slate-600">Tỷ lệ “Nên xem xét” phù hợp tiếng Việt: {quality.vietnameseFitPercent === null ? "Chưa có mẫu" : `${quality.vietnameseFitPercent}%`}. Mẫu: {quality.vietnameseConsider}/{quality.considered}. Ngưỡng yêu cầu: 80% ({quality.vietnameseFitPercent === null ? "chưa đánh giá" : thresholdMet ? "đạt" : "chưa đạt"}).</p><p className="mt-2 text-sm text-slate-600">Nguồn ngoại ngữ bổ sung: {quality.foreignFallback}. Video quá ngắn: {quality.tooShort}; chưa rõ thời lượng: {quality.durationUnknown}; không phải tiếng Việt: {quality.nonVietnamese}; chưa rõ ngôn ngữ: {quality.languageUnknown}; vi phạm thời lượng: {quality.durationViolations}.</p></section>;
}
