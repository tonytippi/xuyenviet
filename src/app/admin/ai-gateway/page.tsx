import {
  archiveAiGatewayModelForm,
  createAiGatewayModelForm,
  formatPricePerMillionTokens,
  listAdminAiGatewayModels,
  setDefaultAiGatewayModelForm,
  updateAiGatewayModelForm,
  type AdminAiGatewayModel,
} from "@/features/admin/ai-gateway";
import { aiGatewayModelPurposeValues, type AiGatewayModelPurpose } from "@/db/schema";

export const dynamic = "force-dynamic";

type AdminAiGatewayPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

const purposeLabels: Record<AiGatewayModelPurpose, string> = {
  ai_ask_initial_answer: "AI Ask",
  extraction: "Trích xuất",
  embeddings: "Embeddings",
  evaluation: "Đánh giá",
};

const capabilityLabels = [
  ["supportsTextInput", "Text"],
  ["supportsImageInput", "Ảnh vào"],
  ["supportsImageOutput", "Ảnh ra"],
  ["supportsEmbeddings", "Embeddings"],
  ["supportsExtraction", "Trích xuất"],
  ["supportsEvaluation", "Đánh giá"],
  ["supportsStreaming", "Streaming"],
  ["supportsCachePricing", "Cache pricing"],
] as const satisfies ReadonlyArray<[keyof AdminAiGatewayModel, string]>;

