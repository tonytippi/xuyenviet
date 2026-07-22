import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeIngestionJobs, knowledgeCardTypeValues, sourceCaptureVersions, sources, users } from "@/db/schema";

type IngestionJobDb = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update" | "execute" | "transaction">;
type Stage = typeof knowledgeIngestionJobs.$inferSelect.stage;
export type NonterminalIngestionStage = Exclude<Stage, "published" | "suppressed" | "review_recommended" | "verify_first" | "failed">;
type CheckpointCandidate = { type: (typeof knowledgeCardTypeValues)[number]; title: string; summary: string; locationName: string | null; routeSegment: string | null; conditions: string[]; freshnessSensitive: boolean; spanStart: number; spanEnd: number; modelId: string; modelGatewayName: string; promptVersion: string };
type CheckpointJudgment = { decision: "publish" | "review_recommended" | "verify_first" | "suppress"; summary: string; relevance: number; extractability: number; evidenceGrounding: number; specificity: number; actionability: number; firstHandLikelihood: number; spamCommercialRisk: number };
type CheckpointRelation = { action: "attach" | "create" | "conflict"; targetCardId: string | null; summary: string };
export type KnowledgeIngestionCheckpoint = { version: 1; completedStage: "triaging"; passed: true } | { version: 1; completedStage: "extracting"; candidate: CheckpointCandidate } | { version: 1; completedStage: "judging"; candidate: CheckpointCandidate; judgment: CheckpointJudgment } | { version: 1; completedStage: "relating"; candidate: CheckpointCandidate; judgment: CheckpointJudgment; relation: CheckpointRelation };

const defaultMaxAttempts = 3;
const defaultLeaseMs = 15 * 60_000;
const minLeaseMs = 10 * 60_000;
const maxLeaseMs = 60 * 60_000;
const terminalStages = ["published", "suppressed", "review_recommended", "verify_first", "failed"] as const;

export class KnowledgeIngestionJobError extends Error { constructor(message: string) { super(message); this.name = "KnowledgeIngestionJobError"; } }
export type KnowledgeIngestionJobStatus = { id: string; sourceId: string; captureVersionId: string; stage: Stage; stageVersion: number; attemptCount: number; maxAttempts: number; nextRunAt: Date; lastErrorCode: string | null; requeueReasonCode: string | null; claimedBy: string | null; claimedAt: Date | null; leaseExpiresAt: Date | null; expired: boolean; createdAt: Date; updatedAt: Date };
export type KnowledgeIngestionClaim = { jobId: string; sourceId: string; captureVersionId: string; stage: NonterminalIngestionStage; stageVersion: number; attemptCount: number; leaseExpiresAt: Date; fencingToken: string; checkpoint: KnowledgeIngestionCheckpoint | null };
export type KnowledgeIngestionStageCommit = { jobId: string; expectedStage: NonterminalIngestionStage; expectedStageVersion: number; fencingToken: string; nextStage: Stage; checkpoint?: KnowledgeIngestionCheckpoint; lastErrorCode?: string | null; now?: Date };

export async function ensureIngestionJobForCaptureVersion(db: IngestionJobDb, input: { sourceId: string; captureVersionId: string }) {
  const sourceId = input.sourceId.trim(); const captureVersionId = input.captureVersionId.trim();
  if (!sourceId || !captureVersionId) throw new KnowledgeIngestionJobError("A source and capture version are required.");
  const [capture] = await db.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).where(and(eq(sourceCaptureVersions.id, captureVersionId), eq(sourceCaptureVersions.sourceId, sourceId), isNull(sourceCaptureVersions.payloadDeletedAt), sql`length(btrim(${sourceCaptureVersions.rawText})) > 0`)).limit(1);
  if (!capture) throw new KnowledgeIngestionJobError("The capture version is not readable or does not belong to the source.");
  const [source] = await db.select({ submittedByEmail: users.email }).from(sources).innerJoin(users, eq(users.id, sources.submittedByUserId)).where(eq(sources.id, sourceId)).limit(1);
  if (!source?.submittedByEmail) throw new KnowledgeIngestionJobError("The source submitter provenance is unavailable.");
  const created = await db.execute(sql`
    insert into knowledge_ingestion_jobs (id, source_id, capture_version_id, submitted_by_user_id, submitted_by_email, stage, stage_version, attempt_count, max_attempts, next_run_at)
    select ${randomUUID()}, capture.source_id, capture.id, source.submitted_by_user_id, submitter.email, 'queued', 1, 0, ${defaultMaxAttempts}, timezone('UTC', now())
    from source_capture_versions capture join sources source on source.id = capture.source_id join users submitter on submitter.id = source.submitted_by_user_id
    where capture.id = ${captureVersionId} and capture.source_id = ${sourceId} and capture.payload_deleted_at is null and length(btrim(capture.raw_text)) > 0 and length(btrim(submitter.email)) between 1 and 320
    for key share of capture on conflict (capture_version_id) do nothing returning *
  `) as Array<typeof knowledgeIngestionJobs.$inferSelect>;
  if (created[0]) return created[0];
  const [existing] = await db.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, captureVersionId)).limit(1);
  if (!existing) throw new KnowledgeIngestionJobError("The canonical ingestion job could not be created.");
  return existing;
}

