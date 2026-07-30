import postgres from "postgres";
import { resolvePlanningAnnotationCapabilities, sanitizeStoredPlanningAnnotations, type AiAskStreamExecutionPort, type PlanningReadRepository } from "@xuyenviet/domain";
import { and, eq } from "drizzle-orm";
import { loadAnswerContext } from "./answer-context";
import { formatAssistantMessageProvenance } from "./provenance";
import { assistantResponseProvenance, conversations, messages, tripChangeProposals, tripProjects } from "./schema";
import { parsePlanningAnswerDetailResponse, type PlanningJsonValue, type PlanningProvenance, type TripAnswerContextResponse } from "@xuyenviet/contracts";
import { createAiAskStreamExecutionPort } from "./ai-ask-stream-execution";

export * from "./ai-ask-commands";
export * from "./ai-ask-stream-execution";
export * from "./answer-context";
export * from "./answer-freshness";
export * from "./approved-knowledge";
export * from "./assistant-provenance-withdrawal";
export * from "./actors";
export * from "./client";
export * from "./domain-outbox";
export * from "./gateway";
export * from "./knowledge-search";
export * from "./knowledge-indexing-queue";
export * from "./knowledge-state";
export * from "./models";
export * from "./prompts";
export * from "./provenance";
export * from "./schema";
export * from "./source-bundle";
export * from "./usage";
export * from "./usage-constants";
export * from "./usage-events";
export * from "./web-search";

export type ApiIdentityRecord = {
  userId: string;
  expires: Date;
  authorizationVersion: number;
};

export interface ApiIdentityRepository {
  getSession(sessionId: string): Promise<ApiIdentityRecord | null>;
}

export type StoredConversationSummaryRow = { id: string; updatedAt: Date; messageContent: string | null };
export type ReleaseSchemaVersionRepository = {
  hasCompatibleSchemaVersion(version: string): Promise<boolean>;
  recordSchemaVersion(version: string): Promise<void>;
};
export interface ConversationSummaryRepository {
  listOwnedConversationSummaryRows(userId: string, limit: number): Promise<StoredConversationSummaryRow[]>;
}

export function createPostgresConversationSummaryRepository(databaseUrl: string): ConversationSummaryRepository {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async listOwnedConversationSummaryRows(userId, limit) {
      return sql<StoredConversationSummaryRow[]>`
        select selected.id, selected.updated_at as "updatedAt", preview.content as "messageContent"
        from (
          select id, updated_at
          from conversations
          where user_id = ${userId} and trip_project_id is null
          order by updated_at desc, id desc
          limit ${limit}
        ) selected
        left join lateral (
          select content
          from messages
          where conversation_id = selected.id and user_id = ${userId} and role = 'user'
          order by created_at asc, id asc
          limit 1
        ) preview on true
        order by selected.updated_at desc, selected.id desc
      `;
    },
  };
}

export function createPostgresReleaseSchemaVersionRepository(databaseUrl: string): ReleaseSchemaVersionRepository {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async hasCompatibleSchemaVersion(version) {
      const rows = await sql<{ version: string }[]>`select version from release_schema_versions order by recorded_at desc limit 1`;
      return rows[0]?.version === version;
    },
    async recordSchemaVersion(version) {
      await sql.begin(async (transaction) => {
        await transaction`select pg_advisory_xact_lock(918_040_004)`;
        await transaction`delete from release_schema_versions`;
        await transaction`insert into release_schema_versions (version) values (${version})`;
      });
    },
  };
}

export function createPostgresApiIdentityRepository(databaseUrl: string): ApiIdentityRepository {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async getSession(sessionId) {
      const rows = await sql<ApiIdentityRecord[]>`
        select sessions.user_id as "userId", sessions.expires, users.authorization_version as "authorizationVersion"
        from sessions join users on users.id = sessions.user_id
        where sessions.session_token = ${sessionId}
        limit 1
      `;
      return rows[0] ?? null;
    },
  };
}

export function createPostgresAiAskStreamExecutionPort(_databaseUrl: string): AiAskStreamExecutionPort {
  return createAiAskStreamExecutionPort();
}

