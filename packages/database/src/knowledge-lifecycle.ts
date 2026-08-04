import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { KnowledgeLifecycleTrigger, TransitionKnowledgeCardInput, TransitionKnowledgeCardResult } from "@xuyenviet/domain";

import { recordAuditEvent } from "./audit-writers";
import { getDb } from "./client";
import { disableStaleKnowledgeSearchProjection, enqueueKnowledgeIndexWork } from "./knowledge-indexing-queue";
import { knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, knowledgeSamplingObligations, sourceCaptureVersions, sources } from "./schema";

type LifecycleDb = ReturnType<typeof getDb>;
type LifecycleTransaction = Parameters<Parameters<LifecycleDb["transaction"]>[0]>[0];

/** The single writer for lifecycle-caused card, work, candidate, audit, and index effects. */
export async function transitionKnowledgeCard(input: TransitionKnowledgeCardInput, db: LifecycleDb = getDb()): Promise<TransitionKnowledgeCardResult> {
  return db.transaction((transaction) => transitionKnowledgeCardInTransaction(transaction, input));
}

export async function transitionKnowledgeCardInTransaction(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  if (input.trigger.kind === "candidate_relation") return transitionCandidateRelation(transaction, input);
  if (input.trigger.kind === "operator_resolution") return transitionOperatorResolution(transaction, input);
  if (input.trigger.kind === "draft_publish") return transitionDraftPublish(transaction, input);
  if (input.trigger.kind === "open_work") return transitionOpenWork(transaction, input);
  if (input.trigger.kind === "content_refresh") return transitionContentRefresh(transaction, input);
  if (input.trigger.kind === "archive" || input.trigger.kind === "restore") return transitionArchiveRestore(transaction, input);
  return transitionSupportLoss(transaction, input);
}

