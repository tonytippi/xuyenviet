import { and, eq } from "drizzle-orm";

import { getDb } from "./client";
import { conversations, messages } from "./schema";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;

export async function insertConversationMessage(transaction: Transaction, input: { conversationId: string; userId: string; role: "user" | "assistant"; content: string }) {
  const [conversation] = await transaction.select({ contentRevision: conversations.contentRevision }).from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, input.userId))).limit(1).for("update");
  if (!conversation) throw new Error("Conversation was not found.");
  const ordinal = conversation.contentRevision + 1;
  const [message] = await transaction.insert(messages).values({ ...input, ordinal }).returning({ id: messages.id, content: messages.content, ordinal: messages.ordinal });
  const [updated] = await transaction.update(conversations).set({ contentRevision: ordinal, updatedAt: new Date() }).where(and(eq(conversations.id, input.conversationId), eq(conversations.contentRevision, conversation.contentRevision))).returning({ contentRevision: conversations.contentRevision });
  if (!updated) throw new Error("Conversation content revision changed.");
  return { message: message!, ordinal, contentRevision: updated.contentRevision };
}
