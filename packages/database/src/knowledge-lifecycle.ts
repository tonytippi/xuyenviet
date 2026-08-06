import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { KnowledgeLifecycleTrigger, TransitionKnowledgeCardInput, TransitionKnowledgeCardResult } from "@xuyenviet/domain";

import { recordAuditEvent } from "./audit-writers";
import { getDb } from "./client";
import { disableStaleKnowledgeSearchProjection, enqueueKnowledgeIndexWork } from "./knowledge-indexing-queue";
import { lockKnowledgeIngestionJob, projectAndFinalizeKnowledgeIngestionJob } from "./knowledge-ingestion-accounting";
import { knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeIngestionCandidates, knowledgeRecommendations, knowledgeSamplingCohortMembers, knowledgeSamplingObligations, knowledgeSamplingPolicies, knowledgeSamplingRecommendationObligations, sourceCaptureVersions, sources } from "./schema";

type LifecycleDb = ReturnType<typeof getDb>;
type LifecycleTransaction = Parameters<Parameters<LifecycleDb["transaction"]>[0]>[0];
class StaleLifecycleTransition extends Error {}

/** The single writer for lifecycle-caused card, work, candidate, audit, and index effects. */
export async function transitionKnowledgeCard(input: TransitionKnowledgeCardInput, db: LifecycleDb = getDb()): Promise<TransitionKnowledgeCardResult> {
  try {
    return await db.transaction((transaction) => transitionKnowledgeCardInTransaction(transaction, input));
  } catch (error) {
    if (error instanceof StaleLifecycleTransition) return { status: "stale" };
    throw error;
  }
}

export async function transitionKnowledgeCardInTransaction(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  if (input.trigger.kind === "candidate_relation") return transitionCandidateRelation(transaction, input);
  if (input.trigger.kind === "operator_resolution") return transitionOperatorResolution(transaction, input);
  if (input.trigger.kind === "sampling_containment") return transitionSamplingContainment(transaction, input);
  if (input.trigger.kind === "draft_publish") return transitionDraftPublish(transaction, input);
  if (input.trigger.kind === "open_work") return transitionOpenWork(transaction, input);
  if (input.trigger.kind === "content_refresh") return transitionContentRefresh(transaction, input);
  if (input.trigger.kind === "archive" || input.trigger.kind === "restore") return transitionArchiveRestore(transaction, input);
  return transitionSupportLoss(transaction, input);
}

/** Clears superseded candidate work after a version-fenced ingestion rerun. */
export async function clearKnowledgeIngestionCandidatesForRerun(transaction: LifecycleTransaction, ingestionJobId: string) {
  await transaction.delete(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.ingestionJobId, ingestionJobId));
}