/** Invalidates expired fences before a recovered stage can be claimed. */
export async function recoverKnowledgeIngestionJobs(db: IngestionJobDb = getDb(), now = new Date()) {
  return db.transaction(async (tx) => {
    const unrecoverable = await tx.update(knowledgeIngestionJobs).set({ stage: "failed", stageVersion: sql`${knowledgeIngestionJobs.stageVersion} + 1`, checkpoint: null, lastErrorCode: "checkpoint_unavailable", requeueReasonCode: "checkpoint_unavailable", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now }).where(and(sql`${knowledgeIngestionJobs.stage} in ('triaging', 'extracting', 'judging', 'relating')`, isNull(knowledgeIngestionJobs.checkpoint))).returning({ id: knowledgeIngestionJobs.id });
    const exhausted = await tx.update(knowledgeIngestionJobs).set({ stage: "failed", stageVersion: sql`${knowledgeIngestionJobs.stageVersion} + 1`, checkpoint: null, lastErrorCode: "retry_exhausted", requeueReasonCode: "retry_exhausted", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now }).where(and(sql`${knowledgeIngestionJobs.stage} not in ('published', 'suppressed', 'review_recommended', 'verify_first', 'failed')`, lte(knowledgeIngestionJobs.attemptCount, knowledgeIngestionJobs.maxAttempts), sql`${knowledgeIngestionJobs.attemptCount} >= ${knowledgeIngestionJobs.maxAttempts}`, sql`(${knowledgeIngestionJobs.claimedBy} is null or ${knowledgeIngestionJobs.leaseExpiresAt} <= ${now.toISOString()}::timestamp)`)).returning({ id: knowledgeIngestionJobs.id });
    const recovered = await tx.update(knowledgeIngestionJobs).set({ claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: now, requeueReasonCode: "lease_expired", updatedAt: now }).where(and(sql`${knowledgeIngestionJobs.stage} not in ('published', 'suppressed', 'review_recommended', 'verify_first', 'failed')`, sql`${knowledgeIngestionJobs.leaseExpiresAt} <= ${now.toISOString()}::timestamp`, sql`${knowledgeIngestionJobs.attemptCount} < ${knowledgeIngestionJobs.maxAttempts}`)).returning({ id: knowledgeIngestionJobs.id });
    return { recovered: recovered.length, exhausted: exhausted.length + unrecoverable.length };
  });
}

