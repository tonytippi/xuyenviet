import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { YoutubeDiscoveryActionRequiredCursorValidationError, YoutubeDiscoveryBrowseCursorValidationError, YoutubeDiscoveryHealthCursorValidationError, YoutubeDiscoveryMissionCursorValidationError, YoutubeDiscoveryReviewCursorValidationError, type AdminYoutubeDiscoveryDependencies, type AdminYoutubeDiscoveryPort } from "@xuyenviet/domain";
import type { AdminYoutubeDiscoveryActionRequiredItem, AdminYoutubeDiscoveryHealthIncidentCursor, AdminYoutubeDiscoveryHealthIncidentDetail, AdminYoutubeDiscoveryMissionCandidate, AdminYoutubeDiscoveryPausedRun, RequestPrincipal } from "@xuyenviet/contracts";
import { adminYoutubeDiscoveryActionRequiredPageSize, adminYoutubeDiscoveryBrowsePageSize, adminYoutubeDiscoveryHealthIncidentPageSize, adminYoutubeDiscoveryHealthStageWindowHours, adminYoutubeDiscoveryMissionPageSize, adminYoutubeDiscoveryReviewPageSize, encodeAdminYoutubeDiscoveryActionRequiredCursor, encodeAdminYoutubeDiscoveryBrowseCursor, encodeAdminYoutubeDiscoveryHealthIncidentCursor, encodeAdminYoutubeDiscoveryMissionCandidateCursor, encodeAdminYoutubeDiscoveryMissionQueryCursor, encodeAdminYoutubeDiscoveryReviewCursor } from "@xuyenviet/contracts";
import type { YoutubeCaptureEligibilityPort } from "@xuyenviet/domain";
import { getDb } from "./client";
import { createSystemAuditActor, createUserAuditActor, type AuditActor } from "./actors";
import { recordAuditEvent } from "./audit-writers";
import { createYoutubeDiscoveryPolicyVersion } from "./youtube-discovery";
import { aiUsageEvents, youtubeDiscoveryAppearances, youtubeDiscoveryCandidateJobs, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryKnowledgeHandoffs, youtubeDiscoveryPlanningLeases, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryRankingHistory, youtubeDiscoveryRecommendations, youtubeDiscoveryRuns } from "./schema";