async function transitionSamplingContainment(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "sampling_containment" }>;
  const fences = versionFences(input);
  const [policy] = await transaction.select().from(knowledgeSamplingPolicies).where(and(eq(knowledgeSamplingPolicies.id, trigger.policyId), eq(knowledgeSamplingPolicies.enrollmentDigest, trigger.enrollmentDigest))).limit(1).for("update");
  if (!policy?.enrollmentSealedAt) return { status: "stale" };
  const [initiator] = await transaction.select().from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.id, trigger.recommendationId), eq(knowledgeRecommendations.status, "open"), eq(knowledgeRecommendations.workType, "sampling"), eq(knowledgeRecommendations.policyId, policy.id), eq(knowledgeRecommendations.contentVersion, fences.contentVersion), eq(knowledgeRecommendations.evidenceSetRevision, fences.evidenceSetRevision))).limit(1).for("update");
  if (!initiator || fences.recommendationId !== initiator.id) return { status: "stale" };
  const members = await transaction.select({ cardId: knowledgeSamplingCohortMembers.knowledgeCardId, contentVersion: knowledgeSamplingCohortMembers.contentVersion, evidenceSetRevision: knowledgeSamplingCohortMembers.evidenceSetRevision }).from(knowledgeSamplingCohortMembers).where(and(eq(knowledgeSamplingCohortMembers.policyId, policy.id), eq(knowledgeSamplingCohortMembers.selectedForSampling, true))).orderBy(asc(knowledgeSamplingCohortMembers.knowledgeCardId), asc(knowledgeSamplingCohortMembers.contentVersion), asc(knowledgeSamplingCohortMembers.evidenceSetRevision));
  if (members.length !== trigger.members.length || members.some((member, index) => member.cardId !== trigger.members[index]?.cardId || member.contentVersion !== trigger.members[index]?.contentVersion || member.evidenceSetRevision !== trigger.members[index]?.evidenceSetRevision)) return { status: "stale" };
  const cards = [] as Array<typeof knowledgeCards.$inferSelect>;
  for (const member of trigger.members) {
    const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, member.cardId)).limit(1).for("update");
    if (!card || card.lifecycleState !== "active" || card.contentVersion !== member.contentVersion || card.evidenceSetRevision !== member.evidenceSetRevision) return { status: "stale" };
    cards.push(card);
  }
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]!;
    const member = trigger.members[index]!;
    const [samplingWork] = await transaction.select({ id: knowledgeRecommendations.id }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.knowledgeCardId, card.id), eq(knowledgeRecommendations.policyId, policy.id), eq(knowledgeRecommendations.contentVersion, card.contentVersion), eq(knowledgeRecommendations.evidenceSetRevision, card.evidenceSetRevision), eq(knowledgeRecommendations.status, "open"), eq(knowledgeRecommendations.workType, "sampling"))).limit(1).for("update");
    if (!samplingWork) throw new StaleLifecycleTransition();
    await resolveSamplingObligations(transaction, samplingWork.id, "sampling_failed");
    await transaction.update(knowledgeRecommendations).set({ status: "superseded", resolution: "sampling_failed", resolvedAt: new Date(), updatedAt: new Date() }).where(eq(knowledgeRecommendations.id, samplingWork.id));
    const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: member.disposition === "unsafe" ? "suppressed" : "pending_operator", verificationRequirement: member.disposition === "unsafe" ? "none" : "failed", contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
    if (!updated) throw new StaleLifecycleTransition();
    if (member.disposition === "remediable") await openWork(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, "risk", { policyId: policy.id, enrollmentDigest: trigger.enrollmentDigest }, policy.id);
    await lifecycleEffects(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, "sampling_containment", `Contained ${member.disposition} cohort member.`);
  }
  await transaction.update(knowledgeSamplingPolicies).set({ escalatedAt: new Date(), suppressedAt: new Date() }).where(eq(knowledgeSamplingPolicies.id, policy.id));
  return { status: "resolved", cardId: initiator.knowledgeCardId, contentVersion: initiator.contentVersion, evidenceSetRevision: initiator.evidenceSetRevision };
}

