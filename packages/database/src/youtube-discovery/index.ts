import { recordAuditEvent, type AuditEventWriter } from "../audit-writers";
import { createSystemAuditActor, type AuditActor } from "../actors";
import { getDb } from "../client";
import { youtubeDiscoveryAppearances, youtubeDiscoveryCandidateJobs, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryCommentSignalValues, youtubeDiscoveryCommentSignals, youtubeDiscoveryKnowledgeHandoffs, youtubeDiscoveryPlanningLeases, youtubeDiscoveryPlanningOutcomes, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryQueryProposalReasonValues, youtubeDiscoveryRankingHistory, youtubeDiscoveryRecommendations, youtubeDiscoveryRuns, youtubeDiscoveryTriages, type YoutubeDiscoveryCandidateJobSafeErrorCode, type YoutubeDiscoveryCommentSignal, type YoutubeDiscoveryQueryProposalOrigin, type YoutubeDiscoveryQueryProposalReason, type YoutubeDiscoveryRunIncidentCategory, type YoutubeDiscoveryRunSafeErrorCode, type YoutubeDiscoverySearchTranche } from "../schema";
import type { YoutubeDiscoveryPolicyAuditSummary, YoutubeDiscoveryQueryProposalAuditSummary, YoutubeDiscoveryRunAuditSummary } from "@xuyenviet/contracts";
import { canonicalizeYoutubeVideoUrl, deriveDiscoveryQueries, evaluateYoutubeDiscoveryEligibility, evaluateYoutubeDiscoveryRecommendation, parseYoutubeDiscoveryPolicy, type DiscoveryQuerySignalPortResult, type SafeDiscoveryQuerySignal, type YoutubeDiscoveryEligibility } from "@xuyenviet/domain";
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getYoutubeDiscoveryRetryDelayMinutes, isYoutubeDiscoveryRetryExhausted } from "./retry-policy";
import { selectActiveAiGatewayModel, getAiGatewayPricingSnapshot, type SelectedAiGatewayModel } from "../models";
import { writeAiUsageEvent } from "../usage";
import { aiUsagePromptVersions, aiUsagePurposes } from "../usage-constants";

type DiscoveryWriter = Pick<ReturnType<typeof getDb>, "execute" | "insert" | "select" | "update" | "transaction"> & AuditEventWriter;

export type CreateYoutubeDiscoveryPolicyVersionInput = Readonly<{ version: number; isCurrent: boolean; policy?: unknown; actor: AuditActor }>;
export type CreateYoutubeDiscoveryQueryProposalInput = Readonly<{ origin: YoutubeDiscoveryQueryProposalOrigin; reason: YoutubeDiscoveryQueryProposalReason; priority: number; queryText: string; enabled?: boolean; cadenceMinutes: number; actor: AuditActor; systemSignal?: SafeDiscoveryQuerySignal }>;
export type CreateYoutubeDiscoveryRunInput = Readonly<{ policyVersionId: string; queryProposalId?: string; scheduleIntervalAt?: Date; immediateOperatorUserId?: string; immediateConfirmationKey?: string; actor?: AuditActor }>;
export type YoutubeDiscoveryRunClaim = Readonly<{ id: string; fencingToken: string; attemptCount: number; nextRunAt: Date; claimedAt: Date; leaseExpiresAt: Date; recoveredCount: number }>;
export type YoutubeDiscoveryRunClaimResult = Readonly<{ claim: YoutubeDiscoveryRunClaim | null; recoveredCount: number; recoveredTerminalCount: number; contended: boolean }>;
export type YoutubeDiscoveryRunDisposition = "completed" | "failed" | "cancelled" | "retrying" | "contended";
export type YoutubeDiscoveryCandidateJobClaim = Readonly<{ id: string; candidateId: string; videoId: string; appearanceId: string; runId: string; policyVersionId: string; fencingToken: string; attemptCount: number; nextRunAt: Date; claimedAt: Date; leaseExpiresAt: Date; recoveredCount: number }>;
export type YoutubeDiscoveryCandidateJobClaimResult = Readonly<{ claim: YoutubeDiscoveryCandidateJobClaim | null; recoveredCount: number; recoveredTerminalCount: number; contended: boolean }>;
export type YoutubeDiscoveryCandidateJobDisposition = YoutubeDiscoveryRunDisposition;
type YoutubeDiscoveryCandidateWorkClaim = YoutubeDiscoveryRunClaim | YoutubeDiscoveryCandidateJobClaim;
export type YoutubeDiscoveryPlanningClaim = Readonly<{ id: "youtube-discovery-planning"; policyVersionId: string; fencingToken: string }>;
export type YoutubeDiscoverySearchCandidate = Readonly<{ videoId: string; canonicalUrl: string; resultOrdinal: number; searchTranche: YoutubeDiscoverySearchTranche }>;
export type YoutubeDiscoveryEnrichment = Readonly<{ videoId: string; title?: string; description?: string; channelId?: string; channelName?: string; publishedAt?: Date; durationSeconds?: number; defaultLanguage?: string; defaultAudioLanguage?: string; categoryId?: string; tags?: string[]; viewCount?: number; likeCount?: number; commentCount?: number; channelSubscriberCount?: number; thumbnailUrl?: string; signals: ReadonlyArray<{ signal: YoutubeDiscoveryCommentSignal; count: number; score: number }> }>;
export type YoutubeDiscoveryTriageAssessment = Readonly<{ relevanceScore: number; expectedValueScore: number; freshnessFitScore: number; commercialRiskScore: number; duplicateRiskScore: number; signals: YoutubeDiscoveryCommentSignal[] }>;
export type YoutubeDiscoveryTriageBundle = Readonly<{ candidateId: string; queryText: string; candidate: Readonly<{ videoId: string; title: string | null; channelName: string | null; publishedAt: string | null; durationSeconds: number | null; categoryId: string | null; viewCount: number | null; likeCount: number | null; commentCount: number | null; channelSubscriberCount: number | null }>; signals: ReadonlyArray<Readonly<{ signal: YoutubeDiscoveryCommentSignal; count: number; score: number }>> }>;
export type YoutubeDiscoveryRecommendationBundle = Readonly<{ candidateId: string; appearanceId: string; triageId: string; canonical: boolean; currentRunEnriched: boolean; triage: YoutubeDiscoveryTriageAssessment; policy: ReturnType<typeof parseYoutubeDiscoveryPolicy> }>;
export type YoutubeDiscoveryTriageBundleFailurePoint = "triage_bundle_guard" | "triage_bundle_candidate_lookup" | "triage_bundle_existing_lookup" | "triage_bundle_signals_lookup" | "triage_bundle_serialize";
export type YoutubeDiscoveryTriageBundleFailureDetail = "database_serialization" | "database_deadlock" | "database_lock_timeout" | "database_statement_timeout" | "database_other";
export class YoutubeDiscoveryTriageBundleReadError extends Error { constructor(readonly failurePoint: YoutubeDiscoveryTriageBundleFailurePoint, readonly failureDetail: YoutubeDiscoveryTriageBundleFailureDetail) { super(failurePoint); } }

class PlanningLeaseLostError extends Error {}
class RecommendationDeadlineExceeded extends Error {}
class CandidateWriteAborted extends Error {
  constructor(readonly outcome: "cancelled" | "contended") { super(outcome); }
}

export async function createYoutubeDiscoveryPolicyVersion(input: CreateYoutubeDiscoveryPolicyVersionInput, database: DiscoveryWriter = getDb()) {
  const policy = parseYoutubeDiscoveryPolicy(input.policy === undefined ? {} : input.policy);
  assertDiscoveryPolicyActor(input.actor);
  return database.transaction(async (transaction) => {
    const [previous] = input.isCurrent ? await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled, cadenceMinutes: youtubeDiscoveryPolicyVersions.cadenceMinutes, queryBuilderVersion: youtubeDiscoveryPolicyVersions.queryBuilderVersion }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update") : [];
    if (input.isCurrent) await transaction.update(youtubeDiscoveryPolicyVersions).set({ isCurrent: false }).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true));
    const [created] = await transaction.insert(youtubeDiscoveryPolicyVersions).values({ version: input.version, isCurrent: input.isCurrent, ...policy, relevanceWeight: policy.relevanceWeight.toFixed(6), expectedValueWeight: policy.expectedValueWeight.toFixed(6), freshnessFitWeight: policy.freshnessFitWeight.toFixed(6), commercialRiskWeight: policy.commercialRiskWeight.toFixed(6), duplicateRiskWeight: policy.duplicateRiskWeight.toFixed(6), deferMinimum: policy.deferMinimum.toFixed(6), considerMinimum: policy.considerMinimum.toFixed(6) }).returning();
    if (!created) throw new Error("YouTube Discovery policy creation failed.");
    if (input.isCurrent && previous && (previous.enabled !== created.enabled || previous.cadenceMinutes !== created.cadenceMinutes || previous.queryBuilderVersion !== created.queryBuilderVersion)) await lockPlanningLease(transaction);
    if (input.isCurrent && previous?.enabled && !created.enabled) {
      await transaction.update(youtubeDiscoveryQueryProposals).set({ nextDueAt: null }).where(and(eq(youtubeDiscoveryQueryProposals.enabled, true), sql`${youtubeDiscoveryQueryProposals.scheduleAnchorAt} is not null`));
      await transaction.execute(sql`insert into youtube_discovery_planning_leases (id, policy_version_id, state, next_run_at, terminal_at, outcome) values ('youtube-discovery-planning', ${created.id}, 'cancelled', ${nextBoundaryFromStatementNow(created.cadenceMinutes)}, clock_timestamp(), 'cancelled') on conflict (id) do update set policy_version_id = excluded.policy_version_id, state = 'cancelled', next_run_at = excluded.next_run_at, claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null, terminal_at = excluded.terminal_at, outcome = 'cancelled', created_or_refreshed_count = 0, unavailable_codes = '{}'`);
      await recordPlanningAudit(transaction, "cancel", "policy_disabled", created.id);
    }
    if (input.isCurrent && previous && !previous.enabled && created.enabled) {
      await transaction.update(youtubeDiscoveryQueryProposals).set({ nextDueAt: nextBoundarySql(sql`${youtubeDiscoveryQueryProposals.scheduleAnchorAt}`, sql`clock_timestamp()`, sql`${youtubeDiscoveryQueryProposals.cadenceMinutes}`) }).where(and(eq(youtubeDiscoveryQueryProposals.enabled, true), sql`${youtubeDiscoveryQueryProposals.scheduleAnchorAt} is not null`));
      await transaction.execute(sql`insert into youtube_discovery_planning_leases (id, policy_version_id, state, next_run_at) values ('youtube-discovery-planning', ${created.id}, 'queued', ${nextBoundaryFromStatementNow(created.cadenceMinutes)}) on conflict (id) do update set policy_version_id = excluded.policy_version_id, state = 'queued', next_run_at = excluded.next_run_at, claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null, terminal_at = null, outcome = null, created_or_refreshed_count = 0, unavailable_codes = '{}'`);
    }
    if (input.isCurrent && previous?.enabled && created.enabled && previous.cadenceMinutes !== created.cadenceMinutes) {
      await transaction.execute(sql`update youtube_discovery_query_proposals set cadence_minutes = ${created.cadenceMinutes}, next_due_at = case when schedule_anchor_at is null then next_due_at else schedule_anchor_at + (floor(extract(epoch from (clock_timestamp() - schedule_anchor_at)) / 60 / ${created.cadenceMinutes})::integer + 1) * ${created.cadenceMinutes} * interval '1 minute' end where origin = 'system' and enabled = true`);
      await transaction.execute(sql`insert into youtube_discovery_planning_leases (id, policy_version_id, state, next_run_at) values ('youtube-discovery-planning', ${created.id}, 'queued', ${nextBoundaryFromStatementNow(created.cadenceMinutes)}) on conflict (id) do update set policy_version_id = excluded.policy_version_id, state = 'queued', next_run_at = excluded.next_run_at, claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null, terminal_at = null, outcome = null, created_or_refreshed_count = 0, unavailable_codes = '{}'`);
    }
    if (input.isCurrent && previous?.enabled && created.enabled && previous.queryBuilderVersion !== created.queryBuilderVersion) {
      await transaction.execute(sql`insert into youtube_discovery_planning_leases (id, policy_version_id, state, next_run_at) values ('youtube-discovery-planning', ${created.id}, 'queued', clock_timestamp()) on conflict (id) do update set policy_version_id = excluded.policy_version_id, state = 'queued', next_run_at = excluded.next_run_at, claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null, terminal_at = null, outcome = null, created_or_refreshed_count = 0, unavailable_codes = '{}'`);
    }
    await recordAuditEvent({ actor: input.actor, operation: "create", targetType: "youtube_discovery_policy_version", targetId: created.id, afterSummary: JSON.stringify(policyAuditSummary({ ...created, relevanceWeight: Number(created.relevanceWeight), expectedValueWeight: Number(created.expectedValueWeight), freshnessFitWeight: Number(created.freshnessFitWeight), commercialRiskWeight: Number(created.commercialRiskWeight), duplicateRiskWeight: Number(created.duplicateRiskWeight), deferMinimum: Number(created.deferMinimum), considerMinimum: Number(created.considerMinimum) })) }, transaction);
    return created;
  });
}

