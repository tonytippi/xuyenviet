import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeCardEvidence, knowledgeCards, sourceCaptureVersions, sources } from "@/db/schema";

type ReadinessEvidenceDb = Pick<ReturnType<typeof getDb>, "select">;

export async function getCurrentValidEvidenceFencesForReadiness(db: ReadinessEvidenceDb) {
  const rows = await db
    .select({
      knowledgeCardId: knowledgeCards.id,
      contentVersion: knowledgeCards.contentVersion,
      evidenceSetRevision: knowledgeCards.evidenceSetRevision,
      publicationState: knowledgeCards.publicationState,
    })
    .from(knowledgeCards)
    .innerJoin(knowledgeCardEvidence, and(eq(knowledgeCardEvidence.knowledgeCardId, knowledgeCards.id), eq(knowledgeCardEvidence.state, "active")))
    .innerJoin(sources, and(eq(sources.id, knowledgeCardEvidence.sourceId), eq(sources.eligibility, "eligible")))
    .innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId), eq(sourceCaptureVersions.sourceId, knowledgeCardEvidence.sourceId), eq(sources.currentCaptureVersionId, knowledgeCardEvidence.captureVersionId)))
    .where(and(
      sql`${knowledgeCardEvidence.supportLevel} in ('primary', 'supporting')`,
      sql`${knowledgeCardEvidence.displayPolicy} in ('fact_only', 'traveler_visible')`,
      sql`${sources.kind} = ${sourceCaptureVersions.captureKind} and ${sources.kind} in ('url', 'facebook', 'youtube')`,
      sql`${sourceCaptureVersions.payloadDeletedAt} is null`,
      sql`${sourceCaptureVersions.rawText} is not null`,
      sql`substring(${sourceCaptureVersions.rawText} from ${knowledgeCardEvidence.spanStart} + 1 for ${knowledgeCardEvidence.spanEnd} - ${knowledgeCardEvidence.spanStart}) = ${knowledgeCardEvidence.quoteText}`,
    ));

  return new Map(rows.map((row) => [`${row.knowledgeCardId}:${row.contentVersion}:${row.evidenceSetRevision}`, row.publicationState]));
}
