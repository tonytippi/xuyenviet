import "server-only";

import {
  knowledgePublicationStateValues,
  knowledgeReviewStateValues,
  knowledgeStateValues,
  knowledgeVerificationStateValues,
  type KnowledgePublicationState,
  type KnowledgeReviewState,
  type KnowledgeState,
  type KnowledgeVerificationState,
} from "@/db/schema";

export type KnowledgeTravelerPolicy = "contextual_use" | "caveat_only" | "exclude";

export type KnowledgeTravelerPolicyReason =
  | "invalid_publication_state"
  | "invalid_knowledge_state"
  | "invalid_review_state"
  | "invalid_verification_state"
  | "inactive_publication"
  | "verification_failed"
  | "incomplete_metadata"
  | "invalid_conditions"
  | "missing_traveler_safe_evidence"
  | "insufficient_independent_pattern_support"
  | "unsupported_knowledge_state";

export type KnowledgeCardStateForEligibility = {
  publicationState: KnowledgePublicationState;
  knowledgeState: KnowledgeState;
  reviewState: KnowledgeReviewState;
  verificationState: KnowledgeVerificationState;
  locationName?: string | null;
  routeSegment?: string | null;
  title?: string | null;
  summary?: string | null;
  conditions?: unknown;
  activeTravelerSafeEvidenceCount?: number;
  activeTravelerSafeIndependenceKeyCount?: number;
};

export type KnowledgeTravelerPolicyEvaluation = {
  policy: KnowledgeTravelerPolicy;
  reasons: KnowledgeTravelerPolicyReason[];
};

const maxSafeConditions = 12;
const maxSafeConditionLength = 160;

export function evaluateKnowledgeTravelerPolicy(card: KnowledgeCardStateForEligibility): KnowledgeTravelerPolicyEvaluation {
  const reasons: KnowledgeTravelerPolicyReason[] = [];

  if (!knowledgePublicationStateValues.includes(card.publicationState)) reasons.push("invalid_publication_state");
  if (!knowledgeStateValues.includes(card.knowledgeState)) reasons.push("invalid_knowledge_state");
  if (!knowledgeReviewStateValues.includes(card.reviewState)) reasons.push("invalid_review_state");
  if (!knowledgeVerificationStateValues.includes(card.verificationState)) reasons.push("invalid_verification_state");
  if (knowledgeStateValues.includes(card.knowledgeState) && !isRecognizedTravelerKnowledgeState(card.knowledgeState)) reasons.push("unsupported_knowledge_state");
  if (card.publicationState !== "active") reasons.push("inactive_publication");
  if (card.verificationState === "failed") reasons.push("verification_failed");
  if (!hasCompleteSafeMetadata(card)) reasons.push("incomplete_metadata");
  if (!hasSafeConditions(card.conditions, card.knowledgeState === "conditional")) reasons.push("invalid_conditions");
  if (!Number.isInteger(card.activeTravelerSafeEvidenceCount) || card.activeTravelerSafeEvidenceCount! < 1) reasons.push("missing_traveler_safe_evidence");
  if (card.knowledgeState === "community_pattern" && (!Number.isInteger(card.activeTravelerSafeIndependenceKeyCount) || card.activeTravelerSafeIndependenceKeyCount! < 2)) {
    reasons.push("insufficient_independent_pattern_support");
  }

  if (reasons.length > 0 || !isRecognizedTravelerKnowledgeState(card.knowledgeState)) {
    return { policy: "exclude", reasons };
  }

  if (card.knowledgeState === "uncertain" || card.verificationState === "required") {
    return { policy: "caveat_only", reasons };
  }

  return { policy: "contextual_use", reasons };
}

function isRecognizedTravelerKnowledgeState(state: KnowledgeState) {
  return state === "community_observation" || state === "community_pattern" || state === "conditional" || state === "uncertain";
}

function hasCompleteSafeMetadata(card: KnowledgeCardStateForEligibility) {
  return Boolean(card.title?.trim() && card.summary?.trim() && (card.locationName?.trim() || card.routeSegment?.trim()));
}

function hasSafeConditions(conditions: unknown, required: boolean) {
  return Array.isArray(conditions)
    && (!required || conditions.length > 0)
    && conditions.length <= maxSafeConditions
    && conditions.every((condition) => typeof condition === "string" && condition.trim().length > 0 && condition.length <= maxSafeConditionLength);
}
