import { and, desc, eq } from "drizzle-orm";

import { KnowledgeDraftReviewPolicyError } from "@xuyenviet/domain";
import { getDb } from "./client";
import { knowledgeCards, knowledgeCardSearchDocuments, knowledgeCardSources, knowledgeSourceSuggestions, sources, type KnowledgeSourceSupport } from "./schema";

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
export async function approveKnowledgeDraft(_id: string, _actor: KnowledgeReviewActor, _expectedUpdatedAt?: string | null): Promise<KnowledgeDraftReviewResult> { throw unavailable(); }
export async function approveKnowledgeDraftBatch(_ids: string[], _actor: KnowledgeReviewActor): Promise<{ draftIds: string[] }> { throw unavailable(); }

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
