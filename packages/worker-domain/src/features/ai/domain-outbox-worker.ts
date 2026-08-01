import { and, eq } from "drizzle-orm";

import { getDb } from "@xuyenviet/database";
import { aiAskCommands, assistantResponseProvenance, conversations, domainOutboxEffects, messages, tripProjects } from "@xuyenviet/database";
import { buildValidatedAnswerAnnotationsResult, sanitizeStoredAnswerAnnotations, tripChangeProposalActionAnnotationIds, tripChangeProposalActionAnnotationIdSet } from "./answer-annotations";
import { claimDueDomainOutboxEvents, completeDomainOutboxClaimInTransaction, failDomainOutboxClaimInTransaction, failDomainOutboxEvent, finalizeDomainOutboxClaimInTransaction, hasActiveDomainOutboxClaim, parseAiAskOutboxEnvelope, type AiAskOutboxEnvelope, type DomainOutboxClaim } from "./domain-outbox";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel } from "./models";
import { writeAiUsageEvent } from "../audit/usage";
import { writeTripChangeProposalDraftUsageInTransaction, draftTripChangeProposal } from "./trip-proposal-draft";
import { extractChatTripContextForOutbox } from "../chat-trips/context-extraction";
import { persistAiTripChangeProposalDraftInTransaction } from "../chat-trips/trip-change-proposals";
import { formatAssistantMessageProvenance } from "../retrieval/provenance";
import { aiAskInitialAnswerPromptVersion, aiAskInitialAnswerPurpose } from "./prompts";
import type { WorkerPollObservation } from "@xuyenviet/contracts";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;
type DeliveryOutcome = "completed" | "fenced_out" | "invalid" | { kind: "retryable"; code: string } | "retry_scheduled" | "terminal_failure";

let testDependencies: { afterAnnotationProviderResponse?: () => Promise<void> | void } | undefined;

export function setDomainOutboxWorkerTestDependencies(dependencies: typeof testDependencies) {
  testDependencies = dependencies;
}

export type DomainOutboxWorkerResult = { kind: "processed"; count: number } | { kind: "no_work" } | { kind: "error"; count: number };

export function findAvailableActionMarkerRange(answerText: string, annotations: ReturnType<typeof sanitizeStoredAnswerAnnotations>) {
  for (let start = 0; start < answerText.length;) {
    const codePoint = answerText.codePointAt(start);
    const end = start + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
    if (!annotations.some((annotation) => start < annotation.end && end > annotation.start)) return { start, end };
    start = end;
  }
  return null;
}

export function appendTripChangeProposalActionAnnotation(input: {
  answerText: string;
  annotations: ReturnType<typeof sanitizeStoredAnswerAnnotations>;
}) {
  // Provider/persisted records never own feature marker IDs. Pick the pair that
  // evicts the fewest descriptors, then the earliest code-point ranges.
  const descriptors = input.annotations.filter((annotation) => !tripChangeProposalActionAnnotationIdSet.has(annotation.id));
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < input.answerText.length;) {
    const codePoint = input.answerText.codePointAt(start);
    const end = start + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
    ranges.push({ start, end });
    start = end;
  }
  let selected: { ranges: Array<{ start: number; end: number }>; evictions: Set<number> } | null = null;
  for (let first = 0; first < ranges.length; first += 1) {
    for (let second = first + 1; second < ranges.length; second += 1) {
      const markers = [ranges[first], ranges[second]];
      const evictions = new Set(descriptors.flatMap((annotation, index) => markers.some((marker) => marker.start < annotation.end && marker.end > annotation.start) ? [index] : []));
      if (!selected || evictions.size < selected.evictions.size) selected = { ranges: markers, evictions };
    }
  }
  if (!selected) return descriptors.slice(0, 18);
  const retained = descriptors.filter((_, index) => !selected.evictions.has(index)).slice(0, 18);
  const actions = selected.ranges.map((marker, index) => {
    const text = input.answerText.slice(marker.start, marker.end);
    const command = index === 0 ? "trip_change_proposal.apply" as const : "trip_change_proposal.dismiss" as const;
    return {
      id: tripChangeProposalActionAnnotationIds[index], start: marker.start, end: marker.end, text, type: "action" as const,
      detail: { type: "action" as const, label: text, action: { command, label: text, arguments: {}, anchor: "trip-change-proposal-action.v1" as const } },
    };
  });
  return [...retained, ...actions].sort((left, right) => left.start - right.start || left.end - right.end);
}

