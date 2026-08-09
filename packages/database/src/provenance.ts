import { sql } from "drizzle-orm";

import { toStateAwareKnowledgeBundleItem, type StateAwareKnowledgeBundleItem } from "./approved-knowledge";
import { classifyAssistantProvenanceRowsForInsertion } from "./assistant-provenance-withdrawal";
import { getDb } from "./client";
import { assistantResponseProvenance, assistantRetrievalDecisions, type AssistantProvenanceSourceCategory } from "./schema";
import type { ContextPrioritySourceBundle, PromptUsageLedger } from "./source-bundle";

const maxSnapshotStringLength = 500;
const maxSnapshotArrayItems = 5;
const maxSnapshotDepth = 4;

type Database = ReturnType<typeof getDb>;
export type ProvenanceDb = Database | (Parameters<Database["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never);

type AssistantProvenanceRow = Pick<typeof assistantResponseProvenance.$inferSelect,
  "id" | "sourceCategory" | "rank" | "retrievalScore" | "sourceType" | "verificationStatus" | "usedInPrompt" | "citedInAnswer" | "sourceSnapshot"
> & { availability?: "available" | "withdrawn" };

export type AvailableAssistantMessageProvenanceItem = {
  id: string;
  rank: number;
  availability?: "available";
  sourceCategory: AssistantProvenanceSourceCategory;
  title: string;
  sourceType: string | null;
  url: string | null;
  checkedAt: string | null;
  confidenceLabel: string;
  verificationStatus: "verified" | "unverified";
  usedInPrompt: boolean;
  citedInAnswer: boolean;
  retrievalScore: number | null;
  freshnessSensitive: boolean;
  usePolicy?: "contextual_use" | "caveat_only" | "do_not_use" | null;
  conditions?: string[];
  evidence?: Array<{
    sourceLabel: string;
    sourceType: string | null;
    url: string | null;
    quote: string | null;
  }>;
};

export type AssistantMessageProvenanceItem = AvailableAssistantMessageProvenanceItem | {
  id: string;
  rank: number;
  availability: "withdrawn";
  unavailableLabel: "Nguồn này không còn khả dụng.";
  usedInPrompt: boolean;
  citedInAnswer: boolean;
};

export async function persistAssistantAnswerProvenance(db: ProvenanceDb, input: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  tripAnswerContextSnapshotId?: string | null;
  sourceBundle: ContextPrioritySourceBundle;
  promptUsage?: PromptUsageLedger;
  reportedSourceHandles?: string[] | null;
}) {
  // This boundary must own a transaction even for root-DB callers: its writer
  // admission, locks, classification, and insert must share one session.
  return db.transaction((transaction) => persistAssistantAnswerProvenanceInTransaction(transaction, input));
}

async function persistAssistantAnswerProvenanceInTransaction(db: Exclude<ProvenanceDb, Database>, input: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  tripAnswerContextSnapshotId?: string | null;
  sourceBundle: ContextPrioritySourceBundle;
  promptUsage?: PromptUsageLedger;
  reportedSourceHandles?: string[] | null;
}) {
  const { userId, conversationId, userMessageId, assistantMessageId, tripAnswerContextSnapshotId, sourceBundle, promptUsage, reportedSourceHandles } = input;

  // The migration takes this same key exclusively. It drains coordinated
  // finalization before cutover while its table lock fences legacy inserts.
  await db.execute(sql`select pg_advisory_xact_lock_shared(918040112)`);

  await db.insert(assistantRetrievalDecisions).values({
    userId,
    conversationId,
    userMessageId,
    assistantMessageId,
    tripAnswerContextSnapshotId: tripAnswerContextSnapshotId ?? null,
    approvedKnowledgeCandidateCount: sourceBundle.retrievalDecision.approvedKnowledgeCandidateCount,
    approvedKnowledgeSelectedCount: sourceBundle.retrievalDecision.approvedKnowledgeSelectedCount,
    approvedKnowledgeTargetCount: sourceBundle.retrievalDecision.approvedKnowledgeTargetCount,
    approvedKnowledgeRelevanceThreshold: sourceBundle.retrievalDecision.approvedKnowledgeRelevanceThreshold,
    broadPlanningQuestion: sourceBundle.retrievalDecision.broadPlanningQuestion,
    freshnessRequired: sourceBundle.retrievalDecision.freshnessRequired,
    conflictDetected: sourceBundle.retrievalDecision.conflictDetected,
    webSearchTriggered: sourceBundle.retrievalDecision.webSearchTriggered,
    webSearchTriggerReasons: sourceBundle.retrievalDecision.webSearchTriggerReasons,
    generalReasoningUsed: sourceBundle.retrievalDecision.generalReasoningUsed,
    warnings: sourceBundle.warnings,
    selectedKnowledgeCardIds: sourceBundle.retrievalDecision.knowledgePolicySummary?.selectedCardIds ?? sourceBundle.knowledge.map((item) => item.id),
    knowledgePolicySnapshot: sourceBundle.retrievalDecision.knowledgePolicySummary ?? null,
  });

  const rows = buildProvenanceRows({ userId, conversationId, userMessageId, assistantMessageId, tripAnswerContextSnapshotId, sourceBundle, promptUsage, reportedSourceHandles });

  if (rows.length > 0) {
    await classifyAssistantProvenanceRowsForInsertion(db, rows);
    // The migration trigger rejects legacy writers. This transaction-local flag is
    // set only at the sole coordinated insertion boundary.
    await db.execute(sql`select set_config('xuyenviet.provenance_writer_contract', 'v1', true)`);
    const insertedRows = await db.insert(assistantResponseProvenance).values(rows).returning();
    return formatAssistantMessageProvenance(insertedRows);
  }

  return [];
}

