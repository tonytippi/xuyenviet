import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { aiUsageEvents, answerUsefulnessFeedback, assistantResponseProvenance, chatContext, conversations, messageImageAttachments, messages } from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
import { buildValidatedAnswerAnnotations, type AnswerAnnotation } from "@/features/ai/answer-annotations";
import { selectActiveAiGatewayModel } from "@/features/ai/models";
import { formatAssistantMessageProvenance } from "@/features/retrieval/provenance";
import { getAuthenticatedSession } from "@/server/auth";

const newConversationPreview = "Hội thoại mới";
const previewMaxLength = 60;

export type OwnedConversationSummary = {
  id: string;
  updatedAt: Date;
  preview: string;
};

export type DeleteOwnedConversationResult = {
  success: boolean;
  reason?: "unauthenticated" | "not_found" | "failed";
};

export async function getOwnedConversation(conversationId: string) {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  const [conversation] = await getDb()
    .select({ id: conversations.id, userId: conversations.userId, tripProjectId: conversations.tripProjectId, createdAt: conversations.createdAt, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, session.userId)))
    .limit(1);

  if (!conversation) {
    return null;
  }

  const conversationMessages = await getDb()
    .select({ id: messages.id, role: messages.role, content: messages.content, answerAnnotations: messages.answerAnnotations, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, session.userId)))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  const attachments = await getDb()
    .select({
      id: messageImageAttachments.id,
      messageId: messageImageAttachments.messageId,
      originalFileName: messageImageAttachments.originalFileName,
      mimeType: messageImageAttachments.mimeType,
      byteSize: messageImageAttachments.byteSize,
    })
    .from(messageImageAttachments)
    .where(and(eq(messageImageAttachments.conversationId, conversation.id), eq(messageImageAttachments.userId, session.userId)))
    .orderBy(asc(messageImageAttachments.createdAt), asc(messageImageAttachments.id));

  const attachmentsByMessageId = new Map<string, typeof attachments>();

  for (const attachment of attachments) {
    attachmentsByMessageId.set(attachment.messageId, [...(attachmentsByMessageId.get(attachment.messageId) ?? []), attachment]);
  }

  const provenanceRows = await getDb()
    .select({
      id: assistantResponseProvenance.id,
      assistantMessageId: assistantResponseProvenance.assistantMessageId,
      sourceCategory: assistantResponseProvenance.sourceCategory,
      rank: assistantResponseProvenance.rank,
      retrievalScore: assistantResponseProvenance.retrievalScore,
      sourceType: assistantResponseProvenance.sourceType,
      verificationStatus: assistantResponseProvenance.verificationStatus,
      usedInPrompt: assistantResponseProvenance.usedInPrompt,
      citedInAnswer: assistantResponseProvenance.citedInAnswer,
      sourceSnapshot: assistantResponseProvenance.sourceSnapshot,
    })
    .from(assistantResponseProvenance)
    .where(and(eq(assistantResponseProvenance.conversationId, conversation.id), eq(assistantResponseProvenance.userId, session.userId)))
    .orderBy(asc(assistantResponseProvenance.assistantMessageId), asc(assistantResponseProvenance.rank));

  const provenanceByMessageId = new Map<string, ReturnType<typeof formatAssistantMessageProvenance>>();

  for (const row of provenanceRows) {
    const { assistantMessageId, ...provenanceRow } = row;
    provenanceByMessageId.set(assistantMessageId, [...(provenanceByMessageId.get(assistantMessageId) ?? []), ...formatAssistantMessageProvenance([provenanceRow])]);
  }

  const feedbackRows = await getDb()
    .select({
      assistantMessageId: answerUsefulnessFeedback.assistantMessageId,
      rating: answerUsefulnessFeedback.rating,
      comment: answerUsefulnessFeedback.comment,
      updatedAt: answerUsefulnessFeedback.updatedAt,
    })
    .from(answerUsefulnessFeedback)
    .where(and(eq(answerUsefulnessFeedback.conversationId, conversation.id), eq(answerUsefulnessFeedback.userId, session.userId)))
    .orderBy(asc(answerUsefulnessFeedback.assistantMessageId));

  const feedbackByMessageId = new Map(feedbackRows.map((row) => [row.assistantMessageId, { rating: row.rating, comment: row.comment, updatedAt: row.updatedAt }]));
  const shouldBackfillAnnotations = conversationMessages.some((message) => message.role === "assistant" && message.answerAnnotations.length === 0 && (provenanceByMessageId.get(message.id)?.length ?? 0) > 0);
  const backfillModel = shouldBackfillAnnotations ? await selectActiveAiGatewayModel({ purpose: "ai_ask_initial_answer", requiredCapabilities: { textInput: true } }) : null;
  const messagesWithAnnotations = await Promise.all(conversationMessages.map(async (message) => {
    const provenance = message.role === "assistant" ? provenanceByMessageId.get(message.id) ?? [] : [];
    const storedAnnotations = message.role === "assistant" ? sanitizeStoredAnswerAnnotations(message.answerAnnotations, message.content) : [];
    let annotations = storedAnnotations;

    if (message.role === "assistant" && annotations.length === 0 && provenance.length > 0 && backfillModel) {
      annotations = await buildValidatedAnswerAnnotations({ answerText: message.content, provenance, model: backfillModel.gatewayModelName });

      if (annotations.length > 0) {
        try {
          await getDb().update(messages).set({ answerAnnotations: annotations }).where(eq(messages.id, message.id));
        } catch (error) {
          console.error("Failed to backfill answer annotations.", { assistantMessageId: message.id, error });
        }
      }
    }

    return {
      ...message,
      imageAttachments: attachmentsByMessageId.get(message.id) ?? [],
      provenance,
      annotations,
      feedback: message.role === "assistant" ? feedbackByMessageId.get(message.id) ?? null : null,
    };
  }));

  return {
    ...conversation,
    messages: messagesWithAnnotations,
  };
}

