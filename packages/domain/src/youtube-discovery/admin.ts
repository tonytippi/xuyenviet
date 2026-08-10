import type { AdminYoutubeDiscoveryQuery, AdminYoutubeDiscoveryQueryList, AdminYoutubeDiscoveryReviewCursor, AdminYoutubeDiscoveryReviewDetail, AdminYoutubeDiscoveryReviewQueue, RequestPrincipal } from "@xuyenviet/contracts";

/** A cursor must continue to identify an active queue row before it can seek. */
export class YoutubeDiscoveryReviewCursorValidationError extends Error {}

export type AdminYoutubeDiscoveryPort = {
  list(): Promise<AdminYoutubeDiscoveryQueryList>;
  listReview(cursor: AdminYoutubeDiscoveryReviewCursor | null): Promise<AdminYoutubeDiscoveryReviewQueue>;
  getReview(recommendationId: string): Promise<AdminYoutubeDiscoveryReviewDetail | null>;
  create(principal: RequestPrincipal, input: { queryText: string; priority: number; cadenceMinutes: number }): Promise<AdminYoutubeDiscoveryQuery>;
  edit(principal: RequestPrincipal, id: string, queryText: string): Promise<AdminYoutubeDiscoveryQuery | null>;
  reprioritize(principal: RequestPrincipal, id: string, priority: number): Promise<AdminYoutubeDiscoveryQuery | null>;
  pause(principal: RequestPrincipal, id: string): Promise<AdminYoutubeDiscoveryQuery | null>;
  resume(principal: RequestPrincipal, id: string): Promise<AdminYoutubeDiscoveryQuery | null>;
};
