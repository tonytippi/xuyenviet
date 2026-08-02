import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { getDb } from "@xuyenviet/database";
import {
  knowledgeCards,
  knowledgeCardSources,
  knowledgeExtractionJobs,
  sourceCaptureVersions,
  sources,
  type KnowledgeExtractionJobMode,
} from "@xuyenviet/database";
import { sourceKnowledgeDraftExtractionPromptVersion } from "../ai/prompts";
import { extractKnowledgeDraftsFromSourceAsActor, isKnowledgeExtractionError, KnowledgeExtractionError } from "./extraction";
import { assertFacebookCaptureStillNeedsReview } from "./extraction";
import { markFacebookCaptureReviewStatus, markFacebookCaptureReviewStatusInTransaction } from "./facebook-capture-review";
import { approveKnowledgeDraftBatchForSystemInTransaction } from "./review-approval-core";
import { createSystemAuditActor } from "../audit/actors";
import { recordAuditEvent } from "../audit/events";
import type { WorkerPollObservation } from "@xuyenviet/contracts";

type ExtractionJobDb = ReturnType<typeof getDb>;

const activeJobStatuses = ["queued", "running"] as const;
const defaultMaxAttempts = 3;
const defaultPollIntervalMs = 5_000;
const defaultStaleRunningMs = 15 * 60_000;
const retryBackoffMs = [30_000, 120_000, 300_000] as const;

export type KnowledgeExtractionJobActor = { userId: string; email: string };

export type EnqueueKnowledgeExtractionJobInput = {
  sourceId: string;
  mode: KnowledgeExtractionJobMode;
  actor: KnowledgeExtractionJobActor;
  facebookCaptureReviewId?: string | null;
};

export async function enqueueKnowledgeExtractionJob(input: EnqueueKnowledgeExtractionJobInput, db = getDb()) {
  const sourceId = input.sourceId.trim();

  if (!sourceId) {
    throw new KnowledgeExtractionError("Không tìm thấy nguồn cần trích xuất.", "invalid_source");
  }

  return db.transaction(async (transaction) => {
    await lockSourceJobEnqueue(transaction, sourceId);

    const [source] = await transaction.select({ id: sources.id, currentCaptureVersionId: sources.currentCaptureVersionId }).from(sources).where(eq(sources.id, sourceId)).limit(1);

    if (!source) {
      throw new KnowledgeExtractionError("Không tìm thấy nguồn cần trích xuất.", "invalid_source");
    }

    const [raw] = source.currentCaptureVersionId
      ? await transaction.select({ rawText: sourceCaptureVersions.rawText }).from(sourceCaptureVersions).where(and(eq(sourceCaptureVersions.id, source.currentCaptureVersionId), eq(sourceCaptureVersions.sourceId, sourceId))).limit(1)
      : [];

    if (!raw?.rawText?.trim()) {
      throw new KnowledgeExtractionError("Nguồn này chưa có văn bản đọc được để AI trích xuất.", "unsupported_material");
    }

    if (await sourceAlreadyHasExtraction(transaction, sourceId)) {
      throw new KnowledgeExtractionError("Nguồn này đã được AI trích xuất trước đó.", "already_extracted");
    }

    const [activeJob] = await transaction
      .select({ id: knowledgeExtractionJobs.id, status: knowledgeExtractionJobs.status, mode: knowledgeExtractionJobs.mode })
      .from(knowledgeExtractionJobs)
      .where(and(eq(knowledgeExtractionJobs.sourceId, sourceId), inArray(knowledgeExtractionJobs.status, activeJobStatuses)))
      .limit(1);

    if (activeJob) {
      return { status: "already_active" as const, job: activeJob };
    }

    const [job] = await transaction
      .insert(knowledgeExtractionJobs)
      .values({
        sourceId,
        captureVersionId: source.currentCaptureVersionId,
        facebookCaptureReviewId: input.facebookCaptureReviewId ?? null,
        mode: input.mode,
        status: "queued",
        maxAttempts: defaultMaxAttempts,
        nextRunAt: new Date(),
        createdByUserId: input.actor.userId,
        createdByEmail: input.actor.email,
      })
      .returning();

    return { status: "queued" as const, job };
  });
}

