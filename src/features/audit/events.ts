import { getDb } from "@/db/client";
import { auditEvents, type AuditOperation } from "@/db/schema";

import { type UserAuditActor, validateUserAuditActor } from "./actors";

export type AuditEventWriter = Pick<ReturnType<typeof getDb>, "insert">;

const maxAuditSummaryLength = 2000;

export type AuditEventInput = {
  actor: UserAuditActor;
  operation: AuditOperation;
  targetType: string;
  targetId?: string;
  beforeSummary?: string;
  afterSummary?: string;
};

function normalizeAuditSummary(summary: string | undefined) {
  if (!summary) {
    return undefined;
  }

  return summary.length > maxAuditSummaryLength ? `${summary.slice(0, maxAuditSummaryLength)}...` : summary;
}

export async function recordAuditEvent({
  actor,
  operation,
  targetType,
  targetId,
  beforeSummary,
  afterSummary,
}: AuditEventInput, database: AuditEventWriter = getDb()) {
  const validatedActor = validateUserAuditActor(actor);

  await database.insert(auditEvents).values({
    actorUserId: validatedActor.userId,
    actorEmail: validatedActor.email,
    operation,
    targetType,
    targetId,
    beforeSummary: normalizeAuditSummary(beforeSummary),
    afterSummary: normalizeAuditSummary(afterSummary),
    actorClass: "user",
    actorSystem: null,
  });
}
