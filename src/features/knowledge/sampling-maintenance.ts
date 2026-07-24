import "server-only";

import { sealClosedKnowledgeSamplingPolicy } from "@/features/knowledge/recommendations";
import { getDb } from "@/db/client";
import { asc, lte } from "drizzle-orm";
import { knowledgeSamplingPolicies } from "@/db/schema";
import { requireAdminSession } from "@/server/auth";

export async function sealClosedKnowledgeSamplingPolicyForAdmin(policyId: string) {
  await requireAdminSession();
  return sealClosedKnowledgeSamplingPolicy(policyId);
}

export async function listClosedKnowledgeSamplingPoliciesForAdmin(now = new Date()) {
  await requireAdminSession();
  return getDb()
    .select({ id: knowledgeSamplingPolicies.id, cohortKey: knowledgeSamplingPolicies.cohortKey, enrollmentSealedAt: knowledgeSamplingPolicies.enrollmentSealedAt })
    .from(knowledgeSamplingPolicies)
    .where(lte(knowledgeSamplingPolicies.windowEndsAt, now))
    .orderBy(asc(knowledgeSamplingPolicies.windowEndsAt), asc(knowledgeSamplingPolicies.cohortKey));
}