export async function getActiveKnowledgeExtractionJobForSource(db: Pick<ExtractionJobDb, "select">, sourceId: string) {
  const [job] = await db
    .select({
      id: knowledgeExtractionJobs.id,
      mode: knowledgeExtractionJobs.mode,
      status: knowledgeExtractionJobs.status,
      attemptCount: knowledgeExtractionJobs.attemptCount,
      maxAttempts: knowledgeExtractionJobs.maxAttempts,
      nextRunAt: knowledgeExtractionJobs.nextRunAt,
      startedAt: knowledgeExtractionJobs.startedAt,
      lastErrorCode: knowledgeExtractionJobs.lastErrorCode,
      lastErrorMessage: knowledgeExtractionJobs.lastErrorMessage,
    })
    .from(knowledgeExtractionJobs)
    .where(and(eq(knowledgeExtractionJobs.sourceId, sourceId), inArray(knowledgeExtractionJobs.status, activeJobStatuses)))
    .orderBy(asc(knowledgeExtractionJobs.createdAt))
    .limit(1);

  return job ?? null;
}

export async function processNextKnowledgeExtractionJob(options: { workerId?: string; now?: Date } = {}, db = getDb()) {
  const recovery = await recoverStaleKnowledgeExtractionJobs({ now: options.now }, db);
  const job = await claimNextKnowledgeExtractionJob(options, db);

  if (!job) {
    const observations = recovery.observations.length ? recovery.observations : [extractionObservation("no_work")];
    return { status: "no_job" as const, recoveredFailures: recovery.failures, observations, observation: observations.at(-1)! };
  }

  const result = await processKnowledgeExtractionJob(job.id, db);
  const observation = extractionObservation(result.status === "failed" ? result.disposition : result.status === "not_processable" ? "contended" : "success", job);
  return { ...result, recoveredFailures: recovery.failures, observations: [...recovery.observations, observation], observation };
}

export async function runKnowledgeExtractionWorkerLoop(options: { once?: boolean; workerId?: string; pollIntervalMs?: number; signal?: AbortSignal; onObservation?: (observation: WorkerPollObservation) => void | Promise<void> } = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? getWorkerPollIntervalMs();

  while (!options.signal?.aborted) {
    if (options.signal?.aborted) break;
    const result = await processNextKnowledgeExtractionJob({ workerId: options.workerId });
    for (const observation of result.observations) {
      await observe(options.onObservation, observation);
    }

    for (const failure of result.recoveredFailures) {
      console.warn("Knowledge extraction job failed", failure);
    }

    if (result.status === "failed") {
      console.warn("Knowledge extraction job failed", result.failure);
    }

    if (options.once) {
      const { observation, ...legacyResult } = result;
      void observation;
      return legacyResult;
    }

    if (result.status === "no_job") {
      await sleep(pollIntervalMs, options.signal);
    }
  }

  return { status: "stopped" as const };
}

function extractionObservation(resultCode: WorkerPollObservation["resultCode"], job?: Pick<typeof knowledgeExtractionJobs.$inferSelect, "id" | "lockedAt" | "nextRunAt" | "attemptCount"> | null, recovered = false): WorkerPollObservation {
  return {
    capability: "knowledge.extraction", resultCode,
    ...(job ? { durableId: job.id, retryCount: job.attemptCount, jobLagMs: Math.max(0, (job.lockedAt?.getTime() ?? 0) - job.nextRunAt.getTime()) } : {}),
    leaseRecovery: recovered ? "recovered" : "none",
    ...(recovered ? { leaseRecoveryCount: 1 } : {}),
  };
}

async function observe(callback: ((observation: WorkerPollObservation) => void | Promise<void>) | undefined, observation: WorkerPollObservation) { try { await callback?.(observation); } catch {} }