async function transitionCandidateRelation(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "candidate_relation" }>;
  const fences = input.fences as Readonly<{ candidateFencingToken: string }>;
  const [candidate] = await transaction.select().from(knowledgeIngestionCandidates).where(and(eq(knowledgeIngestionCandidates.id, trigger.candidateId), eq(knowledgeIngestionCandidates.processingStatus, "processing"), eq(knowledgeIngestionCandidates.fencingToken, fences.candidateFencingToken), gt(knowledgeIngestionCandidates.leaseExpiresAt, new Date()))).limit(1).for("update");
  if (!candidate) return { status: "stale" };
  await lockKnowledgeIngestionJob(transaction, candidate.ingestionJobId);
  const shortlist = await transaction.select({ id: knowledgeCards.id }).from(knowledgeCards).where(and(eq(knowledgeCards.type, candidate.type), inArray(knowledgeCards.lifecycleState, ["draft", "pending_operator", "active", "suppressed"]), sql`${knowledgeCards.id} <> ${candidate.knowledgeCardId ?? ""}`)).orderBy(asc(knowledgeCards.id)).limit(20);
  if (!isValidRelation(trigger, shortlist.map((card) => card.id))) return { status: "invalid", reason: "invalid_relation" };

  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${candidate.sourceId}, 44))`);
  const [capture] = await transaction.select({ id: sourceCaptureVersions.id, rawText: sourceCaptureVersions.rawText }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, candidate.captureVersionId), eq(sources.currentCaptureVersionId, candidate.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1).for("update");
  const quoteText = capture ? codePointSlice(capture.rawText ?? "", candidate.spanStart, candidate.spanEnd) : "";
  if (!capture || !quoteText || Array.from(quoteText).length !== candidate.spanEnd - candidate.spanStart) return { status: "invalid", reason: "ineligible_support" };

  let cardId: string;
  let contentVersion: number;
  let evidenceSetRevision: number;
  let priorPrimaryWorkType: "verification" | "relation" | "risk" | "missing_context" | null = null;
  if (trigger.relation.kind === "create" || trigger.relation.kind === "ambiguous") {
    const [created] = await transaction.insert(knowledgeCards).values({
      lifecycleState: "draft",
      knowledgeState: "community_observation",
      verificationRequirement: trigger.disposition === "apply" ? "none" : "operator_required",
      type: candidate.type,
      title: candidate.title,
      locationName: candidate.locationName,
      routeSegment: candidate.routeSegment,
      summary: candidate.summary,
      practicalDetails: candidate.practicalDetails,
      tags: candidate.tags,
      confidence: "unverified",
      freshnessSensitive: candidate.freshnessSensitive,
      conditions: candidate.conditions,
      currentJudgeSummary: trigger.relation.rationale,
      aiPromptVersion: candidate.extractionPromptVersion,
      executorSystem: input.actor.kind === "system" ? input.actor.system : undefined,
      createdByUserId: input.actor.kind === "user" ? input.actor.userId : undefined,
    }).returning({ id: knowledgeCards.id, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
    if (!created) throw new Error("Knowledge lifecycle card creation failed.");
    cardId = created.id; contentVersion = created.contentVersion; evidenceSetRevision = created.evidenceSetRevision;
  } else {
    cardId = trigger.relation.targetCardId;
    const [card] = await transaction.select({ id: knowledgeCards.id, lifecycleState: knowledgeCards.lifecycleState, knowledgeState: knowledgeCards.knowledgeState, verificationRequirement: knowledgeCards.verificationRequirement, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, cardId)).limit(1).for("update");
    if (!card) return { status: "invalid", reason: "target_not_found" };
    if (card.lifecycleState !== "draft" && card.lifecycleState !== "pending_operator" && card.lifecycleState !== "active" && card.lifecycleState !== "suppressed") return { status: "invalid", reason: "target_not_eligible" };
    const [primaryWork] = card.lifecycleState === "pending_operator"
      ? await transaction.select({ workType: knowledgeRecommendations.workType }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.knowledgeCardId, card.id), eq(knowledgeRecommendations.status, "open"), inArray(knowledgeRecommendations.workType, ["verification", "relation", "risk", "missing_context"]))).limit(1).for("update")
      : [undefined];
    priorPrimaryWorkType = primaryWork?.workType === "sampling" ? null : primaryWork?.workType ?? null;
    const requiresOperator = trigger.relation.kind === "conflict" || card.lifecycleState === "suppressed" || card.lifecycleState === "pending_operator";
    const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: requiresOperator ? "pending_operator" : card.lifecycleState, knowledgeState: trigger.relation.kind === "conflict" ? "conflicted" : card.knowledgeState, verificationRequirement: requiresOperator ? "operator_required" : card.verificationRequirement, currentJudgeSummary: trigger.relation.rationale, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, evidenceSetRevision: sql`${knowledgeCards.evidenceSetRevision} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
    if (!updated) throw new StaleLifecycleTransition();
    contentVersion = updated.contentVersion; evidenceSetRevision = updated.evidenceSetRevision;
  }
  await transaction.insert(knowledgeCardSources).values({ knowledgeCardId: cardId, sourceId: candidate.sourceId, supportLevel: trigger.relation.kind === "conflict" ? "conflicting" : "primary" }).onConflictDoNothing();
  await transaction.insert(knowledgeCardEvidence).values({ knowledgeCardId: cardId, sourceId: candidate.sourceId, captureVersionId: candidate.captureVersionId, quoteText, spanStart: candidate.spanStart, spanEnd: candidate.spanEnd, observedAt: new Date(), capturedAt: new Date(), conditions: candidate.conditions, supportLevel: trigger.relation.kind === "conflict" ? "conflicting" : "supporting", displayPolicy: "fact_only", independenceKey: `${candidate.sourceId}:${candidate.captureVersionId}` }).onConflictDoNothing();
  if (trigger.relation.kind === "create" || trigger.relation.kind === "ambiguous") {
    const [activated] = await transaction.update(knowledgeCards).set({ lifecycleState: trigger.disposition === "apply" ? "active" : "pending_operator", verificationRequirement: trigger.disposition === "apply" ? "none" : "operator_required", updatedAt: new Date() }).where(and(eq(knowledgeCards.id, cardId), eq(knowledgeCards.lifecycleState, "draft"))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
    if (!activated) throw new StaleLifecycleTransition();
    contentVersion = activated.contentVersion; evidenceSetRevision = activated.evidenceSetRevision;
  }

  const candidateWorkType = trigger.relation.kind === "ambiguous" || trigger.relation.kind === "conflict"
    ? "relation"
    : trigger.outcomeReasonCode === "missing_context"
      ? "missing_context"
      : "verification";
  // Evidence changes replace every version-fenced work item; pending primary work gets a successor.
  if (trigger.relation.kind !== "create" && trigger.relation.kind !== "ambiguous") {
    await supersedeOpenWork(transaction, cardId);
    const workType = trigger.disposition === "needs_operator" ? candidateWorkType : priorPrimaryWorkType;
    if (workType) await openWork(transaction, input, cardId, contentVersion, evidenceSetRevision, workType, { relation: trigger.relation.kind });
  }

  const [completed] = await transaction.update(knowledgeIngestionCandidates).set({ processingStatus: "completed", aiDisposition: trigger.disposition, outcomeReasonCode: trigger.outcomeReasonCode, knowledgeCardId: cardId, completedContentVersion: contentVersion, completedEvidenceSetRevision: evidenceSetRevision, judgmentSummary: trigger.relation.rationale, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: new Date() }).where(and(eq(knowledgeIngestionCandidates.id, candidate.id), eq(knowledgeIngestionCandidates.processingStatus, "processing"), eq(knowledgeIngestionCandidates.fencingToken, fences.candidateFencingToken), gt(knowledgeIngestionCandidates.leaseExpiresAt, new Date()))).returning({ ingestionJobId: knowledgeIngestionCandidates.ingestionJobId });
  // This final lease CAS is the candidate commit point. Roll back every prior effect if it loses.
  if (!completed) throw new StaleLifecycleTransition();
  await projectAndFinalizeKnowledgeIngestionJob(transaction, completed.ingestionJobId);
  if (trigger.disposition === "needs_operator") {
    if (trigger.relation.kind === "create" || trigger.relation.kind === "ambiguous") await openWork(transaction, input, cardId, contentVersion, evidenceSetRevision, candidateWorkType, { relation: trigger.relation.kind, shortlistCardIds: "shortlistCardIds" in trigger.relation ? trigger.relation.shortlistCardIds : [] });
    await transaction.insert(knowledgeSamplingObligations).values({ candidateId: candidate.id, knowledgeCardId: cardId, contentVersion, evidenceSetRevision }).onConflictDoNothing();
  }
  await lifecycleEffects(transaction, input, cardId, contentVersion, evidenceSetRevision, "candidate_relation", `Candidate evidence attached: relation=${trigger.relation.kind}.`);
  await recordAuditEvent({ actor: input.actor, operation: "update", targetType: "knowledge_lifecycle", targetId: cardId, afterSummary: `Candidate relation resolved: candidateId=${candidate.id}; relation=${trigger.relation.kind}; disposition=${trigger.disposition}.` }, transaction);
  return { status: "resolved", cardId, contentVersion, evidenceSetRevision };
}