const validText = (value: unknown) => typeof value === "string" && value.trim() === value && /^[\p{L}\p{N} '-]{1,240}$/u.test(value);
const validPriority = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 100;
const validCadence = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 15 && (value as number) <= 10_080;
const handoffTimeoutMs = 5_000;
export type AdminYoutubeDiscoveryDatabase = Pick<ReturnType<typeof getDb>, "execute" | "insert" | "select" | "transaction" | "update" | "delete">;

export function createPostgresAdminYoutubeDiscoveryPort(captureEligibility: YoutubeCaptureEligibilityPort = { async check() { return "unavailable"; } }, db: AdminYoutubeDiscoveryDatabase = getDb(), handoff: AdminYoutubeDiscoveryDependencies["knowledgeHandoff"] = { async submit() { return "reconciling"; }, async lookup() { return "reconciling"; } }, actionOwners: NonNullable<AdminYoutubeDiscoveryDependencies["actionOwners"]> = { async listKnowledgeRecommendations() { return { items: [], admitsCursor: false }; } }, missionActionFrontier: NonNullable<AdminYoutubeDiscoveryDependencies["missionActionFrontier"]> = { async listMissionNeeds() { return { items: [], admitsCursor: false }; } }, missionOwners: NonNullable<AdminYoutubeDiscoveryDependencies["missionOwners"]> = { async listMissionCoverage() { return { items: [], nextCursor: null }; }, async getMissionDetail() { return null; } }): AdminYoutubeDiscoveryPort {
  return {
    async list() {
      const rows = await db.select({ id: youtubeDiscoveryQueryProposals.id, origin: youtubeDiscoveryQueryProposals.origin, queryText: youtubeDiscoveryQueryProposals.queryText, reason: youtubeDiscoveryQueryProposals.reason, priority: youtubeDiscoveryQueryProposals.priority, enabled: youtubeDiscoveryQueryProposals.enabled, cadenceMinutes: youtubeDiscoveryQueryProposals.cadenceMinutes, nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt, policyEnabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryQueryProposals).leftJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).orderBy(asc(youtubeDiscoveryQueryProposals.createdAt)).limit(200);
      return { items: rows.map((row) => ({ id: row.id, origin: row.origin, queryText: row.queryText, reason: row.reason, priority: row.priority, enabled: row.enabled, cadenceMinutes: row.cadenceMinutes, nextRunAt: row.enabled && row.policyEnabled === true ? row.nextDueAt?.toISOString() ?? null : null, pausedReason: !row.enabled ? "operator" : row.policyEnabled !== true ? "global" : null })) };
    },
    async listReview(principal, cursor) {
      const active = [eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, vietnameseFirstCohort()] as const;
      if (cursor) {
        const [anchor] = await db.select({ recommendationId: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId))).innerJoin(youtubeDiscoveryAppearances, eq(youtubeDiscoveryAppearances.id, youtubeDiscoveryRecommendations.appearanceId)).innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId))).where(and(...active, eq(youtubeDiscoveryRecommendations.id, cursor.recommendationId), eq(youtubeDiscoveryRecommendations.score, String(cursor.score)), eq(createdAtCursorKey, cursor.createdAt))).limit(1);
        if (!anchor) throw new YoutubeDiscoveryReviewCursorValidationError("Invalid YouTube Discovery review cursor.");
      }
      const after = cursor ? or(
        lt(youtubeDiscoveryRecommendations.score, String(cursor.score)),
        and(eq(youtubeDiscoveryRecommendations.score, String(cursor.score)), gt(createdAtCursorKey, cursor.createdAt)),
        and(eq(youtubeDiscoveryRecommendations.score, String(cursor.score)), eq(createdAtCursorKey, cursor.createdAt), gt(youtubeDiscoveryRecommendations.id, cursor.recommendationId)),
      ) : undefined;
      const where = after ? and(...active, after) : and(...active);
      const rows = await db.select({ recommendationId: youtubeDiscoveryRecommendations.id, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl, thumbnailUrl: youtubeDiscoveryAppearances.thumbnailUrl, title: youtubeDiscoveryAppearances.title, channelName: youtubeDiscoveryAppearances.channelName, publishedAt: youtubeDiscoveryAppearances.publishedAt, durationSeconds: youtubeDiscoveryAppearances.durationSeconds, viewCount: youtubeDiscoveryAppearances.viewCount, languageFit: youtubeDiscoveryAppearances.languageFit, eligibilityReason: youtubeDiscoveryAppearances.eligibilityReason, recommendation: youtubeDiscoveryRecommendations.recommendation, reason: youtubeDiscoveryRecommendations.reason, reconciling: youtubeDiscoveryKnowledgeHandoffs.reconciling, score: youtubeDiscoveryRecommendations.score, createdAt: createdAtCursorKey }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId))).innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryRecommendations.candidateId)).innerJoin(youtubeDiscoveryAppearances, eq(youtubeDiscoveryAppearances.id, youtubeDiscoveryRecommendations.appearanceId)).innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId))).leftJoin(youtubeDiscoveryKnowledgeHandoffs, eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)).where(where).orderBy(desc(youtubeDiscoveryRecommendations.score), asc(createdAtCursorKey), asc(youtubeDiscoveryRecommendations.id)).limit(adminYoutubeDiscoveryReviewPageSize + 1);
      const items = rows.slice(0, adminYoutubeDiscoveryReviewPageSize).map(queueItem);
      const last = rows[adminYoutubeDiscoveryReviewPageSize - 1];
      return { items, nextCursor: rows.length > adminYoutubeDiscoveryReviewPageSize && last ? encodeAdminYoutubeDiscoveryReviewCursor({ score: Number(last.score), createdAt: last.createdAt, recommendationId: last.recommendationId }) : null };
    },
    async listForeignFallback() {
      const latestFallback = db.select({ appearanceId: youtubeDiscoveryAppearances.id, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl, thumbnailUrl: youtubeDiscoveryAppearances.thumbnailUrl, title: youtubeDiscoveryAppearances.title, channelName: youtubeDiscoveryAppearances.channelName, publishedAt: youtubeDiscoveryAppearances.publishedAt, durationSeconds: youtubeDiscoveryAppearances.durationSeconds, viewCount: youtubeDiscoveryAppearances.viewCount, languageFit: youtubeDiscoveryAppearances.languageFit, eligibilityReason: youtubeDiscoveryAppearances.eligibilityReason, queryText: youtubeDiscoveryRuns.queryText, discoveredAt: youtubeDiscoveryAppearances.discoveredAt, candidateRank: sql<number>`row_number() over (partition by ${youtubeDiscoveryCandidates.id} order by ${youtubeDiscoveryAppearances.discoveredAt} desc, ${youtubeDiscoveryAppearances.id} asc)`.as("candidate_rank") }).from(youtubeDiscoveryAppearances).innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryAppearances.candidateId)).innerJoin(youtubeDiscoveryRuns, eq(youtubeDiscoveryRuns.id, youtubeDiscoveryAppearances.runId)).where(and(fallbackCohort(), eq(youtubeDiscoveryAppearances.eligibilityReason, "foreign_fallback"), inArray(youtubeDiscoveryAppearances.languageFit, ["unknown", "non_vi"]))).as("latest_fallback");
      const rows = await db.select({ canonicalUrl: latestFallback.canonicalUrl, thumbnailUrl: latestFallback.thumbnailUrl, title: latestFallback.title, channelName: latestFallback.channelName, publishedAt: latestFallback.publishedAt, durationSeconds: latestFallback.durationSeconds, viewCount: latestFallback.viewCount, languageFit: latestFallback.languageFit, eligibilityReason: latestFallback.eligibilityReason, queryText: latestFallback.queryText }).from(latestFallback).where(eq(latestFallback.candidateRank, 1)).orderBy(desc(latestFallback.discoveredAt), asc(latestFallback.appearanceId)).limit(20);
      return { items: rows.flatMap((row) => row.queryText ? [{ canonicalUrl: row.canonicalUrl, thumbnailUrl: row.thumbnailUrl, title: displayText(row.title), channelName: displayText(row.channelName), publishedAt: row.publishedAt?.toISOString() ?? null, durationSeconds: row.durationSeconds, viewCount: row.viewCount, languageFit: row.languageFit as "unknown" | "non_vi", eligibilityReason: "foreign_fallback" as const, queryText: row.queryText }] : []) };
    },
    async listBrowse(_principal, filter, cursor) {
      if (cursor && cursor.filter !== filter) throw new YoutubeDiscoveryBrowseCursorValidationError("Invalid YouTube Discovery browse cursor.");
      const active = filter === "all" ? undefined : eq(youtubeDiscoveryRecommendations.recommendation, filter);
      if (cursor) {
        const [anchor] = await db.select({ id: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryRecommendations).where(and(active, eq(youtubeDiscoveryRecommendations.id, cursor.recommendationId), eq(createdAtCursorKey, cursor.createdAt))).limit(1);
        if (!anchor) throw new YoutubeDiscoveryBrowseCursorValidationError("Invalid YouTube Discovery browse cursor.");
      }
      const after = cursor ? or(lt(createdAtCursorKey, cursor.createdAt), and(eq(createdAtCursorKey, cursor.createdAt), lt(youtubeDiscoveryRecommendations.id, cursor.recommendationId))) : undefined;
      const rows = await db.select({ recommendationId: youtubeDiscoveryRecommendations.id, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl, title: youtubeDiscoveryAppearances.title, channelName: youtubeDiscoveryAppearances.channelName, publishedAt: youtubeDiscoveryAppearances.publishedAt, durationSeconds: youtubeDiscoveryAppearances.durationSeconds, recommendation: youtubeDiscoveryRecommendations.recommendation, reason: youtubeDiscoveryRecommendations.reason, score: youtubeDiscoveryRecommendations.score, factors: youtubeDiscoveryRecommendations.factors, penalties: youtubeDiscoveryRecommendations.penalties, signals: youtubeDiscoveryRecommendations.signals, createdAt: createdAtCursorKey }).from(youtubeDiscoveryRecommendations).innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryRecommendations.candidateId)).innerJoin(youtubeDiscoveryAppearances, eq(youtubeDiscoveryAppearances.id, youtubeDiscoveryRecommendations.appearanceId)).where(and(active, after)).orderBy(desc(createdAtCursorKey), desc(youtubeDiscoveryRecommendations.id)).limit(adminYoutubeDiscoveryBrowsePageSize + 1);
      const items = rows.slice(0, adminYoutubeDiscoveryBrowsePageSize).map(browseItem);
      const last = rows[adminYoutubeDiscoveryBrowsePageSize - 1];
      return { items, nextCursor: rows.length > adminYoutubeDiscoveryBrowsePageSize && last ? encodeAdminYoutubeDiscoveryBrowseCursor({ version: 1, filter, createdAt: last.createdAt, recommendationId: last.recommendationId }) : null };
    },
    async listActionRequired(principal, cursor) {
      if (cursor && !validActionCursor(cursor)) throw new YoutubeDiscoveryActionRequiredCursorValidationError("Invalid YouTube Discovery action-required cursor.");
      const [policyRows] = await Promise.all([
        db.select({ enabled: youtubeDiscoveryPolicyVersions.enabled, highPriorityMaximum: youtubeDiscoveryPolicyVersions.actionQueueHighPriorityMaximum, missionStallHours: youtubeDiscoveryPolicyVersions.actionQueueMaximumMissionStallHours }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1),
      ]);
      const policy = policyRows[0];
      if (!policy) throw new Error("YouTube Discovery action-required policy is unavailable.");
      const [candidates, incidents, missionNeeds, knowledgeRecommendations] = await Promise.all([candidateActionFrontier(db, cursor), incidentActionFrontier(db, cursor), missionActionFrontier.listMissionNeeds(policy, cursor, adminYoutubeDiscoveryActionRequiredPageSize + 1), actionOwners.listKnowledgeRecommendations(policy, cursor, adminYoutubeDiscoveryActionRequiredPageSize + 1)]);
      if (cursor && ((cursor.kind === "candidate_review" && !candidates.admitsCursor) || (cursor.kind === "health_incident" && !incidents.admitsCursor) || (cursor.kind === "mission_need" && !missionNeeds.admitsCursor) || (cursor.kind === "knowledge_recommendation" && !knowledgeRecommendations.admitsCursor))) throw new YoutubeDiscoveryActionRequiredCursorValidationError("Invalid YouTube Discovery action-required cursor.");
      const items: Array<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }> = [...candidates.items, ...incidents.items];
      for (const need of missionNeeds.items) items.push({ kind: "mission_need", actionId: need.actionId, destination: "mission", reason: need.reason, priority: need.priority, occurredAt: need.occurredAt.toISOString(), urgency: 1 });
      for (const recommendation of knowledgeRecommendations.items) if (recommendation.priority <= policy.highPriorityMaximum) items.push({ kind: "knowledge_recommendation", actionId: recommendation.recommendationId, destination: "knowledge_recommendation", reason: recommendation.workType === "risk" ? "knowledge_risk" : "knowledge_relation", priority: recommendation.priority, occurredAt: recommendation.createdAt.toISOString(), urgency: 3 });
      const ordered = items.sort(compareActionItems);
      const after = cursor ? ordered.filter((item) => compareActionTuple(item, cursor) > 0) : ordered;
      const page = after.slice(0, adminYoutubeDiscoveryActionRequiredPageSize);
      const last = page.at(-1);
      const responseItems: AdminYoutubeDiscoveryActionRequiredItem[] = page.map(({ urgency: _urgency, ...item }) => item as AdminYoutubeDiscoveryActionRequiredItem);
      return { items: responseItems, nextCursor: after.length > page.length && last ? encodeAdminYoutubeDiscoveryActionRequiredCursor({ version: 1, urgency: last.urgency, priority: last.priority, occurredAt: last.occurredAt, kind: last.kind, actionId: last.actionId }) : null };
    },
    async getReview(principal, recommendationId) {
      const [row] = await db.select({ recommendationId: youtubeDiscoveryRecommendations.id, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl, videoId: youtubeDiscoveryCandidates.videoId, title: youtubeDiscoveryAppearances.title, channelName: youtubeDiscoveryAppearances.channelName, publishedAt: youtubeDiscoveryAppearances.publishedAt, durationSeconds: youtubeDiscoveryAppearances.durationSeconds, recommendation: youtubeDiscoveryRecommendations.recommendation, reason: youtubeDiscoveryRecommendations.reason, reconciling: youtubeDiscoveryKnowledgeHandoffs.reconciling, queryText: sql<string>`${youtubeDiscoveryRuns.queryText}`, queryReason: youtubeDiscoveryQueryProposals.reason, score: youtubeDiscoveryRecommendations.score, factors: youtubeDiscoveryRecommendations.factors, penalties: youtubeDiscoveryRecommendations.penalties, signals: youtubeDiscoveryRecommendations.signals }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId))).innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryRecommendations.candidateId)).innerJoin(youtubeDiscoveryAppearances, eq(youtubeDiscoveryAppearances.id, youtubeDiscoveryRecommendations.appearanceId)).innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId))).innerJoin(youtubeDiscoveryQueryProposals, eq(youtubeDiscoveryQueryProposals.id, youtubeDiscoveryRuns.queryProposalId)).leftJoin(youtubeDiscoveryKnowledgeHandoffs, eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)).where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryText} is not null`, eq(youtubeDiscoveryRecommendations.id, recommendationId))).limit(1);
      if (!row) return null;
      const [appearance] = await db.select({ thumbnailUrl: youtubeDiscoveryAppearances.thumbnailUrl, viewCount: youtubeDiscoveryAppearances.viewCount, languageFit: youtubeDiscoveryAppearances.languageFit, eligibilityReason: youtubeDiscoveryAppearances.eligibilityReason }).from(youtubeDiscoveryRecommendations).innerJoin(youtubeDiscoveryAppearances, eq(youtubeDiscoveryAppearances.id, youtubeDiscoveryRecommendations.appearanceId)).where(and(eq(youtubeDiscoveryRecommendations.id, recommendationId), vietnameseFirstCohort())).limit(1);
      if (!appearance) return null;
      let priorCaptureOutcome: "eligible" | "already_compatible" | "unavailable";
      try { priorCaptureOutcome = await captureEligibility.check(row.videoId); } catch { throw new Error("YouTube capture eligibility projection unavailable."); }
      return { ...queueItem({ ...row, ...appearance }), queryText: row.queryText, queryReason: row.queryReason, score: Number(row.score), factors: row.factors as ("relevance" | "expected_value" | "freshness_fit")[], penalties: row.penalties as ("commercial_risk" | "duplicate_risk")[], signals: row.signals as ("recent_discussion" | "stale_or_changed_warning" | "practical_question_demand" | "creator_responsiveness" | "commercial_risk" | "contradictory_discussion")[], priorCaptureOutcome };
    },
    async acceptReview(principal, recommendationId) {
      if (!validId(recommendationId)) throw new Error("Invalid YouTube Discovery review.");
      const admission = await db.transaction(async (transaction) => {
        const [row] = await transaction.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl }).from(youtubeDiscoveryCandidateReviewStates)
          .innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)))
          .innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryCandidateReviewStates.candidateId))
          .innerJoin(youtubeDiscoveryAppearances, eq(youtubeDiscoveryAppearances.id, youtubeDiscoveryRecommendations.appearanceId))
          .innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId)))
          .where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, vietnameseFirstCohort(), eq(youtubeDiscoveryRecommendations.id, recommendationId))).limit(1).for("update");
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
      return { asOf: new Date().toISOString(), ...counts, quality: await qualityOverview(db) };
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
      const [policyRows, planningRows, runRows, candidateIncidentRows, stageRows, stageFreshnessRows, reviewRows, candidateBacklogRows, usageRows, usageFreshnessRows, scheduleRows, pausedProposalRows, quality] = await Promise.all([
        db.select({ enabled: youtubeDiscoveryPolicyVersions.enabled, cadenceMinutes: youtubeDiscoveryPolicyVersions.cadenceMinutes, createdAt: youtubeDiscoveryPolicyVersions.createdAt }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1),
        db.select({ state: youtubeDiscoveryPlanningLeases.state, terminalAt: youtubeDiscoveryPlanningLeases.terminalAt, createdAt: youtubeDiscoveryPlanningLeases.createdAt }).from(youtubeDiscoveryPlanningLeases).where(eq(youtubeDiscoveryPlanningLeases.id, "youtube-discovery-planning")).limit(1),
        healthRuns(db),
        candidateHealthIncidents(db),
        db.select({ discovered: sql<number>`count(*) filter (where ${youtubeDiscoveryRankingHistory.stage} = 'discovered')`, enriched: sql<number>`count(*) filter (where ${youtubeDiscoveryRankingHistory.stage} = 'enriched')`, triaged: sql<number>`count(*) filter (where ${youtubeDiscoveryRankingHistory.stage} = 'triaged')`, recommended: sql<number>`count(*) filter (where ${youtubeDiscoveryRankingHistory.stage} = 'recommended')` }).from(youtubeDiscoveryRankingHistory).where(gt(youtubeDiscoveryRankingHistory.createdAt, staleBefore)),
        db.select({ lastUpdatedAt: sql<Date | null>`max(${youtubeDiscoveryRankingHistory.createdAt})` }).from(youtubeDiscoveryRankingHistory),
        db.select({ pending: sql<number>`count(*) filter (where ${youtubeDiscoveryCandidateReviewStates.state} = 'pending')`, deferred: sql<number>`count(*) filter (where ${youtubeDiscoveryCandidateReviewStates.state} = 'deferred')`, missingDeferredAt: sql<number>`count(*) filter (where ${youtubeDiscoveryCandidateReviewStates.state} = 'deferred' and ${youtubeDiscoveryCandidateReviewStates.deferredAt} is null)`, oldestDeferredAt: sql<Date | null>`min(${youtubeDiscoveryCandidateReviewStates.deferredAt}) filter (where ${youtubeDiscoveryCandidateReviewStates.state} = 'deferred')`, lastUpdatedAt: sql<Date | null>`max(${youtubeDiscoveryCandidateReviewStates.deferredAt}) filter (where ${youtubeDiscoveryCandidateReviewStates.state} = 'deferred')` }).from(youtubeDiscoveryCandidateReviewStates),
        db.select({ queued: sql<number>`count(*) filter (where ${youtubeDiscoveryCandidateJobs.state} = 'queued')`, retrying: sql<number>`count(*) filter (where ${youtubeDiscoveryCandidateJobs.state} = 'retrying')`, running: sql<number>`count(*) filter (where ${youtubeDiscoveryCandidateJobs.state} = 'running')` }).from(youtubeDiscoveryCandidateJobs),
        db.select({ requests: sql<number>`count(*)`, totalTokens: sql<number | null>`case when count(*) = 0 or count(*) filter (where ${aiUsageEvents.totalTokens} is null) > 0 then null else sum(${aiUsageEvents.totalTokens}) end`, costMicros: sql<number | null>`case when count(*) = 0 or count(*) filter (where ${aiUsageEvents.estimatedTotalCostMicros} is null) > 0 then null else sum(${aiUsageEvents.estimatedTotalCostMicros}) end` }).from(aiUsageEvents).where(and(eq(aiUsageEvents.executorSystem, "system-youtube-discovery"), eq(aiUsageEvents.purpose, "youtube_discovery_triage"), sql`${aiUsageEvents.youtubeDiscoveryRunId} is not null`, gt(aiUsageEvents.createdAt, staleBefore))),
        db.select({ latestAt: sql<Date | null>`max(${aiUsageEvents.createdAt})` }).from(aiUsageEvents).where(and(eq(aiUsageEvents.executorSystem, "system-youtube-discovery"), eq(aiUsageEvents.purpose, "youtube_discovery_triage"), sql`${aiUsageEvents.youtubeDiscoveryRunId} is not null`)),
        db.select({ enabled: youtubeDiscoveryQueryProposals.enabled, cadenceMinutes: youtubeDiscoveryQueryProposals.cadenceMinutes, nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt, scheduleAnchorAt: youtubeDiscoveryQueryProposals.scheduleAnchorAt, createdAt: youtubeDiscoveryQueryProposals.createdAt }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.enabled, true)).orderBy(asc(youtubeDiscoveryQueryProposals.nextDueAt), asc(youtubeDiscoveryQueryProposals.id)).limit(1),
        db.select({ id: youtubeDiscoveryQueryProposals.id, createdAt: youtubeDiscoveryQueryProposals.createdAt }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.enabled, false)).limit(1),
        qualityOverview(db),
      ]);
      const policy = policyRows[0]; const pausedRunRows = policy?.enabled === false ? await pausedRunContext(db, policy.createdAt) : []; const planning = planningRows[0]; const latest = runRows[0]; const incidents = groupedIncidents([...runRows, ...candidateIncidentRows], now.getTime()).sort(compareActionItems).slice(0, adminYoutubeDiscoveryActionRequiredPageSize).map(({ urgency: _urgency, ...incident }) => incident); const stages = stageRows[0]!; const stageFreshness = stageFreshnessRows[0]!; const backlog = reviewRows[0]!; const candidateBacklog = candidateBacklogRows[0]!; const usage = usageRows[0]!; const usageFreshness = usageFreshnessRows[0]!; const schedule = scheduleRows[0]; const pausedProposal = pausedProposalRows[0];
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
      return { asOf: now.toISOString(), lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null, policy: { enabled: policy?.enabled ?? null }, planning: planningResult, querySchedule, latestQueryRun, pausedRuns, throughput: { windowHours: adminYoutubeDiscoveryHealthStageWindowHours, discovered: Number(stages.discovered), enriched: Number(stages.enriched), triaged: Number(stages.triaged), recommended: Number(stages.recommended), lastUpdatedAt: stageLastUpdatedAt?.toISOString() ?? null, freshness: !stageLastUpdatedAt ? "unavailable" as const : stageLastUpdatedAt >= staleBefore ? "current" as const : "stale" as const }, backlog: { pending: Number(backlog.pending), deferred: Number(backlog.deferred), candidateQueued: Number(candidateBacklog.queued), candidateRetrying: Number(candidateBacklog.retrying), candidateRunning: Number(candidateBacklog.running), oldestDeferredAt: Number(backlog.missingDeferredAt) || !backlog.oldestDeferredAt ? null : backlog.oldestDeferredAt.toISOString(), deferredAge: Number(backlog.missingDeferredAt) || !backlog.oldestDeferredAt ? "unavailable" as const : "available" as const, lastUpdatedAt: backlogLastUpdatedAt?.toISOString() ?? null }, quality, incidents, usage: { availability: usageAvailability, requests: usageRequests, totalTokens, costMicros, lastUpdatedAt: usageLastUpdatedAt, freshness: !latestUsageAt ? "unavailable" as const : latestUsageAt >= staleBefore ? "current" as const : "stale" as const } };
    },
    async setEnabled(principal, enabled) {
      const actor = actorFor(principal);
      return db.transaction(async (transaction) => {
        const [current] = await transaction.select().from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
        if (!current) throw new Error("YouTube Discovery policy is unavailable.");
        if (current.enabled === enabled) return { enabled: current.enabled, version: current.version, createdAt: current.createdAt.toISOString(), changed: false };
        const created = await createYoutubeDiscoveryPolicyVersion({ version: current.version + 1, isCurrent: true, policy: { enabled, queryBuilderVersion: current.queryBuilderVersion, languageClassifierVersion: current.languageClassifierVersion, minimumUsefulDurationSeconds: current.minimumUsefulDurationSeconds, allowForeignFallback: current.allowForeignFallback, minimumCandidateScore: Number(current.minimumCandidateScore), priorityScoreWeight: Number(current.priorityScoreWeight), freshnessScoreWeight: Number(current.freshnessScoreWeight), relevanceWeight: Number(current.relevanceWeight), expectedValueWeight: Number(current.expectedValueWeight), freshnessFitWeight: Number(current.freshnessFitWeight), commercialRiskWeight: Number(current.commercialRiskWeight), duplicateRiskWeight: Number(current.duplicateRiskWeight), deferMinimum: Number(current.deferMinimum), considerMinimum: Number(current.considerMinimum), cadenceMinutes: current.cadenceMinutes, retentionDays: current.retentionDays, commentSignalTtlDays: current.commentSignalTtlDays, maxConcurrentRuns: current.maxConcurrentRuns, maxRetryAttempts: current.maxRetryAttempts, retryDelayMinutes: current.retryDelayMinutes, candidateBacklogThreshold: current.candidateBacklogThreshold, actionQueueHighPriorityMaximum: current.actionQueueHighPriorityMaximum, actionQueueMaximumOperatorReviewAgeHours: current.actionQueueMaximumOperatorReviewAgeHours, actionQueueMaximumMissionStallHours: current.actionQueueMaximumMissionStallHours, actionQueuePersistentIncidentFailureCount: current.actionQueuePersistentIncidentFailureCount, actionQueuePersistentIncidentWindowHours: current.actionQueuePersistentIncidentWindowHours }, actor }, transaction);
        return { enabled: created.enabled, version: created.version, createdAt: created.createdAt.toISOString(), changed: true };
      });
    },
    async getHealthIncident(groupId, cursor) {
      if (!validHealthGroup(groupId) || cursor && (!validHealthCursor(cursor) || cursor.groupId !== groupId)) throw new YoutubeDiscoveryHealthCursorValidationError("Invalid YouTube Discovery Health cursor.");
      const rows = [...await healthRuns(db), ...await candidateHealthIncidents(db)]; const admitted = admittedIncidentRows(rows, Date.now()).get(groupId);
      if (!admitted) return null;
      const category = groupId.slice(groupId.lastIndexOf(":") + 1) as "provider_rate_limited" | "triage_schema_invalid" | "execution_terminal";
      const job = admitted[0]!.kind === "candidate_job";
      const active = job ? and(eq(youtubeDiscoveryCandidateJobs.id, admitted[0]!.runId), eq(youtubeDiscoveryCandidateJobs.incidentCategory, category), sql`${youtubeDiscoveryCandidateJobs.terminalAt} is not null or ${youtubeDiscoveryCandidateJobs.state} in ('retrying', 'running')`) : and(eq(youtubeDiscoveryRuns.id, admitted[0]!.runId), eq(youtubeDiscoveryRuns.incidentCategory, category), sql`${youtubeDiscoveryRuns.terminalAt} is not null or ${youtubeDiscoveryRuns.state} = 'retrying'`);
      const source = job ? youtubeDiscoveryCandidateJobs : youtubeDiscoveryRuns;
      const healthIncidentAtCursorKey = sql<string>`to_char(coalesce(${source.terminalAt}, ${source.nextRunAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
      const cursorAfter = cursor ? or(lt(healthIncidentAtCursorKey, cursor.at), and(eq(healthIncidentAtCursorKey, cursor.at), lt(source.id, cursor.executionId))) : undefined;
      if (cursor) { const [anchor] = await db.select({ id: source.id }).from(source).where(and(active, eq(source.id, cursor.executionId), eq(healthIncidentAtCursorKey, cursor.at))).limit(1); if (!anchor) throw new YoutubeDiscoveryHealthCursorValidationError("Invalid YouTube Discovery Health cursor."); }
      const relevant = await db.select({ executionId: source.id, state: source.state, terminalAt: source.terminalAt, retryAt: source.nextRunAt, retryCount: source.attemptCount, safeErrorCode: job ? youtubeDiscoveryCandidateJobs.safeErrorCode : youtubeDiscoveryRuns.safeErrorCode, lastSafeStage: job ? youtubeDiscoveryCandidateJobs.lastSafeStage : sql<null>`null`, cursorAt: healthIncidentAtCursorKey }).from(source).where(and(active, cursorAfter)).orderBy(desc(healthIncidentAtCursorKey), desc(source.id)).limit(adminYoutubeDiscoveryHealthIncidentPageSize + 1);
      const items = relevant.slice(0, adminYoutubeDiscoveryHealthIncidentPageSize).map((row) => job ? row.state === "running" ? { executionKind: "candidate_job" as const, candidateJobId: row.executionId, state: "running" as const, stage: null, safeErrorCode: null, phase: "running" as const, at: row.retryAt.toISOString(), nextRunAt: null, retryCount: row.retryCount, category } : { executionKind: "candidate_job" as const, candidateJobId: row.executionId, state: row.state as "retrying" | "failed", stage: row.lastSafeStage as "enrichment" | "triage" | "eligibility" | "recommendation" | null, safeErrorCode: row.safeErrorCode as "stage_transient" | "enrichment_transient" | "triage_transient" | "triage_timeout" | "eligibility_unavailable" | "recommendation_transient" | "persistence_contended" | "retry_exhausted" | "lease_retry_exhausted", phase: row.state === "retrying" ? "retrying" as const : "terminal" as const, at: (row.terminalAt ?? row.retryAt).toISOString(), nextRunAt: row.state === "retrying" ? row.retryAt.toISOString() : null, retryCount: row.retryCount, category } : { executionKind: "query_run" as const, runId: row.executionId, state: row.state as "retrying" | "failed" | "completed", stage: "unavailable" as const, safeErrorCode: null, phase: row.state === "retrying" ? "retrying" as const : row.state === "completed" ? "completed" as const : "terminal" as const, at: (row.terminalAt ?? row.retryAt).toISOString(), nextRunAt: row.state === "retrying" ? row.retryAt.toISOString() : null, retryCount: row.retryCount, category }); const last = items.at(-1);
      const lastRow = relevant[adminYoutubeDiscoveryHealthIncidentPageSize - 1];
      return { groupId, category, items, nextCursor: relevant.length > items.length && last && lastRow ? encodeAdminYoutubeDiscoveryHealthIncidentCursor({ version: 1, groupId, at: lastRow.cursorAt, executionId: last.executionKind === "candidate_job" ? last.candidateJobId : last.runId }) : null } as AdminYoutubeDiscoveryHealthIncidentDetail;
    },
  };
}
// Fixed-width UTC microsecond text preserves database ordering in the opaque cursor.
const createdAtCursorKey = sql<string>`to_char(${youtubeDiscoveryRecommendations.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const queryCreatedAtCursorKey = sql<string>`to_char(${youtubeDiscoveryQueryProposals.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
function queueItem(row: { recommendationId: string; canonicalUrl: string; thumbnailUrl: string | null; title: string | null; channelName: string | null; publishedAt: Date | null; durationSeconds: number | null; viewCount: number | null; languageFit: "vi" | "likely_vi" | "unknown" | "non_vi" | null; eligibilityReason: "eligible_vietnamese" | "too_short" | "duration_unknown" | "non_vietnamese" | "language_unknown" | "foreign_fallback" | null; recommendation: "skip" | "defer" | "consider"; reason: "eligible_score_band" | "below_defer_band" | "between_defer_and_consider_band" | "already_compatible" | "canonical_mismatch" | "not_current_run_enriched"; reconciling?: boolean | null }) { return { recommendationId: row.recommendationId, canonicalUrl: row.canonicalUrl, thumbnailUrl: row.thumbnailUrl, title: displayText(row.title), channelName: displayText(row.channelName), publishedAt: row.publishedAt?.toISOString() ?? null, durationSeconds: row.durationSeconds, viewCount: row.viewCount, languageFit: row.languageFit as "vi" | "likely_vi", eligibilityReason: row.eligibilityReason as "eligible_vietnamese", recommendation: row.recommendation as "consider", reason: row.reason as "eligible_score_band", actionAvailability: row.reconciling ? "reconciling" as const : "available" as const }; }
/** Story 22's immutable Vietnamese-first policy provenance, never legacy/null snapshots. */
function newVietnameseFirstPolicyCohort() { return and(eq(youtubeDiscoveryAppearances.queryBuilderVersion, 2), eq(youtubeDiscoveryAppearances.languageClassifierVersion, 1), sql`${youtubeDiscoveryAppearances.minimumUsefulDurationSeconds} >= 180`); }
function vietnameseFirstCohort() { return and(newVietnameseFirstPolicyCohort(), eq(youtubeDiscoveryAppearances.eligibilityReason, "eligible_vietnamese"), inArray(youtubeDiscoveryAppearances.languageFit, ["vi", "likely_vi"]), sql`${youtubeDiscoveryAppearances.durationSeconds} >= ${youtubeDiscoveryAppearances.minimumUsefulDurationSeconds}`); }
function fallbackCohort() { return and(newVietnameseFirstPolicyCohort(), eq(youtubeDiscoveryAppearances.eligibilityReason, "foreign_fallback"), inArray(youtubeDiscoveryAppearances.languageFit, ["unknown", "non_vi"]), eq(youtubeDiscoveryAppearances.durationFit, "eligible"), sql`${youtubeDiscoveryAppearances.durationSeconds} >= ${youtubeDiscoveryAppearances.minimumUsefulDurationSeconds}`); }
async function qualityOverview(db: AdminYoutubeDiscoveryDatabase) {
  const newPolicy = newVietnameseFirstPolicyCohort();
  const [row] = await db.select({ tooShort: sql<number>`count(*) filter (where ${newPolicy} and ${youtubeDiscoveryAppearances.eligibilityReason} = 'too_short')`, durationUnknown: sql<number>`count(*) filter (where ${newPolicy} and ${youtubeDiscoveryAppearances.eligibilityReason} = 'duration_unknown')`, nonVietnamese: sql<number>`count(*) filter (where ${newPolicy} and ${youtubeDiscoveryAppearances.eligibilityReason} = 'non_vietnamese')`, languageUnknown: sql<number>`count(*) filter (where ${newPolicy} and ${youtubeDiscoveryAppearances.eligibilityReason} = 'language_unknown')`, foreignFallback: sql<number>`count(*) filter (where ${fallbackCohort()})`, vietnameseConsider: sql<number>`count(*) filter (where ${vietnameseFirstCohort()} and ${youtubeDiscoveryRecommendations.recommendation} = 'consider')`, considered: sql<number>`count(*) filter (where ${newPolicy} and ${youtubeDiscoveryRecommendations.recommendation} = 'consider')`, durationViolations: sql<number>`count(*) filter (where ${newPolicy} and ${youtubeDiscoveryRecommendations.recommendation} in ('defer', 'consider') and (${youtubeDiscoveryAppearances.durationSeconds} is null or ${youtubeDiscoveryAppearances.durationSeconds} < ${youtubeDiscoveryAppearances.minimumUsefulDurationSeconds}))` }).from(youtubeDiscoveryAppearances).leftJoin(youtubeDiscoveryRecommendations, eq(youtubeDiscoveryRecommendations.appearanceId, youtubeDiscoveryAppearances.id));
  const vietnameseConsider = Number(row?.vietnameseConsider ?? 0); const considered = Number(row?.considered ?? 0);
  return { tooShort: Number(row?.tooShort ?? 0), durationUnknown: Number(row?.durationUnknown ?? 0), nonVietnamese: Number(row?.nonVietnamese ?? 0), languageUnknown: Number(row?.languageUnknown ?? 0), foreignFallback: Number(row?.foreignFallback ?? 0), vietnameseConsider, considered, vietnameseFitPercent: considered ? Math.round(vietnameseConsider / considered * 10_000) / 100 : null, durationViolations: Number(row?.durationViolations ?? 0) };
}
function browseItem(row: { recommendationId: string; canonicalUrl: string; title: string | null; channelName: string | null; publishedAt: Date | null; durationSeconds: number | null; recommendation: "skip" | "defer" | "consider"; reason: "eligible_score_band" | "below_defer_band" | "between_defer_and_consider_band" | "already_compatible" | "canonical_mismatch" | "not_current_run_enriched"; score: string; factors: string[]; penalties: string[]; signals: string[]; createdAt: string }) { return { recommendationId: row.recommendationId, canonicalUrl: row.canonicalUrl, title: displayText(row.title), channelName: displayText(row.channelName), publishedAt: row.publishedAt?.toISOString() ?? null, durationSeconds: row.durationSeconds, recommendation: row.recommendation, reason: row.reason, score: Number(row.score), factors: row.factors as ("relevance" | "expected_value" | "freshness_fit")[], penalties: row.penalties as ("commercial_risk" | "duplicate_risk")[], signals: row.signals as ("recent_discussion" | "stale_or_changed_warning" | "practical_question_demand" | "creator_responsiveness" | "commercial_risk" | "contradictory_discussion")[], createdAt: `${row.createdAt.slice(0, 23)}Z` }; }
function displayText(value: string | null) { const normalized = value?.trim(); return normalized || null; }
function validId(value: string) { return value.trim() === value && value.length > 0 && value.length <= 128; }
export async function reconcileYoutubeDiscoveryKnowledgeHandoffs(handoff: NonNullable<AdminYoutubeDiscoveryDependencies["knowledgeHandoff"]>, db: AdminYoutubeDiscoveryDatabase = getDb()) {
  const references = await db.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId, recommendationId: youtubeDiscoveryCandidateReviewStates.recommendationId, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl, reference: youtubeDiscoveryKnowledgeHandoffs.reference }).from(youtubeDiscoveryCandidateReviewStates)
    .innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)))
    .innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryCandidateReviewStates.candidateId))
    .innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId)))
    .innerJoin(youtubeDiscoveryKnowledgeHandoffs, eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId))
    .where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, eq(youtubeDiscoveryKnowledgeHandoffs.reconciling, true)))
    .orderBy(desc(youtubeDiscoveryRecommendations.score), asc(createdAtCursorKey), asc(youtubeDiscoveryRecommendations.id))
    .limit(adminYoutubeDiscoveryReviewPageSize);
  const actor = createSystemAuditActor("system-youtube-discovery");
  await Promise.all(references.map((reference) => reconcileReference(db, handoff, actor, reference)));
  return references.length;
}
async function reconcileReference(db: AdminYoutubeDiscoveryDatabase, handoff: NonNullable<AdminYoutubeDiscoveryDependencies["knowledgeHandoff"]>, actor: AuditActor, reference: { candidateId: string; recommendationId: string; canonicalUrl: string; reference: string }) {
  const outcome = await resolveHandoff(handoff, reference);
  if (outcome === "reconciling") return;
  await db.transaction(async (transaction) => {
    const [locked] = await transaction.select({ state: youtubeDiscoveryCandidateReviewStates.state, reference: youtubeDiscoveryKnowledgeHandoffs.reference }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryKnowledgeHandoffs, eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)).where(and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, reference.candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, reference.recommendationId))).limit(1).for("update");
    if (!locked || locked.reference !== reference.reference || locked.state !== "pending") return;
    if (outcome === "failed") { await transaction.delete(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, reference.candidateId)); return; }
    if (!terminalOutcome(outcome)) { await transaction.update(youtubeDiscoveryKnowledgeHandoffs).set({ reconciling: true }).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, reference.candidateId)); return; }
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
      .innerJoin(youtubeDiscoveryAppearances, eq(youtubeDiscoveryAppearances.id, youtubeDiscoveryRecommendations.appearanceId))
      .innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId)))
      .where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, vietnameseFirstCohort(), eq(youtubeDiscoveryRecommendations.id, recommendationId))).limit(1).for("update");
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
  const rows = await db.select({ candidateId: youtubeDiscoveryCandidates.id, actionId: youtubeDiscoveryQueryProposals.missionActionId, priority: youtubeDiscoveryQueryProposals.priority, rank: youtubeDiscoveryAppearances.resultOrdinal, rankingId: youtubeDiscoveryRankingHistory.id, rankedAt: youtubeDiscoveryRankingHistory.createdAt, stage: youtubeDiscoveryRankingHistory.stage, recommendationId: youtubeDiscoveryRecommendations.id, recommendation: youtubeDiscoveryRecommendations.recommendation, reviewState: youtubeDiscoveryCandidateReviewStates.state }).from(youtubeDiscoveryRankingHistory).innerJoin(youtubeDiscoveryAppearances, and(eq(youtubeDiscoveryAppearances.id, youtubeDiscoveryRankingHistory.appearanceId), eq(youtubeDiscoveryAppearances.candidateId, youtubeDiscoveryRankingHistory.candidateId), eq(youtubeDiscoveryAppearances.runId, youtubeDiscoveryRankingHistory.runId))).innerJoin(youtubeDiscoveryRuns, eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRankingHistory.runId)).innerJoin(youtubeDiscoveryQueryProposals, and(eq(youtubeDiscoveryQueryProposals.id, youtubeDiscoveryRuns.queryProposalId), eq(youtubeDiscoveryQueryProposals.origin, "system"), sql`${youtubeDiscoveryQueryProposals.missionActionId} is not null`)).innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryRankingHistory.candidateId)).leftJoin(youtubeDiscoveryRecommendations, eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryRankingHistory.recommendationId)).leftJoin(youtubeDiscoveryCandidateReviewStates, and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, youtubeDiscoveryRankingHistory.candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, youtubeDiscoveryRecommendations.id))).where(vietnameseFirstCohort()).orderBy(desc(youtubeDiscoveryRankingHistory.createdAt), desc(youtubeDiscoveryRankingHistory.id));
  const selected = new Map<string, typeof rows[number]>();
  for (const row of rows) if (row.actionId && !selected.has(`${row.actionId}:${row.candidateId}`)) selected.set(`${row.actionId}:${row.candidateId}`, row);
  return [...selected.values()].flatMap((row) => row.actionId ? [{ candidateId: row.candidateId, actionId: row.actionId, priority: row.priority, rank: row.rank, rankedAt: row.rankedAt.toISOString(), rankingState: row.stage, recommendationId: row.recommendationId ?? null, recommendation: (row.recommendation ?? "unavailable") as AdminYoutubeDiscoveryMissionCandidate["recommendation"], candidateState: (row.reviewState ?? "unavailable") as AdminYoutubeDiscoveryMissionCandidate["candidateState"], reviewAvailable: row.recommendation === "consider" && row.reviewState === "pending" }] : []).sort(compareMissionCandidate);
}
function compareMissionCandidate(left: Pick<AdminYoutubeDiscoveryMissionCandidate, "actionId" | "priority" | "rank" | "rankedAt" | "candidateId">, right: Pick<AdminYoutubeDiscoveryMissionCandidate, "actionId" | "priority" | "rank" | "rankedAt" | "candidateId">) { return left.priority - right.priority || left.rank - right.rank || right.rankedAt.localeCompare(left.rankedAt) || left.candidateId.localeCompare(right.candidateId) || left.actionId.localeCompare(right.actionId); }

