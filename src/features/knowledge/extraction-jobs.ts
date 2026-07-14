import "server-only";

import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  auditEvents,
  knowledgeCards,
  knowledgeCardSources,
  knowledgeExtractionJobs,
  rawSourceMaterial,
  sources,
  type KnowledgeExtractionJobMode,
} from "@/db/schema";
import { sourceKnowledgeDraftExtractionPromptVersion } from "@/features/ai/prompts";
import { extractKnowledgeDraftsFromSourceAsActor, isKnowledgeExtractionError, KnowledgeExtractionError } from "@/features/knowledge/extraction";
import { assertFacebookCaptureStillNeedsReview } from "@/features/knowledge/extraction";
import { markFacebookCaptureReviewStatus, markFacebookCaptureReviewStatusInTransaction, type FacebookCaptureReviewActor } from "@/features/knowledge/facebook-capture-review";

type ExtractionJobDb = ReturnType<typeof getDb>;

const activeJobStatuses = ["queued", "running"] as const;
const defaultMaxAttempts = 3;
const defaultPollIntervalMs = 5_000;
const defaultStaleRunningMs = 15 * 60_000;
const retryBackoffMs = [30_000, 120_000, 300_000] as const;

export type KnowledgeExtractionJobActor = FacebookCaptureReviewActor;

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
    const [source] = await transaction.select({ id: sources.id }).from(sources).where(eq(sources.id, sourceId)).limit(1);

    if (!source) {
      throw new KnowledgeExtractionError("Không tìm thấy nguồn cần trích xuất.", "invalid_source");
    }

    const [raw] = await transaction.select({ rawText: rawSourceMaterial.rawText }).from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, sourceId)).limit(1);

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
  await recoverStaleKnowledgeExtractionJobs({ now: options.now }, db);
  const job = await claimNextKnowledgeExtractionJob(options, db);

  if (!job) {
    return { status: "no_job" as const };
  }

  return processKnowledgeExtractionJob(job.id, db);
}

export async function runKnowledgeExtractionWorkerLoop(options: { once?: boolean; workerId?: string; pollIntervalMs?: number; signal?: AbortSignal } = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? getWorkerPollIntervalMs();

  while (!options.signal?.aborted) {
    const result = await processNextKnowledgeExtractionJob({ workerId: options.workerId });

    if (options.once) {
      return result;
    }

    if (result.status === "no_job") {
      await sleep(pollIntervalMs, options.signal);
    }
  }

  return { status: "stopped" as const };
}

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

    return claimed ?? null;
  });
}

export async function processKnowledgeExtractionJob(jobId: string, db = getDb()) {
  const [job] = await db.select().from(knowledgeExtractionJobs).where(eq(knowledgeExtractionJobs.id, jobId)).limit(1);

  if (!job || job.status !== "running") {
    return { status: "not_processable" as const };
  }

  const actor = { userId: job.createdByUserId, email: job.createdByEmail };

  try {
    if (job.resultDraftIds && job.resultDraftIds.length > 0) {
      await finalizeExistingDrafts(job, actor, db);
    } else {
      const result = await extractKnowledgeDraftsFromSourceAsActor(job.sourceId, actor, {
        preProviderGuard: job.facebookCaptureReviewId ? ({ db: guardDb, sourceId }) => assertFacebookCaptureStillNeedsReview(guardDb, { reviewId: job.facebookCaptureReviewId as string, sourceId }) : undefined,
      });

      await db.update(knowledgeExtractionJobs).set({ resultDraftIds: result.draftIds, resultDraftCount: result.draftCount, updatedAt: new Date() }).where(eq(knowledgeExtractionJobs.id, job.id));
      await finalizeJobSuccess(job.id, job.mode, result, actor, job.facebookCaptureReviewId, db);
    }

    return { status: "processed" as const, jobId: job.id };
  } catch (error) {
    await handleJobFailure(job, error, db);
    return { status: "failed" as const, jobId: job.id, error };
  }
}

async function finalizeExistingDrafts(job: typeof knowledgeExtractionJobs.$inferSelect, actor: KnowledgeExtractionJobActor, db: ExtractionJobDb) {
  const result = { sourceId: job.sourceId, draftIds: job.resultDraftIds ?? [], draftCount: job.resultDraftIds?.length ?? 0 };
  await finalizeJobSuccess(job.id, job.mode, result, actor, job.facebookCaptureReviewId, db);
}

async function finalizeJobSuccess(
  jobId: string,
  mode: KnowledgeExtractionJobMode,
  result: { sourceId: string; draftIds: string[]; draftCount: number },
  actor: KnowledgeExtractionJobActor,
  reviewId: string | null,
  db: ExtractionJobDb,
) {
  await db.transaction(async (transaction) => {
    if (mode === "extract_and_approve_all") {
      await approveJobDraftsInTransaction(transaction, actor, result.draftIds);
    }

    if (reviewId) {
      const extractedStatus = await markFacebookCaptureReviewStatusInTransaction(transaction, { reviewId, status: "extracted", actor });

      if (extractedStatus.status !== "updated" && extractedStatus.status !== "invalid_transition") {
        throw new Error(`extract_status_${extractedStatus.status}`);
      }

      if (mode === "extract_and_approve_all") {
        const approvedStatus = await markFacebookCaptureReviewStatusInTransaction(transaction, { reviewId, status: "extracted_approved", actor });

        if (approvedStatus.status !== "updated") {
          throw new Error(`approve_all_status_${approvedStatus.status}`);
        }
      }
    }

    await transaction
      .update(knowledgeExtractionJobs)
      .set({ status: "succeeded", resultDraftIds: result.draftIds, resultDraftCount: result.draftCount, finishedAt: new Date(), lockedAt: null, lockedBy: null, updatedAt: new Date(), lastErrorCode: null, lastErrorMessage: null })
      .where(eq(knowledgeExtractionJobs.id, jobId));
  });
}

