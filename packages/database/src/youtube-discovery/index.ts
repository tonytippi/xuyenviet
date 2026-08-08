import { recordAuditEvent, type AuditEventWriter } from "../audit-writers";
import { createSystemAuditActor, type AuditActor } from "../actors";
import { getDb } from "../client";
import { youtubeDiscoveryPlanningLeases, youtubeDiscoveryPlanningOutcomes, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryQueryProposalReasonValues, youtubeDiscoveryRuns, type YoutubeDiscoveryQueryProposalOrigin, type YoutubeDiscoveryQueryProposalReason, type YoutubeDiscoveryRunSafeErrorCode } from "../schema";
import type { YoutubeDiscoveryPolicyAuditSummary, YoutubeDiscoveryQueryProposalAuditSummary, YoutubeDiscoveryRunAuditSummary } from "@xuyenviet/contracts";
import { deriveDiscoveryQueries, parseYoutubeDiscoveryPolicy, type DiscoveryQuerySignalPortResult, type SafeDiscoveryQuerySignal } from "@xuyenviet/domain";
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getYoutubeDiscoveryRetryDelayMinutes, isYoutubeDiscoveryRetryExhausted } from "./retry-policy";

type DiscoveryWriter = Pick<ReturnType<typeof getDb>, "insert" | "select" | "update" | "transaction"> & AuditEventWriter;

export type CreateYoutubeDiscoveryPolicyVersionInput = Readonly<{ version: number; isCurrent: boolean; policy?: unknown; actor: AuditActor }>;
export type CreateYoutubeDiscoveryQueryProposalInput = Readonly<{ origin: YoutubeDiscoveryQueryProposalOrigin; reason: YoutubeDiscoveryQueryProposalReason; priority: number; queryText: string; enabled?: boolean; cadenceMinutes: number; actor: AuditActor; systemSignal?: SafeDiscoveryQuerySignal }>;
export type CreateYoutubeDiscoveryRunInput = Readonly<{ policyVersionId: string; queryProposalId?: string; scheduleIntervalAt?: Date }>;
export type YoutubeDiscoveryRunClaim = Readonly<{ id: string; fencingToken: string; attemptCount: number; nextRunAt: Date; claimedAt: Date; leaseExpiresAt: Date; recoveredCount: number }>;
export type YoutubeDiscoveryRunClaimResult = Readonly<{ claim: YoutubeDiscoveryRunClaim | null; recoveredCount: number; recoveredTerminalCount: number; contended: boolean }>;
export type YoutubeDiscoveryRunDisposition = "completed" | "failed" | "cancelled" | "retrying" | "contended";
export type YoutubeDiscoveryPlanningClaim = Readonly<{ id: "youtube-discovery-planning"; policyVersionId: string; fencingToken: string }>;

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
    const systemFields = input.origin === "system" ? systemProposalFields(input.systemSignal!) : null;
    const [policy] = systemFields ? await transaction.select({ cadenceMinutes: youtubeDiscoveryPolicyVersions.cadenceMinutes, enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update") : [];
    if (systemFields && !policy) throw new Error("YouTube Discovery system query proposals require the current policy version.");
    const enabled = input.enabled ?? true;
    const [created] = await transaction.insert(youtubeDiscoveryQueryProposals).values(systemFields ? { ...proposal, ...systemFields, priority: systemFields.priority, cadenceMinutes: policy!.cadenceMinutes, enabled, scheduleAnchorAt: enabled ? sql`clock_timestamp()` : undefined, nextDueAt: enabled && policy!.enabled ? sql`clock_timestamp() + ${policy!.cadenceMinutes} * interval '1 minute'` : undefined } : { ...proposal, enabled }).returning();
    if (!created) throw new Error("YouTube Discovery query proposal creation failed.");
    await recordAuditEvent({ actor, operation: "create", targetType: "youtube_discovery_query_proposal", targetId: created.id, afterSummary: JSON.stringify(queryProposalAuditSummary(created)) }, transaction);
    return created;
  });
}

