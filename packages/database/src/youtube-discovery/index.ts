import { recordAuditEvent, type AuditEventWriter } from "../audit-writers";
import { createSystemAuditActor, type AuditActor } from "../actors";
import { getDb } from "../client";
import { youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryQueryProposalReasonValues, youtubeDiscoveryRuns, type YoutubeDiscoveryQueryProposalOrigin, type YoutubeDiscoveryQueryProposalReason, type YoutubeDiscoveryRunSafeErrorCode } from "../schema";
import type { YoutubeDiscoveryPolicyAuditSummary, YoutubeDiscoveryQueryProposalAuditSummary, YoutubeDiscoveryRunAuditSummary } from "@xuyenviet/contracts";
import { parseYoutubeDiscoveryPolicy } from "@xuyenviet/domain";
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

type DiscoveryWriter = Pick<ReturnType<typeof getDb>, "insert" | "select" | "update" | "transaction"> & AuditEventWriter;

export type CreateYoutubeDiscoveryPolicyVersionInput = Readonly<{ version: number; isCurrent: boolean; policy?: unknown; actor: AuditActor }>;
export type CreateYoutubeDiscoveryQueryProposalInput = Readonly<{ origin: YoutubeDiscoveryQueryProposalOrigin; reason: YoutubeDiscoveryQueryProposalReason; priority: number; queryText: string; enabled?: boolean; cadenceMinutes: number; actor: AuditActor }>;
export type CreateYoutubeDiscoveryRunInput = Readonly<{ policyVersionId: string; queryProposalId?: string }>;
export type YoutubeDiscoveryRunClaim = Readonly<{ id: string; fencingToken: string; attemptCount: number; nextRunAt: Date; claimedAt: Date; leaseExpiresAt: Date; recoveredCount: number }>;
export type YoutubeDiscoveryRunClaimResult = Readonly<{ claim: YoutubeDiscoveryRunClaim | null; recoveredCount: number; recoveredTerminalCount: number; contended: boolean }>;
export type YoutubeDiscoveryRunDisposition = "completed" | "failed" | "cancelled" | "retrying" | "contended";

export async function createYoutubeDiscoveryPolicyVersion(input: CreateYoutubeDiscoveryPolicyVersionInput, database: DiscoveryWriter = getDb()) {
  const policy = parseYoutubeDiscoveryPolicy(input.policy === undefined ? {} : input.policy);
  assertDiscoveryPolicyActor(input.actor);
  return database.transaction(async (transaction) => {
    if (input.isCurrent) await transaction.update(youtubeDiscoveryPolicyVersions).set({ isCurrent: false }).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true));
    const [created] = await transaction.insert(youtubeDiscoveryPolicyVersions).values({ version: input.version, isCurrent: input.isCurrent, ...policy }).returning();
    if (!created) throw new Error("YouTube Discovery policy creation failed.");
    await recordAuditEvent({ actor: input.actor, operation: "create", targetType: "youtube_discovery_policy_version", targetId: created.id, afterSummary: JSON.stringify(policyAuditSummary(created)) }, transaction);
    return created;
  });
}

export async function createYoutubeDiscoveryQueryProposal(input: CreateYoutubeDiscoveryQueryProposalInput, database: DiscoveryWriter = getDb()) {
  assertDiscoveryQueryActor(input.origin, input.actor);
  assertSafeDiscoveryQueryProposal(input);
  return database.transaction(async (transaction) => {
    const { actor, ...proposal } = input;
    const [created] = await transaction.insert(youtubeDiscoveryQueryProposals).values({ ...proposal, enabled: input.enabled ?? true }).returning();
    if (!created) throw new Error("YouTube Discovery query proposal creation failed.");
    await recordAuditEvent({ actor, operation: "create", targetType: "youtube_discovery_query_proposal", targetId: created.id, afterSummary: JSON.stringify(queryProposalAuditSummary(created)) }, transaction);
    return created;
  });
}

