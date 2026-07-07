"use server";

import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { runAuthenticatedMutation } from "@/server/mutations";
import { writeAiUsageEvent } from "@/features/usage/events";

import { generateInitialAiAskAnswer } from "./gateway";
import { aiAskInitialAnswerModel, aiAskInitialAnswerPromptVersion, aiAskInitialAnswerPurpose, buildAiAskMessages } from "./prompts";

export type AiAskSubmission = {
  question: string;
  conversationId?: string;
};

type ReturnedMessage = {
  id: string;
  role?: "user" | "assistant";
  content: string;
};

export type AiAskSubmissionResult = {
  status: "answer-created";
  conversationId: string;
  userMessage: ReturnedMessage;
  assistantMessage: ReturnedMessage;
} | {
  status: "answer-failed";
  conversationId: string;
  userMessage: ReturnedMessage;
  errorMessage: string;
};

export async function submitAiAsk(input: AiAskSubmission): Promise<AiAskSubmissionResult> {
  return runAuthenticatedMutation({
    action: async (session) => {
      const question = typeof input?.question === "string" ? input.question.trim() : "";

      if (!question || question.length > 2_000) {
        throw new Error("AI Ask question must be between 1 and 2000 characters.");
      }

      const db = getDb();
      const saved = await db.transaction(async (transaction) => {
        const requestedConversationId = typeof input?.conversationId === "string" ? input.conversationId.trim() : "";
        const [conversation] = requestedConversationId
          ? await transaction
              .select({ id: conversations.id })
              .from(conversations)
              .where(and(eq(conversations.id, requestedConversationId), eq(conversations.userId, session.userId)))
              .limit(1)
          : await transaction.insert(conversations).values({ userId: session.userId }).returning({ id: conversations.id });

        if (!conversation) {
          throw new Error("Conversation not found or access denied.");
        }

        const history = await transaction
          .select({ role: messages.role, content: messages.content })
          .from(messages)
          .where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, session.userId)))
          .orderBy(asc(messages.createdAt), asc(messages.id));

        const [message] = await transaction
          .insert(messages)
          .values({
            conversationId: conversation.id,
            userId: session.userId,
            role: "user",
            content: question,
          })
          .returning({ id: messages.id });

        await transaction.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));

        return {
          conversationId: conversation.id,
          history,
          userMessage: {
            id: message.id,
            content: question,
          },
        };
      });

      const gatewayResult = await generateInitialAiAskAnswer(buildAiAskMessages({ question, history: saved.history }));

      if (!gatewayResult.ok) {
        await writeAiUsageEvent(db, {
          userId: session.userId,
          conversationId: saved.conversationId,
          userMessageId: saved.userMessage.id,
          purpose: aiAskInitialAnswerPurpose,
          provider: gatewayResult.provider,
          model: gatewayResult.model,
          promptVersion: aiAskInitialAnswerPromptVersion,
          status: "failure",
          latencyMs: gatewayResult.latencyMs,
          errorCode: gatewayResult.errorCode,
        });

        return {
          status: "answer-failed",
          conversationId: saved.conversationId,
          userMessage: saved.userMessage,
          errorMessage: "Mình chưa tạo được câu trả lời lúc này. Nội dung của bạn vẫn còn trong ô nhập để gửi lại.",
        };
      }

      return db.transaction(async (transaction) => {
        const [assistantMessage] = await transaction
          .insert(messages)
          .values({
            conversationId: saved.conversationId,
            userId: session.userId,
            role: "assistant",
            content: gatewayResult.content,
          })
          .returning({ id: messages.id });

        await transaction.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, saved.conversationId));

        await writeAiUsageEvent(transaction, {
          userId: session.userId,
          conversationId: saved.conversationId,
          userMessageId: saved.userMessage.id,
          assistantMessageId: assistantMessage.id,
          purpose: aiAskInitialAnswerPurpose,
          provider: gatewayResult.provider,
          model: gatewayResult.model || aiAskInitialAnswerModel,
          promptVersion: aiAskInitialAnswerPromptVersion,
          status: "success",
          latencyMs: gatewayResult.latencyMs,
          promptTokens: gatewayResult.usage.promptTokens,
          completionTokens: gatewayResult.usage.completionTokens,
          totalTokens: gatewayResult.usage.totalTokens,
        });

        return {
          status: "answer-created",
          conversationId: saved.conversationId,
          userMessage: saved.userMessage,
          assistantMessage: {
            id: assistantMessage.id,
            content: gatewayResult.content,
          },
        };
      });
    },
  });
}
