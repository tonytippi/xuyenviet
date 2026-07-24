import "server-only";

import { sealClosedKnowledgeSamplingPolicy } from "@/features/knowledge/recommendations";
import { requireAdminSession } from "@/server/auth";

export async function sealClosedKnowledgeSamplingPolicyForAdmin(policyId: string) {
  await requireAdminSession();
  return sealClosedKnowledgeSamplingPolicy(policyId);
}