function resolveReportedSourceReferences(promptUsage: PromptUsageLedger | undefined, reportedHandles: string[] | null | undefined) {
  if (!promptUsage || !reportedHandles || new Set(reportedHandles).size !== reportedHandles.length) return [];
  const referenced = new Set(reportedHandles);
  const handles = promptUsage.sourceHandles;
  if (!handles || handles.length > 8 || [...referenced].some((handle) => !handles.some((candidate) => candidate.handle === handle))) return [];
  return handles.flatMap((handle) => {
    if (!referenced.has(handle.handle)) return [];
    return [handle];
  });
}

export function formatAssistantMessageProvenance(rows: AssistantProvenanceRow[]): AssistantMessageProvenanceItem[] {
  return rows
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map((row) => {
      if (row.availability === "withdrawn") {
        return { id: row.id, rank: row.rank, availability: "withdrawn" as const, unavailableLabel: "Nguồn này không còn khả dụng." as const, usedInPrompt: row.usedInPrompt, citedInAnswer: row.citedInAnswer };
      }
      const snapshot = isRecord(row.sourceSnapshot) ? row.sourceSnapshot : {};
      return {
        id: row.id,
        rank: row.rank,
        availability: "available" as const,
        sourceCategory: row.sourceCategory,
        title: getSourceTitle(row.sourceCategory, snapshot),
        sourceType: getOptionalString(snapshot.sourceType) ?? row.sourceType,
        url: getSafeTravelerUrl(getOptionalString(snapshot.url) ?? getKnowledgeSourceString(snapshot, "canonicalUrl") ?? getKnowledgeSourceString(snapshot, "url")),
        checkedAt: getOptionalString(snapshot.checkedAt) ?? getKnowledgeSourceString(snapshot, "collectedDate"),
        confidenceLabel: getConfidenceLabel(row.sourceCategory, row.verificationStatus, snapshot),
        verificationStatus: row.verificationStatus,
        usedInPrompt: row.usedInPrompt,
        citedInAnswer: row.citedInAnswer,
        retrievalScore: row.retrievalScore,
        freshnessSensitive: snapshot.freshnessSensitive === true || isFreshnessSensitiveWebTrigger(snapshot.triggerReason),
        usePolicy: getUsePolicy(snapshot.usePolicy),
        conditions: getBoundedStrings(snapshot.conditions),
        evidence: getTravelerEvidence(snapshot.evidence),
      };
    });
}