async function transitionOperatorResolution(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "operator_resolution" }>;
  const fences = input.fences as Readonly<{ contentVersion: number; evidenceSetRevision: number; recommendationId?: string }>;
  const [recommendation] = await transaction.select().from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.id, trigger.recommendationId), eq(knowledgeRecommendations.status, "open"))).limit(1).for("update");
  if (!recommendation) return { status: "stale" };
  if (fences.recommendationId !== recommendation.id || fences.contentVersion !== recommendation.contentVersion || fences.evidenceSetRevision !== recommendation.evidenceSetRevision) return { status: "stale" };
  const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, recommendation.knowledgeCardId)).limit(1).for("update");
  if (!card || card.contentVersion !== recommendation.contentVersion || card.evidenceSetRevision !== recommendation.evidenceSetRevision) return { status: "stale" };
  if (!resolutionMatchesWorkType(recommendation.workType, trigger.resolution)) return { status: "invalid", reason: "invalid_resolution" };
  if (recommendation.workType === "sampling" && card.lifecycleState !== "active" || recommendation.workType !== "sampling" && card.lifecycleState !== "pending_operator") return { status: "stale" };
  const publish = trigger.resolution === "published_operator_confirmed" || trigger.resolution === "published_community_observation" || trigger.resolution === "relation_resolved";
  if (recommendation.workType === "sampling") {
    if (trigger.resolution === "sampling_failed" && trigger.highSeverity) {
      const [policy] = recommendation.policyId ? await transaction.select({ id: knowledgeSamplingPolicies.id, enrollmentDigest: knowledgeSamplingPolicies.enrollmentDigest, enrollmentSealedAt: knowledgeSamplingPolicies.enrollmentSealedAt }).from(knowledgeSamplingPolicies).where(eq(knowledgeSamplingPolicies.id, recommendation.policyId)).limit(1).for("update") : [];
      if (!policy?.enrollmentSealedAt || !policy.enrollmentDigest) return { status: "stale" };
      const members = await transaction.select({ cardId: knowledgeSamplingCohortMembers.knowledgeCardId, contentVersion: knowledgeSamplingCohortMembers.contentVersion, evidenceSetRevision: knowledgeSamplingCohortMembers.evidenceSetRevision }).from(knowledgeSamplingCohortMembers).where(and(eq(knowledgeSamplingCohortMembers.policyId, policy.id), eq(knowledgeSamplingCohortMembers.selectedForSampling, true))).orderBy(asc(knowledgeSamplingCohortMembers.knowledgeCardId), asc(knowledgeSamplingCohortMembers.contentVersion), asc(knowledgeSamplingCohortMembers.evidenceSetRevision));
      return transitionSamplingContainment(transaction, { actor: input.actor, fences: { recommendationId: recommendation.id, contentVersion: recommendation.contentVersion, evidenceSetRevision: recommendation.evidenceSetRevision }, trigger: { kind: "sampling_containment", policyId: policy.id, enrollmentDigest: policy.enrollmentDigest, recommendationId: recommendation.id, members: members.map((member) => ({ ...member, disposition: "remediable" as const })) } });
    }
    await resolveSamplingObligations(transaction, recommendation.id, trigger.resolution as "sampling_passed" | "sampling_failed");
    await resolveWork(transaction, recommendation.id, input, trigger.resolution);
    await recordAuditEvent({ actor: input.actor, operation: "update", targetType: "knowledge_lifecycle", targetId: card.id, afterSummary: `Sampling outcome: recommendationId=${recommendation.id}; resolution=${trigger.resolution}.` }, transaction);
    return { status: "resolved", cardId: card.id, contentVersion: card.contentVersion, evidenceSetRevision: card.evidenceSetRevision };
  }
  if (publish && !(await hasEligibleSupport(transaction, card.id))) return { status: "invalid", reason: "ineligible_support" };
  const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: publish ? "active" : trigger.resolution === "suppressed" ? "suppressed" : "pending_operator", verificationRequirement: publish || trigger.resolution === "suppressed" ? "none" : card.verificationRequirement, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (!updated) return { status: "stale" };
  await supersedeOpenWork(transaction, card.id);
  await resolveWork(transaction, recommendation.id, input, trigger.resolution);
  if (trigger.resolution === "edited_and_requeued") await openWork(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, recommendation.workType, { predecessorId: recommendation.id });
  await disableStaleKnowledgeSearchProjection(transaction, card.id, updated.contentVersion);
  await enqueueKnowledgeIndexWork(transaction, { cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, reason: "lifecycle_transition", executorSystem: input.actor.kind === "system" ? input.actor.system : undefined });
  await recordAuditEvent({ actor: input.actor, operation: "update", targetType: "knowledge_lifecycle", targetId: card.id, afterSummary: `Operator resolution: recommendationId=${recommendation.id}; resolution=${trigger.resolution}.` }, transaction);
  return { status: "resolved", cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision };
}

