import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { YoutubeDiscoveryActionRequiredCursorValidationError, YoutubeDiscoveryReviewCursorValidationError, type AdminYoutubeDiscoveryDependencies, type AdminYoutubeDiscoveryPort } from "@xuyenviet/domain";
import type { AdminYoutubeDiscoveryActionRequiredItem, RequestPrincipal } from "@xuyenviet/contracts";
import { adminYoutubeDiscoveryActionRequiredPageSize, adminYoutubeDiscoveryReviewPageSize, encodeAdminYoutubeDiscoveryActionRequiredCursor, encodeAdminYoutubeDiscoveryReviewCursor } from "@xuyenviet/contracts";
import type { YoutubeCaptureEligibilityPort } from "@xuyenviet/domain";
import { getDb } from "./client";
import { createUserAuditActor } from "./actors";
import { recordAuditEvent } from "./audit-writers";
import { youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryKnowledgeHandoffs, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryRecommendations, youtubeDiscoveryRuns } from "./schema";

const validText = (value: unknown) => typeof value === "string" && value.trim() === value && /^[\p{L}\p{N} '-]{1,240}$/u.test(value);
const validPriority = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 100;
const validCadence = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 15 && (value as number) <= 10_080;
const handoffTimeoutMs = 5_000;
type AdminYoutubeDiscoveryDatabase = Pick<ReturnType<typeof getDb>, "select" | "transaction" | "update" | "delete">;

export function createPostgresAdminYoutubeDiscoveryPort(captureEligibility: YoutubeCaptureEligibilityPort = { async check() { return "unavailable"; } }, db: AdminYoutubeDiscoveryDatabase = getDb(), handoff: AdminYoutubeDiscoveryDependencies["knowledgeHandoff"] = { async submit() { return "reconciling"; }, async lookup() { return "reconciling"; } }, actionOwners: NonNullable<AdminYoutubeDiscoveryDependencies["actionOwners"]> = { async admitsActionCursor() { return false; }, async listMissionNeeds() { return []; }, async listKnowledgeRecommendations() { return []; } }): AdminYoutubeDiscoveryPort {
  return {
    async list() {
      const rows = await db.select({ id: youtubeDiscoveryQueryProposals.id, origin: youtubeDiscoveryQueryProposals.origin, queryText: youtubeDiscoveryQueryProposals.queryText, reason: youtubeDiscoveryQueryProposals.reason, priority: youtubeDiscoveryQueryProposals.priority, enabled: youtubeDiscoveryQueryProposals.enabled, cadenceMinutes: youtubeDiscoveryQueryProposals.cadenceMinutes, nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt, policyEnabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryQueryProposals).leftJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).orderBy(asc(youtubeDiscoveryQueryProposals.createdAt)).limit(200);
      return { items: rows.map((row) => ({ id: row.id, origin: row.origin, queryText: row.queryText, reason: row.reason, priority: row.priority, enabled: row.enabled, cadenceMinutes: row.cadenceMinutes, nextRunAt: row.enabled && row.policyEnabled ? row.nextDueAt?.toISOString() ?? null : null, pausedReason: !row.enabled ? "operator" : !row.policyEnabled ? "global" : null })) };
    },
    async listReview(principal, cursor) {
      const active = [eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`] as const;
      if (cursor) {
        const [anchor] = await db.select({ recommendationId: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId))).innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId))).where(and(...active, eq(youtubeDiscoveryRecommendations.id, cursor.recommendationId), eq(youtubeDiscoveryRecommendations.score, String(cursor.score)), eq(createdAtCursorKey, cursor.createdAt))).limit(1);
        if (!anchor) throw new YoutubeDiscoveryReviewCursorValidationError("Invalid YouTube Discovery review cursor.");
      }
      const after = cursor ? or(
        lt(youtubeDiscoveryRecommendations.score, String(cursor.score)),
        and(eq(youtubeDiscoveryRecommendations.score, String(cursor.score)), gt(createdAtCursorKey, cursor.createdAt)),
        and(eq(youtubeDiscoveryRecommendations.score, String(cursor.score)), eq(createdAtCursorKey, cursor.createdAt), gt(youtubeDiscoveryRecommendations.id, cursor.recommendationId)),
      ) : undefined;
      if (cursor) await reconcileActiveReviews(db, handoff, principal, cursor.recommendationId);
      await reconcileActiveReviews(db, handoff, principal, undefined, after);
      const where = after ? and(...active, after) : and(...active);
      const rows = await db.select({ recommendationId: youtubeDiscoveryRecommendations.id, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl, title: youtubeDiscoveryCandidates.title, channelName: youtubeDiscoveryCandidates.channelName, publishedAt: youtubeDiscoveryCandidates.publishedAt, durationSeconds: youtubeDiscoveryCandidates.durationSeconds, recommendation: youtubeDiscoveryRecommendations.recommendation, reason: youtubeDiscoveryRecommendations.reason, reconciling: youtubeDiscoveryKnowledgeHandoffs.reconciling, score: youtubeDiscoveryRecommendations.score, createdAt: createdAtCursorKey }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId))).innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryRecommendations.candidateId)).innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId))).leftJoin(youtubeDiscoveryKnowledgeHandoffs, eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)).where(where).orderBy(desc(youtubeDiscoveryRecommendations.score), asc(createdAtCursorKey), asc(youtubeDiscoveryRecommendations.id)).limit(adminYoutubeDiscoveryReviewPageSize + 1);
      const items = rows.slice(0, adminYoutubeDiscoveryReviewPageSize).map(queueItem);
      const last = rows[adminYoutubeDiscoveryReviewPageSize - 1];
      return { items, nextCursor: rows.length > adminYoutubeDiscoveryReviewPageSize && last ? encodeAdminYoutubeDiscoveryReviewCursor({ score: Number(last.score), createdAt: last.createdAt, recommendationId: last.recommendationId }) : null };
    },
    async listActionRequired(principal, cursor) {
      if (cursor && !validActionCursor(cursor)) throw new YoutubeDiscoveryActionRequiredCursorValidationError("Invalid YouTube Discovery action-required cursor.");
      const [policyRows, candidates, incidents] = await Promise.all([
        db.select({ enabled: youtubeDiscoveryPolicyVersions.enabled, highPriorityMaximum: youtubeDiscoveryPolicyVersions.actionQueueHighPriorityMaximum, missionStallHours: youtubeDiscoveryPolicyVersions.actionQueueMaximumMissionStallHours }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1),
        db.select({ recommendationId: youtubeDiscoveryRecommendations.id, priority: youtubeDiscoveryQueryProposals.priority, createdAt: youtubeDiscoveryRecommendations.createdAt, highPriorityMaximum: youtubeDiscoveryPolicyVersions.actionQueueHighPriorityMaximum, reviewAgeHours: youtubeDiscoveryPolicyVersions.actionQueueMaximumOperatorReviewAgeHours }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId))).innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId))).innerJoin(youtubeDiscoveryQueryProposals, eq(youtubeDiscoveryQueryProposals.id, youtubeDiscoveryRuns.queryProposalId)).innerJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.id, youtubeDiscoveryRecommendations.policyVersionId)).where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`)).orderBy(asc(youtubeDiscoveryQueryProposals.priority), asc(youtubeDiscoveryRecommendations.createdAt), asc(youtubeDiscoveryRecommendations.id)),
        db.select({ runId: youtubeDiscoveryRuns.id, queryProposalId: youtubeDiscoveryRuns.queryProposalId, category: youtubeDiscoveryRuns.incidentCategory, terminalAt: youtubeDiscoveryRuns.terminalAt, priority: youtubeDiscoveryQueryProposals.priority, failures: youtubeDiscoveryPolicyVersions.actionQueuePersistentIncidentFailureCount, windowHours: youtubeDiscoveryPolicyVersions.actionQueuePersistentIncidentWindowHours, state: youtubeDiscoveryRuns.state }).from(youtubeDiscoveryRuns).innerJoin(youtubeDiscoveryQueryProposals, eq(youtubeDiscoveryQueryProposals.id, youtubeDiscoveryRuns.queryProposalId)).innerJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.id, youtubeDiscoveryRuns.policyVersionId)).where(and(sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, sql`${youtubeDiscoveryRuns.terminalAt} is not null`, sql`${youtubeDiscoveryRuns.state} in ('failed', 'completed')`)).orderBy(asc(youtubeDiscoveryRuns.terminalAt), asc(youtubeDiscoveryRuns.id)),
      ]);
      const now = Date.now();
      const items: Array<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }> = candidates.map((candidate) => {
        const aged = candidate.priority <= candidate.highPriorityMaximum && now - candidate.createdAt.getTime() >= candidate.reviewAgeHours * 3_600_000;
        return { kind: "candidate_review", actionId: candidate.recommendationId, destination: "review", reason: aged ? "review_aged" : "review_pending", priority: candidate.priority, occurredAt: candidate.createdAt.toISOString(), urgency: aged ? 0 : 2 };
      });
      for (const incident of groupedIncidents(incidents, now)) items.push(incident);
      const policy = policyRows[0];
      if (cursor && (cursor.kind === "candidate_review" || cursor.kind === "health_incident") && !items.some((item) => sameActionTuple(item, cursor))) throw new YoutubeDiscoveryActionRequiredCursorValidationError("Invalid YouTube Discovery action-required cursor.");
      if (!policy) throw new Error("YouTube Discovery action-required policy is unavailable.");
      if (cursor && (cursor.kind === "mission_need" || cursor.kind === "knowledge_recommendation") && !await actionOwners.admitsActionCursor(cursor)) throw new YoutubeDiscoveryActionRequiredCursorValidationError("Invalid YouTube Discovery action-required cursor.");
      const [missionNeeds, knowledgeRecommendations] = await Promise.all([actionOwners.listMissionNeeds(policy), actionOwners.listKnowledgeRecommendations(policy)]);
      const missionIds = missionNeeds.map((need) => need.actionId);
      const missionProgress = missionIds.length === 0 ? [] : await db.select({ actionId: youtubeDiscoveryQueryProposals.missionActionId, enabled: youtubeDiscoveryQueryProposals.enabled, createdAt: youtubeDiscoveryQueryProposals.createdAt, latestSuccessAt: sql<Date | null>`max(${youtubeDiscoveryRuns.terminalAt}) filter (where ${youtubeDiscoveryRuns.state} = 'completed')` }).from(youtubeDiscoveryQueryProposals).leftJoin(youtubeDiscoveryRuns, eq(youtubeDiscoveryRuns.queryProposalId, youtubeDiscoveryQueryProposals.id)).where(inArray(youtubeDiscoveryQueryProposals.missionActionId, missionIds)).groupBy(youtubeDiscoveryQueryProposals.missionActionId, youtubeDiscoveryQueryProposals.enabled, youtubeDiscoveryQueryProposals.createdAt);
      const progressByMission = new Map(missionProgress.flatMap((row) => row.actionId ? [[row.actionId, row]] : []));
      for (const need of missionNeeds) {
        const progress = progressByMission.get(need.actionId);
        const occurredAt = progress?.latestSuccessAt ?? progress?.createdAt ?? need.createdAt;
        const stalledReason = !policy.enabled ? "mission_disabled" as const : !progress?.enabled ? "mission_no_enabled_query" as const : Date.now() - occurredAt.getTime() >= policy.missionStallHours * 3_600_000 ? "mission_no_progress" as const : null;
        if (stalledReason) items.push({ kind: "mission_need", actionId: need.actionId, destination: "mission", reason: stalledReason, priority: need.priority, occurredAt: occurredAt.toISOString(), urgency: 1 });
      }
      for (const recommendation of knowledgeRecommendations) if (recommendation.priority <= policy.highPriorityMaximum) items.push({ kind: "knowledge_recommendation", actionId: recommendation.recommendationId, destination: "knowledge_recommendation", reason: recommendation.workType === "risk" ? "knowledge_risk" : "knowledge_relation", priority: recommendation.priority, occurredAt: recommendation.createdAt.toISOString(), urgency: 3 });
      const ordered = items.sort(compareActionItems);
      if (cursor) {
        const anchor = ordered.find((item) => sameActionTuple(item, cursor));
        if (!anchor) throw new YoutubeDiscoveryActionRequiredCursorValidationError("Invalid YouTube Discovery action-required cursor.");
      }
      const after = cursor ? ordered.filter((item) => compareActionTuple(item, cursor) > 0) : ordered;
      const page = after.slice(0, adminYoutubeDiscoveryActionRequiredPageSize);
      const last = page.at(-1);
      const responseItems: AdminYoutubeDiscoveryActionRequiredItem[] = page.map(({ urgency: _urgency, ...item }) => item as AdminYoutubeDiscoveryActionRequiredItem);
      return { items: responseItems, nextCursor: after.length > page.length && last ? encodeAdminYoutubeDiscoveryActionRequiredCursor({ version: 1, urgency: last.urgency, priority: last.priority, occurredAt: last.occurredAt, kind: last.kind, actionId: last.actionId }) : null };
    },
    async getReview(principal, recommendationId) {
      await reconcileActiveReviews(db, handoff, principal, recommendationId);
      const [row] = await db.select({ recommendationId: youtubeDiscoveryRecommendations.id, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl, videoId: youtubeDiscoveryCandidates.videoId, title: youtubeDiscoveryCandidates.title, channelName: youtubeDiscoveryCandidates.channelName, publishedAt: youtubeDiscoveryCandidates.publishedAt, durationSeconds: youtubeDiscoveryCandidates.durationSeconds, recommendation: youtubeDiscoveryRecommendations.recommendation, reason: youtubeDiscoveryRecommendations.reason, reconciling: youtubeDiscoveryKnowledgeHandoffs.reconciling, queryText: youtubeDiscoveryQueryProposals.queryText, queryReason: youtubeDiscoveryQueryProposals.reason, score: youtubeDiscoveryRecommendations.score, factors: youtubeDiscoveryRecommendations.factors, penalties: youtubeDiscoveryRecommendations.penalties, signals: youtubeDiscoveryRecommendations.signals }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId))).innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryRecommendations.candidateId)).innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId))).innerJoin(youtubeDiscoveryQueryProposals, eq(youtubeDiscoveryQueryProposals.id, youtubeDiscoveryRuns.queryProposalId)).leftJoin(youtubeDiscoveryKnowledgeHandoffs, eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)).where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), eq(youtubeDiscoveryRecommendations.id, recommendationId))).limit(1);
      if (!row) return null;
      let priorCaptureOutcome: "eligible" | "already_compatible" | "unavailable";
      try { priorCaptureOutcome = await captureEligibility.check(row.videoId); } catch { throw new Error("YouTube capture eligibility projection unavailable."); }
      return { ...queueItem(row), queryText: row.queryText, queryReason: row.queryReason, score: Number(row.score), factors: row.factors as ("relevance" | "expected_value" | "freshness_fit")[], penalties: row.penalties as ("commercial_risk" | "duplicate_risk")[], signals: row.signals as ("recent_discussion" | "stale_or_changed_warning" | "practical_question_demand" | "creator_responsiveness" | "commercial_risk" | "contradictory_discussion")[], priorCaptureOutcome };
    },
    async acceptReview(principal, recommendationId) {
      if (!validId(recommendationId)) throw new Error("Invalid YouTube Discovery review.");
      const admission = await db.transaction(async (transaction) => {
        const [row] = await transaction.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl }).from(youtubeDiscoveryCandidateReviewStates)
          .innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)))
          .innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryCandidateReviewStates.candidateId))
          .innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId)))
          .where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, eq(youtubeDiscoveryRecommendations.id, recommendationId))).limit(1).for("update");
        if (!row) return null;
        const [existing] = await transaction.select({ reference: youtubeDiscoveryKnowledgeHandoffs.reference }).from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, row.candidateId)).limit(1);
        const reference = existing?.reference ?? crypto.randomUUID();
        if (!existing) await transaction.insert(youtubeDiscoveryKnowledgeHandoffs).values({ candidateId: row.candidateId, recommendationId, reference, reconciling: true });
        return { ...row, reference, newReference: !existing };
      });
      if (!admission) return null;
      const outcome = admission.newReference
        ? await boundedHandoff(() => handoff.submit({ reference: admission.reference, canonicalUrl: admission.canonicalUrl, actorUserId: principal.userId }))
        : await resolveHandoff(handoff, admission);
      if (outcome === "failed" || outcome === "reconciling") {
        if (outcome === "failed") await db.delete(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.reference, admission.reference));
        else await db.update(youtubeDiscoveryKnowledgeHandoffs).set({ reconciling: true }).where(eq(youtubeDiscoveryKnowledgeHandoffs.reference, admission.reference));
        return { outcome };
      }
      if (!terminalOutcome(outcome)) {
        await db.update(youtubeDiscoveryKnowledgeHandoffs).set({ reconciling: true }).where(eq(youtubeDiscoveryKnowledgeHandoffs.reference, admission.reference));
        return { outcome: "reconciling" };
      }
      return { outcome: await finalizeAcceptedReview(db, admission.candidateId, recommendationId, principal, outcome) };
    },
    async deferReview(principal, recommendationId) { return decideReview(db, principal, recommendationId, "deferred"); },
    async skipReview(principal, recommendationId) { return decideReview(db, principal, recommendationId, "skipped"); },
    async create(principal, input) {
      if (!validText(input.queryText) || !validPriority(input.priority) || !validCadence(input.cadenceMinutes)) throw new Error("Invalid YouTube Discovery query proposal.");
      const actor = actorFor(principal);
      return db.transaction(async (transaction) => {
        const [policy] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
        if (!policy) throw new Error("YouTube Discovery policy is unavailable.");
        const [row] = await transaction.insert(youtubeDiscoveryQueryProposals).values({ origin: "operator", reason: "operator_request", queryText: input.queryText, priority: input.priority, cadenceMinutes: input.cadenceMinutes, enabled: true, scheduleAnchorAt: sql`clock_timestamp()`, nextDueAt: policy.enabled ? sql`clock_timestamp() + ${input.cadenceMinutes} * interval '1 minute'` : null }).returning();
        if (!row) throw new Error("YouTube Discovery query proposal creation failed.");
        await audit(transaction, actor, "create", row.id, row);
        return projection(row, policy.enabled);
      });
    },
    async edit(principal, id, queryText) {
      return mutate(db, principal, id, { queryText }, validText(queryText), "operator");
    },
    async reprioritize(principal, id, priority) { return mutate(db, principal, id, { priority, operatorPriorityOverride: sql`case when ${youtubeDiscoveryQueryProposals.origin} = 'system' then ${priority} else ${youtubeDiscoveryQueryProposals.operatorPriorityOverride} end` }, validPriority(priority)); },
    async pause(principal, id) { return mutate(db, principal, id, { enabled: false, nextDueAt: null }, true); },
    async resume(principal, id) { return mutate(db, principal, id, { enabled: true, scheduleAnchorAt: sql`coalesce(${youtubeDiscoveryQueryProposals.scheduleAnchorAt}, clock_timestamp())`, nextDueAt: sql`case when (select enabled from youtube_discovery_policy_versions where is_current = true) then coalesce(${youtubeDiscoveryQueryProposals.scheduleAnchorAt}, clock_timestamp()) + (floor(extract(epoch from (clock_timestamp() - coalesce(${youtubeDiscoveryQueryProposals.scheduleAnchorAt}, clock_timestamp()))) / 60 / ${youtubeDiscoveryQueryProposals.cadenceMinutes})::integer + 1) * ${youtubeDiscoveryQueryProposals.cadenceMinutes} * interval '1 minute' else null end` }, true); },
  };
}
// Fixed-width UTC microsecond text preserves database ordering in the opaque cursor.
const createdAtCursorKey = sql<string>`to_char(${youtubeDiscoveryRecommendations.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
function queueItem(row: { recommendationId: string; canonicalUrl: string; title: string | null; channelName: string | null; publishedAt: Date | null; durationSeconds: number | null; recommendation: "skip" | "defer" | "consider"; reason: "eligible_score_band" | "below_defer_band" | "between_defer_and_consider_band" | "already_compatible" | "canonical_mismatch" | "not_current_run_enriched"; reconciling?: boolean | null }) { return { recommendationId: row.recommendationId, canonicalUrl: row.canonicalUrl, title: displayText(row.title), channelName: displayText(row.channelName), publishedAt: row.publishedAt?.toISOString() ?? null, durationSeconds: row.durationSeconds, recommendation: row.recommendation as "consider", reason: row.reason as "eligible_score_band", actionAvailability: row.reconciling ? "reconciling" as const : "available" as const }; }
function displayText(value: string | null) { const normalized = value?.trim(); return normalized || null; }
function validId(value: string) { return value.trim() === value && value.length > 0 && value.length <= 128; }
async function reconcileActiveReviews(db: AdminYoutubeDiscoveryDatabase, handoff: NonNullable<AdminYoutubeDiscoveryDependencies["knowledgeHandoff"]>, principal: RequestPrincipal, recommendationId?: string, after?: ReturnType<typeof or>) {
  const references = await db.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId, recommendationId: youtubeDiscoveryCandidateReviewStates.recommendationId, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl, reference: youtubeDiscoveryKnowledgeHandoffs.reference }).from(youtubeDiscoveryCandidateReviewStates)
    .innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)))
    .innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryCandidateReviewStates.candidateId))
    .innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId)))
    .innerJoin(youtubeDiscoveryKnowledgeHandoffs, eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId))
    .where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, recommendationId ? eq(youtubeDiscoveryRecommendations.id, recommendationId) : after))
    .orderBy(desc(youtubeDiscoveryRecommendations.score), asc(createdAtCursorKey), asc(youtubeDiscoveryRecommendations.id))
    .limit(recommendationId ? 1 : adminYoutubeDiscoveryReviewPageSize);
  await Promise.all(references.map((reference) => reconcileReference(db, handoff, principal, reference)));
}
async function reconcileReference(db: AdminYoutubeDiscoveryDatabase, handoff: NonNullable<AdminYoutubeDiscoveryDependencies["knowledgeHandoff"]>, principal: RequestPrincipal, reference: { candidateId: string; recommendationId: string; canonicalUrl: string; reference: string }) {
  const outcome = await resolveHandoff(handoff, reference);
  if (outcome === "reconciling") return;
  await db.transaction(async (transaction) => {
    const [locked] = await transaction.select({ state: youtubeDiscoveryCandidateReviewStates.state, reference: youtubeDiscoveryKnowledgeHandoffs.reference }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryKnowledgeHandoffs, eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)).where(and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, reference.candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, reference.recommendationId))).limit(1).for("update");
    if (!locked || locked.reference !== reference.reference || locked.state !== "pending") return;
    if (outcome === "failed") { await transaction.delete(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, reference.candidateId)); return; }
    if (!terminalOutcome(outcome)) { await transaction.update(youtubeDiscoveryKnowledgeHandoffs).set({ reconciling: true }).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, reference.candidateId)); return; }
    const actor = actorFor(principal);
    const [updated] = await transaction.update(youtubeDiscoveryCandidateReviewStates).set({ state: "accepted" }).where(and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, reference.candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, reference.recommendationId), eq(youtubeDiscoveryCandidateReviewStates.state, "pending"))).returning({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId });
    if (updated) {
      await recordAuditEvent({ actor, operation: "update", targetType: "youtube_discovery_candidate_review", targetId: reference.recommendationId, afterSummary: JSON.stringify({ decision: "accepted", intakeOutcome: outcome }) }, transaction);
      await transaction.update(youtubeDiscoveryKnowledgeHandoffs).set({ outcome, reconciling: false }).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, reference.candidateId));
    }
  });
}
function terminalOutcome(outcome: unknown): outcome is "submitted" | "duplicate" { return outcome === "submitted" || outcome === "duplicate"; }
async function resolveHandoff(handoff: NonNullable<AdminYoutubeDiscoveryDependencies["knowledgeHandoff"]>, reference: { reference: string }) {
  const outcome = await boundedHandoff(() => handoff.lookup(reference.reference));
  return outcome === "missing" ? "reconciling" : outcome;
}
async function boundedHandoff(operation: () => Promise<unknown>): Promise<"submitted" | "duplicate" | "failed" | "reconciling" | "missing"> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { const outcome = await Promise.race([operation(), new Promise<"reconciling">((resolve) => { timeout = setTimeout(() => resolve("reconciling"), handoffTimeoutMs); })]); return outcome === "submitted" || outcome === "duplicate" || outcome === "failed" || outcome === "missing" ? outcome : "reconciling"; }
  catch { return "reconciling"; }
  finally { if (timeout) clearTimeout(timeout); }
}
async function finalizeAcceptedReview(db: AdminYoutubeDiscoveryDatabase, candidateId: string, recommendationId: string, principal: RequestPrincipal, outcome: "submitted" | "duplicate") {
  return db.transaction(async (transaction) => {
    const [handoff] = await transaction.select({ outcome: youtubeDiscoveryKnowledgeHandoffs.outcome }).from(youtubeDiscoveryKnowledgeHandoffs).where(and(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, candidateId), eq(youtubeDiscoveryKnowledgeHandoffs.recommendationId, recommendationId))).limit(1).for("update");
    if (terminalOutcome(handoff?.outcome)) return handoff.outcome;
    const actor = actorFor(principal);
    const [updated] = await transaction.update(youtubeDiscoveryCandidateReviewStates).set({ state: "accepted" }).where(and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, recommendationId), eq(youtubeDiscoveryCandidateReviewStates.state, "pending"))).returning({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId });
    if (!updated) return "reconciling";
    await recordAuditEvent({ actor, operation: "update", targetType: "youtube_discovery_candidate_review", targetId: recommendationId, afterSummary: JSON.stringify({ decision: "accepted", intakeOutcome: outcome }) }, transaction);
    await transaction.update(youtubeDiscoveryKnowledgeHandoffs).set({ outcome, reconciling: false }).where(and(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, candidateId), eq(youtubeDiscoveryKnowledgeHandoffs.recommendationId, recommendationId)));
    return outcome;
  });
}
async function decideReview<T extends "deferred" | "skipped">(db: AdminYoutubeDiscoveryDatabase, principal: RequestPrincipal, recommendationId: string, decision: T): Promise<{ outcome: T } | null> {
  if (!validId(recommendationId)) throw new Error("Invalid YouTube Discovery review.");
  const actor = actorFor(principal);
  return db.transaction(async (transaction) => {
    const [row] = await transaction.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId }).from(youtubeDiscoveryCandidateReviewStates)
      .innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)))
      .innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId)))
      .where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, eq(youtubeDiscoveryRecommendations.id, recommendationId))).limit(1).for("update");
    // Knowledge owns any existing handoff; terminal Discovery actions only inspect it.
    if (!row) return null;
    const [handoff] = await transaction.select({ reference: youtubeDiscoveryKnowledgeHandoffs.reference }).from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, row.candidateId)).limit(1).for("update");
    if (handoff) return null;
    const [updated] = await transaction.update(youtubeDiscoveryCandidateReviewStates).set({ state: decision }).where(and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, row.candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, recommendationId), eq(youtubeDiscoveryCandidateReviewStates.state, "pending"))).returning({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId });
    if (!updated) return null;
    await recordAuditEvent({ actor, operation: "update", targetType: "youtube_discovery_candidate_review", targetId: recommendationId, afterSummary: JSON.stringify({ decision }) }, transaction);
    return { outcome: decision };
  });
}
async function mutate(db: AdminYoutubeDiscoveryDatabase, principal: RequestPrincipal, id: string, values: Record<string, unknown>, valid: boolean, origin?: "operator") {
  if (!valid || !id.trim() || id.length > 128) throw new Error("Invalid YouTube Discovery query proposal.");
  const actor = actorFor(principal);
  return db.transaction(async (transaction) => {
    // Policy transitions lock this row before proposal rows. Keep operator
    // commands in the same order to prevent a transition/command lock cycle.
    const [policy] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    if (origin) {
      const [existing] = await transaction.select({ id: youtubeDiscoveryQueryProposals.id, origin: youtubeDiscoveryQueryProposals.origin }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.id, id)).limit(1).for("update");
      if (existing?.origin === "system") {
        await recordAuditEvent({ actor, operation: "update", targetType: "youtube_discovery_query_proposal", targetId: existing.id, afterSummary: JSON.stringify({ action: "edit_rejected", reason: "system_origin_immutable" }) }, transaction);
        return null;
      }
    }
    const [row] = await transaction.update(youtubeDiscoveryQueryProposals).set(values).where(origin ? sql`${youtubeDiscoveryQueryProposals.id} = ${id} and ${youtubeDiscoveryQueryProposals.origin} = ${origin}` : eq(youtubeDiscoveryQueryProposals.id, id)).returning();
    if (!row) return null;
    await audit(transaction, actor, "update", row.id, row);
    return projection(row, policy?.enabled ?? false);
  });
}
function actorFor(principal: RequestPrincipal) { if (!principal.email) throw new Error("Audit actor unavailable."); return createUserAuditActor({ userId: principal.userId, email: principal.email }); }
async function audit(transaction: Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (arg: infer T) => unknown ? T : never, actor: ReturnType<typeof createUserAuditActor>, operation: "create" | "update", id: string, row: typeof youtubeDiscoveryQueryProposals.$inferSelect) { await recordAuditEvent({ actor, operation, targetType: "youtube_discovery_query_proposal", targetId: id, afterSummary: JSON.stringify({ origin: row.origin, priority: row.priority, enabled: row.enabled, cadenceMinutes: row.cadenceMinutes }) }, transaction); }
function projection(row: typeof youtubeDiscoveryQueryProposals.$inferSelect, policyEnabled: boolean) { return { id: row.id, origin: row.origin, queryText: row.queryText, reason: row.reason, priority: row.priority, enabled: row.enabled, cadenceMinutes: row.cadenceMinutes, nextRunAt: row.enabled && policyEnabled ? row.nextDueAt?.toISOString() ?? null : null, pausedReason: !row.enabled ? "operator" as const : !policyEnabled ? "global" as const : null }; }

type IncidentRow = { runId: string; queryProposalId: string | null; category: "provider_rate_limited" | "triage_schema_invalid" | "execution_terminal" | null; terminalAt: Date | null; priority: number; failures: number; windowHours: number; state: "queued" | "running" | "retrying" | "completed" | "failed" | "cancelled" };
function groupedIncidents(rows: IncidentRow[], now: number): Array<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }> {
  const groups = new Map<string, IncidentRow[]>();
  const successes = new Map<string, Date>();
  for (const row of rows) if (row.queryProposalId && row.state === "completed" && row.terminalAt && (!successes.get(row.queryProposalId) || successes.get(row.queryProposalId)! < row.terminalAt)) successes.set(row.queryProposalId, row.terminalAt);
  for (const row of rows) if (row.queryProposalId && row.category && row.terminalAt && row.state === "failed") groups.set(`${row.queryProposalId}:${row.category}`, [...(groups.get(`${row.queryProposalId}:${row.category}`) ?? []), row]);
  const items: Array<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }> = [];
  for (const [groupId, group] of groups) {
    const latest = group.reduce((current, row) => row.terminalAt! > current.terminalAt! || row.terminalAt!.getTime() === current.terminalAt!.getTime() && row.runId > current.runId ? row : current);
    const latestFailure = latest.terminalAt!;
    if (latest.category === "provider_rate_limited" && successes.get(latest.queryProposalId!) && successes.get(latest.queryProposalId!)! > latestFailure) continue;
    // Thresholds are immutable run-policy semantics; a newer policy must not
    // count failures classified under an older policy version.
    const recent = group.filter((row) => row.failures === latest.failures && row.windowHours === latest.windowHours && now - row.terminalAt!.getTime() <= latest.windowHours * 3_600_000);
    if (latest.category !== "provider_rate_limited" && recent.length < latest.failures) continue;
    const occurredAt = group.reduce((oldest, row) => row.terminalAt! < oldest ? row.terminalAt! : oldest, group[0]!.terminalAt!);
    const priority = group.reduce((mostUrgent, row) => Math.min(mostUrgent, row.priority), latest.priority);
    const reason = latest.category === "provider_rate_limited" ? "provider_rate_limited" : latest.category === "triage_schema_invalid" ? "triage_schema_invalid" : "execution_persistent_failure";
    items.push({ kind: "health_incident", actionId: groupId, destination: "health", reason, priority, occurredAt: occurredAt.toISOString(), urgency: 0 });
  }
  return items;
}
function compareActionItems(left: AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, right: AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }) { return compareActionTuple(left, right); }
function compareActionTuple(left: Pick<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, "urgency" | "priority" | "occurredAt" | "kind" | "actionId">, right: Pick<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, "urgency" | "priority" | "occurredAt" | "kind" | "actionId">) { return left.urgency - right.urgency || left.priority - right.priority || left.occurredAt.localeCompare(right.occurredAt) || left.kind.localeCompare(right.kind) || left.actionId.localeCompare(right.actionId); }
function sameActionTuple(item: AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, cursor: { urgency: number; priority: number; occurredAt: string; kind: string; actionId: string }) { return item.urgency === cursor.urgency && item.priority === cursor.priority && item.occurredAt === cursor.occurredAt && item.kind === cursor.kind && item.actionId === cursor.actionId; }
function validActionCursor(value: unknown): value is { version: 1; urgency: number; priority: number; occurredAt: string; kind: AdminYoutubeDiscoveryActionRequiredItem["kind"]; actionId: string } { return typeof value === "object" && value !== null && Object.keys(value).length === 6 && (value as { version?: unknown }).version === 1 && Number.isSafeInteger((value as { urgency?: unknown }).urgency) && Number.isSafeInteger((value as { priority?: unknown }).priority) && typeof (value as { occurredAt?: unknown }).occurredAt === "string" && new Date((value as { occurredAt: string }).occurredAt).toISOString() === (value as { occurredAt: string }).occurredAt && ["candidate_review", "mission_need", "health_incident", "knowledge_recommendation"].includes((value as { kind?: string }).kind ?? "") && typeof (value as { actionId?: unknown }).actionId === "string" && (value as { actionId: string }).actionId.length > 0 && (value as { actionId: string }).actionId.length <= 128; }
