import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { KnowledgeDraftReviewPolicyError } from "@xuyenviet/domain";
import { getDb } from "./client";
import { transitionKnowledgeCard } from "./knowledge-lifecycle";
import { knowledgeCardEvidence, knowledgeCards, knowledgeCardSearchDocuments, knowledgeCardSources, knowledgeSourceSuggestions, sourceCaptureVersions, sources, type KnowledgeSourceSupport } from "./schema";

export type KnowledgeReviewActor = { userId: string; email: string };
export type KnowledgeDraftUpdateInput = { type: string; title: string; locationName?: string | null; routeSegment?: string | null; summary: string; practicalDetails?: unknown; tags?: unknown; confidence: string; freshnessSensitive?: boolean | string | null };
export type KnowledgeDraftReviewResult = { draftId: string };
export class KnowledgeDraftReviewError extends KnowledgeDraftReviewPolicyError {}
export function isKnowledgeDraftReviewError(error: unknown) { return error instanceof KnowledgeDraftReviewError; }

type Source = Pick<typeof sources.$inferSelect, "id" | "kind" | "url" | "canonicalUrl" | "label" | "publisher" | "collectedDate" | "sourceType" | "verificationStatus" | "official" | "partner"> & { supportLevel: KnowledgeSourceSupport };
type Card = Pick<typeof knowledgeCards.$inferSelect, "id" | "type" | "title" | "locationName" | "routeSegment" | "summary" | "practicalDetails" | "tags" | "confidence" | "freshnessSensitive" | "lifecycleState" | "knowledgeState" | "verificationRequirement" | "updatedAt" | "createdAt">;
export type KnowledgeDraftReviewCard = Card & { sources: Source[]; suggestion: { action: string; beforeSummary: string | null; afterSummary: string | null; conflictSummary: string | null; rationale: string | null; targetCard: { id: string; title: string } | null } | null };
export type ApprovedKnowledgeCard = Card & { sources: Source[] };
export type ApprovedKnowledgeIndexStatus = { state: "evidence_pending" | "indexed" | "needs_indexing" | "stale_index" | "inactive_index"; label: string; documentStatus: string | null; indexedAt: Date | null };
export type ApprovedKnowledgeCardWithIndexStatus = ApprovedKnowledgeCard & { indexStatus: ApprovedKnowledgeIndexStatus };

export async function listKnowledgeDraftsForReview() { return loadCards(eq(knowledgeCards.lifecycleState, "draft")); }
export async function getKnowledgeDraftForReview(id: string) { return (await loadCards(and(eq(knowledgeCards.id, id), eq(knowledgeCards.lifecycleState, "draft"))))[0] ?? null; }
export async function listApprovedKnowledgeCards() { return loadApproved(); }
export async function getApprovedKnowledgeCard(id: string) { return (await loadApproved(eq(knowledgeCards.id, id)))[0] ?? null; }
export async function listApprovedKnowledgeCardsWithIndexStatus() { const cards = await loadApproved(); const statuses = await getApprovedKnowledgeIndexStatuses(cards.map((card) => card.id)); return cards.map((card) => ({ ...card, indexStatus: statuses.get(card.id)! })); }
export async function getApprovedKnowledgeIndexStatuses(cardIds: string[]) {
  const rows = cardIds.length ? await getDb().select({ cardId: knowledgeCards.id, lifecycleState: knowledgeCards.lifecycleState, documentStatus: knowledgeCardSearchDocuments.status, indexedAt: knowledgeCardSearchDocuments.updatedAt, cardUpdatedAt: knowledgeCards.updatedAt }).from(knowledgeCards).leftJoin(knowledgeCardSearchDocuments, eq(knowledgeCardSearchDocuments.knowledgeCardId, knowledgeCards.id)).where(and(eq(knowledgeCards.lifecycleState, "active"))) : [];
  const requested = new Set(cardIds);
  return new Map(rows.filter((row) => requested.has(row.cardId)).map((row) => [row.cardId, row.documentStatus === "active" && row.indexedAt && row.indexedAt > row.cardUpdatedAt ? { state: "indexed" as const, label: "Đã index", documentStatus: row.documentStatus, indexedAt: row.indexedAt } : row.documentStatus ? { state: "stale_index" as const, label: "Index cần refresh", documentStatus: row.documentStatus, indexedAt: row.indexedAt } : { state: "needs_indexing" as const, label: "Chưa index", documentStatus: null, indexedAt: null }]));
}

export async function updateKnowledgeDraft(_id: string, _input: KnowledgeDraftUpdateInput, _actor: KnowledgeReviewActor): Promise<KnowledgeDraftReviewResult> { throw unavailable(); }
export async function rejectKnowledgeDraft(_id: string, _actor: KnowledgeReviewActor): Promise<KnowledgeDraftReviewResult> { throw unavailable(); }
export async function approveKnowledgeDraft(id: string, actor: KnowledgeReviewActor, expectedUpdatedAt?: string | null): Promise<KnowledgeDraftReviewResult> {
  const draft = await getKnowledgeDraftForReview(id);
  if (!draft || expectedUpdatedAt && draft.updatedAt.toISOString() !== expectedUpdatedAt) throw unavailable();
  const result = await getDb().transaction(async (transaction) => {
    await validateKnowledgeDraftApprovalInTransaction(transaction, id);
    const [card] = await transaction.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, id)).limit(1);
    if (!card) throw unavailable();
    return transitionKnowledgeCard({ actor: { kind: "user", userId: actor.userId, email: actor.email }, fences: card, trigger: { kind: "draft_publish", cardId: id } }, { transaction: (operation) => operation(transaction) } as ReturnType<typeof getDb>);
  });
  if (result.status !== "resolved") throw unavailable();
  return { draftId: id };
}
export async function approveKnowledgeDraftBatch(ids: string[], actor: KnowledgeReviewActor): Promise<{ draftIds: string[] }> {
  if (!ids.length) throw unavailable();
  const draftIds: string[] = [];
  for (const id of ids) draftIds.push((await approveKnowledgeDraft(id, actor)).draftId);
  return { draftIds };
}

