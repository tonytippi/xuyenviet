import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { aiUsageEvents, chatContext, conversations, messageImageAttachments, messages } from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
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
    .select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt })
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

  return {
    ...conversation,
    messages: conversationMessages.map((message) => ({
      ...message,
      imageAttachments: attachmentsByMessageId.get(message.id) ?? [],
    })),
  };
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
