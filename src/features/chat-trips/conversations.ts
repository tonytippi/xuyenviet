import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { getAuthenticatedSession } from "@/server/auth";

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

  return { ...conversation, messages: conversationMessages };
}
