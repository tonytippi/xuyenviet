import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { YoutubeDiscoveryActionRequiredCursorValidationError, YoutubeDiscoveryHealthCursorValidationError, YoutubeDiscoveryMissionCursorValidationError, YoutubeDiscoveryReviewCursorValidationError, type AdminYoutubeDiscoveryDependencies, type AdminYoutubeDiscoveryPort } from "@xuyenviet/domain";
import type { AdminYoutubeDiscoveryActionRequiredItem, AdminYoutubeDiscoveryHealthIncidentCursor, AdminYoutubeDiscoveryHealthIncidentDetail, AdminYoutubeDiscoveryMissionCandidate, AdminYoutubeDiscoveryPausedRun, RequestPrincipal } from "@xuyenviet/contracts";
import { adminYoutubeDiscoveryActionRequiredPageSize, adminYoutubeDiscoveryHealthIncidentPageSize, adminYoutubeDiscoveryHealthStageWindowHours, adminYoutubeDiscoveryMissionPageSize, adminYoutubeDiscoveryReviewPageSize, encodeAdminYoutubeDiscoveryActionRequiredCursor, encodeAdminYoutubeDiscoveryHealthIncidentCursor, encodeAdminYoutubeDiscoveryMissionCandidateCursor, encodeAdminYoutubeDiscoveryMissionQueryCursor, encodeAdminYoutubeDiscoveryReviewCursor } from "@xuyenviet/contracts";
import type { YoutubeCaptureEligibilityPort } from "@xuyenviet/domain";
import { getDb } from "./client";
import { createUserAuditActor } from "./actors";
import { recordAuditEvent } from "./audit-writers";
import { createYoutubeDiscoveryPolicyVersion } from "./youtube-discovery";
import { aiUsageEvents, youtubeDiscoveryAppearances, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryKnowledgeHandoffs, youtubeDiscoveryPlanningLeases, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryRankingHistory, youtubeDiscoveryRecommendations, youtubeDiscoveryRuns } from "./schema";

