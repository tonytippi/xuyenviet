"use client";

import { useEffect, useState, type FormEvent } from "react";
import { aiGatewayModelPurposes, parseAdminAiGatewayModel, type AdminAiGatewayModel, type AdminAiGatewayModelInput } from "@xuyenviet/contracts";

const capabilities = ["supportsTextInput", "supportsImageInput", "supportsImageOutput", "supportsEmbeddings", "supportsExtraction", "supportsEvaluation", "supportsStreaming", "supportsCachePricing"] as const;
const priceFields = ["inputTokenPriceMicros", "outputTokenPriceMicros", "cacheReadTokenPriceMicros", "cacheWriteTokenPriceMicros"] as const;
const maximumMicros = 2_147_483_647;

type ModelForm = Omit<AdminAiGatewayModelInput, (typeof priceFields)[number] | "pricingCurrency" | "pricingEffectiveAt" | "pricingVersion"> & Record<(typeof priceFields)[number], string> & { pricingCurrency: string; pricingEffectiveAt: string; pricingVersion: string };

function apiOrigin() {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (!origin) throw new Error("NEXT_PUBLIC_API_ORIGIN is required.");
  return origin;
}

function signIn() {
  window.location.assign(`${apiOrigin()}/auth/google?${new URLSearchParams({ returnUrl: `${window.location.origin}/ai-models` })}`);
}

function localDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 16);
}

export function decimalToMicros(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) throw new Error("invalid decimal price");
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(6, "0"));
  if (!Number.isSafeInteger(whole) || whole > Math.floor((maximumMicros - fraction) / 1_000_000)) throw new Error("price exceeds supported range");
  return whole * 1_000_000 + fraction;
}

function microsToDecimal(value: number | null) {
  return value === null ? "" : `${Math.floor(value / 1_000_000)}.${String(value % 1_000_000).padStart(6, "0")}`.replace(/\.0+$/, "");
}

function blank(): ModelForm {
  return { gatewayModelName: "", displayLabel: "", purpose: "ai_ask_initial_answer", active: true, defaultForPurpose: false, supportsTextInput: true, supportsImageInput: false, supportsImageOutput: false, supportsEmbeddings: false, supportsExtraction: false, supportsEvaluation: false, supportsStreaming: false, supportsCachePricing: false, pricingCurrency: "USD", inputTokenPriceMicros: "", outputTokenPriceMicros: "", cacheReadTokenPriceMicros: "", cacheWriteTokenPriceMicros: "", pricingUnitTokens: 1_000_000, pricingVersion: "", pricingEffectiveAt: localDateTime(new Date().toISOString()) };
}

function formFor(model: AdminAiGatewayModel): ModelForm {
  const input = Object.fromEntries(Object.entries(model).filter(([key]) => key !== "id")) as AdminAiGatewayModelInput;
  return { ...input, pricingCurrency: model.pricingCurrency ?? "", pricingVersion: model.pricingVersion ?? "", inputTokenPriceMicros: microsToDecimal(model.inputTokenPriceMicros), outputTokenPriceMicros: microsToDecimal(model.outputTokenPriceMicros), cacheReadTokenPriceMicros: microsToDecimal(model.cacheReadTokenPriceMicros), cacheWriteTokenPriceMicros: microsToDecimal(model.cacheWriteTokenPriceMicros), pricingEffectiveAt: localDateTime(model.pricingEffectiveAt) };
}

function inputFor(form: ModelForm): AdminAiGatewayModelInput {
  return { ...form, pricingCurrency: form.pricingCurrency.trim() || null, pricingVersion: form.pricingVersion.trim() || null, inputTokenPriceMicros: decimalToMicros(form.inputTokenPriceMicros), outputTokenPriceMicros: decimalToMicros(form.outputTokenPriceMicros), cacheReadTokenPriceMicros: decimalToMicros(form.cacheReadTokenPriceMicros), cacheWriteTokenPriceMicros: decimalToMicros(form.cacheWriteTokenPriceMicros), pricingEffectiveAt: new Date(form.pricingEffectiveAt).toISOString() };
}

function ModelFields({ form, setForm }: { form: ModelForm; setForm: (next: ModelForm) => void }) {
  return <>
    <input className="rounded border p-2" placeholder="Gateway model name" required value={form.gatewayModelName} onChange={(event) => setForm({ ...form, gatewayModelName: event.target.value })} />
    <input className="rounded border p-2" placeholder="Tên hiển thị" required value={form.displayLabel} onChange={(event) => setForm({ ...form, displayLabel: event.target.value })} />
    <select className="rounded border p-2" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value as ModelForm["purpose"] })}>{aiGatewayModelPurposes.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}</select>
    <div className="flex flex-wrap gap-3">{(["active", "defaultForPurpose", ...capabilities] as const).map((key) => <label key={key}><input checked={form[key]} type="checkbox" onChange={(event) => setForm({ ...form, [key]: event.target.checked })} /> {key}</label>)}</div>
    <fieldset className="grid gap-3 rounded border p-3 sm:grid-cols-2"><legend className="px-1">Giá token</legend>
      <input className="rounded border p-2" maxLength={16} onChange={(event) => setForm({ ...form, pricingCurrency: event.target.value.toUpperCase() })} placeholder="Tiền tệ (USD)" value={form.pricingCurrency} />
      <input className="rounded border p-2" min="1" onChange={(event) => setForm({ ...form, pricingUnitTokens: Number(event.target.value) })} required type="number" value={form.pricingUnitTokens} />
      <input className="rounded border p-2" maxLength={500} onChange={(event) => setForm({ ...form, pricingVersion: event.target.value })} placeholder="Phiên bản giá" value={form.pricingVersion} />
      <input className="rounded border p-2" onChange={(event) => setForm({ ...form, pricingEffectiveAt: event.target.value })} required type="datetime-local" value={form.pricingEffectiveAt} />
      {priceFields.map((key) => <label className="grid gap-1" key={key}>{key}<input className="rounded border p-2" inputMode="decimal" onChange={(event) => setForm({ ...form, [key]: event.target.value })} pattern="(0|[1-9][0-9]*)(\.[0-9]{1,6})?" placeholder="Giá theo đơn vị, ví dụ 1.25" value={form[key]} /></label>)}
    </fieldset>
  </>;
}

