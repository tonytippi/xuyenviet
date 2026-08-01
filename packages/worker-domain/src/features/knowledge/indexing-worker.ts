import { randomBytes } from "node:crypto";

import { and, asc, eq, lte, sql } from "drizzle-orm";

import { getDb } from "@xuyenviet/database";
import { knowledgeCardSearchDocuments, knowledgeCards, knowledgeIndexBackfillState, knowledgeIndexDirtyMarkers } from "@xuyenviet/database";
import { enqueueKnowledgeIndexWork } from "./indexing-queue";
import { projectClaimedKnowledgeIndexWork } from "./search";
import { createSystemAuditActor } from "../audit/actors";
import type { WorkerPollObservation } from "@xuyenviet/contracts";

type KnowledgeIndexingDb = ReturnType<typeof getDb>;
const defaultPollIntervalMs = 5_000;
const defaultBatchSize = 10;
const maxBatchSize = 50;
const defaultLeaseMs = 5 * 60_000;

export type KnowledgeIndexingClaim = { markerId: string; cardId: string; contentVersion: number; fencingToken: string; claimedAt: Date; nextRunAt: Date; attemptCount: number; leaseExpiresAt: Date; executorSystem: string | null; leaseRecoveryCount: number };
export type KnowledgeIndexingWorkerResult =
  | { status: "indexed"; indexedCount: number; skippedCount: number; cardIds: string[] }
  | { status: "no_job"; indexedCount: 0; skippedCount: 0; cardIds: [] }
  | { status: "stopped" };

export async function claimNextKnowledgeIndexWork(input: { workerId: string; recoverExpired?: boolean }, db: KnowledgeIndexingDb = getDb()): Promise<KnowledgeIndexingClaim | null> {
  const workerId = input.workerId.trim();
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("Knowledge indexing worker ID is invalid.");
  const fencingToken = randomBytes(32).toString("hex");
  const executor = createSystemAuditActor("system-knowledge-pipeline");
  return db.transaction(async (tx) => {
    // PostgreSQL is the sole authority for recovery, selection, and lease expiry.
    const leaseRecoveryCount = input.recoverExpired === false ? 0 : await recoverExpiredKnowledgeIndexWork(tx);
    const rows = await tx.execute(sql`select id from knowledge_index_dirty_markers where status = 'pending' and next_run_at <= clock_timestamp() and attempt_count < max_attempts order by next_run_at asc, created_at asc for update skip locked limit 1`) as Array<{ id: string }>;
    if (!rows[0]) return null;
    const [claimed] = await tx.update(knowledgeIndexDirtyMarkers).set({ status: "claimed", claimedBy: workerId, claimedAt: sql`clock_timestamp()`, leaseExpiresAt: sql`clock_timestamp() + ${getKnowledgeIndexLeaseMs()} * interval '1 millisecond'`, fencingToken, attemptCount: sql`${knowledgeIndexDirtyMarkers.attemptCount} + 1`, executorSystem: executor.system, updatedAt: sql`clock_timestamp()`, failureCode: null, failureReason: null }).where(and(eq(knowledgeIndexDirtyMarkers.id, rows[0].id), eq(knowledgeIndexDirtyMarkers.status, "pending"), sql`${knowledgeIndexDirtyMarkers.nextRunAt} <= clock_timestamp()`)).returning();
    return claimed ? { markerId: claimed.id, cardId: claimed.knowledgeCardId, contentVersion: claimed.contentVersion, fencingToken, claimedAt: claimed.claimedAt!, nextRunAt: claimed.nextRunAt, attemptCount: claimed.attemptCount, leaseExpiresAt: claimed.leaseExpiresAt!, executorSystem: claimed.executorSystem, leaseRecoveryCount } : null;
  });
}

export async function recoverExpiredKnowledgeIndexWork(db: Pick<KnowledgeIndexingDb, "update"> = getDb()) {
  return (await recoverExpiredKnowledgeIndexWorkDetailed(db)).length;
}

