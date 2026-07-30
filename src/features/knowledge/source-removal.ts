import "server-only";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { disableStaleKnowledgeSearchProjection, enqueueKnowledgeIndexWork } from "@/features/knowledge/indexing-queue";
import { knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeRecommendations, knowledgeSourceSuggestions, rawSourceMaterial, sourceCaptureVersions, sources, type SourceRemovalReason } from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
import { createUserAuditActor } from "@/features/audit/actors";
import { lockAssistantProvenanceWithdrawalAnchors, requireCompletedAssistantProvenanceWithdrawalBackfill, withdrawAssistantProvenance } from "@/features/retrieval/provenance";

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
    await requireCompletedAssistantProvenanceWithdrawalBackfill(tx);
    // Serialize against ingestion before discovering its evidence and card anchors.
    await lockAssistantProvenanceWithdrawalAnchors(tx, { sourceIds: [sourceId] });
    const [source] = await tx.select({ id: sources.id, eligibility: sources.eligibility }).from(sources).where(eq(sources.id, sourceId)).limit(1).for("update");
    if (!source) throw new SourceRemovalError("Source does not exist.");
    const evidence = await tx.select({ id: knowledgeCardEvidence.id, knowledgeCardId: knowledgeCardEvidence.knowledgeCardId }).from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.sourceId, sourceId)).orderBy(knowledgeCardEvidence.knowledgeCardId);
    const links = await tx.select({ knowledgeCardId: knowledgeCardSources.knowledgeCardId }).from(knowledgeCardSources).where(eq(knowledgeCardSources.sourceId, sourceId)).orderBy(knowledgeCardSources.knowledgeCardId);
    const cardIds = [...new Set([...evidence.map((item) => item.knowledgeCardId), ...links.map((item) => item.knowledgeCardId)])].sort();
    await lockAssistantProvenanceWithdrawalAnchors(tx, { evidenceIds: evidence.map((item) => item.id), cardIds });
    for (const cardId of cardIds) {
      await tx.select({ id: knowledgeCards.id }).from(knowledgeCards).where(eq(knowledgeCards.id, cardId)).limit(1).for("update");
    }
    const now = new Date();
    for (const cardId of cardIds) {
      await tx.select({ id: knowledgeRecommendations.id }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.knowledgeCardId, cardId), inArray(knowledgeRecommendations.status, ["open", "in_review"]))).orderBy(knowledgeRecommendations.id).for("update");
    }
    const lockedEvidence = await tx.select({ id: knowledgeCardEvidence.id, state: knowledgeCardEvidence.state }).from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.sourceId, sourceId)).for("update");

    const remediation = await withdrawAssistantProvenance(tx, { sourceIds: [sourceId], evidenceIds: lockedEvidence.map((item) => item.id), cardIds }, input.reason, now);
    if (source.eligibility === "withdrawn") return { status: "already_completed" as const, sourceId, changedCardIds: cardIds };

    await tx.update(sources).set({ eligibility: "withdrawn", removalReason: input.reason, removedByUserId: input.actor.userId, removalCompletedAt: now, currentCaptureVersionId: null }).where(eq(sources.id, sourceId));
    const activeEvidenceIds = lockedEvidence.filter((item) => item.state === "active").map((item) => item.id);
    if (activeEvidenceIds.length > 0) await tx.update(knowledgeCardEvidence).set({ state: "removed", withdrawalReason: input.reason }).where(inArray(knowledgeCardEvidence.id, activeEvidenceIds));

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
      await tx.update(knowledgeRecommendations).set({ status: "superseded", resolution: "accepted", resolvedByUserId: input.actor.userId, resolvedAt: now, executorSystem: null, updatedAt: now }).where(and(eq(knowledgeRecommendations.knowledgeCardId, cardId), inArray(knowledgeRecommendations.status, ["open", "in_review"])));
       await enqueueKnowledgeIndexWork(tx, { cardId, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, reason: "source_removal" });
      // Reindex from remaining evidence before a projection can become active again.
       await disableStaleKnowledgeSearchProjection(tx, cardId, updated.contentVersion, now);
      await recordAuditEvent({ actor: createUserAuditActor({ userId: input.actor.userId, email: input.actor.email.trim().toLowerCase() }), operation: "archive", targetType: "knowledge_source_removal_card", targetId: cardId, afterSummary: `Source removal changed evidence eligibility; sourceId=${sourceId}; card remains traveler-eligible=${!ineligible}.` }, tx);
    }

    await tx.update(sourceCaptureVersions).set({ rawText: null, fileName: null, mimeType: null, byteSize: null, storageKey: null, rawMetadata: null, payloadDeletedAt: now }).where(and(eq(sourceCaptureVersions.sourceId, sourceId), isNull(sourceCaptureVersions.payloadDeletedAt)));
    await tx.update(rawSourceMaterial).set({ rawText: null, fileName: null, mimeType: null, byteSize: null, storageKey: null, rawMetadata: null }).where(eq(rawSourceMaterial.sourceId, sourceId));
    await tx.delete(knowledgeSourceSuggestions).where(eq(knowledgeSourceSuggestions.sourceId, sourceId));
    await recordAuditEvent({ actor: createUserAuditActor({ userId: input.actor.userId, email: input.actor.email.trim().toLowerCase() }), operation: "archive", targetType: "knowledge_source_removal", targetId: sourceId, afterSummary: `Source removal completed; reason=${input.reason}; affectedCardCount=${cardIds.length}; provenanceCount=${remediation.provenanceCount}.` }, tx);
    return { status: "completed" as const, sourceId, changedCardIds: cardIds };
  });
}

