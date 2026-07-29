import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { listOwnedConversationSummaries, type OwnedConversationSummary } from "@xuyenviet/domain";

import { getDb } from "@/db/client";
import { aiUsageEvents, answerUsefulnessFeedback, assistantResponseProvenance, chatContext, conversations, messageImageAttachments, messages, tripProjects } from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
import { toUserAuditActor } from "@/features/audit/actors";
import { sanitizeStoredAnswerAnnotations } from "@/features/ai/answer-annotations";
import { formatAssistantMessageProvenance } from "@/features/retrieval/provenance";
import { getAuthenticatedSession } from "@/server/auth";
import { discardAiAskCommandsForDeletedConversations } from "@/features/ai/ai-ask-commands";

export type { OwnedConversationSummary } from "@xuyenviet/domain";

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
  const messagesWithAnnotations = conversationMessages.map((message) => {
    const provenance = message.role === "assistant" ? provenanceByMessageId.get(message.id) ?? [] : [];
    const storedAnnotations = message.role === "assistant" ? sanitizeStoredAnswerAnnotations({ answerText: message.content, annotations: message.answerAnnotations, provenance }) : [];
    return {
      ...message,
      imageAttachments: attachmentsByMessageId.get(message.id) ?? [],
      provenance,
      annotations: storedAnnotations,
      feedback: message.role === "assistant" ? feedbackByMessageId.get(message.id) ?? null : null,
    };
  });

  return {
    ...conversation,
    messages: messagesWithAnnotations,
  };
}

export async function listOwnedConversations(): Promise<OwnedConversationSummary[] | null> {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  return listOwnedConversationSummaries({
    async listOwnedConversationSummaryRows(userId, limit) {
      const selected = await getDb().select({ id: conversations.id, updatedAt: conversations.updatedAt }).from(conversations)
        .where(and(eq(conversations.userId, userId), sql`${conversations.tripProjectId} is null`))
        .orderBy(desc(conversations.updatedAt), desc(conversations.id))
        .limit(limit);
      if (selected.length === 0) return [];

      const firstMessages = await getDb().selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId,
        content: messages.content,
      }).from(messages)
        .where(and(inArray(messages.conversationId, selected.map((conversation) => conversation.id)), eq(messages.userId, userId), eq(messages.role, "user")))
        .orderBy(messages.conversationId, asc(messages.createdAt), asc(messages.id));
      const previews = new Map(firstMessages.map((message) => [message.conversationId, message.content]));
      return selected.map((conversation) => ({ ...conversation, messageContent: previews.get(conversation.id) ?? null }));
    },
  }, session.userId);
}

export async function deleteOwnedConversation(conversationId: string): Promise<DeleteOwnedConversationResult> {
  const session = await getAuthenticatedSession();

  if (!session) {
    return { success: false, reason: "unauthenticated" };
  }

  try {
    return await getDb().transaction(async (transaction) => {
      const [initial] = await transaction
        .select({ id: conversations.id, tripProjectId: conversations.tripProjectId })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, session.userId)))
        .limit(1);

      if (!initial) return { success: false, reason: "not_found" };

      if (initial.tripProjectId) {
        const [project] = await transaction.select({ id: tripProjects.id, primaryConversationId: tripProjects.primaryConversationId }).from(tripProjects).where(and(eq(tripProjects.id, initial.tripProjectId), eq(tripProjects.userId, session.userId))).limit(1).for("update");
        if (project?.primaryConversationId === initial.id) {
          const [replacement] = await transaction.select({ id: conversations.id, updatedAt: conversations.updatedAt }).from(conversations).where(and(eq(conversations.userId, session.userId), eq(conversations.tripProjectId, project.id), eq(conversations.id, initial.id))).limit(1).for("update");
          if (!replacement) return { success: false, reason: "not_found" };
          const [next] = await transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.userId, session.userId), eq(conversations.tripProjectId, project.id), sql`${conversations.id} <> ${initial.id}`)).orderBy(desc(conversations.updatedAt), desc(conversations.id)).limit(1);
          const replacementPrimary = next ?? await transaction.insert(conversations).values({ userId: session.userId, tripProjectId: project.id }).returning({ id: conversations.id });
          await transaction.update(conversations).set({ lifecycleVersion: sql`${conversations.lifecycleVersion} + 1`, updatedAt: new Date() }).where(eq(conversations.id, replacementPrimary.id));
          await transaction.update(tripProjects).set({ primaryConversationId: replacementPrimary.id, aggregateVersion: sql`${tripProjects.aggregateVersion} + 1`, updatedAt: new Date() }).where(eq(tripProjects.id, project.id));
        }
      }

      const [conversation] = await transaction
        .select({ id: conversations.id, tripProjectId: conversations.tripProjectId })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, session.userId)))
        .limit(1)
        .for("update");

      if (!conversation) {
        return { success: false, reason: "not_found" };
      }

      await discardAiAskCommandsForDeletedConversations(transaction, session.userId, [conversation.id]);
      await transaction.update(conversations).set({ lifecycleVersion: sql`${conversations.lifecycleVersion} + 1`, updatedAt: new Date() }).where(eq(conversations.id, conversation.id));

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
        actor: toUserAuditActor({ userId: session.userId, email: session.email }),
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