// This is deliberately a bounded library seam. Deployment and scheduling remain
// separate operational work; callers may invoke one batch for local/test use.
export async function processAiAskDomainOutboxBatch(input: { workerId: string; batchSize?: number; leaseMs?: number; onObservation?: (observation: WorkerPollObservation) => void | Promise<void> }): Promise<DomainOutboxWorkerResult> {
  const claimTerminalFailures: Array<{ id: string; attemptCount: number; reclaimedLease: boolean }> = [];
  const claims = await claimDueDomainOutboxEvents({ ...input, onTerminalFailure(events) { claimTerminalFailures.push(...events); } });
  if (claims.length === 0) {
    if (claimTerminalFailures.length) {
      for (const terminal of claimTerminalFailures) { try { await input.onObservation?.({ capability: "ai_ask.outbox", resultCode: "failure", durableId: terminal.id, retryCount: terminal.attemptCount, leaseRecovery: terminal.reclaimedLease ? "recovered" : "none", ...(terminal.reclaimedLease ? { leaseRecoveryCount: 1 } : {}) }); } catch {} }
      return { kind: "processed", count: claimTerminalFailures.length };
    }
    try { await input.onObservation?.({ capability: "ai_ask.outbox", resultCode: "no_work", leaseRecovery: "none" }); } catch {}
    return { kind: "no_work" };
  }
  const dispositions: WorkerPollObservation[] = claimTerminalFailures.map((event) => ({ capability: "ai_ask.outbox", resultCode: "failure", durableId: event.id, retryCount: event.attemptCount, leaseRecovery: event.reclaimedLease ? "recovered" : "none", ...(event.reclaimedLease ? { leaseRecoveryCount: 1 } : {}) }));
  for (const claim of claims) {
    let resultCode: "success" | "retry" | "failure" = "success";
    try {
      const outcome = await deliverClaim(claim);
      if (outcome === "fenced_out") await completeFencedOutClaim(claim);
      if (outcome === "retry_scheduled") resultCode = "retry";
      if (outcome === "terminal_failure") resultCode = "failure";
      if (outcome === "invalid") {
        const persisted = await failDomainOutboxEvent({ ...claim, code: "invalid_envelope", retryable: false });
        if (persisted?.status === "failed") resultCode = "failure";
      }
      if (typeof outcome === "object") {
        const persisted = await failDomainOutboxEvent({ ...claim, code: outcome.code, retryable: true });
        if (persisted?.status === "pending") resultCode = "retry";
        if (persisted?.status === "failed") resultCode = "failure";
      }
    } catch {
      const persisted = await failDomainOutboxEvent({ ...claim, code: "consumer_failed", retryable: true });
      if (persisted?.status === "pending") resultCode = "retry";
      if (persisted?.status === "failed") resultCode = "failure";
    }
    dispositions.push(observationFor(claim, resultCode));
  }
  for (const observation of dispositions) { try { await input.onObservation?.(observation); } catch {} }
  return dispositions.some((observation) => observation.resultCode === "retry") ? { kind: "error", count: dispositions.length } : { kind: "processed", count: dispositions.length };
}

function observationFor(claim: DomainOutboxClaim, resultCode: "success" | "retry" | "failure"): WorkerPollObservation {
  return { capability: "ai_ask.outbox", resultCode, durableId: claim.id, retryCount: claim.attemptCount, jobLagMs: Math.max(0, claim.claimedAt.getTime() - claim.availableAt.getTime()), leaseRecovery: claim.reclaimedLease ? "recovered" : "none", ...(claim.reclaimedLease ? { leaseRecoveryCount: 1 } : {}) };
}

// Fencing is an expected terminal disposition, not an operational failure. The
// effect guard also makes a redelivered fenced claim harmless before its ack.
async function completeFencedOutClaim(claim: DomainOutboxClaim) {
  await getDb().transaction(async (transaction) => {
    await completeDomainOutboxClaimInTransaction(transaction, claim, async () => {
      await transaction.insert(domainOutboxEffects).values({ outboxEventId: claim.id, effectType: "fenced_out" }).onConflictDoNothing();
    });
  });
}

async function deliverClaim(claim: DomainOutboxClaim): Promise<DeliveryOutcome> {
  const envelope = parseAiAskOutboxEnvelope(claim.payload, claim.eventType);
  if (!envelope || claim.eventVersion !== 1 || !payloadMatchesAuthority(claim, envelope)) return "invalid";
  if (claim.eventType === "ai_ask.context_extraction.v1") return extractChatTripContextForOutbox({ claim: { ...claim, payload: envelope }, envelope });
  const state = await readFinalState(envelope);
  if (!state || !envelope.assistantMessageId || !envelope.userMessageId) return "fenced_out";
  if (claim.eventType === "ai_ask.answer_annotation.v1") return annotate(claim, envelope, state.content, state.provenance);
  return propose(claim, envelope, state.question);
}

