import type { AnswerUsefulnessRating } from "@xuyenviet/database";

export const answerUsefulnessCommentMaxLength = 500;

export function countAnswerUsefulnessCommentCharacters(comment: string) {
  return Array.from(comment).length;
}

export type AnswerUsefulnessFeedbackSummary = {
  rating: AnswerUsefulnessRating;
  comment: string | null;
  updatedAt: Date;
};
