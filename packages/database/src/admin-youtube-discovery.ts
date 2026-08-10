import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { YoutubeDiscoveryReviewCursorValidationError, type AdminYoutubeDiscoveryDependencies, type AdminYoutubeDiscoveryPort } from "@xuyenviet/domain";
import type { RequestPrincipal } from "@xuyenviet/contracts";
import { adminYoutubeDiscoveryReviewPageSize, encodeAdminYoutubeDiscoveryReviewCursor } from "@xuyenviet/contracts";
import type { YoutubeCaptureEligibilityPort } from "@xuyenviet/domain";
import { getDb } from "./client";
import { createUserAuditActor } from "./actors";
import { recordAuditEvent } from "./audit-writers";
import { users, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryKnowledgeHandoffs, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryRecommendations, youtubeDiscoveryRuns } from "./schema";

const validText = (value: unknown) => typeof value === "string" && value.trim() === value && /^[\p{L}\p{N} '-]{1,240}$/u.test(value);
const validPriority = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 100;
const validCadence = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 15 && (value as number) <= 10_080;
const handoffTimeoutMs = 5_000;
type AdminYoutubeDiscoveryDatabase = Pick<ReturnType<typeof getDb>, "select" | "transaction" | "update" | "delete">;

export function createPostgresAdminYoutubeDiscoveryPort(captureEligibility: YoutubeCaptureEligibilityPort = { async check() { return "unavailable"; } }, db: AdminYoutubeDiscoveryDatabase = getDb(), handoff: AdminYoutubeDiscoveryDependencies["knowledgeHandoff"] = { async submit() { return "reconciling"; }, async lookup() { return "reconciling"; } }): AdminYoutubeDiscoveryPort {
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
      await reconcileActiveReviews(db, handoff, principal, recommendationId);
      const admission = await db.transaction(async (transaction) => {
        const [row] = await transaction.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl }).from(youtubeDiscoveryCandidateReviewStates)
          .innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)))
          .innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryCandidateReviewStates.candidateId))
          .innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId)))
          .where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, eq(youtubeDiscoveryRecommendations.id, recommendationId))).limit(1).for("update");
        if (!row) return null;
        const [existing] = await transaction.select({ reference: youtubeDiscoveryKnowledgeHandoffs.reference, actorUserId: youtubeDiscoveryKnowledgeHandoffs.actorUserId }).from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, row.candidateId)).limit(1);
        const reference = existing?.reference ?? crypto.randomUUID();
        const actorUserId = existing?.actorUserId ?? principal.userId;
        if (!existing) await transaction.insert(youtubeDiscoveryKnowledgeHandoffs).values({ candidateId: row.candidateId, recommendationId, reference, actorUserId, reconciling: true });
        return { ...row, reference, actorUserId, newReference: !existing };
      });
      if (!admission) return storedTerminalOutcome(db, recommendationId);
      const outcome = admission.newReference
        ? await boundedHandoff(() => handoff.submit({ reference: admission.reference, canonicalUrl: admission.canonicalUrl, actorUserId: admission.actorUserId }))
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
      return { outcome: await finalizeAcceptedReview(db, admission.candidateId, recommendationId, admission.actorUserId, outcome) };
    },
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
  const references = await db.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId, recommendationId: youtubeDiscoveryCandidateReviewStates.recommendationId, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl, reference: youtubeDiscoveryKnowledgeHandoffs.reference, actorUserId: youtubeDiscoveryKnowledgeHandoffs.actorUserId }).from(youtubeDiscoveryCandidateReviewStates)
    .innerJoin(youtubeDiscoveryRecommendations, and(eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId), eq(youtubeDiscoveryRecommendations.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)))
    .innerJoin(youtubeDiscoveryCandidates, eq(youtubeDiscoveryCandidates.id, youtubeDiscoveryCandidateReviewStates.candidateId))
    .innerJoin(youtubeDiscoveryRuns, and(eq(youtubeDiscoveryRuns.id, youtubeDiscoveryRecommendations.runId), eq(youtubeDiscoveryRuns.policyVersionId, youtubeDiscoveryRecommendations.policyVersionId)))
    .innerJoin(youtubeDiscoveryKnowledgeHandoffs, eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId))
    .where(and(eq(youtubeDiscoveryCandidateReviewStates.state, "pending"), eq(youtubeDiscoveryRecommendations.recommendation, "consider"), sql`${youtubeDiscoveryRuns.queryProposalId} is not null`, recommendationId ? eq(youtubeDiscoveryRecommendations.id, recommendationId) : after))
    .orderBy(desc(youtubeDiscoveryRecommendations.score), asc(createdAtCursorKey), asc(youtubeDiscoveryRecommendations.id))
    .limit(recommendationId ? 1 : adminYoutubeDiscoveryReviewPageSize);
  await Promise.all(references.map((reference) => reconcileReference(db, handoff, principal, reference)));
}
async function reconcileReference(db: AdminYoutubeDiscoveryDatabase, handoff: NonNullable<AdminYoutubeDiscoveryDependencies["knowledgeHandoff"]>, principal: RequestPrincipal, reference: { candidateId: string; recommendationId: string; canonicalUrl: string; reference: string; actorUserId: string }) {
  const outcome = await resolveHandoff(handoff, reference);
  if (outcome === "reconciling") return;
  await db.transaction(async (transaction) => {
    const [locked] = await transaction.select({ state: youtubeDiscoveryCandidateReviewStates.state, reference: youtubeDiscoveryKnowledgeHandoffs.reference }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryKnowledgeHandoffs, eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, youtubeDiscoveryCandidateReviewStates.candidateId)).where(and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, reference.candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, reference.recommendationId))).limit(1).for("update");
    if (!locked || locked.reference !== reference.reference || locked.state !== "pending") return;
    if (outcome === "failed") { await transaction.delete(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, reference.candidateId)); return; }
    if (!terminalOutcome(outcome)) { await transaction.update(youtubeDiscoveryKnowledgeHandoffs).set({ reconciling: true }).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, reference.candidateId)); return; }
    const [originalActor] = await transaction.select({ email: users.email }).from(users).where(eq(users.id, reference.actorUserId)).limit(1);
    if (!originalActor?.email) throw new Error("Original handoff audit actor unavailable.");
    const actor = createUserAuditActor({ userId: reference.actorUserId, email: originalActor.email });
    const [updated] = await transaction.update(youtubeDiscoveryCandidateReviewStates).set({ state: "accepted" }).where(and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, reference.candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, reference.recommendationId), eq(youtubeDiscoveryCandidateReviewStates.state, "pending"))).returning({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId });
    if (updated) {
      await recordAuditEvent({ actor, operation: "update", targetType: "youtube_discovery_candidate_review", targetId: reference.recommendationId, afterSummary: JSON.stringify({ decision: "accepted", intakeOutcome: outcome }) }, transaction);
      await transaction.update(youtubeDiscoveryKnowledgeHandoffs).set({ outcome, reconciling: false }).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, reference.candidateId));
    }
  });
}
function terminalOutcome(outcome: unknown): outcome is "submitted" | "duplicate" { return outcome === "submitted" || outcome === "duplicate"; }
async function resolveHandoff(handoff: NonNullable<AdminYoutubeDiscoveryDependencies["knowledgeHandoff"]>, reference: { reference: string; canonicalUrl: string; actorUserId: string }) {
  const input = { reference: reference.reference, canonicalUrl: reference.canonicalUrl, actorUserId: reference.actorUserId };
  const outcome = await boundedHandoff(() => handoff.lookup(input));
  return outcome === "missing" ? "reconciling" : outcome;
}
async function boundedHandoff(operation: () => Promise<unknown>): Promise<"submitted" | "duplicate" | "failed" | "reconciling" | "missing"> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { const outcome = await Promise.race([operation(), new Promise<"reconciling">((resolve) => { timeout = setTimeout(() => resolve("reconciling"), handoffTimeoutMs); })]); return outcome === "submitted" || outcome === "duplicate" || outcome === "failed" || outcome === "missing" ? outcome : "reconciling"; }
  catch { return "reconciling"; }
  finally { if (timeout) clearTimeout(timeout); }
}
async function finalizeAcceptedReview(db: AdminYoutubeDiscoveryDatabase, candidateId: string, recommendationId: string, actorUserId: string, outcome: "submitted" | "duplicate") {
  return db.transaction(async (transaction) => {
    const [handoff] = await transaction.select({ outcome: youtubeDiscoveryKnowledgeHandoffs.outcome }).from(youtubeDiscoveryKnowledgeHandoffs).where(and(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, candidateId), eq(youtubeDiscoveryKnowledgeHandoffs.recommendationId, recommendationId))).limit(1).for("update");
    if (terminalOutcome(handoff?.outcome)) return handoff.outcome;
    const [originalActor] = await transaction.select({ email: users.email }).from(users).where(eq(users.id, actorUserId)).limit(1);
    if (!originalActor?.email) throw new Error("Original handoff audit actor unavailable.");
    const actor = createUserAuditActor({ userId: actorUserId, email: originalActor.email });
    const [updated] = await transaction.update(youtubeDiscoveryCandidateReviewStates).set({ state: "accepted" }).where(and(eq(youtubeDiscoveryCandidateReviewStates.candidateId, candidateId), eq(youtubeDiscoveryCandidateReviewStates.recommendationId, recommendationId), eq(youtubeDiscoveryCandidateReviewStates.state, "pending"))).returning({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId });
    if (!updated) return "reconciling";
    await recordAuditEvent({ actor, operation: "update", targetType: "youtube_discovery_candidate_review", targetId: recommendationId, afterSummary: JSON.stringify({ decision: "accepted", intakeOutcome: outcome }) }, transaction);
    await transaction.update(youtubeDiscoveryKnowledgeHandoffs).set({ outcome, reconciling: false }).where(and(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, candidateId), eq(youtubeDiscoveryKnowledgeHandoffs.recommendationId, recommendationId)));
    return outcome;
  });
}
async function storedTerminalOutcome(db: AdminYoutubeDiscoveryDatabase, recommendationId: string) {
  const [handoff] = await db.select({ outcome: youtubeDiscoveryKnowledgeHandoffs.outcome }).from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.recommendationId, recommendationId)).limit(1);
  return terminalOutcome(handoff?.outcome) ? { outcome: handoff.outcome } : null;
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