function payloadMatchesAuthority(claim: DomainOutboxClaim, envelope: AiAskOutboxEnvelope) {
  return claim.aggregateType === "ai_ask_command" && claim.aggregateId === claim.originatingCommandId
    && envelope.commandId === claim.originatingCommandId && envelope.userId === claim.userId
    && envelope.conversationId === claim.conversationId && (envelope.tripProjectId ?? null) === claim.tripProjectId
    && (envelope.userMessageId ?? null) === claim.userMessageId && (envelope.assistantMessageId ?? null) === claim.assistantMessageId
    && envelope.conversationLifecycleVersion === claim.conversationLifecycleVersion
    && (envelope.tripProjectAggregateVersion ?? null) === claim.tripProjectAggregateVersion;
}

async function readFinalState(envelope: AiAskOutboxEnvelope) {
  return getDb().transaction((transaction) => loadFinalStateInTransaction(transaction, envelope));
}

// Lock resource aggregates in the global order. This short check is repeated
// after the provider call; no lock is held while external work is in flight.
async function loadFinalStateInTransaction(transaction: Transaction, envelope: AiAskOutboxEnvelope) {
  const [project] = envelope.tripProjectId
    ? await transaction.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, envelope.tripProjectId), eq(tripProjects.userId, envelope.userId))).limit(1).for("update")
    : [];
  const [conversation] = await transaction.select({ lifecycleVersion: conversations.lifecycleVersion, tripProjectId: conversations.tripProjectId }).from(conversations).where(and(eq(conversations.id, envelope.conversationId), eq(conversations.userId, envelope.userId))).limit(1).for("update");
  const [command] = await transaction.select({ status: aiAskCommands.status, conversationId: aiAskCommands.conversationId, tripProjectId: aiAskCommands.tripProjectId, userMessageId: aiAskCommands.userMessageId, assistantMessageId: aiAskCommands.assistantMessageId, conversationLifecycleVersion: aiAskCommands.conversationLifecycleVersion, tripProjectAggregateVersion: aiAskCommands.tripProjectAggregateVersion, normalizedQuestion: aiAskCommands.normalizedQuestion }).from(aiAskCommands).where(and(eq(aiAskCommands.id, envelope.commandId), eq(aiAskCommands.userId, envelope.userId))).limit(1).for("update");
  if (!command || !conversation || !project && envelope.tripProjectId || command.status !== "completed" || command.conversationId !== envelope.conversationId || command.tripProjectId !== (envelope.tripProjectId ?? null) || command.assistantMessageId !== envelope.assistantMessageId || command.userMessageId !== envelope.userMessageId || command.conversationLifecycleVersion !== envelope.conversationLifecycleVersion || command.tripProjectAggregateVersion !== (envelope.tripProjectAggregateVersion ?? null) || conversation.lifecycleVersion !== envelope.conversationLifecycleVersion || conversation.tripProjectId !== (envelope.tripProjectId ?? null) || project?.aggregateVersion !== envelope.tripProjectAggregateVersion) return null;
  // Withdrawal locks provenance before its owning message. Keep final delivery in
  // that same order so delayed annotation cannot deadlock with a withdrawal.
  const provenance = await transaction.select({ id: assistantResponseProvenance.id, sourceCategory: assistantResponseProvenance.sourceCategory, rank: assistantResponseProvenance.rank, retrievalScore: assistantResponseProvenance.retrievalScore, sourceType: assistantResponseProvenance.sourceType, verificationStatus: assistantResponseProvenance.verificationStatus, availability: assistantResponseProvenance.availability, usedInPrompt: assistantResponseProvenance.usedInPrompt, citedInAnswer: assistantResponseProvenance.citedInAnswer, sourceSnapshot: assistantResponseProvenance.sourceSnapshot }).from(assistantResponseProvenance).where(and(eq(assistantResponseProvenance.userId, envelope.userId), eq(assistantResponseProvenance.conversationId, envelope.conversationId), eq(assistantResponseProvenance.userMessageId, envelope.userMessageId!), eq(assistantResponseProvenance.assistantMessageId, envelope.assistantMessageId!))).for("update");
  const [assistant] = await transaction.select({ content: messages.content, answerAnnotations: messages.answerAnnotations }).from(messages).where(and(eq(messages.id, envelope.assistantMessageId!), eq(messages.userId, envelope.userId), eq(messages.conversationId, envelope.conversationId), eq(messages.role, "assistant"))).limit(1).for("update");
  if (!assistant) return null;
  return { ...assistant, question: command.normalizedQuestion, provenance };
}

