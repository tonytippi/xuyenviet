import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { aiAskCommands, assistantResponseProvenance, conversations, domainOutboxEffects, messages, tripProjects } from "@/db/schema";
import { buildValidatedAnswerAnnotationsResult, sanitizeStoredAnswerAnnotations } from "@/features/ai/answer-annotations";
import { claimDueDomainOutboxEvents, completeDomainOutboxClaimInTransaction, failDomainOutboxClaimInTransaction, failDomainOutboxEvent, finalizeDomainOutboxClaimInTransaction, hasActiveDomainOutboxClaim, parseAiAskOutboxEnvelope, type AiAskOutboxEnvelope, type DomainOutboxClaim } from "@/features/ai/domain-outbox";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel } from "@/features/ai/models";
import { writeAiUsageEvent } from "@/features/audit/usage";
import { writeTripChangeProposalDraftUsageInTransaction, draftTripChangeProposal } from "@/features/ai/trip-proposal-draft";
import { extractChatTripContextForOutbox } from "@/features/chat-trips/context-extraction";
import { persistAiTripChangeProposalDraftInTransaction } from "@/features/chat-trips/trip-change-proposals";
import { formatAssistantMessageProvenance } from "@/features/retrieval/provenance";
import { aiAskInitialAnswerPromptVersion, aiAskInitialAnswerPurpose } from "@/features/ai/prompts";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;
type DeliveryOutcome = "completed" | "fenced_out" | "invalid" | { kind: "retryable"; code: string } | "retry_scheduled";

export type DomainOutboxWorkerResult = { kind: "processed"; count: number } | { kind: "no_work" } | { kind: "error"; count: number };

// This is deliberately a bounded library seam. Deployment and scheduling remain
// separate operational work; callers may invoke one batch for local/test use.
export async function processAiAskDomainOutboxBatch(input: { workerId: string; batchSize?: number; leaseMs?: number }): Promise<DomainOutboxWorkerResult> {
  const claims = await claimDueDomainOutboxEvents(input);
  if (claims.length === 0) return { kind: "no_work" };
  let failures = 0;
  for (const claim of claims) {
    try {
      const outcome = await deliverClaim(claim);
      if (outcome === "fenced_out") await completeFencedOutClaim(claim);
      if (outcome === "invalid") await failDomainOutboxEvent({ ...claim, code: "invalid_envelope", retryable: false });
      if (typeof outcome === "object") {
        failures += 1;
        await failDomainOutboxEvent({ ...claim, code: outcome.code, retryable: true });
      }
    } catch {
      failures += 1;
      await failDomainOutboxEvent({ ...claim, code: "consumer_failed", retryable: true });
    }
  }
  return failures ? { kind: "error", count: claims.length } : { kind: "processed", count: claims.length };
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
  const [assistant] = await transaction.select({ content: messages.content }).from(messages).where(and(eq(messages.id, envelope.assistantMessageId!), eq(messages.userId, envelope.userId), eq(messages.conversationId, envelope.conversationId), eq(messages.role, "assistant"))).limit(1).for("update");
  if (!assistant) return null;
  const provenance = await transaction.select({ id: assistantResponseProvenance.id, sourceCategory: assistantResponseProvenance.sourceCategory, rank: assistantResponseProvenance.rank, retrievalScore: assistantResponseProvenance.retrievalScore, sourceType: assistantResponseProvenance.sourceType, verificationStatus: assistantResponseProvenance.verificationStatus, usedInPrompt: assistantResponseProvenance.usedInPrompt, citedInAnswer: assistantResponseProvenance.citedInAnswer, sourceSnapshot: assistantResponseProvenance.sourceSnapshot }).from(assistantResponseProvenance).where(and(eq(assistantResponseProvenance.userId, envelope.userId), eq(assistantResponseProvenance.conversationId, envelope.conversationId), eq(assistantResponseProvenance.userMessageId, envelope.userMessageId!), eq(assistantResponseProvenance.assistantMessageId, envelope.assistantMessageId!))).for("update");
  return { ...assistant, question: command.normalizedQuestion, provenance };
}