async function loadApproved(condition = eq(knowledgeCards.lifecycleState, "active")) { return loadCards(condition) as Promise<ApprovedKnowledgeCard[]>; }
async function loadCards(condition: ReturnType<typeof eq> | ReturnType<typeof and>) {
  const rows = await getDb().select({ card: knowledgeCards, source: { id: sources.id, kind: sources.kind, url: sources.url, canonicalUrl: sources.canonicalUrl, label: sources.label, publisher: sources.publisher, collectedDate: sources.collectedDate, sourceType: sources.sourceType, verificationStatus: sources.verificationStatus, official: sources.official, partner: sources.partner, supportLevel: knowledgeCardSources.supportLevel }, suggestion: knowledgeSourceSuggestions, targetId: knowledgeCards.id }).from(knowledgeCards).leftJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id)).leftJoin(sources, eq(sources.id, knowledgeCardSources.sourceId)).leftJoin(knowledgeSourceSuggestions, eq(knowledgeSourceSuggestions.suggestedCardId, knowledgeCards.id)).where(condition).orderBy(desc(knowledgeCards.updatedAt));
  const cards = new Map<string, KnowledgeDraftReviewCard>();
  for (const row of rows) {
    const card = cards.get(row.card.id) ?? { ...row.card, sources: [], suggestion: row.suggestion ? { action: row.suggestion.action, beforeSummary: row.suggestion.beforeSummary, afterSummary: row.suggestion.afterSummary, conflictSummary: row.suggestion.conflictSummary, rationale: row.suggestion.rationale, targetCard: row.suggestion.targetCardId ? { id: row.suggestion.targetCardId, title: "" } : null } : null };
    if (row.source.id && row.source.kind && row.source.label && row.source.sourceType && row.source.verificationStatus && row.source.supportLevel && row.source.official !== null && row.source.partner !== null && !card.sources.some((source) => source.id === row.source.id)) card.sources.push(row.source as Source);
    cards.set(card.id, card);
  }
  return [...cards.values()];
}
function unavailable() { return new KnowledgeDraftReviewError("Knowledge lifecycle transitions require the Story 15.3 command.", "not_reviewable"); }
export async function validateKnowledgeDraftApprovalInTransaction(transaction: Pick<ReturnType<typeof getDb>, "select" | "execute">, id: string) {
  const links = await transaction.select({ sourceId: knowledgeCardSources.sourceId }).from(knowledgeCardSources).where(eq(knowledgeCardSources.knowledgeCardId, id));
  if (!links.length) throw unavailable();
  // Source locks precede the card lock everywhere provenance and lifecycle meet.
  for (const { sourceId } of links.sort((left, right) => left.sourceId.localeCompare(right.sourceId))) await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sourceId}, 44))`);
  const [card] = await transaction.select().from(knowledgeCards).where(and(eq(knowledgeCards.id, id), eq(knowledgeCards.lifecycleState, "draft"))).limit(1).for("update");
  if (!card || !card.title.trim() || !card.summary.trim() || !card.locationName?.trim() && !card.routeSegment?.trim()) throw unavailable();
  const evidence = await transaction.select({ id: knowledgeCardEvidence.id, rawText: sourceCaptureVersions.rawText, fileName: sourceCaptureVersions.fileName, storageKey: sourceCaptureVersions.storageKey, rawMetadata: sourceCaptureVersions.rawMetadata }).from(knowledgeCardEvidence).innerJoin(sources, eq(sources.id, knowledgeCardEvidence.sourceId)).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId)).where(and(eq(knowledgeCardEvidence.knowledgeCardId, id), eq(knowledgeCardEvidence.state, "active"), eq(sources.eligibility, "eligible"), eq(sources.currentCaptureVersionId, knowledgeCardEvidence.captureVersionId), isNull(sourceCaptureVersions.payloadDeletedAt)));
  if (!evidence.length || unsafeDraft(card, evidence.flatMap((row) => [row.rawText ?? "", row.fileName ?? "", row.storageKey ?? "", ...flattenStrings(row.rawMetadata)]))) throw unavailable();
}
function unsafeDraft(card: typeof knowledgeCards.$inferSelect, raw: Array<string | null>) { const values = [card.title, card.locationName, card.routeSegment, card.summary, ...card.tags, ...flattenStrings(card.practicalDetails)].filter((value): value is string => typeof value === "string"); const corpus = raw.filter((value): value is string => Boolean(value)).map(normalize).join(" "); return values.some((value) => { const normalized = normalize(value); return /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?84|0)(?:[\s.-]?\d){8,10}|provider[_-]?payload|storage[_-]?key|raw[_-]?metadata|raw[_-]?source)/i.test(value) || normalized.length >= 24 && corpus.includes(normalized); }); }
function flattenStrings(value: unknown): string[] { return typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(flattenStrings) : value && typeof value === "object" ? Object.entries(value).flatMap(([key, item]) => [key, ...flattenStrings(item)]) : []; }
function normalize(value: string) { return value.toLowerCase().replace(/\s+/g, " ").trim(); }