async function transitionDraftPublish(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "draft_publish" }>;
  const fences = versionFences(input);
  const [card] = await transaction.select().from(knowledgeCards).where(and(eq(knowledgeCards.id, trigger.cardId), eq(knowledgeCards.lifecycleState, "draft"))).limit(1).for("update");
  if (!card) return { status: "stale" };
  if (fences.contentVersion !== card.contentVersion || fences.evidenceSetRevision !== card.evidenceSetRevision) return { status: "stale" };
  if (!(await hasEligibleSupport(transaction, card.id))) return { status: "invalid", reason: "ineligible_support" };
  const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (!updated) return { status: "stale" };
  await lifecycleEffects(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, "draft_publish", "Published draft card.");
  return { status: "resolved", cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision };
}

async function transitionOpenWork(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "open_work" }>;
  const fences = versionFences(input);
  const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, trigger.cardId)).limit(1).for("update");
  if (!card) return { status: "invalid", reason: "target_not_found" };
  if (fences.contentVersion !== card.contentVersion || fences.evidenceSetRevision !== card.evidenceSetRevision) return { status: "stale" };
  if (trigger.workType === "sampling" && (card.lifecycleState !== "active" || card.verificationRequirement !== "none")) return { status: "invalid", reason: "invalid_work_state" };
  if (trigger.workType === "sampling" && (!trigger.policyId || !trigger.obligationIds?.length)) return { status: "invalid", reason: "invalid_sampling_scope" };
  if (trigger.workType === "sampling") {
    const [policy] = await transaction.select({ enrollmentSealedAt: knowledgeSamplingPolicies.enrollmentSealedAt }).from(knowledgeSamplingPolicies).where(eq(knowledgeSamplingPolicies.id, trigger.policyId!)).limit(1);
    const [member] = await transaction.select({ knowledgeCardId: knowledgeSamplingCohortMembers.knowledgeCardId }).from(knowledgeSamplingCohortMembers).where(and(eq(knowledgeSamplingCohortMembers.policyId, trigger.policyId!), eq(knowledgeSamplingCohortMembers.knowledgeCardId, card.id), eq(knowledgeSamplingCohortMembers.contentVersion, card.contentVersion), eq(knowledgeSamplingCohortMembers.evidenceSetRevision, card.evidenceSetRevision), eq(knowledgeSamplingCohortMembers.selectedForSampling, true))).limit(1);
    const [primary] = await transaction.select({ id: knowledgeRecommendations.id }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.knowledgeCardId, card.id), eq(knowledgeRecommendations.contentVersion, card.contentVersion), eq(knowledgeRecommendations.evidenceSetRevision, card.evidenceSetRevision), eq(knowledgeRecommendations.status, "open"), inArray(knowledgeRecommendations.workType, ["verification", "relation", "risk", "missing_context"]))).limit(1);
    if (!policy?.enrollmentSealedAt || !member || primary) return { status: "invalid", reason: "invalid_sampling_scope" };
  }
  if (trigger.workType !== "sampling" && card.lifecycleState !== "pending_operator" && card.lifecycleState !== "suppressed") return { status: "invalid", reason: "invalid_work_state" };
  let contentVersion = card.contentVersion;
  if (card.lifecycleState === "suppressed") {
    const [reopened] = await transaction.update(knowledgeCards).set({ lifecycleState: "pending_operator", verificationRequirement: "operator_required", contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion });
    if (!reopened) return { status: "stale" };
    contentVersion = reopened.contentVersion;
  }
  await openWork(transaction, input, card.id, contentVersion, card.evidenceSetRevision, trigger.workType, trigger.policySnapshot ?? {}, trigger.policyId, trigger.obligationIds);
  if (contentVersion !== card.contentVersion) await lifecycleEffects(transaction, input, card.id, contentVersion, card.evidenceSetRevision, "open_work", `Reopened suppressed card with ${trigger.workType} work.`);
  else await recordAuditEvent({ actor: input.actor, operation: "update", targetType: "knowledge_lifecycle", targetId: card.id, afterSummary: `Opened ${trigger.workType} work at the current fence.` }, transaction);
  return { status: "resolved", cardId: card.id, contentVersion, evidenceSetRevision: card.evidenceSetRevision };
}