function buildProvenanceRows({
  userId,
  conversationId,
  userMessageId,
  assistantMessageId,
  tripAnswerContextSnapshotId,
  sourceBundle,
  promptUsage,
  reportedSourceHandles,
}: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  tripAnswerContextSnapshotId?: string | null;
  sourceBundle: ContextPrioritySourceBundle;
  promptUsage?: PromptUsageLedger;
  reportedSourceHandles?: string[] | null;
}) {
  const rows: Array<typeof assistantResponseProvenance.$inferInsert> = [];
  let rank = 1;
  const citedSources = resolveReportedSourceReferences(promptUsage, reportedSourceHandles);

  for (const [index, fact] of sourceBundle.chatTripContext.tripProjectFacts.entries()) {
    rows.push(createRow({ userId, conversationId, userMessageId, assistantMessageId, tripAnswerContextSnapshotId, rank: rank++, sourceCategory: "trip_context", verificationStatus: "verified", sourceType: fact.field, usedInPrompt: promptUsage?.tripProjectFactIndexes.includes(index) ?? false, sourceSnapshot: { field: fact.field, source: fact.source } }));
  }

  for (const [index, fact] of sourceBundle.chatTripContext.chatFacts.entries()) {
    rows.push(createRow({ userId, conversationId, userMessageId, assistantMessageId, tripAnswerContextSnapshotId, rank: rank++, sourceCategory: "chat_context", verificationStatus: "verified", sourceType: fact.field, usedInPrompt: promptUsage?.chatFactIndexes.includes(index) ?? false, sourceSnapshot: { field: fact.field, source: fact.source } }));
  }

  for (const knowledge of sourceBundle.knowledge) {
    const result = toStateAwareKnowledgeBundleItem(knowledge);
    rows.push(createRow({
      userId,
      conversationId,
      userMessageId,
      assistantMessageId,
      tripAnswerContextSnapshotId,
      rank: rank++,
      sourceCategory: "knowledge",
      sourceReferenceId: result.cardId,
      sourceReferenceType: "knowledge_card",
      retrievalScore: result.score,
      sourceType: result.type,
        verificationStatus: result.verificationRequirement === "operator_required" || result.evidence.some((evidence) => evidence.verificationStatus === "unverified") ? "unverified" : "verified",
      usedInPrompt: promptUsage?.knowledgeCardIds.includes(result.cardId) ?? false,
      citedInAnswer: citedSources.some((handle) => handle.sourceCategory === "knowledge" && handle.cardId === result.cardId),
      sourceSnapshot: buildStateAwareKnowledgeSnapshot(result),
    }));
  }

  for (const result of sourceBundle.web) {
    rows.push(createRow({
      userId,
      conversationId,
      userMessageId,
      assistantMessageId,
      tripAnswerContextSnapshotId,
      rank: rank++,
      sourceCategory: "web",
      sourceReferenceId: result.persistedId ?? null,
      sourceReferenceType: result.persistedId ? "web_search_result" : null,
      retrievalScore: result.providerScore,
      sourceType: result.sourceType,
      verificationStatus: "unverified",
      usedInPrompt: promptUsage?.webRanks.includes(result.rank) ?? false,
      citedInAnswer: citedSources.some((handle) => handle.sourceCategory === "web" && handle.rank === result.rank),
      sourceSnapshot: {
        title: getSafeWebTitle(result.title),
        url: getSafeTravelerUrl(result.url),
        checkedAt: formatDateSnapshot(result.checkedAt),
        sourceType: result.sourceType,
        confidence: result.confidence,
        triggerReason: result.triggerReason,
        freshnessSensitive: sourceBundle.retrievalDecision.freshnessRequired || isFreshnessSensitiveWebTrigger(result.triggerReason),
        rank: result.rank,
        persistedWebSearchResultId: result.persistedId ?? null,
      },
    }));
  }

  if (sourceBundle.general.available && sourceBundle.retrievalDecision.generalReasoningUsed) {
    rows.push(createRow({
      userId,
      conversationId,
      userMessageId,
      assistantMessageId,
      tripAnswerContextSnapshotId,
      rank: rank++,
      sourceCategory: "general",
      sourceType: "general_reasoning",
      verificationStatus: "unverified",
      usedInPrompt: promptUsage?.generalReasoningUsed ?? false,
      sourceSnapshot: { available: true, note: "General AI reasoning may be used only after prioritized context/source data." },
    }));
  }

  return rows;
}

