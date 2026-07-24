import "server-only";

import { createHash } from "node:crypto";

import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeCardEvidence, knowledgeCards, knowledgeCardSearchDocuments, knowledgeCardSources, sourceCaptureVersions, sources, type KnowledgeSourceSupport } from "@/db/schema";
import { evaluateKnowledgeTravelerPolicy, type KnowledgeTravelerPolicy, type KnowledgeTravelerPolicyReason } from "@/features/knowledge/state";
import { enqueueKnowledgeIndexWork } from "@/features/knowledge/indexing-queue";

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

export type KnowledgeSearchEvidence = {
  evidenceId: string;
  sourceId: string;
  supportLevel: KnowledgeSourceSupport;
  displayPolicy: "traveler_visible" | "fact_only";
  sourceLabel: string;
  sourceType: "curated" | "community";
  verificationStatus: "verified" | "unverified";
  official: boolean;
  partner: boolean;
  collectedDate: string | null;
  observedAt: string;
  url: string | null;
  quote: string | null;
};

export type KnowledgeSearchResult = Pick<
  typeof knowledgeCards.$inferSelect,
  "id" | "type" | "title" | "locationName" | "routeSegment" | "summary" | "practicalDetails" | "tags" | "confidence" | "freshnessSensitive" | "publicationState" | "knowledgeState" | "reviewState" | "verificationState" | "conditions" | "contentVersion" | "evidenceSetRevision" | "updatedAt" | "createdAt"
> & {
  score: number;
  policy: Exclude<KnowledgeTravelerPolicy, "exclude">;
  policyReasons: KnowledgeTravelerPolicyReason[];
  sources: KnowledgeSearchSource[];
  /** Retrieval-owned, policy-evaluated evidence. Consumers must not re-read evidence. */
  evidence?: KnowledgeSearchEvidence[];
};

export type KnowledgeSearchPolicySummary = {
  excludedPolicyCounts: { conflict: number; verificationRequired: number; other: number };
  excludedReasonCodes: KnowledgeTravelerPolicyReason[];
};

type KnowledgeSearchCardSnapshot = Omit<KnowledgeSearchResult, "score" | "policy" | "policyReasons" | "sources">;

type ActiveSupportingEvidenceRow = {
  displayPolicy: "traveler_visible" | "fact_only" | "operator_only";
  evidenceId: string;
  sourceId: string;
  sourceKind: "url" | "facebook" | "youtube" | "copied_post" | "pasted_text" | "screenshot";
  independenceKey: string;
  supportLevel: KnowledgeSourceSupport;
  quoteText: string;
  observedAt: Date;
  sourceLabel: string | null;
  sourceType: "curated" | "community" | null;
  verificationStatus: "verified" | "unverified" | null;
  official: boolean | null;
  partner: boolean | null;
  collectedDate: string | null;
  sourceUrl: string | null;
  canonicalUrl: string | null;
};

/**
 * Compatibility-only projection entrypoint. Production workers must provide the
 * claimed marker identity and fence so an obsolete version cannot win a race.
 */