export function AiModelCatalog() {
  const [models, setModels] = useState<AdminAiGatewayModel[]>([]);
  const [form, setForm] = useState<ModelForm>(blank);
  const [editing, setEditing] = useState<AdminAiGatewayModel | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(path: string, method = "GET", body?: unknown) {
    const headers: Record<string, string> = { "x-request-id": crypto.randomUUID() };
    if (method !== "GET") {
      const csrfResponse = await fetch(`${apiOrigin()}/auth/csrf`, { credentials: "include", headers, cache: "no-store" });
      if (csrfResponse.status === 401) { signIn(); throw new Error("signin"); }
      const csrfBody: unknown = await csrfResponse.json().catch(() => null);
      const csrf = csrfBody && typeof csrfBody === "object" && typeof (csrfBody as { csrfToken?: unknown }).csrfToken === "string" ? (csrfBody as { csrfToken: string }).csrfToken : null;
      if (!csrfResponse.ok || !csrf) throw new Error("csrf unavailable");
      headers["X-XuyenViet-CSRF"] = csrf;
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${apiOrigin()}${path}`, { method, credentials: "include", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result: unknown = await response.json().catch(() => null);
    if (response.status === 401) { signIn(); throw new Error("signin"); }
    if (!response.ok) throw new Error("request failed");
    return result;
  }

  async function load() {
    const result = await request("/v1/admin/ai-models");
    if (!Array.isArray(result)) throw new Error("catalog unavailable");
    const parsed = result.map(parseAdminAiGatewayModel);
    if (parsed.some((item) => !item)) throw new Error("catalog unavailable");
    setModels(parsed as AdminAiGatewayModel[]);
  }

  useEffect(() => {
    void load().catch(() => setStatus("Không thể tải catalog AI Gateway."));
    // The initial catalog read intentionally occurs once; mutations refresh it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setStatus("");
    try {
      const input = inputFor(form);
      await request(editing ? `/v1/admin/ai-models/${encodeURIComponent(editing.id)}` : "/v1/admin/ai-models", editing ? "PUT" : "POST", input);
      await load();
      setEditing(null); setForm(blank());
      setStatus(editing ? "Đã cập nhật model AI Gateway." : "Đã thêm model AI Gateway.");
    } catch { setStatus("Không thể lưu model. Kiểm tra dữ liệu và thử lại."); } finally { setBusy(false); }
  }

  async function command(model: AdminAiGatewayModel, action: "default" | "archive") {
    setBusy(true); setStatus("");
    try {
      await request(`/v1/admin/ai-models/${encodeURIComponent(model.id)}/${action}`, "POST", {});
      await load();
      setStatus(action === "default" ? "Đã đặt model mặc định." : "Đã lưu trữ model.");
    } catch { setStatus("Không thể cập nhật model."); } finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-6xl p-4 text-slate-900 sm:p-8"><header><p className="text-sm font-semibold text-emerald-800">AI GATEWAY OPERATIONS</p><h1 className="mt-2 text-3xl font-bold">Model, năng lực và giá token</h1></header><p className="mt-4" role="status">{status}</p>
    <form className="mt-6 grid gap-3 rounded-xl border p-4" onSubmit={submit}><h2 className="font-semibold">{editing ? `Sửa ${editing.displayLabel}` : "Thêm model"}</h2><ModelFields form={form} setForm={setForm} /><div className="flex gap-2"><button className="rounded bg-emerald-800 px-4 py-2 text-white disabled:opacity-50" disabled={busy} type="submit">{editing ? "Lưu thay đổi" : "Thêm model"}</button>{editing ? <button className="rounded border px-4 py-2" disabled={busy} onClick={() => { setEditing(null); setForm(blank()); }} type="button">Hủy</button> : null}</div></form>
    <section className="mt-6 grid gap-3">{models.map((model) => <article className="rounded-xl border p-4" key={model.id}><strong>{model.displayLabel}</strong><p className="font-mono text-sm">{model.gatewayModelName}</p><p>{model.purpose} · {model.active ? "Đang hoạt động" : "Đã lưu trữ"}{model.defaultForPurpose ? " · Mặc định" : ""}</p><p className="text-sm">{model.pricingCurrency ?? "Không định giá"} · đơn vị {model.pricingUnitTokens.toLocaleString()} token · {model.pricingVersion ?? "Không có phiên bản"}</p><div className="mt-3 flex flex-wrap gap-2"><button className="rounded border px-3 py-1" disabled={busy} onClick={() => { setEditing(model); setForm(formFor(model)); }} type="button">Sửa</button>{model.active && !model.defaultForPurpose ? <button className="rounded border px-3 py-1" disabled={busy} onClick={() => void command(model, "default")} type="button">Đặt mặc định</button> : null}{model.active ? <button className="rounded border px-3 py-1" disabled={busy} onClick={() => void command(model, "archive")} type="button">Lưu trữ</button> : null}</div></article>)}</section>
  </main>;
}