export async function claimNextKnowledgeIngestionJob(input: { workerId: string; expectedStageVersion?: number; now?: Date }, db: IngestionJobDb = getDb()): Promise<KnowledgeIngestionClaim | null> {
  const workerId = input.workerId.trim(); if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new KnowledgeIngestionJobError("Worker ID is invalid.");
  if (input.expectedStageVersion !== undefined && (!Number.isInteger(input.expectedStageVersion) || input.expectedStageVersion < 1)) throw new KnowledgeIngestionJobError("Expected stage version is invalid.");
  const now = input.now ?? new Date(); const leaseExpiresAt = new Date(now.getTime() + getClaimLeaseMs()); const fencingToken = randomBytes(32).toString("hex");
  return db.transaction(async (tx) => {
    const version = input.expectedStageVersion === undefined ? sql`` : sql`and stage_version = ${input.expectedStageVersion}`;
    const rows = await tx.execute(sql`select id from knowledge_ingestion_jobs where stage not in ('published', 'suppressed', 'review_recommended', 'verify_first', 'failed') and (stage = 'queued' or checkpoint is not null) and next_run_at <= timezone('UTC', ${now.toISOString()}::timestamptz) and attempt_count < max_attempts and claimed_by is null ${version} order by next_run_at asc, created_at asc for update skip locked limit 1`) as Array<{ id: string }>;
    if (!rows[0]) return null;
    const [claimed] = await tx.update(knowledgeIngestionJobs).set({ claimedBy: workerId, claimedAt: now, leaseExpiresAt, fencingToken, attemptCount: sql`${knowledgeIngestionJobs.attemptCount} + 1`, requeueReasonCode: null, updatedAt: now }).where(and(eq(knowledgeIngestionJobs.id, rows[0].id), isNull(knowledgeIngestionJobs.claimedBy), lte(knowledgeIngestionJobs.nextRunAt, now), sql`${knowledgeIngestionJobs.attemptCount} < ${knowledgeIngestionJobs.maxAttempts}`)).returning();
    if (!claimed || isTerminalStage(claimed.stage)) return null;
    const checkpoint = parseCheckpoint(claimed.checkpoint);
    return { jobId: claimed.id, sourceId: claimed.sourceId, captureVersionId: claimed.captureVersionId, stage: claimed.stage, stageVersion: claimed.stageVersion, attemptCount: claimed.attemptCount, leaseExpiresAt: claimed.leaseExpiresAt as Date, fencingToken, checkpoint };
  });
}

export async function commitKnowledgeIngestionStage(input: KnowledgeIngestionStageCommit, db: IngestionJobDb = getDb()) {
  const now = input.now ?? new Date();
  if (!Number.isInteger(input.expectedStageVersion) || input.expectedStageVersion < 1) throw new KnowledgeIngestionJobError("Expected stage version is invalid.");
  if (!/^[a-f0-9]{64}$/.test(input.fencingToken)) throw new KnowledgeIngestionJobError("Fencing token is invalid.");
  if (!isAllowedStageTransition(input.expectedStage, input.nextStage)) throw new KnowledgeIngestionJobError("Ingestion stage transition is invalid.");
  const terminal = isTerminalStage(input.nextStage);
  if (!terminal && (!input.checkpoint || !isCheckpointForStage(input.checkpoint, input.expectedStage))) return null;
  const checkpoint = input.checkpoint ? parseCheckpoint(input.checkpoint) : null;
  if (input.checkpoint && !checkpoint) throw new KnowledgeIngestionJobError("Checkpoint is invalid.");
  const [committed] = await db.update(knowledgeIngestionJobs).set({ stage: input.nextStage, stageVersion: input.expectedStageVersion + 1, checkpoint: terminal ? null : checkpoint, lastErrorCode: input.lastErrorCode ?? null, ...(terminal ? { claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null } : {}), updatedAt: now }).where(and(eq(knowledgeIngestionJobs.id, input.jobId), eq(knowledgeIngestionJobs.stage, input.expectedStage), eq(knowledgeIngestionJobs.stageVersion, input.expectedStageVersion), eq(knowledgeIngestionJobs.fencingToken, input.fencingToken), gt(knowledgeIngestionJobs.leaseExpiresAt, now))).returning();
  return committed ?? null;
}

