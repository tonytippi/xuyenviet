import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, eq, gt, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeCardSearchDocuments, knowledgeCards, knowledgeIndexDirtyMarkers } from "@/db/schema";
import { enqueueKnowledgeIndexWork } from "@/features/knowledge/indexing-queue";
import { projectClaimedKnowledgeIndexWork } from "@/features/knowledge/search";

type KnowledgeIndexingDb = ReturnType<typeof getDb>;
const defaultPollIntervalMs = 5_000;
const defaultBatchSize = 10;
const maxBatchSize = 50;
const defaultLeaseMs = 5 * 60_000;

export type KnowledgeIndexingClaim = { markerId: string; cardId: string; contentVersion: number; fencingToken: string; leaseExpiresAt: Date };
export type KnowledgeIndexingWorkerResult =
  | { status: "indexed"; indexedCount: number; skippedCount: number; cardIds: string[] }
  | { status: "no_job"; indexedCount: 0; skippedCount: 0; cardIds: [] }
  | { status: "stopped" };

export async function claimNextKnowledgeIndexWork(input: { workerId: string; now?: Date }, db: KnowledgeIndexingDb = getDb()): Promise<KnowledgeIndexingClaim | null> {
  const workerId = input.workerId.trim();
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("Knowledge indexing worker ID is invalid.");
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + getKnowledgeIndexLeaseMs());
  const fencingToken = randomBytes(32).toString("hex");
  return db.transaction(async (tx) => {
    await recoverExpiredKnowledgeIndexWork(tx, now);
    const rows = await tx.execute(sql`select id from knowledge_index_dirty_markers where status = 'pending' and next_run_at <= now() and attempt_count < max_attempts order by next_run_at asc, created_at asc for update skip locked limit 1`) as Array<{ id: string }>;
    if (!rows[0]) return null;
    const [claimed] = await tx.update(knowledgeIndexDirtyMarkers).set({ status: "claimed", claimedBy: workerId, claimedAt: now, leaseExpiresAt, fencingToken, attemptCount: sql`${knowledgeIndexDirtyMarkers.attemptCount} + 1`, updatedAt: now, failureCode: null, failureReason: null }).where(and(eq(knowledgeIndexDirtyMarkers.id, rows[0].id), eq(knowledgeIndexDirtyMarkers.status, "pending"), lte(knowledgeIndexDirtyMarkers.nextRunAt, now))).returning();
    return claimed ? { markerId: claimed.id, cardId: claimed.knowledgeCardId, contentVersion: claimed.contentVersion, fencingToken, leaseExpiresAt } : null;
  });
}

export async function recoverExpiredKnowledgeIndexWork(db: Pick<KnowledgeIndexingDb, "update"> = getDb(), now = new Date()) {
  await db.update(knowledgeIndexDirtyMarkers).set({ status: sql`case when ${knowledgeIndexDirtyMarkers.attemptCount} >= ${knowledgeIndexDirtyMarkers.maxAttempts} then 'failed' else 'pending' end`, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: now, failureCode: sql`case when ${knowledgeIndexDirtyMarkers.attemptCount} >= ${knowledgeIndexDirtyMarkers.maxAttempts} then 'retry_exhausted' else null end`, failureReason: sql`case when ${knowledgeIndexDirtyMarkers.attemptCount} >= ${knowledgeIndexDirtyMarkers.maxAttempts} then 'Retry limit reached.' else null end`, updatedAt: now }).where(and(eq(knowledgeIndexDirtyMarkers.status, "claimed"), lte(knowledgeIndexDirtyMarkers.leaseExpiresAt, now)));
}

export async function processNextApprovedKnowledgeIndexingBatch(options: { batchSize?: number; now?: Date; workerId?: string } = {}, db: KnowledgeIndexingDb = getDb()): Promise<KnowledgeIndexingWorkerResult> {
  const now = options.now ?? new Date();
  const workerId = options.workerId ?? `knowledge-indexer-${process.pid}`;
  const claims: KnowledgeIndexingClaim[] = [];
  for (let index = 0; index < normalizeBatchSize(options.batchSize); index += 1) {
    const claim = await claimNextKnowledgeIndexWork({ workerId, now }, db);
    if (!claim) break;
    claims.push(claim);
  }
  if (!claims.length) return { status: "no_job", indexedCount: 0, skippedCount: 0, cardIds: [] };
  let indexedCount = 0;
  let skippedCount = 0;
  for (const claim of claims) {
    try {
      const result = await projectClaimedKnowledgeIndexWork(claim, db);
      const completed = await completeKnowledgeIndexWork(claim, result.outcome, db, now);
      if (completed && result.indexed) indexedCount += 1;
      else skippedCount += 1;
    } catch {
      await retryKnowledgeIndexWork(claim, "projection_failed", db, now);
      skippedCount += 1;
    }
  }
  return { status: "indexed", indexedCount, skippedCount, cardIds: claims.map((claim) => claim.cardId) };
}

