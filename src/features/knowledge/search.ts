import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, ilike, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeCards, knowledgeCardSearchDocuments, knowledgeCardSources, sources, type KnowledgeSourceSupport } from "@/db/schema";

const defaultSearchLimit = 5;
const maxSearchLimit = 10;
const maxSearchQueryLength = 500;
const maxSearchCandidateDocuments = 200;

type KnowledgeSearchDb = ReturnType<typeof getDb>;

export type KnowledgeSearchSource = Pick<
  typeof sources.$inferSelect,
  "id" | "kind" | "url" | "canonicalUrl" | "label" | "publisher" | "collectedDate" | "sourceType" | "verificationStatus" | "official" | "partner"
> & {
  supportLevel: KnowledgeSourceSupport;
};

export type KnowledgeSearchResult = Pick<
  typeof knowledgeCards.$inferSelect,
  "id" | "type" | "title" | "locationName" | "routeSegment" | "summary" | "tags" | "confidence" | "freshnessSensitive" | "updatedAt" | "createdAt"
> & {
  score: number;
  sources: KnowledgeSearchSource[];
};

export async function indexApprovedKnowledgeCard(cardId: string) {
  const normalizedCardId = cardId.trim();

  if (!normalizedCardId) {
    throw new KnowledgeSearchError("Knowledge card ID is required.", "invalid_card");
  }

  const db = getDb();
  return db.transaction(async (transaction) => {
    const eligibleCard = await loadEligibleApprovedCard(transaction, normalizedCardId);

    if (!eligibleCard) {
      await disableKnowledgeSearchDocument(normalizedCardId, "disabled", transaction);
      return { cardId: normalizedCardId, indexed: false as const };
    }

    const searchableText = buildSearchableText(eligibleCard);
    const textHash = hashSearchableText(searchableText);
    const now = getSearchDocumentUpdatedAt(eligibleCard.updatedAt);

    const [document] = await transaction
      .insert(knowledgeCardSearchDocuments)
      .values({
        knowledgeCardId: eligibleCard.id,
        status: "active",
        searchableText,
        textHash,
        sourceCount: eligibleCard.sources.length,
        confidence: eligibleCard.confidence,
        freshnessSensitive: eligibleCard.freshnessSensitive,
        updatedAt: now,
        disabledAt: null,
      })
      .onConflictDoUpdate({
        target: knowledgeCardSearchDocuments.knowledgeCardId,
        set: {
          status: "active",
          searchableText,
          textHash,
          sourceCount: eligibleCard.sources.length,
          confidence: eligibleCard.confidence,
          freshnessSensitive: eligibleCard.freshnessSensitive,
          updatedAt: now,
          disabledAt: null,
        },
      })
      .returning();

    return { cardId: eligibleCard.id, indexed: true as const, document };
  });
}

export async function disableKnowledgeSearchDocument(cardId: string, status: "disabled" | "stale" = "disabled", db: Pick<KnowledgeSearchDb, "update"> = getDb()) {
  const normalizedCardId = cardId.trim();

  if (!normalizedCardId) {
    throw new KnowledgeSearchError("Knowledge card ID is required.", "invalid_card");
  }

  const now = new Date();

  await db
    .update(knowledgeCardSearchDocuments)
    .set({ status, updatedAt: now, disabledAt: now })
    .where(and(eq(knowledgeCardSearchDocuments.knowledgeCardId, normalizedCardId), eq(knowledgeCardSearchDocuments.status, "active")));
}

export async function searchApprovedKnowledge(query: string | null | undefined, options: { limit?: number } = {}): Promise<KnowledgeSearchResult[]> {
  const { results } = await searchApprovedKnowledgeInternal(query, options, false);

  return results;
}

export async function searchApprovedKnowledgeWithCandidateCount(query: string | null | undefined, options: { limit?: number } = {}): Promise<{ results: KnowledgeSearchResult[]; candidateCount: number }> {
  return searchApprovedKnowledgeInternal(query, options, true);
}