async function recoverExpiredKnowledgeIndexWorkDetailed(db: Pick<KnowledgeIndexingDb, "update"> = getDb()) {
  const executor = createSystemAuditActor("system-knowledge-pipeline");
  return db.update(knowledgeIndexDirtyMarkers).set({ status: sql`case when ${knowledgeIndexDirtyMarkers.attemptCount} >= ${knowledgeIndexDirtyMarkers.maxAttempts} then 'failed' else 'pending' end`, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: sql`clock_timestamp()`, failureCode: sql`case when ${knowledgeIndexDirtyMarkers.attemptCount} >= ${knowledgeIndexDirtyMarkers.maxAttempts} then 'retry_exhausted' else null end`, failureReason: sql`case when ${knowledgeIndexDirtyMarkers.attemptCount} >= ${knowledgeIndexDirtyMarkers.maxAttempts} then 'Retry limit reached.' else null end`, executorSystem: executor.system, updatedAt: sql`clock_timestamp()` }).where(and(eq(knowledgeIndexDirtyMarkers.status, "claimed"), lte(knowledgeIndexDirtyMarkers.leaseExpiresAt, sql`clock_timestamp()`))).returning({ id: knowledgeIndexDirtyMarkers.id, status: knowledgeIndexDirtyMarkers.status, attemptCount: knowledgeIndexDirtyMarkers.attemptCount });
}

async function processNextApprovedKnowledgeIndexingBatchObserved(options: { batchSize?: number; workerId?: string } = {}, db: KnowledgeIndexingDb = getDb()): Promise<KnowledgeIndexingWorkerResult & { observations: WorkerPollObservation[] }> {
  const workerId = options.workerId ?? `knowledge-indexer-${process.pid}`;
  const recoveredBeforeClaim = await recoverExpiredKnowledgeIndexWorkDetailed(db);
  const claims: KnowledgeIndexingClaim[] = [];
  for (let index = 0; index < normalizeBatchSize(options.batchSize); index += 1) {
    const claim = await claimNextKnowledgeIndexWork({ workerId, recoverExpired: false }, db);
    if (!claim) break;
    claims.push(claim);
  }
  const recoveryObservations = recoveredBeforeClaim.map((row) => ({
    capability: "knowledge.indexing" as const,
    resultCode: (row.status === "failed" ? "failure" : "retry") as WorkerPollObservation["resultCode"],
    durableId: row.id,
    retryCount: row.attemptCount,
    leaseRecovery: "recovered" as const,
    leaseRecoveryCount: 1,
  }));
  if (!claims.length) return { status: "no_job", indexedCount: 0, skippedCount: 0, cardIds: [], observations: recoveryObservations.length ? recoveryObservations : [{ capability: "knowledge.indexing", resultCode: "no_work", leaseRecovery: "none" }] };
  let indexedCount = 0;
  let skippedCount = 0;
  const observations: WorkerPollObservation[] = [];
  for (const claim of claims) {
    let resultCode: WorkerPollObservation["resultCode"] = "success";
    try {
      const result = await projectClaimedKnowledgeIndexWork(claim, db);
      const completed = await completeKnowledgeIndexWork(claim, result.outcome, db);
      if (completed && result.indexed) indexedCount += 1;
      else skippedCount += 1;
      if (result.outcome === "lost_claim" || !completed) resultCode = "contended";
    } catch {
      const retry = await retryKnowledgeIndexWorkDisposition(claim, "projection_failed", db);
      skippedCount += 1;
      if (retry === "failed") resultCode = "failure";
      else if (retry === "pending") resultCode = "retry";
      else resultCode = "contended";
    }
    observations.push({
      capability: "knowledge.indexing", resultCode, durableId: claim.markerId,
      retryCount: claim.attemptCount, jobLagMs: Math.max(0, claim.claimedAt.getTime() - claim.nextRunAt.getTime()),
      leaseRecovery: claim.leaseRecoveryCount ? "recovered" : "none", ...(claim.leaseRecoveryCount ? { leaseRecoveryCount: claim.leaseRecoveryCount } : {}),
    });
  }
  return { status: "indexed", indexedCount, skippedCount, cardIds: claims.map((claim) => claim.cardId), observations: [...recoveryObservations, ...observations] };
}