export function createYoutubeDiscoveryRun(input: CreateYoutubeDiscoveryRunInput & { scheduleIntervalAt: Date }, database?: DiscoveryWriter): Promise<typeof youtubeDiscoveryRuns.$inferSelect | null>;
export function createYoutubeDiscoveryRun(input: CreateYoutubeDiscoveryRunInput, database?: DiscoveryWriter): Promise<typeof youtubeDiscoveryRuns.$inferSelect>;
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
    const [created] = await transaction.insert(youtubeDiscoveryRuns).values({ policyVersionId: input.policyVersionId, queryProposalId: input.queryProposalId, scheduleIntervalAt: input.scheduleIntervalAt, state: "queued", maxRetryAttempts: policy.maxRetryAttempts, retryDelayMinutes: policy.retryDelayMinutes, maxConcurrentRuns: policy.maxConcurrentRuns }).onConflictDoNothing().returning();
    if (!created) {
      if (input.scheduleIntervalAt) return null;
      throw new Error("YouTube Discovery run creation failed.");
    }
    await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "create", targetType: "youtube_discovery_run", targetId: created.id, afterSummary: JSON.stringify(runAuditSummary(created)) }, transaction);
    return created;
  });
}

export async function claimYoutubeDiscoveryPlanning(workerId: string, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryPlanningClaim | null> {
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("YouTube Discovery worker ID is invalid.");
  const fencingToken = randomBytes(32).toString("hex");
  return database.transaction(async (transaction) => {
    // Test/database resets can remove the singleton; its identity remains fixed.
    await transaction.execute(sql`insert into youtube_discovery_planning_leases (id, next_run_at) values ('youtube-discovery-planning', clock_timestamp()) on conflict (id) do nothing`);
    const recovered = await transaction.execute(sql`update youtube_discovery_planning_leases set state = 'queued', claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null where id = 'youtube-discovery-planning' and state = 'running' and lease_expires_at <= clock_timestamp() returning id`) as Array<{ id: string }>;
    if (recovered[0]) await recordPlanningAudit(transaction, "recover_expired", "lease_expired");
    const rows = await transaction.execute(sql`select id, state from youtube_discovery_planning_leases where id = 'youtube-discovery-planning' and (state = 'queued' and next_run_at <= clock_timestamp() or state = 'cancelled') for update skip locked`) as Array<{ id: string; state: "queued" | "cancelled" }>;
    if (!rows[0]) return null;
    const [policy] = await transaction.select({ id: youtubeDiscoveryPolicyVersions.id, enabled: youtubeDiscoveryPolicyVersions.enabled, cadenceMinutes: youtubeDiscoveryPolicyVersions.cadenceMinutes }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    if (!policy?.enabled) {
      const [cancelled] = await transaction.update(youtubeDiscoveryPlanningLeases).set({ state: "cancelled", policyVersionId: policy?.id ?? null, nextRunAt: policy ? nextBoundarySql(sql`clock_timestamp()`, sql`clock_timestamp()`, policy.cadenceMinutes) : sql`clock_timestamp() + interval '15 minutes'`, terminalAt: sql`clock_timestamp()`, outcome: "cancelled", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, createdOrRefreshedCount: 0, unavailableCodes: [] }).where(and(eq(youtubeDiscoveryPlanningLeases.id, "youtube-discovery-planning"), sql`${youtubeDiscoveryPlanningLeases.state} <> 'cancelled'`)).returning({ id: youtubeDiscoveryPlanningLeases.id });
      if (cancelled) await recordPlanningAudit(transaction, "cancel", "policy_disabled", policy?.id);
      return null;
    }
    if (rows[0].state === "cancelled") await transaction.execute(sql`update youtube_discovery_planning_leases set state = 'queued', next_run_at = ${nextBoundarySql(sql`clock_timestamp()`, sql`clock_timestamp()`, policy.cadenceMinutes)}, terminal_at = null, outcome = null, created_or_refreshed_count = 0, unavailable_codes = '{}' where id = 'youtube-discovery-planning' and state = 'cancelled'`);
    const [lease] = await transaction.update(youtubeDiscoveryPlanningLeases).set({ state: "running", policyVersionId: policy.id, claimedBy: workerId, claimedAt: sql`clock_timestamp()`, leaseExpiresAt: sql`clock_timestamp() + interval '5 minutes'`, fencingToken, terminalAt: null, outcome: null, createdOrRefreshedCount: 0, unavailableCodes: [] }).where(and(eq(youtubeDiscoveryPlanningLeases.id, "youtube-discovery-planning"), sql`${youtubeDiscoveryPlanningLeases.state} in ('queued', 'cancelled') and ${youtubeDiscoveryPlanningLeases.nextRunAt} <= clock_timestamp()`)).returning();
    if (!lease) return null;
    await recordPlanningAudit(transaction, "claim", "due", policy.id);
    return { id: "youtube-discovery-planning", policyVersionId: policy.id, fencingToken };
  });
}

export async function refreshYoutubeDiscoverySystemProposals(claim: YoutubeDiscoveryPlanningClaim, results: readonly DiscoveryQuerySignalPortResult[], database: DiscoveryWriter = getDb()): Promise<"completed" | "cancelled" | "contended"> {
  const derived = deriveDiscoveryQueries(results);
  return database.transaction(async (transaction) => {
    const active = and(eq(youtubeDiscoveryPlanningLeases.id, claim.id), eq(youtubeDiscoveryPlanningLeases.state, "running"), eq(youtubeDiscoveryPlanningLeases.fencingToken, claim.fencingToken), sql`${youtubeDiscoveryPlanningLeases.leaseExpiresAt} > clock_timestamp()`);
    const [locked] = await transaction.select({ id: youtubeDiscoveryPlanningLeases.id }).from(youtubeDiscoveryPlanningLeases).where(active).limit(1).for("update");
    if (!locked) return "contended";
    const [policy] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled, cadenceMinutes: youtubeDiscoveryPolicyVersions.cadenceMinutes }).from(youtubeDiscoveryPolicyVersions).where(and(eq(youtubeDiscoveryPolicyVersions.id, claim.policyVersionId), eq(youtubeDiscoveryPolicyVersions.isCurrent, true))).limit(1).for("update");
    if (!policy?.enabled) return finishPlanning(transaction, claim, "cancelled", 0, []);
    for (const query of derived.queries) {
      const current = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
      if (!current[0]?.enabled) return finishPlanning(transaction, claim, "cancelled", 0, []);
      const upserted = await transaction.execute(sql`insert into youtube_discovery_query_proposals (id, origin, reason, priority, query_text, enabled, cadence_minutes, target_digest, safe_signal_summary, schedule_anchor_at, next_due_at) select ${crypto.randomUUID()}, 'system', ${query.reason}, ${query.priority}, ${query.queryText}, true, ${policy.cadenceMinutes}, ${query.targetDigest}, ${query.reason}, clock_timestamp(), clock_timestamp() + ${policy.cadenceMinutes} * interval '1 minute' where exists (select 1 from youtube_discovery_planning_leases where id = ${claim.id} and state = 'running' and fencing_token = ${claim.fencingToken} and lease_expires_at > clock_timestamp()) and exists (select 1 from youtube_discovery_policy_versions where id = ${claim.policyVersionId} and is_current = true and enabled = true) on conflict (reason, target_digest) where origin = 'system' do update set priority = excluded.priority, query_text = excluded.query_text, cadence_minutes = excluded.cadence_minutes, safe_signal_summary = excluded.safe_signal_summary, next_due_at = case when youtube_discovery_query_proposals.enabled and youtube_discovery_query_proposals.cadence_minutes <> excluded.cadence_minutes and youtube_discovery_query_proposals.schedule_anchor_at is not null then youtube_discovery_query_proposals.schedule_anchor_at + (floor(extract(epoch from (clock_timestamp() - youtube_discovery_query_proposals.schedule_anchor_at)) / 60 / excluded.cadence_minutes)::integer + 1) * excluded.cadence_minutes * interval '1 minute' else youtube_discovery_query_proposals.next_due_at end returning id, enabled`) as Array<{ id: string; enabled: boolean }>;
      if (!upserted[0]) return "contended";
      await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "update", targetType: "youtube_discovery_query_proposal", targetId: upserted[0].id, afterSummary: JSON.stringify({ origin: "system", priority: query.priority, enabled: upserted[0].enabled, cadenceMinutes: policy.cadenceMinutes }) }, transaction);
    }
    return finishPlanning(transaction, claim, derived.unavailableCodes.length ? "unavailable" : "completed", derived.queries.length, derived.unavailableCodes);
  });
}