export async function createYoutubeDiscoveryRun(input: CreateYoutubeDiscoveryRunInput, database: DiscoveryWriter = getDb()) {
  return database.transaction(async (transaction) => {
    const [policy] = await transaction.select({ id: youtubeDiscoveryPolicyVersions.id, enabled: youtubeDiscoveryPolicyVersions.enabled, maxRetryAttempts: youtubeDiscoveryPolicyVersions.maxRetryAttempts, retryDelayMinutes: youtubeDiscoveryPolicyVersions.retryDelayMinutes, maxConcurrentRuns: youtubeDiscoveryPolicyVersions.maxConcurrentRuns }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    if (!policy) throw new Error("YouTube Discovery runs require the current policy version.");
    if (policy.id !== input.policyVersionId) throw new Error("YouTube Discovery runs require the current policy version.");
    if (!policy.enabled) throw new Error("YouTube Discovery runs require an enabled current policy version.");
    if (input.queryProposalId) {
      const [proposal] = await transaction.select({ id: youtubeDiscoveryQueryProposals.id, enabled: youtubeDiscoveryQueryProposals.enabled }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.id, input.queryProposalId)).limit(1).for("update");
      if (!proposal || !proposal.enabled) throw new Error("YouTube Discovery runs require an enabled query proposal.");
    }
    const [created] = await transaction.insert(youtubeDiscoveryRuns).values({ policyVersionId: input.policyVersionId, queryProposalId: input.queryProposalId, state: "queued", maxRetryAttempts: policy.maxRetryAttempts, retryDelayMinutes: policy.retryDelayMinutes, maxConcurrentRuns: policy.maxConcurrentRuns }).returning();
    if (!created) throw new Error("YouTube Discovery run creation failed.");
    await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "create", targetType: "youtube_discovery_run", targetId: created.id, afterSummary: JSON.stringify(runAuditSummary(created)) }, transaction);
    return created;
  });
}

