import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { adminYoutubeDiscoveryMissionPageSize, encodeAdminYoutubeDiscoveryMissionCoverageCursor, type AdminYoutubeDiscoveryMissionCoverageCursor } from "@xuyenviet/contracts";
import { YoutubeDiscoveryMissionCursorValidationError, type YoutubeDiscoveryActionOwnerPorts, type YoutubeDiscoveryMissionOwnerPorts } from "@xuyenviet/domain";
import { getDb } from "./client";
import { knowledgeCards, knowledgeRecommendations } from "./schema";

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

/** Knowledge owns the safe labels and admission state for Mission coverage. */
export function createKnowledgeDiscoveryMissionOwnerPorts(): YoutubeDiscoveryMissionOwnerPorts {
  const createdAtCursorKey = sql<string>`to_char(${knowledgeRecommendations.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  const page = async (cursor: AdminYoutubeDiscoveryMissionCoverageCursor | null) => {
    if (cursor) {
      const [anchor] = await getDb().select({ actionId: knowledgeRecommendations.discoveryMissionActionId }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.discoveryMissionActionId, cursor.actionId), eq(knowledgeRecommendations.priority, cursor.priority), eq(createdAtCursorKey, cursor.createdAt), eq(knowledgeRecommendations.status, "open"), eq(knowledgeRecommendations.workType, "missing_context"))).limit(1);
      if (!anchor) throw new YoutubeDiscoveryMissionCursorValidationError("Invalid YouTube Discovery Mission cursor.");
    }
    const rows = await getDb().select({ actionId: knowledgeRecommendations.discoveryMissionActionId, priority: knowledgeRecommendations.priority, createdAt: knowledgeRecommendations.createdAt, cursorCreatedAt: createdAtCursorKey, location: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, taxonomy: knowledgeCards.type, freshnessSensitive: knowledgeCards.freshnessSensitive, knowledgeState: knowledgeCards.knowledgeState }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(and(eq(knowledgeRecommendations.status, "open"), eq(knowledgeRecommendations.workType, "missing_context"), sql`${knowledgeRecommendations.discoveryMissionActionId} is not null`, cursor ? or(gt(knowledgeRecommendations.priority, cursor.priority), and(eq(knowledgeRecommendations.priority, cursor.priority), gt(createdAtCursorKey, cursor.createdAt)), and(eq(knowledgeRecommendations.priority, cursor.priority), eq(createdAtCursorKey, cursor.createdAt), gt(knowledgeRecommendations.discoveryMissionActionId, cursor.actionId))) : undefined)).orderBy(asc(knowledgeRecommendations.priority), asc(createdAtCursorKey), asc(knowledgeRecommendations.discoveryMissionActionId)).limit(adminYoutubeDiscoveryMissionPageSize + 1);
    const items = rows.slice(0, adminYoutubeDiscoveryMissionPageSize).flatMap((row) => row.actionId ? [{ actionId: row.actionId, priority: row.priority, createdAt: row.createdAt.toISOString(), corridor: null, location: row.location ?? null, routeSegment: row.routeSegment ?? null, taxonomy: row.taxonomy ?? null, freshness: row.freshnessSensitive ? "sensitive" as const : "fresh" as const, conflict: row.knowledgeState === "conflicted" ? "present" as const : "none" as const, demand: "unavailable" as const, seasonalContext: "unavailable" as const }] : []);
    const last = items.at(-1);
    const lastRow = rows[adminYoutubeDiscoveryMissionPageSize - 1];
    return { items, nextCursor: rows.length > adminYoutubeDiscoveryMissionPageSize && last && lastRow ? encodeAdminYoutubeDiscoveryMissionCoverageCursor({ version: 1, priority: last.priority, createdAt: lastRow.cursorCreatedAt, actionId: last.actionId }) : null };
  };
  return { listMissionCoverage: page, async getMissionDetail(actionId) { const result = await page(null); if (result.items.find((item) => item.actionId === actionId)) return result.items.find((item) => item.actionId === actionId)!; const [row] = await getDb().select({ actionId: knowledgeRecommendations.discoveryMissionActionId, priority: knowledgeRecommendations.priority, createdAt: knowledgeRecommendations.createdAt, location: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, taxonomy: knowledgeCards.type, freshnessSensitive: knowledgeCards.freshnessSensitive, knowledgeState: knowledgeCards.knowledgeState }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(and(eq(knowledgeRecommendations.discoveryMissionActionId, actionId), eq(knowledgeRecommendations.status, "open"), eq(knowledgeRecommendations.workType, "missing_context"))).limit(1); return row?.actionId ? { actionId: row.actionId, priority: row.priority, createdAt: row.createdAt.toISOString(), corridor: null, location: row.location ?? null, routeSegment: row.routeSegment ?? null, taxonomy: row.taxonomy ?? null, freshness: row.freshnessSensitive ? "sensitive" : "fresh", conflict: row.knowledgeState === "conflicted" ? "present" : "none", demand: "unavailable", seasonalContext: "unavailable" } : null; } };
}