async function transitionContentRefresh(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "content_refresh" }>;
  const fences = versionFences(input);
  const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, trigger.cardId)).limit(1).for("update");
  if (!card) return { status: "invalid", reason: "target_not_found" };
  if (fences.contentVersion !== card.contentVersion || fences.evidenceSetRevision !== card.evidenceSetRevision) return { status: "stale" };
  if (card.lifecycleState === "archived" || card.lifecycleState === "rejected") return { status: "resolved", cardId: card.id, contentVersion: card.contentVersion, evidenceSetRevision: card.evidenceSetRevision };
  const [updated] = await transaction.update(knowledgeCards).set({ contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (!updated) return { status: "stale" };
  await supersedeOpenWork(transaction, card.id);
  if (card.lifecycleState === "pending_operator") {
    const [work] = await transaction.select({ workType: knowledgeRecommendations.workType }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.knowledgeCardId, card.id), eq(knowledgeRecommendations.contentVersion, card.contentVersion), eq(knowledgeRecommendations.evidenceSetRevision, card.evidenceSetRevision), eq(knowledgeRecommendations.status, "superseded"), inArray(knowledgeRecommendations.workType, ["verification", "relation", "risk", "missing_context"]))).limit(1);
    await openWork(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, work?.workType ?? "verification", { refreshReason: trigger.reason });
  }
  await lifecycleEffects(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, trigger.reason, "Refreshed card content after source metadata changed.");
  return { status: "resolved", cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision };
}