async function searchApprovedKnowledgeInternal(query: string | null | undefined, options: { limit?: number }, countAllCandidates: boolean): Promise<{ results: KnowledgeSearchResult[]; candidateCount: number }> {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return { results: [], candidateCount: 0 };
  }

  const limit = normalizeSearchLimit(options.limit);
  const terms = getSearchTerms(normalizedQuery);
  const batchSize = Math.max(limit * 3, 30);
  let offset = 0;
  const db = getDb();
  const results: KnowledgeSearchResult[] = [];
  let candidateCount = 0;
  const scoredDocuments: Array<{ knowledgeCardId: string; searchableText: string; updatedAt: Date; score: number }> = [];

  while (countAllCandidates || offset < maxSearchCandidateDocuments) {
    const currentBatchSize = countAllCandidates ? batchSize : Math.min(batchSize, maxSearchCandidateDocuments - offset);

    if (currentBatchSize <= 0) {
      break;
    }

    const matchingDocuments = await db
      .select({ knowledgeCardId: knowledgeCardSearchDocuments.knowledgeCardId, searchableText: knowledgeCardSearchDocuments.searchableText, updatedAt: knowledgeCardSearchDocuments.updatedAt })
      .from(knowledgeCardSearchDocuments)
      .innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSearchDocuments.knowledgeCardId))
      .where(
        and(
          eq(knowledgeCardSearchDocuments.status, "active"),
          eq(knowledgeCards.status, "approved"),
          eq(knowledgeCards.needsReview, false),
          or(...terms.map((term) => ilike(knowledgeCardSearchDocuments.searchableText, `%${escapeLikePattern(term)}%`))),
        ),
      )
      .orderBy(desc(knowledgeCardSearchDocuments.updatedAt))
      .limit(currentBatchSize)
      .offset(offset);

    if (matchingDocuments.length === 0) {
      break;
    }

    scoredDocuments.push(...matchingDocuments.map((document) => ({ ...document, score: scoreSearchDocument(document.searchableText, terms) })).filter((document) => document.score > 0));

    if (matchingDocuments.length < currentBatchSize) {
      break;
    }

    offset += currentBatchSize;
  }

  scoredDocuments.sort((left, right) => right.score - left.score || right.updatedAt.getTime() - left.updatedAt.getTime());

  for (const document of scoredDocuments) {
    if (!countAllCandidates && results.length >= limit) {
      break;
    }

    const card = await loadEligibleApprovedCard(db, document.knowledgeCardId);

    if (card) {
      candidateCount += 1;

      if (results.length < limit) {
        results.push({ ...card, score: document.score });
      }
    } else {
      await disableKnowledgeSearchDocument(document.knowledgeCardId, "disabled", db);
    }
  }

  return { results, candidateCount: countAllCandidates ? candidateCount : results.length };
}

export class KnowledgeSearchError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_card",
  ) {
    super(message);
    this.name = "KnowledgeSearchError";
  }
}

async function loadEligibleApprovedCard(db: Pick<KnowledgeSearchDb, "select">, cardId: string) {
  const rows = await db
    .select({
      card: {
        id: knowledgeCards.id,
        status: knowledgeCards.status,
        type: knowledgeCards.type,
        title: knowledgeCards.title,
        locationName: knowledgeCards.locationName,
        routeSegment: knowledgeCards.routeSegment,
        summary: knowledgeCards.summary,
        tags: knowledgeCards.tags,
        confidence: knowledgeCards.confidence,
        freshnessSensitive: knowledgeCards.freshnessSensitive,
        needsReview: knowledgeCards.needsReview,
        updatedAt: knowledgeCards.updatedAt,
        createdAt: knowledgeCards.createdAt,
      },
      source: {
        id: sources.id,
        kind: sources.kind,
        url: sources.url,
        canonicalUrl: sources.canonicalUrl,
        label: sources.label,
        publisher: sources.publisher,
        collectedDate: sources.collectedDate,
        sourceType: sources.sourceType,
        verificationStatus: sources.verificationStatus,
        official: sources.official,
        partner: sources.partner,
        supportLevel: knowledgeCardSources.supportLevel,
      },
    })
    .from(knowledgeCards)
    .leftJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id))
    .leftJoin(sources, eq(sources.id, knowledgeCardSources.sourceId))
    .where(and(eq(knowledgeCards.id, cardId), eq(knowledgeCards.status, "approved"), eq(knowledgeCards.needsReview, false)));

  const grouped = groupSearchRows(rows)[0];
  return grouped && grouped.sources.length > 0 ? grouped : null;
}