function sanitizeStoredAnswerAnnotations(value: unknown, content: string): AnswerAnnotation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const annotations: AnswerAnnotation[] = [];

  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.start !== "number" || typeof item.end !== "number" || typeof item.text !== "string" || typeof item.type !== "string" || !isRecord(item.detail)) {
      continue;
    }

    if (!Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < 0 || item.end <= item.start || item.end > content.length || content.slice(item.start, item.end) !== item.text) {
      continue;
    }

    annotations.push(item as AnswerAnnotation);
  }

  return annotations;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function listOwnedConversations(): Promise<OwnedConversationSummary[] | null> {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  const rows = await getDb()
    .select({
      id: conversations.id,
      updatedAt: conversations.updatedAt,
      messageContent: messages.content,
    })
    .from(conversations)
    .leftJoin(
      messages,
      and(
        eq(messages.conversationId, conversations.id),
        eq(messages.userId, session.userId),
        eq(messages.role, "user"),
      ),
    )
    .where(and(eq(conversations.userId, session.userId), isNull(conversations.tripProjectId)))
    .orderBy(desc(conversations.updatedAt), desc(conversations.id), asc(messages.createdAt), asc(messages.id));

  const seenConversationIds = new Set<string>();
  const summaries: OwnedConversationSummary[] = [];

  for (const row of rows) {
    if (seenConversationIds.has(row.id)) {
      continue;
    }

    seenConversationIds.add(row.id);
    summaries.push({ id: row.id, updatedAt: row.updatedAt, preview: formatPreview(row.messageContent) });
  }

  return summaries;
}

export async function deleteOwnedConversation(conversationId: string): Promise<DeleteOwnedConversationResult> {
  const session = await getAuthenticatedSession();

  if (!session) {
    return { success: false, reason: "unauthenticated" };
  }

  try {
    return await getDb().transaction(async (transaction) => {
      const [conversation] = await transaction
        .select({ id: conversations.id, tripProjectId: conversations.tripProjectId })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, session.userId)))
        .limit(1)
        .for("update");

      if (!conversation) {
        return { success: false, reason: "not_found" };
      }

      const conversationMessages = await transaction.select({ id: messages.id }).from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, session.userId)));
      const attachments = await transaction.select({ id: messageImageAttachments.id }).from(messageImageAttachments).where(and(eq(messageImageAttachments.conversationId, conversation.id), eq(messageImageAttachments.userId, session.userId)));
      const contextRows = await transaction.select({ id: chatContext.id }).from(chatContext).where(and(eq(chatContext.conversationId, conversation.id), eq(chatContext.userId, session.userId)));
      const usageEvents = await transaction.select({ id: aiUsageEvents.id }).from(aiUsageEvents).where(eq(aiUsageEvents.conversationId, conversation.id));

      const deletedRows = await transaction
        .delete(conversations)
        .where(and(eq(conversations.id, conversation.id), eq(conversations.userId, session.userId)))
        .returning({ id: conversations.id });

      if (deletedRows.length !== 1) {
        return { success: false, reason: "not_found" };
      }

      await recordAuditEvent({
        actor: session,
        operation: "delete",
        targetType: "conversation",
        targetId: conversation.id,
        beforeSummary: JSON.stringify({
          conversationId: conversation.id,
          tripProjectId: conversation.tripProjectId,
          messageCount: conversationMessages.length,
          imageAttachmentCount: attachments.length,
          chatContextCount: contextRows.length,
          aiUsageEventCount: usageEvents.length,
        }),
        afterSummary: JSON.stringify({ deleted: true }),
      }, transaction);

      return { success: true };
    });
  } catch (error) {
    console.error("Failed to delete owned conversation.", { conversationId, userId: session.userId, error });
    return { success: false, reason: "failed" };
  }
}

function formatPreview(content: string | null): string {
  if (!content) {
    return newConversationPreview;
  }

  const trimmed = content.trim();

  if (trimmed.length <= previewMaxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, previewMaxLength).trimEnd()}…`;
}