async function transitionCandidateRelation(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "candidate_relation" }>;
  const [candidate] = await transaction.select().from(knowledgeIngestionCandidates).where(and(eq(knowledgeIngestionCandidates.id, trigger.candidateId), eq(knowledgeIngestionCandidates.processingStatus, "processing"), eq(knowledgeIngestionCandidates.fencingToken, input.fences.candidateFencingToken ?? ""), gt(knowledgeIngestionCandidates.leaseExpiresAt, new Date()))).limit(1).for("update");
  if (!candidate) return { status: "stale" };
  const shortlist = await transaction.select({ id: knowledgeCards.id }).from(knowledgeCards).where(and(eq(knowledgeCards.type, candidate.type), inArray(knowledgeCards.lifecycleState, ["draft", "pending_operator", "active"]), sql`${knowledgeCards.id} <> ${candidate.knowledgeCardId ?? ""}`)).orderBy(asc(knowledgeCards.id)).limit(20);
  if (!isValidRelation(trigger, shortlist.map((card) => card.id))) return { status: "invalid", reason: "invalid_relation" };

  const [capture] = await transaction.select({ id: sourceCaptureVersions.id, rawText: sourceCaptureVersions.rawText }).from(sourceCaptureVersions).innerJoin(sources, eq(sources.id, sourceCaptureVersions.sourceId)).where(and(eq(sourceCaptureVersions.id, candidate.captureVersionId), eq(sources.currentCaptureVersionId, candidate.captureVersionId), eq(sources.eligibility, "eligible"), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1).for("update");
  const quoteText = capture?.rawText?.slice(candidate.spanStart, candidate.spanEnd) ?? "";
  if (!capture || !quoteText || quoteText.length !== candidate.spanEnd - candidate.spanStart) return { status: "invalid", reason: "ineligible_support" };

  let cardId: string;
  let contentVersion: number;
  let evidenceSetRevision: number;
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
    const [card] = await transaction.select({ id: knowledgeCards.id, lifecycleState: knowledgeCards.lifecycleState, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, cardId)).limit(1).for("update");
    if (!card) return { status: "invalid", reason: "target_not_found" };
    if (card.lifecycleState !== "draft" && card.lifecycleState !== "pending_operator" && card.lifecycleState !== "active") return { status: "invalid", reason: "target_not_eligible" };
    const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: trigger.disposition === "apply" ? "active" : "pending_operator", knowledgeState: trigger.relation.kind === "conflict" ? "conflicted" : "community_observation", verificationRequirement: trigger.disposition === "apply" ? "none" : "operator_required", currentJudgeSummary: trigger.relation.rationale, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, evidenceSetRevision: sql`${knowledgeCards.evidenceSetRevision} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
    if (!updated) return { status: "stale" };
    contentVersion = updated.contentVersion; evidenceSetRevision = updated.evidenceSetRevision;
  }
  await transaction.insert(knowledgeCardSources).values({ knowledgeCardId: cardId, sourceId: candidate.sourceId, supportLevel: trigger.relation.kind === "conflict" ? "conflicting" : "primary" }).onConflictDoNothing();
  await transaction.insert(knowledgeCardEvidence).values({ knowledgeCardId: cardId, sourceId: candidate.sourceId, captureVersionId: candidate.captureVersionId, quoteText, spanStart: candidate.spanStart, spanEnd: candidate.spanEnd, observedAt: new Date(), capturedAt: new Date(), conditions: candidate.conditions, supportLevel: trigger.relation.kind === "conflict" ? "conflicting" : "supporting", displayPolicy: "fact_only", independenceKey: `${candidate.sourceId}:${candidate.captureVersionId}` }).onConflictDoNothing();
  if (trigger.relation.kind === "create" || trigger.relation.kind === "ambiguous") {
    const [activated] = await transaction.update(knowledgeCards).set({ lifecycleState: trigger.disposition === "apply" ? "active" : "pending_operator", verificationRequirement: trigger.disposition === "apply" ? "none" : "operator_required", updatedAt: new Date() }).where(and(eq(knowledgeCards.id, cardId), eq(knowledgeCards.lifecycleState, "draft"))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
    if (!activated) return { status: "stale" };
    contentVersion = activated.contentVersion; evidenceSetRevision = activated.evidenceSetRevision;
  }

  const [completed] = await transaction.update(knowledgeIngestionCandidates).set({ processingStatus: "completed", aiDisposition: trigger.disposition, outcomeReasonCode: trigger.outcomeReasonCode, knowledgeCardId: cardId, judgmentSummary: trigger.relation.rationale, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: new Date() }).where(and(eq(knowledgeIngestionCandidates.id, candidate.id), eq(knowledgeIngestionCandidates.processingStatus, "processing"), eq(knowledgeIngestionCandidates.fencingToken, input.fences.candidateFencingToken ?? ""), gt(knowledgeIngestionCandidates.leaseExpiresAt, new Date()))).returning({ ingestionJobId: knowledgeIngestionCandidates.ingestionJobId });
  if (!completed) return { status: "stale" };
  await transaction.update(knowledgeIngestionJobs).set({ candidateCount: sql`(select count(*)::int from knowledge_ingestion_candidates where ingestion_job_id = ${completed.ingestionJobId})`, completedCandidateCount: sql`${knowledgeIngestionJobs.completedCandidateCount} + 1`, needsOperatorCandidateCount: trigger.disposition === "needs_operator" ? sql`${knowledgeIngestionJobs.needsOperatorCandidateCount} + 1` : undefined, updatedAt: new Date() }).where(eq(knowledgeIngestionJobs.id, completed.ingestionJobId));
  await transaction.execute(sql`update knowledge_ingestion_jobs set status = 'completed', claimed_by = null, claimed_at = null, lease_expires_at = null, fencing_token = null, updated_at = now() where id = ${completed.ingestionJobId} and discovery_terminal = true and status in ('queued', 'running') and not exists (select 1 from knowledge_ingestion_candidates where ingestion_job_id = ${completed.ingestionJobId} and processing_status in ('queued', 'processing'))`);
  if (trigger.disposition === "needs_operator") {
    const workType = trigger.relation.kind === "ambiguous" || trigger.relation.kind === "conflict" ? "relation" : trigger.outcomeReasonCode === "missing_context" ? "missing_context" : "verification";
    await transaction.insert(knowledgeRecommendations).values({ knowledgeCardId: cardId, contentVersion, evidenceSetRevision, workType, priority: workPriority(workType), policySnapshot: { relation: trigger.relation.kind, shortlistCardIds: "shortlistCardIds" in trigger.relation ? trigger.relation.shortlistCardIds : [] }, executorSystem: input.actor.kind === "system" ? input.actor.system : null }).onConflictDoNothing();
    await transaction.insert(knowledgeSamplingObligations).values({ candidateId: candidate.id, knowledgeCardId: cardId, contentVersion, evidenceSetRevision }).onConflictDoNothing();
  }
  await disableStaleKnowledgeSearchProjection(transaction, cardId, contentVersion);
  await enqueueKnowledgeIndexWork(transaction, { cardId, contentVersion, evidenceSetRevision, reason: "lifecycle_transition", executorSystem: input.actor.kind === "system" ? input.actor.system : undefined });
  await recordAuditEvent({ actor: input.actor, operation: "update", targetType: "knowledge_lifecycle", targetId: cardId, afterSummary: `Candidate relation resolved: candidateId=${candidate.id}; relation=${trigger.relation.kind}; disposition=${trigger.disposition}.` }, transaction);
  return { status: "resolved", cardId, contentVersion, evidenceSetRevision };
}

async function transitionOperatorResolution(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "operator_resolution" }>;
  const [recommendation] = await transaction.select().from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.id, trigger.recommendationId), eq(knowledgeRecommendations.status, "open"))).limit(1).for("update");
  if (!recommendation) return { status: "stale" };
  if (input.fences.contentVersion !== recommendation.contentVersion || input.fences.evidenceSetRevision !== recommendation.evidenceSetRevision) return { status: "stale" };
  const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, recommendation.knowledgeCardId)).limit(1).for("update");
  if (!card || card.contentVersion !== recommendation.contentVersion || card.evidenceSetRevision !== recommendation.evidenceSetRevision) return { status: "stale" };
  if (!resolutionMatchesWorkType(recommendation.workType, trigger.resolution)) return { status: "invalid", reason: "invalid_resolution" };
  const publish = trigger.resolution === "published_operator_confirmed" || trigger.resolution === "published_community_observation" || trigger.resolution === "relation_resolved" || trigger.resolution === "sampling_passed";
  const samplingFailed = trigger.resolution === "sampling_failed";
  const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: publish ? "active" : samplingFailed ? "pending_operator" : trigger.resolution === "suppressed" ? "suppressed" : "pending_operator", verificationRequirement: publish ? "none" : samplingFailed ? "failed" : card.verificationRequirement, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (!updated) return { status: "stale" };
  if (trigger.resolution === "sampling_passed" || samplingFailed) await transaction.update(knowledgeSamplingObligations).set({ samplingDisposition: trigger.resolution, sampledAt: new Date() }).where(and(eq(knowledgeSamplingObligations.knowledgeCardId, card.id), eq(knowledgeSamplingObligations.contentVersion, recommendation.contentVersion), eq(knowledgeSamplingObligations.evidenceSetRevision, recommendation.evidenceSetRevision), isNull(knowledgeSamplingObligations.samplingDisposition)));
  await transaction.update(knowledgeRecommendations).set({ status: "superseded", resolution: "edited_and_requeued", resolvedByUserId: input.actor.kind === "user" ? input.actor.userId : null, resolvedAt: new Date(), executorSystem: input.actor.kind === "system" ? input.actor.system : null, updatedAt: new Date() }).where(and(eq(knowledgeRecommendations.knowledgeCardId, card.id), eq(knowledgeRecommendations.status, "open"), eq(knowledgeRecommendations.contentVersion, recommendation.contentVersion), eq(knowledgeRecommendations.evidenceSetRevision, recommendation.evidenceSetRevision), recommendation.workType === "sampling" ? eq(knowledgeRecommendations.workType, "sampling") : inArray(knowledgeRecommendations.workType, ["verification", "relation", "risk", "missing_context"])));
  await transaction.update(knowledgeRecommendations).set({ status: "resolved", resolution: trigger.resolution, resolvedByUserId: input.actor.kind === "user" ? input.actor.userId : null, resolvedAt: new Date(), executorSystem: input.actor.kind === "system" ? input.actor.system : null, updatedAt: new Date() }).where(eq(knowledgeRecommendations.id, recommendation.id));
  if (trigger.resolution === "edited_and_requeued" || samplingFailed) await transaction.insert(knowledgeRecommendations).values({ knowledgeCardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, workType: samplingFailed ? "risk" : recommendation.workType, priority: workPriority(samplingFailed ? "risk" : recommendation.workType), policySnapshot: { predecessorId: recommendation.id }, executorSystem: input.actor.kind === "system" ? input.actor.system : null }).onConflictDoNothing();
  await disableStaleKnowledgeSearchProjection(transaction, card.id, updated.contentVersion);
  await enqueueKnowledgeIndexWork(transaction, { cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, reason: "lifecycle_transition", executorSystem: input.actor.kind === "system" ? input.actor.system : undefined });
  await recordAuditEvent({ actor: input.actor, operation: "update", targetType: "knowledge_lifecycle", targetId: card.id, afterSummary: `Operator resolution: recommendationId=${recommendation.id}; resolution=${trigger.resolution}.` }, transaction);
  return { status: "resolved", cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision };
}

async function transitionDraftPublish(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "draft_publish" }>;
  const [card] = await transaction.select().from(knowledgeCards).where(and(eq(knowledgeCards.id, trigger.cardId), eq(knowledgeCards.lifecycleState, "draft"))).limit(1).for("update");
  if (!card) return { status: "stale" };
  const [support] = await transaction.select({ id: knowledgeCardEvidence.id }).from(knowledgeCardEvidence).innerJoin(sources, eq(sources.id, knowledgeCardEvidence.sourceId)).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId)).where(and(eq(knowledgeCardEvidence.knowledgeCardId, card.id), eq(knowledgeCardEvidence.state, "active"), eq(sources.eligibility, "eligible"), eq(sources.currentCaptureVersionId, knowledgeCardEvidence.captureVersionId), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
  if (!support) return { status: "invalid", reason: "ineligible_support" };
  const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (!updated) return { status: "stale" };
  await lifecycleEffects(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, "draft_publish", "Published draft card.");
  return { status: "resolved", cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision };
}

async function transitionOpenWork(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "open_work" }>;
  const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, trigger.cardId)).limit(1).for("update");
  if (!card) return { status: "invalid", reason: "target_not_found" };
  if (input.fences.contentVersion !== card.contentVersion || input.fences.evidenceSetRevision !== card.evidenceSetRevision) return { status: "stale" };
  await transaction.insert(knowledgeRecommendations).values({ knowledgeCardId: card.id, contentVersion: card.contentVersion, evidenceSetRevision: card.evidenceSetRevision, workType: trigger.workType, priority: workPriority(trigger.workType), policyId: trigger.policyId ?? null, policySnapshot: trigger.policySnapshot ?? {}, executorSystem: input.actor.kind === "system" ? input.actor.system : null }).onConflictDoNothing();
  await recordAuditEvent({ actor: input.actor, operation: "update", targetType: "knowledge_lifecycle", targetId: card.id, afterSummary: `Opened ${trigger.workType} work at the current fence.` }, transaction);
  return { status: "resolved", cardId: card.id, contentVersion: card.contentVersion, evidenceSetRevision: card.evidenceSetRevision };
}

async function transitionContentRefresh(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "content_refresh" }>;
  const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, trigger.cardId)).limit(1).for("update");
  if (!card) return { status: "invalid", reason: "target_not_found" };
  const [updated] = await transaction.update(knowledgeCards).set({ contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (!updated) return { status: "stale" };
  await lifecycleEffects(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, trigger.reason, "Refreshed card content after source metadata changed.");
  return { status: "resolved", cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision };
}

async function transitionSupportLoss(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "support_loss" }>;
  const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, trigger.cardId)).limit(1).for("update");
  if (!card) return { status: "invalid", reason: "target_not_found" };
  const [support] = await transaction.select({ id: knowledgeCardEvidence.id }).from(knowledgeCardEvidence).innerJoin(sources, eq(sources.id, knowledgeCardEvidence.sourceId)).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId)).where(and(eq(knowledgeCardEvidence.knowledgeCardId, card.id), eq(knowledgeCardEvidence.state, "active"), eq(sources.eligibility, "eligible"), eq(sources.currentCaptureVersionId, knowledgeCardEvidence.captureVersionId), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
  if (support || card.lifecycleState === "suppressed" && card.verificationRequirement === "failed") return { status: "resolved", cardId: card.id, contentVersion: card.contentVersion, evidenceSetRevision: card.evidenceSetRevision };
  const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: "suppressed", verificationRequirement: "failed", contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (!updated) return { status: "stale" };
  await transaction.insert(knowledgeRecommendations).values({ knowledgeCardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, workType: "risk", priority: workPriority("risk"), policySnapshot: { reason: trigger.reason }, executorSystem: input.actor.kind === "system" ? input.actor.system : null }).onConflictDoNothing();
  await lifecycleEffects(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, trigger.reason, "Suppressed card after all eligible support was withdrawn.");
  return { status: "resolved", cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision };
}

async function transitionArchiveRestore(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput): Promise<TransitionKnowledgeCardResult> {
  const trigger = input.trigger as Extract<KnowledgeLifecycleTrigger, { kind: "archive" | "restore" }>;
  const [restoreWork] = trigger.kind === "restore" ? await transaction.select().from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.id, trigger.recommendationId), eq(knowledgeRecommendations.status, "open"))).limit(1).for("update") : [null];
  if (trigger.kind === "restore" && (!restoreWork || input.fences.recommendationId !== restoreWork.id || input.fences.contentVersion !== restoreWork.contentVersion || input.fences.evidenceSetRevision !== restoreWork.evidenceSetRevision)) return { status: "stale" };
  if (restoreWork?.workType === "sampling") return { status: "invalid", reason: "invalid_restore_work" };
  const cardId = trigger.kind === "restore" ? restoreWork!.knowledgeCardId : trigger.cardId;
  const [card] = await transaction.select().from(knowledgeCards).where(eq(knowledgeCards.id, cardId)).limit(1).for("update");
  if (!card) return { status: "invalid", reason: "target_not_found" };
  if (trigger.kind === "restore" && (card.id !== restoreWork!.knowledgeCardId || card.contentVersion !== restoreWork!.contentVersion || card.evidenceSetRevision !== restoreWork!.evidenceSetRevision || card.lifecycleState !== "suppressed")) return { status: "stale" };
  if (trigger.kind === "restore") {
    const [support] = await transaction.select({ id: knowledgeCardEvidence.id }).from(knowledgeCardEvidence).innerJoin(sources, eq(sources.id, knowledgeCardEvidence.sourceId)).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId)).where(and(eq(knowledgeCardEvidence.knowledgeCardId, card.id), eq(knowledgeCardEvidence.state, "active"), eq(sources.eligibility, "eligible"), eq(sources.currentCaptureVersionId, knowledgeCardEvidence.captureVersionId), isNull(sourceCaptureVersions.payloadDeletedAt))).limit(1);
    if (!support) return { status: "invalid", reason: "ineligible_support" };
  }
  const [updated] = await transaction.update(knowledgeCards).set({ lifecycleState: trigger.kind === "archive" ? "archived" : "pending_operator", verificationRequirement: trigger.kind === "archive" ? card.verificationRequirement : "operator_required", contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: new Date() }).where(and(eq(knowledgeCards.id, card.id), eq(knowledgeCards.contentVersion, card.contentVersion), eq(knowledgeCards.evidenceSetRevision, card.evidenceSetRevision))).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
  if (!updated) return { status: "stale" };
  if (trigger.kind === "archive") await transaction.update(knowledgeRecommendations).set({ status: "superseded", resolution: "edited_and_requeued", resolvedAt: new Date(), updatedAt: new Date() }).where(and(eq(knowledgeRecommendations.knowledgeCardId, card.id), eq(knowledgeRecommendations.status, "open")));
  else await transaction.update(knowledgeRecommendations).set({ status: "superseded", resolution: "edited_and_requeued", resolvedAt: new Date(), updatedAt: new Date() }).where(eq(knowledgeRecommendations.id, restoreWork!.id));
  if (trigger.kind === "restore") await transaction.insert(knowledgeRecommendations).values({ knowledgeCardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, workType: "verification", priority: workPriority("verification"), policySnapshot: {} }).onConflictDoNothing();
  await lifecycleEffects(transaction, input, card.id, updated.contentVersion, updated.evidenceSetRevision, trigger.kind, `${trigger.kind} card.`);
  return { status: "resolved", cardId: card.id, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision };
}

async function lifecycleEffects(transaction: LifecycleTransaction, input: TransitionKnowledgeCardInput, cardId: string, contentVersion: number, evidenceSetRevision: number, reason: string, summary: string) {
  await disableStaleKnowledgeSearchProjection(transaction, cardId, contentVersion);
  await enqueueKnowledgeIndexWork(transaction, { cardId, contentVersion, evidenceSetRevision, reason: "lifecycle_transition", executorSystem: input.actor.kind === "system" ? input.actor.system : undefined });
  await recordAuditEvent({ actor: input.actor, operation: "update", targetType: "knowledge_lifecycle", targetId: cardId, afterSummary: `${summary} reason=${reason}.` }, transaction);
}

function isValidRelation(trigger: Extract<KnowledgeLifecycleTrigger, { kind: "candidate_relation" }>, expectedShortlist: string[]) {
  const { relation } = trigger;
  if (!relation.rationale.trim() || relation.rationale.length > 1_000) return false;
  if (relation.kind === "create") return true;
  if (trigger.disposition !== "needs_operator" && (relation.kind === "conflict" || relation.kind === "ambiguous")) return false;
  if (relation.kind === "conflict" && trigger.outcomeReasonCode !== "conflict" || relation.kind === "ambiguous" && trigger.outcomeReasonCode !== "relation_ambiguous") return false;
  if (relation.kind === "attach" && trigger.outcomeReasonCode === "conflict") return false;
  const supplied = [...relation.shortlistCardIds];
  if (supplied.length !== expectedShortlist.length || supplied.some((id, index) => id !== expectedShortlist[index])) return false;
  return relation.kind === "ambiguous" || expectedShortlist.includes(relation.targetCardId);
}

function resolutionMatchesWorkType(workType: string, resolution: string) {
  if (resolution === "sampling_passed" || resolution === "sampling_failed") return workType === "sampling";
  if (resolution === "relation_resolved") return workType === "relation";
  return workType !== "sampling";
}

function workPriority(workType: "verification" | "relation" | "risk" | "missing_context" | "sampling") { return ({ verification: 1, relation: 2, risk: 3, missing_context: 4, sampling: 5 })[workType]; }
