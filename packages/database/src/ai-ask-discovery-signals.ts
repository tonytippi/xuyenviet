import type { AiAskDiscoveryQuerySignalPort, DiscoveryQuerySignalPortResult } from "@xuyenviet/domain";
import { sql } from "drizzle-orm";
import { getDb } from "./client";
import { assistantRetrievalDecisions } from "./schema";

type AiAskSignalReader = Pick<ReturnType<typeof getDb>, "transaction">;
const planningSignalStatementTimeoutMs = 900;

export function createAiAskDiscoveryQuerySignalPort(database: AiAskSignalReader = getDb()): AiAskDiscoveryQuerySignalPort {
  return { async readSignals(signal): Promise<DiscoveryQuerySignalPortResult> {
    if (signal?.aborted) return { status: "unavailable", code: "source_timeout" };
    try {
      // A threshold prevents a single traveler's retrieval event from becoming
      // a Discovery input. The projection returns no user/conversation content.
      const [row] = await database.transaction(async (transaction) => {
        await transaction.execute(sql.raw(`set local statement_timeout = ${planningSignalStatementTimeoutMs}`));
        if (signal?.aborted) throw new Error("Planning signal read aborted.");
        return transaction.select({ count: sql<number>`count(distinct ${assistantRetrievalDecisions.userId})::int` }).from(assistantRetrievalDecisions).where(sql`${assistantRetrievalDecisions.webSearchTriggered} and ${assistantRetrievalDecisions.approvedKnowledgeSelectedCount} = 0`);
      });
      if (signal?.aborted) return { status: "unavailable", code: "source_timeout" };
      const count = row?.count ?? 0;
      return { status: "available", signals: count >= 3 ? [{ reason: "anonymized_demand", geography: "Vietnam", taxonomy: "travel", priority: Math.min(100, count * 10) }] : [] };
    } catch (error) {
      return signal?.aborted || isStatementTimeout(error) ? { status: "unavailable", code: "source_timeout" } : { status: "unavailable", code: "source_unavailable" };
    }
  } };
}

function isStatementTimeout(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const value = error as { code?: unknown; cause?: unknown };
  return value.code === "57014" || isStatementTimeout(value.cause);
}