async function finishPlanning(transaction: DiscoveryWriter, claim: YoutubeDiscoveryPlanningClaim, outcome: "completed" | "unavailable" | "cancelled", count: number, codes: string[]): Promise<"completed" | "cancelled" | "contended"> {
  const [updated] = await transaction.update(youtubeDiscoveryPlanningLeases).set({ state: outcome === "cancelled" ? "cancelled" : "queued", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, terminalAt: sql`clock_timestamp()`, outcome, createdOrRefreshedCount: count, unavailableCodes: codes, nextRunAt: nextBoundarySql(sql`clock_timestamp()`, sql`clock_timestamp()`, sql`(select cadence_minutes from youtube_discovery_policy_versions where id = ${claim.policyVersionId})`) }).where(and(eq(youtubeDiscoveryPlanningLeases.id, claim.id), eq(youtubeDiscoveryPlanningLeases.state, "running"), eq(youtubeDiscoveryPlanningLeases.fencingToken, claim.fencingToken), sql`${youtubeDiscoveryPlanningLeases.leaseExpiresAt} > clock_timestamp()`)).returning();
  if (!updated) return "contended";
  await transaction.insert(youtubeDiscoveryPlanningOutcomes).values({ planningId: claim.id, policyVersionId: claim.policyVersionId, outcome, createdOrRefreshedCount: count, unavailableCodes: codes, completedAt: sql`clock_timestamp()` });
  await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "update", targetType: "youtube_discovery_planning", targetId: claim.id, afterSummary: JSON.stringify({ policyVersionId: claim.policyVersionId, outcome, createdOrRefreshedCount: count, unavailableCount: codes.length }) }, transaction);
  return outcome === "cancelled" ? "cancelled" : "completed";
}

