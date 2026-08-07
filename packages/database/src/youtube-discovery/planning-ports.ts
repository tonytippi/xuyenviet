import { and, asc, eq, sql } from "drizzle-orm";

import type { AiAskDiscoveryQuerySignalPort, DiscoveryQuerySignalPortResult, KnowledgeDiscoveryQuerySignalPort, SafeDiscoveryQuerySignal } from "@xuyenviet/domain";

import { getDb } from "../client";
import { knowledgeCards } from "../schema";

const safeText = /^[\p{L}\p{N} -]{1,80}$/u;

/** Knowledge owns this aggregate projection; Discovery receives no table access. */
export function createPostgresKnowledgeDiscoveryQuerySignalPort(): KnowledgeDiscoveryQuerySignalPort {
  return { async readSignals() {
    try {
      const rows = await getDb().select({ geography: knowledgeCards.locationName, taxonomy: knowledgeCards.type, count: sql<number>`count(*)::integer` })
        .from(knowledgeCards)
        .where(and(eq(knowledgeCards.lifecycleState, "active"), eq(knowledgeCards.freshnessSensitive, true)))
        .groupBy(knowledgeCards.locationName, knowledgeCards.type)
        .orderBy(asc(knowledgeCards.locationName), asc(knowledgeCards.type))
        .limit(100);
      const signals: SafeDiscoveryQuerySignal[] = rows.flatMap((row) => {
        const geography = row.geography?.normalize("NFC").trim();
        const taxonomy = row.taxonomy.normalize("NFC").trim();
        return geography && safeText.test(geography) && safeText.test(taxonomy)
          ? [{ reason: "freshness_risk" as const, geography, taxonomy, priority: Math.min(100, Math.max(1, row.count)) }]
          : [];
      });
      return signals.length ? { status: "available", signals } : { status: "unavailable", code: "source_unavailable" };
    } catch { return { status: "unavailable", code: "source_unavailable" }; }
  } };
}

/** AI Ask currently has no owner-approved aggregate geography/taxonomy projection. */
export function createPostgresAiAskDiscoveryQuerySignalPort(): AiAskDiscoveryQuerySignalPort {
  return { async readSignals(): Promise<DiscoveryQuerySignalPortResult> { return { status: "unavailable", code: "source_unavailable" }; } };
}
