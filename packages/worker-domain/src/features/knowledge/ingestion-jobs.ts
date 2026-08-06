import { randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { getDb, knowledgeIngestionCandidates, knowledgeIngestionJobs, lockKnowledgeIngestionJob, projectAndFinalizeKnowledgeIngestionJob, sourceCaptureVersions, sources, users } from "@xuyenviet/database";

type IngestionJobDb = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update" | "execute" | "transaction">;

const defaultMaxAttempts = 3;
const defaultLeaseMs = 15 * 60_000;
const minLeaseMs = 10 * 60_000;
const maxLeaseMs = 60 * 60_000;

export class KnowledgeIngestionJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeIngestionJobError";
  }
}

export type KnowledgeIngestionJobStatus = Pick<typeof knowledgeIngestionJobs.$inferSelect, "id" | "sourceId" | "captureVersionId" | "status" | "discoveryTerminal" | "candidateCount" | "completedCandidateCount" | "needsOperatorCandidateCount" | "failedCandidateCount" | "attemptCount" | "maxAttempts" | "nextRunAt" | "lastErrorCode" | "requeueReasonCode" | "claimedBy" | "claimedAt" | "leaseExpiresAt" | "createdAt" | "updatedAt"> & { expired: boolean };
export type KnowledgeIngestionClaim = { jobId: string; sourceId: string; captureVersionId: string; status: "running"; attemptCount: number; maxAttempts: number; claimedAt: Date; nextRunAt: Date; leaseExpiresAt: Date; fencingToken: string };
export type KnowledgeIngestionCandidateClaim = { candidateId: string; jobId: string; sourceId: string; captureVersionId: string; processingStatus: "processing"; attemptCount: number; claimedAt: Date; nextRunAt: Date; fencingToken: string; leaseExpiresAt: Date };

export async function ensureIngestionJobForCaptureVersion(db: IngestionJobDb, input: { sourceId: string; captureVersionId: string }) {
  const sourceId = input.sourceId.trim();
  const captureVersionId = input.captureVersionId.trim();
  if (!sourceId || !captureVersionId) throw new KnowledgeIngestionJobError("A source and capture version are required.");
  const [capture] = await db.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).where(and(eq(sourceCaptureVersions.id, captureVersionId), eq(sourceCaptureVersions.sourceId, sourceId), isNull(sourceCaptureVersions.payloadDeletedAt), sql`length(btrim(${sourceCaptureVersions.rawText})) > 0`)).limit(1);
  if (!capture) throw new KnowledgeIngestionJobError("The capture version is not readable or does not belong to the source.");
  const [submitter] = await db.select({ email: users.email }).from(sources).innerJoin(users, eq(users.id, sources.submittedByUserId)).where(eq(sources.id, sourceId)).limit(1);
  if (!submitter?.email) throw new KnowledgeIngestionJobError("The source submitter provenance is unavailable.");
  const created = await db.insert(knowledgeIngestionJobs).values({ id: randomUUID(), sourceId, captureVersionId, submittedByUserId: (await db.select({ id: sources.submittedByUserId }).from(sources).where(eq(sources.id, sourceId)).limit(1))[0]!.id, submittedByEmail: submitter.email, maxAttempts: defaultMaxAttempts }).onConflictDoNothing().returning();
  if (created[0]) return created[0];
  const [existing] = await db.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, captureVersionId)).limit(1);
  if (!existing) throw new KnowledgeIngestionJobError("The canonical ingestion job could not be created.");
  return existing;
}

export async function claimNextKnowledgeIngestionJob(input: { workerId: string; now?: Date }, db: IngestionJobDb = getDb()): Promise<KnowledgeIngestionClaim | null> {
  const workerId = input.workerId.trim();
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new KnowledgeIngestionJobError("Worker ID is invalid.");
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + getClaimLeaseMs());
  const fencingToken = randomBytes(32).toString("hex");
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`select id from knowledge_ingestion_jobs where status = 'queued' and next_run_at <= ${now.toISOString()}::timestamptz and attempt_count < max_attempts and claimed_by is null order by next_run_at, created_at for update skip locked limit 1`) as Array<{ id: string }>;
    if (!rows[0]) return null;
    const [job] = await tx.update(knowledgeIngestionJobs).set({ status: "running", claimedBy: workerId, claimedAt: now, leaseExpiresAt, fencingToken, attemptCount: sql`${knowledgeIngestionJobs.attemptCount} + 1`, requeueReasonCode: null, updatedAt: now }).where(and(eq(knowledgeIngestionJobs.id, rows[0].id), eq(knowledgeIngestionJobs.status, "queued"), isNull(knowledgeIngestionJobs.claimedBy))).returning();
    return job ? { jobId: job.id, sourceId: job.sourceId, captureVersionId: job.captureVersionId, status: "running", attemptCount: job.attemptCount, maxAttempts: job.maxAttempts, claimedAt: job.claimedAt!, nextRunAt: job.nextRunAt, leaseExpiresAt: job.leaseExpiresAt!, fencingToken } : null;
  });
}