async function transitionSupportLoss(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "support_loss" }>;
  const fences = versionFences(input);
  const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, trigger.cardId)).limit(1).for("update");
  if (!card) return { status: "invalid", reason: "target_not_found" };
  if (fences.contentVersion !== card.contentVersion || fences.evidenceSetRevision !== card.evidenceSetRevision) return { status: "stale" };
  const support = await hasEligibleSupport(transaction, card.id);
  if (support || card.lifecycleState !== "active") return { status: "resolved", cardId: card.id, contentVersion: card.contentVersion, evidenceSetRevision: card.evidenceSetRevision };
  const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: "suppressed", verificationRequirement: "none", contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (!updated) return { status: "stale" };
  await transaction.update(knowledgeRecommendations).set({ status: "superseded", resolution: "edited_and_requeued", resolvedAt: new Date(), updatedAt: new Date() }).where(and(eq(knowledgeRecommendations.knowledgeCardId, card.id), eq(knowledgeRecommendations.status, "open")));
  await lifecycleEffects(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, trigger.reason, "Suppressed card after all eligible support was withdrawn.");
  return { status: "resolved", cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision };
}

async function transitionArchiveRestore(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "archive" | "restore" }>;
  const fences = versionFences(input);
  if (trigger.kind === "restore" && !trigger.cardId && !trigger.recommendationId) return { status: "invalid", reason: "target_not_found" };
  let cardId = trigger.cardId;
  if (trigger.kind === "restore" && trigger.recommendationId) {
    const [recommendation] = await transaction.select({ knowledgeCardId: knowledgeRecommendations.knowledgeCardId }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.id, trigger.recommendationId), eq(knowledgeRecommendations.status, "open"), eq(knowledgeRecommendations.contentVersion, fences.contentVersion), eq(knowledgeRecommendations.evidenceSetRevision, fences.evidenceSetRevision), inArray(knowledgeRecommendations.workType, ["verification", "relation", "risk", "missing_context"]))).limit(1).for("update");
    if (!recommendation || fences.recommendationId !== trigger.recommendationId) return { status: "stale" };
    if (cardId && cardId !== recommendation.knowledgeCardId) return { status: "stale" };
    cardId = recommendation.knowledgeCardId;
  }
  if (!cardId) return { status: "invalid", reason: "target_not_found" };
  const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, cardId)).limit(1).for("update");
  if (!card) return { status: "invalid", reason: "target_not_found" };
  if (fences.contentVersion !== card.contentVersion || fences.evidenceSetRevision !== card.evidenceSetRevision) return { status: "stale" };
  if (trigger.kind === "archive" && (card.lifecycleState === "archived" || card.lifecycleState === "rejected")) return { status: "invalid", reason: "invalid_archive_state" };
  if (trigger.kind === "restore" && card.lifecycleState !== "archived") return { status: "stale" };
  if (trigger.kind === "restore") {
    if (!(await hasEligibleSupport(transaction, card.id))) return { status: "invalid", reason: "ineligible_support" };
  }
  const restoringPending = trigger.kind === "restore" && trigger.target === "pending_operator";
  const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: trigger.kind === "archive" ? "archived" : trigger.target, verificationRequirement: trigger.kind === "archive" || trigger.target === "active" ? "none" : "operator_required", contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (!updated) return { status: "stale" };
  await supersedeOpenWork(transaction, card.id);
  if (restoringPending) await openWork(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, "verification", {});
  await lifecycleEffects(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, trigger.kind, `${trigger.kind} card.`);
  return { status: "resolved", cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision };
}

async function lifecycleEffects(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput, cardId: string, contentVersion: number, evidenceSetRevision: number, reason: string, summary: string) {
  await disableStaleKnowledgeSearchProjection(transaction, cardId, contentVersion);
  await enqueueKnowledgeIndexWork(transaction, { cardId, contentVersion, evidenceSetRevision, reason: "lifecycle_transition", executorSystem: input.actor.kind === "system" ? input.actor.system : undefined });
  await recordAuditEvent({ actor: input.actor, operation: "update", targetType: "knowledge_lifecycle", targetId: cardId, afterSummary: `${summary} reason=${reason}.` }, transaction);
}

async function openWork(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput, cardId: string, contentVersion: number, evidenceSetRevision: number, workType: "verification" | "relation" | "risk" | "missing_context" | "sampling", policySnapshot: Record<string, unknown>, policyId?: string | null, obligationIds?: readonly string[]) {
  const [work] = await transaction.insert(knowledgeRecommendations).values({ knowledgeCardId: cardId, contentVersion, evidenceSetRevision, workType, priority: workPriority(workType), policyId: policyId ?? null, policySnapshot, executorSystem: input.actor.kind === "system" ? input.actor.system : null }).onConflictDoNothing().returning({ id: knowledgeRecommendations.id });
  if (workType === "sampling" && work && obligationIds?.length) await transaction.insert(knowledgeSamplingRecommendationObligations).values(obligationIds.map((obligationId) => ({ recommendationId: work.id, obligationId }))).onConflictDoNothing();
}

