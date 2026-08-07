export type YoutubeDiscoveryPolicyAuditSummary = Readonly<{
  version: number;
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

export type YoutubeDiscoveryQueryProposalAuditSummary = Readonly<{
  origin: "system" | "operator";
  priority: number;
  enabled: boolean;
  cadenceMinutes: number;
}>;

export type YoutubeDiscoveryRunAuditSummary = Readonly<{
  policyVersionId: string;
  state: "queued" | "running" | "retrying" | "completed" | "failed" | "cancelled";
}>;