export async function claimNextKnowledgeIngestionCandidate(input: { workerId: string; now?: Date }, db: IngestionJobDb = getDb()): Promise<KnowledgeIngestionCandidateClaim | null> {
  const workerId = input.workerId.trim();
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new KnowledgeIngestionJobError("Worker ID is invalid.");
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + getClaimLeaseMs());
  const fencingToken = randomBytes(32).toString("hex");
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`select c.id from knowledge_ingestion_candidates c join knowledge_ingestion_jobs j on j.id = c.ingestion_job_id where c.processing_status = 'queued' and c.claimed_by is null and c.next_run_at <= ${now.toISOString()}::timestamptz and c.attempt_count < c.max_attempts and j.status in ('queued', 'running') order by c.next_run_at, c.created_at for update skip locked limit 1`) as Array<{ id: string }>;
    if (!rows[0]) return null;
    const [candidate] = await tx.update(knowledgeIngestionCandidates).set({ processingStatus: "processing", claimedBy: workerId, claimedAt: now, leaseExpiresAt, fencingToken, attemptCount: sql`${knowledgeIngestionCandidates.attemptCount} + 1`, updatedAt: now }).where(and(eq(knowledgeIngestionCandidates.id, rows[0].id), eq(knowledgeIngestionCandidates.processingStatus, "queued"), isNull(knowledgeIngestionCandidates.claimedBy))).returning();
    return candidate ? { candidateId: candidate.id, jobId: candidate.ingestionJobId, sourceId: candidate.sourceId, captureVersionId: candidate.captureVersionId, processingStatus: "processing", attemptCount: candidate.attemptCount, claimedAt: candidate.claimedAt!, nextRunAt: candidate.nextRunAt, fencingToken, leaseExpiresAt: candidate.leaseExpiresAt! } : null;
  });
}

export async function failKnowledgeIngestionCandidate(input: { candidateId: string; fencingToken: string; errorCode: string; now?: Date }, db: IngestionJobDb = getDb()) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [ownedCandidate] = await tx.select({ ingestionJobId: knowledgeIngestionCandidates.ingestionJobId }).from(knowledgeIngestionCandidates).where(and(eq(knowledgeIngestionCandidates.id, input.candidateId), eq(knowledgeIngestionCandidates.processingStatus, "processing"), eq(knowledgeIngestionCandidates.fencingToken, input.fencingToken), gt(knowledgeIngestionCandidates.leaseExpiresAt, now))).limit(1).for("update");
    if (!ownedCandidate) return null;
    await lockKnowledgeIngestionJob(tx, ownedCandidate.ingestionJobId);
    const [candidate] = await tx.update(knowledgeIngestionCandidates).set({ processingStatus: "failed", aiDisposition: null, outcomeReasonCode: null, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now }).where(and(eq(knowledgeIngestionCandidates.id, input.candidateId), eq(knowledgeIngestionCandidates.processingStatus, "processing"), eq(knowledgeIngestionCandidates.fencingToken, input.fencingToken), gt(knowledgeIngestionCandidates.leaseExpiresAt, now))).returning({ ingestionJobId: knowledgeIngestionCandidates.ingestionJobId, processingStatus: knowledgeIngestionCandidates.processingStatus });
    if (!candidate) return null;
    await tx.update(knowledgeIngestionJobs).set({ lastErrorCode: input.errorCode, updatedAt: now }).where(eq(knowledgeIngestionJobs.id, candidate.ingestionJobId));
    await projectAndFinalizeKnowledgeIngestionJob(tx, candidate.ingestionJobId, now);
    return candidate;
  });
}

export async function finalizeKnowledgeIngestionJob(db: Pick<IngestionJobDb, "update" | "execute">, jobId: string, now = new Date()) {
  await projectAndFinalizeKnowledgeIngestionJob(db, jobId, now);
}