export async function processNextApprovedKnowledgeIndexingBatch(options: { batchSize?: number; workerId?: string } = {}, db: KnowledgeIndexingDb = getDb()): Promise<KnowledgeIndexingWorkerResult> {
  const { observations, ...result } = await processNextApprovedKnowledgeIndexingBatchObserved(options, db);
  void observations;
  return result;
}

export async function completeKnowledgeIndexWork(claim: KnowledgeIndexingClaim, outcome: "indexed" | "disabled" | "superseded" | "lost_claim", db: Pick<KnowledgeIndexingDb, "update"> = getDb()) {
  const status = outcome === "superseded" ? "superseded" : "completed";
  const executor = createSystemAuditActor("system-knowledge-pipeline");
  const [completed] = await db.update(knowledgeIndexDirtyMarkers).set({ status, completedAt: sql`clock_timestamp()`, completionReason: outcome, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, executorSystem: executor.system, updatedAt: sql`clock_timestamp()` }).where(and(eq(knowledgeIndexDirtyMarkers.id, claim.markerId), eq(knowledgeIndexDirtyMarkers.knowledgeCardId, claim.cardId), eq(knowledgeIndexDirtyMarkers.contentVersion, claim.contentVersion), eq(knowledgeIndexDirtyMarkers.status, "claimed"), eq(knowledgeIndexDirtyMarkers.fencingToken, claim.fencingToken), sql`${knowledgeIndexDirtyMarkers.leaseExpiresAt} > clock_timestamp()`)).returning({ id: knowledgeIndexDirtyMarkers.id });
  return Boolean(completed);
}

export async function retryKnowledgeIndexWork(claim: KnowledgeIndexingClaim, failureCode: string, db: Pick<KnowledgeIndexingDb, "update"> = getDb()) {
  return Boolean(await retryKnowledgeIndexWorkDisposition(claim, failureCode, db));
}

async function retryKnowledgeIndexWorkDisposition(claim: KnowledgeIndexingClaim, failureCode: string, db: Pick<KnowledgeIndexingDb, "update"> = getDb()) {
  const executor = createSystemAuditActor("system-knowledge-pipeline");
  const [retried] = await db.update(knowledgeIndexDirtyMarkers).set({ status: sql`case when ${knowledgeIndexDirtyMarkers.attemptCount} >= ${knowledgeIndexDirtyMarkers.maxAttempts} then 'failed' else 'pending' end`, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: sql`clock_timestamp() + interval '4 minutes'`, failureCode, failureReason: "Projection worker failed; retry is scheduled.", executorSystem: executor.system, updatedAt: sql`clock_timestamp()` }).where(and(eq(knowledgeIndexDirtyMarkers.id, claim.markerId), eq(knowledgeIndexDirtyMarkers.status, "claimed"), eq(knowledgeIndexDirtyMarkers.fencingToken, claim.fencingToken), sql`${knowledgeIndexDirtyMarkers.leaseExpiresAt} > clock_timestamp()`)).returning({ status: knowledgeIndexDirtyMarkers.status });
  return retried?.status ?? null;
}

