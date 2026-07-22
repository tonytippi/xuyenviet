import "server-only";

import { and, asc, eq, gt, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { auditEvents, knowledgeCardEvidence, knowledgeCardSearchDocuments, knowledgeCards, knowledgeIndexDirtyMarkers, knowledgeRecommendations, knowledgeSamplingCohortMembers, knowledgeSamplingDispositionReasonValues, knowledgeSamplingPolicies, type KnowledgeRecommendationAction, type KnowledgeRecommendationReason, type KnowledgeSamplingDispositionReason } from "@/db/schema";

type RecommendationDb = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<RecommendationDb["transaction"]>[0]>[0];

const samplingWindowDays = 28;
const samplingPercent = 15;

export type RecommendationActor = { userId: string; email: string };

export type KnowledgeRecommendationListItem = {
  id: string;
  status: string;
  reason: string;
  priority: number;
  contentVersion: number;
  evidenceSetRevision: number;
  createdAt: Date;
  card: Pick<typeof knowledgeCards.$inferSelect, "id" | "title" | "summary" | "conditions" | "publicationState" | "knowledgeState" | "reviewState" | "verificationState" | "contentVersion" | "evidenceSetRevision">;
};

export async function listKnowledgeRecommendations(input: { status?: "open" | "in_review" | "resolved" | "superseded"; page?: number; reason?: KnowledgeRecommendationReason } = {}, db: RecommendationDb = getDb()) {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const where = and(input.status ? eq(knowledgeRecommendations.status, input.status) : sql`${knowledgeRecommendations.status} in ('open', 'in_review')`, input.reason ? eq(knowledgeRecommendations.reason, input.reason) : undefined);
  return db.select({
    id: knowledgeRecommendations.id, status: knowledgeRecommendations.status, reason: knowledgeRecommendations.reason, priority: knowledgeRecommendations.priority,
    contentVersion: knowledgeRecommendations.contentVersion, evidenceSetRevision: knowledgeRecommendations.evidenceSetRevision, createdAt: knowledgeRecommendations.createdAt,
    card: { id: knowledgeCards.id, title: knowledgeCards.title, summary: knowledgeCards.summary, conditions: knowledgeCards.conditions, publicationState: knowledgeCards.publicationState, knowledgeState: knowledgeCards.knowledgeState, reviewState: knowledgeCards.reviewState, verificationState: knowledgeCards.verificationState, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision },
  }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(where).orderBy(asc(knowledgeRecommendations.priority), asc(knowledgeRecommendations.createdAt)).limit(25).offset((page - 1) * 25) as Promise<KnowledgeRecommendationListItem[]>;
}

export async function getKnowledgeRecommendationDetail(recommendationId: string, db: RecommendationDb = getDb()) {
  const [recommendation] = await db.select({
    id: knowledgeRecommendations.id, status: knowledgeRecommendations.status, reason: knowledgeRecommendations.reason, priority: knowledgeRecommendations.priority, contentVersion: knowledgeRecommendations.contentVersion, evidenceSetRevision: knowledgeRecommendations.evidenceSetRevision, policySnapshot: knowledgeRecommendations.policySnapshot, createdAt: knowledgeRecommendations.createdAt,
    card: { id: knowledgeCards.id, title: knowledgeCards.title, summary: knowledgeCards.summary, conditions: knowledgeCards.conditions, publicationState: knowledgeCards.publicationState, knowledgeState: knowledgeCards.knowledgeState, reviewState: knowledgeCards.reviewState, verificationState: knowledgeCards.verificationState, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision },
  }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(eq(knowledgeRecommendations.id, recommendationId)).limit(1);
  if (!recommendation) return null;
  const evidence = await db.select({ id: knowledgeCardEvidence.id, quoteText: knowledgeCardEvidence.quoteText, conditions: knowledgeCardEvidence.conditions, supportLevel: knowledgeCardEvidence.supportLevel, displayPolicy: knowledgeCardEvidence.displayPolicy, capturedAt: knowledgeCardEvidence.capturedAt }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, recommendation.card.id), eq(knowledgeCardEvidence.state, "active"))).orderBy(asc(knowledgeCardEvidence.capturedAt)).limit(4);
  return { ...recommendation, evidence: evidence.map((item) => ({ ...item, quoteText: item.quoteText.slice(0, 500) })) };
}

export function shouldSampleKnowledgeCard(cardId: string, contentVersion: number, windowStartsAt: Date, percent = samplingPercent) {
  const value = `${cardId}:${contentVersion}:${windowStartsAt.toISOString().slice(0, 10)}`;
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100 < percent;
}

export async function scheduleKnowledgeRecommendation(input: { cardId: string; contentVersion: number; evidenceSetRevision: number; reason: KnowledgeRecommendationReason; priority?: number; policy?: "sample" | "verify_first"; now?: Date; supersedeStaleBy?: RecommendationActor }, db: RecommendationDb | Transaction = getDb()) {
  return db.transaction((tx) => scheduleKnowledgeRecommendationInTransaction(input, tx));
}

async function scheduleKnowledgeRecommendationInTransaction(input: { cardId: string; contentVersion: number; evidenceSetRevision: number; reason: KnowledgeRecommendationReason; priority?: number; policy?: "sample" | "verify_first"; now?: Date; supersedeStaleBy?: RecommendationActor }, db: Transaction) {
  const now = input.now ?? new Date();
  let policyId: string | null = null;
  let policySnapshot: Record<string, unknown> = {};
  if (input.policy) {
    const defaultStarts = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const defaultEnds = new Date(defaultStarts.getTime() + samplingWindowDays * 86_400_000);
    // One stable boundary prevents overlapping initial windows and races with escalation.
    await lockSamplingPolicyBoundary(db);
    const [activePolicy] = await db.select({ id: knowledgeSamplingPolicies.id, cohortKey: knowledgeSamplingPolicies.cohortKey, samplingPercent: knowledgeSamplingPolicies.samplingPercent }).from(knowledgeSamplingPolicies).where(and(lte(knowledgeSamplingPolicies.windowStartsAt, now), gt(knowledgeSamplingPolicies.windowEndsAt, now), sql`${knowledgeSamplingPolicies.suppressedAt} is null`)).orderBy(asc(knowledgeSamplingPolicies.windowStartsAt)).limit(1);
    if (activePolicy) {
      policyId = activePolicy.id;
      policySnapshot = { cohort: activePolicy.cohortKey, percent: activePolicy.samplingPercent, window_days: samplingWindowDays, selection: input.policy === "verify_first" ? "required" : "deterministic" };
    } else {
      const [suppressedPolicy] = await db.select({ windowStartsAt: knowledgeSamplingPolicies.windowStartsAt, windowEndsAt: knowledgeSamplingPolicies.windowEndsAt }).from(knowledgeSamplingPolicies).where(and(lte(knowledgeSamplingPolicies.windowStartsAt, now), gt(knowledgeSamplingPolicies.windowEndsAt, now), sql`${knowledgeSamplingPolicies.suppressedAt} is not null`)).orderBy(asc(knowledgeSamplingPolicies.windowStartsAt)).limit(1);
      const starts = suppressedPolicy?.windowStartsAt ?? defaultStarts;
      const ends = suppressedPolicy?.windowEndsAt ?? defaultEnds;
      const baseCohortKey = `initial:${starts.toISOString().slice(0, 10)}`;
      const policies = await db.select({ cohortKey: knowledgeSamplingPolicies.cohortKey }).from(knowledgeSamplingPolicies).where(and(eq(knowledgeSamplingPolicies.windowStartsAt, starts), eq(knowledgeSamplingPolicies.windowEndsAt, ends))).orderBy(asc(knowledgeSamplingPolicies.cohortKey));
      const cohortKey = policies.length ? `${baseCohortKey}:${policies.length + 1}` : baseCohortKey;
      const [policy] = await db.insert(knowledgeSamplingPolicies).values({ windowStartsAt: starts, windowEndsAt: ends, samplingPercent, cohortKey }).onConflictDoNothing().returning({ id: knowledgeSamplingPolicies.id, cohortKey: knowledgeSamplingPolicies.cohortKey, samplingPercent: knowledgeSamplingPolicies.samplingPercent });
      const persistedPolicy = policy ?? (await db.select({ id: knowledgeSamplingPolicies.id, cohortKey: knowledgeSamplingPolicies.cohortKey, samplingPercent: knowledgeSamplingPolicies.samplingPercent }).from(knowledgeSamplingPolicies).where(eq(knowledgeSamplingPolicies.cohortKey, cohortKey)).limit(1))[0];
      policyId = persistedPolicy?.id ?? null;
      policySnapshot = { cohort: persistedPolicy?.cohortKey ?? cohortKey, percent: persistedPolicy?.samplingPercent ?? samplingPercent, window_days: samplingWindowDays, selection: input.policy === "verify_first" ? "required" : "deterministic" };
    }
  }
  const priority = input.priority ?? priorityFor(input.reason);
  if (input.supersedeStaleBy) {
    await db.update(knowledgeRecommendations).set({ status: "superseded", resolution: "accepted", resolvedByUserId: input.supersedeStaleBy.userId, resolvedAt: now, updatedAt: now }).where(and(
      eq(knowledgeRecommendations.knowledgeCardId, input.cardId),
      sql`${knowledgeRecommendations.status} in ('open', 'in_review')`,
      sql`(${knowledgeRecommendations.contentVersion}, ${knowledgeRecommendations.evidenceSetRevision}) <> (${input.contentVersion}, ${input.evidenceSetRevision})`,
    ));
  }
  if (input.policy === "sample") {
    const [policy] = await db.select({ windowStartsAt: knowledgeSamplingPolicies.windowStartsAt, samplingPercent: knowledgeSamplingPolicies.samplingPercent }).from(knowledgeSamplingPolicies).where(eq(knowledgeSamplingPolicies.id, policyId!)).limit(1);
    const [card] = await db.select({ id: knowledgeCards.id }).from(knowledgeCards).where(and(eq(knowledgeCards.id, input.cardId), eq(knowledgeCards.contentVersion, input.contentVersion), eq(knowledgeCards.evidenceSetRevision, input.evidenceSetRevision), eq(knowledgeCards.publicationState, "active"))).limit(1).for("update");
    if (!policy || !card) return;
    const [activePolicy] = await db.select({ id: knowledgeSamplingPolicies.id }).from(knowledgeSamplingPolicies).where(and(eq(knowledgeSamplingPolicies.id, policyId!), sql`${knowledgeSamplingPolicies.suppressedAt} is null`)).limit(1).for("update");
    if (!activePolicy) return;
    await db.insert(knowledgeSamplingCohortMembers).values({ policyId: activePolicy.id, knowledgeCardId: input.cardId, contentVersion: input.contentVersion, evidenceSetRevision: input.evidenceSetRevision }).onConflictDoNothing();
    if (!shouldSampleKnowledgeCard(input.cardId, input.contentVersion, policy.windowStartsAt, policy.samplingPercent)) return;
  }
  await db.insert(knowledgeRecommendations).values({ knowledgeCardId: input.cardId, contentVersion: input.contentVersion, evidenceSetRevision: input.evidenceSetRevision, reason: input.reason, priority, policyId, policySnapshot }).onConflictDoNothing();
}

export async function resolveKnowledgeRecommendation(input: { recommendationId: string; expectedContentVersion: number; expectedEvidenceSetRevision: number; action: KnowledgeRecommendationAction; actor: RecommendationActor; editSummary?: string; samplingDispositionReason?: string; samplingRationale?: string; highSeverity?: boolean }, db: RecommendationDb = getDb()) {
  return db.transaction(async (tx) => {
    const [recommendation] = await tx.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, input.recommendationId)).limit(1).for("update");
    if (!recommendation || !["open", "in_review"].includes(recommendation.status)) return { status: "unavailable" as const };
    if (!isCompatibleResolution(recommendation.reason, input.action)) return { status: "invalid_action" as const };
    if (input.action === "edit" && !input.editSummary?.trim()) return { status: "invalid_edit" as const };
    const samplingDisposition = samplingDispositionFor(input);
    if ((input.action === "sampling_pass" || input.action === "sampling_fail") && !samplingDisposition) return { status: "invalid_sampling_reason" as const };
    if (input.highSeverity && input.action === "sampling_fail" && !["material_error", "safety_risk"].includes(samplingDisposition?.reason ?? "")) return { status: "invalid_sampling_reason" as const };
    if (input.action === "sampling_fail" && input.highSeverity && recommendation.policyId) await lockSamplingPolicyBoundary(tx);
    const [card] = await tx.select().from(knowledgeCards).where(eq(knowledgeCards.id, recommendation.knowledgeCardId)).limit(1).for("update");
    if (!card || card.contentVersion !== input.expectedContentVersion || card.evidenceSetRevision !== input.expectedEvidenceSetRevision || card.contentVersion !== recommendation.contentVersion || card.evidenceSetRevision !== recommendation.evidenceSetRevision) return { status: "stale" as const };
    if (card.verificationState === "failed" && ["restore", "verify", "resolve_relation"].includes(input.action)) return { status: "invalid_action" as const };
    if (card.verificationState === "required" && input.action === "restore") return { status: "invalid_action" as const };
    if (input.action === "edit" && input.editSummary?.trim()) {
      const evidence = await tx.select({ quoteText: knowledgeCardEvidence.quoteText }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, card.id), eq(knowledgeCardEvidence.state, "active"), eq(knowledgeCardEvidence.supportLevel, "supporting"))).limit(4);
      if (!evidence.some((item) => input.editSummary!.trim() === item.quoteText.trim())) return { status: "invalid_evidence" as const };
    }
    if (input.action === "resolve_relation" && (!(["conflicted", "uncertain"] as string[]).includes(card.knowledgeState) || card.publicationState !== "suppressed" || card.verificationState === "required")) return { status: "invalid_action" as const };
    const verificationNeedsFollowUp = input.action === "verify" && ["conflict", "relation", "missing_context"].includes(recommendation.reason);
    if (input.action === "verify") {
      const evidence = await tx.select({ independenceKey: knowledgeCardEvidence.independenceKey }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, card.id), eq(knowledgeCardEvidence.state, "active"), eq(knowledgeCardEvidence.supportLevel, "supporting")));
      const validVerificationTarget = card.status === "approved" && card.publicationState === "suppressed" && card.reviewState === "ai_recommended" && card.verificationState === "required" && card.needsReview;
      const corroborated = new Set(evidence.map((item) => item.independenceKey)).size >= 2;
      if (!validVerificationTarget || !corroborated || (recommendation.reason === "conflict" ? card.knowledgeState !== "conflicted" : !["uncertain", "community_pattern", "conflicted"].includes(card.knowledgeState))) return { status: recommendation.reason === "conflict" ? "invalid_verification" as const : "invalid_action" as const };
    }
    let removedConflictCount = 0;
    let hasRemainingSupport = true;
    if (input.action === "resolve_relation") {
      const conflicts = await tx.select({ id: knowledgeCardEvidence.id }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, card.id), eq(knowledgeCardEvidence.state, "active"), eq(knowledgeCardEvidence.supportLevel, "conflicting"))).for("update");
      if (conflicts.length) {
        await tx.update(knowledgeCardEvidence).set({ state: "removed" }).where(and(eq(knowledgeCardEvidence.knowledgeCardId, card.id), eq(knowledgeCardEvidence.state, "active"), eq(knowledgeCardEvidence.supportLevel, "conflicting")));
        removedConflictCount = conflicts.length;
      }
      const support = await tx.select({ independenceKey: knowledgeCardEvidence.independenceKey }).from(knowledgeCardEvidence).where(and(eq(knowledgeCardEvidence.knowledgeCardId, card.id), eq(knowledgeCardEvidence.state, "active"), sql`${knowledgeCardEvidence.supportLevel} in ('primary', 'supporting')`)).for("update");
      hasRemainingSupport = new Set(support.map((item) => item.independenceKey)).size > 0;
    }
    const resolution = resolutionFor(input.action);
    const material = input.action === "edit" || input.action === "suppress" || input.action === "restore" || input.action === "verify" || input.action === "resolve_relation" || input.action === "sampling_fail";
    const preservesRequiredVerification = card.verificationState === "required" && (input.action === "edit" || verificationNeedsFollowUp);
    const next = {
      summary: input.action === "edit" && input.editSummary?.trim() ? input.editSummary.trim().slice(0, 1200) : card.summary,
      publicationState: input.action === "suppress" || input.action === "sampling_fail" || preservesRequiredVerification ? "suppressed" as const : input.action === "restore" || input.action === "resolve_relation" && hasRemainingSupport || input.action === "verify" ? "active" as const : card.publicationState,
      knowledgeState: input.action === "resolve_relation" ? hasRemainingSupport ? "community_observation" as const : "uncertain" as const : card.knowledgeState,
      verificationState: input.action === "verify" ? "corroborated" as const : input.action === "sampling_fail" ? "failed" as const : card.verificationState,
      reviewState: input.action === "resolve_relation" && !hasRemainingSupport || preservesRequiredVerification || input.action === "edit" && recommendation.reason === "verification" ? "ai_recommended" as const : "reviewed" as const,
      needsReview: input.action === "resolve_relation" && !hasRemainingSupport || preservesRequiredVerification || input.action === "edit" && recommendation.reason === "verification",
      contentVersion: material ? card.contentVersion + 1 : card.contentVersion,
      evidenceSetRevision: card.evidenceSetRevision + (removedConflictCount ? 1 : 0),
      updatedAt: new Date(),
    };
    await tx.update(knowledgeCards).set(next).where(eq(knowledgeCards.id, card.id));
    await tx.update(knowledgeRecommendations).set({ status: "resolved", resolution, samplingDispositionReason: samplingDisposition?.reason ?? null, samplingRationale: samplingDisposition?.rationale ?? null, resolvedByUserId: input.actor.userId, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(knowledgeRecommendations.id, recommendation.id));
    if (material) await tx.update(knowledgeRecommendations).set({ status: "superseded", resolution: "accepted", resolvedByUserId: input.actor.userId, resolvedAt: new Date(), updatedAt: new Date() }).where(and(eq(knowledgeRecommendations.knowledgeCardId, card.id), eq(knowledgeRecommendations.status, "open"), sql`${knowledgeRecommendations.id} <> ${recommendation.id}`));
    const auditSummary = input.action === "resolve_relation"
      ? `Resolved ${recommendation.reason} recommendation with resolve_relation${hasRemainingSupport ? "" : " without reactivation because supporting evidence is insufficient"}. Final card contentVersion=${next.contentVersion}, evidenceSetRevision=${next.evidenceSetRevision}, publicationState=${next.publicationState}.`
      : input.action === "sampling_pass" || input.action === "sampling_fail"
        ? `Resolved sampling recommendation with ${input.action}; disposition=${samplingDisposition!.reason}${input.highSeverity ? "; high_severity=true" : ""}.`
        : `Resolved ${recommendation.reason} recommendation with ${input.action}.`;
    await tx.insert(auditEvents).values({ actorUserId: input.actor.userId, actorEmail: input.actor.email, operation: "update", targetType: "knowledge_recommendation", targetId: recommendation.id, afterSummary: auditSummary });
    await tx.insert(knowledgeIndexDirtyMarkers).values({ knowledgeCardId: card.id, contentVersion: next.contentVersion, evidenceSetRevision: next.evidenceSetRevision, reason: `recommendation:${input.action}` }).onConflictDoNothing();
    if (next.publicationState !== "active" || next.verificationState === "failed") await tx.update(knowledgeCardSearchDocuments).set({ status: "disabled", disabledAt: new Date(), updatedAt: new Date() }).where(and(eq(knowledgeCardSearchDocuments.knowledgeCardId, card.id), eq(knowledgeCardSearchDocuments.status, "active")));
    if (input.action === "sampling_fail" && input.highSeverity && recommendation.policyId) await escalateSamplingCohort(tx, recommendation.policyId, input.actor);
    if (material && (input.action === "resolve_relation" && !hasRemainingSupport || preservesRequiredVerification || input.action === "edit" && recommendation.reason === "verification" || input.action !== "resolve_relation" && input.action !== "verify")) {
      const reason = input.action === "resolve_relation" && !hasRemainingSupport ? "weak_evidence" : input.action === "sampling_fail" ? "risk" : recommendation.reason;
      await scheduleKnowledgeRecommendation({ cardId: card.id, contentVersion: next.contentVersion, evidenceSetRevision: next.evidenceSetRevision, reason, priority: priorityFor(reason) }, tx);
    }
    return input.action === "resolve_relation" && !hasRemainingSupport ? { status: "insufficient_support" as const, cardId: card.id } : { status: "resolved" as const, cardId: card.id };
  });
}

