"use server";

import { redirect } from "next/navigation";

import { rawSourceMaterial, sources } from "@/db/schema";
import { AdminAuthorizationError } from "@/server/auth";
import { runAuditedAdminMutation } from "@/server/mutations";

import { isSourceValidationError, normalizeTravelSourceInput, type TravelSourceInput } from "./sources";

export type SafeSourceResult = Pick<
  typeof sources.$inferSelect,
  "id" | "kind" | "url" | "canonicalUrl" | "label" | "publisher" | "collectedDate" | "sourceType" | "verificationStatus" | "official" | "partner" | "createdAt"
>;

export async function submitTravelSourceForAiReading(input: TravelSourceInput): Promise<SafeSourceResult> {
  return runAuditedAdminMutation({
    audit: {
      operation: "create",
      targetType: "knowledge_source",
      afterSummary: "Operator submitted a travel source for AI reading.",
    },
    action: async (session, transaction) => {
      const values = normalizeTravelSourceInput(input);
      const [source] = await transaction
        .insert(sources)
        .values({ ...values.source, submittedByUserId: session.userId })
        .returning({
          id: sources.id,
          kind: sources.kind,
          url: sources.url,
          canonicalUrl: sources.canonicalUrl,
          label: sources.label,
          publisher: sources.publisher,
          collectedDate: sources.collectedDate,
          sourceType: sources.sourceType,
          verificationStatus: sources.verificationStatus,
          official: sources.official,
          partner: sources.partner,
          createdAt: sources.createdAt,
        });

      await transaction.insert(rawSourceMaterial).values({ ...values.rawMaterial, sourceId: source.id });

      return source;
    },
  });
}

export async function submitTravelSourceForm(formData: FormData) {
  const byteSizeValue = getOptionalFormString(formData, "screenshotByteSize");
  const screenshotFileName = getOptionalFormString(formData, "screenshotFileName");
  const screenshotMimeType = getOptionalFormString(formData, "screenshotMimeType");

  let failureMessage: string | null = null;

  try {
    await submitTravelSourceForAiReading({
      url: getOptionalFormString(formData, "url"),
      label: getOptionalFormString(formData, "label"),
      publisher: getOptionalFormString(formData, "publisher"),
      collectedDate: getOptionalFormString(formData, "collectedDate"),
      rawText: getOptionalFormString(formData, "rawText"),
      copiedCommunityContent: formData.get("copiedCommunityContent") === "on",
      screenshot:
        screenshotFileName || screenshotMimeType || byteSizeValue
          ? {
              fileName: screenshotFileName,
              mimeType: screenshotMimeType,
              byteSize: byteSizeValue ? Number(byteSizeValue) : null,
              storageKey: getOptionalFormString(formData, "screenshotStorageKey"),
            }
          : null,
    });
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    failureMessage = isSourceValidationError(error) && error instanceof Error ? error.message : "Không thể lưu nguồn. Vui lòng kiểm tra lại dữ liệu.";
  }

  if (failureMessage) {
    redirect(`/admin/knowledge/intake?error=${encodeURIComponent(failureMessage)}`);
  }

  redirect("/admin/knowledge/intake?success=1");
}

function getOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() || null : null;
}