async function annotate(claim: DomainOutboxClaim, envelope: AiAskOutboxEnvelope, answerText: string, provenance: Parameters<typeof formatAssistantMessageProvenance>[0]): Promise<DeliveryOutcome> {
  const model = await selectActiveAiGatewayModel({ purpose: "ai_ask_initial_answer", requiredCapabilities: { textInput: true } });
  const formatted = formatAssistantMessageProvenance(provenance);
  if (model && !await hasActiveDomainOutboxClaim(claim)) return "fenced_out";
  if (model && !await readFinalState(envelope)) return "fenced_out";
  const annotationResult = model ? await buildValidatedAnswerAnnotationsResult({ answerText, provenance: formatted, model: model.gatewayModelName }) : { kind: "annotations" as const, annotations: [] };
  if (annotationResult.kind === "provider_failed") return { kind: "retryable", code: "annotation_provider_failed" };
  await testDependencies?.afterAnnotationProviderResponse?.();
  return getDb().transaction(async (transaction) => {
    const current = await loadFinalStateInTransaction(transaction, envelope);
    if (!current || current.content !== answerText) return "fenced_out";
    // The provider result is stale by design. Format and sanitize under the final
    // locks so a withdrawal cannot recreate a source-backed descriptor.
    const currentProvenance = formatAssistantMessageProvenance(current.provenance);
    const existingForwardActions = sanitizeStoredAnswerAnnotations({ answerText, annotations: current.answerAnnotations, provenance: currentProvenance })
      .filter((annotation) => tripChangeProposalActionAnnotationIdSet.has(annotation.id) && annotation.type === "action" && annotation.detail.action);
    const providerAnnotations = annotationResult.annotations
      .filter((annotation) => !tripChangeProposalActionAnnotationIdSet.has(annotation.id))
      .filter((annotation) => !existingForwardActions.some((action) => annotation.start < action.end && annotation.end > action.start))
      // A forward action occupies one of the persisted annotation slots. Keep it
      // intact if annotation delivery runs after proposal action attachment.
      .slice(0, 18);
    const currentAnnotations = sanitizeStoredAnswerAnnotations({ answerText, annotations: [...existingForwardActions, ...providerAnnotations], provenance: currentProvenance });
    const completion = await completeDomainOutboxClaimInTransaction(transaction, claim, async () => {
      const [effect] = await transaction.insert(domainOutboxEffects).values({ outboxEventId: claim.id, effectType: "answer_annotation" }).onConflictDoNothing().returning({ id: domainOutboxEffects.id });
      if (effect) {
        await transaction.update(messages).set({ answerAnnotations: currentAnnotations }).where(and(eq(messages.id, envelope.assistantMessageId!), eq(messages.content, answerText)));
        if (annotationResult.usage) {
          await writeAiUsageEvent(transaction, {
            initiatedByUserId: envelope.userId,
            executorSystem: "system-ai-orchestration",
            tripProjectId: envelope.tripProjectId,
            conversationId: envelope.conversationId,
            userMessageId: envelope.userMessageId,
            assistantMessageId: envelope.assistantMessageId,
            purpose: aiAskInitialAnswerPurpose,
            provider: annotationResult.usage.provider,
            model: annotationResult.usage.model,
            aiGatewayModelId: model!.id,
            promptVersion: aiAskInitialAnswerPromptVersion,
            status: "success",
            latencyMs: annotationResult.usage.latencyMs,
            promptTokens: annotationResult.usage.promptTokens,
            completionTokens: annotationResult.usage.completionTokens,
            totalTokens: annotationResult.usage.totalTokens,
            cachedPromptTokens: annotationResult.usage.cachedPromptTokens,
            cacheWritePromptTokens: annotationResult.usage.cacheWritePromptTokens,
            pricingSnapshot: getAiGatewayPricingSnapshot(model!),
            providerRequestId: annotationResult.usage.providerRequestId,
          });
        }
      }
    });
    return completion.completed ? "completed" : "fenced_out";
  });
}

