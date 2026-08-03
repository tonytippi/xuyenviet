import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { listOwnedConversationSummaries, resolvePlanningAnnotationCapabilities, sanitizeStoredPlanningAnnotations, type OwnedConversationSummary } from "@xuyenviet/domain";

import { getDb } from "@/db/client";
import { answerUsefulnessFeedback, assistantResponseProvenance, conversations, messageImageAttachments, messages, tripChangeProposals } from "@/db/schema";
import { formatAssistantMessageProvenance } from "@/features/retrieval/provenance";
import { getAuthenticatedSession } from "@/server/auth";

export type { OwnedConversationSummary } from "@xuyenviet/domain";

export async function getOwnedConversation(conversationId: string, establishedSession?: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSession>>>) {
  const session = establishedSession ?? await getAuthenticatedSession();

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
      availability: assistantResponseProvenance.availability,
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
  const messagesWithAnnotations = await Promise.all(conversationMessages.map(async (message) => {
    const provenance = message.role === "assistant" ? provenanceByMessageId.get(message.id) ?? [] : [];
    const storedAnnotations = message.role === "assistant" ? sanitizeStoredPlanningAnnotations({ answerText: message.content, annotations: message.answerAnnotations, provenance }) : [];
    const annotations = conversation.tripProjectId
      ? await resolveAnnotationCapabilities({ conversationId: conversation.id, tripProjectId: conversation.tripProjectId, userId: session.userId, assistantMessageId: message.id, annotations: storedAnnotations })
      : storedAnnotations;
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

/** API cutover selection read; Story 11.4 actions retain the full read above. */
export async function getOwnedConversationShell(conversationId: string): Promise<Awaited<ReturnType<typeof getOwnedConversation>>> {
  const session = await getAuthenticatedSession();
  if (!session) return null;
  const [conversation] = await getDb().select({ id: conversations.id, userId: conversations.userId, tripProjectId: conversations.tripProjectId, createdAt: conversations.createdAt, updatedAt: conversations.updatedAt }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, session.userId))).limit(1);
  if (!conversation) return null;
  // The API detail owns planning enrichment. The shell retains persisted prose so
  // a failed optional detail request cannot blank a completed assistant answer.
  const conversationMessages = await getDb().select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt }).from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, session.userId))).orderBy(asc(messages.createdAt), asc(messages.id));
  const attachments = await getDb().select({ id: messageImageAttachments.id, messageId: messageImageAttachments.messageId, originalFileName: messageImageAttachments.originalFileName, mimeType: messageImageAttachments.mimeType, byteSize: messageImageAttachments.byteSize }).from(messageImageAttachments).where(and(eq(messageImageAttachments.conversationId, conversation.id), eq(messageImageAttachments.userId, session.userId))).orderBy(asc(messageImageAttachments.createdAt), asc(messageImageAttachments.id));
  const attachmentsByMessageId = new Map<string, typeof attachments>();
  for (const attachment of attachments) attachmentsByMessageId.set(attachment.messageId, [...(attachmentsByMessageId.get(attachment.messageId) ?? []), attachment]);
  const feedbackRows = await getDb().select({ assistantMessageId: answerUsefulnessFeedback.assistantMessageId, rating: answerUsefulnessFeedback.rating, comment: answerUsefulnessFeedback.comment, updatedAt: answerUsefulnessFeedback.updatedAt }).from(answerUsefulnessFeedback).where(and(eq(answerUsefulnessFeedback.conversationId, conversation.id), eq(answerUsefulnessFeedback.userId, session.userId)));
  const feedbackByMessageId = new Map(feedbackRows.map((row) => [row.assistantMessageId, { rating: row.rating, comment: row.comment, updatedAt: row.updatedAt }]));
  return {
    ...conversation,
    messages: conversationMessages.map((message) => ({ ...message, imageAttachments: attachmentsByMessageId.get(message.id) ?? [], provenance: [], annotations: [], feedback: message.role === "assistant" ? feedbackByMessageId.get(message.id) ?? null : null })),
  } as unknown as Awaited<ReturnType<typeof getOwnedConversation>>;
}

async function resolveAnnotationCapabilities(input: { conversationId: string; tripProjectId: string; userId: string; assistantMessageId: string; annotations: ReturnType<typeof sanitizeStoredPlanningAnnotations> }) {
  return resolvePlanningAnnotationCapabilities({
    annotations: input.annotations,
    hasCurrentPendingProposal: async () => {
      const proposals = await getDb().select({ id: tripChangeProposals.id, expiresAt: tripChangeProposals.expiresAt })
        .from(tripChangeProposals)
        .where(and(eq(tripChangeProposals.tripProjectId, input.tripProjectId), eq(tripChangeProposals.userId, input.userId), eq(tripChangeProposals.status, "pending"), eq(tripChangeProposals.sourceAssistantMessageId, input.assistantMessageId)));
      return proposals.length === 1 && (!proposals[0].expiresAt || proposals[0].expiresAt.getTime() > Date.now());
    },
  });
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