async function annotate(claim: DomainOutboxClaim, envelope: AiAskOutboxEnvelope, answerText: string, provenance: Parameters<typeof formatAssistantMessageProvenance>[0]): Promise<DeliveryOutcome> {
  const model = await selectActiveAiGatewayModel({ purpose: "ai_ask_initial_answer", requiredCapabilities: { textInput: true } });
  const formatted = formatAssistantMessageProvenance(provenance);
  if (model && !await hasActiveDomainOutboxClaim(claim)) return "fenced_out";
  if (model && !await readFinalState(envelope)) return "fenced_out";
  const annotationResult = model ? await buildValidatedAnswerAnnotationsResult({ answerText, provenance: formatted, model: model.gatewayModelName }) : { kind: "annotations" as const, annotations: [] };
  if (annotationResult.kind === "provider_failed") return { kind: "retryable", code: "annotation_provider_failed" };
  const annotations = sanitizeStoredAnswerAnnotations({ answerText, annotations: annotationResult.annotations, provenance: formatted });
  return getDb().transaction(async (transaction) => {
    const current = await loadFinalStateInTransaction(transaction, envelope);
    if (!current || current.content !== answerText) return "fenced_out";
    const completion = await completeDomainOutboxClaimInTransaction(transaction, claim, async () => {
      const [effect] = await transaction.insert(domainOutboxEffects).values({ outboxEventId: claim.id, effectType: "answer_annotation" }).onConflictDoNothing().returning({ id: domainOutboxEffects.id });
      if (effect) {
        await transaction.update(messages).set({ answerAnnotations: annotations }).where(and(eq(messages.id, envelope.assistantMessageId!), eq(messages.content, answerText)));
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
  const session = { userId: envelope.userId, email: "outbox@system" };
  const draft = await draftTripChangeProposal({
    session,
    tripProjectId: envelope.tripProjectId,
    question,
    beforeProviderCall: async () => {
      if (!await hasActiveDomainOutboxClaim(claim)) return false;
      return getDb().transaction(async (transaction) => Boolean(await loadFinalStateInTransaction(transaction, envelope)));
    },
  });
  if (!draft.ok && draft.reason === "gateway_failed") {
    const released = await getDb().transaction(async (transaction) => {
      if (!await loadFinalStateInTransaction(transaction, envelope)) return false;
      // A later reclaim represents a new provider call. This guarded transaction
      // records this call's failure usage exactly once before releasing the claim.
      return Boolean(await failDomainOutboxClaimInTransaction(transaction, { ...claim, code: "proposal_gateway_failed", retryable: true }, async () => {
        await writeTripChangeProposalDraftUsageInTransaction(transaction, { session, tripProjectId: envelope.tripProjectId!, draft });
      }));
    });
    return released ? "retry_scheduled" : "fenced_out";
  }
  if (!draft.ok && (draft.reason === "no_project" || draft.reason === "no_model")) return "fenced_out";
  if (!draft.ok && draft.reason === "parse_failed") {
    const terminalized = await getDb().transaction(async (transaction) => {
      if (!await loadFinalStateInTransaction(transaction, envelope)) return false;
      // The parsed response was billable even though it is unusable. The active
      // claim guard commits that usage before atomically terminalizing the event.
      return Boolean(await failDomainOutboxClaimInTransaction(transaction, { ...claim, code: "invalid_gateway_response", retryable: false }, async () => {
        await writeTripChangeProposalDraftUsageInTransaction(transaction, { session, tripProjectId: envelope.tripProjectId!, draft });
      }));
    });
    return terminalized ? "retry_scheduled" : "fenced_out";
  }
  if (!draft.ok) return "invalid";
  return getDb().transaction(async (transaction) => {
    if (!await loadFinalStateInTransaction(transaction, envelope)) return "fenced_out";
    const completion = await finalizeDomainOutboxClaimInTransaction(transaction, claim, async () => {
      const [effect] = await transaction.insert(domainOutboxEffects).values({ outboxEventId: claim.id, effectType: "trip_proposal_draft" }).onConflictDoNothing().returning({ id: domainOutboxEffects.id });
      if (!effect) return { value: undefined };
      const saved = await persistAiTripChangeProposalDraftInTransaction(transaction, session, { tripProjectId: envelope.tripProjectId!, expectedAggregateVersion: draft.expectedAggregateVersion, expectedItemVersions: draft.expectedItemVersions, operations: draft.operations, rationale: draft.rationale, alternatives: draft.alternatives, orderingPreconditions: draft.orderingPreconditions, expiresAt: draft.expiresAt ? new Date(draft.expiresAt) : null, sourceAssistantMessageId: envelope.assistantMessageId });
      await writeTripChangeProposalDraftUsageInTransaction(transaction, { session, tripProjectId: envelope.tripProjectId!, draft });
      return { value: undefined, terminalCode: saved.success ? undefined : saved.reason === "invalid" ? "invalid_gateway_response" : "proposal_persistence_rejected" };
    });
    return completion.completed ? "completed" : "fenced_out";
  });
}
