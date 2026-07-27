import { type AiUsageStatus } from "@/db/schema";
import { type AiGatewayPricingSnapshot } from "@/features/ai/models";
import {
  writeNormalizedAiUsageEvent,
  type NormalizedUsageEventInput,
} from "@/features/usage/events";

import { type SystemAuditActorId, isSystemAuditActorId } from "./actors";

type UsageEventDb = Parameters<typeof writeNormalizedAiUsageEvent>[0];

export type WriteAiUsageEventInput = Omit<NormalizedUsageEventInput, "executorSystem"> & {
  executorSystem: SystemAuditActorId;
  status: AiUsageStatus;
  pricingSnapshot?: AiGatewayPricingSnapshot | null;
};

export async function writeAiUsageEvent(db: UsageEventDb, input: WriteAiUsageEventInput) {
  if (!isSystemAuditActorId(input.executorSystem)) {
    throw new Error("Invalid AI usage executor.");
  }

  return writeNormalizedAiUsageEvent(db, input);
}