/** Atomically admits at most one due run per enabled proposal and cadence interval. */
export async function scheduleYoutubeDiscoveryDueRuns(database: DiscoveryWriter = getDb()): Promise<number> {
  return database.transaction(async (transaction) => {
    const [policy] = await transaction.select({ id: youtubeDiscoveryPolicyVersions.id, enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    if (!policy?.enabled) {
      await transaction.update(youtubeDiscoveryQueryProposals).set({ nextDueAt: null }).where(and(eq(youtubeDiscoveryQueryProposals.enabled, true), sql`${youtubeDiscoveryQueryProposals.scheduleAnchorAt} is not null`));
      return 0;
    }
    await transaction.execute(sql`update youtube_discovery_query_proposals set next_due_at = schedule_anchor_at + (floor(extract(epoch from (clock_timestamp() - schedule_anchor_at)) / 60 / cadence_minutes)::integer + 1) * cadence_minutes * interval '1 minute' where enabled = true and schedule_anchor_at is not null and next_due_at is null`);
    const proposals = await transaction.execute(sql`select id, next_due_at from youtube_discovery_query_proposals where enabled = true and next_due_at is not null and next_due_at <= clock_timestamp() order by next_due_at asc for update skip locked`) as Array<{ id: string; next_due_at: Date }>;
    let admitted = 0;
    for (const proposal of proposals) {
      // Re-check current global enablement immediately before each admission.
      const [current] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(and(eq(youtubeDiscoveryPolicyVersions.id, policy.id), eq(youtubeDiscoveryPolicyVersions.isCurrent, true))).limit(1).for("update");
      if (!current?.enabled) return admitted;
      const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id, scheduleIntervalAt: new Date(proposal.next_due_at) }, transaction);
      // A conflict-safe duplicate insert leaves the schedule in place for the winner.
      if (!run) continue;
      const dueAt = new Date(proposal.next_due_at);
      const [advanced] = await transaction.update(youtubeDiscoveryQueryProposals).set({ scheduleAnchorAt: dueAt, nextDueAt: nextBoundarySql(sql`${youtubeDiscoveryQueryProposals.nextDueAt}`, sql`clock_timestamp()`, sql`${youtubeDiscoveryQueryProposals.cadenceMinutes}`) }).where(and(eq(youtubeDiscoveryQueryProposals.id, proposal.id), eq(youtubeDiscoveryQueryProposals.enabled, true))).returning({ id: youtubeDiscoveryQueryProposals.id });
      if (!advanced) throw new Error("YouTube Discovery schedule advancement was contended.");
      admitted += 1;
    }
    return admitted;
  });
}

