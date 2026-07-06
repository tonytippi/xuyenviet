import "server-only";

import { getDb } from "@/db/client";
import { auditEvents, type AuditOperation } from "@/db/schema";
import type { AuthenticatedSession } from "@/server/auth";

type AuditEventWriter = Pick<ReturnType<typeof getDb>, "insert">;

const maxAuditSummaryLength = 2000;

export type AuditEventInput = {
  actor: AuthenticatedSession;
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
  await database.insert(auditEvents).values({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    operation,
    targetType,
    targetId,
    beforeSummary: normalizeAuditSummary(beforeSummary),
    afterSummary: normalizeAuditSummary(afterSummary),
  });
}
