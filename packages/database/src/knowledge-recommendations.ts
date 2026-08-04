import { createHash } from "node:crypto";
import { and, asc, count, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "./client";
import { transitionKnowledgeCard, transitionKnowledgeCardInTransaction } from "./knowledge-lifecycle";
import { facebookCaptureReviews, knowledgeCardEvidence, knowledgeCards, knowledgeRecommendations, knowledgeSamplingCohortMembers, knowledgeSamplingObligations, knowledgeSamplingPolicies, sources, type KnowledgeRecommendationAction, type KnowledgeRecommendationWorkType } from "./schema";

type RecommendationDb = ReturnType<typeof getDb>;

export const knowledgeRecommendationWorkStatusValues = ["actionable", "completed", "inactive"] as const;
export type KnowledgeRecommendationWorkStatus = (typeof knowledgeRecommendationWorkStatusValues)[number];

export type KnowledgeRecommendationListItem = {
  id: string;
  status: "open" | "resolved" | "superseded";
  resolution: string | null;
  workType: KnowledgeRecommendationWorkType;
  priority: number;
  createdAt: Date;
  card: Pick<typeof knowledgeCards.$inferSelect, "id" | "title" | "summary" | "lifecycleState" | "knowledgeState" | "verificationRequirement">;
};

export async function getKnowledgeRecommendationWorkStatusCounts(db: RecommendationDb = getDb()) {
  const rows = await db.select({ status: knowledgeRecommendations.status, count: count() }).from(knowledgeRecommendations).groupBy(knowledgeRecommendations.status);
  return rows.reduce<Record<KnowledgeRecommendationWorkStatus, number>>((counts, row) => {
    if (row.status === "open") counts.actionable += row.count;
    if (row.status === "resolved") counts.completed += row.count;
    if (row.status === "superseded") counts.inactive += row.count;
    return counts;
  }, { actionable: 0, completed: 0, inactive: 0 });
}

export async function listKnowledgeRecommendations(input: { workStatus?: KnowledgeRecommendationWorkStatus; page?: number; workType?: KnowledgeRecommendationWorkType } = {}, db: RecommendationDb = getDb()) {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const statuses = input.workStatus === "completed" ? ["resolved"] as const : input.workStatus === "inactive" ? ["superseded"] as const : ["open"] as const;
  return db.select({
    id: knowledgeRecommendations.id, status: knowledgeRecommendations.status, resolution: knowledgeRecommendations.resolution, workType: knowledgeRecommendations.workType, priority: knowledgeRecommendations.priority,
    createdAt: knowledgeRecommendations.createdAt,
    card: { id: knowledgeCards.id, title: knowledgeCards.title, summary: knowledgeCards.summary, lifecycleState: knowledgeCards.lifecycleState, knowledgeState: knowledgeCards.knowledgeState, verificationRequirement: knowledgeCards.verificationRequirement },
  }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(and(inArray(knowledgeRecommendations.status, statuses), input.workType ? eq(knowledgeRecommendations.workType, input.workType) : undefined)).orderBy(asc(knowledgeRecommendations.priority), asc(knowledgeRecommendations.createdAt)).limit(25).offset((page - 1) * 25) as Promise<KnowledgeRecommendationListItem[]>;
}

export async function getKnowledgeRecommendationDetail(recommendationId: string, db: RecommendationDb = getDb()) {
  const [recommendation] = await db.select({
    id: knowledgeRecommendations.id, status: knowledgeRecommendations.status, resolution: knowledgeRecommendations.resolution, workType: knowledgeRecommendations.workType, priority: knowledgeRecommendations.priority, createdAt: knowledgeRecommendations.createdAt,
    card: { id: knowledgeCards.id, type: knowledgeCards.type, title: knowledgeCards.title, summary: knowledgeCards.summary, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, tags: knowledgeCards.tags, freshnessSensitive: knowledgeCards.freshnessSensitive, lifecycleState: knowledgeCards.lifecycleState, knowledgeState: knowledgeCards.knowledgeState, verificationRequirement: knowledgeCards.verificationRequirement },
  }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(eq(knowledgeRecommendations.id, recommendationId)).limit(1);
  if (!recommendation) return null;
  const evidence = await db.select({ quoteText: knowledgeCardEvidence.quoteText, conditions: knowledgeCardEvidence.conditions, supportLevel: knowledgeCardEvidence.supportLevel, displayPolicy: knowledgeCardEvidence.displayPolicy, capturedAt: knowledgeCardEvidence.capturedAt, sourceLabel: sources.label, sourceKind: sources.kind, facebookReviewId: facebookCaptureReviews.id }).from(knowledgeCardEvidence).innerJoin(sources, eq(sources.id, knowledgeCardEvidence.sourceId)).leftJoin(facebookCaptureReviews, eq(facebookCaptureReviews.captureVersionId, knowledgeCardEvidence.captureVersionId)).where(and(eq(knowledgeCardEvidence.knowledgeCardId, recommendation.card.id), eq(knowledgeCardEvidence.state, "active"))).limit(4);
  return { ...recommendation, evidence };
}

export async function resolveKnowledgeRecommendation(input: { recommendationId: string; expectedContentVersion: number; expectedEvidenceSetRevision: number; action?: KnowledgeRecommendationAction; resolution?: "published_operator_confirmed" | "published_community_observation" | "suppressed" | "edited_and_requeued" | "relation_resolved" | "sampling_passed" | "sampling_failed"; highSeverity?: boolean; actor: { userId: string; email: string } }, db: RecommendationDb = getDb()) {
  const resolution = input.action ? actionResolution(input.action) : input.resolution;
  if (!resolution && input.action !== "restore") return { status: "invalid_action" as const };
  if (input.action === "restore") {
    const restored = await transitionKnowledgeCard({ actor: { kind: "user", userId: input.actor.userId, email: input.actor.email }, fences: { contentVersion: input.expectedContentVersion, evidenceSetRevision: input.expectedEvidenceSetRevision, recommendationId: input.recommendationId }, trigger: { kind: "restore", recommendationId: input.recommendationId, target: "pending_operator" } }, db);
    return restored.status === "resolved" ? { status: "resolved" as const, cardId: restored.cardId } : restored.status === "stale" ? { status: "stale" as const } : { status: "invalid_action" as const };
  }
  const result = await transitionKnowledgeCard({
    actor: { kind: "user", userId: input.actor.userId, email: input.actor.email },
    fences: { contentVersion: input.expectedContentVersion, evidenceSetRevision: input.expectedEvidenceSetRevision, recommendationId: input.recommendationId },
    trigger: { kind: "operator_resolution", recommendationId: input.recommendationId, resolution: resolution!, highSeverity: input.highSeverity },
  }, db);
  return result.status === "resolved" ? { status: "resolved" as const, cardId: result.cardId } : result.status === "stale" ? { status: "stale" as const } : { status: "invalid_action" as const };
}

function actionResolution(action: KnowledgeRecommendationAction) {
  if (action === "restore") return undefined;
  return ({ accept_wording: "published_operator_confirmed", edit: "edited_and_requeued", suppress: "suppressed", verify: "published_operator_confirmed", promote: "published_community_observation", resolve_relation: "relation_resolved", sampling_pass: "sampling_passed", sampling_fail: "sampling_failed" } as const)[action];
}

export async function sealClosedKnowledgeSamplingPolicy(policyId: string, db: RecommendationDb = getDb()) {
  return db.transaction(async (transaction) => {
    const [policy] = await transaction.select().from(knowledgeSamplingPolicies).where(eq(knowledgeSamplingPolicies.id, policyId)).limit(1).for("update");
    if (!policy) return { status: "unavailable" as const };
    if (policy.windowEndsAt > new Date()) return { status: "incomplete" as const };
    if (!policy.enrollmentSealedAt) return { status: "incomplete" as const };
    const members = await transaction.select({ knowledgeCardId: knowledgeSamplingCohortMembers.knowledgeCardId, contentVersion: knowledgeSamplingCohortMembers.contentVersion, evidenceSetRevision: knowledgeSamplingCohortMembers.evidenceSetRevision, selectedForSampling: knowledgeSamplingCohortMembers.selectedForSampling }).from(knowledgeSamplingCohortMembers).where(eq(knowledgeSamplingCohortMembers.policyId, policy.id)).orderBy(asc(knowledgeSamplingCohortMembers.knowledgeCardId), asc(knowledgeSamplingCohortMembers.contentVersion), asc(knowledgeSamplingCohortMembers.evidenceSetRevision));
    if (policy.enrollmentDigest !== digestEnrollment(policy, members)) return { status: "incomplete" as const };
    return { status: "sealed" as const, candidateCount: members.length, selectedCount: members.filter((member) => member.selectedForSampling).length };
  });
}

/** Worker-owned enrollment: target policy samples auto-active cards only. */
export async function selectKnowledgeSamplingPolicy(policyId: string, db: RecommendationDb = getDb()) {
  return db.transaction(async (transaction) => {
    const [policy] = await transaction.select().from(knowledgeSamplingPolicies).where(eq(knowledgeSamplingPolicies.id, policyId)).limit(1).for("update");
    if (!policy || policy.enrollmentSealedAt || policy.windowEndsAt > new Date()) return { status: "unavailable" as const, selectedCount: 0 };
    const cards = await transaction.select({ id: knowledgeCards.id, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(and(eq(knowledgeCards.lifecycleState, "active"), eq(knowledgeCards.verificationRequirement, "none"), eq(knowledgeCards.executorSystem, "system-knowledge-pipeline"), sql`exists (select 1 from ${knowledgeSamplingObligations} obligation where obligation.knowledge_card_id = ${knowledgeCards.id} and obligation.content_version = ${knowledgeCards.contentVersion} and obligation.evidence_set_revision = ${knowledgeCards.evidenceSetRevision} and obligation.sampling_disposition is null)`, sql`not exists (select 1 from ${knowledgeRecommendations} sampling_work where sampling_work.knowledge_card_id = ${knowledgeCards.id} and sampling_work.content_version = ${knowledgeCards.contentVersion} and sampling_work.evidence_set_revision = ${knowledgeCards.evidenceSetRevision} and sampling_work.work_type = 'sampling')`)).orderBy(asc(knowledgeCards.id));
    for (const card of cards) {
      const selected = shouldSampleKnowledgeCard(card.id, card.contentVersion, policy.windowStartsAt, policy.samplingPercent);
      await transaction.insert(knowledgeSamplingCohortMembers).values({ policyId: policy.id, knowledgeCardId: card.id, contentVersion: card.contentVersion, evidenceSetRevision: card.evidenceSetRevision, selectedForSampling: selected }).onConflictDoNothing();
    }
    const members = await transaction.select({ knowledgeCardId: knowledgeSamplingCohortMembers.knowledgeCardId, contentVersion: knowledgeSamplingCohortMembers.contentVersion, evidenceSetRevision: knowledgeSamplingCohortMembers.evidenceSetRevision, selectedForSampling: knowledgeSamplingCohortMembers.selectedForSampling }).from(knowledgeSamplingCohortMembers).where(eq(knowledgeSamplingCohortMembers.policyId, policy.id)).orderBy(asc(knowledgeSamplingCohortMembers.knowledgeCardId), asc(knowledgeSamplingCohortMembers.contentVersion), asc(knowledgeSamplingCohortMembers.evidenceSetRevision));
    const digest = digestEnrollment(policy, members);
    await transaction.update(knowledgeSamplingPolicies).set({ enrollmentCandidateCount: members.length, enrollmentSelectedCount: members.filter((member) => member.selectedForSampling).length, enrollmentDigest: digest, enrollmentSealedAt: new Date() }).where(and(eq(knowledgeSamplingPolicies.id, policy.id), isNull(knowledgeSamplingPolicies.enrollmentSealedAt)));
    for (const member of members) {
      if (!member.selectedForSampling) continue;
      const obligations = await transaction.select({ id: knowledgeSamplingObligations.id }).from(knowledgeSamplingObligations).where(and(eq(knowledgeSamplingObligations.knowledgeCardId, member.knowledgeCardId), eq(knowledgeSamplingObligations.contentVersion, member.contentVersion), eq(knowledgeSamplingObligations.evidenceSetRevision, member.evidenceSetRevision), isNull(knowledgeSamplingObligations.samplingDisposition)));
      if (obligations.length) await transitionKnowledgeCardInTransaction(transaction, { actor: { kind: "system", system: "system-knowledge-pipeline" }, fences: member, trigger: { kind: "open_work", cardId: member.knowledgeCardId, workType: "sampling", policyId: policy.id, policySnapshot: { cohortKey: policy.cohortKey, enrollmentDigest: digest, enrollmentScope: "auto_active" }, obligationIds: obligations.map((obligation) => obligation.id) } });
    }
    return { status: "selected" as const, selectedCount: members.filter((member) => member.selectedForSampling).length };
  });
}

export async function getPublicMvpSamplingReadinessEvidence(db: Pick<RecommendationDb, "select"> = getDb()) {
  const [policies, obligations, pending, failed, highSeverity] = await Promise.all([
    db.select({ sealed: knowledgeSamplingPolicies.enrollmentSealedAt, candidateCount: knowledgeSamplingPolicies.enrollmentCandidateCount }).from(knowledgeSamplingPolicies).where(lte(knowledgeSamplingPolicies.windowEndsAt, new Date())),
    db.select({ count: count() }).from(knowledgeSamplingObligations),
    db.select({ count: count() }).from(knowledgeSamplingObligations).where(isNull(knowledgeSamplingObligations.samplingDisposition)),
    db.select({ count: count() }).from(knowledgeSamplingObligations).where(eq(knowledgeSamplingObligations.samplingDisposition, "sampling_failed")),
    db.select({ count: count() }).from(knowledgeSamplingPolicies).where(sql`${knowledgeSamplingPolicies.escalatedAt} is not null or ${knowledgeSamplingPolicies.suppressedAt} is not null`),
  ]);
  const incompletePolicies = policies.filter((policy) => !policy.sealed).length;
  return { complete: incompletePolicies === 0 && (pending[0]?.count ?? 0) === 0 && (failed[0]?.count ?? 0) === 0 && (highSeverity[0]?.count ?? 0) === 0, policies: policies.length, zeroApplicablePolicies: policies.filter((policy) => policy.candidateCount === 0).length, incompletePolicies, pending: pending[0]?.count ?? 0, failed: failed[0]?.count ?? 0, highSeverity: highSeverity[0]?.count ?? 0, obligations: obligations[0]?.count ?? 0 };
}
export function shouldSampleKnowledgeCard(cardId: string, contentVersion: number, windowStartsAt: Date, percent = 15) {
  let hash = 2166136261;
  for (const char of `${cardId}:${contentVersion}:${windowStartsAt.toISOString().slice(0, 10)}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100 < percent;
}

function digestEnrollment(policy: typeof knowledgeSamplingPolicies.$inferSelect, members: Array<{ knowledgeCardId: string; contentVersion: number; evidenceSetRevision: number; selectedForSampling: boolean | null }>) {
  return createHash("sha256").update(JSON.stringify({ cohortKey: policy.cohortKey, windowStartsAt: policy.windowStartsAt.toISOString(), windowEndsAt: policy.windowEndsAt.toISOString(), samplingPercent: policy.samplingPercent, scope: "auto_active", members })).digest("hex");
}