type IncidentRow = { runId: string; kind: "query_run" | "candidate_job"; queryProposalId: string | null; category: "provider_rate_limited" | "triage_schema_invalid" | "execution_terminal" | null; terminalAt: Date | null; retryAt: Date; attemptCount: number; priority: number; failures: number; windowHours: number; state: "queued" | "running" | "retrying" | "completed" | "failed" | "cancelled" };
type HealthRunRow = IncidentRow & { createdAt: Date; nextRunAt: Date; attemptCount: number; queryEnabled: boolean; cadenceMinutes: number; safeErrorCode: string | null };
async function healthRuns(db: AdminYoutubeDiscoveryDatabase): Promise<HealthRunRow[]> {
  return db.select({ runId: youtubeDiscoveryRuns.id, kind: sql<"query_run">`'query_run'`, queryProposalId: youtubeDiscoveryRuns.queryProposalId, category: youtubeDiscoveryRuns.incidentCategory, terminalAt: youtubeDiscoveryRuns.terminalAt, retryAt: youtubeDiscoveryRuns.nextRunAt, nextRunAt: youtubeDiscoveryRuns.nextRunAt, createdAt: youtubeDiscoveryRuns.createdAt, attemptCount: youtubeDiscoveryRuns.attemptCount, safeErrorCode: youtubeDiscoveryRuns.safeErrorCode, queryEnabled: youtubeDiscoveryQueryProposals.enabled, cadenceMinutes: youtubeDiscoveryQueryProposals.cadenceMinutes, priority: youtubeDiscoveryQueryProposals.priority, failures: youtubeDiscoveryPolicyVersions.actionQueuePersistentIncidentFailureCount, windowHours: youtubeDiscoveryPolicyVersions.actionQueuePersistentIncidentWindowHours, state: youtubeDiscoveryRuns.state }).from(youtubeDiscoveryRuns).innerJoin(youtubeDiscoveryQueryProposals, eq(youtubeDiscoveryQueryProposals.id, youtubeDiscoveryRuns.queryProposalId)).innerJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.id, youtubeDiscoveryRuns.policyVersionId)).where(sql`${youtubeDiscoveryRuns.queryProposalId} is not null`).orderBy(desc(sql`coalesce(${youtubeDiscoveryRuns.terminalAt}, ${youtubeDiscoveryRuns.createdAt})`), desc(youtubeDiscoveryRuns.id));
}
async function candidateHealthIncidents(db: AdminYoutubeDiscoveryDatabase): Promise<IncidentRow[]> {
  return db.select({ runId: youtubeDiscoveryCandidateJobs.id, kind: sql<"candidate_job">`'candidate_job'`, queryProposalId: youtubeDiscoveryRuns.queryProposalId, category: youtubeDiscoveryCandidateJobs.incidentCategory, terminalAt: youtubeDiscoveryCandidateJobs.terminalAt, retryAt: youtubeDiscoveryCandidateJobs.nextRunAt, attemptCount: youtubeDiscoveryCandidateJobs.attemptCount, priority: youtubeDiscoveryQueryProposals.priority, failures: youtubeDiscoveryPolicyVersions.actionQueuePersistentIncidentFailureCount, windowHours: youtubeDiscoveryPolicyVersions.actionQueuePersistentIncidentWindowHours, state: youtubeDiscoveryCandidateJobs.state }).from(youtubeDiscoveryCandidateJobs).innerJoin(youtubeDiscoveryRuns, eq(youtubeDiscoveryRuns.id, youtubeDiscoveryCandidateJobs.runId)).innerJoin(youtubeDiscoveryQueryProposals, eq(youtubeDiscoveryQueryProposals.id, youtubeDiscoveryRuns.queryProposalId)).innerJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.id, youtubeDiscoveryCandidateJobs.policyVersionId)).where(sql`${youtubeDiscoveryCandidateJobs.incidentCategory} is not null`);
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
function validHealthCursor(cursor: AdminYoutubeDiscoveryHealthIncidentCursor) { return cursor.version === 1 && validHealthGroup(cursor.groupId) && validId(cursor.executionId) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at) && new Date(`${cursor.at.slice(0, 23)}Z`).toISOString() === `${cursor.at.slice(0, 23)}Z`; }
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
  for (const row of rows) if (row.category && (row.state === "failed" || row.state === "retrying" && row.category === "provider_rate_limited" || row.kind === "candidate_job" && row.state === "running" && row.category === "provider_rate_limited")) groups.set(`${row.runId}:${row.category}`, [row]);
  const admitted = new Map<string, IncidentRow[]>();
  for (const [groupId, group] of groups) {
    const latest = group[0]!;
    const latestFailure = incidentOccurredAt(latest);
    if (latest.category !== "provider_rate_limited" && (latest.attemptCount < latest.failures || now - latestFailure.getTime() > latest.windowHours * 3_600_000)) continue;
    admitted.set(groupId, group);
  }
  return admitted;
}
function compareActionItems(left: AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, right: AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }) { return compareActionTuple(left, right); }
function compareActionTuple(left: Pick<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, "urgency" | "priority" | "occurredAt" | "kind" | "actionId">, right: Pick<AdminYoutubeDiscoveryActionRequiredItem & { urgency: number }, "urgency" | "priority" | "occurredAt" | "kind" | "actionId">) { return left.urgency - right.urgency || left.priority - right.priority || left.occurredAt.localeCompare(right.occurredAt) || left.kind.localeCompare(right.kind) || left.actionId.localeCompare(right.actionId); }
function validActionCursor(value: unknown): value is { version: 1; urgency: number; priority: number; occurredAt: string; kind: AdminYoutubeDiscoveryActionRequiredItem["kind"]; actionId: string } { return typeof value === "object" && value !== null && Object.keys(value).length === 6 && (value as { version?: unknown }).version === 1 && Number.isSafeInteger((value as { urgency?: unknown }).urgency) && Number.isSafeInteger((value as { priority?: unknown }).priority) && typeof (value as { occurredAt?: unknown }).occurredAt === "string" && new Date((value as { occurredAt: string }).occurredAt).toISOString() === (value as { occurredAt: string }).occurredAt && ["candidate_review", "mission_need", "health_incident", "knowledge_recommendation"].includes((value as { kind?: string }).kind ?? "") && typeof (value as { actionId?: unknown }).actionId === "string" && (value as { actionId: string }).actionId.length > 0 && (value as { actionId: string }).actionId.length <= 128; }

