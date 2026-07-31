"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { facebookCaptureReviews, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, sources, type FacebookCaptureReviewStatus } from "@/db/schema";
import { sourceKnowledgeDraftExtractionPromptVersion } from "@/features/ai/prompts";
import { AdminAuthorizationError, requireAdminSession } from "@/server/auth";
import { runAuditedAdminMutation } from "@/server/mutations";

import { isKnowledgeBatchIntakeError, submitKnowledgeSeedUrlBatch as submitKnowledgeSeedUrlBatchService } from "./batch-intake";
import {
  extractKnowledgeDraftsFromSource as extractKnowledgeDraftsFromSourceService,
  isKnowledgeExtractionError,
  type KnowledgeDraftExtractionPreProviderGuard,
} from "./extraction";
import { getAdminFacebookCaptureReviewExtractionTarget } from "./facebook-capture-review-admin";
import { enqueueKnowledgeExtractionJob } from "./extraction-jobs";
import { markFacebookCaptureReviewStatus, markFacebookCaptureReviewStatusInTransaction, reopenFacebookCaptureForRecapture, requestFacebookCaptureRecapture, type FacebookCaptureReviewActor } from "./facebook-capture-review";
import {
  approveKnowledgeDraftBatchInTransaction,
  approveKnowledgeDraft as approveKnowledgeDraftService,
  isKnowledgeDraftReviewError,
  parseKnowledgeDraftFormData,
  rejectKnowledgeDraft as rejectKnowledgeDraftService,
  updateKnowledgeDraft as updateKnowledgeDraftService,
} from "./review";
import { isSourceValidationError, normalizeTravelSourceInput, type TravelSourceInput } from "./sources";
import { appendSourceCaptureVersion } from "./source-captures";
import { rerunKnowledgeIngestionJob } from "./ingestion-jobs";
import { isKnowledgeSuggestionError, suggestKnowledgeFromSourceUrl as suggestKnowledgeFromSourceUrlService } from "./suggestions";
import { resolveKnowledgeRecommendation } from "./recommendations";
import { sealClosedKnowledgeSamplingPolicyForAdmin } from "./sampling-maintenance";
import { removeKnowledgeSource, SourceRemovalError } from "./source-removal";

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

      if (values.capture.rawText) {
        await appendSourceCaptureVersion(transaction, {
          sourceId: source.id,
          captureKind: source.kind,
          rawText: values.capture.rawText,
          metadata: values.capture.metadata,
          file: values.capture.file ?? undefined,
        });
      }

      return source;
    },
  });
}

export async function extractKnowledgeDraftsFromSource(sourceId: string, options: { preProviderGuard?: KnowledgeDraftExtractionPreProviderGuard } = {}) {
  return extractKnowledgeDraftsFromSourceService(sourceId, options);
}

export async function removeKnowledgeSourceForm(formData: FormData) {
  const session = await requireAdminSession();
  const sourceId = getOptionalFormString(formData, "sourceId") ?? "";
  const reason = getOptionalFormString(formData, "reason");
  let result: Awaited<ReturnType<typeof removeKnowledgeSource>> | null = null;
  let error: string | null = null;

  try {
    if (reason !== "withdrawn" && reason !== "inaccessible" && reason !== "removed") throw new SourceRemovalError("Lý do gỡ nguồn không hợp lệ.");
    result = await removeKnowledgeSource({ sourceId, reason, actor: { userId: session.userId, email: session.email } });
  } catch (cause) {
    if (cause instanceof AdminAuthorizationError || (cause instanceof Error && cause.name === "AdminAuthorizationError")) throw cause;
    error = cause instanceof SourceRemovalError ? "Không thể gỡ nguồn này." : "Không thể hoàn tất thao tác gỡ nguồn.";
  }

  if (error) redirect(`/admin/knowledge/intake?removeError=${encodeURIComponent(error)}`);
  redirect(`/admin/knowledge/intake?sourceRemoved=${encodeURIComponent(result?.status === "already_completed" ? "already" : "completed")}`);
}

