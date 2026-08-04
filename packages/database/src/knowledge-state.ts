import {
  knowledgeLifecycleStateValues,
  knowledgeStateValues,
  knowledgeVerificationRequirementValues,
  type KnowledgeLifecycleState,
  type KnowledgeState,
  type KnowledgeVerificationRequirement,
} from "./schema";

export type KnowledgeTravelerPolicy = "contextual_use" | "caveat_only" | "exclude";

export type KnowledgeTravelerPolicyReason =
  | "invalid_lifecycle_state"
  | "invalid_knowledge_state"
  | "invalid_verification_requirement"
  | "inactive_lifecycle"
  | "verification_failed"
  | "incomplete_metadata"
  | "invalid_conditions"
  | "missing_traveler_safe_evidence"
  | "insufficient_independent_pattern_support"
  | "unsupported_knowledge_state";

export type KnowledgeCardStateForEligibility = {
  lifecycleState: KnowledgeLifecycleState;
  knowledgeState: KnowledgeState;
  verificationRequirement: KnowledgeVerificationRequirement;
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

  if (!knowledgeLifecycleStateValues.includes(card.lifecycleState)) reasons.push("invalid_lifecycle_state");
  if (!knowledgeStateValues.includes(card.knowledgeState)) reasons.push("invalid_knowledge_state");
  if (!knowledgeVerificationRequirementValues.includes(card.verificationRequirement)) reasons.push("invalid_verification_requirement");
  if (knowledgeStateValues.includes(card.knowledgeState) && !isRecognizedTravelerKnowledgeState(card.knowledgeState)) reasons.push("unsupported_knowledge_state");
  if (card.lifecycleState !== "active") reasons.push("inactive_lifecycle");
  if (card.verificationRequirement === "failed") reasons.push("verification_failed");
  if (!hasCompleteSafeMetadata(card)) reasons.push("incomplete_metadata");
  if (!hasSafeConditions(card.conditions, card.knowledgeState === "conditional")) reasons.push("invalid_conditions");
  if (!Number.isInteger(card.activeTravelerSafeEvidenceCount) || card.activeTravelerSafeEvidenceCount! < 1) reasons.push("missing_traveler_safe_evidence");
  if (card.knowledgeState === "community_pattern" && (!Number.isInteger(card.activeTravelerSafeIndependenceKeyCount) || card.activeTravelerSafeIndependenceKeyCount! < 2)) {
    reasons.push("insufficient_independent_pattern_support");
  }

  if (reasons.length > 0 || !isRecognizedTravelerKnowledgeState(card.knowledgeState)) {
    return { policy: "exclude", reasons };
  }

  if (card.verificationRequirement === "operator_required") {
    return { policy: "caveat_only", reasons };
  }

  return { policy: "contextual_use", reasons };
}

function isRecognizedTravelerKnowledgeState(state: KnowledgeState) {
  return state === "community_observation" || state === "community_pattern" || state === "conditional";
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