async function claimNextKnowledgeExtractionJob(options: { workerId?: string; now?: Date }, db: ExtractionJobDb) {
  const workerId = options.workerId ?? "knowledge-extraction-worker";
  const now = options.now ?? new Date();

  return db.transaction(async (transaction) => {
    const rows = await transaction.execute(sql`
      select id
      from knowledge_extraction_jobs
      where status = 'queued'
        and next_run_at <= ${now.toISOString()}::timestamptz
      order by created_at asc
      for update skip locked
      limit 1
    `) as Array<{ id: string }>;
    const id = rows[0]?.id;

    if (!id) {
      return null;
    }

    const [claimed] = await transaction
      .update(knowledgeExtractionJobs)
      .set({
        status: "running",
        attemptCount: sql`${knowledgeExtractionJobs.attemptCount} + 1`,
        lockedAt: now,
        lockedBy: workerId,
        startedAt: now,
        updatedAt: now,
      })
      .where(and(eq(knowledgeExtractionJobs.id, id), eq(knowledgeExtractionJobs.status, "queued")))
      .returning();

    if (claimed) await recordExtractionJobTransitionAudit(transaction, claimed.id, "claimed");
    return claimed ?? null;
  });
}

export async function processKnowledgeExtractionJob(jobId: string, db = getDb()) {
  const [job] = await db.select().from(knowledgeExtractionJobs).where(eq(knowledgeExtractionJobs.id, jobId)).limit(1);

  if (!job || job.status !== "running") {
    return { status: "not_processable" as const };
  }

  const requester = { userId: job.createdByUserId, email: job.createdByEmail };
  const workerActor = createSystemAuditActor("system-knowledge-pipeline");

  try {
    if (job.resultDraftIds && job.resultDraftIds.length > 0) {
      if (!await finalizeExistingDrafts(job, workerActor, db)) return { status: "not_processable" as const };
    } else {
        const result = await extractKnowledgeDraftsFromSourceAsActor(job.sourceId, requester, {
          captureVersionId: job.captureVersionId,
          executorSystem: workerActor.system,
        resultJobId: job.id,
        preProviderGuard: job.facebookCaptureReviewId ? ({ db: guardDb, sourceId, captureVersionId }) => assertFacebookCaptureStillNeedsReview(guardDb, { reviewId: job.facebookCaptureReviewId as string, sourceId, captureVersionId }) : undefined,
      });

      await db.update(knowledgeExtractionJobs).set({ resultDraftIds: result.draftIds, resultDraftCount: result.draftCount, updatedAt: new Date() }).where(eq(knowledgeExtractionJobs.id, job.id));
      if (!await finalizeJobSuccess(job, result, workerActor, db)) return { status: "not_processable" as const };
    }

    return { status: "processed" as const, jobId: job.id };
  } catch (error) {
    const failure = await handleJobFailure(job, error, db);
    return failure ? { status: "failed" as const, jobId: job.id, failure, disposition: failure.outcome === "queued" ? "retry" as const : "failure" as const } : { status: "not_processable" as const };
  }
}

async function finalizeExistingDrafts(job: typeof knowledgeExtractionJobs.$inferSelect, workerActor: ReturnType<typeof createSystemAuditActor>, db: ExtractionJobDb) {
  const draftIds = job.resultDraftIds ?? [];
  await assertJobDraftIdsBelongToSource(db, job.sourceId, draftIds, job.resultDraftCount);
  const result = { sourceId: job.sourceId, draftIds, draftCount: draftIds.length };
  return finalizeJobSuccess(job, result, workerActor, db);
}

