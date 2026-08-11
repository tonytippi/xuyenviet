import { and, asc, eq, or, sql } from "drizzle-orm";
import type { YoutubeDiscoveryActionOwnerPorts } from "@xuyenviet/domain";
import { getDb } from "./client";
import { knowledgeRecommendations } from "./schema";

/** Knowledge owns these bounded queue inputs and never reads Discovery state. */
export function createKnowledgeDiscoveryActionOwnerPorts(): YoutubeDiscoveryActionOwnerPorts {
  return {
    async admitsActionCursor(cursor) {
      const [row] = await getDb().select({ id: knowledgeRecommendations.id }).from(knowledgeRecommendations).where(cursor.kind === "mission_need" ? and(eq(knowledgeRecommendations.discoveryMissionActionId, cursor.actionId), eq(knowledgeRecommendations.status, "open"), eq(knowledgeRecommendations.workType, "missing_context")) : and(eq(knowledgeRecommendations.id, cursor.actionId), eq(knowledgeRecommendations.status, "open"), or(eq(knowledgeRecommendations.workType, "risk"), eq(knowledgeRecommendations.workType, "relation")))).limit(1);
      return Boolean(row);
    },
    async listMissionNeeds(policy) {
      const rows = await getDb().select({ actionId: knowledgeRecommendations.discoveryMissionActionId, priority: knowledgeRecommendations.priority, createdAt: knowledgeRecommendations.createdAt }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.status, "open"), eq(knowledgeRecommendations.workType, "missing_context"), sql`${knowledgeRecommendations.discoveryMissionActionId} is not null`, sql`${knowledgeRecommendations.priority} <= ${policy.highPriorityMaximum}`)).orderBy(asc(knowledgeRecommendations.priority), asc(knowledgeRecommendations.createdAt), asc(knowledgeRecommendations.id));
       return rows.flatMap((row) => row.actionId ? [{ actionId: row.actionId, priority: row.priority, createdAt: row.createdAt }] : []);
    },
    async listKnowledgeRecommendations(policy) {
      const rows = await getDb().select({ recommendationId: knowledgeRecommendations.id, workType: knowledgeRecommendations.workType, priority: knowledgeRecommendations.priority, createdAt: knowledgeRecommendations.createdAt }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.status, "open"), or(eq(knowledgeRecommendations.workType, "risk"), eq(knowledgeRecommendations.workType, "relation")), sql`${knowledgeRecommendations.priority} <= ${policy.highPriorityMaximum}`)).orderBy(asc(knowledgeRecommendations.priority), asc(knowledgeRecommendations.createdAt), asc(knowledgeRecommendations.id));
       return rows.map((row) => ({ recommendationId: row.recommendationId, workType: row.workType as "risk" | "relation", priority: row.priority, createdAt: row.createdAt }));
    },
  };
}
