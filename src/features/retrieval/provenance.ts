import "server-only";

import { assistantResponseProvenance, assistantRetrievalDecisions } from "@/db/schema";
import type { AssistantProvenanceSourceCategory } from "@/db/schema";
import type { ContextPrioritySourceBundle } from "@/features/retrieval/source-bundle";
import { toStateAwareKnowledgeBundleItem, type StateAwareKnowledgeBundleItem } from "@/features/retrieval/approved-knowledge";

const maxSnapshotStringLength = 500;
const maxSnapshotArrayItems = 5;
const maxSnapshotDepth = 4;

type ProvenanceDb = {
  insert(table: typeof assistantRetrievalDecisions): { values(value: typeof assistantRetrievalDecisions.$inferInsert): Promise<unknown> };
  insert(table: typeof assistantResponseProvenance): { values(value: Array<typeof assistantResponseProvenance.$inferInsert>): { returning(): Promise<Array<typeof assistantResponseProvenance.$inferSelect>> } };
};

type AssistantProvenanceRow = Pick<typeof assistantResponseProvenance.$inferSelect,
  "id" | "sourceCategory" | "rank" | "retrievalScore" | "sourceType" | "verificationStatus" | "usedInPrompt" | "citedInAnswer" | "sourceSnapshot"
>;

export type AssistantMessageProvenanceItem = {
  id: string;
  rank: number;
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
};