async function finalizeJobSuccess(
  job: typeof knowledgeExtractionJobs.$inferSelect,
  result: { sourceId: string; draftIds: string[]; draftCount: number },
  workerActor: ReturnType<typeof createSystemAuditActor>,
  db: ExtractionJobDb,
) {
  if (!job.lockedAt || !job.lockedBy) return false;
  const lockedAt = job.lockedAt;
  const lockedBy = job.lockedBy;

  return db.transaction(async (transaction) => {
    const [lease] = await transaction
      .select({ id: knowledgeExtractionJobs.id })
      .from(knowledgeExtractionJobs)
      .where(and(
        eq(knowledgeExtractionJobs.id, job.id),
        eq(knowledgeExtractionJobs.status, "running"),
        eq(knowledgeExtractionJobs.lockedBy, lockedBy),
        eq(knowledgeExtractionJobs.lockedAt, lockedAt),
      ))
      .limit(1)
      .for("update");

    if (!lease) return false;

    await assertJobDraftIdsBelongToSource(transaction, job.sourceId, result.draftIds, result.draftCount);

    if (job.facebookCaptureReviewId) {
      await assertFacebookCaptureStillNeedsReview(transaction, { reviewId: job.facebookCaptureReviewId, sourceId: job.sourceId, captureVersionId: job.captureVersionId });
    }

    if (job.mode === "extract_and_approve_all") {
      await approveKnowledgeDraftBatchForSystemInTransaction(transaction, workerActor.system, result.draftIds);
    }

    if (job.facebookCaptureReviewId) {
      const extractedStatus = await markFacebookCaptureReviewStatusInTransaction(transaction, { reviewId: job.facebookCaptureReviewId, status: "extracted", actor: workerActor });

      if (extractedStatus.status !== "updated") {
        throw new Error(`extract_status_${extractedStatus.status}`);
      }

      if (job.mode === "extract_and_approve_all") {
        const approvedStatus = await markFacebookCaptureReviewStatusInTransaction(transaction, { reviewId: job.facebookCaptureReviewId, status: "extracted_approved", actor: workerActor });

        if (approvedStatus.status !== "updated") {
          throw new Error(`approve_all_status_${approvedStatus.status}`);
        }
      }
    }

    const [succeeded] = await transaction
      .update(knowledgeExtractionJobs)
      .set({ status: "succeeded", resultDraftIds: result.draftIds, resultDraftCount: result.draftCount, finishedAt: new Date(), lockedAt: null, lockedBy: null, updatedAt: new Date(), lastErrorCode: null, lastErrorMessage: null })
      .where(and(
        eq(knowledgeExtractionJobs.id, job.id),
        eq(knowledgeExtractionJobs.status, "running"),
        eq(knowledgeExtractionJobs.lockedBy, lockedBy),
        eq(knowledgeExtractionJobs.lockedAt, lockedAt),
      ))
      .returning({ id: knowledgeExtractionJobs.id });
    if (succeeded) await recordExtractionJobTransitionAudit(transaction, job.id, "succeeded");
    return Boolean(succeeded);
  });
}

async function assertJobDraftIdsBelongToSource(db: Pick<ExtractionJobDb, "select">, sourceId: string, draftIds: string[], expectedCount: number | null) {
  if (draftIds.length === 0) {
    throw new Error("job_result_empty_drafts");
  }

  if (new Set(draftIds).size !== draftIds.length || (expectedCount !== null && expectedCount !== draftIds.length)) {
    throw new Error("job_result_mismatch");
  }

  const rows = await db
    .select({ id: knowledgeCards.id })
    .from(knowledgeCards)
    .innerJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id))
    .where(and(inArray(knowledgeCards.id, draftIds), eq(knowledgeCardSources.sourceId, sourceId), eq(knowledgeCards.aiPromptVersion, sourceKnowledgeDraftExtractionPromptVersion)));

  if (rows.length !== draftIds.length) {
    throw new Error("job_result_source_mismatch");
  }
}