function buildStateAwareKnowledgeSnapshot(result: StateAwareKnowledgeBundleItem) {
  return {
    knowledgeCardId: result.cardId,
    contentVersion: result.contentVersion,
    title: result.fact,
    summary: result.summary,
    type: result.type,
    locationName: result.locationName,
    routeSegment: result.routeSegment,
    conditions: result.conditions,
    confidence: result.confidence,
    freshnessSensitive: result.freshnessSensitive,
    usePolicy: result.usePolicy,
    evidence: result.evidence.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      sourceId: evidence.sourceId,
      supportLevel: evidence.supportLevel,
      displayPolicy: evidence.displayPolicy,
      sourceLabel: evidence.sourceLabel,
      sourceType: evidence.sourceType,
      verificationStatus: evidence.verificationStatus,
      official: evidence.official,
      partner: evidence.partner,
      collectedDate: evidence.collectedDate,
      observedAt: evidence.observedAt,
      ...(evidence.displayPolicy === "traveler_visible" && evidence.url ? { url: evidence.url, ...(evidence.quote ? { quote: evidence.quote } : {}) } : {}),
    })),
  };
}

function createRow(input: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  tripAnswerContextSnapshotId?: string | null;
  sourceCategory: AssistantProvenanceSourceCategory;
  sourceReferenceId?: string | null;
  sourceReferenceType?: string | null;
  rank: number;
  retrievalScore?: number | null;
  sourceType?: string | null;
  verificationStatus: "unverified" | "verified";
  usedInPrompt?: boolean;
  citedInAnswer?: boolean;
  sourceSnapshot: Record<string, unknown>;
}): typeof assistantResponseProvenance.$inferInsert {
  return {
    userId: input.userId,
    conversationId: input.conversationId,
    userMessageId: input.userMessageId,
    assistantMessageId: input.assistantMessageId,
    tripAnswerContextSnapshotId: input.tripAnswerContextSnapshotId ?? null,
    sourceCategory: input.sourceCategory,
    sourceReferenceId: input.sourceReferenceId ?? null,
    sourceReferenceType: input.sourceReferenceType ?? null,
    rank: input.rank,
    retrievalScore: normalizeScore(input.retrievalScore),
    sourceType: input.sourceType ?? null,
    verificationStatus: input.verificationStatus,
    usedInPrompt: input.usedInPrompt ?? true,
    citedInAnswer: input.citedInAnswer ?? false,
    sourceSnapshot: boundSnapshot(input.sourceSnapshot),
  };
}

function formatDateSnapshot(value: Date) {
  const timestamp = value.getTime();
  return Number.isFinite(timestamp) ? value.toISOString() : null;
}

function normalizeScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function getSourceTitle(sourceCategory: AssistantProvenanceSourceCategory, snapshot: Record<string, unknown>) {
  if (sourceCategory === "general") {
    return "Suy luận tổng quát của AI";
  }

  const directTitle = getOptionalString(snapshot.title) ?? getOptionalString(snapshot.label);

  if (directTitle) {
    return directTitle;
  }

  if (sourceCategory === "trip_context") {
    return `Ngữ cảnh dự án: ${getOptionalString(snapshot.field) ?? "thông tin chuyến đi"}`;
  }

  if (sourceCategory === "chat_context") {
    return `Ngữ cảnh hội thoại: ${getOptionalString(snapshot.field) ?? "thông tin đã trao đổi"}`;
  }

  return sourceCategory === "web" ? "Nguồn web chưa xác minh" : "Nguồn XuyenViet";
}