export async function backfillKnowledgeIndexWork(input: { cursor?: string; batchSize?: number; now?: Date } = {}, db: KnowledgeIndexingDb = getDb()) {
  const now = input.now ?? new Date();
  const cards = await db.select({ id: knowledgeCards.id, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(input.cursor ? sql`${knowledgeCards.id} > ${input.cursor}` : undefined).orderBy(asc(knowledgeCards.id)).limit(normalizeBatchSize(input.batchSize));
  for (const card of cards) {
    await db.transaction(async (tx) => {
      const [current] = await tx.select({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, card.id)).limit(1).for("update");
      if (!current) return;
      const { isKnowledgeCardEligibleForProjection } = await import("@xuyenviet/database");
      if (await isKnowledgeCardEligibleForProjection(tx, card.id)) {
        await enqueueKnowledgeIndexWork(tx, { cardId: card.id, contentVersion: current.contentVersion, evidenceSetRevision: current.evidenceSetRevision, reason: "backfill", executorSystem: "system-knowledge-pipeline" });
      } else {
        await tx.update(knowledgeCardSearchDocuments).set({ status: "disabled", disabledAt: now, updatedAt: now }).where(and(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id), eq(knowledgeCardSearchDocuments.status, "active")));
      }
    });
  }
  return { cursor: cards.at(-1)?.id ?? null, processed: cards.length };
}

export async function runKnowledgeIndexBackfill(db: KnowledgeIndexingDb = getDb()) {
  await db.insert(knowledgeIndexBackfillState).values({ id: "knowledge-index" }).onConflictDoNothing();
  const [state] = await db.select().from(knowledgeIndexBackfillState).where(eq(knowledgeIndexBackfillState.id, "knowledge-index")).limit(1);
  if (state?.completedAt) return { cursor: null, processed: 0 };
  const result = await backfillKnowledgeIndexWork({ cursor: state?.cursor ?? undefined }, db);
  await db.update(knowledgeIndexBackfillState).set({ cursor: result.cursor, completedAt: result.cursor ? null : sql`now()`, updatedAt: sql`now()` }).where(and(eq(knowledgeIndexBackfillState.id, "knowledge-index"), state?.cursor ? eq(knowledgeIndexBackfillState.cursor, state.cursor) : sql`${knowledgeIndexBackfillState.cursor} is null`));
  return result;
}

export async function runApprovedKnowledgeIndexingWorkerLoop(options: { once?: boolean; batchSize?: number; pollIntervalMs?: number; signal?: AbortSignal; workerId?: string; onObservation?: (observation: WorkerPollObservation) => void | Promise<void> } = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? getWorkerPollIntervalMs();
  while (!options.signal?.aborted) {
    if (options.signal?.aborted) break;
    await runKnowledgeIndexBackfill();
    if (options.signal?.aborted) break;
    const result = await processNextApprovedKnowledgeIndexingBatchObserved({ batchSize: options.batchSize, workerId: options.workerId });
    for (const observation of result.observations) {
      try { await options.onObservation?.(observation); } catch {}
    }
    if (options.once) {
      if (result.status === "stopped") return result;
      const { observations, ...legacyResult } = result;
      void observations;
      return legacyResult;
    }
    if (result.status === "no_job") await sleep(pollIntervalMs, options.signal);
  }
  return { status: "stopped" as const };
}

export function getKnowledgeIndexLeaseMs() { return normalizeEnvNumber(process.env.KNOWLEDGE_INDEXING_CLAIM_LEASE_MS, defaultLeaseMs, 60_000, 60 * 60_000); }
function getWorkerPollIntervalMs() { return normalizeEnvNumber(process.env.KNOWLEDGE_INDEXING_WORKER_POLL_MS, defaultPollIntervalMs, 1_000, 60_000); }
function normalizeBatchSize(value: number | undefined) { return normalizeEnvNumber(value === undefined ? process.env.KNOWLEDGE_INDEXING_WORKER_BATCH_SIZE : String(value), defaultBatchSize, 1, maxBatchSize); }
function normalizeEnvNumber(value: string | number | undefined, fallback: number, min: number, max: number) { if (value === undefined || value === "") return fallback; const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), min), max) : fallback; }
function sleep(ms: number, signal?: AbortSignal) { return new Promise<void>((resolve) => { if (signal?.aborted) return resolve(); const onAbort = () => { clearTimeout(timeout); signal?.removeEventListener("abort", onAbort); resolve(); }; const timeout = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms); signal?.addEventListener("abort", onAbort, { once: true }); }); }