export async function claimNextYoutubeDiscoveryRun(input: { workerId: string; leaseMs?: number }, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryRunClaimResult> {
  const workerId = input.workerId.trim();
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("YouTube Discovery worker ID is invalid.");
  const leaseMs = input.leaseMs ?? 300_000;
  if (!Number.isInteger(leaseMs) || leaseMs < 60_000 || leaseMs > 3_600_000) throw new Error("YouTube Discovery lease is invalid.");
  const fencingToken = randomBytes(32).toString("hex");
  return database.transaction(async (transaction) => {
    const recovery = await recoverExpiredYoutubeDiscoveryRuns(transaction);
    const rows = await transaction.execute(sql`
      select id, policy_version_id, max_concurrent_runs from youtube_discovery_runs candidate
      where candidate.state in ('queued', 'retrying') and candidate.next_run_at <= clock_timestamp()
        and not exists (
          select 1 from youtube_discovery_runs active
          where active.state = 'running' and active.policy_version_id = candidate.policy_version_id
            and active.lease_expires_at > clock_timestamp()
          group by active.policy_version_id
          having count(*) >= candidate.max_concurrent_runs
        )
      order by candidate.next_run_at asc, candidate.created_at asc
      for update skip locked limit 1
    `) as Array<{ id: string; policy_version_id: string; max_concurrent_runs: number }>;
    if (!rows[0]) return { claim: null, recoveredCount: recovery.count, recoveredTerminalCount: recovery.terminalCount, contended: recovery.contended };
    // Serialize admission for a policy after SKIP LOCKED selects a candidate so
    // separate workers cannot both observe spare capacity for the same policy.
    await transaction.execute(sql`select id from youtube_discovery_policy_versions where id = ${rows[0].policy_version_id} for update`);
    const active = await transaction.execute(sql`
      select count(*)::integer as count from youtube_discovery_runs
      where state = 'running' and policy_version_id = ${rows[0].policy_version_id}
        and lease_expires_at > clock_timestamp()
    `) as Array<{ count: number }>;
    if ((active[0]?.count ?? 0) >= rows[0].max_concurrent_runs) return { claim: null, recoveredCount: recovery.count, recoveredTerminalCount: recovery.terminalCount, contended: true };
    const [claimed] = await transaction.update(youtubeDiscoveryRuns).set({ state: "running", claimedBy: workerId, claimedAt: sql`clock_timestamp()`, leaseExpiresAt: sql`clock_timestamp() + ${leaseMs} * interval '1 millisecond'`, fencingToken, attemptCount: sql`${youtubeDiscoveryRuns.attemptCount} + 1`, safeErrorCode: null }).where(and(eq(youtubeDiscoveryRuns.id, rows[0].id), sql`${youtubeDiscoveryRuns.state} in ('queued', 'retrying') and ${youtubeDiscoveryRuns.nextRunAt} <= clock_timestamp()`)).returning();
    return claimed
      ? { claim: { id: claimed.id, fencingToken, attemptCount: claimed.attemptCount, nextRunAt: claimed.nextRunAt, claimedAt: claimed.claimedAt!, leaseExpiresAt: claimed.leaseExpiresAt!, recoveredCount: recovery.count }, recoveredCount: recovery.count, recoveredTerminalCount: recovery.terminalCount, contended: false }
      : { claim: null, recoveredCount: recovery.count, recoveredTerminalCount: recovery.terminalCount, contended: true };
  });
}

export async function recoverExpiredYoutubeDiscoveryRuns(database: DiscoveryWriter = getDb()) {
  return database.transaction(async (transaction) => {
    const expired = await transaction.execute(sql`select id from youtube_discovery_runs where state = 'running' and lease_expires_at <= clock_timestamp() order by lease_expires_at asc for update skip locked limit 20`) as Array<{ id: string }>;
    let count = 0;
    let terminalCount = 0;
    let contended = false;
    for (const row of expired) {
      const [run] = await transaction.update(youtubeDiscoveryRuns).set({ state: sql`case when ${youtubeDiscoveryRuns.attemptCount} > ${youtubeDiscoveryRuns.maxRetryAttempts} then 'failed' else 'queued' end`, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: sql`clock_timestamp()`, terminalAt: sql`case when ${youtubeDiscoveryRuns.attemptCount} > ${youtubeDiscoveryRuns.maxRetryAttempts} then clock_timestamp() else null end`, terminalOutcome: sql`case when ${youtubeDiscoveryRuns.attemptCount} > ${youtubeDiscoveryRuns.maxRetryAttempts} then 'failed' else null end`, safeErrorCode: sql`case when ${youtubeDiscoveryRuns.attemptCount} > ${youtubeDiscoveryRuns.maxRetryAttempts} then 'lease_retry_exhausted' else null end` }).where(and(eq(youtubeDiscoveryRuns.id, row.id), eq(youtubeDiscoveryRuns.state, "running"), sql`${youtubeDiscoveryRuns.leaseExpiresAt} <= clock_timestamp()`)).returning();
      if (!run) { contended = true; continue; }
      count += 1;
      if (run.state === "failed") { terminalCount += 1; await recordTerminalAudit(transaction, run.id, "failed", run.attemptCount, "lease_retry_exhausted", run.policyVersionId); }
    }
    return { count, terminalCount, contended };
  });
}

export async function finishYoutubeDiscoveryRun(claim: YoutubeDiscoveryRunClaim, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryRunDisposition> {
  return database.transaction(async (transaction) => {
    const [run] = await transaction.select({ id: youtubeDiscoveryRuns.id, attemptCount: youtubeDiscoveryRuns.attemptCount, policyVersionId: youtubeDiscoveryRuns.policyVersionId }).from(youtubeDiscoveryRuns).where(activeClaim(claim)).limit(1).for("update");
    if (!run) return "contended";
    const [currentPolicy] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    const outcome = currentPolicy?.enabled ? "completed" : "cancelled";
    const safeErrorCode = outcome === "cancelled" ? "policy_revoked" : null;
    const [updated] = await transaction.update(youtubeDiscoveryRuns).set({ state: outcome, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, terminalAt: sql`clock_timestamp()`, terminalOutcome: outcome, safeErrorCode }).where(activeClaim(claim)).returning();
    if (!updated) return "contended";
    await recordTerminalAudit(transaction, updated.id, outcome, updated.attemptCount, safeErrorCode, run.policyVersionId);
    return outcome;
  });
}

export async function cancelYoutubeDiscoveryRunIfDisabled(claim: YoutubeDiscoveryRunClaim, database: DiscoveryWriter = getDb()): Promise<"active" | "cancelled" | "contended"> {
  return database.transaction(async (transaction) => {
    const [run] = await transaction.select({ id: youtubeDiscoveryRuns.id, attemptCount: youtubeDiscoveryRuns.attemptCount, policyVersionId: youtubeDiscoveryRuns.policyVersionId }).from(youtubeDiscoveryRuns).where(activeClaim(claim)).limit(1).for("update");
    if (!run) return "contended";
    const [currentPolicy] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    if (currentPolicy?.enabled) return "active";
    const [updated] = await transaction.update(youtubeDiscoveryRuns).set({ state: "cancelled", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, terminalAt: sql`clock_timestamp()`, terminalOutcome: "cancelled", safeErrorCode: "policy_revoked" }).where(activeClaim(claim)).returning();
    if (!updated) return "contended";
    await recordTerminalAudit(transaction, updated.id, "cancelled", updated.attemptCount, "policy_revoked", run.policyVersionId);
    return "cancelled";
  });
}

export async function retryYoutubeDiscoveryRun(claim: YoutubeDiscoveryRunClaim, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryRunDisposition> {
  return database.transaction(async (transaction) => {
    const [run] = await transaction.select({ id: youtubeDiscoveryRuns.id, attemptCount: youtubeDiscoveryRuns.attemptCount, maxRetryAttempts: youtubeDiscoveryRuns.maxRetryAttempts, policyVersionId: youtubeDiscoveryRuns.policyVersionId }).from(youtubeDiscoveryRuns).where(activeClaim(claim)).limit(1).for("update");
    if (!run) return "contended";
    const [currentPolicy] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    const outcome: YoutubeDiscoveryRunDisposition = !currentPolicy?.enabled ? "cancelled" : run.attemptCount > run.maxRetryAttempts ? "failed" : "retrying";
    const safeErrorCode: YoutubeDiscoveryRunSafeErrorCode = outcome === "cancelled" ? "policy_revoked" : outcome === "failed" ? "retry_exhausted" : "stage_transient";
    const [updated] = await transaction.update(youtubeDiscoveryRuns).set({ state: outcome, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: outcome === "retrying" ? sql`clock_timestamp() + least(${youtubeDiscoveryRuns.retryDelayMinutes} * power(2, ${youtubeDiscoveryRuns.attemptCount} - 1), 1440) * interval '1 minute'` : sql`clock_timestamp()`, terminalAt: outcome === "retrying" ? null : sql`clock_timestamp()`, terminalOutcome: outcome === "retrying" ? null : outcome, safeErrorCode }).where(activeClaim(claim)).returning();
    if (!updated) return "contended";
    if (outcome !== "retrying") await recordTerminalAudit(transaction, updated.id, outcome, updated.attemptCount, safeErrorCode, run.policyVersionId);
    return outcome;
  });
}

function activeClaim(claim: YoutubeDiscoveryRunClaim) {
  return and(eq(youtubeDiscoveryRuns.id, claim.id), eq(youtubeDiscoveryRuns.state, "running"), eq(youtubeDiscoveryRuns.fencingToken, claim.fencingToken), sql`${youtubeDiscoveryRuns.leaseExpiresAt} > clock_timestamp()`);
}

async function recordTerminalAudit(database: AuditEventWriter, runId: string, outcome: "completed" | "failed" | "cancelled", attemptCount: number, safeErrorCode: YoutubeDiscoveryRunSafeErrorCode | null, policyVersionId: string) {
  await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "update", targetType: "youtube_discovery_run_terminal", targetId: runId, afterSummary: JSON.stringify({ policyVersionId, outcome, attemptCount, ...(safeErrorCode ? { safeErrorCode } : {}) }) }, database);
}

function assertDiscoveryPolicyActor(actor: AuditActor) {
  if (actor.kind === "system" && actor.system !== "system-youtube-discovery") {
    throw new Error("YouTube Discovery automated policy work requires the Discovery system actor.");
  }
}

function assertDiscoveryQueryActor(origin: YoutubeDiscoveryQueryProposalOrigin, actor: AuditActor) {
  if (origin === "system" && (actor.kind !== "system" || actor.system !== "system-youtube-discovery")) {
    throw new Error("YouTube Discovery system query proposals require the Discovery system actor.");
  }
  if (origin === "operator" && actor.kind !== "user") {
    throw new Error("YouTube Discovery operator query proposals require a user actor.");
  }
}

function assertSafeDiscoveryQueryProposal(input: CreateYoutubeDiscoveryQueryProposalInput) {
  if (!youtubeDiscoveryQueryProposalReasonValues.includes(input.reason) || !/^[\p{L}\p{N} '-]{1,240}$/u.test(input.queryText.trim())) {
    throw new Error("Invalid YouTube Discovery query proposal.");
  }
}

function policyAuditSummary(policy: YoutubeDiscoveryPolicyAuditSummary): YoutubeDiscoveryPolicyAuditSummary {
  return { version: policy.version, enabled: policy.enabled, minimumCandidateScore: policy.minimumCandidateScore, priorityScoreWeight: policy.priorityScoreWeight, freshnessScoreWeight: policy.freshnessScoreWeight, cadenceMinutes: policy.cadenceMinutes, retentionDays: policy.retentionDays, commentSignalTtlDays: policy.commentSignalTtlDays, maxConcurrentRuns: policy.maxConcurrentRuns, maxRetryAttempts: policy.maxRetryAttempts, retryDelayMinutes: policy.retryDelayMinutes };
}

function queryProposalAuditSummary(proposal: YoutubeDiscoveryQueryProposalAuditSummary): YoutubeDiscoveryQueryProposalAuditSummary {
  return { origin: proposal.origin, priority: proposal.priority, enabled: proposal.enabled, cadenceMinutes: proposal.cadenceMinutes };
}

function runAuditSummary(run: YoutubeDiscoveryRunAuditSummary): YoutubeDiscoveryRunAuditSummary {
  return { policyVersionId: run.policyVersionId, state: run.state };
}
