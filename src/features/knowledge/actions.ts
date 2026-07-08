"use server";

import { redirect } from "next/navigation";

import { rawSourceMaterial, sources } from "@/db/schema";
import { AdminAuthorizationError } from "@/server/auth";
import { runAuditedAdminMutation } from "@/server/mutations";

import { extractKnowledgeDraftsFromSource as extractKnowledgeDraftsFromSourceService, isKnowledgeExtractionError } from "./extraction";
import {
  isKnowledgeDraftReviewError,
  parseKnowledgeDraftFormData,
  rejectKnowledgeDraft as rejectKnowledgeDraftService,
  updateKnowledgeDraft as updateKnowledgeDraftService,
} from "./review";
import { isSourceValidationError, normalizeTravelSourceInput, type TravelSourceInput } from "./sources";
import { isKnowledgeSuggestionError, suggestKnowledgeFromSourceUrl as suggestKnowledgeFromSourceUrlService } from "./suggestions";

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

export async function extractKnowledgeDraftsFromSource(sourceId: string) {
  return extractKnowledgeDraftsFromSourceService(sourceId);
}

export async function updateKnowledgeDraft(draftId: string, formData: FormData) {
  return updateKnowledgeDraftService(draftId, parseKnowledgeDraftFormData(formData));
}

export async function rejectKnowledgeDraft(draftId: string) {
  return rejectKnowledgeDraftService(draftId);
}

export async function suggestKnowledgeFromSourceUrl(sourceId: string) {
  return suggestKnowledgeFromSourceUrlService(sourceId);
}

export async function updateKnowledgeDraftForm(formData: FormData) {
  const draftId = getOptionalFormString(formData, "draftId") ?? "";
  let failureMessage: string | null = null;

  try {
    await updateKnowledgeDraft(draftId, formData);
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    failureMessage = isKnowledgeDraftReviewError(error) && error instanceof Error ? error.message : "Không thể lưu bản nháp. Vui lòng kiểm tra lại dữ liệu.";
  }

  if (failureMessage) {
    if (!draftId) {
      redirect(`/admin/knowledge/drafts?error=${encodeURIComponent(failureMessage)}`);
    }

    redirect(`/admin/knowledge/drafts/${encodeURIComponent(draftId)}?error=${encodeURIComponent(failureMessage)}`);
  }

  redirect(`/admin/knowledge/drafts/${encodeURIComponent(draftId)}?saved=1`);
}

export async function rejectKnowledgeDraftForm(formData: FormData) {
  const draftId = getOptionalFormString(formData, "draftId") ?? "";
  let failureMessage: string | null = null;

  try {
    await rejectKnowledgeDraft(draftId);
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    failureMessage = isKnowledgeDraftReviewError(error) && error instanceof Error ? error.message : "Không thể từ chối bản nháp này.";
  }

  if (failureMessage) {
    if (!draftId) {
      redirect(`/admin/knowledge/drafts?error=${encodeURIComponent(failureMessage)}`);
    }

    redirect(`/admin/knowledge/drafts/${encodeURIComponent(draftId)}?error=${encodeURIComponent(failureMessage)}`);
  }

  redirect("/admin/knowledge/drafts?rejected=1");
}

export async function extractKnowledgeDraftsFromSourceForm(formData: FormData) {
  let result: Awaited<ReturnType<typeof extractKnowledgeDraftsFromSource>> | null = null;
  let failureMessage: string | null = null;

  try {
    result = await extractKnowledgeDraftsFromSource(getOptionalFormString(formData, "sourceId") ?? "");
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    failureMessage = isKnowledgeExtractionError(error) && error instanceof Error ? error.message : "Không thể trích xuất bản nháp từ nguồn này.";
  }

  if (failureMessage) {
    redirect(`/admin/knowledge/intake?extractError=${encodeURIComponent(failureMessage)}`);
  }

  redirect(`/admin/knowledge/intake?extracted=${result?.draftCount ?? 0}&sourceId=${encodeURIComponent(result?.sourceId ?? "")}`);
}

export async function suggestKnowledgeFromSourceUrlForm(formData: FormData) {
  let result: Awaited<ReturnType<typeof suggestKnowledgeFromSourceUrl>> | null = null;
  let failureMessage: string | null = null;

  try {
    result = await suggestKnowledgeFromSourceUrl(getOptionalFormString(formData, "sourceId") ?? "");
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    failureMessage = isKnowledgeSuggestionError(error) && error instanceof Error ? error.message : "Không thể tạo gợi ý create/update từ URL này.";
  }

  if (failureMessage) {
    redirect(`/admin/knowledge/intake?suggestError=${encodeURIComponent(failureMessage)}`);
  }

  redirect(`/admin/knowledge/intake?suggested=${result?.suggestionCount ?? 0}&suggestionActions=${encodeURIComponent(result?.actions.join(",") ?? "")}&sourceId=${encodeURIComponent(result?.sourceId ?? "")}`);
}

export async function submitTravelSourceForm(formData: FormData) {
  const byteSizeValue = getOptionalFormString(formData, "screenshotByteSize");
  const screenshotFileName = getOptionalFormString(formData, "screenshotFileName");
  const screenshotMimeType = getOptionalFormString(formData, "screenshotMimeType");

  let failureMessage: string | null = null;

  let source: Awaited<ReturnType<typeof submitTravelSourceForAiReading>> | null = null;

  try {
    source = await submitTravelSourceForAiReading({
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

  redirect(`/admin/knowledge/intake?success=1&sourceId=${encodeURIComponent(source?.id ?? "")}`);
}

function getOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() || null : null;
}
