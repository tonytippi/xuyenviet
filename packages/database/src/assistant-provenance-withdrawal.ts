import { and, asc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";

import { getDb } from "./client";
import { assistantProvenanceWithdrawalBackfillState, assistantResponseProvenance, knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, messages, sources, type SourceRemovalReason } from "./schema";

const contractKey = "v1";
const evidenceLockNamespace = 45;
const unavailableSnapshot = { unavailable: true };

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Database["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;
type WithdrawalDb = Database | Transaction;

export type ProvenanceWithdrawalAnchor = { sourceIds?: string[]; evidenceIds?: string[]; cardIds?: string[] };

export class ProvenanceWithdrawalBackfillError extends Error {
  constructor(readonly code: "withdrawal_backfill_required" | "withdrawal_backfill_failed" | "unclassifiable_anchor" | "owner_relation_unresolved") {
    super(code);
    this.name = "ProvenanceWithdrawalBackfillError";
  }
}

export async function requireCompletedAssistantProvenanceWithdrawalBackfill(db: WithdrawalDb) {
  const [state] = await db.select().from(assistantProvenanceWithdrawalBackfillState).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, contractKey)).limit(1).for("update");
  if (!state?.completedAt || state.failedAt || state.failureCode) throw new ProvenanceWithdrawalBackfillError(state?.failedAt || state?.failureCode ? "withdrawal_backfill_failed" : "withdrawal_backfill_required");
}