export async function recoverKnowledgeIngestionJobs(db: IngestionJobDb = getDb(), now = new Date()) {
  return db.transaction(async (tx) => {
    const exhaustedRows = await tx.update(knowledgeIngestionJobs).set({ status: "failed", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, lastErrorCode: "retry_exhausted", requeueReasonCode: "retry_exhausted", updatedAt: now }).where(and(eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.discoveryTerminal, false), lte(knowledgeIngestionJobs.leaseExpiresAt, now), sql`${knowledgeIngestionJobs.attemptCount} >= ${knowledgeIngestionJobs.maxAttempts}`)).returning({ id: knowledgeIngestionJobs.id, attemptCount: knowledgeIngestionJobs.attemptCount });
    const recoveredRows = await tx.update(knowledgeIngestionJobs).set({ status: "queued", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, requeueReasonCode: "lease_expired", nextRunAt: now, updatedAt: now }).where(and(eq(knowledgeIngestionJobs.status, "running"), eq(knowledgeIngestionJobs.discoveryTerminal, false), lte(knowledgeIngestionJobs.leaseExpiresAt, now), sql`${knowledgeIngestionJobs.attemptCount} < ${knowledgeIngestionJobs.maxAttempts}`)).returning({ id: knowledgeIngestionJobs.id, attemptCount: knowledgeIngestionJobs.attemptCount });
    const expiredCandidates = await tx.select({ ingestionJobId: knowledgeIngestionCandidates.ingestionJobId }).from(knowledgeIngestionCandidates).where(and(eq(knowledgeIngestionCandidates.processingStatus, "processing"), lte(knowledgeIngestionCandidates.leaseExpiresAt, now))).for("update");
    for (const ingestionJobId of [...new Set(expiredCandidates.map((candidate) => candidate.ingestionJobId))].sort()) await lockKnowledgeIngestionJob(tx, ingestionJobId);
    const exhaustedCandidates = await tx.update(knowledgeIngestionCandidates).set({ processingStatus: "failed", aiDisposition: null, outcomeReasonCode: null, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now }).where(and(eq(knowledgeIngestionCandidates.processingStatus, "processing"), lte(knowledgeIngestionCandidates.leaseExpiresAt, now), sql`${knowledgeIngestionCandidates.attemptCount} >= ${knowledgeIngestionCandidates.maxAttempts}`)).returning({ id: knowledgeIngestionCandidates.id, ingestionJobId: knowledgeIngestionCandidates.ingestionJobId, attemptCount: knowledgeIngestionCandidates.attemptCount });
    const recoveredCandidates = await tx.update(knowledgeIngestionCandidates).set({ processingStatus: "queued", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: now, updatedAt: now }).where(and(eq(knowledgeIngestionCandidates.processingStatus, "processing"), lte(knowledgeIngestionCandidates.leaseExpiresAt, now), sql`${knowledgeIngestionCandidates.attemptCount} < ${knowledgeIngestionCandidates.maxAttempts}`)).returning({ id: knowledgeIngestionCandidates.id, ingestionJobId: knowledgeIngestionCandidates.ingestionJobId, attemptCount: knowledgeIngestionCandidates.attemptCount });
    for (const candidate of exhaustedCandidates) await projectAndFinalizeKnowledgeIngestionJob(tx, candidate.ingestionJobId, now);
    return { recovered: recoveredRows.length, exhausted: exhaustedRows.length, recoveredRows, exhaustedRows, recoveredCandidates, exhaustedCandidates };
  });
}

export async function listKnowledgeIngestionJobStatuses(db: Pick<IngestionJobDb, "select">, now = new Date()): Promise<KnowledgeIngestionJobStatus[]> {
  const rows = await db.select({ id: knowledgeIngestionJobs.id, sourceId: knowledgeIngestionJobs.sourceId, captureVersionId: knowledgeIngestionJobs.captureVersionId, status: knowledgeIngestionJobs.status, discoveryTerminal: knowledgeIngestionJobs.discoveryTerminal, candidateCount: knowledgeIngestionJobs.candidateCount, completedCandidateCount: knowledgeIngestionJobs.completedCandidateCount, needsOperatorCandidateCount: knowledgeIngestionJobs.needsOperatorCandidateCount, failedCandidateCount: knowledgeIngestionJobs.failedCandidateCount, attemptCount: knowledgeIngestionJobs.attemptCount, maxAttempts: knowledgeIngestionJobs.maxAttempts, nextRunAt: knowledgeIngestionJobs.nextRunAt, lastErrorCode: knowledgeIngestionJobs.lastErrorCode, requeueReasonCode: knowledgeIngestionJobs.requeueReasonCode, claimedBy: knowledgeIngestionJobs.claimedBy, claimedAt: knowledgeIngestionJobs.claimedAt, leaseExpiresAt: knowledgeIngestionJobs.leaseExpiresAt, createdAt: knowledgeIngestionJobs.createdAt, updatedAt: knowledgeIngestionJobs.updatedAt }).from(knowledgeIngestionJobs).orderBy(asc(knowledgeIngestionJobs.createdAt));
  return rows.map((job) => ({ ...job, expired: job.leaseExpiresAt !== null && job.leaseExpiresAt <= now }));
}

export function getClaimLeaseMs() {
  const parsed = Number(process.env.KNOWLEDGE_INGESTION_CLAIM_LEASE_MS);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), minLeaseMs), maxLeaseMs) : defaultLeaseMs;
}
