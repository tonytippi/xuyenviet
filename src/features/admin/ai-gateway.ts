import "server-only";

import { asc, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { aiGatewayModels, aiGatewayModelPurposeValues, type AiGatewayModelPurpose } from "@/db/schema";
import { archiveAiGatewayModel, createAiGatewayModel, setDefaultAiGatewayModel, updateAiGatewayModel } from "@/features/admin/actions";
import { requireExactAdminSession } from "@/server/auth";

const priceMicrosPerCurrencyUnit = 1_000_000;
const tokenPricingUnit = 1_000_000;
const maxPriceMicros = 2_147_483_647;

export type AdminAiGatewayModel = typeof aiGatewayModels.$inferSelect;

export async function listAdminAiGatewayModels(): Promise<AdminAiGatewayModel[]> {
  await requireExactAdminSession();

  return getDb()
    .select()
    .from(aiGatewayModels)
    .orderBy(asc(aiGatewayModels.purpose), desc(aiGatewayModels.active), desc(aiGatewayModels.defaultForPurpose), asc(aiGatewayModels.displayLabel), asc(aiGatewayModels.gatewayModelName));
}

export async function createAiGatewayModelForm(formData: FormData) {
  "use server";

  try {
    await createAiGatewayModel(parseModelForm(formData));
  } catch (error) {
    redirectToGatewayPage("error", getSafeErrorMessage(error));
  }

  redirectToGatewayPage("success", "Đã thêm model AI Gateway.");
}

export async function updateAiGatewayModelForm(formData: FormData) {
  "use server";

  try {
    const modelId = getRequiredFormString(formData, "modelId", "AI Gateway model id");
    await updateAiGatewayModel(modelId, parseModelForm(formData));
  } catch (error) {
    redirectToGatewayPage("error", getSafeErrorMessage(error));
  }

  redirectToGatewayPage("success", "Đã cập nhật model và giá token.");
}

export async function setDefaultAiGatewayModelForm(formData: FormData) {
  "use server";

  try {
    const modelId = getRequiredFormString(formData, "modelId", "AI Gateway model id");
    await setDefaultAiGatewayModel(modelId);
  } catch (error) {
    redirectToGatewayPage("error", getSafeErrorMessage(error));
  }

  redirectToGatewayPage("success", "Đã chọn model mặc định cho mục đích này.");
}

export async function archiveAiGatewayModelForm(formData: FormData) {
  "use server";

  try {
    const modelId = getRequiredFormString(formData, "modelId", "AI Gateway model id");
    await archiveAiGatewayModel(modelId);
  } catch (error) {
    redirectToGatewayPage("error", getSafeErrorMessage(error));
  }

  redirectToGatewayPage("success", "Đã lưu model vào trạng thái lưu trữ.");
}

export function formatPricePerMillionTokens(priceMicros: number | null) {
  if (priceMicros === null) {
    return "Chưa cấu hình";
  }

  const whole = Math.floor(priceMicros / priceMicrosPerCurrencyUnit);
  const fraction = String(priceMicros % priceMicrosPerCurrencyUnit).padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function parseModelForm(formData: FormData) {
  return {
    gatewayModelName: getRequiredFormString(formData, "gatewayModelName", "Gateway model name"),
    displayLabel: getRequiredFormString(formData, "displayLabel", "Display label"),
    purpose: parsePurpose(getRequiredFormString(formData, "purpose", "Purpose")),
    active: formData.get("active") === "on",
    defaultForPurpose: formData.get("defaultForPurpose") === "on",
    supportsTextInput: formData.get("supportsTextInput") === "on",
    supportsImageInput: formData.get("supportsImageInput") === "on",
    supportsImageOutput: formData.get("supportsImageOutput") === "on",
    supportsEmbeddings: formData.get("supportsEmbeddings") === "on",
    supportsExtraction: formData.get("supportsExtraction") === "on",
    supportsEvaluation: formData.get("supportsEvaluation") === "on",
    supportsStreaming: formData.get("supportsStreaming") === "on",
    supportsCachePricing: formData.get("supportsCachePricing") === "on",
    pricingCurrency: getOptionalFormString(formData, "pricingCurrency")?.toUpperCase() ?? null,
    inputTokenPriceMicros: parsePricePerMillionTokens(formData, "inputTokenPrice"),
    outputTokenPriceMicros: parsePricePerMillionTokens(formData, "outputTokenPrice"),
    cacheReadTokenPriceMicros: parsePricePerMillionTokens(formData, "cacheReadTokenPrice"),
    cacheWriteTokenPriceMicros: parsePricePerMillionTokens(formData, "cacheWriteTokenPrice"),
    pricingUnitTokens: tokenPricingUnit,
    pricingVersion: getOptionalFormString(formData, "pricingVersion"),
    pricingEffectiveAt: parseEffectiveAt(getOptionalFormString(formData, "pricingEffectiveAt")),
  };
}

function parsePricePerMillionTokens(formData: FormData, field: string) {
  const value = getOptionalFormString(formData, field);

  if (value === null) {
    return null;
  }

  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new Error("Giá mỗi 1 triệu token phải là số không âm, tối đa 6 chữ số thập phân.");
  }

  const [wholePart, decimalPart = ""] = value.split(".");
  const micros = Number(`${wholePart}${decimalPart.padEnd(6, "0")}`);

  if (!Number.isSafeInteger(micros) || micros > maxPriceMicros) {
    throw new Error("Giá mỗi 1 triệu token vượt giới hạn cho phép.");
  }

  return micros;
}

function parsePurpose(value: string): AiGatewayModelPurpose {
  if (!aiGatewayModelPurposeValues.includes(value as AiGatewayModelPurpose)) {
    throw new Error("Purpose của model AI Gateway không hợp lệ.");
  }

  return value as AiGatewayModelPurpose;
}

function parseEffectiveAt(value: string | null) {
  if (value === null) {
    return new Date();
  }

  const date = new Date(`${value}Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Thời điểm hiệu lực của giá không hợp lệ.");
  }

  return date;
}

function getRequiredFormString(formData: FormData, field: string, label: string) {
  const value = getOptionalFormString(formData, field);

  if (value === null) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function getOptionalFormString(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Không thể lưu cấu hình AI Gateway.";
}

function redirectToGatewayPage(kind: "error" | "success", message: string): never {
  revalidatePath("/admin/ai-gateway");
  const parameters = new URLSearchParams({ [kind]: message });
  redirect(`/admin/ai-gateway?${parameters.toString()}`);
}
