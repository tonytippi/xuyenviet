import type { AdminYoutubeDiscoveryAcceptReviewResult, AdminYoutubeDiscoveryActionRequiredCursor, AdminYoutubeDiscoveryActionRequiredQueue, AdminYoutubeDiscoveryDeferReviewResult, AdminYoutubeDiscoveryQuery, AdminYoutubeDiscoveryQueryList, AdminYoutubeDiscoveryReviewCursor, AdminYoutubeDiscoveryReviewDetail, AdminYoutubeDiscoveryReviewQueue, AdminYoutubeDiscoverySkipReviewResult, RequestPrincipal } from "@xuyenviet/contracts";
import type { KnowledgeOneUrlHandoff } from "../admin-knowledge-intake";

/** A cursor must continue to identify an active queue row before it can seek. */
export class YoutubeDiscoveryReviewCursorValidationError extends Error {}
export class YoutubeDiscoveryActionRequiredCursorValidationError extends Error {}

export type YoutubeDiscoveryMissionActionInput = Readonly<{ actionId: string; priority: number; createdAt: Date }>;
export type YoutubeDiscoveryKnowledgeActionInput = Readonly<{ recommendationId: string; workType: "risk" | "relation"; priority: number; createdAt: Date }>;
export type YoutubeDiscoveryActionOwnerPorts = Readonly<{
  admitsActionCursor(cursor: AdminYoutubeDiscoveryActionRequiredCursor): Promise<boolean>;
  listMissionNeeds(policy: Readonly<{ highPriorityMaximum: number }>): Promise<YoutubeDiscoveryMissionActionInput[]>;
  listKnowledgeRecommendations(policy: Readonly<{ highPriorityMaximum: number }>): Promise<YoutubeDiscoveryKnowledgeActionInput[]>;
}>;

export type AdminYoutubeDiscoveryPort = {
  list(): Promise<AdminYoutubeDiscoveryQueryList>;
  listReview(principal: RequestPrincipal, cursor: AdminYoutubeDiscoveryReviewCursor | null): Promise<AdminYoutubeDiscoveryReviewQueue>;
  listActionRequired(principal: RequestPrincipal, cursor: AdminYoutubeDiscoveryActionRequiredCursor | null): Promise<AdminYoutubeDiscoveryActionRequiredQueue>;
  getReview(principal: RequestPrincipal, recommendationId: string): Promise<AdminYoutubeDiscoveryReviewDetail | null>;
  acceptReview(principal: RequestPrincipal, recommendationId: string): Promise<AdminYoutubeDiscoveryAcceptReviewResult | null>;
  deferReview(principal: RequestPrincipal, recommendationId: string): Promise<AdminYoutubeDiscoveryDeferReviewResult | null>;
  skipReview(principal: RequestPrincipal, recommendationId: string): Promise<AdminYoutubeDiscoverySkipReviewResult | null>;
  create(principal: RequestPrincipal, input: { queryText: string; priority: number; cadenceMinutes: number }): Promise<AdminYoutubeDiscoveryQuery>;
  edit(principal: RequestPrincipal, id: string, queryText: string): Promise<AdminYoutubeDiscoveryQuery | null>;
  reprioritize(principal: RequestPrincipal, id: string, priority: number): Promise<AdminYoutubeDiscoveryQuery | null>;
  pause(principal: RequestPrincipal, id: string): Promise<AdminYoutubeDiscoveryQuery | null>;
  resume(principal: RequestPrincipal, id: string): Promise<AdminYoutubeDiscoveryQuery | null>;
};

export type AdminYoutubeDiscoveryDependencies = { captureEligibility?: { check(videoId: string): Promise<"eligible" | "already_compatible" | "unavailable"> }; knowledgeHandoff?: KnowledgeOneUrlHandoff; actionOwners?: YoutubeDiscoveryActionOwnerPorts };
