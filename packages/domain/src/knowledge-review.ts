export class KnowledgeDraftReviewPolicyError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_draft" | "invalid_input" | "not_reviewable",
  ) {
    super(message);
    this.name = "KnowledgeDraftReviewError";
  }
}
import type { RequestPrincipal } from "@xuyenviet/contracts";

export type AdminKnowledgeReviewPort = {
  listDrafts(): Promise<unknown>;
  getDraft(id: string): Promise<unknown | null>;
  updateDraft(id: string, input: unknown, actor: RequestPrincipal): Promise<unknown>;
  rejectDraft(id: string, actor: RequestPrincipal): Promise<unknown>;
  approveDraft(id: string, actor: RequestPrincipal, expectedUpdatedAt?: string | null): Promise<unknown>;
  approveDraftBatch(ids: string[], actor: RequestPrincipal): Promise<unknown>;
  listApproved(query?: string): Promise<unknown>;
  getApproved(id: string): Promise<unknown | null>;
  listRecommendations(input: unknown): Promise<unknown>;
  getRecommendation(id: string): Promise<unknown | null>;
  resolveRecommendation(id: string, input: unknown, actor: RequestPrincipal): Promise<unknown>;
};
