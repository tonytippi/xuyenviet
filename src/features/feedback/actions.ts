"use server";

import { redirect } from "next/navigation";

import { saveAnswerUsefulnessFeedback, type SaveAnswerUsefulnessFeedbackResult } from "@/features/feedback/answer-usefulness";

export type SaveAnswerUsefulnessFeedbackActionState = SaveAnswerUsefulnessFeedbackResult;

export async function saveAnswerUsefulnessFeedbackAction(input: {
  assistantMessageId: string;
  rating: "useful" | "not_useful";
  comment?: string | null;
}): Promise<SaveAnswerUsefulnessFeedbackActionState> {
  const result = await saveAnswerUsefulnessFeedback(input);

  if (result.reason === "unauthenticated") {
    redirect("/sign-in?next=/ai-ask");
  }

  return result;
}
