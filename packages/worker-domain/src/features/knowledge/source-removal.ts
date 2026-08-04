import "server-only";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@xuyenviet/database";
import { knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeIngestionJobs, knowledgeRecommendations, knowledgeSourceSuggestions, rawSourceMaterial, sourceCaptureVersions, sources, type SourceRemovalReason } from "@xuyenviet/database";
import { recordAuditEvent } from "../audit/events";
import { createUserAuditActor } from "../audit/actors";
import { lockAssistantProvenanceWithdrawalAnchors, requireCompletedAssistantProvenanceWithdrawalBackfill, withdrawAssistantProvenance } from "../retrieval/provenance";

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
    const lockedEvidence = await tx.select({ id: knowledgeCardEvidence.id, state: knowledgeCardEvidence.state }).from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.sourceId, sourceId)).for("update");

    const remediation = await withdrawAssistantProvenance(tx, { sourceIds: [sourceId], evidenceIds: lockedEvidence.map((item) => item.id), cardIds }, input.reason, now);
    if (source.eligibility === "withdrawn") return { status: "already_completed" as const, sourceId, changedCardIds: cardIds };

    await tx.update(sources).set({ eligibility: "withdrawn", removalReason: input.reason, removedByUserId: input.actor.userId, removalCompletedAt: now, currentCaptureVersionId: null }).where(eq(sources.id, sourceId));
    const activeEvidenceIds = lockedEvidence.filter((item) => item.state === "active").map((item) => item.id);
    if (activeEvidenceIds.length > 0) await tx.update(knowledgeCardEvidence).set({ state: "removed", withdrawalReason: input.reason }).where(inArray(knowledgeCardEvidence.id, activeEvidenceIds));

    // Story 15.3 owns card lifecycle, recommendation, and projection transitions.

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
    const remediation = await withdrawAssistantProvenance(tx, { sourceIds: [evidence.sourceId], evidenceIds: [evidence.id], cardIds: [evidence.cardId] }, input.reason);
    if (evidence.state === "removed") return { status: "already_completed" as const, evidenceId, provenanceCount: remediation.provenanceCount };
    await tx.update(knowledgeCardEvidence).set({ state: "removed", withdrawalReason: input.reason }).where(eq(knowledgeCardEvidence.id, evidence.id));
    const now = new Date();
    await recordAuditEvent({ actor: createUserAuditActor({ userId: input.actor.userId, email: input.actor.email.trim().toLowerCase() }), operation: "archive", targetType: "knowledge_evidence_withdrawal", targetId: evidence.id, afterSummary: `Evidence withdrawal completed; sourceId=${evidence.sourceId}; cardId=${evidence.cardId}; reason=${input.reason}; provenanceCount=${remediation.provenanceCount}.` }, tx);
    return { status: "completed" as const, evidenceId, provenanceCount: remediation.provenanceCount };
  });
}