export async function withdrawKnowledgeEvidence(
  input: { evidenceId: string; reason: SourceRemovalReason; actor: { userId: string; email: string } },
  db = getDb(),
) {
  const evidenceId = input.evidenceId.trim();
  if (!evidenceId || !removalReasons.has(input.reason) || !input.actor.userId.trim() || !input.actor.email.trim()) throw new SourceRemovalError("Evidence withdrawal input is invalid.");
  return db.transaction(async (tx) => {
    await requireCompletedAssistantProvenanceWithdrawalBackfill(tx);
    const [discovered] = await tx.select({ id: knowledgeCardEvidence.id, sourceId: knowledgeCardEvidence.sourceId, cardId: knowledgeCardEvidence.knowledgeCardId }).from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.id, evidenceId)).limit(1);
    if (!discovered) throw new SourceRemovalError("Evidence does not exist.");
    await lockAssistantProvenanceWithdrawalAnchors(tx, { sourceIds: [discovered.sourceId], evidenceIds: [evidenceId], cardIds: [discovered.cardId] });
    const [evidence] = await tx.select({ id: knowledgeCardEvidence.id, sourceId: knowledgeCardEvidence.sourceId, cardId: knowledgeCardEvidence.knowledgeCardId, state: knowledgeCardEvidence.state }).from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.id, evidenceId)).limit(1).for("update");
    if (!evidence) throw new SourceRemovalError("Evidence does not exist.");
    await tx.select({ id: sources.id }).from(sources).where(eq(sources.id, evidence.sourceId)).limit(1).for("update");
    await tx.select({ id: knowledgeCards.id }).from(knowledgeCards).where(eq(knowledgeCards.id, evidence.cardId)).limit(1).for("update");
    await tx.select({ id: knowledgeRecommendations.id }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.knowledgeCardId, evidence.cardId), inArray(knowledgeRecommendations.status, ["open", "in_review"]))).orderBy(knowledgeRecommendations.id).for("update");
    const remediation = await withdrawAssistantProvenance(tx, { sourceIds: [evidence.sourceId], evidenceIds: [evidence.id], cardIds: [evidence.cardId] }, input.reason);
    if (evidence.state === "removed") return { status: "already_completed" as const, evidenceId, provenanceCount: remediation.provenanceCount };
    await tx.update(knowledgeCardEvidence).set({ state: "removed", withdrawalReason: input.reason }).where(eq(knowledgeCardEvidence.id, evidence.id));
    const now = new Date();
    const remaining = await tx.select({ independenceKey: knowledgeCardEvidence.independenceKey }).from(knowledgeCardEvidence)
      .innerJoin(sources, and(eq(sources.id, knowledgeCardEvidence.sourceId), eq(sources.eligibility, "eligible")))
      .innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId), eq(sourceCaptureVersions.sourceId, knowledgeCardEvidence.sourceId)))
      .where(and(eq(knowledgeCardEvidence.knowledgeCardId, evidence.cardId), eq(knowledgeCardEvidence.state, "active"), or(eq(knowledgeCardEvidence.supportLevel, "primary"), eq(knowledgeCardEvidence.supportLevel, "supporting")), isNull(sourceCaptureVersions.payloadDeletedAt), sql`substring(${sourceCaptureVersions.rawText} from ${knowledgeCardEvidence.spanStart} + 1 for ${knowledgeCardEvidence.spanEnd} - ${knowledgeCardEvidence.spanStart}) = ${knowledgeCardEvidence.quoteText}`)).for("update");
    const [card] = await tx.select({ publicationState: knowledgeCards.publicationState, knowledgeState: knowledgeCards.knowledgeState, verificationState: knowledgeCards.verificationState }).from(knowledgeCards).where(eq(knowledgeCards.id, evidence.cardId)).limit(1);
    if (card) {
      const supportCount = new Set(remaining.map((item) => item.independenceKey)).size;
      const ineligible = supportCount === 0 || card.knowledgeState === "conflicted" || card.knowledgeState === "superseded" || card.verificationState === "failed";
      const downgradePattern = card.knowledgeState === "community_pattern" && supportCount < 2;
      const [updated] = await tx.update(knowledgeCards).set({ evidenceSetRevision: sql`${knowledgeCards.evidenceSetRevision} + 1`, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: now, ...(ineligible && card.publicationState === "active" ? { publicationState: "suppressed" as const } : {}), ...(downgradePattern ? { knowledgeState: "community_observation" as const } : {}) }).where(eq(knowledgeCards.id, evidence.cardId)).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
      if (updated) {
        await tx.update(knowledgeRecommendations).set({ status: "superseded", resolution: "accepted", resolvedByUserId: input.actor.userId, resolvedAt: now, executorSystem: null, updatedAt: now }).where(and(eq(knowledgeRecommendations.knowledgeCardId, evidence.cardId), inArray(knowledgeRecommendations.status, ["open", "in_review"])));
        await enqueueKnowledgeIndexWork(tx, { cardId: evidence.cardId, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, reason: "source_removal" });
        await disableStaleKnowledgeSearchProjection(tx, evidence.cardId, updated.contentVersion, now);
      }
    }
    await recordAuditEvent({ actor: createUserAuditActor({ userId: input.actor.userId, email: input.actor.email.trim().toLowerCase() }), operation: "archive", targetType: "knowledge_evidence_withdrawal", targetId: evidence.id, afterSummary: `Evidence withdrawal completed; sourceId=${evidence.sourceId}; cardId=${evidence.cardId}; reason=${input.reason}; provenanceCount=${remediation.provenanceCount}.` }, tx);
    return { status: "completed" as const, evidenceId, provenanceCount: remediation.provenanceCount };
  });
}
