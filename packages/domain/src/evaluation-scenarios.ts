export const publicMvpEvaluationPromptSetVersion = "public_mvp_ai_first_v2";

export const publicMvpEvaluationScoreDimensions = [
  "user_context_use", "practical_specificity", "source_grounding", "uncertainty_handling", "family_awareness", "vietnamese_clarity",
] as const;

export type PublicMvpEvaluationScoreDimension = (typeof publicMvpEvaluationScoreDimensions)[number];
export type PublicMvpEvaluationPromptType = "magic_moment_family_trip" | "sparse_data" | "freshness_sensitive" | "service_activity" | "route_logistics";

const prompts = {
  magic_moment_family_trip: { type: "magic_moment_family_trip", version: "magic_moment_family_trip_v1" },
  sparse_data: { type: "sparse_data", version: "sparse_data_v1" },
  freshness_sensitive: { type: "freshness_sensitive", version: "freshness_sensitive_v1" },
  service_activity: { type: "service_activity", version: "service_activity_v1" },
  route_logistics: { type: "route_logistics", version: "route_logistics_v1" },
} as const;

/** Persisted readiness requires this exact current six-scenario fence. */
export const publicMvpEvaluationScenarios = [
  { id: "community_observation", version: "v1", prompt: prompts.magic_moment_family_trip },
  { id: "independent_community_pattern", version: "v1", prompt: prompts.route_logistics },
  { id: "conditional_high_risk_claim", version: "v1", prompt: prompts.freshness_sensitive },
  { id: "conflict_exclusion", version: "v1", prompt: prompts.freshness_sensitive },
  { id: "source_withdrawal", version: "v1", prompt: prompts.service_activity },
  { id: "web_fallback_unavailable", version: "v1", prompt: prompts.sparse_data },
] as const;
