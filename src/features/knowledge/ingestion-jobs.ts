import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeIngestionJobs, sourceCaptureVersions, sources, users } from "@/db/schema";

type IngestionJobDb = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update" | "execute">;

const defaultMaxAttempts = 3;
const defaultLeaseMs = 15 * 60_000;
const minLeaseMs = 60_000;
const maxLeaseMs = 60 * 60_000;

export class KnowledgeIngestionJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeIngestionJobError";
  }
}

export type KnowledgeIngestionJobStatus = {
  id: string;
  sourceId: string;
  captureVersionId: string;
  stage: typeof knowledgeIngestionJobs.$inferSelect.stage;
  stageVersion: number;
  attemptCount: number;
  maxAttempts: number;
  nextRunAt: Date;
  lastErrorCode: string | null;
  requeueReasonCode: string | null;
  claimedBy: string | null;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  expired: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeIngestionClaim = {
  jobId: string;
  sourceId: string;
  captureVersionId: string;
  stage: "queued";
  stageVersion: number;
  attemptCount: number;
  leaseExpiresAt: Date;
  fencingToken: string;
};

export async function ensureIngestionJobForCaptureVersion(
  db: IngestionJobDb,
  input: { sourceId: string; captureVersionId: string },
) {
  const sourceId = input.sourceId.trim();
  const captureVersionId = input.captureVersionId.trim();
  if (!sourceId || !captureVersionId) throw new KnowledgeIngestionJobError("A source and capture version are required.");

  const [capture] = await db
    .select({ id: sourceCaptureVersions.id, sourceId: sourceCaptureVersions.sourceId })
    .from(sourceCaptureVersions)
    .where(and(eq(sourceCaptureVersions.id, captureVersionId), eq(sourceCaptureVersions.sourceId, sourceId), isNull(sourceCaptureVersions.payloadDeletedAt), sql`length(btrim(${sourceCaptureVersions.rawText})) > 0`))
    .limit(1);
  if (!capture) throw new KnowledgeIngestionJobError("The capture version is not readable or does not belong to the source.");

  const [source] = await db
    .select({ submittedByUserId: sources.submittedByUserId, submittedByEmail: users.email })
    .from(sources)
    .innerJoin(users, eq(users.id, sources.submittedByUserId))
    .where(eq(sources.id, sourceId))
    .limit(1);
  if (!source?.submittedByEmail) throw new KnowledgeIngestionJobError("The source submitter provenance is unavailable.");

  // Recheck capture eligibility in the write itself so retention cannot create work for a tombstoned payload.
  const created = await db.execute(sql`
    insert into knowledge_ingestion_jobs (
      id, source_id, capture_version_id, submitted_by_user_id, submitted_by_email,
      stage, stage_version, attempt_count, max_attempts, next_run_at
    )
    select
      ${randomUUID()}, capture.source_id, capture.id, source.submitted_by_user_id, submitter.email,
      'queued', 1, 0, ${defaultMaxAttempts}, timezone('UTC', now())
    from source_capture_versions capture
    join sources source on source.id = capture.source_id
    join users submitter on submitter.id = source.submitted_by_user_id
    where capture.id = ${captureVersionId}
      and capture.source_id = ${sourceId}
      and capture.payload_deleted_at is null
      and length(btrim(capture.raw_text)) > 0
      and length(btrim(submitter.email)) between 1 and 320
    for key share of capture
    on conflict (capture_version_id) do nothing
    returning *
  `) as Array<typeof knowledgeIngestionJobs.$inferSelect>;
  if (created[0]) return created[0];

  const [existing] = await db.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, captureVersionId)).limit(1);
  if (!existing) throw new KnowledgeIngestionJobError("The canonical ingestion job could not be created.");
  return existing;
}

export async function claimNextKnowledgeIngestionJob(
  input: { workerId: string; expectedStageVersion: number; now?: Date },
  db = getDb(),
): Promise<KnowledgeIngestionClaim | null> {
  const workerId = input.workerId.trim();
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new KnowledgeIngestionJobError("Worker ID is invalid.");
  if (!Number.isInteger(input.expectedStageVersion) || input.expectedStageVersion < 1) throw new KnowledgeIngestionJobError("Expected stage version is invalid.");
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + getClaimLeaseMs());
  const fencingToken = randomBytes(32).toString("hex");

  return db.transaction(async (transaction) => {
    const rows = await transaction.execute(sql`
      select id
      from knowledge_ingestion_jobs
      where stage = 'queued'
        and stage_version = ${input.expectedStageVersion}
        and next_run_at <= timezone('UTC', ${now.toISOString()}::timestamptz)
        and attempt_count < max_attempts
        and claimed_by is null
      order by next_run_at asc, created_at asc
      for update skip locked
      limit 1
    `) as Array<{ id: string }>;
    const id = rows[0]?.id;
    if (!id) return null;

    const [claimed] = await transaction
      .update(knowledgeIngestionJobs)
      .set({ claimedBy: workerId, claimedAt: now, leaseExpiresAt, fencingToken, attemptCount: sql`${knowledgeIngestionJobs.attemptCount} + 1`, updatedAt: now })
      .where(and(eq(knowledgeIngestionJobs.id, id), eq(knowledgeIngestionJobs.stage, "queued"), eq(knowledgeIngestionJobs.stageVersion, input.expectedStageVersion), lte(knowledgeIngestionJobs.nextRunAt, now), isNull(knowledgeIngestionJobs.claimedBy), sql`${knowledgeIngestionJobs.attemptCount} < ${knowledgeIngestionJobs.maxAttempts}`))
      .returning();
    if (!claimed) return null;

    return { jobId: claimed.id, sourceId: claimed.sourceId, captureVersionId: claimed.captureVersionId, stage: "queued", stageVersion: claimed.stageVersion, attemptCount: claimed.attemptCount, leaseExpiresAt: claimed.leaseExpiresAt as Date, fencingToken };
  });
}

export async function listKnowledgeIngestionJobStatuses(db: Pick<IngestionJobDb, "select">, now = new Date()): Promise<KnowledgeIngestionJobStatus[]> {
  const rows = await db
    .select({ id: knowledgeIngestionJobs.id, sourceId: knowledgeIngestionJobs.sourceId, captureVersionId: knowledgeIngestionJobs.captureVersionId, stage: knowledgeIngestionJobs.stage, stageVersion: knowledgeIngestionJobs.stageVersion, attemptCount: knowledgeIngestionJobs.attemptCount, maxAttempts: knowledgeIngestionJobs.maxAttempts, nextRunAt: knowledgeIngestionJobs.nextRunAt, lastErrorCode: knowledgeIngestionJobs.lastErrorCode, requeueReasonCode: knowledgeIngestionJobs.requeueReasonCode, claimedBy: knowledgeIngestionJobs.claimedBy, claimedAt: knowledgeIngestionJobs.claimedAt, leaseExpiresAt: knowledgeIngestionJobs.leaseExpiresAt, createdAt: knowledgeIngestionJobs.createdAt, updatedAt: knowledgeIngestionJobs.updatedAt })
    .from(knowledgeIngestionJobs)
    .orderBy(asc(knowledgeIngestionJobs.createdAt));
  return rows.map((job) => ({ ...job, expired: job.leaseExpiresAt !== null && job.leaseExpiresAt <= now }));
}

export function getClaimLeaseMs() {
  return normalizeLeaseMs(process.env.KNOWLEDGE_INGESTION_CLAIM_LEASE_MS);
}

function normalizeLeaseMs(value: string | undefined) {
  if (!value) return defaultLeaseMs;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), minLeaseMs), maxLeaseMs) : defaultLeaseMs;
}
