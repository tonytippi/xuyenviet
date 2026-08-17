import { and, asc, count, eq, isNotNull, lte, sql } from "drizzle-orm";

import type { AdminKnowledgeCoverage, AdminKnowledgeProvinceCoverageList } from "@xuyenviet/contracts";
import type { AdminKnowledgeCoveragePort } from "@xuyenviet/domain";

import { getDb } from "./client";
import { getAdminOverviewCoverage } from "./admin-overview";
import { knowledgeCards, knowledgeRecommendations, knowledgeSamplingObligations, knowledgeSamplingPolicies } from "./schema";
import { knowledgeProvinceReferenceFixture } from "./knowledge-geography";

/** This projection deliberately reads only canonical IDs and aggregate card metadata. */
export type AdminKnowledgeProvinceCoverageDatabase = Pick<ReturnType<typeof getDb>, "select">;

export async function getAdminKnowledgeProvinceCoverage(db: AdminKnowledgeProvinceCoverageDatabase = getDb()): Promise<AdminKnowledgeProvinceCoverageList> {
  const rows = await db.select({ canonicalProvinceId: knowledgeCards.normalizedCurrentProvinceId, topic: knowledgeCards.type, count: count(), freshnessSensitiveCount: sql<number>`count(*) filter (where ${knowledgeCards.freshnessSensitive})`, latestUpdatedAt: sql<Date | null>`max(${knowledgeCards.updatedAt})` }).from(knowledgeCards).where(and(eq(knowledgeCards.lifecycleState, "active"), isNotNull(knowledgeCards.normalizedCurrentProvinceId))).groupBy(knowledgeCards.normalizedCurrentProvinceId, knowledgeCards.type);
  const byProvince = new Map<string, { topics: Array<{ topic: string; count: number }>; freshnessSensitiveCount: number; latestUpdatedAt: Date | null }>();
  const currentUnitByReferenceId = new Map(knowledgeProvinceReferenceFixture.map((reference) => [reference.id, reference.currentUnitId]));
  for (const row of rows) {
    const currentUnitId = row.canonicalProvinceId ? currentUnitByReferenceId.get(row.canonicalProvinceId) : undefined;
    if (!currentUnitId) continue;
    const current = byProvince.get(currentUnitId) ?? { topics: [], freshnessSensitiveCount: 0, latestUpdatedAt: null };
    const topic = current.topics.find((item) => item.topic === row.topic);
    if (topic) topic.count += row.count;
    else current.topics.push({ topic: row.topic, count: row.count });
    current.freshnessSensitiveCount += Number(row.freshnessSensitiveCount);
    if (!current.latestUpdatedAt || row.latestUpdatedAt && row.latestUpdatedAt > current.latestUpdatedAt) current.latestUpdatedAt = row.latestUpdatedAt;
    byProvince.set(currentUnitId, current);
  }
  return { items: knowledgeProvinceReferenceFixture.filter((reference) => reference.id === reference.currentUnitId).map((reference) => { const aggregate = byProvince.get(reference.id) ?? { topics: [], freshnessSensitiveCount: 0, latestUpdatedAt: null }; return { canonicalProvinceId: reference.id, currentName: reference.displayName, legacyNames: knowledgeProvinceReferenceFixture.filter((item) => item.currentUnitId === reference.id && item.id !== item.currentUnitId).map((item) => item.displayName), topics: aggregate.topics.sort((left, right) => left.topic.localeCompare(right.topic)), freshnessSensitiveCount: aggregate.freshnessSensitiveCount, latestUpdatedAt: aggregate.latestUpdatedAt ? new Date(aggregate.latestUpdatedAt).toISOString() : null }; }) };
}

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