const validText = (value: unknown) => typeof value === "string" && value.trim() === value && /^[\p{L}\p{N} '-]{1,240}$/u.test(value);
const validPriority = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 100;
const validCadence = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 15 && (value as number) <= 10_080;
const handoffTimeoutMs = 5_000;
type AdminYoutubeDiscoveryDatabase = Pick<ReturnType<typeof getDb>, "execute" | "insert" | "select" | "transaction" | "update" | "delete">;

export function createPostgresAdminYoutubeDiscoveryPort(captureEligibility: YoutubeCaptureEligibilityPort = { async check() { return "unavailable"; } }, db: AdminYoutubeDiscoveryDatabase = getDb(), handoff: AdminYoutubeDiscoveryDependencies["knowledgeHandoff"] = { async submit() { return "reconciling"; }, async lookup() { return "reconciling"; } }, actionOwners: NonNullable<AdminYoutubeDiscoveryDependencies["actionOwners"]> = { async admitsActionCursor() { return false; }, async listMissionNeeds() { return []; }, async listKnowledgeRecommendations() { return []; } }, missionOwners: NonNullable<AdminYoutubeDiscoveryDependencies["missionOwners"]> = { async listMissionCoverage() { return { items: [], nextCursor: null }; }, async getMissionDetail() { return null; } }): AdminYoutubeDiscoveryPort {
  return {
    async list() {
      const rows = await db.select({ id: youtubeDiscoveryQueryProposals.id, origin: youtubeDiscoveryQueryProposals.origin, queryText: youtubeDiscoveryQueryProposals.queryText, reason: youtubeDiscoveryQueryProposals.reason, priority: youtubeDiscoveryQueryProposals.priority, enabled: youtubeDiscoveryQueryProposals.enabled, cadenceMinutes: youtubeDiscoveryQueryProposals.cadenceMinutes, nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt, policyEnabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryQueryProposals).leftJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).orderBy(asc(youtubeDiscoveryQueryProposals.createdAt)).limit(200);
      return { items: rows.map((row) => ({ id: row.id, origin: row.origin, queryText: row.queryText, reason: row.reason, priority: row.priority, enabled: row.enabled, cadenceMinutes: row.cadenceMinutes, nextRunAt: row.enabled && row.policyEnabled === true ? row.nextDueAt?.toISOString() ?? null : null, pausedReason: !row.enabled ? "operator" : row.policyEnabled !== true ? "global" : null })) };
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
        db.select({ runId: youtubeDiscoveryRuns.id, queryProposalId: youtubeDiscoveryRuns.queryProposalId, category: youtubeDiscoveryRuns.incidentCategory, terminalAt: youtubeDiscoveryRuns.terminalAt, retryAt: youtubeDiscoveryRuns.nextRunAt, priority: youtubeDiscoveryQueryProposals.priority, failures: youtubeDiscoveryPolicyVersions.actionQueuePersistentIncidentFailureCount, windowHours: youtubeDiscoveryPolicyVersions.actionQueuePersistentIncidentWindowHours, state: youtubeDiscoveryRuns.state }).from(youtubeDiscoveryRuns).innerJoin(youtubeDiscoveryQueryProposals, eq(youtubeDiscoveryQueryProposals.id, youtubeDiscoveryRuns.queryProposalId)).innerJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.id, youtubeDiscoveryRuns.policyVersionId)).where(and(sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, or(sql`${youtubeDiscoveryRuns.state} in ('failed', 'completed') and ${youtubeDiscoveryRuns.terminalAt} is not null`, and(eq(youtubeDiscoveryRuns.state, "retrying"), eq(youtubeDiscoveryRuns.incidentCategory, "provider_rate_limited"))))).orderBy(asc(youtubeDiscoveryRuns.terminalAt), asc(youtubeDiscoveryRuns.nextRunAt), asc(youtubeDiscoveryRuns.id)),
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
    async listMissionCoverage(cursor) { return missionOwners.listMissionCoverage(cursor); },
    async listMissionQueries(cursor) {
      if (cursor) {
        const [anchor] = await db.select({ id: youtubeDiscoveryQueryProposals.id }).from(youtubeDiscoveryQueryProposals).where(and(eq(youtubeDiscoveryQueryProposals.id, cursor.id), eq(youtubeDiscoveryQueryProposals.priority, cursor.priority), eq(queryCreatedAtCursorKey, cursor.createdAt))).limit(1);
        if (!anchor) throw new YoutubeDiscoveryMissionCursorValidationError("Invalid YouTube Discovery Mission cursor.");
      }
      const rows = await db.select({ id: youtubeDiscoveryQueryProposals.id, origin: youtubeDiscoveryQueryProposals.origin, queryText: youtubeDiscoveryQueryProposals.queryText, reason: youtubeDiscoveryQueryProposals.reason, priority: youtubeDiscoveryQueryProposals.priority, enabled: youtubeDiscoveryQueryProposals.enabled, cadenceMinutes: youtubeDiscoveryQueryProposals.cadenceMinutes, nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt, createdAt: youtubeDiscoveryQueryProposals.createdAt, cursorCreatedAt: queryCreatedAtCursorKey, policyEnabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryQueryProposals).leftJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).where(cursor ? or(gt(youtubeDiscoveryQueryProposals.priority, cursor.priority), and(eq(youtubeDiscoveryQueryProposals.priority, cursor.priority), gt(queryCreatedAtCursorKey, cursor.createdAt)), and(eq(youtubeDiscoveryQueryProposals.priority, cursor.priority), eq(queryCreatedAtCursorKey, cursor.createdAt), gt(youtubeDiscoveryQueryProposals.id, cursor.id))) : undefined).orderBy(asc(youtubeDiscoveryQueryProposals.priority), asc(queryCreatedAtCursorKey), asc(youtubeDiscoveryQueryProposals.id)).limit(adminYoutubeDiscoveryMissionPageSize + 1);
      const items = rows.slice(0, adminYoutubeDiscoveryMissionPageSize).map((row) => ({ id: row.id, origin: row.origin, queryText: row.queryText, reason: row.reason, priority: row.priority, enabled: row.enabled, cadenceMinutes: row.cadenceMinutes, nextRunAt: row.enabled && row.policyEnabled ? row.nextDueAt?.toISOString() ?? null : null, pausedReason: !row.enabled ? "operator" as const : !row.policyEnabled ? "global" as const : null }));
      const last = rows[adminYoutubeDiscoveryMissionPageSize - 1];
      return { items, nextCursor: rows.length > adminYoutubeDiscoveryMissionPageSize && last ? encodeAdminYoutubeDiscoveryMissionQueryCursor({ version: 1, priority: last.priority, createdAt: last.cursorCreatedAt, id: last.id }) : null };
    },
    async listMissionCandidates(cursor) {
      const candidates = await missionCandidates(db);
      if (cursor && !candidates.some((item) => item.actionId === cursor.actionId && item.priority === cursor.priority && item.rank === cursor.rank && item.rankedAt === cursor.rankedAt && item.candidateId === cursor.candidateId)) throw new YoutubeDiscoveryMissionCursorValidationError("Invalid YouTube Discovery Mission cursor.");
      const after = cursor ? candidates.filter((item) => compareMissionCandidate(item, cursor) > 0) : candidates;
      const items = after.slice(0, adminYoutubeDiscoveryMissionPageSize);
      const last = items.at(-1);
      return { items, nextCursor: after.length > items.length && last ? encodeAdminYoutubeDiscoveryMissionCandidateCursor({ version: 1, actionId: last.actionId, priority: last.priority, rank: last.rank, rankedAt: last.rankedAt, candidateId: last.candidateId }) : null };
    },
    async missionFunnel() {
      const candidates = await missionCandidates(db);
      const funnelCandidates = new Map<string, AdminYoutubeDiscoveryMissionCandidate>();
      for (const candidate of [...candidates].sort((left, right) => right.rankedAt.localeCompare(left.rankedAt) || right.candidateId.localeCompare(left.candidateId) || left.actionId.localeCompare(right.actionId))) if (!funnelCandidates.has(candidate.candidateId)) funnelCandidates.set(candidate.candidateId, candidate);
      const counts = { discovered: 0, enriched: 0, triaged: 0, recommended: 0, pendingReview: 0, accepted: 0, deferred: 0, skipped: 0 };
      for (const candidate of funnelCandidates.values()) { counts[candidate.rankingState] += 1; if (candidate.candidateState !== "unavailable") counts[`${candidate.candidateState === "pending" ? "pendingReview" : candidate.candidateState}`] += 1; }
      return { asOf: new Date().toISOString(), ...counts };
    },
    async getMissionDetail(actionId, cursor) {
      const coverage = await missionOwners.getMissionDetail(actionId);
      if (!coverage) return null;
      const [proposal] = await db.select({ id: youtubeDiscoveryQueryProposals.id, origin: youtubeDiscoveryQueryProposals.origin, queryText: youtubeDiscoveryQueryProposals.queryText, reason: youtubeDiscoveryQueryProposals.reason, priority: youtubeDiscoveryQueryProposals.priority, enabled: youtubeDiscoveryQueryProposals.enabled, cadenceMinutes: youtubeDiscoveryQueryProposals.cadenceMinutes, nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt, policyEnabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryQueryProposals).leftJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).where(and(eq(youtubeDiscoveryQueryProposals.missionActionId, actionId), eq(youtubeDiscoveryQueryProposals.origin, "system"))).limit(1);
      if (!proposal) return null;
      const [run] = await db.select({ state: youtubeDiscoveryRuns.state, createdAt: youtubeDiscoveryRuns.createdAt, attemptCount: youtubeDiscoveryRuns.attemptCount, incidentCategory: youtubeDiscoveryRuns.incidentCategory }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.queryProposalId, proposal.id)).orderBy(desc(youtubeDiscoveryRuns.createdAt), desc(youtubeDiscoveryRuns.id)).limit(1);
      const candidates = (await missionCandidates(db)).filter((candidate) => candidate.actionId === actionId);
      if (cursor && !candidates.some((item) => item.actionId === cursor.actionId && item.priority === cursor.priority && item.rank === cursor.rank && item.rankedAt === cursor.rankedAt && item.candidateId === cursor.candidateId)) throw new YoutubeDiscoveryMissionCursorValidationError("Invalid YouTube Discovery Mission cursor.");
      const after = cursor ? candidates.filter((item) => compareMissionCandidate(item, cursor) > 0) : candidates;
      const items = after.slice(0, adminYoutubeDiscoveryMissionPageSize);
      const last = items.at(-1);
      return { coverage, query: { id: proposal.id, origin: proposal.origin, queryText: proposal.queryText, reason: proposal.reason, priority: proposal.priority, enabled: proposal.enabled, cadenceMinutes: proposal.cadenceMinutes, nextRunAt: proposal.enabled && proposal.policyEnabled ? proposal.nextDueAt?.toISOString() ?? null : null, pausedReason: !proposal.enabled ? "operator" as const : !proposal.policyEnabled ? "global" as const : null }, latestRun: run ? { state: run.state, createdAt: run.createdAt.toISOString(), retryCount: run.attemptCount, terminalCategory: run.incidentCategory ?? "unavailable" } : { state: "unavailable", createdAt: null, retryCount: null, terminalCategory: "unavailable" }, candidates: { items, nextCursor: after.length > items.length && last ? encodeAdminYoutubeDiscoveryMissionCandidateCursor({ version: 1, actionId, priority: last.priority, rank: last.rank, rankedAt: last.rankedAt, candidateId: last.candidateId }) : null } };
    },
    async healthOverview() {
      const now = new Date(); const staleBefore = new Date(now.getTime() - adminYoutubeDiscoveryHealthStageWindowHours * 3_600_000);
      const [policyRows, planningRows, runRows, stageRows, stageFreshnessRows, reviewRows, usageRows, usageFreshnessRows, scheduleRows, pausedProposalRows] = await Promise.all([
        db.select({ enabled: youtubeDiscoveryPolicyVersions.enabled, cadenceMinutes: youtubeDiscoveryPolicyVersions.cadenceMinutes, createdAt: youtubeDiscoveryPolicyVersions.createdAt }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1),
        db.select({ state: youtubeDiscoveryPlanningLeases.state, terminalAt: youtubeDiscoveryPlanningLeases.terminalAt, createdAt: youtubeDiscoveryPlanningLeases.createdAt }).from(youtubeDiscoveryPlanningLeases).where(eq(youtubeDiscoveryPlanningLeases.id, "youtube-discovery-planning")).limit(1),
        healthRuns(db),
        db.select({ discovered: sql<number>`count(*) filter (where ${youtubeDiscoveryRankingHistory.stage} = 'discovered')`, enriched: sql<number>`count(*) filter (where ${youtubeDiscoveryRankingHistory.stage} = 'enriched')`, triaged: sql<number>`count(*) filter (where ${youtubeDiscoveryRankingHistory.stage} = 'triaged')`, recommended: sql<number>`count(*) filter (where ${youtubeDiscoveryRankingHistory.stage} = 'recommended')` }).from(youtubeDiscoveryRankingHistory).where(gt(youtubeDiscoveryRankingHistory.createdAt, staleBefore)),
        db.select({ lastUpdatedAt: sql<Date | null>`max(${youtubeDiscoveryRankingHistory.createdAt})` }).from(youtubeDiscoveryRankingHistory),
        db.select({ pending: sql<number>`count(*) filter (where ${youtubeDiscoveryCandidateReviewStates.state} = 'pending')`, deferred: sql<number>`count(*) filter (where ${youtubeDiscoveryCandidateReviewStates.state} = 'deferred')`, missingDeferredAt: sql<number>`count(*) filter (where ${youtubeDiscoveryCandidateReviewStates.state} = 'deferred' and ${youtubeDiscoveryCandidateReviewStates.deferredAt} is null)`, oldestDeferredAt: sql<Date | null>`min(${youtubeDiscoveryCandidateReviewStates.deferredAt}) filter (where ${youtubeDiscoveryCandidateReviewStates.state} = 'deferred')`, lastUpdatedAt: sql<Date | null>`max(${youtubeDiscoveryCandidateReviewStates.deferredAt}) filter (where ${youtubeDiscoveryCandidateReviewStates.state} = 'deferred')` }).from(youtubeDiscoveryCandidateReviewStates),
        db.select({ requests: sql<number>`count(*)`, totalTokens: sql<number | null>`case when count(*) = 0 or count(*) filter (where ${aiUsageEvents.totalTokens} is null) > 0 then null else sum(${aiUsageEvents.totalTokens}) end`, costMicros: sql<number | null>`case when count(*) = 0 or count(*) filter (where ${aiUsageEvents.estimatedTotalCostMicros} is null) > 0 then null else sum(${aiUsageEvents.estimatedTotalCostMicros}) end` }).from(aiUsageEvents).where(and(eq(aiUsageEvents.executorSystem, "system-youtube-discovery"), eq(aiUsageEvents.purpose, "youtube_discovery_triage"), sql`${aiUsageEvents.youtubeDiscoveryRunId} is not null`, gt(aiUsageEvents.createdAt, staleBefore))),
        db.select({ latestAt: sql<Date | null>`max(${aiUsageEvents.createdAt})` }).from(aiUsageEvents).where(and(eq(aiUsageEvents.executorSystem, "system-youtube-discovery"), eq(aiUsageEvents.purpose, "youtube_discovery_triage"), sql`${aiUsageEvents.youtubeDiscoveryRunId} is not null`)),
        db.select({ enabled: youtubeDiscoveryQueryProposals.enabled, cadenceMinutes: youtubeDiscoveryQueryProposals.cadenceMinutes, nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt, scheduleAnchorAt: youtubeDiscoveryQueryProposals.scheduleAnchorAt, createdAt: youtubeDiscoveryQueryProposals.createdAt }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.enabled, true)).orderBy(asc(youtubeDiscoveryQueryProposals.nextDueAt), asc(youtubeDiscoveryQueryProposals.id)).limit(1),
        db.select({ id: youtubeDiscoveryQueryProposals.id, createdAt: youtubeDiscoveryQueryProposals.createdAt }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.enabled, false)).limit(1),
      ]);
      const policy = policyRows[0]; const pausedRunRows = policy?.enabled === false ? await pausedRunContext(db, policy.createdAt) : []; const planning = planningRows[0]; const latest = runRows[0]; const incidents = groupedIncidents(runRows, now.getTime()).sort(compareActionItems).slice(0, adminYoutubeDiscoveryActionRequiredPageSize).map(({ urgency: _urgency, ...incident }) => incident); const stages = stageRows[0]!; const stageFreshness = stageFreshnessRows[0]!; const backlog = reviewRows[0]!; const usage = usageRows[0]!; const usageFreshness = usageFreshnessRows[0]!; const schedule = scheduleRows[0]; const pausedProposal = pausedProposalRows[0];
      const planningAt = planning?.terminalAt ?? planning?.createdAt ?? null;
      const planningFreshness = planningAt && policy ? freshnessAt(planningAt, policy.cadenceMinutes, now) : "unavailable" as const;
      const latestFreshness = latest ? freshnessAt(latest.terminalAt ?? latest.createdAt, latest.cadenceMinutes, now) : "unavailable" as const;
      const latestUsageAt = usageFreshness.latestAt && new Date(usageFreshness.latestAt);
      const scheduleAt = schedule?.nextDueAt ?? schedule?.scheduleAnchorAt ?? schedule?.createdAt ?? null;
      const querySchedule = !policy ? { enabled: null, cadenceMinutes: null, nextRunAt: null, lastUpdatedAt: null, freshness: "unavailable" as const } : !policy.enabled || pausedProposal && !schedule ? { enabled: false, cadenceMinutes: policy.cadenceMinutes, nextRunAt: null, lastUpdatedAt: pausedProposal?.createdAt.toISOString() ?? policy.createdAt.toISOString(), freshness: "unavailable" as const } : schedule ? { enabled: true, cadenceMinutes: schedule.cadenceMinutes, nextRunAt: schedule.nextDueAt?.toISOString() ?? null, lastUpdatedAt: (schedule.scheduleAnchorAt ?? schedule.createdAt).toISOString(), freshness: scheduleAt ? freshnessAt(scheduleAt, schedule.cadenceMinutes, now) : "unavailable" as const } : { enabled: true, cadenceMinutes: policy.cadenceMinutes, nextRunAt: null, lastUpdatedAt: policy.createdAt.toISOString(), freshness: "unavailable" as const };
      const planningResult = planning ? { state: planning.state, at: planningAt!.toISOString(), lastUpdatedAt: planningAt!.toISOString(), nextRunAt: null, retryCount: 0, category: "unavailable" as const, freshness: planningFreshness } : unavailableHealthRun("no_run");
      const latestQueryRun = latest ? { ...healthRun(latest, policy?.enabled === false), freshness: latestFreshness } : unavailableHealthRun("no_run");
      const stageLastUpdatedAt = dateOrNull(stageFreshness.lastUpdatedAt);
      const backlogLastUpdatedAt = dateOrNull(backlog.lastUpdatedAt);
      const usageLastUpdatedAt = latestUsageAt?.toISOString() ?? null;
      const lastUpdatedAt = latestDate([planningAt, querySchedule.lastUpdatedAt ? new Date(querySchedule.lastUpdatedAt) : null, latestQueryRun.lastUpdatedAt ? new Date(latestQueryRun.lastUpdatedAt) : null, stageLastUpdatedAt, backlogLastUpdatedAt, latestUsageAt]);
      const usageRequests = Number(usage.requests); const totalTokens = usage.totalTokens === null ? null : Number(usage.totalTokens); const costMicros = usage.costMicros === null ? null : Number(usage.costMicros);
      // Missing token usage takes precedence if both telemetry dimensions are incomplete.
      const usageAvailability = usageRequests === 0 ? "missing" as const : totalTokens === null ? "incomplete_usage" as const : costMicros === null ? "incomplete_pricing" as const : "available" as const;
      const pausedRuns: AdminYoutubeDiscoveryPausedRun[] = policy?.enabled === false ? pausedRunRows.flatMap<AdminYoutubeDiscoveryPausedRun>((run) => {
        const at = run.state === "running" ? run.claimedAt : run.terminalAt;
        if (!at) return [];
        if (run.state === "running") return [{ runId: run.runId, state: "fencing_requested" as const, at: at.toISOString() }];
        if (run.state === "cancelled" && run.safeErrorCode === "policy_revoked") return [{ runId: run.runId, state: "policy_revoked" as const, at: at.toISOString() }];
        if (run.state === "completed" && run.terminalAt && run.terminalAt < policy.createdAt) return [{ runId: run.runId, state: "completed_before_disabled" as const, at: run.terminalAt.toISOString() }];
        return [];
      }) : [];
      return { asOf: now.toISOString(), lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null, policy: { enabled: policy?.enabled ?? null }, planning: planningResult, querySchedule, latestQueryRun, pausedRuns, throughput: { windowHours: adminYoutubeDiscoveryHealthStageWindowHours, discovered: Number(stages.discovered), enriched: Number(stages.enriched), triaged: Number(stages.triaged), recommended: Number(stages.recommended), lastUpdatedAt: stageLastUpdatedAt?.toISOString() ?? null, freshness: !stageLastUpdatedAt ? "unavailable" as const : stageLastUpdatedAt >= staleBefore ? "current" as const : "stale" as const }, backlog: { pending: Number(backlog.pending), deferred: Number(backlog.deferred), oldestDeferredAt: Number(backlog.missingDeferredAt) || !backlog.oldestDeferredAt ? null : backlog.oldestDeferredAt.toISOString(), deferredAge: Number(backlog.missingDeferredAt) || !backlog.oldestDeferredAt ? "unavailable" as const : "available" as const, lastUpdatedAt: backlogLastUpdatedAt?.toISOString() ?? null }, incidents, usage: { availability: usageAvailability, requests: usageRequests, totalTokens, costMicros, lastUpdatedAt: usageLastUpdatedAt, freshness: !latestUsageAt ? "unavailable" as const : latestUsageAt >= staleBefore ? "current" as const : "stale" as const } };
    },
    async setEnabled(principal, enabled) {
      const actor = actorFor(principal);
      return db.transaction(async (transaction) => {
        const [current] = await transaction.select().from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
        if (!current) throw new Error("YouTube Discovery policy is unavailable.");
        if (current.enabled === enabled) return { enabled: current.enabled, version: current.version, createdAt: current.createdAt.toISOString(), changed: false };
        const created = await createYoutubeDiscoveryPolicyVersion({ version: current.version + 1, isCurrent: true, policy: { enabled, minimumCandidateScore: Number(current.minimumCandidateScore), priorityScoreWeight: Number(current.priorityScoreWeight), freshnessScoreWeight: Number(current.freshnessScoreWeight), relevanceWeight: Number(current.relevanceWeight), expectedValueWeight: Number(current.expectedValueWeight), freshnessFitWeight: Number(current.freshnessFitWeight), commercialRiskWeight: Number(current.commercialRiskWeight), duplicateRiskWeight: Number(current.duplicateRiskWeight), deferMinimum: Number(current.deferMinimum), considerMinimum: Number(current.considerMinimum), cadenceMinutes: current.cadenceMinutes, retentionDays: current.retentionDays, commentSignalTtlDays: current.commentSignalTtlDays, maxConcurrentRuns: current.maxConcurrentRuns, maxRetryAttempts: current.maxRetryAttempts, retryDelayMinutes: current.retryDelayMinutes, actionQueueHighPriorityMaximum: current.actionQueueHighPriorityMaximum, actionQueueMaximumOperatorReviewAgeHours: current.actionQueueMaximumOperatorReviewAgeHours, actionQueueMaximumMissionStallHours: current.actionQueueMaximumMissionStallHours, actionQueuePersistentIncidentFailureCount: current.actionQueuePersistentIncidentFailureCount, actionQueuePersistentIncidentWindowHours: current.actionQueuePersistentIncidentWindowHours }, actor }, transaction);
        return { enabled: created.enabled, version: created.version, createdAt: created.createdAt.toISOString(), changed: true };
      });
    },
    async getHealthIncident(groupId, cursor) {
      if (!validHealthGroup(groupId) || cursor && (!validHealthCursor(cursor) || cursor.groupId !== groupId)) throw new YoutubeDiscoveryHealthCursorValidationError("Invalid YouTube Discovery Health cursor.");
      const rows = await healthRuns(db); const admitted = admittedIncidentRows(rows, Date.now()).get(groupId);
      if (!admitted) return null;
      const category = groupId.slice(groupId.lastIndexOf(":") + 1) as "provider_rate_limited" | "triage_schema_invalid" | "execution_terminal";
      const proposalId = groupId.slice(0, groupId.lastIndexOf(":"));
      const clearingAt = category === "provider_rate_limited" ? rows.filter((row) => row.queryProposalId === proposalId && row.state === "completed" && row.terminalAt).reduce<Date | null>((latest, row) => !latest || row.terminalAt! > latest ? row.terminalAt : latest, null) : null;
      const active = and(eq(youtubeDiscoveryRuns.queryProposalId, proposalId), eq(youtubeDiscoveryRuns.incidentCategory, category), category === "provider_rate_limited" ? or(eq(youtubeDiscoveryRuns.state, "retrying"), eq(youtubeDiscoveryRuns.state, "failed"), eq(youtubeDiscoveryRuns.state, "completed")) : inArray(youtubeDiscoveryRuns.id, admitted.map((row) => row.runId)), sql`${youtubeDiscoveryRuns.terminalAt} is not null or ${youtubeDiscoveryRuns.state} = 'retrying'`, clearingAt ? gt(sql<Date>`coalesce(${youtubeDiscoveryRuns.terminalAt}, ${youtubeDiscoveryRuns.nextRunAt})`, clearingAt) : undefined);
      const healthIncidentAtCursorKey = sql<string>`to_char(coalesce(${youtubeDiscoveryRuns.terminalAt}, ${youtubeDiscoveryRuns.nextRunAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
      const cursorAfter = cursor ? or(lt(healthIncidentAtCursorKey, cursor.at), and(eq(healthIncidentAtCursorKey, cursor.at), lt(youtubeDiscoveryRuns.id, cursor.runId))) : undefined;
      if (cursor) { const [anchor] = await db.select({ id: youtubeDiscoveryRuns.id }).from(youtubeDiscoveryRuns).where(and(active, eq(youtubeDiscoveryRuns.id, cursor.runId), eq(healthIncidentAtCursorKey, cursor.at))).limit(1); if (!anchor) throw new YoutubeDiscoveryHealthCursorValidationError("Invalid YouTube Discovery Health cursor."); }
      const relevant = await db.select({ runId: youtubeDiscoveryRuns.id, state: youtubeDiscoveryRuns.state, terminalAt: youtubeDiscoveryRuns.terminalAt, retryAt: youtubeDiscoveryRuns.nextRunAt, retryCount: youtubeDiscoveryRuns.attemptCount, cursorAt: healthIncidentAtCursorKey }).from(youtubeDiscoveryRuns).where(and(active, cursorAfter)).orderBy(desc(healthIncidentAtCursorKey), desc(youtubeDiscoveryRuns.id)).limit(adminYoutubeDiscoveryHealthIncidentPageSize + 1);
      const items = relevant.slice(0, adminYoutubeDiscoveryHealthIncidentPageSize).map((row) => ({ runId: row.runId, state: row.state as "retrying" | "failed" | "completed", stage: "unavailable" as const, phase: row.state === "retrying" ? "retrying" as const : row.state === "completed" ? "completed" as const : "terminal" as const, at: (row.terminalAt ?? row.retryAt).toISOString(), nextRunAt: row.state === "retrying" ? row.retryAt.toISOString() : null, retryCount: row.retryCount, category })); const last = items.at(-1);
      const lastRow = relevant[adminYoutubeDiscoveryHealthIncidentPageSize - 1];
      return { groupId, category, items, nextCursor: relevant.length > items.length && last && lastRow ? encodeAdminYoutubeDiscoveryHealthIncidentCursor({ version: 1, groupId, at: lastRow.cursorAt, runId: last.runId }) : null } as AdminYoutubeDiscoveryHealthIncidentDetail;
    },
  };
}
// Fixed-width UTC microsecond text preserves database ordering in the opaque cursor.
const createdAtCursorKey = sql<string>`to_char(${youtubeDiscoveryRecommendations.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const queryCreatedAtCursorKey = sql<string>`to_char(${youtubeDiscoveryQueryProposals.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
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
    const [updated] = await transaction.update(youtubeDiscoveryCandidateReviewStates).set({ state: decision, deferredAt: decision === "deferred" ? sql`clock_timestamp()` : null }).where(and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, row.candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, recommendationId), eq(youtubeDiscoveryCandidateReviewStates.state, "pending"))).returning({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId });
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

/** Mission is deliberately select-only: unlike listReview, this never reconciles handoffs. */
async function missionCandidates(db: AdminYoutubeDiscoveryDatabase): Promise<AdminYoutubeDiscoveryMissionCandidate[]> {
  const rows = await db.select({ candidateId: youtubeDiscoveryCandidates.id, actionId: youtubeDiscoveryQueryProposals.missionActionId, priority: youtubeDiscoveryQueryProposals.priority, rank: youtubeDiscoveryAppearances.resultOrdinal, rankingId: youtubeDiscoveryRankingHistory.id, rankedAt: youtubeDiscoveryRankingHistory.createdAt, stage: youtubeDiscoveryRankingHistory.stage, recommendationId: youtubeDiscoveryRecommendations.id, recommendation: youtubeDiscoveryRecommendations.recommendation, reviewState: youtubeDiscoveryCandidateReviewStates.state }).from(youtubeDiscoveryRankingHistory).innerJoin(youtubeDiscoveryAppearances, and(eq(youtubeDiscoveryAppearances.id, youtubeDiscoveryRankingHistory.appearanceId), eq(youtubeDiscoveryAppearances.candidateId, youtubeDiscoveryRankingHistory.candidateId), eq(youtubeDiscoveryAppearances.runId, youtubeDiscoveryRankingHistory.runId))).innerJoin(youtubeDiscoveryRuns, eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRankingHistory.runId)).innerJoin(youtubeDiscoveryQueryProposals, and(eq(youtubeDiscoveryQueryProposals.id, youtubeDiscoveryRuns.queryProposalId), eq(youtubeDiscoveryQueryProposals.origin, "system"), sql`${youtubeDiscoveryQueryProposals.missionActionId} is not null`)).innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryRankingHistory.candidateId)).leftJoin(youtubeDiscoveryRecommendations, eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryRankingHistory.recommendationId)).leftJoin(youtubeDiscoveryCandidateReviewStates, and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, youtubeDiscoveryRankingHistory.candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, youtubeDiscoveryRecommendations.id))).orderBy(desc(youtubeDiscoveryRankingHistory.createdAt), desc(youtubeDiscoveryRankingHistory.id));
  const selected = new Map<string, typeof rows[number]>();
  for (const row of rows) if (row.actionId && !selected.has(`${row.actionId}:${row.candidateId}`)) selected.set(`${row.actionId}:${row.candidateId}`, row);
  return [...selected.values()].flatMap((row) => row.actionId ? [{ candidateId: row.candidateId, actionId: row.actionId, priority: row.priority, rank: row.rank, rankedAt: row.rankedAt.toISOString(), rankingState: row.stage, recommendationId: row.recommendationId ?? null, recommendation: (row.recommendation ?? "unavailable") as AdminYoutubeDiscoveryMissionCandidate["recommendation"], candidateState: (row.reviewState ?? "unavailable") as AdminYoutubeDiscoveryMissionCandidate["candidateState"], reviewAvailable: row.recommendation === "consider" && row.reviewState === "pending" }] : []).sort(compareMissionCandidate);
}
function compareMissionCandidate(left: Pick<AdminYoutubeDiscoveryMissionCandidate, "actionId" | "priority" | "rank" | "rankedAt" | "candidateId">, right: Pick<AdminYoutubeDiscoveryMissionCandidate, "actionId" | "priority" | "rank" | "rankedAt" | "candidateId">) { return left.priority - right.priority || left.rank - right.rank || right.rankedAt.localeCompare(left.rankedAt) || left.candidateId.localeCompare(right.candidateId) || left.actionId.localeCompare(right.actionId); }

type IncidentRow = { runId: string; queryProposalId: string | null; category: "provider_rate_limited" | "triage_schema_invalid" | "execution_terminal" | null; terminalAt: Date | null; retryAt: Date; priority: number; failures: number; windowHours: number; state: "queued" | "running" | "retrying" | "completed" | "failed" | "cancelled" };
type HealthRunRow = IncidentRow & { createdAt: Date; nextRunAt: Date; attemptCount: number; queryEnabled: boolean; cadenceMinutes: number; safeErrorCode: string | null };
async function healthRuns(db: AdminYoutubeDiscoveryDatabase): Promise<HealthRunRow[]> {
  return db.select({ runId: youtubeDiscoveryRuns.id, queryProposalId: youtubeDiscoveryRuns.queryProposalId, category: youtubeDiscoveryRuns.incidentCategory, terminalAt: youtubeDiscoveryRuns.terminalAt, retryAt: youtubeDiscoveryRuns.nextRunAt, nextRunAt: youtubeDiscoveryRuns.nextRunAt, createdAt: youtubeDiscoveryRuns.createdAt, attemptCount: youtubeDiscoveryRuns.attemptCount, safeErrorCode: youtubeDiscoveryRuns.safeErrorCode, queryEnabled: youtubeDiscoveryQueryProposals.enabled, cadenceMinutes: youtubeDiscoveryQueryProposals.cadenceMinutes, priority: youtubeDiscoveryQueryProposals.priority, failures: youtubeDiscoveryPolicyVersions.actionQueuePersistentIncidentFailureCount, windowHours: youtubeDiscoveryPolicyVersions.actionQueuePersistentIncidentWindowHours, state: youtubeDiscoveryRuns.state }).from(youtubeDiscoveryRuns).innerJoin(youtubeDiscoveryQueryProposals, eq(youtubeDiscoveryQueryProposals.id, youtubeDiscoveryRuns.queryProposalId)).innerJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.id, youtubeDiscoveryRuns.policyVersionId)).where(sql`${youtubeDiscoveryRuns.queryProposalId} is not null`).orderBy(desc(sql`coalesce(${youtubeDiscoveryRuns.terminalAt}, ${youtubeDiscoveryRuns.createdAt})`), desc(youtubeDiscoveryRuns.id));
}
function healthRun(row: HealthRunRow, suppressNextRunAt = false) { const at = row.terminalAt ?? row.createdAt; return { state: row.state, at: at.toISOString(), lastUpdatedAt: at.toISOString(), nextRunAt: row.state === "retrying" && !suppressNextRunAt ? row.nextRunAt.toISOString() : null, retryCount: row.attemptCount, category: row.category ?? "unavailable" as const }; }
async function pausedRunContext(db: AdminYoutubeDiscoveryDatabase, disabledAt: Date) {
  const displayGroup = sql<number>`case when ${youtubeDiscoveryRuns.state} = 'running' then 0 when ${youtubeDiscoveryRuns.state} = 'cancelled' then 1 else 2 end`;
  return db.select({ runId: youtubeDiscoveryRuns.id, state: youtubeDiscoveryRuns.state, claimedAt: youtubeDiscoveryRuns.claimedAt, terminalAt: youtubeDiscoveryRuns.terminalAt, leaseExpiresAt: youtubeDiscoveryRuns.leaseExpiresAt, createdAt: youtubeDiscoveryRuns.createdAt, safeErrorCode: youtubeDiscoveryRuns.safeErrorCode }).from(youtubeDiscoveryRuns).where(or(and(eq(youtubeDiscoveryRuns.state, "running"), sql`${youtubeDiscoveryRuns.claimedAt} is not null`, gt(youtubeDiscoveryRuns.leaseExpiresAt, sql`clock_timestamp()`)), and(eq(youtubeDiscoveryRuns.state, "cancelled"), eq(youtubeDiscoveryRuns.safeErrorCode, "policy_revoked"), sql`${youtubeDiscoveryRuns.terminalAt} is not null`), and(eq(youtubeDiscoveryRuns.state, "completed"), sql`${youtubeDiscoveryRuns.terminalAt} is not null`, lt(youtubeDiscoveryRuns.terminalAt, disabledAt)))).orderBy(asc(displayGroup), desc(youtubeDiscoveryRuns.claimedAt), desc(youtubeDiscoveryRuns.terminalAt), asc(youtubeDiscoveryRuns.id)).limit(20);
}
function unavailableHealthRun(state: "no_run" | "unavailable") { return { state, at: null, lastUpdatedAt: null, nextRunAt: null, retryCount: null, category: "unavailable" as const, freshness: "unavailable" as const }; }
function freshnessAt(at: Date, cadenceMinutes: number, now: Date) { return now.getTime() - at.getTime() <= cadenceMinutes * 60_000 ? "current" as const : "stale" as const; }
function latestDate(dates: Array<Date | null>) { return dates.reduce<Date | null>((latest, value) => value && (!latest || value > latest) ? value : latest, null); }
function dateOrNull(value: Date | string | null) { return value === null ? null : value instanceof Date ? value : new Date(value); }
function validHealthGroup(value: string) { return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}:(provider_rate_limited|triage_schema_invalid|execution_terminal)$/.test(value); }
function validHealthCursor(cursor: AdminYoutubeDiscoveryHealthIncidentCursor) { return cursor.version === 1 && validHealthGroup(cursor.groupId) && validId(cursor.runId) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at) && new Date(`${cursor.at.slice(0, 23)}Z`).toISOString() === `${cursor.at.slice(0, 23)}Z`; }
function groupedIncidents(rows: IncidentRow[], now: number): Array<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }> {
  const admitted = admittedIncidentRows(rows, now);
  const items: Array<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }> = [];
  for (const [groupId, group] of admitted) {
    const latest = group.reduce((current, row) => incidentOccurredAt(row) > incidentOccurredAt(current) || incidentOccurredAt(row).getTime() === incidentOccurredAt(current).getTime() && row.runId > current.runId ? row : current);
    const occurredAt = group.reduce((oldest, row) => incidentOccurredAt(row) < oldest ? incidentOccurredAt(row) : oldest, incidentOccurredAt(group[0]!));
    const priority = group.reduce((mostUrgent, row) => Math.min(mostUrgent, row.priority), latest.priority);
    const reason = latest.category === "provider_rate_limited" ? "provider_rate_limited" : latest.category === "triage_schema_invalid" ? "triage_schema_invalid" : "execution_persistent_failure";
    items.push({ kind: "health_incident", actionId: groupId, destination: "health", reason, priority, occurredAt: occurredAt.toISOString(), urgency: 0 });
  }
  return items;
}
function incidentOccurredAt(row: IncidentRow) { return row.terminalAt ?? row.retryAt; }
function admittedIncidentRows(rows: IncidentRow[], now: number) {
  const groups = new Map<string, IncidentRow[]>();
  const successes = new Map<string, Date>();
  for (const row of rows) if (row.queryProposalId && row.state === "completed" && row.terminalAt && (!successes.get(row.queryProposalId) || successes.get(row.queryProposalId)! < row.terminalAt)) successes.set(row.queryProposalId, row.terminalAt);
  for (const row of rows) if (row.queryProposalId && row.category && (row.terminalAt || row.state === "retrying" && row.category === "provider_rate_limited")) groups.set(`${row.queryProposalId}:${row.category}`, [...(groups.get(`${row.queryProposalId}:${row.category}`) ?? []), row]);
  const admitted = new Map<string, IncidentRow[]>();
  for (const [groupId, group] of groups) {
    const latest = group.reduce((current, row) => incidentOccurredAt(row) > incidentOccurredAt(current) || incidentOccurredAt(row).getTime() === incidentOccurredAt(current).getTime() && row.runId > current.runId ? row : current);
    const latestFailure = incidentOccurredAt(latest);
    if (latest.category === "provider_rate_limited" && successes.get(latest.queryProposalId!) && successes.get(latest.queryProposalId!)! > latestFailure) continue;
    // Thresholds are immutable run-policy semantics; a newer policy must not
    // count failures classified under an older policy version.
    const recent = group.filter((row) => row.state === "failed" && row.failures === latest.failures && row.windowHours === latest.windowHours && row.terminalAt && now - row.terminalAt.getTime() <= latest.windowHours * 3_600_000);
    if (latest.category !== "provider_rate_limited" && recent.length < latest.failures) continue;
    admitted.set(groupId, latest.category === "provider_rate_limited" ? group : recent);
  }
  return admitted;
}
function compareActionItems(left: AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, right: AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }) { return compareActionTuple(left, right); }
function compareActionTuple(left: Pick<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, "urgency" | "priority" | "occurredAt" | "kind" | "actionId">, right: Pick<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, "urgency" | "priority" | "occurredAt" | "kind" | "actionId">) { return left.urgency - right.urgency || left.priority - right.priority || left.occurredAt.localeCompare(right.occurredAt) || left.kind.localeCompare(right.kind) || left.actionId.localeCompare(right.actionId); }
function sameActionTuple(item: AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, cursor: { urgency: number; priority: number; occurredAt: string; kind: string; actionId: string }) { return item.urgency === cursor.urgency && item.priority === cursor.priority && item.occurredAt === cursor.occurredAt && item.kind === cursor.kind && item.actionId === cursor.actionId; }
function validActionCursor(value: unknown): value is { version: 1; urgency: number; priority: number; occurredAt: string; kind: AdminYoutubeDiscoveryActionRequiredItem["kind"]; actionId: string } { return typeof value === "object" && value !== null && Object.keys(value).length === 6 && (value as { version?: unknown }).version === 1 && Number.isSafeInteger((value as { urgency?: unknown }).urgency) && Number.isSafeInteger((value as { priority?: unknown }).priority) && typeof (value as { occurredAt?: unknown }).occurredAt === "string" && new Date((value as { occurredAt: string }).occurredAt).toISOString() === (value as { occurredAt: string }).occurredAt && ["candidate_review", "mission_need", "health_incident", "knowledge_recommendation"].includes((value as { kind?: string }).kind ?? "") && typeof (value as { actionId?: unknown }).actionId === "string" && (value as { actionId: string }).actionId.length > 0 && (value as { actionId: string }).actionId.length <= 128; }
