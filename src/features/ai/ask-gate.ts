"use server";

import "server-only";

import { runAuthenticatedMutation } from "@/server/mutations";

export type AiAskSubmission = {
  question: string;
};

export type AiAskSubmissionResult = {
  status: "queued-for-future-implementation";
};

export async function submitAiAsk(input: AiAskSubmission): Promise<AiAskSubmissionResult> {
  return runAuthenticatedMutation({
    action: async () => {
      const question = input.question.trim();

      if (!question || question.length > 2_000) {
        throw new Error("AI Ask question must be between 1 and 2000 characters.");
      }

      return { status: "queued-for-future-implementation" };
    },
  });
}
