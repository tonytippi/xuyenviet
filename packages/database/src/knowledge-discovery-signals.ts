import { and, eq, inArray } from "drizzle-orm";
import type { DiscoveryQuerySignalPortResult, KnowledgeDiscoveryQuerySignalPort, SafeDiscoveryQueryReason } from "@xuyenviet/domain";
import { getDb } from "./client";
import { knowledgeCards, knowledgeRecommendations } from "./schema";

type KnowledgeSignalReader = Pick<ReturnType<typeof getDb>, "select">;

export function createKnowledgeDiscoveryQuerySignalPort(database: KnowledgeSignalReader = getDb()): KnowledgeDiscoveryQuerySignalPort {
  return { async readSignals(signal): Promise<DiscoveryQuerySignalPortResult> {
    if (signal?.aborted) return { status: "unavailable", code: "source_timeout" };
    try {
      // This owner projection reads only review state and card classification;
      // it never reads card/source/traveler content or Discovery tables.
      const rows = await database.select({ workType: knowledgeRecommendations.workType, priority: knowledgeRecommendations.priority, knowledgeState: knowledgeCards.knowledgeState, freshnessSensitive: knowledgeCards.freshnessSensitive, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, taxonomy: knowledgeCards.type }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(and(eq(knowledgeRecommendations.status, "open"), inArray(knowledgeRecommendations.workType, ["missing_context", "risk", "relation"]))).limit(100);
      if (signal?.aborted) return { status: "unavailable", code: "source_timeout" };
      const signals = rows.flatMap((row) => {
        const geography = safeLabel(row.locationName) ?? safeLabel(row.routeSegment) ?? "Vietnam";
        const reason: SafeDiscoveryQueryReason | null = row.workType === "missing_context" ? "coverage_gap" : row.workType === "risk" && row.freshnessSensitive ? "freshness_risk" : row.workType === "relation" || row.knowledgeState === "conflicted" ? "unresolved_conflict" : null;
        return reason ? [{ reason, geography, taxonomy: row.taxonomy.replaceAll("_", " "), priority: row.priority }] : [];
      });
      return { status: "available", signals };
    } catch {
      return { status: "unavailable", code: "source_unavailable" };
    }
  } };
}

function safeLabel(value: string | null) { return value && /^[\p{L}\p{N} -]{1,80}$/u.test(value.trim()) ? value.trim() : null; }