async function propose(claim: DomainOutboxClaim, envelope: AiAskOutboxEnvelope, question: string): Promise<DeliveryOutcome> {
  if (!envelope.tripProjectId) return "fenced_out";
  const owner = { userId: envelope.userId };
  const draft = await draftTripChangeProposal({
    owner,
    tripProjectId: envelope.tripProjectId,
    question,
    beforeProviderCall: async () => {
      if (!await hasActiveDomainOutboxClaim(claim)) return false;
      return getDb().transaction(async (transaction) => Boolean(await loadFinalStateInTransaction(transaction, envelope)));
    },
  });
  if (!draft.ok && draft.reason === "gateway_failed") {
    const released = await getDb().transaction(async (transaction) => {
      if (!await loadFinalStateInTransaction(transaction, envelope)) return null;
      // A later reclaim represents a new provider call. This guarded transaction
      // records this call's failure usage exactly once before releasing the claim.
      return failDomainOutboxClaimInTransaction(transaction, { ...claim, code: "proposal_gateway_failed", retryable: true }, async () => {
        await writeTripChangeProposalDraftUsageInTransaction(transaction, { owner, tripProjectId: envelope.tripProjectId!, draft });
      });
    });
    return persistedFailureOutcome(released);
  }
  if (!draft.ok && (draft.reason === "no_project" || draft.reason === "no_model")) return "fenced_out";
  if (!draft.ok && draft.reason === "parse_failed") {
    const terminalized = await getDb().transaction(async (transaction) => {
      if (!await loadFinalStateInTransaction(transaction, envelope)) return null;
      // The parsed response was billable even though it is unusable. The active
      // claim guard commits that usage before atomically terminalizing the event.
      return failDomainOutboxClaimInTransaction(transaction, { ...claim, code: "invalid_gateway_response", retryable: false }, async () => {
        await writeTripChangeProposalDraftUsageInTransaction(transaction, { owner, tripProjectId: envelope.tripProjectId!, draft });
      });
    });
    return persistedFailureOutcome(terminalized);
  }
  if (!draft.ok) return "invalid";
  return getDb().transaction(async (transaction) => {
    if (!await loadFinalStateInTransaction(transaction, envelope)) return "fenced_out";
    const completion = await finalizeDomainOutboxClaimInTransaction(transaction, claim, async () => {
      const [effect] = await transaction.insert(domainOutboxEffects).values({ outboxEventId: claim.id, effectType: "trip_proposal_draft" }).onConflictDoNothing().returning({ id: domainOutboxEffects.id });
      if (!effect) return { value: undefined };
      const saved = await persistAiTripChangeProposalDraftInTransaction(transaction, owner, { tripProjectId: envelope.tripProjectId!, expectedAggregateVersion: draft.expectedAggregateVersion, expectedItemVersions: draft.expectedItemVersions, operations: draft.operations, rationale: draft.rationale, alternatives: draft.alternatives, orderingPreconditions: draft.orderingPreconditions, expiresAt: draft.expiresAt ? new Date(draft.expiresAt) : null, sourceAssistantMessageId: envelope.assistantMessageId });
      if (saved.success) {
        const current = await loadFinalStateInTransaction(transaction, envelope);
        if (!current) return { value: undefined, terminalCode: "proposal_persistence_rejected" };
        const annotations = sanitizeStoredAnswerAnnotations({ answerText: current.content, annotations: current.answerAnnotations, provenance: formatAssistantMessageProvenance(current.provenance) });
        const next = appendTripChangeProposalActionAnnotation({ answerText: current.content, annotations });
        if (tripChangeProposalActionAnnotationIds.every((id) => next.some((annotation) => annotation.id === id))) {
          const stored = sanitizeStoredAnswerAnnotations({
            answerText: current.content,
            provenance: formatAssistantMessageProvenance(current.provenance),
            annotations: next,
          });
          await transaction.update(messages).set({ answerAnnotations: stored }).where(and(eq(messages.id, envelope.assistantMessageId!), eq(messages.content, current.content)));
        }
      }
      await writeTripChangeProposalDraftUsageInTransaction(transaction, { owner, tripProjectId: envelope.tripProjectId!, draft });
      return { value: undefined, terminalCode: saved.success ? undefined : saved.reason === "invalid" ? "invalid_gateway_response" : "proposal_persistence_rejected" };
    });
    return completion.completed ? completion.terminal ? "terminal_failure" : "completed" : "fenced_out";
  });
}

function persistedFailureOutcome(persisted: Awaited<ReturnType<typeof failDomainOutboxClaimInTransaction>>) {
  return persisted?.status === "pending" ? "retry_scheduled" as const : persisted?.status === "failed" ? "terminal_failure" as const : "fenced_out" as const;
}
