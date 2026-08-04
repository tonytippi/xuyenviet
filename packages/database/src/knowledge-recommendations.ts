import { and, asc, count, eq, inArray } from "drizzle-orm";

import { getDb } from "./client";
import { transitionKnowledgeCard } from "./knowledge-lifecycle";
import { knowledgeCardEvidence, knowledgeCards, knowledgeRecommendations, type KnowledgeRecommendationAction, type KnowledgeRecommendationWorkType } from "./schema";

type RecommendationDb = ReturnType<typeof getDb>;

export const knowledgeRecommendationWorkStatusValues = ["actionable", "completed", "inactive"] as const;
export type KnowledgeRecommendationWorkStatus = (typeof knowledgeRecommendationWorkStatusValues)[number];

export type KnowledgeRecommendationListItem = {
  id: string;
  status: "open" | "resolved" | "superseded";
  resolution: string | null;
  workType: KnowledgeRecommendationWorkType;
  priority: number;
  contentVersion: number;
  evidenceSetRevision: number;
  createdAt: Date;
  card: Pick<typeof knowledgeCards.$inferSelect, "id" | "title" | "summary" | "lifecycleState" | "knowledgeState" | "verificationRequirement" | "contentVersion" | "evidenceSetRevision">;
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
    contentVersion: knowledgeRecommendations.contentVersion, evidenceSetRevision: knowledgeRecommendations.evidenceSetRevision, createdAt: knowledgeRecommendations.createdAt,
    card: { id: knowledgeCards.id, title: knowledgeCards.title, summary: knowledgeCards.summary, lifecycleState: knowledgeCards.lifecycleState, knowledgeState: knowledgeCards.knowledgeState, verificationRequirement: knowledgeCards.verificationRequirement, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision },
  }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(and(inArray(knowledgeRecommendations.status, statuses), input.workType ? eq(knowledgeRecommendations.workType, input.workType) : undefined)).orderBy(asc(knowledgeRecommendations.priority), asc(knowledgeRecommendations.createdAt)).limit(25).offset((page - 1) * 25) as Promise<KnowledgeRecommendationListItem[]>;
}

export async function getKnowledgeRecommendationDetail(recommendationId: string, db: RecommendationDb = getDb()) {
  const [recommendation] = await db.select({
    id: knowledgeRecommendations.id, status: knowledgeRecommendations.status, resolution: knowledgeRecommendations.resolution, workType: knowledgeRecommendations.workType, priority: knowledgeRecommendations.priority, contentVersion: knowledgeRecommendations.contentVersion, evidenceSetRevision: knowledgeRecommendations.evidenceSetRevision, createdAt: knowledgeRecommendations.createdAt,
    card: { id: knowledgeCards.id, type: knowledgeCards.type, title: knowledgeCards.title, summary: knowledgeCards.summary, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, tags: knowledgeCards.tags, freshnessSensitive: knowledgeCards.freshnessSensitive, lifecycleState: knowledgeCards.lifecycleState, knowledgeState: knowledgeCards.knowledgeState, verificationRequirement: knowledgeCards.verificationRequirement },
  }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(eq(knowledgeRecommendations.id, recommendationId)).limit(1);
  if (!recommendation) return null;
  const evidence = await db.select({ quoteText: knowledgeCardEvidence.quoteText, conditions: knowledgeCardEvidence.conditions, supportLevel: knowledgeCardEvidence.supportLevel, displayPolicy: knowledgeCardEvidence.displayPolicy, capturedAt: knowledgeCardEvidence.capturedAt }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, recommendation.card.id), eq(knowledgeCardEvidence.state, "active"))).limit(4);
  return { ...recommendation, evidence };
}

export async function resolveKnowledgeRecommendation(input: { recommendationId: string; expectedContentVersion: number; expectedEvidenceSetRevision: number; action?: KnowledgeRecommendationAction; resolution?: "published_operator_confirmed" | "published_community_observation" | "suppressed" | "edited_and_requeued" | "relation_resolved" | "sampling_passed" | "sampling_failed"; actor: { userId: string; email: string } }, db: RecommendationDb = getDb()) {
  const resolution = input.action ? actionResolution(input.action) : input.resolution;
  if (!resolution && input.action !== "restore") return { status: "invalid_action" as const };
  if (input.action === "restore") {
    const restored = await transitionKnowledgeCard({ actor: { kind: "user", userId: input.actor.userId, email: input.actor.email }, fences: { contentVersion: input.expectedContentVersion, evidenceSetRevision: input.expectedEvidenceSetRevision, recommendationId: input.recommendationId }, trigger: { kind: "restore", recommendationId: input.recommendationId } }, db);
    return restored.status === "resolved" ? { status: "resolved" as const, cardId: restored.cardId } : restored.status === "stale" ? { status: "stale" as const } : { status: "invalid_action" as const };
  }
  const result = await transitionKnowledgeCard({
    actor: { kind: "user", userId: input.actor.userId, email: input.actor.email },
    fences: { contentVersion: input.expectedContentVersion, evidenceSetRevision: input.expectedEvidenceSetRevision, recommendationId: input.recommendationId },
    trigger: { kind: "operator_resolution", recommendationId: input.recommendationId, resolution: resolution! },
  }, db);
  return result.status === "resolved" ? { status: "resolved" as const, cardId: result.cardId } : result.status === "stale" ? { status: "stale" as const } : { status: "invalid_action" as const };
}

function actionResolution(action: KnowledgeRecommendationAction) {
  if (action === "restore") return undefined;
  return ({ accept_wording: "published_operator_confirmed", edit: "edited_and_requeued", suppress: "suppressed", verify: "published_operator_confirmed", promote: "published_community_observation", resolve_relation: "relation_resolved", sampling_pass: "sampling_passed", sampling_fail: "sampling_failed" } as const)[action];
}

export async function sealClosedKnowledgeSamplingPolicy(_policyId: string) { return { status: "unavailable" as const }; }
export async function getPublicMvpSamplingReadinessEvidence(_db?: unknown) { return { complete: false, policies: 0, zeroApplicablePolicies: 0, incompletePolicies: 0, pending: 0, failed: 0, highSeverity: 0, obligations: 0 }; }
export function shouldSampleKnowledgeCard(cardId: string, contentVersion: number, windowStartsAt: Date, percent = 15) {
  let hash = 2166136261;
  for (const char of `${cardId}:${contentVersion}:${windowStartsAt.toISOString().slice(0, 10)}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100 < percent;
}
