import type { AiAskDiscoveryQuerySignalPort, DiscoveryQuerySignalPortResult } from "@xuyenviet/domain";
import { sql } from "drizzle-orm";
import { getDb } from "./client";
import { assistantRetrievalDecisions } from "./schema";

type AiAskSignalReader = Pick<ReturnType<typeof getDb>, "select">;

export function createAiAskDiscoveryQuerySignalPort(database: AiAskSignalReader = getDb()): AiAskDiscoveryQuerySignalPort {
  return { async readSignals(signal): Promise<DiscoveryQuerySignalPortResult> {
    if (signal?.aborted) return { status: "unavailable", code: "source_timeout" };
    try {
      // A threshold prevents a single traveler's retrieval event from becoming
      // a Discovery input. The projection returns no user/conversation content.
      const [row] = await database.select({ count: sql<number>`count(*)::int` }).from(assistantRetrievalDecisions).where(sql`${assistantRetrievalDecisions.webSearchTriggered} and ${assistantRetrievalDecisions.approvedKnowledgeSelectedCount} = 0`);
      if (signal?.aborted) return { status: "unavailable", code: "source_timeout" };
      const count = row?.count ?? 0;
      return { status: "available", signals: count >= 3 ? [{ reason: "anonymized_demand", geography: "Vietnam", taxonomy: "travel", priority: Math.min(100, count * 10) }] : [] };
    } catch {
      return { status: "unavailable", code: "source_unavailable" };
    }
  } };
}
