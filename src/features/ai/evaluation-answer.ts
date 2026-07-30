import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { assistantResponseProvenance, assistantRetrievalDecisions, conversations, messages, tripAnswerContextSnapshots } from "@/db/schema";
import { ensureAiAskFreshnessWarning } from "@/features/ai/answer-freshness";
import { completeInitialAiAskAnswer, type AiGatewayExtractionResult } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel, type SelectedAiGatewayModel } from "@/features/ai/models";
import { aiAskInitialAnswerPromptVersion, aiAskInitialAnswerPurpose, buildAiAskMessages } from "@/features/ai/prompts";
import { persistAssistantAnswerProvenance } from "@/features/retrieval/provenance";
import { assembleContextPrioritySourceBundle, renderSourceBundlePromptSection } from "@/features/retrieval/source-bundle";
import { writeAiUsageEvent } from "@/features/audit/usage";

export type EvaluationAiAskAnswer = {
  answerText: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  retrievalDecisionId: string | null;
  provenanceId: string | null;
  provenance: Array<{ id: string; sourceCategory: string; usedInPrompt: boolean; sourceSnapshot: Record<string, unknown> }>;
  retrievalDecision: {
    selectedKnowledgeCardIds: string[];
    knowledgePolicySnapshot: Record<string, unknown> | null;
    webSearchTriggered: boolean;
    webSearchTriggerReasons: string[];
    warnings: string[];
  } | null;
  usageEventId: string | null;
  tripAnswerContextSnapshotId?: string | null;
  modelVersion: string;
};

export type GenerateEvaluationAiAskAnswerResult =
  | { ok: true; answer: EvaluationAiAskAnswer }
  | { ok: false; usageEventId: string | null; gatewayResult?: AiGatewayExtractionResult };

type EvaluationAiAskDb = ReturnType<typeof getDb>;