export async function sealClosedKnowledgeSamplingPolicyForm(formData: FormData) {
  const policyId = getOptionalFormString(formData, "policyId");
  if (policyId) await sealClosedKnowledgeSamplingPolicyForAdmin(policyId);
  redirect("/admin/knowledge/progress");
}

async function markFacebookCaptureExtractionFailed(input: { reviewId: string; actor: FacebookCaptureReviewActor; extractionError: string }) {
  try {
    return await markFacebookCaptureReviewStatus(getDb(), {
      reviewId: input.reviewId,
      status: "extraction_failed",
      actor: input.actor,
      extractionError: input.extractionError,
    });
  } catch (error) {
    const reason = getSafeDatabaseFailureReason(error);
    return { status: "status_update_failed" as const, reason: normalizeSafeRedirectCode(reason) };
  }
}

function getSafeDatabaseFailureReason(error: unknown) {
  const cause = error instanceof Error ? error.cause : null;

  if (isRecord(cause)) {
    const constraint = typeof cause.constraint_name === "string" ? cause.constraint_name : null;
    const code = typeof cause.code === "string" ? cause.code : null;
    if (constraint && code) return `${code}:${constraint}`;
    if (constraint) return constraint;
    if (code) return code;
  }

  return error instanceof Error ? error.message : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeSafeRedirectCode(value: string) {
  return value.replace(/[^a-zA-Z0-9_.:-]+/g, "_").slice(0, 120) || "unknown";
}

export async function updateKnowledgeDraft(draftId: string, formData: FormData) {
  return updateKnowledgeDraftService(draftId, parseKnowledgeDraftFormData(formData));
}

export async function rejectKnowledgeDraft(draftId: string) {
  return rejectKnowledgeDraftService(draftId);
}

export async function approveKnowledgeDraft(draftId: string, expectedUpdatedAt?: string | null) {
  return approveKnowledgeDraftService(draftId, expectedUpdatedAt);
}

export async function suggestKnowledgeFromSourceUrl(sourceId: string) {
  return suggestKnowledgeFromSourceUrlService(sourceId);
}

export async function submitKnowledgeSeedUrlBatch(input: Parameters<typeof submitKnowledgeSeedUrlBatchService>[0]) {
  return submitKnowledgeSeedUrlBatchService(input);
}

export async function markFacebookCaptureReviewStatusAsAdmin(input: {
  reviewId: string;
  status: Exclude<FacebookCaptureReviewStatus, "needs_review">;
  rejectionReason?: string;
  extractionError?: string;
}) {
  const session = await requireAdminSession();
  const actor: FacebookCaptureReviewActor = { userId: session.userId, email: session.email };

  return markFacebookCaptureReviewStatus(getDb(), { ...input, actor });
}

export async function rerunFacebookCanonicalIngestionForm(formData: FormData) {
  const reviewId = getOptionalFormString(formData, "reviewId") ?? "";
  let status: "rerun" | "not_rerunnable" = "not_rerunnable";

  try {
    status = await runAuditedAdminMutation({
        audit: {
          operation: "update",
          targetType: "knowledge_ingestion_job",
          afterSummary: "Operator re-ran Facebook canonical ingestion with the current pipeline.",
        },
        action: async (_session, transaction) => {
          const [review] = await transaction.select({ sourceId: facebookCaptureReviews.sourceId, captureVersionId: facebookCaptureReviews.captureVersionId, ingestionJobId: knowledgeIngestionJobs.id }).from(facebookCaptureReviews).innerJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId)).where(eq(facebookCaptureReviews.id, reviewId)).limit(1);
        if (!review?.captureVersionId) return "not_rerunnable" as const;
        const rerun = await rerunKnowledgeIngestionJob({ jobId: review.ingestionJobId, sourceId: review.sourceId, captureVersionId: review.captureVersionId }, transaction);
        return rerun ? "rerun" as const : "not_rerunnable" as const;
      },
    });
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) throw error;
  }

  redirect(getFacebookCaptureRedirectPath(reviewId, status === "rerun" ? { ingestionRerun: "1" } : { ingestionRerunError: "1" }));
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

