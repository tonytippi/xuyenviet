import "server-only";

import {
  approveKnowledgeDraft as approveKnowledgeDraftInDatabase,
  approveKnowledgeDraftBatch as approveKnowledgeDraftBatchInDatabase,
  approveKnowledgeDraftBatchInTransaction as approveKnowledgeDraftBatchInTransactionInDatabase,
  getApprovedKnowledgeCard as getApprovedKnowledgeCardInDatabase,
  getApprovedKnowledgeIndexStatuses as getApprovedKnowledgeIndexStatusesInDatabase,
  getKnowledgeDraftForReview as getKnowledgeDraftForReviewInDatabase,
  isKnowledgeDraftReviewError,
  listApprovedKnowledgeCards as listApprovedKnowledgeCardsInDatabase,
  listApprovedKnowledgeCardsWithIndexStatus as listApprovedKnowledgeCardsWithIndexStatusInDatabase,
  listKnowledgeDraftsForReview as listKnowledgeDraftsForReviewInDatabase,
  parseKnowledgeDraftFormData,
  rejectKnowledgeDraft as rejectKnowledgeDraftInDatabase,
  updateKnowledgeDraft as updateKnowledgeDraftInDatabase,
} from "@xuyenviet/database";

import { requireAdminSession } from "@/server/auth";

export {
  isKnowledgeDraftReviewError,
  parseKnowledgeDraftFormData,
};
export type {
  ApprovedKnowledgeCard,
  ApprovedKnowledgeCardWithIndexStatus,
  ApprovedKnowledgeIndexStatus,
  KnowledgeDraftReviewCard,
  KnowledgeDraftReviewResult,
  KnowledgeDraftReviewSource,
  KnowledgeDraftReviewSuggestion,
  KnowledgeDraftUpdateInput,
} from "@xuyenviet/database";
export { KnowledgeDraftReviewError } from "@xuyenviet/database";

export async function listKnowledgeDraftsForReview() {
  await requireAdminSession();
  return listKnowledgeDraftsForReviewInDatabase();
}

export async function getKnowledgeDraftForReview(draftId: string) {
  await requireAdminSession();
  return getKnowledgeDraftForReviewInDatabase(draftId);
}

export async function listApprovedKnowledgeCards() {
  await requireAdminSession();
  return listApprovedKnowledgeCardsInDatabase();
}

export async function listApprovedKnowledgeCardsWithIndexStatus() {
  await requireAdminSession();
  return listApprovedKnowledgeCardsWithIndexStatusInDatabase();
}

export async function getApprovedKnowledgeIndexStatuses(cardIds: string[]) {
  await requireAdminSession();
  return getApprovedKnowledgeIndexStatusesInDatabase(cardIds);
}

export async function getApprovedKnowledgeCard(cardId: string) {
  await requireAdminSession();
  return getApprovedKnowledgeCardInDatabase(cardId);
}

export async function updateKnowledgeDraft(draftId: string, input: import("@xuyenviet/database").KnowledgeDraftUpdateInput) {
  const session = await requireAdminSession();
  return updateKnowledgeDraftInDatabase(draftId, input, { userId: session.userId, email: session.email });
}

export async function rejectKnowledgeDraft(draftId: string) {
  const session = await requireAdminSession();
  return rejectKnowledgeDraftInDatabase(draftId, { userId: session.userId, email: session.email });
}

export async function approveKnowledgeDraft(draftId: string, expectedUpdatedAt?: string | null) {
  const session = await requireAdminSession();
  return approveKnowledgeDraftInDatabase(draftId, { userId: session.userId, email: session.email }, expectedUpdatedAt);
}

export async function approveKnowledgeDraftBatch(draftIds: string[]) {
  const session = await requireAdminSession();
  return approveKnowledgeDraftBatchInDatabase(draftIds, { userId: session.userId, email: session.email });
}

export async function approveKnowledgeDraftBatchInTransaction(
  transaction: Parameters<typeof approveKnowledgeDraftBatchInTransactionInDatabase>[0],
  session: { userId: string; email: string },
  draftIds: string[],
) {
  return approveKnowledgeDraftBatchInTransactionInDatabase(transaction, { userId: session.userId, email: session.email }, draftIds);
}
