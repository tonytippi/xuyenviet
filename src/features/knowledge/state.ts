import "server-only";

import type { KnowledgeState, KnowledgePublicationState, KnowledgeReviewState, KnowledgeVerificationState } from "@/db/schema";

export type KnowledgeCardStateForEligibility = {
  publicationState: KnowledgePublicationState;
  knowledgeState: KnowledgeState;
  reviewState: KnowledgeReviewState;
  verificationState: KnowledgeVerificationState;
};

export function isKnowledgeCardTravelerEligible(card: KnowledgeCardStateForEligibility) {
  if (card.publicationState !== "active" || card.knowledgeState === "superseded") {
    return false;
  }

  // Story 3.3 supplies the bounded evidence and retrieval metadata this check needs.
  return false;
}