export async function approveKnowledgeDraftForm(formData: FormData) {
  await requireAdminSession();

  const draftId = getOptionalFormString(formData, "draftId") ?? "";
  let failureMessage: string | null = null;

  try {
    if (formData.get("approvalConfirmed") !== "on") {
      throw new Error("Vui lòng xác nhận đã kiểm tra nguồn, confidence và freshness trước khi phê duyệt.");
    }

    await approveKnowledgeDraftService(draftId, getOptionalFormString(formData, "updatedAt"));
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    failureMessage = isKnowledgeDraftReviewError(error) && error instanceof Error ? error.message : "Không thể phê duyệt bản nháp này.";
    if (error instanceof Error && error.message.startsWith("Vui lòng xác nhận")) {
      failureMessage = error.message;
    }
  }

  if (failureMessage) {
    redirect(`/admin/knowledge/drafts?error=${encodeURIComponent(failureMessage)}`);
  }

  redirect(`/admin/knowledge/drafts?approved=${encodeURIComponent(draftId)}`);
}

export async function rejectFacebookCaptureReviewForm(formData: FormData) {
  const session = await requireAdminSession();
  const actor: FacebookCaptureReviewActor = { userId: session.userId, email: session.email };
  const reviewId = getOptionalFormString(formData, "reviewId") ?? "";
  const rejectionReason = getOptionalFormString(formData, "rejectionReason") ?? undefined;
  let redirectPath = getFacebookCaptureRedirectPath(reviewId, { rejectError: "Không thể từ chối capture này." });

  try {
    const statusResult = await markFacebookCaptureReviewStatus(getDb(), { reviewId, status: "rejected", actor, rejectionReason });

    if (statusResult.status === "updated") {
      redirectPath = getFacebookCaptureRedirectPath(statusResult.review.id, { rejected: "1" });
    } else {
      redirectPath = getFacebookCaptureRedirectPath(reviewId, { rejectStatus: statusResult.status });
    }
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    redirectPath = getFacebookCaptureRedirectPath(reviewId, { rejectError: "Lý do từ chối không an toàn hoặc capture này không thể từ chối." });
  }

  redirect(redirectPath);
}

export async function reopenFacebookCaptureForRecaptureForm(formData: FormData) {
  const session = await requireAdminSession();
  const actor: FacebookCaptureReviewActor = { userId: session.userId, email: session.email };
  const reviewId = getOptionalFormString(formData, "reviewId") ?? "";
  const reason = getOptionalFormString(formData, "reopenReason") ?? undefined;
  let redirectPath = getFacebookCaptureRedirectPath(reviewId, { reopenError: "Không thể mở lại capture này." });

  try {
    const statusResult = await reopenFacebookCaptureForRecapture(getDb(), { reviewId, actor, reason });

    if (statusResult.status === "updated") {
      redirectPath = getFacebookCaptureRedirectPath(statusResult.review.id, { reopened: "1" });
    } else {
      redirectPath = getFacebookCaptureRedirectPath(reviewId, { reopenStatus: statusResult.status });
    }
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    redirectPath = getFacebookCaptureRedirectPath(reviewId, { reopenError: "Lý do mở lại không an toàn hoặc capture này không thể mở lại." });
  }

  redirect(redirectPath);
}