/** Releases a retryable failure without replaying preceding checkpointed stages. */
export async function retryKnowledgeIngestionStage(input: { jobId: string; expectedStage: NonterminalIngestionStage; expectedStageVersion: number; fencingToken: string; errorCode: string; now?: Date }, db: IngestionJobDb = getDb()) {
  const now = input.now ?? new Date(); const retryAt = new Date(now.getTime() + Math.min(60_000 * 2 ** Math.max(0, input.expectedStageVersion - 1), 15 * 60_000)).toISOString();
  const [row] = await db.update(knowledgeIngestionJobs).set({ stage: sql`case when ${knowledgeIngestionJobs.attemptCount} >= ${knowledgeIngestionJobs.maxAttempts} then 'failed' else ${knowledgeIngestionJobs.stage} end`, stageVersion: sql`case when ${knowledgeIngestionJobs.attemptCount} >= ${knowledgeIngestionJobs.maxAttempts} then ${knowledgeIngestionJobs.stageVersion} + 1 else ${knowledgeIngestionJobs.stageVersion} end`, checkpoint: sql`case when ${knowledgeIngestionJobs.attemptCount} >= ${knowledgeIngestionJobs.maxAttempts} then null else ${knowledgeIngestionJobs.checkpoint} end`, lastErrorCode: sql`case when ${knowledgeIngestionJobs.attemptCount} >= ${knowledgeIngestionJobs.maxAttempts} then 'retry_exhausted' else ${input.errorCode} end`, requeueReasonCode: sql`case when ${knowledgeIngestionJobs.attemptCount} >= ${knowledgeIngestionJobs.maxAttempts} then 'retry_exhausted' else 'retryable_stage_failure' end`, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: sql`case when ${knowledgeIngestionJobs.attemptCount} >= ${knowledgeIngestionJobs.maxAttempts} then ${knowledgeIngestionJobs.nextRunAt} else ${retryAt} end`, updatedAt: now }).where(and(eq(knowledgeIngestionJobs.id, input.jobId), eq(knowledgeIngestionJobs.stage, input.expectedStage), eq(knowledgeIngestionJobs.stageVersion, input.expectedStageVersion), eq(knowledgeIngestionJobs.fencingToken, input.fencingToken), gt(knowledgeIngestionJobs.leaseExpiresAt, now))).returning();
  return row ?? null;
}

export async function listKnowledgeIngestionJobStatuses(db: Pick<IngestionJobDb, "select">, now = new Date()): Promise<KnowledgeIngestionJobStatus[]> {
  const rows = await db.select({ id: knowledgeIngestionJobs.id, sourceId: knowledgeIngestionJobs.sourceId, captureVersionId: knowledgeIngestionJobs.captureVersionId, stage: knowledgeIngestionJobs.stage, stageVersion: knowledgeIngestionJobs.stageVersion, attemptCount: knowledgeIngestionJobs.attemptCount, maxAttempts: knowledgeIngestionJobs.maxAttempts, nextRunAt: knowledgeIngestionJobs.nextRunAt, lastErrorCode: knowledgeIngestionJobs.lastErrorCode, requeueReasonCode: knowledgeIngestionJobs.requeueReasonCode, claimedBy: knowledgeIngestionJobs.claimedBy, claimedAt: knowledgeIngestionJobs.claimedAt, leaseExpiresAt: knowledgeIngestionJobs.leaseExpiresAt, createdAt: knowledgeIngestionJobs.createdAt, updatedAt: knowledgeIngestionJobs.updatedAt }).from(knowledgeIngestionJobs).orderBy(asc(knowledgeIngestionJobs.createdAt));
  return rows.map((job) => ({ ...job, expired: job.leaseExpiresAt !== null && job.leaseExpiresAt <= now }));
}

