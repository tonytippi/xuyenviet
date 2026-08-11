export type YoutubeDiscoveryPolicy = Readonly<{
  enabled: boolean;
  minimumCandidateScore: number;
  priorityScoreWeight: number;
  freshnessScoreWeight: number;
  relevanceWeight: number;
  expectedValueWeight: number;
  freshnessFitWeight: number;
  commercialRiskWeight: number;
  duplicateRiskWeight: number;
  deferMinimum: number;
  considerMinimum: number;
  cadenceMinutes: number;
  retentionDays: number;
  commentSignalTtlDays: number;
  maxConcurrentRuns: number;
  maxRetryAttempts: number;
  retryDelayMinutes: number;
  actionQueueHighPriorityMaximum: number;
  actionQueueMaximumOperatorReviewAgeHours: number;
  actionQueueMaximumMissionStallHours: number;
  actionQueuePersistentIncidentFailureCount: number;
  actionQueuePersistentIncidentWindowHours: number;
}>;

export const defaultYoutubeDiscoveryPolicy: YoutubeDiscoveryPolicy = Object.freeze({
  enabled: true,
  minimumCandidateScore: 0.5,
  priorityScoreWeight: 0.6,
  freshnessScoreWeight: 0.4,
  relevanceWeight: 0.3,
  expectedValueWeight: 0.3,
  freshnessFitWeight: 0.2,
  commercialRiskWeight: 0.1,
  duplicateRiskWeight: 0.1,
  deferMinimum: 0.35,
  considerMinimum: 0.65,
  cadenceMinutes: 1440,
  retentionDays: 180,
  commentSignalTtlDays: 30,
  maxConcurrentRuns: 1,
  maxRetryAttempts: 3,
  retryDelayMinutes: 15,
  actionQueueHighPriorityMaximum: 20,
  actionQueueMaximumOperatorReviewAgeHours: 72,
  actionQueueMaximumMissionStallHours: 48,
  actionQueuePersistentIncidentFailureCount: 2,
  actionQueuePersistentIncidentWindowHours: 24,
});

export class YoutubeDiscoveryPolicyValidationError extends Error {
  constructor() {
    super("Invalid YouTube Discovery policy.");
    this.name = "YoutubeDiscoveryPolicyValidationError";
  }
}

export function parseYoutubeDiscoveryPolicy(input: unknown): YoutubeDiscoveryPolicy {
  if (!isRecord(input) || Object.keys(input).some((key) => !(key in defaultYoutubeDiscoveryPolicy))) {
    throw new YoutubeDiscoveryPolicyValidationError();
  }
  const policy = { ...defaultYoutubeDiscoveryPolicy, ...input };
  if (typeof policy.enabled !== "boolean" || !score(policy.minimumCandidateScore) || !score(policy.priorityScoreWeight) || !score(policy.freshnessScoreWeight) || !rankingPolicy(policy) || !integerBetween(policy.cadenceMinutes, 15, 10_080) || !integerBetween(policy.retentionDays, 1, 365) || !integerBetween(policy.commentSignalTtlDays, 1, policy.retentionDays - 1) || !integerBetween(policy.maxConcurrentRuns, 1, 20) || !integerBetween(policy.maxRetryAttempts, 0, 10) || !integerBetween(policy.retryDelayMinutes, 1, 1_440) || !integerBetween(policy.actionQueueHighPriorityMaximum, 1, 100) || !integerBetween(policy.actionQueueMaximumOperatorReviewAgeHours, 1, 720) || !integerBetween(policy.actionQueueMaximumMissionStallHours, 1, 720) || !integerBetween(policy.actionQueuePersistentIncidentFailureCount, 2, 10) || !integerBetween(policy.actionQueuePersistentIncidentWindowHours, 1, 168)) {
    throw new YoutubeDiscoveryPolicyValidationError();
  }
  return Object.freeze(policy);
}

export const youtubeDiscoveryRecommendationValues = ["skip", "defer", "consider"] as const;
export type YoutubeDiscoveryRecommendation = (typeof youtubeDiscoveryRecommendationValues)[number];
export const youtubeDiscoveryRecommendationFactorValues = ["relevance", "expected_value", "freshness_fit"] as const;
export const youtubeDiscoveryRecommendationPenaltyValues = ["commercial_risk", "duplicate_risk"] as const;
export const youtubeDiscoveryRecommendationReasonValues = ["eligible_score_band", "below_defer_band", "between_defer_and_consider_band", "already_compatible", "canonical_mismatch", "not_current_run_enriched"] as const;
export type YoutubeDiscoveryRecommendationReason = (typeof youtubeDiscoveryRecommendationReasonValues)[number];

export type YoutubeDiscoveryRecommendationAssessment = Readonly<{
  relevanceScore: number;
  expectedValueScore: number;
  freshnessFitScore: number;
  commercialRiskScore: number;
  duplicateRiskScore: number;
  signals: readonly string[];
}>;
export type YoutubeDiscoveryRecommendationGates = Readonly<{ canonical: boolean; currentRunEnriched: boolean; eligibility: "eligible" | "already_compatible" }>;
export type YoutubeDiscoveryRecommendationResult = Readonly<{ score: number; recommendation: YoutubeDiscoveryRecommendation; factors: string[]; penalties: string[]; reason: YoutubeDiscoveryRecommendationReason; signals: string[]; scores: YoutubeDiscoveryRecommendationAssessment }>;