export async function generateEvaluationAiAskAnswer({
  db = getDb(),
  userId,
  question,
  model,
  knowledgeCardIds,
  abortSignal,
}: {
  db?: EvaluationAiAskDb;
  userId: string;
  question: string;
  model?: SelectedAiGatewayModel;
  knowledgeCardIds?: string[];
  abortSignal?: AbortSignal;
}): Promise<GenerateEvaluationAiAskAnswerResult> {
  const aiAskModel = model ?? await selectActiveAiGatewayModel({ purpose: aiAskInitialAnswerPurpose, requiredCapabilities: { textInput: true }, db });

  if (!aiAskModel) {
    return { ok: false, usageEventId: null };
  }

  const saved = await db.transaction(async (transaction) => {
    const [conversation] = await transaction.insert(conversations).values({ userId }).returning({ id: conversations.id });
    const [userMessage] = await transaction.insert(messages).values({ conversationId: conversation.id, userId, role: "user", content: question }).returning({ id: messages.id });

    return { conversationId: conversation.id, userMessageId: userMessage.id };
  });
  const sourceBundle = await assembleContextPrioritySourceBundle({
    userId,
    conversationId: saved.conversationId,
    question,
    userMessageId: saved.userMessageId,
    webSearchUsageContext: { userId, conversationId: saved.conversationId, userMessageId: saved.userMessageId },
    evaluationFixtureCardIds: knowledgeCardIds,
    abortSignal,
  });
  const renderedSourceBundle = renderSourceBundlePromptSection(sourceBundle);
  const contextSection = renderedSourceBundle.section;
  const gatewayResult = await completeInitialAiAskAnswer({ model: aiAskModel.gatewayModelName, messages: buildAiAskMessages({ question, history: [], contextSection }) });
  const pricingSnapshot = getAiGatewayPricingSnapshot(aiAskModel);

  if (!gatewayResult.ok) {
    const usageEventId = await writeAiUsageEvent(db, {
      initiatedByUserId: userId,
      executorSystem: "system-ai-orchestration",
      conversationId: saved.conversationId,
      userMessageId: saved.userMessageId,
      purpose: aiAskInitialAnswerPurpose,
      provider: gatewayResult.provider,
      model: gatewayResult.model,
      aiGatewayModelId: aiAskModel.id,
      promptVersion: aiAskInitialAnswerPromptVersion,
      status: "failure",
      latencyMs: gatewayResult.latencyMs,
      pricingSnapshot,
      errorCode: gatewayResult.errorCode,
    });

    return { ok: false, usageEventId, gatewayResult };
  }

  const assistantContent = ensureAiAskFreshnessWarning(gatewayResult.content, sourceBundle).content;

  return db.transaction(async (transaction) => {
    const [assistantMessage] = await transaction
      .insert(messages)
      .values({ conversationId: saved.conversationId, userId, role: "assistant", content: assistantContent })
      .returning({ id: messages.id });

    await transaction.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, saved.conversationId));

    const [snapshot] = await transaction.insert(tripAnswerContextSnapshots).values({
      userId,
      conversationId: saved.conversationId,
      assistantMessageId: assistantMessage.id,
      contextVersion: renderedSourceBundle.tripContext.version,
      aggregateVersion: renderedSourceBundle.tripContext.aggregateVersion,
      includedReferences: renderedSourceBundle.tripContext.included,
      excludedReferences: renderedSourceBundle.tripContext.excluded,
      conflicts: renderedSourceBundle.tripContext.conflicts,
      serialization: renderedSourceBundle.tripContext.serialization,
      promptDigest: renderedSourceBundle.tripContext.promptDigest,
    }).returning({ id: tripAnswerContextSnapshots.id });

    const provenance = await persistAssistantAnswerProvenance(transaction, {
      userId,
      conversationId: saved.conversationId,
      userMessageId: saved.userMessageId,
      assistantMessageId: assistantMessage.id,
      tripAnswerContextSnapshotId: snapshot.id,
      sourceBundle,
      promptUsage: renderedSourceBundle.promptUsage,
    });
    const [retrievalDecision] = await transaction
      .select({
        id: assistantRetrievalDecisions.id,
        selectedKnowledgeCardIds: assistantRetrievalDecisions.selectedKnowledgeCardIds,
        knowledgePolicySnapshot: assistantRetrievalDecisions.knowledgePolicySnapshot,
        webSearchTriggered: assistantRetrievalDecisions.webSearchTriggered,
        webSearchTriggerReasons: assistantRetrievalDecisions.webSearchTriggerReasons,
        warnings: assistantRetrievalDecisions.warnings,
      })
      .from(assistantRetrievalDecisions)
      .where(eq(assistantRetrievalDecisions.assistantMessageId, assistantMessage.id))
      .limit(1);
    const persistedProvenance = await transaction
      .select({
        id: assistantResponseProvenance.id,
        sourceCategory: assistantResponseProvenance.sourceCategory,
        usedInPrompt: assistantResponseProvenance.usedInPrompt,
        sourceSnapshot: assistantResponseProvenance.sourceSnapshot,
      })
      .from(assistantResponseProvenance)
      .where(eq(assistantResponseProvenance.assistantMessageId, assistantMessage.id));
    const usageEventId = await writeAiUsageEvent(transaction, {
      initiatedByUserId: userId,
      executorSystem: "system-ai-orchestration",
      conversationId: saved.conversationId,
      userMessageId: saved.userMessageId,
      assistantMessageId: assistantMessage.id,
      tripAnswerContextSnapshotId: snapshot.id,
      purpose: aiAskInitialAnswerPurpose,
      provider: gatewayResult.provider,
      model: gatewayResult.model,
      aiGatewayModelId: aiAskModel.id,
      promptVersion: aiAskInitialAnswerPromptVersion,
      status: "success",
      latencyMs: gatewayResult.latencyMs,
      promptTokens: gatewayResult.usage.promptTokens,
      completionTokens: gatewayResult.usage.completionTokens,
      totalTokens: gatewayResult.usage.totalTokens,
      cachedPromptTokens: gatewayResult.usage.cachedPromptTokens,
      cacheWritePromptTokens: gatewayResult.usage.cacheWritePromptTokens,
      pricingSnapshot,
    });

    return {
      ok: true,
      answer: {
        answerText: assistantContent,
        conversationId: saved.conversationId,
        userMessageId: saved.userMessageId,
        assistantMessageId: assistantMessage.id,
        retrievalDecisionId: retrievalDecision?.id ?? null,
        provenanceId: provenance[0]?.id ?? null,
        // Evaluation must use the bounded snapshots written with this answer, not mutable cards.
        provenance: persistedProvenance,
        retrievalDecision: retrievalDecision
          ? {
              selectedKnowledgeCardIds: retrievalDecision.selectedKnowledgeCardIds,
              knowledgePolicySnapshot: retrievalDecision.knowledgePolicySnapshot,
              webSearchTriggered: retrievalDecision.webSearchTriggered,
              webSearchTriggerReasons: retrievalDecision.webSearchTriggerReasons,
              warnings: retrievalDecision.warnings,
            }
          : null,
        usageEventId,
        tripAnswerContextSnapshotId: snapshot.id,
        modelVersion: aiAskModel.gatewayModelName,
      },
    };
  });
}
