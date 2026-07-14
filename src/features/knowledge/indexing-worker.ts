import { and, asc, eq, exists, isNull, lt, ne, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeCards, knowledgeCardSearchDocuments, knowledgeCardSources } from "@/db/schema";
import { indexApprovedKnowledgeCard } from "@/features/knowledge/search";

type KnowledgeIndexingDb = ReturnType<typeof getDb>;

const defaultPollIntervalMs = 5_000;
const defaultBatchSize = 10;
const maxBatchSize = 50;

export type KnowledgeIndexingWorkerResult =
  | { status: "indexed"; indexedCount: number; skippedCount: number; cardIds: string[] }
  | { status: "no_job"; indexedCount: 0; skippedCount: 0; cardIds: [] }
  | { status: "stopped" };

export async function processNextApprovedKnowledgeIndexingBatch(options: { batchSize?: number; now?: Date } = {}, db = getDb()): Promise<KnowledgeIndexingWorkerResult> {
  const cards = await loadApprovedCardsNeedingSearchDocuments(db, { batchSize: normalizeBatchSize(options.batchSize), now: options.now ?? new Date() });

  if (cards.length === 0) {
    return { status: "no_job", indexedCount: 0, skippedCount: 0, cardIds: [] };
  }

  const cardIds: string[] = [];
  let indexedCount = 0;
  let skippedCount = 0;

  for (const card of cards) {
    const result = await indexApprovedKnowledgeCard(card.id);
    cardIds.push(result.cardId);

    if (result.indexed) {
      indexedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  return { status: "indexed", indexedCount, skippedCount, cardIds };
}

export async function runApprovedKnowledgeIndexingWorkerLoop(options: { once?: boolean; batchSize?: number; pollIntervalMs?: number; signal?: AbortSignal } = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? getWorkerPollIntervalMs();

  while (!options.signal?.aborted) {
    const result = await processNextApprovedKnowledgeIndexingBatch({ batchSize: options.batchSize });

    if (options.once) {
      return result;
    }

    if (result.status === "no_job") {
      await sleep(pollIntervalMs, options.signal);
    }
  }

  return { status: "stopped" as const };
}

async function loadApprovedCardsNeedingSearchDocuments(db: Pick<KnowledgeIndexingDb, "select">, options: { batchSize: number; now: Date }) {
  return db
    .select({ id: knowledgeCards.id })
    .from(knowledgeCards)
    .leftJoin(knowledgeCardSearchDocuments, eq(knowledgeCardSearchDocuments.knowledgeCardId, knowledgeCards.id))
    .where(
      and(
        eq(knowledgeCards.status, "approved"),
        eq(knowledgeCards.needsReview, false),
        exists(
          db
            .select({ id: knowledgeCardSources.knowledgeCardId })
            .from(knowledgeCardSources)
            .where(eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id)),
        ),
        or(
          isNull(knowledgeCardSearchDocuments.id),
          ne(knowledgeCardSearchDocuments.status, "active"),
          ne(knowledgeCardSearchDocuments.confidence, knowledgeCards.confidence),
          ne(knowledgeCardSearchDocuments.freshnessSensitive, knowledgeCards.freshnessSensitive),
          lt(knowledgeCardSearchDocuments.updatedAt, knowledgeCards.updatedAt),
        ),
      ),
    )
    .orderBy(asc(knowledgeCards.updatedAt), asc(knowledgeCards.id))
    .limit(options.batchSize);
}

function getWorkerPollIntervalMs() {
  return normalizeEnvNumber(process.env.KNOWLEDGE_INDEXING_WORKER_POLL_MS, defaultPollIntervalMs, 1_000, 60_000);
}

function normalizeBatchSize(value: number | undefined) {
  return normalizeEnvNumber(value === undefined ? process.env.KNOWLEDGE_INDEXING_WORKER_BATCH_SIZE : String(value), defaultBatchSize, 1, maxBatchSize);
}

function normalizeEnvNumber(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), min), max) : fallback;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