type ActionFrontierRow = AdminYoutubeDiscoveryActionRequiredItem & { urgency: number };
type ActionFrontierResult = { items: ActionFrontierRow[]; admitsCursor: boolean };

async function candidateActionFrontier(db: AdminYoutubeDiscoveryDatabase, cursor: Parameters<AdminYoutubeDiscoveryPort["listActionRequired"]>[1]): Promise<ActionFrontierResult> {
  const rows = await db.execute(sql`
    with items as (
      select case when proposal.priority <= policy.action_queue_high_priority_maximum
          and clock_timestamp() - recommendation.created_at >= policy.action_queue_maximum_operator_review_age_hours * interval '1 hour'
        then 0 else 2 end as urgency,
        proposal.priority, to_char(date_trunc('milliseconds', recommendation.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as occurred_at,
        recommendation.id as action_id
      from youtube_discovery_candidate_review_states review
      join youtube_discovery_recommendations recommendation on recommendation.id = review.recommendation_id and recommendation.candidate_id = review.candidate_id
      join youtube_discovery_runs run on run.id = recommendation.run_id and run.policy_version_id = recommendation.policy_version_id
      join youtube_discovery_appearances appearance on appearance.id = recommendation.appearance_id
      join youtube_discovery_query_proposals proposal on proposal.id = run.query_proposal_id
      join youtube_discovery_policy_versions policy on policy.id = recommendation.policy_version_id
        where review.state = 'pending' and recommendation.recommendation = 'consider' and run.query_proposal_id is not null
          and appearance.eligibility_reason = 'eligible_vietnamese' and appearance.language_fit in ('vi', 'likely_vi')
          and appearance.query_builder_version = 2 and appearance.language_classifier_version = 1
          and appearance.minimum_useful_duration_seconds >= 180 and appearance.duration_seconds >= appearance.minimum_useful_duration_seconds
    ), admission as (select exists(select 1 from items where ${cursor ? sql`urgency = ${cursor.urgency} and priority = ${cursor.priority} and occurred_at = ${cursor.occurredAt} and 'candidate_review' = ${cursor.kind} and action_id = ${cursor.actionId}` : sql`true`}) as admitted), paged as (
      select urgency, priority, occurred_at, action_id from items where ${actionAfter("candidate_review", cursor)} order by urgency asc, priority asc, occurred_at asc, action_id asc limit ${adminYoutubeDiscoveryActionRequiredPageSize + 1}
    ) select urgency, priority, occurred_at as "occurredAt", action_id as "actionId", admission.admitted as "admitsCursor" from paged cross join admission
      union all select null, null, null, null, admitted from admission where admitted and not exists(select 1 from paged)
  `) as Array<{ urgency: number | null; priority: number | null; occurredAt: string | null; actionId: string | null; admitsCursor: boolean }>;
  return { items: rows.flatMap((row) => row.actionId && row.priority !== null && row.occurredAt && row.urgency !== null ? [{ kind: "candidate_review" as const, actionId: row.actionId, destination: "review" as const, reason: row.urgency === 0 ? "review_aged" as const : "review_pending" as const, priority: row.priority, occurredAt: row.occurredAt, urgency: row.urgency }] : []), admitsCursor: !cursor || cursor.kind !== "candidate_review" || rows[0]?.admitsCursor === true };
}

