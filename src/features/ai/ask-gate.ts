"use server";

import "server-only";

import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { runAuthenticatedMutation } from "@/server/mutations";

export type AiAskSubmission = {
  question: string;
};

export type AiAskSubmissionResult = {
  status: "conversation-created";
  conversationId: string;
  messageId: string;
};

export async function submitAiAsk(input: AiAskSubmission): Promise<AiAskSubmissionResult> {
  return runAuthenticatedMutation({
    action: async (session) => {
      const question = typeof input?.question === "string" ? input.question.trim() : "";

      if (!question || question.length > 2_000) {
        throw new Error("AI Ask question must be between 1 and 2000 characters.");
      }

      return getDb().transaction(async (transaction) => {
        const [conversation] = await transaction
          .insert(conversations)
          .values({ userId: session.userId })
          .returning({ id: conversations.id });

        const [message] = await transaction
          .insert(messages)
          .values({
            conversationId: conversation.id,
            userId: session.userId,
            role: "user",
            content: question,
          })
          .returning({ id: messages.id });

        return {
          status: "conversation-created",
          conversationId: conversation.id,
          messageId: message.id,
        };
      });
    },
  });
}
