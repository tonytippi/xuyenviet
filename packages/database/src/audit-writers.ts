import { auditEvents, tripPlanChangeHistory, type AuditOperation, type TripPlanChangeHistoryOperationClass } from "./schema";
import { type AuditActor, validateAuditActor } from "./actors";
import { getDb } from "./client";

export type AuditEventWriter = Pick<ReturnType<typeof getDb>, "insert">;
export type PlanHistoryWriter = Pick<ReturnType<typeof getDb>, "insert">;

export type AuditEventInput = {
  actor: AuditActor;
  operation: AuditOperation;
  targetType: string;
  targetId?: string;
  beforeSummary?: string;
  afterSummary?: string;
  createdAt?: Date;
};

export type RecordPlanHistoryInput = {
  actor: AuditActor;
  tripProjectId: string;
  userId: string;
  proposalId?: string | null;
  operationClass: TripPlanChangeHistoryOperationClass;
  affectedItemReferences: unknown;
  safeBeforeAfterSummary: unknown;
};

const maxAuditSummaryLength = 2_000;

export async function recordAuditEvent(input: AuditEventInput, database: AuditEventWriter = getDb()) {
  const actor = validateAuditActor(input.actor);
  await database.insert(auditEvents).values({
    actorUserId: actor.kind === "user" ? actor.userId : null,
    actorEmail: actor.kind === "user" ? actor.email : null,
    operation: input.operation,
    targetType: input.targetType,
    targetId: input.targetId,
    beforeSummary: normalizeAuditSummary(input.beforeSummary),
    afterSummary: normalizeAuditSummary(input.afterSummary),
    actorClass: actor.kind,
    actorSystem: actor.kind === "system" ? actor.system : null,
    createdAt: input.createdAt,
  });
}

export async function recordPlanHistory(input: RecordPlanHistoryInput, database: PlanHistoryWriter = getDb()) {
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

function normalizeAuditSummary(summary: string | undefined) {
  if (!summary) return undefined;
  return summary.length > maxAuditSummaryLength ? `${summary.slice(0, maxAuditSummaryLength)}...` : summary;
}
