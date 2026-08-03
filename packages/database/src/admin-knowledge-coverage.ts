import { asc, lte } from "drizzle-orm";

import type { AdminKnowledgeCoverage, AdminKnowledgeSamplingPolicySealResult } from "@xuyenviet/contracts";
import type { AdminKnowledgeCoveragePort } from "@xuyenviet/domain";

import { getDb } from "./client";
import { getAdminOverviewCoverage } from "./admin-overview";
import { sealClosedKnowledgeSamplingPolicy } from "./knowledge-recommendations";
import { knowledgeSamplingPolicies } from "./schema";

export function createPostgresAdminKnowledgeCoveragePort(): AdminKnowledgeCoveragePort {
  return {
    async getCoverage(): Promise<AdminKnowledgeCoverage> {
      const db = getDb();
      const [progress, closedSamplingPolicies] = await Promise.all([
        getAdminOverviewCoverage(db),
        db.select({ id: knowledgeSamplingPolicies.id, cohortKey: knowledgeSamplingPolicies.cohortKey, enrollmentSealedAt: knowledgeSamplingPolicies.enrollmentSealedAt })
          .from(knowledgeSamplingPolicies)
          .where(lte(knowledgeSamplingPolicies.windowEndsAt, new Date()))
          .orderBy(asc(knowledgeSamplingPolicies.windowEndsAt), asc(knowledgeSamplingPolicies.cohortKey))
          .limit(100),
      ]);
      return { progress, closedSamplingPolicies: closedSamplingPolicies.map((policy) => ({ ...policy, enrollmentSealedAt: policy.enrollmentSealedAt?.toISOString() ?? null })) };
    },
    async sealClosedSamplingPolicy(policyId): Promise<AdminKnowledgeSamplingPolicySealResult> {
      return sealClosedKnowledgeSamplingPolicy(policyId);
    },
  };
}
