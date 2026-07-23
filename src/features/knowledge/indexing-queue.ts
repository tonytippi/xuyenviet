import "server-only";

import { and, eq, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeCardSearchDocuments, knowledgeIndexDirtyMarkers } from "@/db/schema";

type IndexingMutationDb = Pick<ReturnType<typeof getDb>, "insert" | "update">;

/** Keeps mutations and the durable projection queue in one transaction. */
export async function enqueueKnowledgeIndexWork(
  db: IndexingMutationDb,
  input: { cardId: string; contentVersion: number; evidenceSetRevision: number; reason: string },
) {
  await db
    .insert(knowledgeIndexDirtyMarkers)
    .values({
      knowledgeCardId: input.cardId,
      contentVersion: input.contentVersion,
      evidenceSetRevision: input.evidenceSetRevision,
      reason: input.reason,
      status: "pending",
      nextRunAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [knowledgeIndexDirtyMarkers.knowledgeCardId, knowledgeIndexDirtyMarkers.contentVersion],
      set: { reason: sql`least(${knowledgeIndexDirtyMarkers.reason}, excluded.reason)`, updatedAt: new Date() },
    });
}

/** A newer card version makes every older active projection unsafe immediately. */
export async function disableStaleKnowledgeSearchProjection(db: IndexingMutationDb, cardId: string, contentVersion: number, now = new Date()) {
  await db
    .update(knowledgeCardSearchDocuments)
    .set({ status: "disabled", disabledAt: now, updatedAt: now })
    .where(and(
      eq(knowledgeCardSearchDocuments.knowledgeCardId, cardId),
      eq(knowledgeCardSearchDocuments.status, "active"),
      lte(knowledgeCardSearchDocuments.contentVersion, contentVersion),
    ));
}