async function escalateSamplingCohort(tx: Transaction, policyId: string, actor: RecommendationActor) {
  await lockSamplingPolicyBoundary(tx);
  const [policy] = await tx.select().from(knowledgeSamplingPolicies).where(eq(knowledgeSamplingPolicies.id, policyId)).limit(1).for("update");
  if (!policy || policy.suppressedAt) return;
  const [suppressedPolicy] = await tx.update(knowledgeSamplingPolicies).set({ escalatedAt: new Date(), suppressedAt: new Date() }).where(and(eq(knowledgeSamplingPolicies.id, policy.id), sql`${knowledgeSamplingPolicies.suppressedAt} is null`)).returning({ id: knowledgeSamplingPolicies.id });
  if (!suppressedPolicy) return;
  const cohort = await tx.select({ cardId: knowledgeSamplingCohortMembers.knowledgeCardId, contentVersion: knowledgeSamplingCohortMembers.contentVersion, evidenceSetRevision: knowledgeSamplingCohortMembers.evidenceSetRevision }).from(knowledgeSamplingCohortMembers).where(eq(knowledgeSamplingCohortMembers.policyId, policy.id));
  for (const item of cohort) {
    const [updated] = await tx.update(knowledgeCards).set({ publicationState: "suppressed", contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, item.cardId), eq(knowledgeCards.contentVersion, item.contentVersion), eq(knowledgeCards.evidenceSetRevision, item.evidenceSetRevision), eq(knowledgeCards.publicationState, "active"))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
    if (!updated) continue;
    await tx.update(knowledgeCardSearchDocuments).set({ status: "disabled", disabledAt: new Date(), updatedAt: new Date() }).where(and(eq(knowledgeCardSearchDocuments.knowledgeCardId, item.cardId), eq(knowledgeCardSearchDocuments.status, "active")));
    await tx.insert(knowledgeIndexDirtyMarkers).values({ knowledgeCardId: item.cardId, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, reason: "sampling_high_severity" }).onConflictDoNothing();
    await tx.insert(auditEvents).values({ actorUserId: actor.userId, actorEmail: actor.email, operation: "update", targetType: "knowledge_sampling_card", targetId: item.cardId, afterSummary: "High-severity sampling failure suppressed this cohort card." });
  }
  await tx.insert(auditEvents).values({ actorUserId: actor.userId, actorEmail: actor.email, operation: "update", targetType: "knowledge_sampling_cohort", targetId: policy.id, afterSummary: "High-severity sampling failure suppressed only the affected cohort." });
}