export async function persistAssistantAnswerProvenance(db: ProvenanceDb, input: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  sourceBundle: ContextPrioritySourceBundle;
  promptSection: string;
}) {
  const { userId, conversationId, userMessageId, assistantMessageId, sourceBundle, promptSection } = input;

  await db.insert(assistantRetrievalDecisions).values({
    userId,
    conversationId,
    userMessageId,
    assistantMessageId,
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

  const rows = buildProvenanceRows({ userId, conversationId, userMessageId, assistantMessageId, sourceBundle, promptSection });

  if (rows.length > 0) {
    const insertedRows = await db.insert(assistantResponseProvenance).values(rows).returning();
    return formatAssistantMessageProvenance(insertedRows);
  }

  return [];
}

export function formatAssistantMessageProvenance(rows: AssistantProvenanceRow[]): AssistantMessageProvenanceItem[] {
  return rows
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map((row) => {
      const snapshot = isRecord(row.sourceSnapshot) ? row.sourceSnapshot : {};
      return {
        id: row.id,
        rank: row.rank,
        sourceCategory: row.sourceCategory,
        title: getSourceTitle(row.sourceCategory, snapshot),
        sourceType: getOptionalString(snapshot.sourceType) ?? row.sourceType,
        url: getSafeHttpUrl(getOptionalString(snapshot.url) ?? getKnowledgeSourceString(snapshot, "canonicalUrl") ?? getKnowledgeSourceString(snapshot, "url")),
        checkedAt: getOptionalString(snapshot.checkedAt) ?? getKnowledgeSourceString(snapshot, "collectedDate"),
        confidenceLabel: getConfidenceLabel(row.sourceCategory, row.verificationStatus, snapshot),
        verificationStatus: row.verificationStatus,
        usedInPrompt: row.usedInPrompt,
        citedInAnswer: row.citedInAnswer,
        retrievalScore: row.retrievalScore,
        freshnessSensitive: snapshot.freshnessSensitive === true || isFreshnessSensitiveWebTrigger(snapshot.triggerReason),
      };
    });
}

function buildProvenanceRows({
  userId,
  conversationId,
  userMessageId,
  assistantMessageId,
  sourceBundle,
  promptSection,
}: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  sourceBundle: ContextPrioritySourceBundle;
  promptSection: string;
}) {
  const rows: Array<typeof assistantResponseProvenance.$inferInsert> = [];
  let rank = 1;

  for (const fact of sourceBundle.chatTripContext.tripProjectFacts) {
    rows.push(createRow({ userId, conversationId, userMessageId, assistantMessageId, rank: rank++, sourceCategory: "trip_context", verificationStatus: "verified", sourceType: fact.field, usedInPrompt: promptSection.includes(`${fact.field}: ${formatPromptValue(fact.value)}`), sourceSnapshot: { field: fact.field, source: fact.source } }));
  }

  for (const fact of sourceBundle.chatTripContext.chatFacts) {
    rows.push(createRow({ userId, conversationId, userMessageId, assistantMessageId, rank: rank++, sourceCategory: "chat_context", verificationStatus: "verified", sourceType: fact.field, usedInPrompt: promptSection.includes(`${fact.field}: ${formatPromptValue(fact.value)}`), sourceSnapshot: { field: fact.field, source: fact.source } }));
  }

  for (const knowledge of sourceBundle.knowledge) {
    const result = toStateAwareKnowledgeBundleItem(knowledge);
    rows.push(createRow({
      userId,
      conversationId,
      userMessageId,
      assistantMessageId,
      rank: rank++,
      sourceCategory: "knowledge",
      sourceReferenceId: result.cardId,
      sourceReferenceType: "knowledge_card",
      retrievalScore: result.score,
      sourceType: result.type,
        verificationStatus: result.verificationState === "required" || result.evidence.some((evidence) => evidence.verificationStatus === "unverified") ? "unverified" : "verified",
      usedInPrompt: promptSection.includes(`cardId=${formatPromptValue(result.cardId)}`),
      sourceSnapshot: buildStateAwareKnowledgeSnapshot(result),
    }));
  }

  for (const result of sourceBundle.web) {
    rows.push(createRow({
      userId,
      conversationId,
      userMessageId,
      assistantMessageId,
      rank: rank++,
      sourceCategory: "web",
      sourceReferenceId: result.persistedId ?? null,
      sourceReferenceType: result.persistedId ? "web_search_result" : null,
      retrievalScore: result.providerScore,
      sourceType: result.sourceType,
      verificationStatus: "unverified",
      usedInPrompt: promptSection.includes(`url=${formatPromptValue(result.url, 300)}`) || promptSection.includes(`title=${formatPromptValue(result.title, 180)}`),
      sourceSnapshot: {
        query: result.query,
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        provider: result.provider,
        providerScore: result.providerScore,
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
      rank: rank++,
      sourceCategory: "general",
      sourceType: "general_reasoning",
      verificationStatus: "unverified",
      usedInPrompt: promptSection.includes("Suy luận tổng quát"),
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
    knowledgeState: result.knowledgeState,
    verificationState: result.verificationState,
    usePolicy: result.usePolicy,
    evidence: result.evidence.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      sourceId: evidence.sourceId,
      supportLevel: evidence.supportLevel,
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
  sourceCategory: AssistantProvenanceSourceCategory;
  sourceReferenceId?: string | null;
  sourceReferenceType?: string | null;
  rank: number;
  retrievalScore?: number | null;
  sourceType?: string | null;
  verificationStatus: "unverified" | "verified";
  usedInPrompt?: boolean;
  sourceSnapshot: Record<string, unknown>;
}): typeof assistantResponseProvenance.$inferInsert {
  return {
    userId: input.userId,
    conversationId: input.conversationId,
    userMessageId: input.userMessageId,
    assistantMessageId: input.assistantMessageId,
    sourceCategory: input.sourceCategory,
    sourceReferenceId: input.sourceReferenceId ?? null,
    sourceReferenceType: input.sourceReferenceType ?? null,
    rank: input.rank,
    retrievalScore: normalizeScore(input.retrievalScore),
    sourceType: input.sourceType ?? null,
    verificationStatus: input.verificationStatus,
    usedInPrompt: input.usedInPrompt ?? true,
    citedInAnswer: false,
    sourceSnapshot: boundSnapshot(input.sourceSnapshot),
  };
}

function formatPromptValue(value: string, maxLength = 280) {
  return JSON.stringify(clip(value, maxLength));
}

function clip(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
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

function getSafeHttpUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
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