/** The ranking result contains only finite codes and normalized operational inputs. */
export function evaluateYoutubeDiscoveryRecommendation(policy: YoutubeDiscoveryPolicy, assessment: YoutubeDiscoveryRecommendationAssessment, gates: YoutubeDiscoveryRecommendationGates): YoutubeDiscoveryRecommendationResult {
  const scores = { ...assessment, relevanceScore: round6(assessment.relevanceScore), expectedValueScore: round6(assessment.expectedValueScore), freshnessFitScore: round6(assessment.freshnessFitScore), commercialRiskScore: round6(assessment.commercialRiskScore), duplicateRiskScore: round6(assessment.duplicateRiskScore), signals: [...new Set(assessment.signals)].sort().slice(0, 6) };
  const factors = youtubeDiscoveryRecommendationFactorValues.filter((code, index) => [scores.relevanceScore, scores.expectedValueScore, scores.freshnessFitScore][index]! > 0);
  const penalties = youtubeDiscoveryRecommendationPenaltyValues.filter((code, index) => [scores.commercialRiskScore, scores.duplicateRiskScore][index]! > 0);
  const explanation = [...factors, ...penalties].slice(0, 5);
  const boundedFactors = explanation.filter((code) => (youtubeDiscoveryRecommendationFactorValues as readonly string[]).includes(code));
  const boundedPenalties = explanation.filter((code) => (youtubeDiscoveryRecommendationPenaltyValues as readonly string[]).includes(code));
  const quality = scores.relevanceScore * policy.relevanceWeight + scores.expectedValueScore * policy.expectedValueWeight + scores.freshnessFitScore * policy.freshnessFitWeight;
  const risk = scores.commercialRiskScore * policy.commercialRiskWeight + scores.duplicateRiskScore * policy.duplicateRiskWeight;
  const score = round6(quality * (1 - risk));
  if (!gates.canonical) return { score, recommendation: "skip", factors: boundedFactors, penalties: boundedPenalties, reason: "canonical_mismatch", signals: scores.signals, scores };
  if (!gates.currentRunEnriched) return { score, recommendation: "skip", factors: boundedFactors, penalties: boundedPenalties, reason: "not_current_run_enriched", signals: scores.signals, scores };
  if (gates.eligibility === "already_compatible") return { score, recommendation: "skip", factors: boundedFactors, penalties: boundedPenalties, reason: "already_compatible", signals: scores.signals, scores };
  const recommendation = score >= policy.considerMinimum ? "consider" : score >= policy.deferMinimum ? "defer" : "skip";
  return { score, recommendation, factors: boundedFactors, penalties: boundedPenalties, reason: recommendation === "consider" ? "eligible_score_band" : recommendation === "defer" ? "between_defer_and_consider_band" : "below_defer_band", signals: scores.signals, scores };
}

export function round6(value: number): number {
  if (!Number.isFinite(value)) throw new YoutubeDiscoveryPolicyValidationError();
  const [integerPart, fractionalPart = ""] = decimalParts(value);
  const retained = fractionalPart.slice(0, 6).padEnd(6, "0");
  const rounded = Number(`${integerPart}${retained}`) + (fractionalPart[6] !== undefined && fractionalPart[6] >= "5" ? 1 : 0);
  return rounded / 1_000_000;
}

function rankingPolicy(policy: YoutubeDiscoveryPolicy): boolean {
  const weights = [policy.relevanceWeight, policy.expectedValueWeight, policy.freshnessFitWeight, policy.commercialRiskWeight, policy.duplicateRiskWeight];
  return weights.every(score) && weights.every(sixDecimal) && sixDecimal(policy.deferMinimum) && sixDecimal(policy.considerMinimum) && round6(weights.reduce((total, weight) => total + weight, 0)) === 1 && score(policy.deferMinimum) && score(policy.considerMinimum) && policy.deferMinimum < policy.considerMinimum;
}

function sixDecimal(value: number): boolean {
  return round6(value) === value;
}

/** Expands JavaScript's shortest decimal representation without binary arithmetic. */
function decimalParts(value: number): [string, string] {
  if (value < 0) throw new YoutubeDiscoveryPolicyValidationError();
  const [coefficient, exponentText] = value.toString().toLowerCase().split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [whole = "0", fraction = ""] = coefficient!.split(".");
  const rawDigits = `${whole}${fraction}`;
  const leadingZeroes = rawDigits.match(/^0+(?=\d)/)?.[0].length ?? 0;
  const digits = rawDigits.slice(leadingZeroes) || "0";
  const decimalAt = whole.length + exponent - leadingZeroes;
  if (decimalAt <= 0) return ["0", `${"0".repeat(-decimalAt)}${digits}`];
  if (decimalAt >= digits.length) return [`${digits}${"0".repeat(decimalAt - digits.length)}`, ""];
  return [digits.slice(0, decimalAt), digits.slice(decimalAt)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function score(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function integerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
