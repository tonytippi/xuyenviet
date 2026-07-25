"use server";

import { redirect } from "next/navigation";

import { deleteOwnedConversation } from "@/features/chat-trips/conversations";
import {
  applyApprovedTripChange,
  dismissTripChangeProposal,
} from "@/features/chat-trips/trip-change-proposals";
import { createTripProject, deleteOwnedTripProject } from "@/features/chat-trips/trip-projects";

export type CreateTripProjectFormState = { error?: string };
export type DeleteConversationActionState = { success: boolean; error?: string; reason?: "not_found" };
export type DeleteTripProjectActionState = { success: boolean; error?: string; reason?: "not_found" };

// Story 7.5: typed result states for the apply/dismiss server actions. The
// expire command is NOT a user action — it is invoked only by reads and the
// scheduled worker.
export type ApplyTripChangeProposalActionState = {
  success: boolean;
  reason?: "refresh_required" | "not_found" | "expired";
  aggregateVersion?: number;
  proposalStatus?: "applied";
  error?: string;
};

export type DismissTripChangeProposalActionState = {
  success: boolean;
  reason?: "not_found";
  proposalStatus?: "dismissed";
  error?: string;
};

const stringFieldNames = ["title", "origin", "destination", "startDate", "endDate", "travelers", "notes"] as const;

export async function createTripProjectFromForm(
  _previous: CreateTripProjectFormState | undefined,
  formData: FormData,
): Promise<CreateTripProjectFormState> {
  const values: Record<(typeof stringFieldNames)[number], string> = {
    title: "",
    origin: "",
    destination: "",
    startDate: "",
    endDate: "",
    travelers: "",
    notes: "",
  };

  for (const name of stringFieldNames) {
    const value = formData.get(name);

    if (typeof value !== "string") {
      return { error: "Dữ liệu dự án không hợp lệ. Vui lòng gửi lại bằng biểu mẫu." };
    }

    values[name] = value;
  }

  let project: { id: string };

  try {
    project = await createTripProject(values);
  } catch (error) {
    if (error instanceof Error && /Authentication required/.test(error.message)) {
      redirect("/sign-in?next=/ai-ask");
    }

    return { error: "Không thể tạo dự án chuyến đi. Vui lòng kiểm tra tên dự án và các trường ngày (định dạng YYYY-MM-DD)." };
  }

  redirect(`/ai-ask?tripProjectId=${encodeURIComponent(project.id)}`);
}

export async function deleteConversationAction(conversationId: string): Promise<DeleteConversationActionState> {
  const result = await deleteOwnedConversation(conversationId);

  if (result.reason === "unauthenticated") {
    redirect("/sign-in?next=/ai-ask");
  }

  if (!result.success) {
    return { success: false, error: "Không thể xoá cuộc trò chuyện lúc này. Vui lòng thử lại.", reason: result.reason === "not_found" ? "not_found" : undefined };
  }

  return { success: true };
}

export async function deleteTripProjectAction(tripProjectId: string): Promise<DeleteTripProjectActionState> {
  const result = await deleteOwnedTripProject(tripProjectId);

  if (result.reason === "unauthenticated") {
    redirect("/sign-in?next=/ai-ask");
  }

  if (!result.success) {
    return { success: false, error: "Không thể xoá dự án chuyến đi lúc này. Vui lòng thử lại.", reason: result.reason === "not_found" ? "not_found" : undefined };
  }

  return { success: true };
}

// Story 7.5: owner-confirmed apply server action. Mirrors the
// deleteTripProjectAction shape (typed result state, redirect to sign-in on
// unauthenticated). Does NOT redirect on refresh_required / expired /
// not_found — the client must reconcile the proposal card in place.
export async function applyTripChangeProposalAction(
  input: { tripProjectId: string; proposalId: string },
): Promise<ApplyTripChangeProposalActionState> {
  const result = await applyApprovedTripChange(input);

  if (!result.success && result.reason === "unauthenticated") {
    redirect("/sign-in?next=/ai-ask");
  }

  if (result.success) {
    return { success: true, aggregateVersion: result.aggregateVersion, proposalStatus: "applied" };
  }

  // Map failure reasons to safe Vietnamese copy that names the failure safely.
  if (result.reason === "refresh_required") {
    return { success: false, reason: "refresh_required", error: "Kế hoạch đã thay đổi — vui lòng làm mới đề xuất." };
  }
  // not_found / expired both surface as "no longer available" safely.
  return { success: false, reason: result.reason === "expired" ? "expired" : "not_found", error: "Đề xuất không còn khả dụng." };
}

// Story 7.5: owner-confirmed dismiss server action. Mirrors the apply action's
// shape. Does NOT redirect on not_found — the client reconciles in place.
export async function dismissTripChangeProposalAction(
  input: { tripProjectId: string; proposalId: string },
): Promise<DismissTripChangeProposalActionState> {
  const result = await dismissTripChangeProposal(input);

  if (!result.success && result.reason === "unauthenticated") {
    redirect("/sign-in?next=/ai-ask");
  }

  if (result.success) {
    return { success: true, proposalStatus: "dismissed" };
  }

  return { success: false, reason: "not_found", error: "Đề xuất không còn khả dụng." };
}
