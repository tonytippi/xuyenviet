export class KnowledgeDraftReviewPolicyError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_draft" | "invalid_input" | "not_reviewable",
  ) {
    super(message);
    this.name = "KnowledgeDraftReviewError";
  }
}
import type { AdminKnowledgeCard, AdminKnowledgeCardList, AdminKnowledgeRecommendationDetail, AdminKnowledgeRecommendationList, AdminKnowledgeRecommendationResult, RequestPrincipal } from "@xuyenviet/contracts";

export type AdminKnowledgeReviewPort = {
  listCards(input: { lifecycleState: AdminKnowledgeCard["lifecycleState"]; q?: string }): Promise<AdminKnowledgeCardList>;
  getCard(id: string): Promise<AdminKnowledgeCard | null>;
  listRecommendations(input: { workStatus?: "actionable" | "completed" | "inactive"; workType?: "risk" | "missing_context" | "verification" | "relation" | "sampling"; page?: number }): Promise<AdminKnowledgeRecommendationList>;
  getRecommendation(id: string): Promise<AdminKnowledgeRecommendationDetail | null>;
  resolveRecommendation(id: string, input: { action: "accept_wording" | "edit" | "suppress" | "restore" | "verify" | "promote" | "resolve_relation" | "sampling_pass" | "sampling_fail"; editSummary?: string; highSeverity?: boolean }, actor: RequestPrincipal): Promise<AdminKnowledgeRecommendationResult>;
};