export async function createYoutubeDiscoveryQueryProposal(input: CreateYoutubeDiscoveryQueryProposalInput, database: DiscoveryWriter = getDb()) {
  assertDiscoveryQueryActor(input.origin, input.actor);
  assertSafeDiscoveryQueryProposal(input);
  return database.transaction(async (transaction) => {
    const { actor, ...proposal } = input;
    const [policy] = input.origin === "system" ? await transaction.select({ cadenceMinutes: youtubeDiscoveryPolicyVersions.cadenceMinutes, enabled: youtubeDiscoveryPolicyVersions.enabled, queryBuilderVersion: youtubeDiscoveryPolicyVersions.queryBuilderVersion }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update") : [];
    const systemFields = input.origin === "system" ? systemProposalFields(input.systemSignal!, policy?.queryBuilderVersion) : null;
    if (systemFields && systemFields.queryText !== input.queryText) throw new Error("Invalid YouTube Discovery query proposal.");
    if (systemFields && !policy?.enabled) throw new Error("YouTube Discovery system query proposals require an enabled current policy version.");
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
    let queryText: string | undefined;
    if (input.queryProposalId) {
      const [proposal] = await transaction.select({ id: youtubeDiscoveryQueryProposals.id, enabled: youtubeDiscoveryQueryProposals.enabled, queryText: youtubeDiscoveryQueryProposals.queryText }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.id, input.queryProposalId)).limit(1).for("update");
      if (!proposal || !proposal.enabled) throw new Error("YouTube Discovery runs require an enabled query proposal.");
      queryText = proposal.queryText;
    }
    const [created] = await transaction.insert(youtubeDiscoveryRuns).values({ policyVersionId: input.policyVersionId, queryProposalId: input.queryProposalId, queryText, scheduleIntervalAt: input.scheduleIntervalAt, immediateOperatorUserId: input.immediateOperatorUserId, immediateConfirmationKey: input.immediateConfirmationKey, state: "queued", maxRetryAttempts: policy.maxRetryAttempts, retryDelayMinutes: policy.retryDelayMinutes, maxConcurrentRuns: policy.maxConcurrentRuns }).onConflictDoNothing().returning();
    if (!created) {
      if (input.scheduleIntervalAt) return null;
      if (input.immediateConfirmationKey && input.queryProposalId && input.immediateOperatorUserId) { const [existing] = await transaction.select().from(youtubeDiscoveryRuns).where(and(eq(youtubeDiscoveryRuns.queryProposalId, input.queryProposalId), eq(youtubeDiscoveryRuns.immediateOperatorUserId, input.immediateOperatorUserId), eq(youtubeDiscoveryRuns.immediateConfirmationKey, input.immediateConfirmationKey))).limit(1); if (existing) return existing; }
      throw new Error("YouTube Discovery run creation failed.");
    }
    await recordAuditEvent({ actor: input.actor ?? createSystemAuditActor("system-youtube-discovery"), operation: "create", targetType: "youtube_discovery_run", targetId: created.id, afterSummary: JSON.stringify(runAuditSummary(created)) }, transaction);
    return created;
  });
}

export async function claimYoutubeDiscoveryPlanning(workerId: string, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryPlanningClaim | null> {
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("YouTube Discovery worker ID is invalid.");
  const fencingToken = randomBytes(32).toString("hex");
  return database.transaction(async (transaction) => {
    // Every path that needs both rows locks the current policy before planning.
    // This prevents a policy transition from forming a lock cycle with a poll.
    const [policy] = await transaction.select({ id: youtubeDiscoveryPolicyVersions.id, enabled: youtubeDiscoveryPolicyVersions.enabled, cadenceMinutes: youtubeDiscoveryPolicyVersions.cadenceMinutes }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    // Test/database resets can remove the singleton; its identity remains fixed.
    await transaction.execute(sql`insert into youtube_discovery_planning_leases (id, next_run_at) values ('youtube-discovery-planning', clock_timestamp()) on conflict (id) do nothing`);
    const recovered = await transaction.execute(sql`update youtube_discovery_planning_leases set state = 'queued', claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null where id = 'youtube-discovery-planning' and state = 'running' and lease_expires_at <= clock_timestamp() returning id`) as Array<{ id: string }>;
    if (recovered[0]) await recordPlanningAudit(transaction, "recover_expired", "lease_expired");
    const rows = await transaction.execute(sql`select id, state from youtube_discovery_planning_leases where id = 'youtube-discovery-planning' and (state = 'queued' and next_run_at <= clock_timestamp() or state = 'cancelled') for update skip locked`) as Array<{ id: string; state: "queued" | "cancelled" }>;
    if (!rows[0]) return null;
    if (!policy?.enabled) {
      const [cancelled] = await transaction.update(youtubeDiscoveryPlanningLeases).set({ state: "cancelled", policyVersionId: policy?.id ?? null, nextRunAt: policy ? nextBoundaryFromStatementNow(policy.cadenceMinutes) : sql`clock_timestamp() + interval '15 minutes'`, terminalAt: sql`clock_timestamp()`, outcome: "cancelled", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, createdOrRefreshedCount: 0, unavailableCodes: [] }).where(and(eq(youtubeDiscoveryPlanningLeases.id, "youtube-discovery-planning"), sql`${youtubeDiscoveryPlanningLeases.state} <> 'cancelled'`)).returning({ id: youtubeDiscoveryPlanningLeases.id });
      if (cancelled) await recordPlanningAudit(transaction, "cancel", "policy_disabled", policy?.id);
      return null;
    }
    if (rows[0].state === "cancelled") await transaction.execute(sql`update youtube_discovery_planning_leases set state = 'queued', next_run_at = ${nextBoundaryFromStatementNow(policy.cadenceMinutes)}, terminal_at = null, outcome = null, created_or_refreshed_count = 0, unavailable_codes = '{}' where id = 'youtube-discovery-planning' and state = 'cancelled'`);
    const [lease] = await transaction.update(youtubeDiscoveryPlanningLeases).set({ state: "running", policyVersionId: policy.id, claimedBy: workerId, claimedAt: sql`clock_timestamp()`, leaseExpiresAt: sql`clock_timestamp() + interval '5 minutes'`, fencingToken, terminalAt: null, outcome: null, createdOrRefreshedCount: 0, unavailableCodes: [] }).where(and(eq(youtubeDiscoveryPlanningLeases.id, "youtube-discovery-planning"), sql`${youtubeDiscoveryPlanningLeases.state} in ('queued', 'cancelled') and ${youtubeDiscoveryPlanningLeases.nextRunAt} <= clock_timestamp()`)).returning();
    if (!lease) return null;
    await recordPlanningAudit(transaction, "claim", "due", policy.id);
    return { id: "youtube-discovery-planning", policyVersionId: policy.id, fencingToken };
  });
}

export async function refreshYoutubeDiscoverySystemProposals(claim: YoutubeDiscoveryPlanningClaim, results: readonly DiscoveryQuerySignalPortResult[], database: DiscoveryWriter = getDb()): Promise<"completed" | "cancelled" | "contended"> {
  try {
    return await database.transaction(async (transaction) => {
      const [policy] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled, cadenceMinutes: youtubeDiscoveryPolicyVersions.cadenceMinutes, queryBuilderVersion: youtubeDiscoveryPolicyVersions.queryBuilderVersion }).from(youtubeDiscoveryPolicyVersions).where(and(eq(youtubeDiscoveryPolicyVersions.id, claim.policyVersionId), eq(youtubeDiscoveryPolicyVersions.isCurrent, true))).limit(1).for("update");
      const active = and(eq(youtubeDiscoveryPlanningLeases.id, claim.id), eq(youtubeDiscoveryPlanningLeases.state, "running"), eq(youtubeDiscoveryPlanningLeases.fencingToken, claim.fencingToken), sql`${youtubeDiscoveryPlanningLeases.leaseExpiresAt} > clock_timestamp()`);
      const [locked] = await transaction.select({ id: youtubeDiscoveryPlanningLeases.id }).from(youtubeDiscoveryPlanningLeases).where(active).limit(1).for("update");
      if (!locked) return "contended";
      if (!policy?.enabled) return finishPlanning(transaction, claim, "cancelled", 0, []);
      const queries = deriveDiscoveryQueries(results, policy.queryBuilderVersion);
      for (const query of queries.queries) {
        const current = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
        if (!current[0]?.enabled) return finishPlanning(transaction, claim, "cancelled", 0, []);
        // Story 20.1 added Mission-specific query identities. Preserve the single
        // legacy aggregate before its new digest would otherwise create a duplicate.
        if (query.missionActionId) await transaction.execute(sql`update youtube_discovery_query_proposals set target_digest = ${query.targetDigest}, mission_action_id = ${query.missionActionId} where id = (select id from youtube_discovery_query_proposals where origin = 'system' and reason = ${query.reason} and query_text = ${query.queryText} and mission_action_id is null order by created_at asc, id asc limit 1 for update) and not exists (select 1 from youtube_discovery_query_proposals where origin = 'system' and reason = ${query.reason} and target_digest = ${query.targetDigest})`);
        const upserted = await transaction.execute(sql`insert into youtube_discovery_query_proposals (id, origin, reason, priority, query_text, enabled, cadence_minutes, target_digest, mission_action_id, safe_signal_summary, schedule_anchor_at, next_due_at) select ${crypto.randomUUID()}, 'system', ${query.reason}, ${query.priority}, ${query.queryText}, true, ${policy.cadenceMinutes}, ${query.targetDigest}, ${query.missionActionId ?? null}, ${query.reason}, clock_timestamp(), clock_timestamp() + ${policy.cadenceMinutes} * interval '1 minute' where exists (select 1 from youtube_discovery_planning_leases where id = ${claim.id} and state = 'running' and fencing_token = ${claim.fencingToken} and lease_expires_at > clock_timestamp()) and exists (select 1 from youtube_discovery_policy_versions where id = ${claim.policyVersionId} and is_current = true and enabled = true) on conflict (reason, target_digest) where origin = 'system' do update set priority = case when youtube_discovery_query_proposals.operator_priority_override is null then excluded.priority else youtube_discovery_query_proposals.operator_priority_override end, query_text = excluded.query_text, cadence_minutes = excluded.cadence_minutes, mission_action_id = excluded.mission_action_id, safe_signal_summary = excluded.safe_signal_summary, next_due_at = case when youtube_discovery_query_proposals.enabled and youtube_discovery_query_proposals.cadence_minutes <> excluded.cadence_minutes and youtube_discovery_query_proposals.schedule_anchor_at is not null then youtube_discovery_query_proposals.schedule_anchor_at + (floor(extract(epoch from (clock_timestamp() - youtube_discovery_query_proposals.schedule_anchor_at)) / 60 / excluded.cadence_minutes)::integer + 1) * excluded.cadence_minutes * interval '1 minute' else youtube_discovery_query_proposals.next_due_at end returning id, enabled, priority`) as Array<{ id: string; enabled: boolean; priority: number }>;
        if (!upserted[0]) throw new PlanningLeaseLostError();
        await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "update", targetType: "youtube_discovery_query_proposal", targetId: upserted[0].id, afterSummary: JSON.stringify({ origin: "system", priority: upserted[0].priority, enabled: upserted[0].enabled, cadenceMinutes: policy.cadenceMinutes }) }, transaction);
      }
      return finishPlanning(transaction, claim, queries.unavailableCodes.length ? "unavailable" : "completed", queries.queries.length, queries.unavailableCodes);
    });
  } catch (error) {
    if (error instanceof PlanningLeaseLostError) return "contended";
    throw error;
  }
}

async function lockPlanningLease(transaction: DiscoveryWriter) {
  await transaction.execute(sql`insert into youtube_discovery_planning_leases (id, next_run_at) values ('youtube-discovery-planning', clock_timestamp()) on conflict (id) do nothing`);
  await transaction.execute(sql`select id from youtube_discovery_planning_leases where id = 'youtube-discovery-planning' for update`);
}

async function finishPlanning(transaction: DiscoveryWriter, claim: YoutubeDiscoveryPlanningClaim, outcome: "completed" | "unavailable" | "cancelled", count: number, codes: string[]): Promise<"completed" | "cancelled" | "contended"> {
  const [updated] = await transaction.update(youtubeDiscoveryPlanningLeases).set({ state: outcome === "cancelled" ? "cancelled" : "queued", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, terminalAt: sql`clock_timestamp()`, outcome, createdOrRefreshedCount: count, unavailableCodes: codes, nextRunAt: nextBoundaryFromStatementNow(sql`(select cadence_minutes from youtube_discovery_policy_versions where id = ${claim.policyVersionId})`) }).where(and(eq(youtubeDiscoveryPlanningLeases.id, claim.id), eq(youtubeDiscoveryPlanningLeases.state, "running"), eq(youtubeDiscoveryPlanningLeases.fencingToken, claim.fencingToken), sql`${youtubeDiscoveryPlanningLeases.leaseExpiresAt} > clock_timestamp()`)).returning();
  if (!updated) throw new PlanningLeaseLostError();
  await transaction.insert(youtubeDiscoveryPlanningOutcomes).values({ planningId: claim.id, policyVersionId: claim.policyVersionId, outcome, createdOrRefreshedCount: count, unavailableCodes: codes, completedAt: sql`clock_timestamp()` });
  await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "update", targetType: "youtube_discovery_planning", targetId: claim.id, afterSummary: JSON.stringify({ policyVersionId: claim.policyVersionId, outcome, createdOrRefreshedCount: count, unavailableCount: codes.length }) }, transaction);
  return outcome === "cancelled" ? "cancelled" : "completed";
}

