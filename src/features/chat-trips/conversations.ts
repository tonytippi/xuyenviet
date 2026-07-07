import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { conversations, messageImageAttachments, messages } from "@/db/schema";
import { getAuthenticatedSession } from "@/server/auth";

const newConversationPreview = "Hội thoại mới";
const previewMaxLength = 60;

export type OwnedConversationSummary = {
  id: string;
  updatedAt: Date;
  preview: string;
};

export async function getOwnedConversation(conversationId: string) {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  const [conversation] = await getDb()
    .select({ id: conversations.id, userId: conversations.userId, createdAt: conversations.createdAt, updatedAt: conversations.updatedAt })
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
    .where(eq(conversations.userId, session.userId))
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
