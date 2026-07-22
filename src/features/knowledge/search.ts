import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeCardEvidence, knowledgeCards, knowledgeCardSearchDocuments, knowledgeCardSources, sourceCaptureVersions, sources, type KnowledgeSourceSupport } from "@/db/schema";
import { isKnowledgeCardTravelerEligible } from "@/features/knowledge/state";

const defaultSearchLimit = 5;
const maxSearchLimit = 10;
const maxSearchQueryLength = 500;
const maxSearchCandidateDocuments = 200;
const maxPracticalDetailEntries = 20;
const maxPracticalDetailKeyLength = 60;
const maxPracticalDetailValuesPerEntry = 10;
const maxOrderedStops = 40;
const maxPracticalDetailValueLength = 500;

type KnowledgeSearchDb = ReturnType<typeof getDb>;

export type KnowledgeSearchSource = Pick<
  typeof sources.$inferSelect,
  "id" | "kind" | "url" | "canonicalUrl" | "label" | "publisher" | "collectedDate" | "sourceType" | "verificationStatus" | "official" | "partner"
> & {
  supportLevel: KnowledgeSourceSupport;
};

export type KnowledgeSearchResult = Pick<
  typeof knowledgeCards.$inferSelect,
  "id" | "type" | "title" | "locationName" | "routeSegment" | "summary" | "practicalDetails" | "tags" | "confidence" | "freshnessSensitive" | "updatedAt" | "createdAt"
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
    let eligibleCard = await loadEligibleApprovedCard(transaction, normalizedCardId);

    if (eligibleCard) {
      for (const source of eligibleCard.sources.sort((left, right) => left.id.localeCompare(right.id))) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${source.id}, 44))`);
      }
      eligibleCard = await loadEligibleApprovedCard(transaction, normalizedCardId);
    }

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

  while (offset < maxSearchCandidateDocuments) {
    const currentBatchSize = Math.min(batchSize, maxSearchCandidateDocuments - offset);

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
          eq(knowledgeCards.publicationState, "active"),
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
        publicationState: knowledgeCards.publicationState,
        knowledgeState: knowledgeCards.knowledgeState,
        reviewState: knowledgeCards.reviewState,
        verificationState: knowledgeCards.verificationState,
        type: knowledgeCards.type,
        title: knowledgeCards.title,
        locationName: knowledgeCards.locationName,
        routeSegment: knowledgeCards.routeSegment,
        summary: knowledgeCards.summary,
        practicalDetails: knowledgeCards.practicalDetails,
        tags: knowledgeCards.tags,
        confidence: knowledgeCards.confidence,
        freshnessSensitive: knowledgeCards.freshnessSensitive,
        status: knowledgeCards.status,
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
    .leftJoin(sources, and(eq(sources.id, knowledgeCardSources.sourceId), eq(sources.eligibility, "eligible")))
    .where(eq(knowledgeCards.id, cardId));

  const grouped = groupSearchRows(rows)[0];
  const card = rows[0]?.card;
  const evidence = await loadActiveSupportingEvidence(db, cardId);
  const validatedSourceIds = new Set(evidence?.rows.map((row) => row.sourceId));
  const validatedSources = grouped?.sources.filter((source) => validatedSourceIds.has(source.id)) ?? [];
  if (!grouped || !card || !evidence || !isKnowledgeCardTravelerEligible({ ...card, ...evidence }) || validatedSources.length === 0) {
    return null;
  }

  return {
    ...grouped,
    sources: redactOperatorOnlySourceUrls(validatedSources, evidence.rows),
  };
}

async function loadActiveSupportingEvidence(db: Pick<KnowledgeSearchDb, "select">, cardId: string) {
  const evidenceRows = await db
    .select({
      displayPolicy: knowledgeCardEvidence.displayPolicy,
      sourceId: knowledgeCardEvidence.sourceId,
      capturePayloadAvailable: sql<boolean>`true`,
    })
    .from(knowledgeCardEvidence)
    .innerJoin(knowledgeCardSources, and(eq(knowledgeCardSources.knowledgeCardId, knowledgeCardEvidence.knowledgeCardId), eq(knowledgeCardSources.sourceId, knowledgeCardEvidence.sourceId)))
    .innerJoin(sources, and(eq(sources.id, knowledgeCardEvidence.sourceId), eq(sources.eligibility, "eligible")))
    .innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId), eq(sourceCaptureVersions.sourceId, knowledgeCardEvidence.sourceId)))
    .where(and(
      eq(knowledgeCardEvidence.knowledgeCardId, cardId),
      eq(knowledgeCardEvidence.state, "active"),
      or(eq(knowledgeCardEvidence.supportLevel, "primary"), eq(knowledgeCardEvidence.supportLevel, "supporting")),
      isNull(sourceCaptureVersions.payloadDeletedAt),
      sql`substring(${sourceCaptureVersions.rawText} from ${knowledgeCardEvidence.spanStart} + 1 for ${knowledgeCardEvidence.spanEnd} - ${knowledgeCardEvidence.spanStart}) = ${knowledgeCardEvidence.quoteText}`,
    ));

  return evidenceRows.length > 0 ? { activeSupportingEvidenceCount: evidenceRows.length, capturePayloadAvailable: true, rows: evidenceRows } : null;
}

function redactOperatorOnlySourceUrls(sources: KnowledgeSearchSource[], evidence: Array<{ sourceId: string; displayPolicy: string }>) {
  const operatorOnlySourceIds = new Set(evidence.filter((row) => row.displayPolicy === "operator_only").map((row) => row.sourceId));

  return sources.map((source) => operatorOnlySourceIds.has(source.id) ? { ...source, url: null, canonicalUrl: null } : source);
}

function groupSearchRows(
  rows: Array<{
    card: Omit<KnowledgeSearchResult, "score" | "sources"> & KnowledgeCardStateForSearch;
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

type KnowledgeCardStateForSearch = Pick<typeof knowledgeCards.$inferSelect, "publicationState" | "knowledgeState" | "reviewState" | "verificationState">;

function toSearchResult(card: Omit<KnowledgeSearchResult, "score" | "sources">): KnowledgeSearchResult {
  return {
    id: card.id,
    type: card.type,
    title: card.title,
    locationName: card.locationName,
    routeSegment: card.routeSegment,
    summary: card.summary,
    practicalDetails: card.practicalDetails,
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
    ...getPracticalDetailSearchValues(card.practicalDetails),
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

function getPracticalDetailSearchValues(details: Record<string, unknown>) {
  const entries = Object.entries(details);
  const orderedStops = entries.find(([key]) => key === "ordered_stops");
  const boundedEntries = entries.slice(0, maxPracticalDetailEntries);

  if (orderedStops && !boundedEntries.some(([key]) => key === "ordered_stops")) {
    boundedEntries[boundedEntries.length - 1] = orderedStops;
  }

  return boundedEntries
    .flatMap(([key, value]) => {
      const safeKey = normalizePracticalDetailValue(key, maxPracticalDetailKeyLength);
      const rawValues = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
      const maxValues = key === "ordered_stops" ? maxOrderedStops : maxPracticalDetailValuesPerEntry;
      const maxValueLength = key === "ordered_stops" ? 160 : maxPracticalDetailValueLength;
      const safeValues = rawValues.slice(0, maxValues).map((item) => normalizePracticalDetailValue(item, maxValueLength)).filter((item): item is string => Boolean(item));

      return safeKey ? [safeKey, ...safeValues] : safeValues;
    });
}

function normalizePracticalDetailValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
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
    // Facebook links are always operator-only; evidence policy can restrict other sources too.
    url: source.kind === "facebook" ? null : source.url,
    canonicalUrl: source.kind === "facebook" ? null : source.canonicalUrl,
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