/** Atomically admits at most one due run per enabled proposal and cadence interval. */
export async function scheduleYoutubeDiscoveryDueRuns(database: DiscoveryWriter = getDb()): Promise<number | "candidate_backlog_blocked"> {
  return database.transaction(async (transaction) => {
    const [policy] = await transaction.select({ id: youtubeDiscoveryPolicyVersions.id, enabled: youtubeDiscoveryPolicyVersions.enabled, candidateBacklogThreshold: youtubeDiscoveryPolicyVersions.candidateBacklogThreshold }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    if (!policy?.enabled) {
      await transaction.update(youtubeDiscoveryQueryProposals).set({ nextDueAt: null }).where(and(eq(youtubeDiscoveryQueryProposals.enabled, true), sql`${youtubeDiscoveryQueryProposals.scheduleAnchorAt} is not null`));
      return 0;
    }
    // Running work has already been admitted; only pending candidate work applies backpressure.
    const [backlog] = await transaction.execute(sql`select count(*)::integer as count from youtube_discovery_candidate_jobs where state in ('queued', 'retrying')`) as Array<{ count: number }>;
    if ((backlog?.count ?? 0) >= policy.candidateBacklogThreshold) return "candidate_backlog_blocked";
    await transaction.execute(sql`update youtube_discovery_query_proposals set next_due_at = schedule_anchor_at + (floor(extract(epoch from (clock_timestamp() - schedule_anchor_at)) / 60 / cadence_minutes)::integer + 1) * cadence_minutes * interval '1 minute' where enabled = true and schedule_anchor_at is not null and next_due_at is null`);
    const proposals = await transaction.execute(sql`select id, next_due_at from youtube_discovery_query_proposals where enabled = true and next_due_at is not null and next_due_at <= clock_timestamp() order by next_due_at asc for update skip locked limit 20`) as Array<{ id: string; next_due_at: Date }>;
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

function nextBoundaryFromStatementNow(cadence: number | ReturnType<typeof sql>) {
  return nextBoundarySql(sql`statement_timestamp()`, sql`statement_timestamp()`, cadence);
}

export async function claimNextYoutubeDiscoveryRun(input: { workerId: string; leaseMs?: number; immediateOnly?: boolean }, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryRunClaimResult> {
  const workerId = input.workerId.trim();
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("YouTube Discovery worker ID is invalid.");
  const leaseMs = input.leaseMs ?? 300_000;
  if (!Number.isInteger(leaseMs) || leaseMs < 60_000 || leaseMs > 3_600_000) throw new Error("YouTube Discovery lease is invalid.");
  const fencingToken = randomBytes(32).toString("hex");
  return database.transaction(async (transaction) => {
    const recovery = await recoverExpiredYoutubeDiscoveryRuns(transaction);
    const rows = await transaction.execute(sql`
      select candidate.id, candidate.policy_version_id, candidate.max_concurrent_runs from youtube_discovery_runs candidate
      left join youtube_discovery_query_proposals proposal on proposal.id = candidate.query_proposal_id
       where candidate.state in ('queued', 'retrying') and candidate.next_run_at <= clock_timestamp()
         and (${input.immediateOnly ?? false} = false or candidate.immediate_confirmation_key is not null)
        and (candidate.query_proposal_id is null or proposal.enabled = true)
        and not exists (
          select 1 from youtube_discovery_runs active
          where active.state = 'running' and active.policy_version_id = candidate.policy_version_id
            and active.lease_expires_at > clock_timestamp()
          group by active.policy_version_id
          having count(*) >= candidate.max_concurrent_runs
        )
      order by candidate.next_run_at asc, candidate.created_at asc
       for update of candidate skip locked limit 1
    `) as Array<{ id: string; policy_version_id: string; max_concurrent_runs: number }>;
    if (!rows[0]) return { claim: null, recoveredCount: recovery.count, recoveredTerminalCount: recovery.terminalCount, contended: recovery.contended };
    // Serialize admission for a policy after SKIP LOCKED selects a candidate so
    // separate workers cannot both observe spare capacity for the same policy.
    await transaction.execute(sql`select id from youtube_discovery_policy_versions where id = ${rows[0].policy_version_id} for update`);
    const [proposal] = await transaction.execute(sql`select enabled from youtube_discovery_query_proposals where id = (select query_proposal_id from youtube_discovery_runs where id = ${rows[0].id}) for update`) as Array<{ enabled: boolean }>;
    if (proposal?.enabled === false) return { claim: null, recoveredCount: recovery.count, recoveredTerminalCount: recovery.terminalCount, contended: true };
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

export async function claimNextYoutubeDiscoveryCandidateJob(input: { workerId: string; leaseMs?: number }, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryCandidateJobClaimResult> {
  const workerId = input.workerId.trim();
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("YouTube Discovery worker ID is invalid.");
  const leaseMs = input.leaseMs ?? 300_000;
  if (!Number.isInteger(leaseMs) || leaseMs < 60_000 || leaseMs > 3_600_000) throw new Error("YouTube Discovery lease is invalid.");
  const fencingToken = randomBytes(32).toString("hex");
  return database.transaction(async (transaction) => {
    const recovery = await recoverExpiredYoutubeDiscoveryCandidateJobs(transaction);
    const rows = await transaction.execute(sql`select job.id, job.policy_version_id as "policyVersionId", job.max_concurrent_jobs as "maxConcurrentJobs" from youtube_discovery_candidate_jobs job where exists (select 1 from youtube_discovery_policy_versions policy where policy.is_current = true and policy.enabled = true) and job.state in ('queued', 'retrying') and job.next_run_at <= clock_timestamp() and not exists (select 1 from youtube_discovery_candidate_jobs active where active.state = 'running' and active.policy_version_id = job.policy_version_id and active.lease_expires_at > clock_timestamp() group by active.policy_version_id having count(*) >= job.max_concurrent_jobs) order by job.next_run_at asc, job.created_at asc for update of job skip locked limit 1`) as Array<{ id: string; policyVersionId: string; maxConcurrentJobs: number }>;
    if (!rows[0]) return { claim: null, recoveredCount: recovery.count, recoveredTerminalCount: recovery.terminalCount, contended: recovery.contended };
    await transaction.execute(sql`select id from youtube_discovery_policy_versions where id = ${rows[0].policyVersionId} for update`);
    const active = await transaction.execute(sql`select count(*)::integer as count from youtube_discovery_candidate_jobs where state = 'running' and policy_version_id = ${rows[0].policyVersionId} and lease_expires_at > clock_timestamp()`) as Array<{ count: number }>;
    if ((active[0]?.count ?? 0) >= rows[0].maxConcurrentJobs) return { claim: null, recoveredCount: recovery.count, recoveredTerminalCount: recovery.terminalCount, contended: true };
    const [claimed] = await transaction.execute(sql`update youtube_discovery_candidate_jobs set state = 'running', claimed_by = ${workerId}, claimed_at = clock_timestamp(), lease_expires_at = clock_timestamp() + ${leaseMs} * interval '1 millisecond', fencing_token = ${fencingToken}, attempt_count = attempt_count + 1, safe_error_code = null, last_safe_stage = null where id = ${rows[0].id} and state in ('queued', 'retrying') and next_run_at <= clock_timestamp() returning id, candidate_id as "candidateId", appearance_id as "appearanceId", run_id as "runId", policy_version_id as "policyVersionId", attempt_count as "attemptCount", next_run_at as "nextRunAt", claimed_at as "claimedAt", lease_expires_at as "leaseExpiresAt"`) as Array<Omit<YoutubeDiscoveryCandidateJobClaim, "fencingToken" | "videoId" | "recoveredCount">>;
    if (!claimed) return { claim: null, recoveredCount: recovery.count, recoveredTerminalCount: recovery.terminalCount, contended: true };
    const [candidate] = await transaction.select({ videoId: youtubeDiscoveryCandidates.videoId }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.id, claimed.candidateId)).limit(1);
    if (!candidate) throw new Error("YouTube Discovery candidate job candidate is missing.");
    return { claim: { ...claimed, nextRunAt: new Date(claimed.nextRunAt), claimedAt: new Date(claimed.claimedAt), leaseExpiresAt: new Date(claimed.leaseExpiresAt), videoId: candidate.videoId, fencingToken, recoveredCount: recovery.count }, recoveredCount: recovery.count, recoveredTerminalCount: recovery.terminalCount, contended: false };
  });
}

export async function recoverExpiredYoutubeDiscoveryCandidateJobs(database: DiscoveryWriter = getDb()) {
  return database.transaction(async (transaction) => {
    const expired = await transaction.execute(sql`select id from youtube_discovery_candidate_jobs where state = 'running' and lease_expires_at <= clock_timestamp() order by lease_expires_at asc for update skip locked limit 20`) as Array<{ id: string }>;
    let count = 0; let terminalCount = 0; let contended = false;
    for (const row of expired) {
      const [job] = await transaction.execute(sql`update youtube_discovery_candidate_jobs job set state = case when not exists (select 1 from youtube_discovery_policy_versions policy where policy.is_current = true and policy.enabled = true) then 'cancelled' when job.attempt_count > job.max_retry_attempts then 'failed' else 'queued' end, claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null, next_run_at = clock_timestamp(), terminal_at = case when not exists (select 1 from youtube_discovery_policy_versions policy where policy.is_current = true and policy.enabled = true) or job.attempt_count > job.max_retry_attempts then clock_timestamp() else null end, terminal_outcome = case when not exists (select 1 from youtube_discovery_policy_versions policy where policy.is_current = true and policy.enabled = true) then 'cancelled' when job.attempt_count > job.max_retry_attempts then 'failed' else null end, safe_error_code = case when not exists (select 1 from youtube_discovery_policy_versions policy where policy.is_current = true and policy.enabled = true) then 'policy_revoked' when job.attempt_count > job.max_retry_attempts then 'lease_retry_exhausted' else null end, incident_category = case when job.attempt_count > job.max_retry_attempts then 'execution_terminal' else null end where job.id = ${row.id} and job.state = 'running' and job.lease_expires_at <= clock_timestamp() returning id, state, attempt_count as "attemptCount", policy_version_id as "policyVersionId", safe_error_code as "safeErrorCode"`) as Array<{ id: string; state: "queued" | "failed" | "cancelled"; attemptCount: number; policyVersionId: string; safeErrorCode: YoutubeDiscoveryCandidateJobSafeErrorCode | null }>;
      if (!job) { contended = true; continue; }
      count += 1; if (job.state !== "queued") { terminalCount += 1; await recordCandidateJobTerminalAudit(transaction, job.id, job.state, job.attemptCount, job.safeErrorCode, job.policyVersionId); }
    }
    return { count, terminalCount, contended };
  });
}

export async function finishYoutubeDiscoveryCandidateJob(claim: YoutubeDiscoveryCandidateJobClaim, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryCandidateJobDisposition> { return transitionYoutubeDiscoveryCandidateJob(claim, "completed", database); }
export async function cancelYoutubeDiscoveryCandidateJobIfDisabled(claim: YoutubeDiscoveryCandidateJobClaim, database: DiscoveryWriter = getDb()): Promise<"active" | "cancelled" | "contended"> {
  const guard = await database.transaction((transaction) => guardYoutubeDiscoveryCandidateWrite(transaction, claim));
  if (typeof guard !== "string") return "active";
  if (guard === "contended") return "contended";
  const outcome = await transitionYoutubeDiscoveryCandidateJob(claim, "cancelled", database);
  return outcome === "cancelled" ? "cancelled" : "contended";
}

export async function retryYoutubeDiscoveryCandidateJob(claim: YoutubeDiscoveryCandidateJobClaim, safeErrorCode: Exclude<YoutubeDiscoveryCandidateJobSafeErrorCode, "retry_exhausted" | "lease_retry_exhausted" | "policy_revoked">, lastSafeStage: "enrichment" | "triage" | "eligibility" | "recommendation", database: DiscoveryWriter = getDb(), incidentCategory: Exclude<YoutubeDiscoveryRunIncidentCategory, "execution_terminal"> | null = null): Promise<YoutubeDiscoveryCandidateJobDisposition> {
  return database.transaction(async (transaction) => {
    const [job] = await transaction.select({ attemptCount: youtubeDiscoveryCandidateJobs.attemptCount, maxRetryAttempts: youtubeDiscoveryCandidateJobs.maxRetryAttempts, retryDelayMinutes: youtubeDiscoveryCandidateJobs.retryDelayMinutes }).from(youtubeDiscoveryCandidateJobs).where(activeCandidateJobClaim(claim)).limit(1).for("update");
    if (!job) return "contended";
    const guard = await guardYoutubeDiscoveryCandidateWrite(transaction, claim);
    const outcome: YoutubeDiscoveryCandidateJobDisposition = guard === "cancelled" ? "cancelled" : guard === "contended" ? "contended" : isYoutubeDiscoveryRetryExhausted(job.attemptCount, job.maxRetryAttempts) ? "failed" : "retrying";
    if (outcome === "contended") return outcome;
    const error = outcome === "cancelled" ? "policy_revoked" : outcome === "failed" && safeErrorCode === "stage_transient" ? "retry_exhausted" : safeErrorCode;
    const category = outcome === "cancelled" ? null : outcome === "failed" ? incidentCategory ?? "execution_terminal" : incidentCategory;
    const [updated] = await transaction.update(youtubeDiscoveryCandidateJobs).set({ state: outcome, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: outcome === "retrying" ? sql`clock_timestamp() + ${getYoutubeDiscoveryRetryDelayMinutes(job.retryDelayMinutes, job.attemptCount)} * interval '1 minute'` : sql`clock_timestamp()`, terminalAt: outcome === "retrying" ? null : sql`clock_timestamp()`, terminalOutcome: outcome === "retrying" ? null : outcome, safeErrorCode: error, incidentCategory: category, lastSafeStage }).where(activeCandidateJobClaim(claim)).returning({ id: youtubeDiscoveryCandidateJobs.id });
    if (updated && outcome !== "retrying") await recordCandidateJobTerminalAudit(transaction, updated.id, outcome, job.attemptCount, error, claim.policyVersionId);
    return updated ? outcome : "contended";
  });
}

async function transitionYoutubeDiscoveryCandidateJob(claim: YoutubeDiscoveryCandidateJobClaim, requested: "completed" | "cancelled", database: DiscoveryWriter): Promise<YoutubeDiscoveryCandidateJobDisposition> {
  return database.transaction(async (transaction) => {
    const guard = await guardYoutubeDiscoveryCandidateWrite(transaction, claim);
    if (guard === "contended") return "contended";
    const outcome = guard === "cancelled" ? "cancelled" : requested;
    const [updated] = await transaction.update(youtubeDiscoveryCandidateJobs).set({ state: outcome, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, terminalAt: sql`clock_timestamp()`, terminalOutcome: outcome, safeErrorCode: outcome === "cancelled" ? "policy_revoked" : null, incidentCategory: null }).where(activeCandidateJobClaim(claim)).returning({ id: youtubeDiscoveryCandidateJobs.id });
    if (updated) { if (outcome === "completed") await finalizeYoutubeDiscoveryForeignFallback(transaction, updated.id); await recordCandidateJobTerminalAudit(transaction, updated.id, outcome, claim.attemptCount, outcome === "cancelled" ? "policy_revoked" : null, claim.policyVersionId); }
    return updated ? outcome : "contended";
  });
}

/** The final terminal job serializes the run-local fallback decision behind its run lock. */
async function finalizeYoutubeDiscoveryForeignFallback(transaction: DiscoveryWriter, jobId: string) {
  const [job] = await transaction.execute(sql`select run_id as "runId", policy_version_id as "policyVersionId" from youtube_discovery_candidate_jobs where id = ${jobId} and state = 'completed'`) as Array<{ runId: string; policyVersionId: string }>;
  if (!job) return;
  const [run] = await transaction.execute(sql`select run.query_proposal_id as "queryProposalId" from youtube_discovery_runs run join youtube_discovery_query_proposals proposal on proposal.id = run.query_proposal_id and proposal.enabled = true where run.id = ${job.runId} for update of run`) as Array<{ queryProposalId: string | null }>;
  if (!run?.queryProposalId) return;
  const [policy] = await transaction.execute(sql`select language_classifier_version as "languageClassifierVersion", allow_foreign_fallback as "allowForeignFallback" from youtube_discovery_policy_versions where id = ${job.policyVersionId} and is_current = true and enabled = true for update`) as Array<{ languageClassifierVersion: number; allowForeignFallback: boolean }>;
  if (policy?.languageClassifierVersion !== 1 || !policy.allowForeignFallback) return;
  const [unfinished] = await transaction.execute(sql`select 1 as one from youtube_discovery_candidate_jobs where run_id = ${job.runId} and state <> 'completed' limit 1`) as Array<{ one: number }>;
  if (unfinished) return;
  const [qualified] = await transaction.execute(sql`select 1 as one from youtube_discovery_appearances where run_id = ${job.runId} and duration_fit = 'eligible' and language_fit in ('vi', 'likely_vi') limit 1`) as Array<{ one: number }>;
  if (qualified) return;
  const updated = await transaction.execute(sql`update youtube_discovery_appearances set eligibility_reason = 'foreign_fallback' where run_id = ${job.runId} and duration_fit = 'eligible' and language_fit in ('unknown', 'non_vi') and eligibility_reason in ('language_unknown', 'non_vietnamese') returning id`) as Array<{ id: string }>;
  if (updated.length) await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "update", targetType: "youtube_discovery_foreign_fallback", targetId: job.runId, afterSummary: JSON.stringify({ policyVersionId: job.policyVersionId, fallbackCount: updated.length }) }, transaction);
}

export async function recoverExpiredYoutubeDiscoveryRuns(database: DiscoveryWriter = getDb()) {
  return database.transaction(async (transaction) => {
    const expired = await transaction.execute(sql`select id from youtube_discovery_runs where state = 'running' and lease_expires_at <= clock_timestamp() order by lease_expires_at asc for update skip locked limit 20`) as Array<{ id: string }>;
    let count = 0;
    let terminalCount = 0;
    let contended = false;
    for (const row of expired) {
      const revoked = sql`not exists (select 1 from youtube_discovery_policy_versions current_policy where current_policy.is_current = true and current_policy.enabled = true and current_policy.id = ${youtubeDiscoveryRuns.policyVersionId})`;
      const [run] = await transaction.update(youtubeDiscoveryRuns).set({ state: sql`case when ${revoked} then 'cancelled' when ${youtubeDiscoveryRuns.attemptCount} > ${youtubeDiscoveryRuns.maxRetryAttempts} then 'failed' else 'queued' end`, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: sql`clock_timestamp()`, terminalAt: sql`case when ${revoked} or ${youtubeDiscoveryRuns.attemptCount} > ${youtubeDiscoveryRuns.maxRetryAttempts} then clock_timestamp() else null end`, terminalOutcome: sql`case when ${revoked} then 'cancelled' when ${youtubeDiscoveryRuns.attemptCount} > ${youtubeDiscoveryRuns.maxRetryAttempts} then 'failed' else null end`, safeErrorCode: sql`case when ${revoked} then 'policy_revoked' when ${youtubeDiscoveryRuns.attemptCount} > ${youtubeDiscoveryRuns.maxRetryAttempts} then 'lease_retry_exhausted' else null end`, incidentCategory: sql`case when ${revoked} then null when ${youtubeDiscoveryRuns.attemptCount} > ${youtubeDiscoveryRuns.maxRetryAttempts} then coalesce(${youtubeDiscoveryRuns.incidentCategory}, 'execution_terminal') else ${youtubeDiscoveryRuns.incidentCategory} end` }).where(and(eq(youtubeDiscoveryRuns.id, row.id), eq(youtubeDiscoveryRuns.state, "running"), sql`${youtubeDiscoveryRuns.leaseExpiresAt} <= clock_timestamp()`)).returning();
      if (!run) { contended = true; continue; }
      count += 1;
      if (run.state === "cancelled") { terminalCount += 1; await recordTerminalAudit(transaction, run.id, "cancelled", run.attemptCount, "policy_revoked", run.policyVersionId); }
      else if (run.state === "failed") { terminalCount += 1; await recordTerminalAudit(transaction, run.id, "failed", run.attemptCount, "lease_retry_exhausted", run.policyVersionId); }
    }
    return { count, terminalCount, contended };
  });
}

export async function finishYoutubeDiscoveryRun(claim: YoutubeDiscoveryRunClaim, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryRunDisposition> {
  return database.transaction(async (transaction) => {
    const [run] = await transaction.select({ id: youtubeDiscoveryRuns.id, attemptCount: youtubeDiscoveryRuns.attemptCount, policyVersionId: youtubeDiscoveryRuns.policyVersionId }).from(youtubeDiscoveryRuns).where(activeClaim(claim)).limit(1).for("update");
    if (!run) return "contended";
    const [currentPolicy] = await transaction.select({ id: youtubeDiscoveryPolicyVersions.id, enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    const [proposal] = await transaction.execute(sql`select enabled from youtube_discovery_query_proposals where id = (select query_proposal_id from youtube_discovery_runs where id = ${run.id}) for update`) as Array<{ enabled: boolean }>;
    const outcome = currentPolicy?.enabled && currentPolicy.id === run.policyVersionId && proposal?.enabled !== false ? "completed" : "cancelled";
    const safeErrorCode = outcome === "cancelled" ? "policy_revoked" : null;
    const [updated] = await transaction.update(youtubeDiscoveryRuns).set({ state: outcome, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, terminalAt: sql`clock_timestamp()`, terminalOutcome: outcome, safeErrorCode }).where(activeClaim(claim)).returning();
    if (!updated) return "contended";
    await recordTerminalAudit(transaction, updated.id, outcome, updated.attemptCount, safeErrorCode, run.policyVersionId);
    return outcome;
  });
}

export async function cancelYoutubeDiscoveryRunIfDisabled(claim: YoutubeDiscoveryRunClaim, database: DiscoveryWriter = getDb(), requireProposal = false): Promise<"active" | "cancelled" | "contended"> {
  return database.transaction(async (transaction) => {
    const [run] = await transaction.select({ id: youtubeDiscoveryRuns.id, attemptCount: youtubeDiscoveryRuns.attemptCount, policyVersionId: youtubeDiscoveryRuns.policyVersionId }).from(youtubeDiscoveryRuns).where(activeClaim(claim)).limit(1).for("update");
    if (!run) return "contended";
    const [currentPolicy] = await transaction.select({ id: youtubeDiscoveryPolicyVersions.id, enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    const [proposal] = await transaction.execute(sql`select enabled from youtube_discovery_query_proposals where id = (select query_proposal_id from youtube_discovery_runs where id = ${run.id}) for update`) as Array<{ enabled: boolean }>;
    if (currentPolicy?.enabled && currentPolicy.id === run.policyVersionId && (proposal?.enabled === true || !requireProposal && proposal === undefined)) return "active";
    const [updated] = await transaction.update(youtubeDiscoveryRuns).set({ state: "cancelled", claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, terminalAt: sql`clock_timestamp()`, terminalOutcome: "cancelled", safeErrorCode: "policy_revoked" }).where(activeClaim(claim)).returning();
    if (!updated) return "contended";
    await recordTerminalAudit(transaction, updated.id, "cancelled", updated.attemptCount, "policy_revoked", run.policyVersionId);
    return "cancelled";
  });
}

export async function getYoutubeDiscoveryRunQuery(claim: YoutubeDiscoveryRunClaim, database: DiscoveryWriter = getDb()): Promise<{ queryText: string } | "cancelled" | "contended"> {
  return database.transaction(async (transaction) => {
    const rows = await transaction.execute(sql`select run.query_text as "queryText", proposal.enabled as "proposalEnabled", policy.is_current as "policyCurrent", policy.enabled as "policyEnabled" from youtube_discovery_runs run left join youtube_discovery_query_proposals proposal on proposal.id = run.query_proposal_id join youtube_discovery_policy_versions policy on policy.id = run.policy_version_id where run.id = ${claim.id} and run.state = 'running' and run.fencing_token = ${claim.fencingToken} and run.lease_expires_at > clock_timestamp()`) as Array<{ queryText: string | null; proposalEnabled: boolean | null; policyCurrent: boolean; policyEnabled: boolean }>;
    const run = rows[0];
    if (!run) return "contended";
    if (!run.policyCurrent || !run.policyEnabled || !run.proposalEnabled || !run.queryText) return "cancelled";
    return { queryText: run.queryText };
  });
}

export async function persistYoutubeDiscoveryCandidates(claim: YoutubeDiscoveryRunClaim, candidates: readonly YoutubeDiscoverySearchCandidate[], database: DiscoveryWriter = getDb()): Promise<"completed" | "cancelled" | "contended"> {
  assertYoutubeDiscoverySearchCandidates(candidates);
  try {
    return await database.transaction<"completed">(async (transaction) => {
      const requireGuard = async () => {
        const guard = await guardYoutubeDiscoveryCandidateWrite(transaction, claim);
        if (typeof guard === "string") throw new CandidateWriteAborted(guard);
        return guard;
      };
      await requireGuard();
      for (const candidate of candidates) {
        await requireGuard();
        const [stored] = await transaction.execute(sql`insert into youtube_discovery_candidates (id, video_id, canonical_url, updated_at) values (${crypto.randomUUID()}, ${candidate.videoId}, ${candidate.canonicalUrl}, clock_timestamp()) on conflict (video_id) do update set updated_at = excluded.updated_at returning id`) as Array<{ id: string }>;
        await requireGuard();
        const [appearance] = await transaction.execute(sql`insert into youtube_discovery_appearances (id, candidate_id, run_id, result_ordinal, search_tranche, discovered_at) values (${crypto.randomUUID()}, ${stored!.id}, ${claim.id}, ${candidate.resultOrdinal}, ${candidate.searchTranche}, clock_timestamp()) on conflict (run_id, candidate_id) do nothing returning id`) as Array<{ id: string }>;
        if (appearance) {
          const historyGuard = await requireGuard();
          // The appearance and its downstream work are admitted in one fenced
          // transaction, so a completed search run cannot strand a candidate.
          await transaction.execute(sql`insert into youtube_discovery_candidate_jobs (id, candidate_id, appearance_id, run_id, policy_version_id, state, next_run_at, max_retry_attempts, retry_delay_minutes, max_concurrent_jobs) select ${crypto.randomUUID()}, ${stored!.id}, ${appearance.id}, ${claim.id}, ${historyGuard.policyVersionId}, 'queued', clock_timestamp(), run.max_retry_attempts, run.retry_delay_minutes, run.max_concurrent_runs from youtube_discovery_runs run where run.id = ${claim.id} on conflict (appearance_id) do nothing`);
          await transaction.execute(sql`insert into youtube_discovery_ranking_history (id, candidate_id, appearance_id, run_id, policy_version_id, stage, created_at) values (${crypto.randomUUID()}, ${stored!.id}, ${appearance.id}, ${claim.id}, ${historyGuard.policyVersionId}, 'discovered', clock_timestamp())`);
          // Trimming is a graph write too, so it must remain fenced.
          await requireGuard();
          await transaction.execute(sql`delete from youtube_discovery_ranking_history where id in (select id from youtube_discovery_ranking_history where candidate_id = ${stored!.id} and stage <> 'recommended' order by created_at desc, id desc offset 20)`);
        }
      }
      await requireGuard();
      return "completed";
    });
  } catch (error) {
    if (!(error instanceof CandidateWriteAborted)) throw error;
    // The sentinel rolls back every candidate-graph write. Cancellation itself
    // must be committed separately so its terminal audit is retained exactly once.
    return error.outcome === "cancelled" ? (await cancelYoutubeDiscoveryRunIfDisabled(claim, database)) === "cancelled" ? "cancelled" : "contended" : "contended";
  }
}

function assertYoutubeDiscoverySearchCandidates(candidates: readonly YoutubeDiscoverySearchCandidate[]) {
  const seen = new Set<string>();
  let mediumCount = 0;
  let longCount = 0;
  let encounteredLong = false;
  if (candidates.length > 50) throw new Error("Invalid YouTube Discovery search candidates.");
  for (const [index, candidate] of candidates.entries()) {
    const canonical = canonicalizeYoutubeVideoUrl(candidate.canonicalUrl);
    if (!canonical || candidate.videoId !== canonical.videoId || candidate.resultOrdinal !== index || (candidate.searchTranche !== "medium" && candidate.searchTranche !== "long") || seen.has(candidate.videoId)) throw new Error("Invalid YouTube Discovery search candidates.");
    if (candidate.searchTranche === "long") { encounteredLong = true; longCount += 1; }
    else { if (encounteredLong) throw new Error("Invalid YouTube Discovery search candidates."); mediumCount += 1; }
    if (mediumCount > 25 || longCount > 25) throw new Error("Invalid YouTube Discovery search candidates.");
    seen.add(candidate.videoId);
  }
}

export async function persistYoutubeDiscoveryEnrichment(claim: YoutubeDiscoveryCandidateWorkClaim, enrichment: YoutubeDiscoveryEnrichment, database: DiscoveryWriter = getDb()): Promise<"completed" | "cancelled" | "contended"> {
  assertSafeYoutubeDiscoveryEnrichment(enrichment);
  try {
    return await database.transaction(async (transaction) => {
      const guard = await guardYoutubeDiscoveryCandidateWrite(transaction, claim);
      if (typeof guard === "string") throw new CandidateWriteAborted(guard);
      if (isYoutubeDiscoveryCandidateJobClaim(claim) && enrichment.videoId !== claim.videoId) return "contended";
      const [candidate] = await transaction.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates).where(isYoutubeDiscoveryCandidateJobClaim(claim) ? and(eq(youtubeDiscoveryCandidates.id, claim.candidateId), eq(youtubeDiscoveryCandidates.videoId, claim.videoId)) : eq(youtubeDiscoveryCandidates.videoId, enrichment.videoId)).limit(1).for("update");
      if (!candidate) return "contended";
      const current = await guardYoutubeDiscoveryCandidateWrite(transaction, claim);
      if (typeof current === "string") throw new CandidateWriteAborted(current);
      const [appearance] = await transaction.select({ id: youtubeDiscoveryAppearances.id }).from(youtubeDiscoveryAppearances).where(isYoutubeDiscoveryCandidateJobClaim(claim) ? and(eq(youtubeDiscoveryAppearances.id, claim.appearanceId), eq(youtubeDiscoveryAppearances.candidateId, candidate.id), eq(youtubeDiscoveryAppearances.runId, claim.runId)) : and(eq(youtubeDiscoveryAppearances.candidateId, candidate.id), eq(youtubeDiscoveryAppearances.runId, claim.id))).limit(1);
      if (!appearance) return "contended";
      const appearanceMetadata = { title: enrichment.title, description: enrichment.description, channelId: enrichment.channelId, channelName: enrichment.channelName, publishedAt: enrichment.publishedAt, durationSeconds: enrichment.durationSeconds, defaultLanguage: enrichment.defaultLanguage, defaultAudioLanguage: enrichment.defaultAudioLanguage, categoryId: enrichment.categoryId, tags: enrichment.tags, viewCount: enrichment.viewCount, likeCount: enrichment.likeCount, commentCount: enrichment.commentCount, channelSubscriberCount: enrichment.channelSubscriberCount, thumbnailUrl: enrichment.thumbnailUrl };
      if (Object.values(appearanceMetadata).some((value) => value !== undefined)) await transaction.update(youtubeDiscoveryAppearances).set(appearanceMetadata).where(eq(youtubeDiscoveryAppearances.id, appearance.id));
      // Upsert only this job's immutable run/candidate signal keys. Retries neither
      // delete siblings nor duplicate their own aggregates.
      if (!isYoutubeDiscoveryCandidateJobClaim(claim)) await transaction.delete(youtubeDiscoveryCommentSignals).where(and(eq(youtubeDiscoveryCommentSignals.candidateId, candidate.id), eq(youtubeDiscoveryCommentSignals.runId, claim.id)));
      for (const signal of enrichment.signals) await transaction.execute(sql`insert into youtube_discovery_comment_signals (id, candidate_id, run_id, policy_version_id, signal, count, score, derived_at, expires_at) values (${crypto.randomUUID()}, ${candidate.id}, ${workRunId(claim)}, ${current.policyVersionId}, ${signal.signal}, ${signal.count}, ${signal.score}, clock_timestamp(), clock_timestamp() + (select comment_signal_ttl_days from youtube_discovery_policy_versions where id = ${current.policyVersionId}) * interval '1 day') on conflict (run_id, candidate_id, signal) do update set policy_version_id = excluded.policy_version_id, count = excluded.count, score = excluded.score, derived_at = excluded.derived_at, expires_at = excluded.expires_at`);
      await transaction.insert(youtubeDiscoveryRankingHistory).values({ id: crypto.randomUUID(), candidateId: candidate.id, appearanceId: appearance.id, runId: workRunId(claim), policyVersionId: current.policyVersionId, stage: "enriched", createdAt: sql`clock_timestamp()` });
      if (!isYoutubeDiscoveryCandidateJobClaim(claim)) await transaction.execute(sql`delete from youtube_discovery_ranking_history where id in (select id from youtube_discovery_ranking_history where candidate_id = ${candidate.id} and stage <> 'recommended' order by created_at desc, id desc offset 20)`);
      const finalGuard = await guardYoutubeDiscoveryCandidateWrite(transaction, claim);
      if (typeof finalGuard === "string") throw new CandidateWriteAborted(finalGuard);
      return "completed";
    });
  } catch (error) {
    if (!(error instanceof CandidateWriteAborted)) throw error;
    return error.outcome === "cancelled" ? await cancelCandidateWork(claim, database) : "contended";
  }
}

export async function persistYoutubeDiscoveryEligibility(claim: YoutubeDiscoveryCandidateJobClaim, metadata: Omit<YoutubeDiscoveryEnrichment, "signals" | "channelSubscriberCount">, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryEligibility | "cancelled" | "contended"> {
  try { return await database.transaction(async (transaction) => {
    const guard = await guardYoutubeDiscoveryCandidateWrite(transaction, claim); if (typeof guard === "string") throw new CandidateWriteAborted(guard);
    if (metadata.videoId !== claim.videoId) return "contended" as const;
    const [policyRow] = await transaction.select().from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.id, guard.policyVersionId)).limit(1).for("update");
    if (!policyRow) return "contended" as const;
    const policy = parseYoutubeDiscoveryPolicy({ enabled: policyRow.enabled, queryBuilderVersion: policyRow.queryBuilderVersion, languageClassifierVersion: policyRow.languageClassifierVersion, minimumUsefulDurationSeconds: policyRow.minimumUsefulDurationSeconds, allowForeignFallback: policyRow.allowForeignFallback, minimumCandidateScore: policyRow.minimumCandidateScore, priorityScoreWeight: policyRow.priorityScoreWeight, freshnessScoreWeight: policyRow.freshnessScoreWeight, relevanceWeight: Number(policyRow.relevanceWeight), expectedValueWeight: Number(policyRow.expectedValueWeight), freshnessFitWeight: Number(policyRow.freshnessFitWeight), commercialRiskWeight: Number(policyRow.commercialRiskWeight), duplicateRiskWeight: Number(policyRow.duplicateRiskWeight), deferMinimum: Number(policyRow.deferMinimum), considerMinimum: Number(policyRow.considerMinimum), cadenceMinutes: policyRow.cadenceMinutes, retentionDays: policyRow.retentionDays, commentSignalTtlDays: policyRow.commentSignalTtlDays, maxConcurrentRuns: policyRow.maxConcurrentRuns, maxRetryAttempts: policyRow.maxRetryAttempts, retryDelayMinutes: policyRow.retryDelayMinutes, candidateBacklogThreshold: policyRow.candidateBacklogThreshold, actionQueueHighPriorityMaximum: policyRow.actionQueueHighPriorityMaximum, actionQueueMaximumOperatorReviewAgeHours: policyRow.actionQueueMaximumOperatorReviewAgeHours, actionQueueMaximumMissionStallHours: policyRow.actionQueueMaximumMissionStallHours, actionQueuePersistentIncidentFailureCount: policyRow.actionQueuePersistentIncidentFailureCount, actionQueuePersistentIncidentWindowHours: policyRow.actionQueuePersistentIncidentWindowHours });
    assertSafeYoutubeDiscoveryMetadata(metadata);
    const [existing] = await transaction.select({ languageFit: youtubeDiscoveryAppearances.languageFit, durationFit: youtubeDiscoveryAppearances.durationFit, eligibilityReason: youtubeDiscoveryAppearances.eligibilityReason }).from(youtubeDiscoveryAppearances).where(and(eq(youtubeDiscoveryAppearances.id, claim.appearanceId), eq(youtubeDiscoveryAppearances.candidateId, claim.candidateId), eq(youtubeDiscoveryAppearances.runId, claim.runId))).limit(1).for("update");
    if (!existing) return "contended" as const;
    if (existing.languageFit && existing.durationFit && existing.eligibilityReason) return { languageFit: existing.languageFit, durationFit: existing.durationFit, reason: existing.eligibilityReason, primaryEligible: existing.eligibilityReason === "eligible_vietnamese" };
    const eligibility = policy.languageClassifierVersion === 0 ? null : evaluateYoutubeDiscoveryEligibility(policy, metadata);
    const [updated] = await transaction.update(youtubeDiscoveryAppearances).set({ title: metadata.title, description: metadata.description, channelId: metadata.channelId, channelName: metadata.channelName, publishedAt: metadata.publishedAt, durationSeconds: metadata.durationSeconds, defaultLanguage: metadata.defaultLanguage, defaultAudioLanguage: metadata.defaultAudioLanguage, categoryId: metadata.categoryId, tags: metadata.tags, viewCount: metadata.viewCount, likeCount: metadata.likeCount, commentCount: metadata.commentCount, thumbnailUrl: metadata.thumbnailUrl, ...(eligibility ? { queryBuilderVersion: policy.queryBuilderVersion, languageFit: eligibility.languageFit, durationFit: eligibility.durationFit, eligibilityReason: eligibility.reason, languageClassifierVersion: policy.languageClassifierVersion, minimumUsefulDurationSeconds: policy.minimumUsefulDurationSeconds } : {}) }).where(eq(youtubeDiscoveryAppearances.id, claim.appearanceId)).returning({ id: youtubeDiscoveryAppearances.id });
    if (!updated) return "contended" as const;
    const final = await guardYoutubeDiscoveryCandidateWrite(transaction, claim); if (typeof final === "string") throw new CandidateWriteAborted(final);
    return eligibility ?? { languageFit: "unknown", durationFit: "eligible", reason: "eligible_vietnamese", primaryEligible: true };
  }); } catch (error) { if (!(error instanceof CandidateWriteAborted)) throw error; return error.outcome === "cancelled" ? await cancelCandidateWork(claim, database) : "contended"; }
}

function assertSafeYoutubeDiscoveryEnrichment(enrichment: YoutubeDiscoveryEnrichment) {
  const safeText = (value: string | undefined, maximum: number) => value === undefined || value.trim() === value && value.length > 0 && value.length <= maximum && !/[\x00-\x1F\x7F]/.test(value);
  if (!safeText(enrichment.title, 200) || !safeText(enrichment.description, 1000) || !safeText(enrichment.channelName, 160) || enrichment.tags && (enrichment.tags.length > 20 || enrichment.tags.some((tag) => !safeText(tag, 80)) || enrichment.tags.join("").length > 1600 || new Set(enrichment.tags).size !== enrichment.tags.length)) throw new Error("YouTube Discovery enrichment metadata is invalid.");
}

function assertSafeYoutubeDiscoveryMetadata(metadata: Omit<YoutubeDiscoveryEnrichment, "signals" | "channelSubscriberCount">) {
  assertSafeYoutubeDiscoveryEnrichment({ ...metadata, signals: [] });
  const language = (value: string | undefined) => value === undefined || /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(value);
  const date = metadata.publishedAt === undefined || metadata.publishedAt instanceof Date && !Number.isNaN(metadata.publishedAt.getTime());
  const integer = (value: number | undefined) => value === undefined || Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
  const duration = metadata.durationSeconds === undefined || Number.isSafeInteger(metadata.durationSeconds) && metadata.durationSeconds >= 0 && metadata.durationSeconds <= 86_400;
  const channelId = metadata.channelId === undefined || /^[A-Za-z0-9_-]{6,64}$/.test(metadata.channelId);
  const categoryId = metadata.categoryId === undefined || /^\d{1,8}$/.test(metadata.categoryId);
  const thumbnail = metadata.thumbnailUrl === undefined || /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\/[^\s]{1,500}$/.test(metadata.thumbnailUrl) && !/[\x00-\x1F\x7F]/.test(metadata.thumbnailUrl);
  if (!language(metadata.defaultLanguage) || !language(metadata.defaultAudioLanguage) || !date || !duration || !channelId || !categoryId || !thumbnail || !integer(metadata.viewCount) || !integer(metadata.likeCount) || !integer(metadata.commentCount)) throw new Error("YouTube Discovery enrichment metadata is invalid.");
}

export function parseYoutubeDiscoveryTriageAssessment(value: unknown, allowedSignals: readonly YoutubeDiscoveryCommentSignal[]): YoutubeDiscoveryTriageAssessment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "commercialRiskScore,duplicateRiskScore,expectedValueScore,freshnessFitScore,relevanceScore,signals") return null;
  const score = (key: string) => typeof record[key] === "number" && Number.isFinite(record[key]) && record[key] >= 0 && record[key] <= 1 ? record[key] : null;
  const scores = [score("relevanceScore"), score("expectedValueScore"), score("freshnessFitScore"), score("commercialRiskScore"), score("duplicateRiskScore")];
  if (scores.some((item) => item === null) || !Array.isArray(record.signals) || record.signals.length > 6) return null;
  const signals = record.signals;
  if (!signals.every((signal): signal is YoutubeDiscoveryCommentSignal => typeof signal === "string" && (youtubeDiscoveryCommentSignalValues as readonly string[]).includes(signal) && allowedSignals.includes(signal as YoutubeDiscoveryCommentSignal)) || new Set(signals).size !== signals.length) return null;
  return { relevanceScore: scores[0]!, expectedValueScore: scores[1]!, freshnessFitScore: scores[2]!, commercialRiskScore: scores[3]!, duplicateRiskScore: scores[4]!, signals };
}

export async function getYoutubeDiscoveryTriageBundle(claim: YoutubeDiscoveryCandidateWorkClaim, videoId: string, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryTriageBundle | "succeeded" | "cancelled" | "contended"> {
  let failurePoint: YoutubeDiscoveryTriageBundleFailurePoint = "triage_bundle_guard";
  try { return await database.transaction(async (transaction) => {
    const guard = await guardYoutubeDiscoveryCandidateWrite(transaction, claim);
    if (typeof guard === "string") return guard;
    failurePoint = "triage_bundle_candidate_lookup";
    const [row] = await transaction.execute(sql`select candidate.id as "candidateId", appearance.id as "appearanceId", run.query_text as "queryText", candidate.video_id as "videoId", appearance.title as title, appearance.channel_name as "channelName", appearance.published_at as "publishedAt", appearance.duration_seconds as "durationSeconds", appearance.category_id as "categoryId", appearance.view_count as "viewCount", appearance.like_count as "likeCount", appearance.comment_count as "commentCount", appearance.channel_subscriber_count as "channelSubscriberCount" from youtube_discovery_candidates candidate join youtube_discovery_appearances appearance on appearance.candidate_id = candidate.id and appearance.run_id = ${workRunId(claim)} join youtube_discovery_runs run on run.id = appearance.run_id where candidate.video_id = ${videoId} and (${isYoutubeDiscoveryCandidateJobClaim(claim) ? sql`appearance.id = ${claim.appearanceId} and candidate.id = ${claim.candidateId}` : sql`true`}) for update`) as Array<{ candidateId: string; appearanceId: string; queryText: string | null; videoId: string; title: string | null; channelName: string | null; publishedAt: Date | null; durationSeconds: number | null; categoryId: string | null; viewCount: number | null; likeCount: number | null; commentCount: number | null; channelSubscriberCount: number | null }>;
    if (!row) return "contended";
    failurePoint = "triage_bundle_existing_lookup";
    const [existing] = await transaction.select({ id: youtubeDiscoveryTriages.id }).from(youtubeDiscoveryTriages).where(and(eq(youtubeDiscoveryTriages.candidateId, row.candidateId), eq(youtubeDiscoveryTriages.runId, workRunId(claim)), eq(youtubeDiscoveryTriages.promptVersion, aiUsagePromptVersions.youtubeDiscoveryTriage), eq(youtubeDiscoveryTriages.status, "succeeded"))).limit(1);
    if (existing) return "succeeded";
    failurePoint = "triage_bundle_signals_lookup";
    const signals = await transaction.select({ signal: youtubeDiscoveryCommentSignals.signal, count: youtubeDiscoveryCommentSignals.count, score: youtubeDiscoveryCommentSignals.score }).from(youtubeDiscoveryCommentSignals).where(and(eq(youtubeDiscoveryCommentSignals.candidateId, row.candidateId), eq(youtubeDiscoveryCommentSignals.runId, workRunId(claim)), sql`${youtubeDiscoveryCommentSignals.expiresAt} > clock_timestamp()`)).orderBy(youtubeDiscoveryCommentSignals.signal).limit(6);
    failurePoint = "triage_bundle_serialize";
    if (row.queryText === null) return "contended";
    return { candidateId: row.candidateId, queryText: row.queryText, candidate: { videoId: row.videoId, title: row.title, channelName: row.channelName, publishedAt: toIsoTimestamp(row.publishedAt), durationSeconds: row.durationSeconds, categoryId: row.categoryId, viewCount: row.viewCount, likeCount: row.likeCount, commentCount: row.commentCount, channelSubscriberCount: row.channelSubscriberCount }, signals };
  }); } catch (error) { throw new YoutubeDiscoveryTriageBundleReadError(failurePoint, triageBundleFailureDetail(error)); }
}

function triageBundleFailureDetail(error: unknown): YoutubeDiscoveryTriageBundleFailureDetail {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "40001") return "database_serialization";
  if (code === "40P01") return "database_deadlock";
  if (code === "55P03") return "database_lock_timeout";
  if (code === "57014") return "database_statement_timeout";
  return "database_other";
}

function toIsoTimestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(`${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function selectYoutubeDiscoveryTriageModel(database: DiscoveryWriter = getDb()) {
  return selectActiveAiGatewayModel({ purpose: "youtube_discovery_triage", requiredCapabilities: { textInput: true, extraction: true }, db: database });
}

type YoutubeDiscoveryTriagePersistenceInput = Readonly<{ candidateId: string; provider: string; modelName: string; latencyMs: number | null; errorCode?: string; promptTokens?: number | null; completionTokens?: number | null; totalTokens?: number | null; cachedPromptTokens?: number | null; cacheWritePromptTokens?: number | null; providerRequestId?: string | null }> & (
  Readonly<{ status: "succeeded"; assessment: YoutubeDiscoveryTriageAssessment; model: SelectedAiGatewayModel }>
  | Readonly<{ status: "no_eligible_model" | "gateway_failed" | "invalid_output"; assessment?: never; model: SelectedAiGatewayModel | null }>
);

export async function persistYoutubeDiscoveryTriage(claim: YoutubeDiscoveryCandidateWorkClaim, input: YoutubeDiscoveryTriagePersistenceInput, database: DiscoveryWriter = getDb()): Promise<"completed" | "cancelled" | "contended"> {
  try { return await database.transaction(async (transaction) => {
    const guard = await guardYoutubeDiscoveryCandidateWrite(transaction, claim);
    if (typeof guard === "string") throw new CandidateWriteAborted(guard);
    const [appearance] = await transaction.select({ id: youtubeDiscoveryAppearances.id }).from(youtubeDiscoveryAppearances).where(candidateWorkAppearance(claim, input.candidateId)).limit(1).for("update");
    if (!appearance) return "contended" as const;
    const [existing] = await transaction.select({ id: youtubeDiscoveryTriages.id }).from(youtubeDiscoveryTriages).where(and(eq(youtubeDiscoveryTriages.candidateId, input.candidateId), eq(youtubeDiscoveryTriages.runId, workRunId(claim)), eq(youtubeDiscoveryTriages.promptVersion, aiUsagePromptVersions.youtubeDiscoveryTriage), eq(youtubeDiscoveryTriages.status, "succeeded"))).limit(1);
    if (existing) return "completed" as const;
    const succeeded = input.status === "succeeded" && isValidYoutubeDiscoveryTriageAssessment(input.assessment);
    const status = input.status === "succeeded" ? succeeded ? "succeeded" : "invalid_output" : input.status;
    const assessment = succeeded ? input.assessment : undefined;
    const usageEventId = await writeAiUsageEvent(transaction, { executorSystem: "system-youtube-discovery", youtubeDiscoveryRunId: workRunId(claim), purpose: aiUsagePurposes.youtubeDiscoveryTriage, provider: input.provider, model: input.modelName, aiGatewayModelId: input.model?.id ?? null, promptVersion: aiUsagePromptVersions.youtubeDiscoveryTriage, status: succeeded ? "success" : "failure", latencyMs: input.latencyMs, promptTokens: input.promptTokens, completionTokens: input.completionTokens, totalTokens: input.totalTokens, cachedPromptTokens: input.cachedPromptTokens, cacheWritePromptTokens: input.cacheWritePromptTokens, pricingSnapshot: input.model ? getAiGatewayPricingSnapshot(input.model) : null, errorCode: succeeded ? input.errorCode ?? null : input.errorCode ?? (status === "no_eligible_model" ? "no_eligible_model" : "invalid_output"), providerRequestId: input.providerRequestId ?? null });
    if (!assessment) await transaction.execute(sql`insert into youtube_discovery_triages (id, candidate_id, appearance_id, run_id, policy_version_id, prompt_version, status, ai_gateway_model_id, usage_event_id, created_at, updated_at) values (${crypto.randomUUID()}, ${input.candidateId}, ${appearance.id}, ${workRunId(claim)}, ${guard.policyVersionId}, ${aiUsagePromptVersions.youtubeDiscoveryTriage}, ${status}, ${input.model?.id ?? null}, ${usageEventId}, clock_timestamp(), clock_timestamp()) on conflict (candidate_id, run_id, prompt_version) do update set status = excluded.status, ai_gateway_model_id = excluded.ai_gateway_model_id, usage_event_id = excluded.usage_event_id, updated_at = excluded.updated_at`);
    else {
      const signals = `{${assessment.signals.join(",")}}`;
      const [triage] = await transaction.execute(sql`insert into youtube_discovery_triages (id, candidate_id, appearance_id, run_id, policy_version_id, prompt_version, status, relevance_score, expected_value_score, freshness_fit_score, commercial_risk_score, duplicate_risk_score, signals, ai_gateway_model_id, usage_event_id, created_at, updated_at) values (${crypto.randomUUID()}, ${input.candidateId}, ${appearance.id}, ${workRunId(claim)}, ${guard.policyVersionId}, ${aiUsagePromptVersions.youtubeDiscoveryTriage}, 'succeeded', ${assessment.relevanceScore}, ${assessment.expectedValueScore}, ${assessment.freshnessFitScore}, ${assessment.commercialRiskScore}, ${assessment.duplicateRiskScore}, ${signals}::text[], ${input.model!.id}, ${usageEventId}, clock_timestamp(), clock_timestamp()) on conflict (candidate_id, run_id, prompt_version) do nothing returning id`) as Array<{ id: string }>;
      if (triage) {
        await transaction.insert(youtubeDiscoveryRankingHistory).values({ id: crypto.randomUUID(), candidateId: input.candidateId, appearanceId: appearance.id, runId: workRunId(claim), policyVersionId: guard.policyVersionId, stage: "triaged", createdAt: sql`clock_timestamp()` });
        if (!isYoutubeDiscoveryCandidateJobClaim(claim)) await transaction.execute(sql`delete from youtube_discovery_ranking_history where id in (select id from youtube_discovery_ranking_history where candidate_id = ${input.candidateId} and stage <> 'recommended' order by created_at desc, id desc offset 20)`);
      }
    }
    const final = await guardYoutubeDiscoveryCandidateWrite(transaction, claim); if (typeof final === "string") throw new CandidateWriteAborted(final);
    return "completed" as const;
  }); } catch (error) { if (!(error instanceof CandidateWriteAborted)) throw error; return error.outcome === "cancelled" ? await cancelCandidateWork(claim, database) : "contended"; }
}

export async function getYoutubeDiscoveryRecommendationBundle(candidateClaim: YoutubeDiscoveryCandidateWorkClaim, videoId: string, database: DiscoveryWriter = getDb()): Promise<YoutubeDiscoveryRecommendationBundle | "completed" | "cancelled" | "contended"> {
  return database.transaction(async (transaction) => {
    const guard = await guardYoutubeDiscoveryCandidateWrite(transaction, candidateClaim);
    if (typeof guard === "string") return guard;
    // The legacy query-run claim uses its own ID. Candidate jobs must use their
    // immutable source run ID for every downstream provenance reference.
    const claim = { ...candidateClaim, id: workRunId(candidateClaim) } as YoutubeDiscoveryCandidateWorkClaim;
    const rows = await transaction.execute(sql`select candidate.id as "candidateId", candidate.video_id as "videoId", candidate.canonical_url as "canonicalUrl", appearance.id as "appearanceId", triage.id as "triageId", triage.relevance_score as "relevanceScore", triage.expected_value_score as "expectedValueScore", triage.freshness_fit_score as "freshnessFitScore", triage.commercial_risk_score as "commercialRiskScore", triage.duplicate_risk_score as "duplicateRiskScore", array(select input_signal.signal from unnest(triage.signals) input_signal(signal) join youtube_discovery_comment_signals derived on derived.signal = input_signal.signal and derived.candidate_id = candidate.id and derived.run_id = ${claim.id} and derived.policy_version_id = ${guard.policyVersionId} and derived.expires_at > clock_timestamp() order by input_signal.signal) as signals, policy.enabled, policy.minimum_candidate_score as "minimumCandidateScore", policy.priority_score_weight as "priorityScoreWeight", policy.freshness_score_weight as "freshnessScoreWeight", policy.relevance_weight as "relevanceWeight", policy.expected_value_weight as "expectedValueWeight", policy.freshness_fit_weight as "freshnessFitWeight", policy.commercial_risk_weight as "commercialRiskWeight", policy.duplicate_risk_weight as "duplicateRiskWeight", policy.defer_minimum as "deferMinimum", policy.consider_minimum as "considerMinimum", policy.cadence_minutes as "cadenceMinutes", policy.retention_days as "retentionDays", policy.comment_signal_ttl_days as "commentSignalTtlDays", policy.max_concurrent_runs as "maxConcurrentRuns", policy.max_retry_attempts as "maxRetryAttempts", policy.retry_delay_minutes as "retryDelayMinutes", exists(select 1 from youtube_discovery_ranking_history history where history.candidate_id = candidate.id and history.appearance_id = appearance.id and history.run_id = ${claim.id} and history.policy_version_id = ${guard.policyVersionId} and history.stage = 'enriched') as "currentRunEnriched", exists(select 1 from youtube_discovery_recommendations recommendation where recommendation.candidate_id = candidate.id and recommendation.appearance_id = appearance.id and recommendation.run_id = ${claim.id} and recommendation.policy_version_id = ${guard.policyVersionId} and recommendation.triage_id = triage.id) as "existing" from youtube_discovery_candidates candidate join youtube_discovery_appearances appearance on appearance.candidate_id = candidate.id and appearance.run_id = ${claim.id} join youtube_discovery_triages triage on triage.candidate_id = candidate.id and triage.appearance_id = appearance.id and triage.run_id = ${claim.id} and triage.policy_version_id = ${guard.policyVersionId} and triage.status = 'succeeded' join youtube_discovery_policy_versions policy on policy.id = ${guard.policyVersionId} where candidate.video_id = ${videoId} for update`) as Array<Record<string, unknown>>;
    const row = rows[0];
    if (!row) return "contended";
    if (row.existing === true) return "completed";
    const number = (key: string) => Number(row[key]);
    const [policyThreshold] = await transaction.select({ candidateBacklogThreshold: youtubeDiscoveryPolicyVersions.candidateBacklogThreshold }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.id, guard.policyVersionId)).limit(1);
    if (!policyThreshold) return "contended";
    const policy = parseYoutubeDiscoveryPolicy({ enabled: row.enabled, minimumCandidateScore: number("minimumCandidateScore"), priorityScoreWeight: number("priorityScoreWeight"), freshnessScoreWeight: number("freshnessScoreWeight"), relevanceWeight: number("relevanceWeight"), expectedValueWeight: number("expectedValueWeight"), freshnessFitWeight: number("freshnessFitWeight"), commercialRiskWeight: number("commercialRiskWeight"), duplicateRiskWeight: number("duplicateRiskWeight"), deferMinimum: number("deferMinimum"), considerMinimum: number("considerMinimum"), cadenceMinutes: number("cadenceMinutes"), retentionDays: number("retentionDays"), commentSignalTtlDays: number("commentSignalTtlDays"), maxConcurrentRuns: number("maxConcurrentRuns"), maxRetryAttempts: number("maxRetryAttempts"), retryDelayMinutes: number("retryDelayMinutes"), candidateBacklogThreshold: policyThreshold.candidateBacklogThreshold });
    const canonical = canonicalizeYoutubeVideoUrl(String(row.canonicalUrl));
    return { candidateId: String(row.candidateId), appearanceId: String(row.appearanceId), triageId: String(row.triageId), canonical: canonical !== null && canonical.videoId === row.videoId && canonical.canonicalUrl === row.canonicalUrl, currentRunEnriched: row.currentRunEnriched === true, triage: { relevanceScore: number("relevanceScore"), expectedValueScore: number("expectedValueScore"), freshnessFitScore: number("freshnessFitScore"), commercialRiskScore: number("commercialRiskScore"), duplicateRiskScore: number("duplicateRiskScore"), signals: Array.isArray(row.signals) ? row.signals as YoutubeDiscoveryCommentSignal[] : [] }, policy };
  });
}

export async function persistYoutubeDiscoveryRecommendation(claim: YoutubeDiscoveryCandidateWorkClaim, bundle: YoutubeDiscoveryRecommendationBundle, eligibility: "eligible" | "already_compatible", executionDeadlineAt: number, database: DiscoveryWriter = getDb()): Promise<"completed" | "cancelled" | "contended" | "deadline_exhausted"> {
  try { return await database.transaction(async (transaction) => {
    const runId = workRunId(claim);
    if (isYoutubeDiscoveryCandidateJobClaim(claim) && (bundle.appearanceId !== claim.appearanceId || bundle.candidateId !== claim.candidateId)) return "contended" as const;
    const requireDeadline = () => { if (Date.now() >= executionDeadlineAt) throw new RecommendationDeadlineExceeded(); };
    requireDeadline();
    const guard = await guardYoutubeDiscoveryCandidateWrite(transaction, claim); if (typeof guard === "string") throw new CandidateWriteAborted(guard);
    const rows = await transaction.execute(sql`select triage.id from youtube_discovery_triages triage join youtube_discovery_appearances appearance on appearance.id = triage.appearance_id and appearance.candidate_id = triage.candidate_id and appearance.run_id = triage.run_id where triage.id = ${bundle.triageId} and triage.candidate_id = ${bundle.candidateId} and triage.appearance_id = ${bundle.appearanceId} and triage.run_id = ${runId} and triage.policy_version_id = ${guard.policyVersionId} and triage.status = 'succeeded' for update`) as Array<{ id: string }>;
    if (!rows[0]) return "contended" as const;
    const existing = await transaction.select({ id: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryRecommendations).where(and(eq(youtubeDiscoveryRecommendations.candidateId, bundle.candidateId), eq(youtubeDiscoveryRecommendations.appearanceId, bundle.appearanceId), eq(youtubeDiscoveryRecommendations.runId, runId), eq(youtubeDiscoveryRecommendations.policyVersionId, guard.policyVersionId), eq(youtubeDiscoveryRecommendations.triageId, bundle.triageId))).limit(1); if (existing[0]) return "completed" as const;
    const result = evaluateYoutubeDiscoveryRecommendation(bundle.policy, bundle.triage, { canonical: bundle.canonical, currentRunEnriched: bundle.currentRunEnriched, eligibility });
    const [created] = await transaction.insert(youtubeDiscoveryRecommendations).values({ candidateId: bundle.candidateId, appearanceId: bundle.appearanceId, runId, policyVersionId: guard.policyVersionId, triageId: bundle.triageId, score: result.score.toFixed(6), relevanceScore: result.scores.relevanceScore.toFixed(6), expectedValueScore: result.scores.expectedValueScore.toFixed(6), freshnessFitScore: result.scores.freshnessFitScore.toFixed(6), commercialRiskScore: result.scores.commercialRiskScore.toFixed(6), duplicateRiskScore: result.scores.duplicateRiskScore.toFixed(6), recommendation: result.recommendation, factors: result.factors, penalties: result.penalties, reason: result.reason, signals: result.signals }).returning({ id: youtubeDiscoveryRecommendations.id });
    if (created) {
      if (result.recommendation === "consider") {
        // A worker may create later immutable recommendations, but never replaces
        // an existing pending or decided candidate review-state association.
        if (guard.queryProposalId !== null) {
          const [reviewState] = await transaction.execute(sql`insert into youtube_discovery_candidate_review_states (candidate_id, recommendation_id, state) values (${bundle.candidateId}, ${created.id}, 'pending') on conflict (candidate_id) do nothing returning recommendation_id as "recommendationId"`) as Array<{ recommendationId: string }>;
          if (!reviewState) {
            const [existingState] = await transaction.execute(sql`select recommendation_id as "recommendationId", state from youtube_discovery_candidate_review_states where candidate_id = ${bundle.candidateId} for key share`) as Array<{ recommendationId: string; state: "pending" | "accepted" | "deferred" | "skipped" }>;
            if (!existingState) throw new Error("YouTube Discovery review-state association was not retained.");
          }
        }
      }
      await transaction.insert(youtubeDiscoveryRankingHistory).values({ candidateId: bundle.candidateId, appearanceId: bundle.appearanceId, runId, policyVersionId: guard.policyVersionId, stage: "recommended", recommendationId: created.id });
    }
    requireDeadline();
    const final = await guardYoutubeDiscoveryCandidateWrite(transaction, claim); if (typeof final === "string") throw new CandidateWriteAborted(final); return "completed" as const;
  }); } catch (error) { if (error instanceof RecommendationDeadlineExceeded) return "deadline_exhausted"; if (!(error instanceof CandidateWriteAborted)) throw error; return error.outcome === "cancelled" ? await cancelCandidateWork(claim, database) : "contended"; }
}

function isValidYoutubeDiscoveryTriageAssessment(assessment: YoutubeDiscoveryTriageAssessment | undefined): assessment is YoutubeDiscoveryTriageAssessment {
  return assessment !== undefined && [assessment.relevanceScore, assessment.expectedValueScore, assessment.freshnessFitScore, assessment.commercialRiskScore, assessment.duplicateRiskScore].every((score) => Number.isFinite(score) && score >= 0 && score <= 1) && assessment.signals.length <= 6 && assessment.signals.every((signal) => (youtubeDiscoveryCommentSignalValues as readonly string[]).includes(signal)) && new Set(assessment.signals).size === assessment.signals.length;
}

/** Runs one bounded, advisory-lock-serialized retention batch. */
export async function retainYoutubeDiscoveryRecords(database: DiscoveryWriter = getDb()): Promise<number> {
  return database.transaction(async (transaction) => {
    const [locked] = await transaction.execute(sql`select pg_try_advisory_xact_lock(hashtext('youtube-discovery-retention')) as locked`) as Array<{ locked: boolean }>;
    if (!locked?.locked) return 0;
    const [policy] = await transaction.select({ id: youtubeDiscoveryPolicyVersions.id, enabled: youtubeDiscoveryPolicyVersions.enabled, retentionDays: youtubeDiscoveryPolicyVersions.retentionDays }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    if (!policy?.enabled) return 0;
    await transaction.execute(sql`delete from youtube_discovery_comment_signals where id in (select id from youtube_discovery_comment_signals where expires_at <= clock_timestamp() order by expires_at asc, id asc limit 20)`);
    const candidates = await transaction.execute(sql`select candidate.id from youtube_discovery_candidates candidate where candidate.updated_at <= clock_timestamp() - ${policy.retentionDays} * interval '1 day' and not exists (select 1 from youtube_discovery_candidate_review_states review inner join youtube_discovery_knowledge_handoffs handoff on handoff.candidate_id = review.candidate_id where review.candidate_id = candidate.id and review.state = 'pending' and handoff.outcome is null) and not exists (select 1 from youtube_discovery_candidate_jobs job where job.candidate_id = candidate.id and job.state in ('queued', 'running', 'retrying')) order by candidate.updated_at asc limit 20 for update`) as Array<{ id: string }>;
    for (const candidate of candidates) {
       await transaction.delete(youtubeDiscoveryCommentSignals).where(eq(youtubeDiscoveryCommentSignals.candidateId, candidate.id));
       await transaction.delete(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, candidate.id));
       await transaction.delete(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.candidateId, candidate.id));
      await transaction.execute(sql`select set_config('youtube_discovery.retention_guard', 'on', true)`);
      await transaction.delete(youtubeDiscoveryRecommendations).where(eq(youtubeDiscoveryRecommendations.candidateId, candidate.id));
      await transaction.execute(sql`select set_config('youtube_discovery.retention_guard', 'off', true)`);
       await transaction.delete(youtubeDiscoveryTriages).where(eq(youtubeDiscoveryTriages.candidateId, candidate.id));
       await transaction.delete(youtubeDiscoveryRankingHistory).where(eq(youtubeDiscoveryRankingHistory.candidateId, candidate.id));
       await transaction.execute(sql`delete from youtube_discovery_candidate_jobs where candidate_id = ${candidate.id} and state in ('completed', 'failed', 'cancelled')`);
       await transaction.delete(youtubeDiscoveryAppearances).where(eq(youtubeDiscoveryAppearances.candidateId, candidate.id));
      await transaction.delete(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.id, candidate.id));
    }
    await transaction.execute(sql`delete from audit_events where id in (select id from audit_events where target_type = 'youtube_discovery_run_terminal' and created_at <= clock_timestamp() - ${policy.retentionDays} * interval '1 day' order by created_at asc limit 20)`);
    return candidates.length;
  });
}

async function guardYoutubeDiscoveryCandidateWrite(transaction: DiscoveryWriter, claim: YoutubeDiscoveryCandidateWorkClaim): Promise<"contended" | "cancelled" | { readonly policyVersionId: string; readonly queryProposalId: string | null; readonly active: true }> {
  if (isYoutubeDiscoveryCandidateJobClaim(claim)) {
    const [job] = await transaction.execute(sql`select run_id as "runId", policy_version_id as "policyVersionId" from youtube_discovery_candidate_jobs where id = ${claim.id} and state = 'running' and fencing_token = ${claim.fencingToken} and lease_expires_at > clock_timestamp() for update`) as Array<{ runId: string; policyVersionId: string }>;
    if (!job || job.policyVersionId !== claim.policyVersionId) return "contended";
    const [policy] = await transaction.execute(sql`select enabled from youtube_discovery_policy_versions where is_current = true and id = ${claim.policyVersionId} for update`) as Array<{ enabled: boolean }>;
    const [run] = await transaction.execute(sql`select query_proposal_id as "queryProposalId" from youtube_discovery_runs where id = ${job.runId} for update`) as Array<{ queryProposalId: string | null }>;
    const [proposal] = run?.queryProposalId ? await transaction.execute(sql`select enabled from youtube_discovery_query_proposals where id = ${run.queryProposalId} for update`) as Array<{ enabled: boolean }> : [];
    return policy?.enabled && proposal?.enabled !== false ? { active: true, policyVersionId: job.policyVersionId, queryProposalId: run?.queryProposalId ?? null } : "cancelled";
  }
  const [run] = await transaction.execute(sql`select id, policy_version_id as "policyVersionId", query_proposal_id as "queryProposalId", attempt_count as "attemptCount" from youtube_discovery_runs where id = ${claim.id} and state = 'running' and fencing_token = ${claim.fencingToken} and lease_expires_at > clock_timestamp() for update`) as Array<{ id: string; policyVersionId: string; queryProposalId: string | null; attemptCount: number }>;
  if (!run) return "contended";
  const [policy] = await transaction.execute(sql`select enabled from youtube_discovery_policy_versions where is_current = true and id = ${run.policyVersionId} for update`) as Array<{ enabled: boolean }>;
  const [proposal] = run.queryProposalId ? await transaction.execute(sql`select enabled from youtube_discovery_query_proposals where id = ${run.queryProposalId} for update`) as Array<{ enabled: boolean }> : [];
  if (policy?.enabled && proposal?.enabled !== false) return { active: true, policyVersionId: run.policyVersionId, queryProposalId: run.queryProposalId };
  // Do not cancel here: this guard runs inside the candidate graph transaction.
  // Its caller aborts first, then commits cancellation and its terminal audit alone.
  return "cancelled";
}

export function retryYoutubeDiscoveryRun(claim: YoutubeDiscoveryRunClaim, database?: DiscoveryWriter): Promise<YoutubeDiscoveryRunDisposition>;
export function retryYoutubeDiscoveryRun(claim: YoutubeDiscoveryRunClaim, incidentCategory?: Exclude<YoutubeDiscoveryRunIncidentCategory, "execution_terminal"> | null, database?: DiscoveryWriter): Promise<YoutubeDiscoveryRunDisposition>;
export function retryYoutubeDiscoveryRun(claim: YoutubeDiscoveryRunClaim, incidentCategory: Exclude<YoutubeDiscoveryRunIncidentCategory, "execution_terminal"> | null, database: DiscoveryWriter | undefined, retryErrorCode: Exclude<YoutubeDiscoveryRunSafeErrorCode, "retry_exhausted" | "lease_retry_exhausted" | "policy_revoked">): Promise<YoutubeDiscoveryRunDisposition>;
export async function retryYoutubeDiscoveryRun(claim: YoutubeDiscoveryRunClaim, incidentCategoryOrDatabase: Exclude<YoutubeDiscoveryRunIncidentCategory, "execution_terminal"> | DiscoveryWriter | null = null, providedDatabase?: DiscoveryWriter, retryErrorCode: Exclude<YoutubeDiscoveryRunSafeErrorCode, "retry_exhausted" | "lease_retry_exhausted" | "policy_revoked"> = "stage_transient"): Promise<YoutubeDiscoveryRunDisposition> {
  const incidentCategory = typeof incidentCategoryOrDatabase === "string" ? incidentCategoryOrDatabase : null;
  const database = (typeof incidentCategoryOrDatabase === "object" && incidentCategoryOrDatabase !== null ? incidentCategoryOrDatabase : providedDatabase) ?? getDb();
  return database.transaction(async (transaction) => {
    const [run] = await transaction.select({ id: youtubeDiscoveryRuns.id, attemptCount: youtubeDiscoveryRuns.attemptCount, maxRetryAttempts: youtubeDiscoveryRuns.maxRetryAttempts, retryDelayMinutes: youtubeDiscoveryRuns.retryDelayMinutes, policyVersionId: youtubeDiscoveryRuns.policyVersionId, incidentCategory: youtubeDiscoveryRuns.incidentCategory }).from(youtubeDiscoveryRuns).where(activeClaim(claim)).limit(1).for("update");
    if (!run) return "contended";
    const [currentPolicy] = await transaction.select({ id: youtubeDiscoveryPolicyVersions.id, enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    const [proposal] = await transaction.execute(sql`select enabled from youtube_discovery_query_proposals where id = (select query_proposal_id from youtube_discovery_runs where id = ${run.id}) for update`) as Array<{ enabled: boolean }>;
    const outcome: YoutubeDiscoveryRunDisposition = !currentPolicy?.enabled || currentPolicy.id !== run.policyVersionId || proposal?.enabled === false ? "cancelled" : isYoutubeDiscoveryRetryExhausted(run.attemptCount, run.maxRetryAttempts) ? "failed" : "retrying";
    const safeErrorCode: YoutubeDiscoveryRunSafeErrorCode = outcome === "cancelled" ? "policy_revoked" : outcome === "failed" && retryErrorCode === "stage_transient" ? "retry_exhausted" : retryErrorCode;
    const retryDelayMinutes = getYoutubeDiscoveryRetryDelayMinutes(run.retryDelayMinutes, run.attemptCount);
    const retainedIncidentCategory = incidentCategory ?? run.incidentCategory;
    const terminalIncidentCategory = outcome === "failed" ? retainedIncidentCategory ?? "execution_terminal" : outcome === "retrying" ? retainedIncidentCategory : null;
    const [updated] = await transaction.update(youtubeDiscoveryRuns).set({ state: outcome, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, nextRunAt: outcome === "retrying" ? sql`clock_timestamp() + ${retryDelayMinutes} * interval '1 minute'` : sql`clock_timestamp()`, terminalAt: outcome === "retrying" ? null : sql`clock_timestamp()`, terminalOutcome: outcome === "retrying" ? null : outcome, safeErrorCode, incidentCategory: terminalIncidentCategory }).where(activeClaim(claim)).returning();
    if (!updated) return "contended";
    if (outcome !== "retrying") await recordTerminalAudit(transaction, updated.id, outcome, updated.attemptCount, safeErrorCode, run.policyVersionId);
    return outcome;
  });
}

function activeClaim(claim: YoutubeDiscoveryRunClaim) {
  return and(eq(youtubeDiscoveryRuns.id, claim.id), eq(youtubeDiscoveryRuns.state, "running"), eq(youtubeDiscoveryRuns.fencingToken, claim.fencingToken), sql`${youtubeDiscoveryRuns.leaseExpiresAt} > clock_timestamp()`);
}

function activeCandidateJobClaim(claim: YoutubeDiscoveryCandidateJobClaim) { return and(eq(youtubeDiscoveryCandidateJobs.id, claim.id), eq(youtubeDiscoveryCandidateJobs.state, "running"), eq(youtubeDiscoveryCandidateJobs.fencingToken, claim.fencingToken), sql`${youtubeDiscoveryCandidateJobs.leaseExpiresAt} > clock_timestamp()`); }
function isYoutubeDiscoveryCandidateJobClaim(claim: unknown): claim is YoutubeDiscoveryCandidateJobClaim {
  return typeof claim === "object" && claim !== null && "runId" in claim && "candidateId" in claim && "videoId" in claim && "appearanceId" in claim && typeof claim.runId === "string" && typeof claim.candidateId === "string" && typeof claim.videoId === "string" && typeof claim.appearanceId === "string";
}
function workRunId(claim: YoutubeDiscoveryCandidateWorkClaim) { return isYoutubeDiscoveryCandidateJobClaim(claim) ? claim.runId : claim.id; }
function candidateWorkAppearance(claim: YoutubeDiscoveryCandidateWorkClaim, candidateId: string) { return isYoutubeDiscoveryCandidateJobClaim(claim) ? and(eq(youtubeDiscoveryAppearances.id, claim.appearanceId), eq(youtubeDiscoveryAppearances.candidateId, claim.candidateId), eq(youtubeDiscoveryAppearances.candidateId, candidateId), eq(youtubeDiscoveryAppearances.runId, claim.runId)) : and(eq(youtubeDiscoveryAppearances.candidateId, candidateId), eq(youtubeDiscoveryAppearances.runId, claim.id)); }
async function cancelCandidateWork(claim: YoutubeDiscoveryCandidateWorkClaim, database: DiscoveryWriter) { return isYoutubeDiscoveryCandidateJobClaim(claim) ? (await cancelYoutubeDiscoveryCandidateJobIfDisabled(claim, database)) === "cancelled" ? "cancelled" : "contended" : (await cancelYoutubeDiscoveryRunIfDisabled(claim, database)) === "cancelled" ? "cancelled" : "contended"; }

async function recordTerminalAudit(database: AuditEventWriter, runId: string, outcome: "completed" | "failed" | "cancelled", attemptCount: number, safeErrorCode: YoutubeDiscoveryRunSafeErrorCode | null, policyVersionId: string) {
  await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "update", targetType: "youtube_discovery_run_terminal", targetId: runId, afterSummary: JSON.stringify({ policyVersionId, outcome, attemptCount, ...(safeErrorCode ? { safeErrorCode } : {}) }) }, database);
}

async function recordCandidateJobTerminalAudit(database: AuditEventWriter, jobId: string, outcome: "completed" | "failed" | "cancelled", attemptCount: number, safeErrorCode: YoutubeDiscoveryCandidateJobSafeErrorCode | null, policyVersionId: string) {
  await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "update", targetType: "youtube_discovery_candidate_job_terminal", targetId: jobId, afterSummary: JSON.stringify({ policyVersionId, outcome, attemptCount, ...(safeErrorCode ? { safeErrorCode } : {}) }) }, database);
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
  if (!youtubeDiscoveryQueryProposalReasonValues.includes(input.reason) || (input.origin === "system" && (!input.systemSignal || input.reason === "operator_request" || input.systemSignal.reason !== input.reason)) || !/^[\p{L}\p{N} '-]{1,240}$/u.test(input.queryText.trim())) {
    throw new Error("Invalid YouTube Discovery query proposal.");
  }
}

function systemProposalFields(signal: SafeDiscoveryQuerySignal, queryBuilderVersion = 1) {
  const [derived] = deriveDiscoveryQueries([{ status: "available", signals: [signal] }], queryBuilderVersion).queries;
  if (!derived) throw new Error("Invalid YouTube Discovery system query proposal.");
  return { targetDigest: derived.targetDigest, missionActionId: derived.missionActionId, safeSignalSummary: derived.reason, queryText: derived.queryText, priority: derived.priority };
}

function policyAuditSummary(policy: YoutubeDiscoveryPolicyAuditSummary): YoutubeDiscoveryPolicyAuditSummary {
  return { version: policy.version, queryBuilderVersion: policy.queryBuilderVersion, languageClassifierVersion: policy.languageClassifierVersion, minimumUsefulDurationSeconds: policy.minimumUsefulDurationSeconds, allowForeignFallback: policy.allowForeignFallback, enabled: policy.enabled, minimumCandidateScore: policy.minimumCandidateScore, priorityScoreWeight: policy.priorityScoreWeight, freshnessScoreWeight: policy.freshnessScoreWeight, relevanceWeight: Number(policy.relevanceWeight), expectedValueWeight: Number(policy.expectedValueWeight), freshnessFitWeight: Number(policy.freshnessFitWeight), commercialRiskWeight: Number(policy.commercialRiskWeight), duplicateRiskWeight: Number(policy.duplicateRiskWeight), deferMinimum: Number(policy.deferMinimum), considerMinimum: Number(policy.considerMinimum), cadenceMinutes: policy.cadenceMinutes, retentionDays: policy.retentionDays, commentSignalTtlDays: policy.commentSignalTtlDays, maxConcurrentRuns: policy.maxConcurrentRuns, maxRetryAttempts: policy.maxRetryAttempts, retryDelayMinutes: policy.retryDelayMinutes, candidateBacklogThreshold: policy.candidateBacklogThreshold, actionQueueHighPriorityMaximum: policy.actionQueueHighPriorityMaximum, actionQueueMaximumOperatorReviewAgeHours: policy.actionQueueMaximumOperatorReviewAgeHours, actionQueueMaximumMissionStallHours: policy.actionQueueMaximumMissionStallHours, actionQueuePersistentIncidentFailureCount: policy.actionQueuePersistentIncidentFailureCount, actionQueuePersistentIncidentWindowHours: policy.actionQueuePersistentIncidentWindowHours };
}

function queryProposalAuditSummary(proposal: YoutubeDiscoveryQueryProposalAuditSummary): YoutubeDiscoveryQueryProposalAuditSummary {
  return { origin: proposal.origin, priority: proposal.priority, enabled: proposal.enabled, cadenceMinutes: proposal.cadenceMinutes };
}

function runAuditSummary(run: YoutubeDiscoveryRunAuditSummary): YoutubeDiscoveryRunAuditSummary {
  return { policyVersionId: run.policyVersionId, state: run.state };
}
