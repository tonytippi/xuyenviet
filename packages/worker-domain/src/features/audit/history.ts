import { getDb } from "@xuyenviet/database";
import {
  tripPlanChangeHistory,
  type TripPlanChangeHistoryOperationClass,
} from "@xuyenviet/database";

import { type AuditActor, validateAuditActor } from "./actors";

export type PlanHistoryWriter = Pick<ReturnType<typeof getDb>, "insert">;

export type RecordPlanHistoryInput = {
  actor: AuditActor;
  tripProjectId: string;
  userId: string;
  proposalId?: string | null;
  operationClass: TripPlanChangeHistoryOperationClass;
  affectedItemReferences: unknown;
  safeBeforeAfterSummary: unknown;
};

export async function recordPlanHistory(
  input: RecordPlanHistoryInput,
  database: PlanHistoryWriter = getDb(),
) {
  const actor = validateAuditActor(input.actor);

  await database.insert(tripPlanChangeHistory).values({
    tripProjectId: input.tripProjectId,
    userId: input.userId,
    proposalId: input.proposalId ?? null,
    actorUserId: actor.kind === "user" ? actor.userId : null,
    actorClass: actor.kind,
    actorSystem: actor.kind === "system" ? actor.system : null,
    operationClass: input.operationClass,
    affectedItemReferences: input.affectedItemReferences,
    safeBeforeAfterSummary: input.safeBeforeAfterSummary,
  });
}