function getConfidenceLabel(sourceCategory: AssistantProvenanceSourceCategory, verificationStatus: "verified" | "unverified", snapshot: Record<string, unknown>) {
  if (sourceCategory === "web") {
    return "chưa xác minh";
  }

  if (sourceCategory === "general") {
    return "suy luận chưa xác minh";
  }

  const confidence = getOptionalString(snapshot.confidence);

  if (confidence) {
    return confidence;
  }

  return verificationStatus === "verified" ? "đã xác minh" : "chưa xác minh";
}

function isFreshnessSensitiveWebTrigger(value: unknown) {
  return value === "freshness_sensitive_request" || value === "active_knowledge_may_be_stale";
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getSafeTravelerUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password && !isFacebookHost(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function getSafeWebTitle(value: string) {
  const title = getOptionalString(value);
  return title && isTravelerSafeEvidenceText(title) ? title : null;
}

function isFacebookHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.+$/, "");
  return normalized === "facebook.com" || normalized.endsWith(".facebook.com") || normalized === "fb.com" || normalized.endsWith(".fb.com") || normalized === "fb.me" || normalized.endsWith(".fb.me") || normalized === "fb.watch" || normalized.endsWith(".fb.watch");
}

function getUsePolicy(value: unknown): AvailableAssistantMessageProvenanceItem["usePolicy"] {
  return value === "contextual_use" || value === "caveat_only" || value === "do_not_use" ? value : null;
}

function getBoundedStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, maxSnapshotArrayItems).map((item) => item.slice(0, maxSnapshotStringLength)) : [];
}

function getTravelerEvidence(value: unknown): AvailableAssistantMessageProvenanceItem["evidence"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || item.displayPolicy !== "traveler_visible") {
      return [];
    }

    const sourceLabel = getOptionalString(item.sourceLabel);
    const sourceType = getOptionalString(item.sourceType);
    const rawUrl = getOptionalString(item.url);
    const quote = getOptionalString(item.quote);

    if (!sourceLabel || sourceType?.toLowerCase() === "facebook" || isFacebookSource(sourceLabel, rawUrl) || (rawUrl && !getSafeTravelerUrl(rawUrl)) || !isTravelerSafeEvidenceText(quote ?? "")) {
      return [];
    }

    return [{ sourceLabel, sourceType, url: getSafeTravelerUrl(rawUrl), quote: quote?.slice(0, maxSnapshotStringLength) ?? null }];
  }).slice(0, maxSnapshotArrayItems);
}

function isFacebookSource(sourceLabel: string, url: string | null) {
  if (sourceLabel.trim().toLowerCase().includes("facebook") || !url) {
    return sourceLabel.trim().toLowerCase().includes("facebook");
  }

  try {
    return isFacebookHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isTravelerSafeEvidenceText(value: string) {
  return !/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?84|0)(?:[\s.-]?\d){8,10}|provider[\s_-]*payload|storage[\s_-]*key|raw[\s_-]*metadata|raw[\s_-]*source)/i.test(value);
}

function getKnowledgeSourceString(snapshot: Record<string, unknown>, key: "canonicalUrl" | "url" | "collectedDate") {
  if (!Array.isArray(snapshot.sources)) {
    return null;
  }

  for (const source of snapshot.sources) {
    if (!isRecord(source)) {
      continue;
    }

    const value = getOptionalString(source[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  return boundSnapshotObject(snapshot, new WeakSet<object>(), 0);
}

function boundSnapshotObject(snapshot: Record<string, unknown>, seen: WeakSet<object>, depth: number): Record<string, unknown> {
  if (depth >= maxSnapshotDepth || seen.has(snapshot)) {
    return {};
  }

  seen.add(snapshot);
  return Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, boundSnapshotValue(value, seen, depth + 1)]));
}

function boundSnapshotValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === "string") {
    return value.slice(0, maxSnapshotStringLength);
  }

  if (Array.isArray(value)) {
    if (depth >= maxSnapshotDepth || seen.has(value)) {
      return [];
    }

    seen.add(value);
    return value.slice(0, maxSnapshotArrayItems).map((item) => boundSnapshotValue(item, seen, depth + 1));
  }

  if (value && typeof value === "object" && value.constructor === Object) {
    return boundSnapshotObject(value as Record<string, unknown>, seen, depth);
  }

  return value;
}
