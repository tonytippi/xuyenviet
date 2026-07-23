import "server-only";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { disableStaleKnowledgeSearchProjection, enqueueKnowledgeIndexWork } from "@/features/knowledge/indexing-queue";
import { auditEvents, knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeRecommendations, knowledgeSourceSuggestions, rawSourceMaterial, sourceCaptureVersions, sources, type SourceRemovalReason } from "@/db/schema";

export class SourceRemovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceRemovalError";
  }
}

const removalReasons = new Set<SourceRemovalReason>(["withdrawn", "inaccessible", "removed"]);

export async function removeKnowledgeSource(
  input: { sourceId: string; reason: SourceRemovalReason; actor: { userId: string; email: string } },
  db = getDb(),
) {
  const sourceId = input.sourceId.trim();
  if (!sourceId || !removalReasons.has(input.reason) || !input.actor.userId.trim() || !input.actor.email.trim()) {
    throw new SourceRemovalError("Source removal input is invalid.");
  }

  return db.transaction(async (tx) => {
    const evidence = await tx.select({ knowledgeCardId: knowledgeCardEvidence.knowledgeCardId }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.sourceId, sourceId), eq(knowledgeCardEvidence.state, "active"))).orderBy(knowledgeCardEvidence.knowledgeCardId);
    const links = await tx.select({ knowledgeCardId: knowledgeCardSources.knowledgeCardId }).from(knowledgeCardSources).where(eq(knowledgeCardSources.sourceId, sourceId)).orderBy(knowledgeCardSources.knowledgeCardId);
    const cardIds = [...new Set([...evidence.map((item) => item.knowledgeCardId), ...links.map((item) => item.knowledgeCardId)])].sort();
    for (const cardId of cardIds) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${cardId}, 46))`);
      await tx.select({ id: knowledgeCards.id }).from(knowledgeCards).where(eq(knowledgeCards.id, cardId)).limit(1).for("update");
    }
    // Projection paths acquire card locks before source locks; removal follows it.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sourceId}, 44))`);
    const [source] = await tx.select({ id: sources.id, eligibility: sources.eligibility }).from(sources).where(eq(sources.id, sourceId)).limit(1).for("update");
    if (!source) throw new SourceRemovalError("Source does not exist.");
    if (source.eligibility === "withdrawn") return { status: "already_completed" as const, sourceId, changedCardIds: [] };

    const now = new Date();
    for (const cardId of cardIds) {
      await tx.select({ id: knowledgeRecommendations.id }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.knowledgeCardId, cardId), inArray(knowledgeRecommendations.status, ["open", "in_review"]))).orderBy(knowledgeRecommendations.id).for("update");
    }
    const lockedEvidence = await tx.select({ id: knowledgeCardEvidence.id }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.sourceId, sourceId), eq(knowledgeCardEvidence.state, "active"))).for("update");

    await tx.update(sources).set({ eligibility: "withdrawn", removalReason: input.reason, removedByUserId: input.actor.userId, removalCompletedAt: now, currentCaptureVersionId: null }).where(eq(sources.id, sourceId));
    if (lockedEvidence.length > 0) await tx.update(knowledgeCardEvidence).set({ state: "removed" }).where(inArray(knowledgeCardEvidence.id, lockedEvidence.map((item) => item.id)));

    for (const cardId of cardIds) {
      const remaining = await tx.select({ independenceKey: knowledgeCardEvidence.independenceKey }).from(knowledgeCardEvidence)
        .innerJoin(sources, and(eq(sources.id, knowledgeCardEvidence.sourceId), eq(sources.eligibility, "eligible")))
        .innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId), eq(sourceCaptureVersions.sourceId, knowledgeCardEvidence.sourceId)))
        .where(and(eq(knowledgeCardEvidence.knowledgeCardId, cardId), eq(knowledgeCardEvidence.state, "active"), or(eq(knowledgeCardEvidence.supportLevel, "primary"), eq(knowledgeCardEvidence.supportLevel, "supporting")), isNull(sourceCaptureVersions.payloadDeletedAt), sql`substring(${sourceCaptureVersions.rawText} from ${knowledgeCardEvidence.spanStart} + 1 for ${knowledgeCardEvidence.spanEnd} - ${knowledgeCardEvidence.spanStart}) = ${knowledgeCardEvidence.quoteText}`)).for("update");
      const [card] = await tx.select({ publicationState: knowledgeCards.publicationState, knowledgeState: knowledgeCards.knowledgeState, verificationState: knowledgeCards.verificationState }).from(knowledgeCards).where(eq(knowledgeCards.id, cardId)).limit(1);
      if (!card) continue;
      const supportCount = new Set(remaining.map((item) => item.independenceKey)).size;
      const ineligible = supportCount === 0 || card.knowledgeState === "conflicted" || card.knowledgeState === "superseded" || card.verificationState === "failed";
      const downgradePattern = card.knowledgeState === "community_pattern" && supportCount < 2;
       const [updated] = await tx.update(knowledgeCards).set({
        evidenceSetRevision: sql`${knowledgeCards.evidenceSetRevision} + 1`,
        contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: now,
        ...(ineligible && card.publicationState === "active" ? { publicationState: "suppressed" as const } : {}),
        ...(downgradePattern ? { knowledgeState: "community_observation" as const } : {}),
      }).where(eq(knowledgeCards.id, cardId)).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
      if (!updated) continue;
      await tx.update(knowledgeRecommendations).set({ status: "superseded", resolution: "accepted", resolvedByUserId: input.actor.userId, resolvedAt: now, updatedAt: now }).where(and(eq(knowledgeRecommendations.knowledgeCardId, cardId), inArray(knowledgeRecommendations.status, ["open", "in_review"])));
       await enqueueKnowledgeIndexWork(tx, { cardId, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, reason: "source_removal" });
      // Reindex from remaining evidence before a projection can become active again.
       await disableStaleKnowledgeSearchProjection(tx, cardId, updated.contentVersion, now);
      await tx.insert(auditEvents).values({ actorUserId: input.actor.userId, actorEmail: input.actor.email.trim().toLowerCase(), operation: "archive", targetType: "knowledge_source_removal_card", targetId: cardId, afterSummary: `Source removal changed evidence eligibility; sourceId=${sourceId}; card remains traveler-eligible=${!ineligible}.` });
    }

    await tx.update(sourceCaptureVersions).set({ rawText: null, fileName: null, mimeType: null, byteSize: null, storageKey: null, rawMetadata: null, payloadDeletedAt: now }).where(and(eq(sourceCaptureVersions.sourceId, sourceId), isNull(sourceCaptureVersions.payloadDeletedAt)));
    await tx.update(rawSourceMaterial).set({ rawText: null, fileName: null, mimeType: null, byteSize: null, storageKey: null, rawMetadata: null }).where(eq(rawSourceMaterial.sourceId, sourceId));
    await tx.delete(knowledgeSourceSuggestions).where(eq(knowledgeSourceSuggestions.sourceId, sourceId));
    await tx.insert(auditEvents).values({ actorUserId: input.actor.userId, actorEmail: input.actor.email.trim().toLowerCase(), operation: "archive", targetType: "knowledge_source_removal", targetId: sourceId, afterSummary: `Source removal completed; reason=${input.reason}; affectedCardCount=${cardIds.length}.` });
    return { status: "completed" as const, sourceId, changedCardIds: cardIds };
  });
}
