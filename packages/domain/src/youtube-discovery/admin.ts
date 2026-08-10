import type { AdminYoutubeDiscoveryAcceptReviewResult, AdminYoutubeDiscoveryQuery, AdminYoutubeDiscoveryQueryList, AdminYoutubeDiscoveryReviewCursor, AdminYoutubeDiscoveryReviewDetail, AdminYoutubeDiscoveryReviewQueue, RequestPrincipal } from "@xuyenviet/contracts";
import type { KnowledgeOneUrlHandoff } from "../admin-knowledge-intake";

/** A cursor must continue to identify an active queue row before it can seek. */
export class YoutubeDiscoveryReviewCursorValidationError extends Error {}

export type AdminYoutubeDiscoveryPort = {
  list(): Promise<AdminYoutubeDiscoveryQueryList>;
  listReview(principal: RequestPrincipal, cursor: AdminYoutubeDiscoveryReviewCursor | null): Promise<AdminYoutubeDiscoveryReviewQueue>;
  getReview(principal: RequestPrincipal, recommendationId: string): Promise<AdminYoutubeDiscoveryReviewDetail | null>;
  acceptReview(principal: RequestPrincipal, recommendationId: string): Promise<AdminYoutubeDiscoveryAcceptReviewResult | null>;
  create(principal: RequestPrincipal, input: { queryText: string; priority: number; cadenceMinutes: number }): Promise<AdminYoutubeDiscoveryQuery>;
  edit(principal: RequestPrincipal, id: string, queryText: string): Promise<AdminYoutubeDiscoveryQuery | null>;
  reprioritize(principal: RequestPrincipal, id: string, priority: number): Promise<AdminYoutubeDiscoveryQuery | null>;
  pause(principal: RequestPrincipal, id: string): Promise<AdminYoutubeDiscoveryQuery | null>;
  resume(principal: RequestPrincipal, id: string): Promise<AdminYoutubeDiscoveryQuery | null>;
};

export type AdminYoutubeDiscoveryDependencies = { captureEligibility?: { check(videoId: string): Promise<"eligible" | "already_compatible" | "unavailable"> }; knowledgeHandoff?: KnowledgeOneUrlHandoff };