async function resolveSamplingObligations(transaction: LifecycleTransaction, recommendationId: string, resolution: "sampling_passed" | "sampling_failed") {
  await transaction.update(knowledgeSamplingObligations).set({ samplingDisposition: resolution, sampledAt: new Date() }).where(and(sql`exists (select 1 from ${knowledgeSamplingRecommendationObligations} association where association.obligation_id = ${knowledgeSamplingObligations.id} and association.recommendation_id = ${recommendationId})`, isNull(knowledgeSamplingObligations.samplingDisposition)));
}

async function supersedeOpenWork(transaction: LifecycleTransaction, cardId: string) {
  await transaction.update(knowledgeRecommendations).set({ status: "superseded", resolution: "edited_and_requeued", resolvedAt: new Date(), updatedAt: new Date() }).where(and(eq(knowledgeRecommendations.knowledgeCardId, cardId), eq(knowledgeRecommendations.status, "open")));
}

async function resolveWork(transaction: LifecycleTransaction, recommendationId: string, input: TransitionKnowledgeCardInput, resolution: Extract<KnowledgeLifecycleTrigger, { kind: "operator_resolution" }>['resolution']) {
  await transaction.update(knowledgeRecommendations).set({ status: "resolved", resolution, resolvedByUserId: input.actor.kind === "user" ? input.actor.userId : null, resolvedAt: new Date(), executorSystem: input.actor.kind === "system" ? input.actor.system : null, updatedAt: new Date() }).where(eq(knowledgeRecommendations.id, recommendationId));
}

function isValidRelation(trigger: Extract<KnowledgeLifecycleTrigger, { kind: "candidate_relation" }>, expectedShortlist: string[]) {
  const { relation } = trigger;
  if (!relation.rationale.trim() || relation.rationale.length > 1_000) return false;
  if (relation.kind === "create") return true;
  if (trigger.disposition !== "needs_operator" && (relation.kind === "conflict" || relation.kind === "ambiguous")) return false;
  if (relation.kind === "conflict" && trigger.outcomeReasonCode !== "conflict" || relation.kind === "ambiguous" && trigger.outcomeReasonCode !== "relation_ambiguous") return false;
  if (relation.kind === "attach" && trigger.outcomeReasonCode === "conflict") return false;
  return relation.kind === "ambiguous" || expectedShortlist.includes(relation.targetCardId);
}

function resolutionMatchesWorkType(workType: string, resolution: string) {
  if (resolution === "sampling_passed" || resolution === "sampling_failed") return workType === "sampling";
  if (resolution === "relation_resolved") return workType === "relation";
  return workType !== "sampling";
}

function workPriority(workType: "verification" | "relation" | "risk" | "missing_context" | "sampling") { return ({ verification: 1, relation: 2, risk: 3, missing_context: 4, sampling: 5 })[workType]; }

function codePointSlice(text: string, start: number, end: number) { return Array.from(text).slice(start, end).join(""); }
function versionFences(input: TransitionKnowledgeCardInput) { return input.fences as Readonly<{ contentVersion: number; evidenceSetRevision: number; recommendationId?: string }>; }
async function hasEligibleSupport(transaction: LifecycleTransaction, cardId: string) {
  const [support] = await transaction.select({ id: knowledgeCardEvidence.id }).from(knowledgeCardEvidence).innerJoin(sources, eq(sources.id, knowledgeCardEvidence.sourceId)).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId)).where(and(eq(knowledgeCardEvidence.knowledgeCardId, cardId), eq(knowledgeCardEvidence.state, "active"), inArray(knowledgeCardEvidence.supportLevel, ["primary", "supporting"]), eq(sources.eligibility, "eligible"), eq(sources.currentCaptureVersionId, knowledgeCardEvidence.captureVersionId), isNull(sourceCaptureVersions.payloadDeletedAt), sql`substring(${sourceCaptureVersions.rawText} from ${knowledgeCardEvidence.spanStart} + 1 for ${knowledgeCardEvidence.spanEnd} - ${knowledgeCardEvidence.spanStart}) = ${knowledgeCardEvidence.quoteText}`)).limit(1);
  return Boolean(support);
}