export async function completeKnowledgeIndexWork(claim: KnowledgeIndexingClaim, outcome: "indexed" | "disabled" | "superseded" | "lost_claim", db: Pick<KnowledgeIndexingDb, "update"> = getDb(), now = new Date()) {
  const status = outcome === "superseded" ? "superseded" : "completed";
  const [completed] = await db.update(knowledgeIndexDirtyMarkers).set({ status, completedAt: now, completionReason: outcome, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now }).where(and(eq(knowledgeIndexDirtyMarkers.id, claim.markerId), eq(knowledgeIndexDirtyMarkers.knowledgeCardId, claim.cardId), eq(knowledgeIndexDirtyMarkers.contentVersion, claim.contentVersion), eq(knowledgeIndexDirtyMarkers.status, "claimed"), eq(knowledgeIndexDirtyMarkers.fencingToken, claim.fencingToken), gt(knowledgeIndexDirtyMarkers.leaseExpiresAt, now))).returning({ id: knowledgeIndexDirtyMarkers.id });
  return Boolean(completed);
}

export async function retryKnowledgeIndexWork(claim: KnowledgeIndexingClaim, failureCode: string, db: Pick<KnowledgeIndexingDb, "update"> = getDb(), now = new Date()) {
  const retryAt = new Date(now.getTime() + Math.min(60_000 * 2 ** 2, 15 * 60_000));
  const [retried] = await db.update(knowledgeIndexDirtyMarkers).set({ status: sql`case when ${knowledgeIndexDirtyMarkers.attemptCount} >= ${knowledgeIndexDirtyMarkers.maxAttempts} then 'failed' else 'pending' end`, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: retryAt, failureCode, failureReason: "Projection worker failed; retry is scheduled.", updatedAt: now }).where(and(eq(knowledgeIndexDirtyMarkers.id, claim.markerId), eq(knowledgeIndexDirtyMarkers.status, "claimed"), eq(knowledgeIndexDirtyMarkers.fencingToken, claim.fencingToken), gt(knowledgeIndexDirtyMarkers.leaseExpiresAt, now))).returning({ id: knowledgeIndexDirtyMarkers.id });
  return Boolean(retried);
}

export async function backfillKnowledgeIndexWork(input: { cursor?: string; batchSize?: number; now?: Date } = {}, db: KnowledgeIndexingDb = getDb()) {
  const now = input.now ?? new Date();
  const cards = await db.select({ id: knowledgeCards.id, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(input.cursor ? sql`${knowledgeCards.id} > ${input.cursor}` : undefined).orderBy(asc(knowledgeCards.id)).limit(normalizeBatchSize(input.batchSize));
  for (const card of cards) {
    await db.transaction(async (tx) => {
      // The worker performs the authoritative policy proof. Backfill merely queues current work.
      await enqueueKnowledgeIndexWork(tx, { cardId: card.id, contentVersion: card.contentVersion, evidenceSetRevision: card.evidenceSetRevision, reason: "backfill" });
      await tx.update(knowledgeCardSearchDocuments).set({ status: "disabled", disabledAt: now, updatedAt: now }).where(and(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id), sql`${knowledgeCardSearchDocuments.contentVersion} <> ${card.contentVersion}`, eq(knowledgeCardSearchDocuments.status, "active")));
    });
  }
  return { cursor: cards.at(-1)?.id ?? null, processed: cards.length };
}

export async function runApprovedKnowledgeIndexingWorkerLoop(options: { once?: boolean; batchSize?: number; pollIntervalMs?: number; signal?: AbortSignal; workerId?: string } = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? getWorkerPollIntervalMs();
  while (!options.signal?.aborted) {
    const result = await processNextApprovedKnowledgeIndexingBatch({ batchSize: options.batchSize, workerId: options.workerId });
    if (options.once) return result;
    if (result.status === "no_job") await sleep(pollIntervalMs, options.signal);
  }
  return { status: "stopped" as const };
}

export function getKnowledgeIndexLeaseMs() { return normalizeEnvNumber(process.env.KNOWLEDGE_INDEXING_CLAIM_LEASE_MS, defaultLeaseMs, 60_000, 60 * 60_000); }
function getWorkerPollIntervalMs() { return normalizeEnvNumber(process.env.KNOWLEDGE_INDEXING_WORKER_POLL_MS, defaultPollIntervalMs, 1_000, 60_000); }
function normalizeBatchSize(value: number | undefined) { return normalizeEnvNumber(value === undefined ? process.env.KNOWLEDGE_INDEXING_WORKER_BATCH_SIZE : String(value), defaultBatchSize, 1, maxBatchSize); }
function normalizeEnvNumber(value: string | number | undefined, fallback: number, min: number, max: number) { if (value === undefined || value === "") return fallback; const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), min), max) : fallback; }
function sleep(ms: number, signal?: AbortSignal) { return new Promise<void>((resolve) => { if (signal?.aborted) return resolve(); const timeout = setTimeout(resolve, ms); signal?.addEventListener("abort", () => { clearTimeout(timeout); resolve(); }, { once: true }); }); }