async function incidentActionFrontier(db: AdminYoutubeDiscoveryDatabase, cursor: Parameters<AdminYoutubeDiscoveryPort["listActionRequired"]>[1]): Promise<ActionFrontierResult> {
  const rows = await db.execute(sql`
    with events as (
      select run.id, run.incident_category, run.state, run.terminal_at, run.next_run_at, run.attempt_count, proposal.priority,
        policy.action_queue_persistent_incident_failure_count as failures, policy.action_queue_persistent_incident_window_hours as window_hours,
        coalesce(run.terminal_at, run.next_run_at) as at
      from youtube_discovery_runs run
      join youtube_discovery_query_proposals proposal on proposal.id = run.query_proposal_id
      join youtube_discovery_policy_versions policy on policy.id = run.policy_version_id
      where run.query_proposal_id is not null and run.incident_category is not null
        and (run.state = 'failed' or (run.state = 'retrying' and run.incident_category = 'provider_rate_limited'))
      union all
      select job.id, job.incident_category, job.state, job.terminal_at, job.next_run_at, job.attempt_count, proposal.priority,
        policy.action_queue_persistent_incident_failure_count as failures, policy.action_queue_persistent_incident_window_hours as window_hours,
        coalesce(job.terminal_at, job.next_run_at) as at
      from youtube_discovery_candidate_jobs job
      join youtube_discovery_runs run on run.id = job.run_id
      join youtube_discovery_query_proposals proposal on proposal.id = run.query_proposal_id
      join youtube_discovery_policy_versions policy on policy.id = job.policy_version_id
      where run.query_proposal_id is not null and job.incident_category is not null
        and (job.state = 'failed' or (job.state in ('retrying', 'running') and job.incident_category = 'provider_rate_limited'))
    ), items as (
      select 0 as urgency, priority,
        to_char(date_trunc('milliseconds', at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as occurred_at,
        id || ':' || incident_category as action_id, incident_category
      from events
      where incident_category = 'provider_rate_limited'
        or (attempt_count >= failures and terminal_at >= clock_timestamp() - window_hours * interval '1 hour')
    ), admission as (select exists(select 1 from items where ${cursor ? sql`urgency = ${cursor.urgency} and priority = ${cursor.priority} and occurred_at = ${cursor.occurredAt} and 'health_incident' = ${cursor.kind} and action_id = ${cursor.actionId}` : sql`true`}) as admitted), paged as (
      select urgency, priority, occurred_at, action_id, incident_category from items where ${actionAfter("health_incident", cursor)} order by urgency asc, priority asc, occurred_at asc, action_id asc limit ${adminYoutubeDiscoveryActionRequiredPageSize + 1}
    ) select urgency, priority, occurred_at as "occurredAt", action_id as "actionId", incident_category as category, admission.admitted as "admitsCursor" from paged cross join admission
      union all select null, null, null, null, null, admitted from admission where admitted and not exists(select 1 from paged)
  `) as Array<{ urgency: number | null; priority: number | null; occurredAt: string | null; actionId: string | null; category: "provider_rate_limited" | "triage_schema_invalid" | "execution_terminal" | null; admitsCursor: boolean }>;
  return { items: rows.flatMap((row) => row.actionId && row.priority !== null && row.occurredAt && row.category ? [{ kind: "health_incident" as const, actionId: row.actionId, destination: "health" as const, reason: row.category === "provider_rate_limited" ? "provider_rate_limited" as const : row.category === "triage_schema_invalid" ? "triage_schema_invalid" as const : "execution_persistent_failure" as const, priority: row.priority, occurredAt: row.occurredAt, urgency: 0 }] : []), admitsCursor: !cursor || cursor.kind !== "health_incident" || rows[0]?.admitsCursor === true };
}

function actionAfter(kind: AdminYoutubeDiscoveryActionRequiredItem["kind"], cursor: Parameters<AdminYoutubeDiscoveryPort["listActionRequired"]>[1]) {
  if (!cursor) return sql`true`;
  return sql`urgency > ${cursor.urgency} or (urgency = ${cursor.urgency} and (priority > ${cursor.priority} or (priority = ${cursor.priority} and (occurred_at > ${cursor.occurredAt} or (occurred_at = ${cursor.occurredAt} and (${kind} > ${cursor.kind} or (${kind} = ${cursor.kind} and action_id > ${cursor.actionId})))))))`;
}