export async function projectClaimedKnowledgeIndexWork(input: { markerId: string; cardId: string; contentVersion: number; fencingToken: string; now?: Date }, db = getDb()) {
  return db.transaction(async (transaction) => {
    // Lock and validate the claim before any projection write, including a first insert.
    const [claim] = await transaction.execute(sql`select id from knowledge_index_dirty_markers where id = ${input.markerId} and knowledge_card_id = ${input.cardId} and content_version = ${input.contentVersion} and status = 'claimed' and fencing_token = ${input.fencingToken} and lease_expires_at > clock_timestamp() for update`) as Array<{ id: string }>;
    if (!claim) return { cardId: input.cardId, indexed: false as const, outcome: "lost_claim" as const };
    const [version] = await transaction.select({ contentVersion: knowledgeCards.contentVersion }).from(knowledgeCards).where(eq(knowledgeCards.id, input.cardId)).limit(1);
    if (!version || version.contentVersion !== input.contentVersion) return { cardId: input.cardId, indexed: false as const, outcome: "superseded" as const };
    let eligibleCard = await loadEligibleApprovedCard(transaction, input.cardId);
    if (eligibleCard) {
      for (const source of eligibleCard.sources.sort((left, right) => left.id.localeCompare(right.id))) await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${source.id}, 44))`);
    }
    const [lockedVersion] = await transaction.select({ contentVersion: knowledgeCards.contentVersion }).from(knowledgeCards).where(eq(knowledgeCards.id, input.cardId)).limit(1).for("update");
    if (!lockedVersion || lockedVersion.contentVersion !== input.contentVersion) return { cardId: input.cardId, indexed: false as const, outcome: "superseded" as const };
    eligibleCard = await loadEligibleApprovedCard(transaction, input.cardId);
    const claimIsCurrent = sql`exists (select 1 from knowledge_index_dirty_markers marker where marker.id = ${input.markerId} and marker.knowledge_card_id = ${input.cardId} and marker.content_version = ${input.contentVersion} and marker.status = 'claimed' and marker.fencing_token = ${input.fencingToken} and marker.lease_expires_at > clock_timestamp())`;
    if (!eligibleCard) {
      await transaction.execute(sql`update knowledge_card_search_documents document set status = 'disabled', disabled_at = clock_timestamp(), updated_at = clock_timestamp(), content_version = ${input.contentVersion}, accepted_fence = ${input.fencingToken} where document.knowledge_card_id = ${input.cardId} and document.content_version <= ${input.contentVersion} and ${claimIsCurrent}`);
      return { cardId: input.cardId, indexed: false as const, outcome: "disabled" as const };
    }
    const searchableText = buildSearchableText(eligibleCard);
    const textHash = hashSearchableText(searchableText);
    const [document] = await transaction.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: eligibleCard.id, contentVersion: input.contentVersion, acceptedFence: input.fencingToken, status: "active", searchableText, textHash, sourceCount: eligibleCard.sources.length, confidence: eligibleCard.confidence, freshnessSensitive: eligibleCard.freshnessSensitive, updatedAt: sql`clock_timestamp()`, disabledAt: null }).onConflictDoUpdate({ target: knowledgeCardSearchDocuments.knowledgeCardId, set: { contentVersion: input.contentVersion, acceptedFence: input.fencingToken, status: "active", searchableText, textHash, sourceCount: eligibleCard.sources.length, confidence: eligibleCard.confidence, freshnessSensitive: eligibleCard.freshnessSensitive, updatedAt: sql`clock_timestamp()`, disabledAt: null }, where: sql`${knowledgeCardSearchDocuments.contentVersion} <= ${input.contentVersion} and ${claimIsCurrent}` }).returning();
    return document ? { cardId: eligibleCard.id, indexed: true as const, outcome: "indexed" as const } : { cardId: input.cardId, indexed: false as const, outcome: "lost_claim" as const };
  });
}

/** Compatibility entry point: request paths may enqueue work but never project it. */
export async function indexApprovedKnowledgeCard(cardId: string) {
  const normalizedCardId = cardId.trim();

  if (!normalizedCardId) {
    throw new KnowledgeSearchError("Knowledge card ID is required.", "invalid_card");
  }

  const db = getDb();
  const [card] = await db.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, normalizedCardId)).limit(1);
  if (!card) throw new KnowledgeSearchError("Knowledge card ID is required.", "invalid_card");
  await db.transaction((tx) => enqueueKnowledgeIndexWork(tx, { cardId: normalizedCardId, contentVersion: card.contentVersion, evidenceSetRevision: card.evidenceSetRevision, reason: "compatibility" }));
  return { cardId: normalizedCardId, indexed: false as const };
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

export async function searchApprovedKnowledgeWithCandidateCount(query: string | null | undefined, options: { limit?: number } = {}): Promise<{ results: KnowledgeSearchResult[]; candidateCount: number; policySummary: KnowledgeSearchPolicySummary }> {
  return searchApprovedKnowledgeInternal(query, options, true);
}

async function searchApprovedKnowledgeInternal(query: string | null | undefined, options: { limit?: number }, countAllCandidates: boolean): Promise<{ results: KnowledgeSearchResult[]; candidateCount: number; policySummary: KnowledgeSearchPolicySummary }> {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return { results: [], candidateCount: 0, policySummary: emptyKnowledgeSearchPolicySummary() };
  }

  const limit = normalizeSearchLimit(options.limit);
  const terms = getSearchTerms(normalizedQuery);
  const batchSize = Math.max(limit * 3, 30);
  let offset = 0;
  const db = getDb();
  const results: KnowledgeSearchResult[] = [];
  let candidateCount = 0;
  const policySummary = emptyKnowledgeSearchPolicySummary();
  const scoredDocuments: Array<{ knowledgeCardId: string; contentVersion: number; searchableText: string; updatedAt: Date; score: number }> = [];

  while (offset < maxSearchCandidateDocuments) {
    const currentBatchSize = Math.min(batchSize, maxSearchCandidateDocuments - offset);

    if (currentBatchSize <= 0) {
      break;
    }

    const matchingDocuments = await db
      .select({ knowledgeCardId: knowledgeCardSearchDocuments.knowledgeCardId, contentVersion: knowledgeCardSearchDocuments.contentVersion, searchableText: knowledgeCardSearchDocuments.searchableText, updatedAt: knowledgeCardSearchDocuments.updatedAt })
      .from(knowledgeCardSearchDocuments)
      .innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSearchDocuments.knowledgeCardId))
      .where(
        and(
          eq(knowledgeCardSearchDocuments.status, "active"),
          eq(knowledgeCards.publicationState, "active"),
          eq(knowledgeCardSearchDocuments.contentVersion, knowledgeCards.contentVersion),
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

    const candidate = await loadApprovedKnowledgeCandidate(db, document.knowledgeCardId);
    const card = candidate.card;

    if (card && document.contentVersion === card.contentVersion) {
      candidateCount += 1;

      if (results.length < limit) {
        results.push({ ...card, score: document.score });
      }
    } else if (candidate.exclusion && document.contentVersion === candidate.contentVersion) {
      recordExcludedCandidatePolicy(policySummary, candidate.exclusion);
    }
  }

  return { results, candidateCount: countAllCandidates ? candidateCount : results.length, policySummary };
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

export async function isKnowledgeCardEligibleForProjection(db: Pick<KnowledgeSearchDb, "select">, cardId: string) {
  return Boolean(await loadEligibleApprovedCard(db, cardId));
}

async function loadEligibleApprovedCard(db: Pick<KnowledgeSearchDb, "select">, cardId: string) {
  return (await loadApprovedKnowledgeCandidate(db, cardId)).card;
}

async function loadApprovedKnowledgeCandidate(db: Pick<KnowledgeSearchDb, "select">, cardId: string): Promise<{
  card: Omit<KnowledgeSearchResult, "score"> | null;
  contentVersion: number | null;
  exclusion: { knowledgeState: string; verificationState: string; reasons: KnowledgeTravelerPolicyReason[] } | null;
}> {
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
        conditions: knowledgeCards.conditions,
        contentVersion: knowledgeCards.contentVersion,
        evidenceSetRevision: knowledgeCards.evidenceSetRevision,
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
  const evaluation = card && evidence
    ? evaluateKnowledgeTravelerPolicy({ ...card, ...evidence })
    : { policy: "exclude" as const, reasons: ["missing_traveler_safe_evidence" as const] };
  if (!grouped || !card || !evidence || evaluation.policy === "exclude" || validatedSources.length === 0) {
    return {
      card: null,
      contentVersion: card?.contentVersion ?? null,
      exclusion: card ? { knowledgeState: card.knowledgeState, verificationState: card.verificationState, reasons: evaluation.reasons } : null,
    };
  }

  return {
    card: {
      ...grouped,
      policy: evaluation.policy,
      policyReasons: evaluation.reasons,
      sources: validatedSources,
      evidence: evidence.rows.map(toKnowledgeSearchEvidence),
    },
    contentVersion: card.contentVersion,
    exclusion: null,
  };
}

function emptyKnowledgeSearchPolicySummary(): KnowledgeSearchPolicySummary {
  return { excludedPolicyCounts: { conflict: 0, verificationRequired: 0, other: 0 }, excludedReasonCodes: [] };
}

function recordExcludedCandidatePolicy(summary: KnowledgeSearchPolicySummary, exclusion: { knowledgeState: string; verificationState: string; reasons: KnowledgeTravelerPolicyReason[] }) {
  if (exclusion.knowledgeState === "conflicted") {
    summary.excludedPolicyCounts.conflict += 1;
  } else if (exclusion.verificationState === "required" || exclusion.verificationState === "failed") {
    summary.excludedPolicyCounts.verificationRequired += 1;
  } else {
    summary.excludedPolicyCounts.other += 1;
  }

  for (const reason of exclusion.reasons) {
    if (!summary.excludedReasonCodes.includes(reason)) {
      summary.excludedReasonCodes.push(reason);
    }
  }
}

async function loadActiveSupportingEvidence(db: Pick<KnowledgeSearchDb, "select">, cardId: string) {
  const evidenceRows = await db
    .select({
      displayPolicy: knowledgeCardEvidence.displayPolicy,
      evidenceId: knowledgeCardEvidence.id,
      sourceId: knowledgeCardEvidence.sourceId,
      sourceKind: sources.kind,
      independenceKey: knowledgeCardEvidence.independenceKey,
      supportLevel: knowledgeCardEvidence.supportLevel,
      quoteText: knowledgeCardEvidence.quoteText,
      observedAt: knowledgeCardEvidence.observedAt,
      sourceLabel: sources.label,
      sourceType: sources.sourceType,
      verificationStatus: sources.verificationStatus,
      official: sources.official,
      partner: sources.partner,
      collectedDate: sources.collectedDate,
      sourceUrl: sources.url,
      canonicalUrl: sources.canonicalUrl,
    })
    .from(knowledgeCardEvidence)
     .innerJoin(knowledgeCardSources, and(eq(knowledgeCardSources.knowledgeCardId, knowledgeCardEvidence.knowledgeCardId), eq(knowledgeCardSources.sourceId, knowledgeCardEvidence.sourceId)))
     .innerJoin(sources, and(eq(sources.id, knowledgeCardEvidence.sourceId), eq(sources.eligibility, "eligible")))
     .innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId), eq(sourceCaptureVersions.sourceId, knowledgeCardEvidence.sourceId)))
    .where(and(
      eq(knowledgeCardEvidence.knowledgeCardId, cardId),
       eq(knowledgeCardEvidence.state, "active"),
       or(eq(knowledgeCardEvidence.supportLevel, "primary"), eq(knowledgeCardEvidence.supportLevel, "supporting")),
       or(eq(knowledgeCardEvidence.displayPolicy, "fact_only"), eq(knowledgeCardEvidence.displayPolicy, "traveler_visible")),
       sql`${sources.kind} = ${sourceCaptureVersions.captureKind} and ${sources.kind} in ('url', 'facebook', 'youtube')`,
       isNull(sourceCaptureVersions.payloadDeletedAt),
       sql`substring(${sourceCaptureVersions.rawText} from ${knowledgeCardEvidence.spanStart} + 1 for ${knowledgeCardEvidence.spanEnd} - ${knowledgeCardEvidence.spanStart}) = ${knowledgeCardEvidence.quoteText}`,
    ))
    .orderBy(
      asc(sql`case ${knowledgeCardEvidence.supportLevel} when 'primary' then 0 else 1 end`),
      desc(knowledgeCardEvidence.observedAt),
      asc(knowledgeCardEvidence.id),
    );

  return evidenceRows.length > 0
    ? {
      activeTravelerSafeEvidenceCount: evidenceRows.length,
      activeTravelerSafeIndependenceKeyCount: new Set(evidenceRows.map((row) => row.independenceKey)).size,
      rows: evidenceRows,
    }
    : null;
}

function toKnowledgeSearchEvidence(row: ActiveSupportingEvidenceRow): KnowledgeSearchEvidence {
  const sourceUrl = safeHttpUrl(row.sourceUrl) ?? safeHttpUrl(row.canonicalUrl);
  const travelerVisible = row.displayPolicy === "traveler_visible" && row.sourceKind !== "facebook" && Boolean(sourceUrl) && row.sourceLabel && row.sourceType && row.verificationStatus && row.official !== null && row.partner !== null && isTravelerSafeEvidenceText(row.quoteText);

  return {
    evidenceId: row.evidenceId,
    sourceId: row.sourceId,
    supportLevel: row.supportLevel,
    displayPolicy: travelerVisible ? "traveler_visible" : "fact_only",
    sourceLabel: row.sourceLabel ?? "",
    sourceType: row.sourceType ?? "community",
    verificationStatus: row.verificationStatus ?? "unverified",
    official: row.official ?? false,
    partner: row.partner ?? false,
    collectedDate: row.collectedDate,
    observedAt: row.observedAt.toISOString(),
    url: travelerVisible ? sourceUrl : null,
    quote: travelerVisible ? row.quoteText : null,
  };
}

function isTravelerSafeEvidenceText(value: string) {
  return !/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?84|0)(?:[\s.-]?\d){8,10}|provider[_-]?payload|storage[_-]?key|raw[_-]?metadata|raw[_-]?source)/i.test(value);
}

function safeHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function groupSearchRows(
  rows: Array<{
    card: KnowledgeSearchCardSnapshot & KnowledgeCardStateForSearch;
    source: JoinedKnowledgeSearchSource | null;
  }>,
) {
  const cards = new Map<string, Omit<KnowledgeSearchResult, "score" | "policy" | "policyReasons">>();

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

type KnowledgeCardStateForSearch = Pick<typeof knowledgeCards.$inferSelect, "publicationState" | "knowledgeState" | "reviewState" | "verificationState" | "conditions" | "contentVersion" | "evidenceSetRevision">;

function toSearchResult(card: KnowledgeSearchCardSnapshot): Omit<KnowledgeSearchResult, "score" | "policy" | "policyReasons"> {
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
    publicationState: card.publicationState,
    knowledgeState: card.knowledgeState,
    reviewState: card.reviewState,
    verificationState: card.verificationState,
    conditions: card.conditions,
    contentVersion: card.contentVersion,
    evidenceSetRevision: card.evidenceSetRevision,
    updatedAt: card.updatedAt,
    createdAt: card.createdAt,
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
