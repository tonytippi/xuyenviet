import type { AdminKnowledgeCoverage, AdminKnowledgeSamplingPolicySealResult } from "@xuyenviet/contracts";

/** Aggregate-only coverage and closed-policy operations for the direct admin API. */
export type AdminKnowledgeCoveragePort = {
  getCoverage(): Promise<AdminKnowledgeCoverage>;
  sealClosedSamplingPolicy(policyId: string): Promise<AdminKnowledgeSamplingPolicySealResult>;
};
