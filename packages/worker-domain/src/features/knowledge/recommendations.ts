import { and, asc, eq, sql } from "drizzle-orm";

import { getDb, knowledgeCardEvidence, knowledgeCards, knowledgeRecommendations, transitionKnowledgeCard, type KnowledgeRecommendationResolution, type KnowledgeRecommendationWorkType } from "@xuyenviet/database";
import { type SystemAuditActorId } from "../audit/actors";

type RecommendationDb = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<RecommendationDb["transaction"]>[0]>[0];

export type RecommendationActor = { userId: string; email: string };
export type KnowledgeRecommendationListItem = {
  id: string;
  status: string;
  workType: KnowledgeRecommendationWorkType;
  priority: number;
  contentVersion: number;
  evidenceSetRevision: number;
  createdAt: Date;
  card: Pick<typeof knowledgeCards.$inferSelect, "id" | "title" | "summary" | "conditions" | "lifecycleState" | "knowledgeState" | "verificationRequirement" | "contentVersion" | "evidenceSetRevision">;
};

export async function listKnowledgeRecommendations(input: { status?: "open" | "resolved" | "superseded"; page?: number; workType?: KnowledgeRecommendationWorkType } = {}, db: RecommendationDb = getDb()) {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  return db.select({ id: knowledgeRecommendations.id, status: knowledgeRecommendations.status, workType: knowledgeRecommendations.workType, priority: knowledgeRecommendations.priority, contentVersion: knowledgeRecommendations.contentVersion, evidenceSetRevision: knowledgeRecommendations.evidenceSetRevision, createdAt: knowledgeRecommendations.createdAt, card: { id: knowledgeCards.id, title: knowledgeCards.title, summary: knowledgeCards.summary, conditions: knowledgeCards.conditions, lifecycleState: knowledgeCards.lifecycleState, knowledgeState: knowledgeCards.knowledgeState, verificationRequirement: knowledgeCards.verificationRequirement, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision } }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(and(input.status ? eq(knowledgeRecommendations.status, input.status) : eq(knowledgeRecommendations.status, "open"), input.workType ? eq(knowledgeRecommendations.workType, input.workType) : undefined)).orderBy(asc(knowledgeRecommendations.priority), asc(knowledgeRecommendations.createdAt)).limit(25).offset((page - 1) * 25) as Promise<KnowledgeRecommendationListItem[]>;
}

export async function getKnowledgeRecommendationDetail(recommendationId: string, db: RecommendationDb = getDb()) {
  const [recommendation] = await db.select({ id: knowledgeRecommendations.id, status: knowledgeRecommendations.status, workType: knowledgeRecommendations.workType, priority: knowledgeRecommendations.priority, contentVersion: knowledgeRecommendations.contentVersion, evidenceSetRevision: knowledgeRecommendations.evidenceSetRevision, policySnapshot: knowledgeRecommendations.policySnapshot, createdAt: knowledgeRecommendations.createdAt, card: { id: knowledgeCards.id, title: knowledgeCards.title, summary: knowledgeCards.summary, conditions: knowledgeCards.conditions, lifecycleState: knowledgeCards.lifecycleState, knowledgeState: knowledgeCards.knowledgeState, verificationRequirement: knowledgeCards.verificationRequirement, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision } }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(eq(knowledgeRecommendations.id, recommendationId)).limit(1);
  if (!recommendation) return null;
  const evidence = await db.select({ id: knowledgeCardEvidence.id, quoteText: knowledgeCardEvidence.quoteText, conditions: knowledgeCardEvidence.conditions, supportLevel: knowledgeCardEvidence.supportLevel, displayPolicy: knowledgeCardEvidence.displayPolicy, capturedAt: knowledgeCardEvidence.capturedAt }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, recommendation.card.id), eq(knowledgeCardEvidence.state, "active"))).orderBy(asc(knowledgeCardEvidence.capturedAt)).limit(4);
  return { ...recommendation, evidence: evidence.map((item) => ({ ...item, quoteText: item.quoteText.slice(0, 500) })) };
}

export async function scheduleKnowledgeRecommendation(input: { cardId: string; contentVersion: number; evidenceSetRevision: number; workType: KnowledgeRecommendationWorkType; priority?: number; policyId?: string; policySnapshot?: Record<string, unknown>; executorSystem?: SystemAuditActorId }, db: RecommendationDb | Transaction = getDb()) {
  return transitionKnowledgeCard({ actor: { kind: "system", system: input.executorSystem ?? "system-knowledge-pipeline" }, fences: { contentVersion: input.contentVersion, evidenceSetRevision: input.evidenceSetRevision }, trigger: { kind: "open_work", cardId: input.cardId, workType: input.workType, policyId: input.policyId, policySnapshot: input.policySnapshot } }, db as RecommendationDb);
}

export async function resolveKnowledgeRecommendation(input: { recommendationId: string; expectedContentVersion: number; expectedEvidenceSetRevision: number; resolution: KnowledgeRecommendationResolution; actor: RecommendationActor }, db: RecommendationDb = getDb()) {
  const [recommendation] = await db.select({ workType: knowledgeRecommendations.workType }).from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, input.recommendationId)).limit(1);
  if (!recommendation || !resolutionMatchesWorkType(recommendation.workType, input.resolution)) return { status: "invalid" as const };
  return transitionKnowledgeCard({ actor: { kind: "user", userId: input.actor.userId, email: input.actor.email }, fences: { contentVersion: input.expectedContentVersion, evidenceSetRevision: input.expectedEvidenceSetRevision, recommendationId: input.recommendationId }, trigger: { kind: "operator_resolution", recommendationId: input.recommendationId, resolution: input.resolution } }, db);
}

function resolutionMatchesWorkType(workType: KnowledgeRecommendationWorkType, resolution: KnowledgeRecommendationResolution) {
  if (resolution === "sampling_passed" || resolution === "sampling_failed") return workType === "sampling";
  if (resolution === "relation_resolved") return workType === "relation";
  return workType !== "sampling";
}

function priorityFor(workType: KnowledgeRecommendationWorkType) {
  return ({ verification: 1, relation: 2, risk: 3, missing_context: 4, sampling: 5 })[workType];
}