export default async function AdminAiGatewayPage({ searchParams }: AdminAiGatewayPageProps) {
  const [models, params] = await Promise.all([listAdminAiGatewayModels(), searchParams]);

  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#10251e] p-6 text-white shadow-[0_24px_70px_rgba(16,37,30,0.24)] sm:p-8">
        <div className="absolute -right-20 -top-24 size-72 rounded-full bg-[#e5bd82]/25 blur-3xl" />
        <div className="relative max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e5bd82]">AI Gateway operations</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Model, năng lực và giá token.</h1>
          <p className="mt-4 text-lg leading-8 text-[#c9d7d1]">Mỗi giá được nhập và hiển thị theo 1 triệu token. Hệ thống lưu giá chính xác dưới dạng micros, không đưa API key hoặc cấu hình bí mật vào màn hình này.</p>
        </div>
      </section>

      {params.success ? <Notice tone="success">{params.success}</Notice> : null}
      {params.error ? <Notice tone="error">{params.error}</Notice> : null}

      <section className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/80 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Catalog</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#17342c]">Thêm model AI Gateway</h2>
          </div>
          <p className="text-sm text-[#4f625a]">Chỉ model active, đúng capability mới có thể đặt mặc định.</p>
        </div>
        <ModelForm action={createAiGatewayModelForm} submitLabel="Thêm model" />
      </section>

      <section className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/80 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Configured models</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#17342c]">{models.length} model đã cấu hình</h2>
          </div>
          <p className="text-sm text-[#4f625a]">Lưu trữ model để giữ liên kết usage lịch sử.</p>
        </div>

        {models.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-[#cdbb99] bg-[#fbf7ed] p-6 leading-7 text-[#4f625a]">Chưa có model nào. Thêm model đầu tiên để AI Ask, pipeline trích xuất, embeddings hoặc eval có thể chọn cấu hình mặc định phù hợp.</p>
        ) : (
          <div className="mt-6 grid gap-4">
            {models.map((model) => <ModelCard key={model.id} model={model} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function ModelCard({ model }: { model: AdminAiGatewayModel }) {
  const activeCapabilities = capabilityLabels.filter(([key]) => model[key]);

  return (
    <article className="rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-[#17342c]">{model.displayLabel}</h3>
            <StatusBadge active={model.active} defaultForPurpose={model.defaultForPurpose} />
          </div>
          <p className="mt-1 break-all font-mono text-sm text-[#4f625a]">{model.gatewayModelName}</p>
          <p className="mt-3 text-sm font-semibold text-[#8c4f13]">{purposeLabels[model.purpose]}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeCapabilities.length === 0 ? <span className="rounded-full bg-[#eee9df] px-3 py-1 text-xs font-semibold text-[#4f625a]">Chưa khai báo capability</span> : activeCapabilities.map(([, label]) => <span className="rounded-full bg-[#dce9df] px-3 py-1 text-xs font-semibold text-[#1f5f46]" key={label}>{label}</span>)}
          </div>
        </div>
        <dl className="grid min-w-60 gap-2 text-sm">
          <PriceRow label="Input" value={model.inputTokenPriceMicros} currency={model.pricingCurrency} unit={model.pricingUnitTokens} />
          <PriceRow label="Output" value={model.outputTokenPriceMicros} currency={model.pricingCurrency} unit={model.pricingUnitTokens} />
          <PriceRow label="Cache read" value={model.cacheReadTokenPriceMicros} currency={model.pricingCurrency} unit={model.pricingUnitTokens} />
          <PriceRow label="Cache write" value={model.cacheWriteTokenPriceMicros} currency={model.pricingCurrency} unit={model.pricingUnitTokens} />
        </dl>
      </div>

      <p className="mt-4 text-sm leading-6 text-[#4f625a]">Bảng giá: {model.pricingVersion ?? "chưa đặt version"} · hiệu lực {formatDateTime(model.pricingEffectiveAt)} · đơn vị lưu trữ {model.pricingUnitTokens.toLocaleString("vi-VN")} token.</p>

      {model.pricingUnitTokens === 1_000_000 ? (
        <details className="mt-5 rounded-2xl border border-[#d8c9ad] bg-white/80 p-4">
          <summary className="cursor-pointer font-semibold text-[#17342c]">Chỉnh sửa model và bảng giá</summary>
          <ModelForm action={updateAiGatewayModelForm} model={model} submitLabel="Lưu thay đổi" />
        </details>
      ) : <p className="mt-5 rounded-2xl border border-[#e2d3ba] bg-white/80 p-4 text-sm leading-6 text-[#4f625a]">Bản ghi này đang dùng đơn vị giá cũ. Không thể chỉnh sửa từ màn hình giá theo 1 triệu token để tránh thay đổi sai chi phí; cần chuẩn hóa dữ liệu trước.</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        {!model.defaultForPurpose && model.active ? <form action={setDefaultAiGatewayModelForm}><input name="modelId" type="hidden" value={model.id} /><button className="min-h-11 rounded-xl border border-[#1f5f46] px-4 text-sm font-semibold text-[#1f5f46] transition hover:bg-[#eaf3ed] focus:outline-none focus:ring-4 focus:ring-[#1f5f46]/20" type="submit">Đặt làm mặc định</button></form> : null}
        {model.active ? <form action={archiveAiGatewayModelForm}><input name="modelId" type="hidden" value={model.id} /><button className="min-h-11 rounded-xl border border-[#b85d45] px-4 text-sm font-semibold text-[#9b321e] transition hover:bg-[#fff0eb] focus:outline-none focus:ring-4 focus:ring-[#b85d45]/20" type="submit">Lưu trữ model</button></form> : null}
      </div>
    </article>
  );
}

function ModelForm({ action, model, submitLabel }: { action: (formData: FormData) => Promise<void>; model?: AdminAiGatewayModel; submitLabel: string }) {
  return (
    <form action={action} className="mt-5 grid gap-4">
      {model ? <input name="modelId" type="hidden" value={model.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TextField defaultValue={model?.gatewayModelName} label="Tên model trên Gateway" name="gatewayModelName" placeholder="openai/gpt-4.1-mini" required />
        <TextField defaultValue={model?.displayLabel} label="Tên hiển thị" name="displayLabel" placeholder="GPT-4.1 mini" required />
        <label className="grid gap-2 text-sm font-semibold text-[#17342c]">Mục đích<select className="min-h-11 rounded-xl border border-[#cdbb99] bg-[#fffdf8] px-3 font-normal" defaultValue={model?.purpose ?? "ai_ask_initial_answer"} name="purpose">{aiGatewayModelPurposeValues.map((purpose) => <option key={purpose} value={purpose}>{purposeLabels[purpose]}</option>)}</select></label>
        <TextField defaultValue={model?.pricingCurrency ?? "USD"} label="Loại tiền" maxLength={8} name="pricingCurrency" placeholder="USD" />
        <TextField defaultValue={model?.pricingVersion ?? ""} label="Version bảng giá" name="pricingVersion" placeholder="2026-07" />
        <label className="grid gap-2 text-sm font-semibold text-[#17342c]">Hiệu lực từ (UTC)<input className="min-h-11 rounded-xl border border-[#cdbb99] bg-[#fffdf8] px-3 font-normal" defaultValue={formatDateTimeLocal(model?.pricingEffectiveAt)} name="pricingEffectiveAt" type="datetime-local" /></label>
      </div>

      <fieldset className="grid gap-3 rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4">
        <legend className="px-2 text-sm font-semibold text-[#17342c]">Giá theo 1 triệu token</legend>
        <p className="text-sm text-[#4f625a]">Nhập số tiền thập phân, tối đa 6 chữ số sau dấu chấm. Để trống khi Gateway chưa có giá loại token đó.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PriceField defaultValue={model?.inputTokenPriceMicros ?? null} label="Input / 1 triệu" name="inputTokenPrice" />
          <PriceField defaultValue={model?.outputTokenPriceMicros ?? null} label="Output / 1 triệu" name="outputTokenPrice" />
          <PriceField defaultValue={model?.cacheReadTokenPriceMicros ?? null} label="Cache read / 1 triệu" name="cacheReadTokenPrice" />
          <PriceField defaultValue={model?.cacheWriteTokenPriceMicros ?? null} label="Cache write / 1 triệu" name="cacheWriteTokenPrice" />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-2xl border border-[#e2d3ba] bg-white/70 p-4">
        <legend className="px-2 text-sm font-semibold text-[#17342c]">Trạng thái và capability</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-3">{[
          ["active", "Đang hoạt động", model?.active ?? true], ["defaultForPurpose", "Mặc định cho mục đích", model?.defaultForPurpose ?? false], ["supportsTextInput", "Text input", model?.supportsTextInput ?? false], ["supportsImageInput", "Image input", model?.supportsImageInput ?? false], ["supportsImageOutput", "Image output", model?.supportsImageOutput ?? false], ["supportsEmbeddings", "Embeddings", model?.supportsEmbeddings ?? false], ["supportsExtraction", "Trích xuất", model?.supportsExtraction ?? false], ["supportsEvaluation", "Đánh giá", model?.supportsEvaluation ?? false], ["supportsStreaming", "Streaming", model?.supportsStreaming ?? false], ["supportsCachePricing", "Cache pricing", model?.supportsCachePricing ?? false],
        ].map(([name, label, checked]) => <label className="flex min-h-8 items-center gap-2 text-sm font-medium text-[#17342c]" key={name as string}><input className="size-4 accent-[#1f5f46]" defaultChecked={checked as boolean} name={name as string} type="checkbox" />{label as string}</label>)}</div>
      </fieldset>

      <button className="min-h-12 w-fit rounded-xl bg-[#1f5f46] px-5 py-3 font-semibold text-white transition hover:bg-[#173f31] focus:outline-none focus:ring-4 focus:ring-[#1f5f46]/30" type="submit">{submitLabel}</button>
    </form>
  );
}

function TextField({ defaultValue, label, name, placeholder, required, maxLength }: { defaultValue?: string; label: string; name: string; placeholder: string; required?: boolean; maxLength?: number }) {
  return <label className="grid gap-2 text-sm font-semibold text-[#17342c]">{label}<input className="min-h-11 rounded-xl border border-[#cdbb99] bg-[#fffdf8] px-3 font-normal" defaultValue={defaultValue} maxLength={maxLength} name={name} placeholder={placeholder} required={required} /></label>;
}

function PriceField({ defaultValue, label, name }: { defaultValue: number | null; label: string; name: string }) {
  return <label className="grid gap-2 text-sm font-semibold text-[#17342c]">{label}<input className="min-h-11 rounded-xl border border-[#cdbb99] bg-[#fffdf8] px-3 font-normal tabular-nums" defaultValue={defaultValue === null ? "" : formatPricePerMillionTokens(defaultValue)} inputMode="decimal" name={name} placeholder="0.000000" /></label>;
}

function PriceRow({ label, value, currency, unit }: { label: string; value: number | null; currency: string | null; unit: number }) {
  return <div className="flex items-baseline justify-between gap-3 rounded-xl bg-white px-3 py-2"><dt className="text-[#4f625a]">{label}</dt><dd className="text-right font-semibold tabular-nums text-[#17342c]">{value === null ? "Chưa cấu hình" : `${formatPricePerMillionTokens(value)} ${currency ?? ""} / ${unit === 1_000_000 ? "1M" : unit.toLocaleString("vi-VN")}`}</dd></div>;
}

function StatusBadge({ active, defaultForPurpose }: { active: boolean; defaultForPurpose: boolean }) {
  if (defaultForPurpose) return <span className="rounded-full bg-[#1f5f46] px-3 py-1 text-xs font-semibold text-white">Mặc định</span>;
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-[#dce9df] text-[#1f5f46]" : "bg-[#eee9df] text-[#4f625a]"}`}>{active ? "Đang hoạt động" : "Đã lưu trữ"}</span>;
}

function Notice({ children, tone }: { children: string; tone: "success" | "error" }) {
  return <p className={`rounded-2xl border p-4 font-semibold ${tone === "success" ? "border-[#86b99a] bg-[#eaf3ed] text-[#1f5f46]" : "border-[#e2a08d] bg-[#fff0eb] text-[#9b321e]"}`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function formatDateTimeLocal(value: Date | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 16);
}