function nextBoundarySql(anchor: ReturnType<typeof sql>, now: ReturnType<typeof sql>, cadence: number | ReturnType<typeof sql>) {
  return sql`${anchor} + (floor(extract(epoch from (${now} - ${anchor})) / 60 / ${cadence})::integer + 1) * ${cadence} * interval '1 minute'`;
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
    const [run] = await transaction.select({ id: youtubeDiscoveryRuns.id, attemptCount: youtubeDiscoveryRuns.attemptCount, maxRetryAttempts: youtubeDiscoveryRuns.maxRetryAttempts, retryDelayMinutes: youtubeDiscoveryRuns.retryDelayMinutes, policyVersionId: youtubeDiscoveryRuns.policyVersionId }).from(youtubeDiscoveryRuns).where(activeClaim(claim)).limit(1).for("update");
    if (!run) return "contended";
    const [currentPolicy] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    const outcome: YoutubeDiscoveryRunDisposition = !currentPolicy?.enabled ? "cancelled" : isYoutubeDiscoveryRetryExhausted(run.attemptCount, run.maxRetryAttempts) ? "failed" : "retrying";
    const safeErrorCode: YoutubeDiscoveryRunSafeErrorCode = outcome === "cancelled" ? "policy_revoked" : outcome === "failed" ? "retry_exhausted" : "stage_transient";
    const retryDelayMinutes = getYoutubeDiscoveryRetryDelayMinutes(run.retryDelayMinutes, run.attemptCount);
    const [updated] = await transaction.update(youtubeDiscoveryRuns).set({ state: outcome, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: outcome === "retrying" ? sql`clock_timestamp() + ${retryDelayMinutes} * interval '1 minute'` : sql`clock_timestamp()`, terminalAt: outcome === "retrying" ? null : sql`clock_timestamp()`, terminalOutcome: outcome === "retrying" ? null : outcome, safeErrorCode }).where(activeClaim(claim)).returning();
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

async function recordPlanningAudit(database: AuditEventWriter, action: "claim" | "recover_expired" | "cancel", reason: "due" | "lease_expired" | "policy_disabled", policyVersionId?: string) {
  await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "update", targetType: "youtube_discovery_planning", targetId: "youtube-discovery-planning", afterSummary: JSON.stringify({ action, reason, ...(policyVersionId ? { policyVersionId } : {}) }) }, database);
}

function assertDiscoveryPolicyActor(actor: AuditActor) {
  if (actor.kind === "system" && actor.system !== "system-youtube-discovery") {
    throw new Error("YouTube Discovery automated policy work requires the Discovery system actor.");
  }
}

function assertDiscoveryQueryActor(origin: YoutubeDiscoveryQueryProposalOrigin, actor: AuditActor) {
  if (origin === "system") {
    if (actor.kind !== "system" || actor.system !== "system-youtube-discovery") throw new Error("YouTube Discovery system query proposals require the Discovery system actor.");
  }
  if (origin === "operator" && actor.kind !== "user") {
    throw new Error("YouTube Discovery operator query proposals require a user actor.");
  }
}

function assertSafeDiscoveryQueryProposal(input: CreateYoutubeDiscoveryQueryProposalInput) {
  if (!youtubeDiscoveryQueryProposalReasonValues.includes(input.reason) || (input.origin === "system" && (!input.systemSignal || input.reason === "operator_request" || input.systemSignal.reason !== input.reason || systemProposalFields(input.systemSignal).queryText !== input.queryText)) || !/^[\p{L}\p{N} '-]{1,240}$/u.test(input.queryText.trim())) {
    throw new Error("Invalid YouTube Discovery query proposal.");
  }
}

function systemProposalFields(signal: SafeDiscoveryQuerySignal) {
  const [derived] = deriveDiscoveryQueries([{ status: "available", signals: [signal] }]).queries;
  if (!derived) throw new Error("Invalid YouTube Discovery system query proposal.");
  return { targetDigest: derived.targetDigest, safeSignalSummary: derived.reason, queryText: derived.queryText, priority: derived.priority };
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