async function handleJobFailure(job: typeof knowledgeExtractionJobs.$inferSelect, error: unknown, db: ExtractionJobDb) {
  const retryable = isRetryableJobError(error);
  const attemptsRemain = job.attemptCount < job.maxAttempts;
  const now = new Date();
  const safe = toSafeJobError(error);

  if (retryable && attemptsRemain) {
    const updated = await db.transaction(async (transaction) => {
      const [transition] = await transaction
        .update(knowledgeExtractionJobs)
        .set({ status: "queued", nextRunAt: new Date(now.getTime() + getRetryDelayMs(job.attemptCount)), lockedAt: null, lockedBy: null, lastErrorCode: safe.code, lastErrorMessage: safe.message, updatedAt: now })
        .where(and(eq(knowledgeExtractionJobs.id, job.id), eq(knowledgeExtractionJobs.status, "running"), eq(knowledgeExtractionJobs.lockedBy, job.lockedBy ?? ""), eq(knowledgeExtractionJobs.lockedAt, job.lockedAt ?? new Date(0))))
        .returning({ id: knowledgeExtractionJobs.id });
      if (transition) await recordExtractionJobTransitionAudit(transaction, job.id, "retry_queued");
      return transition;
    });
    if (!updated) return null;
    return toJobFailureLog(job, safe, true, "queued");
  }

  const updated = await db.transaction(async (transaction) => {
    const [transition] = await transaction
      .update(knowledgeExtractionJobs)
      .set({ status: "failed", finishedAt: now, lockedAt: null, lockedBy: null, lastErrorCode: safe.code, lastErrorMessage: safe.message, updatedAt: now })
      .where(and(eq(knowledgeExtractionJobs.id, job.id), eq(knowledgeExtractionJobs.status, "running"), eq(knowledgeExtractionJobs.lockedBy, job.lockedBy ?? ""), eq(knowledgeExtractionJobs.lockedAt, job.lockedAt ?? new Date(0))))
      .returning({ id: knowledgeExtractionJobs.id });
    if (transition) await recordExtractionJobTransitionAudit(transaction, job.id, "failed");
    return transition;
  });

  if (!updated) return null;

  if (job.facebookCaptureReviewId && job.captureVersionId) {
    await assertFacebookCaptureStillNeedsReview(db, { reviewId: job.facebookCaptureReviewId, sourceId: job.sourceId, captureVersionId: job.captureVersionId })
      .then(() => markFacebookCaptureReviewStatus(db, { reviewId: job.facebookCaptureReviewId as string, status: "extraction_failed", actor: createSystemAuditActor("system-knowledge-pipeline"), extractionError: `Extraction failed: ${safe.code}` }))
      .catch(() => undefined);
  }

  return toJobFailureLog(job, safe, false, "failed");
}

export async function recoverStaleKnowledgeExtractionJobs(options: { now?: Date; staleMs?: number } = {}, db = getDb()) {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - (options.staleMs ?? getStaleRunningMs()));

  const failedRows = await db.transaction(async (transaction) => {
    const transitions = await transaction
      .update(knowledgeExtractionJobs)
      .set({ status: "failed", finishedAt: now, lockedAt: null, lockedBy: null, lastErrorCode: "stale_max_attempts", lastErrorMessage: "Extraction failed: stale_max_attempts", updatedAt: now })
      .where(and(eq(knowledgeExtractionJobs.status, "running"), isNotNull(knowledgeExtractionJobs.lockedAt), lte(knowledgeExtractionJobs.lockedAt, staleBefore), sql`${knowledgeExtractionJobs.attemptCount} >= ${knowledgeExtractionJobs.maxAttempts}`))
      .returning({ id: knowledgeExtractionJobs.id, sourceId: knowledgeExtractionJobs.sourceId, facebookCaptureReviewId: knowledgeExtractionJobs.facebookCaptureReviewId, captureVersionId: knowledgeExtractionJobs.captureVersionId, mode: knowledgeExtractionJobs.mode, attemptCount: knowledgeExtractionJobs.attemptCount, maxAttempts: knowledgeExtractionJobs.maxAttempts, createdByUserId: knowledgeExtractionJobs.createdByUserId, createdByEmail: knowledgeExtractionJobs.createdByEmail });
    for (const transition of transitions) await recordExtractionJobTransitionAudit(transaction, transition.id, "stale_failed");
    return transitions;
  });

  for (const row of failedRows) {
    if (row.facebookCaptureReviewId && row.captureVersionId) {
      await assertFacebookCaptureStillNeedsReview(db, { reviewId: row.facebookCaptureReviewId, sourceId: row.sourceId, captureVersionId: row.captureVersionId })
        .then(() => markFacebookCaptureReviewStatus(db, { reviewId: row.facebookCaptureReviewId as string, status: "extraction_failed", actor: createSystemAuditActor("system-knowledge-pipeline"), extractionError: "Extraction failed: stale_max_attempts" }))
        .catch(() => undefined);
    }
  }

  const rows = await db.transaction(async (transaction) => {
    const transitions = await transaction
      .update(knowledgeExtractionJobs)
      .set({ status: "queued", lockedAt: null, lockedBy: null, nextRunAt: now, updatedAt: now })
      .where(and(eq(knowledgeExtractionJobs.status, "running"), isNotNull(knowledgeExtractionJobs.lockedAt), lte(knowledgeExtractionJobs.lockedAt, staleBefore), sql`${knowledgeExtractionJobs.attemptCount} < ${knowledgeExtractionJobs.maxAttempts}`))
      .returning({ id: knowledgeExtractionJobs.id, attemptCount: knowledgeExtractionJobs.attemptCount });
    for (const transition of transitions) await recordExtractionJobTransitionAudit(transaction, transition.id, "stale_requeued");
    return transitions;
  });

  return {
    recoveredCount: rows.length,
    failedCount: failedRows.length,
    jobIds: rows.map((row) => row.id),
    failures: failedRows.map((row) => toJobFailureLog(row, { code: "stale_max_attempts", detail: undefined, message: "Extraction failed: stale_max_attempts" }, false, "failed")),
    observations: [
      ...failedRows.map((row) => extractionObservation("failure", { id: row.id, lockedAt: null, nextRunAt: now, attemptCount: row.attemptCount }, true)),
      ...rows.map((row) => extractionObservation("retry", { id: row.id, lockedAt: null, nextRunAt: now, attemptCount: row.attemptCount }, true)),
    ],
  };
}