export async function lockAssistantProvenanceWithdrawalAnchors(db: WithdrawalDb, anchors: ProvenanceWithdrawalAnchor) {
  for (const sourceId of normalized(anchors.sourceIds)) await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sourceId}, 44))`);
  for (const evidenceId of normalized(anchors.evidenceIds)) await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${evidenceId}, ${evidenceLockNamespace}))`);
  for (const cardId of normalized(anchors.cardIds)) await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${cardId}, 46))`);
}

export async function withdrawAssistantProvenance(db: WithdrawalDb, anchors: ProvenanceWithdrawalAnchor, reason: SourceRemovalReason, now = new Date()) {
  await lockAssistantProvenanceWithdrawalAnchors(db, anchors);
  const candidateCondition = exactAnchorCandidateCondition(anchors);
  if (!candidateCondition) return { provenanceIds: [], provenanceCount: 0 };
  // JSONB containment compares structured values, so these candidates cannot match
  // an ID embedded in unrelated text. The bounded snapshots are parsed only after lock.
  const rows = await db.select().from(assistantResponseProvenance).where(and(eq(assistantResponseProvenance.sourceCategory, "knowledge"), candidateCondition)).orderBy(asc(assistantResponseProvenance.id)).for("update");
  const matched = rows.filter((row) => matchesAnchors(row, anchors));
  const messageIds = normalized(matched.map((row) => row.assistantMessageId));
  if (messageIds.length) await db.select({ id: messages.id }).from(messages).where(inArray(messages.id, messageIds)).orderBy(asc(messages.id)).for("update");
  const available = matched.filter((row) => row.availability === "available");
  if (available.length) {
    await db.update(assistantResponseProvenance).set({ availability: "withdrawn", withdrawnAt: now, withdrawalReason: reason, sourceSnapshot: unavailableSnapshot }).where(inArray(assistantResponseProvenance.id, available.map((row) => row.id)));
  }
  for (const messageId of messageIds) {
    const [message] = await db.select({ answerAnnotations: messages.answerAnnotations }).from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!message) continue;
    await db.update(messages).set({ answerAnnotations: removeDependentAnnotations(message.answerAnnotations, new Set(matched.map((row) => row.id))) }).where(eq(messages.id, messageId));
  }
  return { provenanceIds: matched.map((row) => row.id), provenanceCount: matched.length };
}

export async function classifyAssistantProvenanceRowsForInsertion(db: WithdrawalDb, rows: Array<typeof assistantResponseProvenance.$inferInsert>) {
  const knowledgeRows = rows.filter((row) => row.sourceCategory === "knowledge");
  const anchors = knowledgeRows.map((row) => {
    const extracted = extractHistoricalAnchors({ sourceReferenceId: row.sourceReferenceId ?? null, sourceReferenceType: row.sourceReferenceType ?? null, sourceSnapshot: row.sourceSnapshot ?? {} });
    if (!extracted || !hasAnchor(extracted)) throw new ProvenanceWithdrawalBackfillError("unclassifiable_anchor");
    return extracted;
  });
  await lockAssistantProvenanceWithdrawalAnchors(db, {
    sourceIds: anchors.flatMap((anchor) => anchor.sourceIds ?? []),
    evidenceIds: anchors.flatMap((anchor) => anchor.evidenceIds ?? []),
    cardIds: anchors.flatMap((anchor) => anchor.cardIds ?? []),
  });
  for (const [index, row] of knowledgeRows.entries()) {
    const rowAnchors = anchors[index]!;
    if (!await hasResolvedOwnerRelations(db, rowAnchors)) throw new ProvenanceWithdrawalBackfillError("owner_relation_unresolved");
    const withdrawn = await currentWithdrawalAnchors(db, rowAnchors);
    if (hasAnchor(withdrawn)) Object.assign(row, { availability: "withdrawn" as const, withdrawnAt: new Date(), withdrawalReason: "withdrawn" as const, sourceSnapshot: unavailableSnapshot });
  }
}

export async function backfillHistoricalAssistantProvenanceWithdrawal(input: { batchSize?: number; retryFailed?: boolean } = {}, database = getDb()) {
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 100, 500));
  return database.transaction(async (tx) => {
    const [state] = await tx.select().from(assistantProvenanceWithdrawalBackfillState).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, contractKey)).limit(1).for("update");
    if (!state) throw new ProvenanceWithdrawalBackfillError("withdrawal_backfill_required");
    if (state.completedAt && !state.failedAt && !state.failureCode) return { status: "completed" as const, scannedCount: 0 };
    if (state.failedAt || state.failureCode) {
      if (!input.retryFailed) return { status: "failed" as const, failureCode: state.failureCode };
      await tx.update(assistantProvenanceWithdrawalBackfillState).set({ failedAt: null, failureCode: null }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, contractKey));
    }
    const afterCheckpoint = state.cursorCreatedAt && state.cursorId
      ? or(gt(assistantResponseProvenance.createdAt, state.cursorCreatedAt), and(eq(assistantResponseProvenance.createdAt, state.cursorCreatedAt), gt(assistantResponseProvenance.id, state.cursorId)))
      : undefined;
    const rows = await tx.select().from(assistantResponseProvenance).where(and(lt(assistantResponseProvenance.createdAt, state.cutoverAt), afterCheckpoint)).orderBy(asc(assistantResponseProvenance.createdAt), asc(assistantResponseProvenance.id)).limit(batchSize);
    if (!rows.length) {
      await tx.update(assistantProvenanceWithdrawalBackfillState).set({ completedAt: new Date() }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, contractKey));
      return { status: "completed" as const, scannedCount: 0 };
    }
    try {
      await tx.transaction(async (batch) => {
        const knowledgeRows = rows.filter((row) => row.sourceCategory === "knowledge");
        const rowAnchors = knowledgeRows.map((row) => {
          const anchors = extractHistoricalAnchors(row);
          if (!anchors || !hasAnchor(anchors)) throw new ProvenanceWithdrawalBackfillError("unclassifiable_anchor");
          return anchors;
        });
        await lockAssistantProvenanceWithdrawalAnchors(batch, {
          sourceIds: rowAnchors.flatMap((anchors) => anchors.sourceIds ?? []),
          evidenceIds: rowAnchors.flatMap((anchors) => anchors.evidenceIds ?? []),
          cardIds: rowAnchors.flatMap((anchors) => anchors.cardIds ?? []),
        });
        // The shared anchors are acquired before the provenance row locks, matching
        // removal and insertion and preventing an opposite-order deadlock.
        const lockedRows = await batch.select().from(assistantResponseProvenance).where(inArray(assistantResponseProvenance.id, rows.map((row) => row.id))).orderBy(asc(assistantResponseProvenance.createdAt), asc(assistantResponseProvenance.id)).for("update");
        for (const row of lockedRows) {
          if (row.sourceCategory !== "knowledge") continue;
          const anchors = extractHistoricalAnchors(row)!;
          if (!await hasResolvedOwnerRelations(batch, anchors)) throw new ProvenanceWithdrawalBackfillError("owner_relation_unresolved");
          const withdrawn = await currentWithdrawalAnchors(batch, anchors);
          if (hasAnchor(withdrawn)) await withdrawAssistantProvenance(batch, withdrawn, "withdrawn");
        }
      });
    } catch (error) {
      if (!(error instanceof ProvenanceWithdrawalBackfillError)) throw error;
      await tx.update(assistantProvenanceWithdrawalBackfillState).set({ failedAt: new Date(), failureCode: error.code }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, contractKey));
      return { status: "failed" as const, failureCode: error.code };
    }
    const last = rows[rows.length - 1];
    await tx.update(assistantProvenanceWithdrawalBackfillState).set({ cursorCreatedAt: last.createdAt, cursorId: last.id }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, contractKey));
    return { status: "progressed" as const, scannedCount: rows.length };
  });
}

export function extractHistoricalAnchors(row: Pick<typeof assistantResponseProvenance.$inferSelect, "sourceReferenceId" | "sourceReferenceType" | "sourceSnapshot">): ProvenanceWithdrawalAnchor | null {
  const snapshot = isRecord(row.sourceSnapshot) ? row.sourceSnapshot : null;
  const sourceIds: string[] = [];
  const evidenceIds: string[] = [];
  const cardIds: string[] = [];
  if (row.sourceReferenceType === "knowledge_card" && nonblank(row.sourceReferenceId)) cardIds.push(row.sourceReferenceId);
  if ((row.sourceReferenceType === "knowledge_source" || row.sourceReferenceType === "source") && nonblank(row.sourceReferenceId)) sourceIds.push(row.sourceReferenceId);
  if ((row.sourceReferenceType === "knowledge_evidence" || row.sourceReferenceType === "evidence") && nonblank(row.sourceReferenceId)) evidenceIds.push(row.sourceReferenceId);
  if (!snapshot) return cardIds.length ? { cardIds } : null;
  if (nonblank(snapshot.knowledgeCardId)) cardIds.push(snapshot.knowledgeCardId);
  if (snapshot.evidence !== undefined && !Array.isArray(snapshot.evidence)) return null;
  for (const evidence of Array.isArray(snapshot.evidence) ? snapshot.evidence : []) {
    if (!isRecord(evidence)) return null;
    if (nonblank(evidence.sourceId)) sourceIds.push(evidence.sourceId);
    if (nonblank(evidence.evidenceId)) evidenceIds.push(evidence.evidenceId);
  }
  if (snapshot.sources !== undefined && !Array.isArray(snapshot.sources)) return null;
  for (const source of Array.isArray(snapshot.sources) ? snapshot.sources : []) {
    if (!isRecord(source) || !nonblank(source.sourceId)) return null;
    sourceIds.push(source.sourceId);
  }
  const anchors = { sourceIds: normalized(sourceIds), evidenceIds: normalized(evidenceIds), cardIds: normalized(cardIds) };
  return hasAnchor(anchors) ? anchors : null;
}

async function currentWithdrawalAnchors(db: WithdrawalDb, anchors: ProvenanceWithdrawalAnchor): Promise<ProvenanceWithdrawalAnchor> {
  const sourceIds = normalized(anchors.sourceIds);
  const evidenceIds = normalized(anchors.evidenceIds);
  const cardIds = normalized(anchors.cardIds);
  const withdrawnSources = sourceIds.length ? await db.select({ id: sources.id }).from(sources).where(and(inArray(sources.id, sourceIds), eq(sources.eligibility, "withdrawn"))) : [];
  const removedEvidence = evidenceIds.length ? await db.select({ id: knowledgeCardEvidence.id, sourceId: knowledgeCardEvidence.sourceId, cardId: knowledgeCardEvidence.knowledgeCardId }).from(knowledgeCardEvidence).where(and(inArray(knowledgeCardEvidence.id, evidenceIds), eq(knowledgeCardEvidence.state, "removed"))) : [];
  // A withdrawn source invalidates every direct evidence anchor it owns. Returning
  // those IDs preserves evidence-first matching without broad source-only matches.
  const sourceEvidence = withdrawnSources.length ? await db.select({ id: knowledgeCardEvidence.id, sourceId: knowledgeCardEvidence.sourceId }).from(knowledgeCardEvidence).where(inArray(knowledgeCardEvidence.sourceId, withdrawnSources.map((row) => row.id))) : [];
  const withdrawnCardIds = cardIds.length ? await withdrawnCards(db, cardIds) : [];
  return { sourceIds: [...withdrawnSources.map((row) => row.id), ...removedEvidence.map((row) => row.sourceId)], evidenceIds: [...removedEvidence.map((row) => row.id), ...sourceEvidence.map((row) => row.id)], cardIds: withdrawnCardIds };
}

function matchesAnchors(row: typeof assistantResponseProvenance.$inferSelect, anchors: ProvenanceWithdrawalAnchor) {
  const rowAnchors = extractHistoricalAnchors(row);
  if (!rowAnchors) return false;
  // A card is a fallback identity only. A direct source/evidence anchor remains
  // authoritative and prevents a broadly affected card from withdrawing it.
  // Evidence is the most specific historic identity. A row that recorded direct
  // evidence must not be withdrawn merely because another evidence row shares its
  // source. Source matching is retained only for legacy source-only snapshots.
  if (normalized(rowAnchors.evidenceIds).length) return overlaps(rowAnchors.evidenceIds, anchors.evidenceIds);
  if (normalized(rowAnchors.sourceIds).length) return overlaps(rowAnchors.sourceIds, anchors.sourceIds);
  return overlaps(rowAnchors.cardIds, anchors.cardIds);
}

function exactAnchorCandidateCondition(anchors: ProvenanceWithdrawalAnchor) {
  const sourceIds = normalized(anchors.sourceIds);
  const evidenceIds = normalized(anchors.evidenceIds);
  const cardIds = normalized(anchors.cardIds);
  const conditions = [
    sourceIds.length ? and(inArray(assistantResponseProvenance.sourceReferenceType, ["knowledge_source", "source"]), inArray(assistantResponseProvenance.sourceReferenceId, sourceIds)) : undefined,
    evidenceIds.length ? and(inArray(assistantResponseProvenance.sourceReferenceType, ["knowledge_evidence", "evidence"]), inArray(assistantResponseProvenance.sourceReferenceId, evidenceIds)) : undefined,
    cardIds.length ? and(eq(assistantResponseProvenance.sourceReferenceType, "knowledge_card"), inArray(assistantResponseProvenance.sourceReferenceId, cardIds)) : undefined,
    ...cardIds.map((cardId) => sql`${assistantResponseProvenance.sourceSnapshot} @> ${JSON.stringify({ knowledgeCardId: cardId })}::jsonb`),
    ...sourceIds.flatMap((sourceId) => [
      sql`${assistantResponseProvenance.sourceSnapshot} @> ${JSON.stringify({ evidence: [{ sourceId }] })}::jsonb`,
      sql`${assistantResponseProvenance.sourceSnapshot} @> ${JSON.stringify({ sources: [{ sourceId }] })}::jsonb`,
    ]),
    ...evidenceIds.map((evidenceId) => sql`${assistantResponseProvenance.sourceSnapshot} @> ${JSON.stringify({ evidence: [{ evidenceId }] })}::jsonb`),
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);
  return conditions.length ? or(...conditions) : undefined;
}

async function hasResolvedOwnerRelations(db: WithdrawalDb, anchors: ProvenanceWithdrawalAnchor) {
  const sourceIds = normalized(anchors.sourceIds);
  const evidenceIds = normalized(anchors.evidenceIds);
  const cardIds = normalized(anchors.cardIds);
  if (sourceIds.length && (await db.select({ id: sources.id }).from(sources).where(inArray(sources.id, sourceIds))).length !== sourceIds.length) return false;
  const evidence = evidenceIds.length ? await db.select({ id: knowledgeCardEvidence.id, sourceId: knowledgeCardEvidence.sourceId, cardId: knowledgeCardEvidence.knowledgeCardId }).from(knowledgeCardEvidence).where(inArray(knowledgeCardEvidence.id, evidenceIds)) : [];
  if (evidence.length !== evidenceIds.length) return false;
  if (cardIds.length && (await db.select({ id: knowledgeCards.id }).from(knowledgeCards).where(inArray(knowledgeCards.id, cardIds))).length !== cardIds.length) return false;
  if (cardIds.length && evidence.some((row) => !cardIds.includes(row.cardId))) return false;
  if (sourceIds.length && evidence.some((row) => !sourceIds.includes(row.sourceId))) return false;
  if (cardIds.length && sourceIds.length) {
    const links = await db.select({ cardId: knowledgeCardSources.knowledgeCardId, sourceId: knowledgeCardSources.sourceId }).from(knowledgeCardSources).where(and(inArray(knowledgeCardSources.knowledgeCardId, cardIds), inArray(knowledgeCardSources.sourceId, sourceIds)));
    if (new Set(links.map((link) => link.sourceId)).size !== sourceIds.length) return false;
  }
  return true;
}

async function withdrawnCards(db: WithdrawalDb, cardIds: string[]) {
  const existingCards = await db.select({ id: knowledgeCards.id }).from(knowledgeCards).where(inArray(knowledgeCards.id, cardIds));
  const evidence = await db.select({ cardId: knowledgeCardEvidence.knowledgeCardId, state: knowledgeCardEvidence.state, eligibility: sources.eligibility }).from(knowledgeCardEvidence).innerJoin(sources, eq(sources.id, knowledgeCardEvidence.sourceId)).where(inArray(knowledgeCardEvidence.knowledgeCardId, cardIds));
  return existingCards.map((card) => card.id).filter((cardId) => !evidence.some((row) => row.cardId === cardId && row.state === "active" && row.eligibility === "eligible"));
}

function removeDependentAnnotations(value: unknown, withdrawnIds: Set<string>) {
  if (!Array.isArray(value)) return [];
  return value.filter((annotation) => {
    if (!isRecord(annotation) || !isRecord(annotation.detail) || !Array.isArray(annotation.detail.provenanceIds)) return true;
    return !annotation.detail.provenanceIds.some((id) => typeof id === "string" && withdrawnIds.has(id));
  });
}

function normalized(values: Array<string | null | undefined> | undefined) { return [...new Set((values ?? []).filter((value): value is string => nonblank(value)))].sort(); }
function overlaps(left: string[] | undefined, right: string[] | undefined) { return normalized(left).some((value) => normalized(right).includes(value)); }
function hasAnchor(anchors: ProvenanceWithdrawalAnchor) { return normalized(anchors.sourceIds).length + normalized(anchors.evidenceIds).length + normalized(anchors.cardIds).length > 0; }
function nonblank(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