export function getClaimLeaseMs() { return normalizeLeaseMs(process.env.KNOWLEDGE_INGESTION_CLAIM_LEASE_MS); }
export function parseCheckpoint(value: unknown): KnowledgeIngestionCheckpoint | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.completedStage !== "string" || Buffer.byteLength(JSON.stringify(value), "utf8") > 8192) return null;
  if (value.completedStage === "triaging") return value.passed === true && Object.keys(value).length === 3 ? { version: 1, completedStage: "triaging", passed: true } : null;
  const candidate = parseCheckpointCandidate(value.candidate); if (!candidate) return null;
  if (value.completedStage === "extracting") return Object.keys(value).length === 3 ? { version: 1, completedStage: "extracting", candidate } : null;
  const judgment = parseCheckpointJudgment(value.judgment); if (!judgment) return null;
  if (value.completedStage === "judging") return Object.keys(value).length === 4 ? { version: 1, completedStage: "judging", candidate, judgment } : null;
  const relation = parseCheckpointRelation(value.relation); return value.completedStage === "relating" && relation && Object.keys(value).length === 5 ? { version: 1, completedStage: "relating", candidate, judgment, relation } : null;
}
function parseCheckpointCandidate(value: unknown): CheckpointCandidate | null { const keys = ["type", "title", "summary", "locationName", "routeSegment", "conditions", "freshnessSensitive", "spanStart", "spanEnd", "modelId", "modelGatewayName", "promptVersion"]; if (!isRecord(value) || !hasOnlyKeys(value, keys) || !knowledgeCardTypeValues.includes(value.type as CheckpointCandidate["type"]) || !bounded(value.title, 160) || !safeText(value.summary, 1200) || (value.locationName !== null && !safeText(value.locationName, 160)) || (value.routeSegment !== null && !safeText(value.routeSegment, 160)) || !Array.isArray(value.conditions) || value.conditions.length > 12 || value.conditions.some((item) => !safeText(item, 160)) || typeof value.freshnessSensitive !== "boolean" || !Number.isInteger(value.spanStart) || !Number.isInteger(value.spanEnd) || !bounded(value.modelId, 160) || !bounded(value.modelGatewayName, 160) || !bounded(value.promptVersion, 160)) return null; const spanStart = value.spanStart as number; const spanEnd = value.spanEnd as number; if (spanStart < 0 || spanEnd <= spanStart) return null; return { type: value.type as CheckpointCandidate["type"], title: value.title as string, summary: value.summary as string, locationName: value.locationName as string | null, routeSegment: value.routeSegment as string | null, conditions: value.conditions as string[], freshnessSensitive: value.freshnessSensitive, spanStart, spanEnd, modelId: value.modelId as string, modelGatewayName: value.modelGatewayName as string, promptVersion: value.promptVersion as string }; }
function parseCheckpointJudgment(value: unknown): CheckpointJudgment | null { const keys = ["decision", "summary", "relevance", "extractability", "evidenceGrounding", "specificity", "actionability", "firstHandLikelihood", "spamCommercialRisk"]; if (!isRecord(value) || !hasOnlyKeys(value, keys) || !["publish", "review_recommended", "verify_first", "suppress"].includes(String(value.decision)) || !safeText(value.summary, 1000)) return null; const scoreKeys = ["relevance", "extractability", "evidenceGrounding", "specificity", "actionability", "firstHandLikelihood", "spamCommercialRisk"] as const; if (scoreKeys.some((key) => typeof value[key] !== "number" || value[key] < 0 || value[key] > 1)) return null; return { decision: value.decision as CheckpointJudgment["decision"], summary: value.summary as string, relevance: value.relevance as number, extractability: value.extractability as number, evidenceGrounding: value.evidenceGrounding as number, specificity: value.specificity as number, actionability: value.actionability as number, firstHandLikelihood: value.firstHandLikelihood as number, spamCommercialRisk: value.spamCommercialRisk as number }; }
function parseCheckpointRelation(value: unknown): CheckpointRelation | null { const keys = ["action", "targetCardId", "summary"]; if (!isRecord(value) || !hasOnlyKeys(value, keys) || !["attach", "create", "conflict"].includes(String(value.action)) || !safeText(value.summary, 1000) || (value.targetCardId !== null && !bounded(value.targetCardId, 160)) || (["attach", "conflict"].includes(String(value.action)) && !value.targetCardId)) return null; return { action: value.action as CheckpointRelation["action"], targetCardId: value.targetCardId as string | null, summary: value.summary as string }; }
function isCheckpointForStage(checkpoint: KnowledgeIngestionCheckpoint, stage: NonterminalIngestionStage) { return (stage === "queued" && checkpoint.completedStage === "triaging") || (stage === "triaging" && checkpoint.completedStage === "extracting") || (stage === "extracting" && checkpoint.completedStage === "judging") || (stage === "judging" && checkpoint.completedStage === "relating"); }
function normalizeLeaseMs(value: string | undefined) { if (!value) return defaultLeaseMs; const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), minLeaseMs), maxLeaseMs) : defaultLeaseMs; }
function isTerminalStage(stage: Stage): stage is (typeof terminalStages)[number] { return terminalStages.includes(stage as (typeof terminalStages)[number]); }
function isAllowedStageTransition(from: NonterminalIngestionStage, to: Stage) { if (isTerminalStage(to)) return true; return (from === "queued" && to === "triaging") || (from === "triaging" && to === "extracting") || (from === "extracting" && to === "judging") || (from === "judging" && to === "relating"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function bounded(value: unknown, max: number) { return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null; }
function safeText(value: unknown, max: number) { const text = bounded(value, max); return text && !containsSensitiveText(text) ? text : null; }
function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); }
function containsSensitiveText(value: string) { return /(?:\+?84|0)(?:[\s.-]?\d){8,10}\b|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(value); }