export async function lockSamplingPolicyBoundary(db: Transaction) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended('knowledge-sampling-policy-boundary', 47))`);
}

function priorityFor(reason: KnowledgeRecommendationReason) { return ({ risk: 1, verification: 2, conflict: 3, weak_evidence: 4, freshness: 5, relation: 6, duplicate_risk: 7, missing_context: 8, sampling: 9 })[reason]; }
function resolutionFor(action: KnowledgeRecommendationAction) { return ({ accept_wording: "accepted", edit: "edited", suppress: "suppressed", restore: "restored", verify: "verified", resolve_relation: "relation_resolved", sampling_pass: "sampling_passed", sampling_fail: "sampling_failed" })[action] as "accepted" | "edited" | "suppressed" | "restored" | "verified" | "relation_resolved" | "sampling_passed" | "sampling_failed"; }
function isCompatibleResolution(reason: KnowledgeRecommendationReason, action: KnowledgeRecommendationAction) {
  if (reason === "verification") return ["edit", "suppress", "verify"].includes(action);
  if (reason === "sampling") return ["sampling_pass", "sampling_fail", "suppress"].includes(action);
  if (reason === "conflict" || reason === "relation" || reason === "missing_context") return ["verify", "resolve_relation", "suppress", "edit"].includes(action);
  return ["accept_wording", "edit", "suppress", "restore"].includes(action);
}

function samplingDispositionFor(input: { action: KnowledgeRecommendationAction; samplingDispositionReason?: string; samplingRationale?: string }): { reason: KnowledgeSamplingDispositionReason; rationale?: string } | null {
  if (input.action !== "sampling_pass" && input.action !== "sampling_fail") return null;
  if (!knowledgeSamplingDispositionReasonValues.includes(input.samplingDispositionReason as KnowledgeSamplingDispositionReason)) return null;
  if (input.action === "sampling_pass" && !["confirmed", "minor_issue"].includes(input.samplingDispositionReason!)) return null;
  if (input.action === "sampling_fail" && !["insufficient_evidence", "stale_or_changed", "material_error", "safety_risk"].includes(input.samplingDispositionReason!)) return null;
  const rationale = input.samplingRationale?.trim();
  if (rationale && (rationale.length > 500 || /[\r\n]/.test(rationale) || /(?:\+?84|0)(?:[\s.-]?\d){8,10}\b|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(rationale))) return null;
  return { reason: input.samplingDispositionReason as KnowledgeSamplingDispositionReason, ...(rationale ? { rationale } : {}) };
}