export function createPostgresPlanningReadRepository(): PlanningReadRepository {
  return {
    async loadOwnedPlanningContext(userId, tripProjectId) {
      const db = (await import("./client")).getDb();
      const [project] = await db.select({ id: tripProjects.id, primaryConversationId: tripProjects.primaryConversationId }).from(tripProjects).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId))).limit(1);
      if (!project?.primaryConversationId) return null;
      const context = await loadAnswerContext({ userId, conversationId: project.primaryConversationId, tripProjectId });
      if (context.tripProjectId !== tripProjectId) return null;
      return serializeTripAnswerContext(context);
    },
    async loadOwnedAnswerDetail(userId, conversationId, assistantMessageId) {
      const db = (await import("./client")).getDb();
      const [message] = await db.select({ id: messages.id, content: messages.content, answerAnnotations: messages.answerAnnotations }).from(messages)
        .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.userId, userId)))
        .where(and(eq(messages.id, assistantMessageId), eq(messages.conversationId, conversationId), eq(messages.userId, userId), eq(messages.role, "assistant"))).limit(1);
      if (!message) return null;
      const rows = await db.select({ id: assistantResponseProvenance.id, sourceCategory: assistantResponseProvenance.sourceCategory, rank: assistantResponseProvenance.rank, retrievalScore: assistantResponseProvenance.retrievalScore, sourceType: assistantResponseProvenance.sourceType, verificationStatus: assistantResponseProvenance.verificationStatus, availability: assistantResponseProvenance.availability, usedInPrompt: assistantResponseProvenance.usedInPrompt, citedInAnswer: assistantResponseProvenance.citedInAnswer, sourceSnapshot: assistantResponseProvenance.sourceSnapshot })
        .from(assistantResponseProvenance).where(and(eq(assistantResponseProvenance.userId, userId), eq(assistantResponseProvenance.conversationId, conversationId), eq(assistantResponseProvenance.assistantMessageId, assistantMessageId)));
      const provenance = formatAssistantMessageProvenance(rows).map(serializePlanningProvenance);
      const annotations = await resolvePlanningAnnotationCapabilities({
        annotations: sanitizeStoredPlanningAnnotations({ answerText: message.content, annotations: message.answerAnnotations, provenance }),
        hasCurrentPendingProposal: async () => {
          const proposals = await db.select({ id: tripChangeProposals.id, expiresAt: tripChangeProposals.expiresAt })
            .from(tripChangeProposals)
            .innerJoin(conversations, and(eq(conversations.tripProjectId, tripChangeProposals.tripProjectId), eq(conversations.id, conversationId), eq(conversations.userId, userId)))
            .where(and(eq(tripChangeProposals.userId, userId), eq(tripChangeProposals.status, "pending"), eq(tripChangeProposals.sourceAssistantMessageId, assistantMessageId)));
          return proposals.length === 1 && (!proposals[0].expiresAt || proposals[0].expiresAt.getTime() > Date.now());
        },
      });
      const response = parsePlanningAnswerDetailResponse({ detail: { conversationId, assistantMessageId: message.id, content: message.content, provenance, annotations } });
      if (!response?.detail) throw new Error("Planning detail serialization exceeded the safe response contract.");
      return response.detail;
    },
  };
}

export function serializeTripAnswerContext(context: Awaited<ReturnType<typeof loadAnswerContext>>): TripAnswerContextResponse {
  const { version, tripProjectId, aggregateVersion, primaryConversationId, anchors, planItems, constraints, currentConversationFacts } = context;
  if (version !== 1 || tripProjectId === undefined || aggregateVersion === undefined || primaryConversationId === undefined || !anchors || !planItems || constraints === undefined || !currentConversationFacts) throw new Error("Canonical planning context metadata is unavailable.");
  return { version, hasProjectScope: context.hasProjectScope, tripProjectId, aggregateVersion, primaryConversationId, anchors, planItems, constraints: constraints ? { version: constraints.version, values: serializePlanningJsonObject(constraints.values) } : null, currentConversationFacts, conflicts: context.conflicts.map((item) => ({ field: item.field, canonicalValue: item.canonicalValue ?? item.projectValue, lowerPriorityValue: item.lowerPriorityValue ?? item.conversationValue, source: item.source ?? "conversation_chat", priority: "lower" as const, material: true as const })) };
}

function serializePlanningProvenance(item: ReturnType<typeof formatAssistantMessageProvenance>[number]): PlanningProvenance {
  if (item.availability === "withdrawn") {
    return { id: item.id, rank: item.rank, availability: item.availability, unavailableLabel: item.unavailableLabel, usedInPrompt: item.usedInPrompt, citedInAnswer: item.citedInAnswer } as const;
  }
  return { id: item.id, rank: item.rank, availability: "available", sourceCategory: item.sourceCategory, title: item.title, sourceType: item.sourceType, url: item.url, checkedAt: canonicalUtcTimestamp(item.checkedAt), confidenceLabel: item.confidenceLabel, verificationStatus: item.verificationStatus, usedInPrompt: item.usedInPrompt, citedInAnswer: item.citedInAnswer, retrievalScore: item.retrievalScore, freshnessSensitive: item.freshnessSensitive };
}

function canonicalUtcTimestamp(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function serializePlanningJsonObject(value: Record<string, unknown>, depth = 0): Record<string, PlanningJsonValue> {
  if (depth > 4 || Object.keys(value).length > 24) throw new Error("Canonical planning constraints exceed the safe response bounds.");
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializePlanningJsonValue(item, depth + 1)]));
}
function serializePlanningJsonValue(value: unknown, depth: number): PlanningJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 500) return value;
  if (depth > 4) throw new Error("Canonical planning constraints exceed the safe response bounds.");
  if (Array.isArray(value) && value.length <= 12) return value.map((item) => serializePlanningJsonValue(item, depth + 1));
  if (value && typeof value === "object" && !Array.isArray(value)) return serializePlanningJsonObject(value as Record<string, unknown>, depth);
  throw new Error("Canonical planning constraints contain an unsafe response value.");
}
