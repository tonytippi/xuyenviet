import "server-only";

import type { KnowledgeCardStatus, KnowledgePublicationState, KnowledgeReviewState, KnowledgeState, KnowledgeVerificationState } from "@/db/schema";

export type KnowledgeCardStateForEligibility = {
  status: KnowledgeCardStatus;
  needsReview: boolean;
  publicationState: KnowledgePublicationState;
  knowledgeState: KnowledgeState;
  reviewState: KnowledgeReviewState;
  verificationState: KnowledgeVerificationState;
  locationName?: string | null;
  routeSegment?: string | null;
  activeSupportingEvidenceCount?: number;
  capturePayloadAvailable?: boolean | null;
};

export function isKnowledgeCardTravelerEligible(card: KnowledgeCardStateForEligibility) {
  if (
    card.status !== "approved"
    || card.needsReview
    || card.publicationState !== "active"
    || card.knowledgeState === "conflicted"
    || card.knowledgeState === "superseded"
    || card.verificationState === "failed"
  ) {
    return false;
  }

  return Boolean(
    (card.locationName?.trim() || card.routeSegment?.trim())
    && card.activeSupportingEvidenceCount && card.activeSupportingEvidenceCount > 0
    && card.capturePayloadAvailable === true,
  );
}
