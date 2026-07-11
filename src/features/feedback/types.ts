import type { AnswerUsefulnessRating } from "@/db/schema";

export const answerUsefulnessCommentMaxLength = 500;

export type AnswerUsefulnessFeedbackSummary = {
  rating: AnswerUsefulnessRating;
  comment: string | null;
  updatedAt: Date;
};
