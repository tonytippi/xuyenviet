import { getDb } from "@xuyenviet/database";
import { auditEvents, type AuditOperation } from "@xuyenviet/database";

import { type AuditActor, validateAuditActor } from "./actors";

export type AuditEventWriter = Pick<ReturnType<typeof getDb>, "insert">;

const maxAuditSummaryLength = 2000;

export type AuditEventInput = {
  actor: AuditActor;
  operation: AuditOperation;
  targetType: string;
  targetId?: string;
  beforeSummary?: string;
  afterSummary?: string;
  createdAt?: Date;
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
  createdAt,
}: AuditEventInput, database: AuditEventWriter = getDb()) {
  const validatedActor = validateAuditActor(actor);

  await database.insert(auditEvents).values({
    actorUserId: validatedActor.kind === "user" ? validatedActor.userId : null,
    actorEmail: validatedActor.kind === "user" ? validatedActor.email : null,
    operation,
    targetType,
    targetId,
    beforeSummary: normalizeAuditSummary(beforeSummary),
    afterSummary: normalizeAuditSummary(afterSummary),
    actorClass: validatedActor.kind,
    actorSystem: validatedActor.kind === "system" ? validatedActor.system : null,
    createdAt,
  });
}