async function lockSourceJobEnqueue(db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }, sourceId: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sourceId}, 43))`);
}

async function sourceAlreadyHasExtraction(db: Pick<ExtractionJobDb, "select">, sourceId: string) {
  const [existingLink] = await db
    .select({ sourceId: knowledgeCardSources.sourceId })
    .from(knowledgeCardSources)
    .innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSources.knowledgeCardId))
    .where(and(eq(knowledgeCardSources.sourceId, sourceId), eq(knowledgeCards.aiPromptVersion, sourceKnowledgeDraftExtractionPromptVersion)))
    .limit(1);
  return Boolean(existingLink);
}

function isRetryableJobError(error: unknown) {
  if (isKnowledgeExtractionError(error) && error instanceof KnowledgeExtractionError) {
    return error.code === "provider_failed";
  }

  if (error instanceof Error) {
    return /gateway|network|timeout|abort|provider/i.test(error.message);
  }

  return false;
}

function toSafeJobError(error: unknown) {
  if (isKnowledgeExtractionError(error) && error instanceof KnowledgeExtractionError) {
    const detail = normalizeSafeDetail(error.safeDetail);
    return { code: error.code, detail, message: `Extraction failed: ${error.code}${detail ? ` (${detail})` : ""}` };
  }

  return { code: "worker_error", detail: undefined, message: "Extraction failed: worker_error" };
}

function normalizeSafeDetail(value: string | undefined) {
  if (!value || !/^[a-z0-9_:-]{1,120}$/.test(value)) {
    return undefined;
  }

  return value;
}

function toJobFailureLog(job: Pick<typeof knowledgeExtractionJobs.$inferSelect, "id" | "sourceId" | "facebookCaptureReviewId" | "mode" | "attemptCount" | "maxAttempts">, safe: ReturnType<typeof toSafeJobError>, retryable: boolean, outcome: "queued" | "failed") {
  return {
    jobId: job.id,
    sourceId: job.sourceId,
    facebookCaptureReviewId: job.facebookCaptureReviewId,
    mode: job.mode,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    code: safe.code,
    detail: safe.detail,
    retryable,
    outcome,
  };
}

function getRetryDelayMs(attemptCount: number) {
  return retryBackoffMs[Math.min(Math.max(attemptCount - 1, 0), retryBackoffMs.length - 1)];
}

async function recordExtractionJobTransitionAudit(db: Pick<ExtractionJobDb, "insert">, jobId: string, transition: string) {
  await recordAuditEvent({ actor: createSystemAuditActor("system-knowledge-pipeline"), operation: "update", targetType: "knowledge_extraction_job", targetId: jobId, afterSummary: `Knowledge extraction job worker transition: ${transition}.` }, db);
}

function getWorkerPollIntervalMs() {
  return normalizeEnvMs(process.env.KNOWLEDGE_EXTRACTION_WORKER_POLL_MS, defaultPollIntervalMs, 1_000, 60_000);
}

function getStaleRunningMs() {
  return normalizeEnvMs(process.env.KNOWLEDGE_EXTRACTION_WORKER_STALE_MS, defaultStaleRunningMs, 60_000, 60 * 60_000);
}

function normalizeEnvMs(value: string | undefined, fallback: number, min: number, max: number) {
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
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
