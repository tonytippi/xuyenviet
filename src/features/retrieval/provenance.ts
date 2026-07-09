import "server-only";

import { assistantResponseProvenance, assistantRetrievalDecisions } from "@/db/schema";
import type { AssistantProvenanceSourceCategory } from "@/db/schema";
import type { ContextPrioritySourceBundle } from "@/features/retrieval/source-bundle";

const maxSnapshotStringLength = 500;
const maxSnapshotArrayItems = 5;
const maxSnapshotDepth = 4;

type ProvenanceDb = {
  insert(table: typeof assistantRetrievalDecisions): { values(value: typeof assistantRetrievalDecisions.$inferInsert): Promise<unknown> };
  insert(table: typeof assistantResponseProvenance): { values(value: Array<typeof assistantResponseProvenance.$inferInsert>): Promise<unknown> };
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
    approvedKnowledgeCandidateCount: sourceBundle.knowledge.length,
    approvedKnowledgeSelectedCount: sourceBundle.retrievalDecision.approvedKnowledgeSelectedCount,
    approvedKnowledgeTargetCount: sourceBundle.retrievalDecision.approvedKnowledgeTargetCount,
    broadPlanningQuestion: sourceBundle.retrievalDecision.broadPlanningQuestion,
    freshnessRequired: sourceBundle.retrievalDecision.freshnessRequired,
    conflictDetected: sourceBundle.retrievalDecision.conflictDetected,
    webSearchTriggered: sourceBundle.retrievalDecision.webSearchTriggered,
    webSearchTriggerReasons: sourceBundle.retrievalDecision.webSearchTriggerReasons,
    generalReasoningUsed: sourceBundle.retrievalDecision.generalReasoningUsed,
    warnings: sourceBundle.warnings,
  });

  const rows = buildProvenanceRows({ userId, conversationId, userMessageId, assistantMessageId, sourceBundle, promptSection });

  if (rows.length > 0) {
    await db.insert(assistantResponseProvenance).values(rows);
  }
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
    rows.push(createRow({ userId, conversationId, userMessageId, assistantMessageId, rank: rank++, sourceCategory: "trip_context", verificationStatus: "verified", sourceType: fact.field, usedInPrompt: promptIncludesFact(promptSection, fact.field, fact.value), sourceSnapshot: { field: fact.field, source: fact.source } }));
  }

  for (const fact of sourceBundle.chatTripContext.chatFacts) {
    rows.push(createRow({ userId, conversationId, userMessageId, assistantMessageId, rank: rank++, sourceCategory: "chat_context", verificationStatus: "verified", sourceType: fact.field, usedInPrompt: promptIncludesFact(promptSection, fact.field, fact.value), sourceSnapshot: { field: fact.field, source: fact.source } }));
  }

  for (const result of sourceBundle.knowledge) {
    rows.push(createRow({
      userId,
      conversationId,
      userMessageId,
      assistantMessageId,
      rank: rank++,
      sourceCategory: "knowledge",
      sourceReferenceId: result.id,
      sourceReferenceType: "knowledge_card",
      retrievalScore: result.score,
      sourceType: result.type,
      verificationStatus: "verified",
      usedInPrompt: promptSection.includes(result.title),
      sourceSnapshot: {
        id: result.id,
        title: result.title,
        type: result.type,
        locationName: result.locationName,
        routeSegment: result.routeSegment,
        confidence: result.confidence,
        freshnessSensitive: result.freshnessSensitive,
        sources: result.sources.map((source) => ({ id: source.id, label: source.label, publisher: source.publisher, sourceType: source.sourceType, verificationStatus: source.verificationStatus, supportLevel: source.supportLevel })),
      },
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
      sourceReferenceId: `${userMessageId}:${result.rank}`,
      sourceReferenceType: "web_search_result_rank",
      retrievalScore: result.providerScore,
      sourceType: result.sourceType,
      verificationStatus: "unverified",
      usedInPrompt: promptSection.includes(result.url) || promptSection.includes(result.title),
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
        rank: result.rank,
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

function promptIncludesFact(promptSection: string, field: string, value: string) {
  return promptSection.includes(`${field}: ${JSON.stringify(value)}`);
}

function formatDateSnapshot(value: Date) {
  const timestamp = value.getTime();
  return Number.isFinite(timestamp) ? value.toISOString() : null;
}

function normalizeScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
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
