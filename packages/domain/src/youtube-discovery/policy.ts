export type YoutubeDiscoveryPolicy = Readonly<{
  enabled: boolean;
  minimumCandidateScore: number;
  priorityScoreWeight: number;
  freshnessScoreWeight: number;
  cadenceMinutes: number;
  retentionDays: number;
  commentSignalTtlDays: number;
  maxConcurrentRuns: number;
  maxRetryAttempts: number;
  retryDelayMinutes: number;
}>;

export const defaultYoutubeDiscoveryPolicy: YoutubeDiscoveryPolicy = Object.freeze({
  enabled: true,
  minimumCandidateScore: 0.5,
  priorityScoreWeight: 0.6,
  freshnessScoreWeight: 0.4,
  cadenceMinutes: 1440,
  retentionDays: 180,
  commentSignalTtlDays: 30,
  maxConcurrentRuns: 1,
  maxRetryAttempts: 3,
  retryDelayMinutes: 15,
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
  if (typeof policy.enabled !== "boolean" || !score(policy.minimumCandidateScore) || !score(policy.priorityScoreWeight) || !score(policy.freshnessScoreWeight) || !integerBetween(policy.cadenceMinutes, 15, 10_080) || !integerBetween(policy.retentionDays, 1, 365) || !integerBetween(policy.commentSignalTtlDays, 1, policy.retentionDays - 1) || !integerBetween(policy.maxConcurrentRuns, 1, 20) || !integerBetween(policy.maxRetryAttempts, 0, 10) || !integerBetween(policy.retryDelayMinutes, 1, 1_440)) {
    throw new YoutubeDiscoveryPolicyValidationError();
  }
  return Object.freeze(policy);
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