function groupSearchRows(
  rows: Array<{
    card: Omit<KnowledgeSearchResult, "score" | "sources"> & { status: typeof knowledgeCards.$inferSelect.status; needsReview: boolean };
    source: JoinedKnowledgeSearchSource | null;
  }>,
) {
  const cards = new Map<string, Omit<KnowledgeSearchResult, "score">>();

  for (const row of rows) {
    const existing = cards.get(row.card.id);
    const card = existing ?? { ...toSearchResult(row.card), sources: [] };
    const source = normalizeJoinedSource(row.source);

    if (source && !card.sources.some((existingSource) => existingSource.id === source.id)) {
      card.sources.push(source);
    }

    cards.set(row.card.id, card);
  }

  return Array.from(cards.values());
}

function toSearchResult(card: Omit<KnowledgeSearchResult, "score" | "sources">): KnowledgeSearchResult {
  return {
    id: card.id,
    type: card.type,
    title: card.title,
    locationName: card.locationName,
    routeSegment: card.routeSegment,
    summary: card.summary,
    tags: card.tags,
    confidence: card.confidence,
    freshnessSensitive: card.freshnessSensitive,
    updatedAt: card.updatedAt,
    createdAt: card.createdAt,
    score: 0,
    sources: [],
  };
}

function buildSearchableText(card: Omit<KnowledgeSearchResult, "score">) {
  const values = [
    card.title,
    card.type,
    card.locationName,
    card.routeSegment,
    card.summary,
    ...card.tags,
    card.confidence,
    card.freshnessSensitive ? "freshness sensitive" : null,
    ...card.sources.flatMap((source) => [
      source.kind,
      source.label,
      source.publisher,
      source.collectedDate,
      source.sourceType,
      source.verificationStatus,
      source.official ? "official" : null,
      source.partner ? "partner" : null,
      source.supportLevel,
      source.canonicalUrl,
      source.url,
    ]),
  ];

  return values.map(normalizeSearchableValue).filter((value): value is string => Boolean(value)).join("\n");
}

function hashSearchableText(searchableText: string) {
  return createHash("sha256").update(searchableText).digest("hex");
}

function getSearchDocumentUpdatedAt(cardUpdatedAt: Date) {
  return new Date(Math.max(Date.now(), cardUpdatedAt.getTime() + 1));
}

type JoinedKnowledgeSearchSource = {
  id: string | null;
  kind: KnowledgeSearchSource["kind"] | null;
  url: string | null;
  canonicalUrl: string | null;
  label: string | null;
  publisher: string | null;
  collectedDate: string | null;
  sourceType: KnowledgeSearchSource["sourceType"] | null;
  verificationStatus: KnowledgeSearchSource["verificationStatus"] | null;
  official: boolean | null;
  partner: boolean | null;
  supportLevel: KnowledgeSearchSource["supportLevel"] | null;
};

function normalizeJoinedSource(source: JoinedKnowledgeSearchSource | null): KnowledgeSearchSource | null {
  if (!source?.id || !source.kind || !source.label || !source.sourceType || !source.verificationStatus || !source.supportLevel || source.official === null || source.partner === null) {
    return null;
  }

  return {
    id: source.id,
    kind: source.kind,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    label: source.label,
    publisher: source.publisher,
    collectedDate: source.collectedDate,
    sourceType: source.sourceType,
    verificationStatus: source.verificationStatus,
    official: source.official,
    partner: source.partner,
    supportLevel: source.supportLevel,
  };
}

function normalizeSearchQuery(query: string | null | undefined) {
  if (typeof query !== "string") {
    return "";
  }

  return query.toLowerCase().replace(/\s+/g, " ").trim().slice(0, maxSearchQueryLength).trim();
}

function normalizeSearchableValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSearchLimit(limit: number | undefined) {
  if (!Number.isInteger(limit)) {
    return defaultSearchLimit;
  }

  return Math.min(Math.max(limit ?? defaultSearchLimit, 1), maxSearchLimit);
}

function getSearchTerms(normalizedQuery: string) {
  const rawTerms = normalizedQuery.split(" ").filter(Boolean);
  const significantTerms = rawTerms.filter((term) => term.length > 2);
  const selectedTerms = Array.from(new Set([...significantTerms, ...rawTerms])).slice(0, 12);

  return selectedTerms.length > 0 ? selectedTerms : rawTerms.slice(0, 12);
}

function scoreSearchDocument(searchableText: string, terms: string[]) {
  const normalizedText = searchableText.toLowerCase();
  return terms.reduce((score, term) => {
    if (!normalizedText.includes(term)) {
      return score;
    }

    return score + (term.length > 2 ? 2 : 1);
  }, 0);
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
