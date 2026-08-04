import type { PlanningAnnotation, PlanningProvenance, TravelerWorkspaceProjection } from "@xuyenviet/contracts";

export type AnswerUsefulnessRating = "useful" | "not_useful";

export type AnswerUsefulnessFeedbackSummary = {
  rating: AnswerUsefulnessRating;
  comment: string | null;
  updatedAt: Date;
};

export const answerUsefulnessCommentMaxLength = 500;

export function countAnswerUsefulnessCommentCharacters(comment: string) {
  return Array.from(comment).length;
}

export type AssistantMessageProvenanceItem = PlanningProvenance;
export type AvailableAssistantMessageProvenanceItem = Extract<PlanningProvenance, { availability: "available" }>;
export type AnswerAnnotation = PlanningAnnotation;
export type AnswerAnnotationActionCapability = NonNullable<PlanningAnnotation["detail"]["capability"]>;

export type PendingProposalAffectedItemRef = TravelerWorkspaceProjection["pendingProposals"][number]["affectedItems"][number];
export type PendingProposalFocusInput = Omit<TravelerWorkspaceProjection["pendingProposals"][number], "createdAt" | "expiresAt"> & {
  createdAt: Date;
  expiresAt: Date | null;
};

export type TripWorkspaceReadModel = Omit<TravelerWorkspaceProjection, "pendingProposals" | "timelineGroups"> & {
  pendingProposals: PendingProposalFocusInput[];
  timelineGroups: Array<Omit<TravelerWorkspaceProjection["timelineGroups"][number], "entries"> & {
    entries: Array<Omit<TravelerWorkspaceProjection["timelineGroups"][number]["entries"][number], "plannedAt"> & { plannedAt: Date | null }>;
  }>;
};
