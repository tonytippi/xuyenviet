import { and, asc, count, eq, isNotNull, lte } from "drizzle-orm";

import type { AdminKnowledgeCoverage } from "@xuyenviet/contracts";
import type { AdminKnowledgeCoveragePort } from "@xuyenviet/domain";

import { getDb } from "./client";
import { getAdminOverviewCoverage } from "./admin-overview";
import { knowledgeRecommendations, knowledgeSamplingObligations, knowledgeSamplingPolicies } from "./schema";

export function createPostgresAdminKnowledgeCoveragePort(): AdminKnowledgeCoveragePort {
  return {
    async getCoverage(): Promise<AdminKnowledgeCoverage> {
      const db = getDb();
      const [progress, closedPolicies, obligationCounts, actionableSamplingWork] = await Promise.all([
        getAdminOverviewCoverage(db),
        db.select({ cohortKey: knowledgeSamplingPolicies.cohortKey, enrollmentSealedAt: knowledgeSamplingPolicies.enrollmentSealedAt, candidateCount: knowledgeSamplingPolicies.enrollmentCandidateCount, selectedCount: knowledgeSamplingPolicies.enrollmentSelectedCount })
          .from(knowledgeSamplingPolicies)
          .where(and(lte(knowledgeSamplingPolicies.windowEndsAt, new Date()), isNotNull(knowledgeSamplingPolicies.enrollmentSealedAt)))
          .orderBy(asc(knowledgeSamplingPolicies.windowEndsAt), asc(knowledgeSamplingPolicies.cohortKey))
          .limit(100),
        db.select({ disposition: knowledgeSamplingObligations.samplingDisposition, count: count() }).from(knowledgeSamplingObligations).groupBy(knowledgeSamplingObligations.samplingDisposition),
        db.select({ count: count() }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.workType, "sampling"), eq(knowledgeRecommendations.status, "open"))),
      ]);
      const obligations = obligationCounts.reduce((totals, item) => { if (item.disposition === null) totals.pending += item.count; else if (item.disposition === "sampling_passed") totals.passed += item.count; else if (item.disposition === "sampling_failed") totals.failed += item.count; return totals; }, { pending: 0, passed: 0, failed: 0 });
      return { progress, sampling: { closedPolicies: closedPolicies.flatMap((policy) => policy.enrollmentSealedAt ? [{ cohortKey: policy.cohortKey, enrollmentSealedAt: policy.enrollmentSealedAt.toISOString(), candidateCount: policy.candidateCount ?? 0, selectedCount: policy.selectedCount ?? 0 }] : []), obligations, actionableWork: actionableSamplingWork[0]?.count ?? 0 } };
    },
  };
}