export async function requestFacebookCaptureRecaptureForm(formData: FormData) {
  const session = await requireAdminSession();
  const actor: FacebookCaptureReviewActor = { userId: session.userId, email: session.email };
  const reviewId = getOptionalFormString(formData, "reviewId") ?? "";
  const reason = getOptionalFormString(formData, "recaptureReason") ?? "Recapture requested by operator";
  let redirectPath = getFacebookCaptureRedirectPath(reviewId, { recaptureError: "Không thể đưa capture này về hàng đợi recapture." });

  try {
    const statusResult = await requestFacebookCaptureRecapture(getDb(), { reviewId, actor, reason });

    if (statusResult.status === "updated") {
      redirectPath = getFacebookCaptureRedirectPath(statusResult.review.id, { recaptureRequested: "1" });
    } else {
      redirectPath = getFacebookCaptureRedirectPath(reviewId, { recaptureStatus: statusResult.status });
    }
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    redirectPath = getFacebookCaptureRedirectPath(reviewId, { recaptureError: "Lý do recapture không an toàn hoặc capture này không thể recapture." });
  }

  redirect(redirectPath);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function extractAndApproveFacebookCaptureDraftsForm(formData: FormData) {
  const session = await requireAdminSession();

  const reviewId = getOptionalFormString(formData, "reviewId") ?? "";
  const returnToQueue = formData.get("returnTo") === "facebook_capture_queue";
  let redirectPath = getFacebookCaptureRedirectPath(reviewId, { approveAllError: "Không thể trích xuất và phê duyệt capture này." });
  let target: Awaited<ReturnType<typeof getAdminFacebookCaptureReviewExtractionTarget>> | null = null;

  try {
    if (formData.get("approveAllConfirmed") !== "on") {
      redirectPath = getFacebookCaptureRedirectPath(reviewId, { approveAllError: "Vui lòng xác nhận đã kiểm tra capture, trust/confidence và freshness trước khi phê duyệt tất cả." });
    } else {
      target = await getAdminFacebookCaptureReviewExtractionTarget(reviewId);

      if (!target) {
        redirectPath = getFacebookCaptureRedirectPath(reviewId, { approveAllError: "Không tìm thấy capture cần trích xuất và phê duyệt." });
      } else if (target.existingCards.some((card) => card.aiPromptVersion === sourceKnowledgeDraftExtractionPromptVersion) && (target.status === "needs_review" || target.status === "extracted")) {
        const extractionTarget = target;
        const existingExtractionCards = extractionTarget.existingCards.filter((card) => card.aiPromptVersion === sourceKnowledgeDraftExtractionPromptVersion);
        const existingDraftIds = existingExtractionCards.filter((card) => card.status === "draft").map((card) => card.id);
        const extractedStatusResult =
          extractionTarget.status === "needs_review" ? await markFacebookCaptureReviewStatus(getDb(), { reviewId: extractionTarget.id, status: "extracted", actor: extractionTarget.actor }) : ({ status: "updated" } as const);

        if (extractedStatusResult.status !== "updated") {
          redirectPath = getFacebookCaptureRedirectPath(extractionTarget.id, { approveAllRecoveryStatus: extractedStatusResult.status, existingCards: String(existingExtractionCards.length) });
        } else {
          let finalStatusFailure: string | null = null;

          try {
            const approvalResult = await getDb().transaction(async (transaction) => {
              const approved = existingDraftIds.length > 0 ? await approveKnowledgeDraftBatchInTransaction(transaction, session, existingDraftIds) : { draftIds: [] };
              const approvedStatusResult = await markFacebookCaptureReviewStatusInTransaction(transaction, { reviewId: extractionTarget.id, status: "extracted_approved", actor: extractionTarget.actor });

              if (approvedStatusResult.status !== "updated") {
                finalStatusFailure = approvedStatusResult.status;
                throw new Error("approve_all_status_transition_failed");
              }

              return approved;
            });

            redirectPath = getFacebookCaptureRedirectPath(extractionTarget.id, { approvedAll: String(approvalResult.draftIds.length), sourceId: extractionTarget.sourceId, recoveredExistingExtraction: "1" });
          } catch (error) {
            if (finalStatusFailure) {
              redirectPath = getFacebookCaptureRedirectPath(extractionTarget.id, { approveAllRecoveryStatus: finalStatusFailure, existingCards: String(existingExtractionCards.length) });
            } else if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
              throw error;
            } else {
              const failureCode = isKnowledgeDraftReviewError(error) && error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "approval_failed";
              redirectPath = getFacebookCaptureRedirectPath(extractionTarget.id, { approvalFailed: "1", approvalError: failureCode, existingCards: String(existingExtractionCards.length) });
            }
          }
        }
      } else if (target.existingCards.some((card) => card.aiPromptVersion === sourceKnowledgeDraftExtractionPromptVersion)) {
        redirectPath = getFacebookCaptureRedirectPath(target.id, { alreadyExtracted: "1", existingCards: String(target.existingCards.length) });
      } else if (target.status !== "needs_review" && target.status !== "extraction_failed") {
        redirectPath = getFacebookCaptureRedirectPath(target.id, { approveAllStatus: target.status, existingCards: String(target.existingCards.length) });
      } else if (target.sourceKind !== "facebook" || target.sourceType !== "community" || !target.rawText?.trim()) {
        redirectPath = getFacebookCaptureRedirectPath(target.id, { approveAllError: "Capture này không đủ điều kiện trích xuất và phê duyệt tất cả." });
      } else {
        const queued = await enqueueKnowledgeExtractionJob({ sourceId: target.sourceId, facebookCaptureReviewId: target.id, mode: "extract_and_approve_all", actor: target.actor });
        redirectPath = getFacebookCaptureRedirectPath(target.id, queued.status === "already_active" ? { approveAllQueued: "1", jobId: queued.job.id, activeJob: "1" } : { approveAllQueued: "1", jobId: queued.job.id });
      }
    }
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    if (isKnowledgeExtractionError(error) && error instanceof Error) {
      const code = "code" in error && typeof error.code === "string" ? error.code : "unknown";
      const detail = "safeDetail" in error && typeof error.safeDetail === "string" ? error.safeDetail : undefined;

      if (code === "already_extracted") {
        const existingCards = target?.existingCards.length ?? 0;
        redirectPath = getFacebookCaptureRedirectPath(target?.id ?? reviewId, { alreadyExtracted: "1", existingCards: String(existingCards) });
      } else {
        let failureStatus = "not_updated";

        if (target?.status === "needs_review") {
          const statusResult = await markFacebookCaptureExtractionFailed({
            reviewId: target.id,
            actor: target.actor,
            extractionError: `Extraction failed: ${code}`,
          });
          failureStatus = statusResult.status;
          const statusReason = "reason" in statusResult && typeof statusResult.reason === "string" ? statusResult.reason : undefined;
          redirectPath = getFacebookCaptureRedirectPath(target?.id ?? reviewId, { approveAllError: "Không thể trích xuất và phê duyệt capture này.", errorCode: code, errorDetail: detail, failureStatus, statusReason });
        } else {
          redirectPath = getFacebookCaptureRedirectPath(target?.id ?? reviewId, { approveAllError: "Không thể trích xuất và phê duyệt capture này.", errorCode: code, errorDetail: detail, failureStatus });
        }
      }
    } else {
      let failureStatus = "not_updated";

      if (target?.status === "needs_review") {
        const statusResult = await markFacebookCaptureExtractionFailed({
          reviewId: target.id,
          actor: target.actor,
          extractionError: "Extraction failed: unknown",
        });
        failureStatus = statusResult.status;
        const statusReason = "reason" in statusResult && typeof statusResult.reason === "string" ? statusResult.reason : undefined;
        redirectPath = getFacebookCaptureRedirectPath(target?.id ?? reviewId, { approveAllError: "Không thể trích xuất và phê duyệt capture này.", failureStatus, statusReason });
      } else {
        redirectPath = getFacebookCaptureRedirectPath(target?.id ?? reviewId, { approveAllError: "Không thể trích xuất và phê duyệt capture này.", failureStatus });
      }
    }
  }

  redirect(returnToQueue ? getFacebookCaptureQueueRedirectPath(redirectPath) : redirectPath);
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

export async function submitKnowledgeSeedUrlBatchForm(formData: FormData) {
  let result: Awaited<ReturnType<typeof submitKnowledgeSeedUrlBatch>> | null = null;
  let failureMessage: string | null = null;

  try {
    result = await submitKnowledgeSeedUrlBatch({
      urls: getOptionalFormString(formData, "batchUrls") ?? "",
      label: getOptionalFormString(formData, "batchLabel"),
      publisher: getOptionalFormString(formData, "batchPublisher"),
      collectedDate: getOptionalFormString(formData, "batchCollectedDate"),
    });
  } catch (error) {
    if (error instanceof AdminAuthorizationError || (error instanceof Error && error.name === "AdminAuthorizationError")) {
      throw error;
    }

    failureMessage = isKnowledgeBatchIntakeError(error) && error instanceof Error ? error.message : "Không thể nạp batch URL. Vui lòng kiểm tra lại dữ liệu.";
  }

  if (failureMessage) {
    redirect(`/admin/knowledge/intake?batchError=${encodeURIComponent(failureMessage)}`);
  }

  if (!result) {
    redirect(`/admin/knowledge/intake?batchError=${encodeURIComponent("Không thể nạp batch URL. Vui lòng thử lại.")}`);
  }

  redirect(
    `/admin/knowledge/intake?batchId=${encodeURIComponent(result.batchId)}&batchTotal=${result.totalItems}&batchPending=${result.pendingCount}&batchFailed=${result.failedCount}&batchDuplicate=${result.duplicateCount}`,
  );
}

export async function resolveKnowledgeRecommendationForm(formData: FormData) {
  const session = await requireAdminSession();
  const recommendationId = getOptionalFormString(formData, "recommendationId") ?? "";
  const action = getOptionalFormString(formData, "action");
  const contentVersion = Number(getOptionalFormString(formData, "contentVersion"));
  const evidenceSetRevision = Number(getOptionalFormString(formData, "evidenceSetRevision"));
  let result: Awaited<ReturnType<typeof resolveKnowledgeRecommendation>> | null = null;
  let error = "";

  try {
    if (!action || !Number.isInteger(contentVersion) || !Number.isInteger(evidenceSetRevision)) throw new Error("invalid_resolution");
    result = await resolveKnowledgeRecommendation({ recommendationId, expectedContentVersion: contentVersion, expectedEvidenceSetRevision: evidenceSetRevision, action: action as Parameters<typeof resolveKnowledgeRecommendation>[0]["action"], actor: { userId: session.userId, email: session.email }, editSummary: getOptionalFormString(formData, "editSummary") ?? undefined, samplingDispositionReason: getOptionalFormString(formData, "samplingDispositionReason") ?? undefined, samplingRationale: getOptionalFormString(formData, "samplingRationale") ?? undefined, highSeverity: formData.get("highSeverity") === "on" });
    if (result.status !== "resolved") error = result.status;
  } catch (caught) {
    if (caught instanceof AdminAuthorizationError || (caught instanceof Error && caught.name === "AdminAuthorizationError")) throw caught;
    error = "not_resolved";
  }

  redirect(`/admin/knowledge/recommendations/${encodeURIComponent(recommendationId)}?${error ? `error=${encodeURIComponent(error)}` : "resolved=1"}`);
}

export async function verifyKnowledgeRecommendationFromQueueForm(formData: FormData) {
  return resolveVerificationRecommendationFromQueue(formData, "verify");
}

export async function promoteKnowledgeRecommendationFromQueueForm(formData: FormData) {
  return resolveVerificationRecommendationFromQueue(formData, "promote");
}

export async function suppressKnowledgeRecommendationFromQueueForm(formData: FormData) {
  return resolveVerificationRecommendationFromQueue(formData, "suppress");
}

async function resolveVerificationRecommendationFromQueue(formData: FormData, action: "verify" | "promote" | "suppress") {
  const session = await requireAdminSession();
  const recommendationId = getOptionalFormString(formData, "recommendationId") ?? "";
  const contentVersion = Number(getOptionalFormString(formData, "contentVersion"));
  const evidenceSetRevision = Number(getOptionalFormString(formData, "evidenceSetRevision"));
  const requestedPage = Number(getOptionalFormString(formData, "page"));
  const page = Number.isSafeInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
  const reason = getOptionalFormString(formData, "reason");
  let error = "";

  try {
    if (!Number.isInteger(contentVersion) || !Number.isInteger(evidenceSetRevision)) throw new Error("invalid_resolution");
    const [recommendation] = await getDb().select({ reason: knowledgeRecommendations.reason }).from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, recommendationId)).limit(1);
    if (recommendation?.reason !== "verification") throw new Error("invalid_resolution");
    const result = await resolveKnowledgeRecommendation({ recommendationId, expectedContentVersion: contentVersion, expectedEvidenceSetRevision: evidenceSetRevision, action, actor: { userId: session.userId, email: session.email } });
    if (result.status !== "resolved") error = result.status;
  } catch (caught) {
    if (caught instanceof AdminAuthorizationError || (caught instanceof Error && caught.name === "AdminAuthorizationError")) throw caught;
    error = "not_resolved";
  }

  const query = new URLSearchParams({ page: String(page) });
  if (reason) query.set("reason", reason);
  if (error) query.set("error", error);
  redirect(`/admin/knowledge/recommendations?${query.toString()}`);
}

