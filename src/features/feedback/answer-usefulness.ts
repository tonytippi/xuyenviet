import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { answerUsefulnessFeedback, messages, type AnswerUsefulnessRating } from "@/db/schema";
import { answerUsefulnessCommentMaxLength, countAnswerUsefulnessCommentCharacters, type AnswerUsefulnessFeedbackSummary } from "@/features/feedback/types";
import { getAuthenticatedSession } from "@/server/auth";

export type SaveAnswerUsefulnessFeedbackInput = {
  assistantMessageId: string;
  rating: AnswerUsefulnessRating;
  comment?: string | null;
};

export type SaveAnswerUsefulnessFeedbackResult = {
  success: boolean;
  feedback?: AnswerUsefulnessFeedbackSummary;
  reason?: "unauthenticated" | "not_found" | "invalid_target" | "invalid_input" | "invalid_rating" | "comment_too_long" | "failed";
};

export function normalizeAnswerUsefulnessComment(comment: string | null | undefined) {
  const trimmed = comment?.trim();

  return trimmed ? trimmed : null;
}

export function isAnswerUsefulnessRating(value: string): value is AnswerUsefulnessRating {
  return value === "useful" || value === "not_useful";
}

function isFeedbackInputShape(input: unknown): input is SaveAnswerUsefulnessFeedbackInput {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Record<string, unknown>;

  return (
    typeof candidate.assistantMessageId === "string" &&
    typeof candidate.rating === "string" &&
    (candidate.comment === undefined || candidate.comment === null || typeof candidate.comment === "string")
  );
}

export async function saveAnswerUsefulnessFeedback(input: unknown): Promise<SaveAnswerUsefulnessFeedbackResult> {
  const session = await getAuthenticatedSession();

  if (!session) {
    return { success: false, reason: "unauthenticated" };
  }

  if (!isFeedbackInputShape(input)) {
    return { success: false, reason: "invalid_input" };
  }

  if (!isAnswerUsefulnessRating(input.rating)) {
    return { success: false, reason: "invalid_rating" };
  }

  const comment = normalizeAnswerUsefulnessComment(input.comment);

  if (comment && countAnswerUsefulnessCommentCharacters(comment) > answerUsefulnessCommentMaxLength) {
    return { success: false, reason: "comment_too_long" };
  }

  try {
    return await getDb().transaction(async (transaction) => {
      const [message] = await transaction
        .select({ id: messages.id, conversationId: messages.conversationId, role: messages.role })
        .from(messages)
        .where(and(eq(messages.id, input.assistantMessageId), eq(messages.userId, session.userId)))
        .limit(1)
        .for("update");

      if (!message) {
        return { success: false, reason: "not_found" };
      }

      if (message.role !== "assistant") {
        return { success: false, reason: "invalid_target" };
      }

      const [feedback] = await transaction
        .insert(answerUsefulnessFeedback)
        .values({
          userId: session.userId,
          conversationId: message.conversationId,
          assistantMessageId: message.id,
          rating: input.rating,
          comment,
        })
        .onConflictDoUpdate({
          target: [answerUsefulnessFeedback.assistantMessageId, answerUsefulnessFeedback.userId],
          set: {
            rating: input.rating,
            comment,
            updatedAt: sql`now()`,
          },
        })
        .returning({ rating: answerUsefulnessFeedback.rating, comment: answerUsefulnessFeedback.comment, updatedAt: answerUsefulnessFeedback.updatedAt });

      return { success: true, feedback };
    });
  } catch {
    return { success: false, reason: "failed" };
  }
}