async function approveJobDraftsInTransaction(db: Pick<ExtractionJobDb, "select" | "update" | "insert">, actor: KnowledgeExtractionJobActor, draftIds: string[]) {
  if (draftIds.length === 0) {
    throw new Error("approval_failed_empty_drafts");
  }

  for (const draftId of draftIds) {
    const [draft] = await db
      .select({ id: knowledgeCards.id, status: knowledgeCards.status, needsReview: knowledgeCards.needsReview, title: knowledgeCards.title, summary: knowledgeCards.summary, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, type: knowledgeCards.type, confidence: knowledgeCards.confidence, practicalDetails: knowledgeCards.practicalDetails })
      .from(knowledgeCards)
      .where(eq(knowledgeCards.id, draftId))
      .limit(1);

    if (!draft || draft.status !== "draft" || !draft.needsReview || !draft.title.trim() || !draft.summary.trim() || (!draft.locationName?.trim() && !draft.routeSegment?.trim()) || hasUnsafeApprovalDetails(draft.practicalDetails)) {
      throw new Error("approval_failed_invalid_draft");
    }

    const [updated] = await db
      .update(knowledgeCards)
      .set({ status: "approved", needsReview: false, updatedAt: new Date() })
      .where(and(eq(knowledgeCards.id, draftId), eq(knowledgeCards.status, "draft"), eq(knowledgeCards.needsReview, true)))
      .returning({ id: knowledgeCards.id });

    if (!updated) {
      throw new Error("approval_failed_not_reviewable");
    }

    await db.insert(auditEvents).values({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      operation: "approve",
      targetType: "knowledge_draft",
      targetId: draftId,
      beforeSummary: `Draft pending approval: type=${draft.type}; confidence=${draft.confidence}.`,
      afterSummary: "Operator-approved async extraction draft for retrieval eligibility. Embeddings were not created.",
    });
  }
}

function hasUnsafeApprovalDetails(value: Record<string, unknown>) {
  return Object.keys(value).some((key) => /raw[_-]?source|raw[_-]?metadata|provider[_-]?payload|storage[_-]?key/i.test(key));
}

async function handleJobFailure(job: typeof knowledgeExtractionJobs.$inferSelect, error: unknown, db: ExtractionJobDb) {
  const retryable = isRetryableJobError(error);
  const attemptsRemain = job.attemptCount < job.maxAttempts;
  const now = new Date();
  const safe = toSafeJobError(error);

  if (retryable && attemptsRemain) {
    await db
      .update(knowledgeExtractionJobs)
      .set({ status: "queued", nextRunAt: new Date(now.getTime() + getRetryDelayMs(job.attemptCount)), lockedAt: null, lockedBy: null, lastErrorCode: safe.code, lastErrorMessage: safe.message, updatedAt: now })
      .where(eq(knowledgeExtractionJobs.id, job.id));
    return;
  }

  await db
    .update(knowledgeExtractionJobs)
    .set({ status: "failed", finishedAt: now, lockedAt: null, lockedBy: null, lastErrorCode: safe.code, lastErrorMessage: safe.message, updatedAt: now })
    .where(eq(knowledgeExtractionJobs.id, job.id));

  if (job.facebookCaptureReviewId) {
    await markFacebookCaptureReviewStatus(db, { reviewId: job.facebookCaptureReviewId, status: "extraction_failed", actor: { userId: job.createdByUserId, email: job.createdByEmail }, extractionError: `Extraction failed: ${safe.code}` }).catch(() => undefined);
  }
}

export async function recoverStaleKnowledgeExtractionJobs(options: { now?: Date; staleMs?: number } = {}, db = getDb()) {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - (options.staleMs ?? getStaleRunningMs()));

  const rows = await db
    .update(knowledgeExtractionJobs)
    .set({ status: "queued", lockedAt: null, lockedBy: null, nextRunAt: now, updatedAt: now })
    .where(and(eq(knowledgeExtractionJobs.status, "running"), isNotNull(knowledgeExtractionJobs.lockedAt), lte(knowledgeExtractionJobs.lockedAt, staleBefore)))
    .returning({ id: knowledgeExtractionJobs.id });

  return { recoveredCount: rows.length, jobIds: rows.map((row) => row.id) };
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
    return { code: error.code, message: `Extraction failed: ${error.code}` };
  }

  if (error instanceof Error) {
    const code = error.message.replace(/[^a-z0-9_:-]/gi, "_").slice(0, 80) || "unknown";
    return { code, message: "Extraction failed: worker_error" };
  }

  return { code: "unknown", message: "Extraction failed: unknown" };
}

function getRetryDelayMs(attemptCount: number) {
  return retryBackoffMs[Math.min(Math.max(attemptCount - 1, 0), retryBackoffMs.length - 1)];
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
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