export async function verifyFacebookCaptureCandidatesForm(formData: FormData) {
  const session = await requireAdminSession();
  const reviewId = getOptionalFormString(formData, "reviewId") ?? "";
  const requestedApprovals = formData.getAll("approval").flatMap((value) => {
    if (typeof value !== "string") return [];
    const [recommendationId, contentVersion, evidenceSetRevision] = value.split(":");
    const parsedContentVersion = Number(contentVersion);
    const parsedEvidenceSetRevision = Number(evidenceSetRevision);
    return recommendationId && Number.isInteger(parsedContentVersion) && Number.isInteger(parsedEvidenceSetRevision) ? [{ recommendationId, contentVersion: parsedContentVersion, evidenceSetRevision: parsedEvidenceSetRevision }] : [];
  });
  const approvals = [...new Map(requestedApprovals.map((approval) => [approval.recommendationId, approval])).values()];
  let approved = 0;
  let unavailable = 0;

  try {
    if (!reviewId || approvals.length === 0) throw new Error("invalid_request");
    const requestedRecommendationIds = [...new Set(approvals.map((approval) => approval.recommendationId))];
    const candidates = await getDb().select({ recommendationId: knowledgeRecommendations.id })
      .from(facebookCaptureReviews)
      .innerJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, facebookCaptureReviews.captureVersionId))
      .innerJoin(knowledgeIngestionCandidates, eq(knowledgeIngestionCandidates.ingestionJobId, knowledgeIngestionJobs.id))
      .innerJoin(knowledgeRecommendations, eq(knowledgeRecommendations.knowledgeCardId, knowledgeIngestionCandidates.knowledgeCardId))
      .where(and(eq(facebookCaptureReviews.id, reviewId), inArray(knowledgeRecommendations.id, requestedRecommendationIds), eq(knowledgeIngestionCandidates.stage, "verify_first"), eq(knowledgeRecommendations.reason, "verification"), inArray(knowledgeRecommendations.status, ["open", "in_review"])));
    const candidateByRecommendationId = new Map(candidates.map((candidate) => [candidate.recommendationId, candidate]));
    for (const approval of approvals) {
      const candidate = candidateByRecommendationId.get(approval.recommendationId);
      if (!candidate) {
        unavailable += 1;
        continue;
      }
      const result = await resolveKnowledgeRecommendation({ recommendationId: approval.recommendationId, expectedContentVersion: approval.contentVersion, expectedEvidenceSetRevision: approval.evidenceSetRevision, action: "verify", actor: { userId: session.userId, email: session.email } });
      if (result.status !== "resolved") {
        unavailable += 1;
        continue;
      }
      approved += 1;
    }
  } catch (caught) {
    if (caught instanceof AdminAuthorizationError || (caught instanceof Error && caught.name === "AdminAuthorizationError")) throw caught;
    unavailable = approvals.length || 1;
  }

  redirect(getFacebookCaptureRedirectPath(reviewId, { verifyCandidatesApproved: approved ? String(approved) : undefined, verifyCandidatesUnavailable: unavailable ? String(unavailable) : undefined }));
}

function getOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() || null : null;
}

function getFacebookCaptureRedirectPath(reviewId: string, params: Record<string, string | undefined>) {
  const pathReviewId = encodeURIComponent(reviewId || "unknown");
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return `/admin/knowledge/facebook-captures/${pathReviewId}${query ? `?${query}` : ""}`;
}

function getFacebookCaptureQueueRedirectPath(detailPath: string) {
  const detailUrl = new URL(detailPath, "https://xuyenviet.internal");
  const params = new URLSearchParams({ status: "needs_review" });

  for (const key of ["approveAllQueued", "jobId"]) {
    const value = detailUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }

  return `/admin/knowledge/facebook-captures?${params.toString()}`;
}
