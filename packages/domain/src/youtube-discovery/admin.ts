import type { AdminYoutubeDiscoveryAcceptReviewResult, AdminYoutubeDiscoveryActionRequiredCursor, AdminYoutubeDiscoveryActionRequiredQueue, AdminYoutubeDiscoveryDeferReviewResult, AdminYoutubeDiscoveryEnablementResult, AdminYoutubeDiscoveryHealthIncidentCursor, AdminYoutubeDiscoveryHealthIncidentDetail, AdminYoutubeDiscoveryHealthOverview, AdminYoutubeDiscoveryMissionCandidateCursor, AdminYoutubeDiscoveryMissionCandidatePage, AdminYoutubeDiscoveryMissionCoverage, AdminYoutubeDiscoveryMissionCoverageCursor, AdminYoutubeDiscoveryMissionCoveragePage, AdminYoutubeDiscoveryMissionDetail, AdminYoutubeDiscoveryMissionFunnel, AdminYoutubeDiscoveryMissionQueryCursor, AdminYoutubeDiscoveryMissionQueryPage, AdminYoutubeDiscoveryQuery, AdminYoutubeDiscoveryQueryList, AdminYoutubeDiscoveryReviewCursor, AdminYoutubeDiscoveryReviewDetail, AdminYoutubeDiscoveryReviewQueue, AdminYoutubeDiscoverySkipReviewResult, RequestPrincipal } from "@xuyenviet/contracts";
import type { KnowledgeOneUrlHandoff } from "../admin-knowledge-intake";

/** A cursor must continue to identify an active queue row before it can seek. */
export class YoutubeDiscoveryReviewCursorValidationError extends Error {}
export class YoutubeDiscoveryActionRequiredCursorValidationError extends Error {}
export class YoutubeDiscoveryMissionCursorValidationError extends Error {}
export class YoutubeDiscoveryHealthCursorValidationError extends Error {}

export type YoutubeDiscoveryMissionActionInput = Readonly<{ actionId: string; priority: number; createdAt: Date }>;
export type YoutubeDiscoveryKnowledgeActionInput = Readonly<{ recommendationId: string; workType: "risk" | "relation"; priority: number; createdAt: Date }>;
export type YoutubeDiscoveryActionOwnerPorts = Readonly<{
  admitsActionCursor(cursor: AdminYoutubeDiscoveryActionRequiredCursor): Promise<boolean>;
  listMissionNeeds(policy: Readonly<{ highPriorityMaximum: number }>): Promise<YoutubeDiscoveryMissionActionInput[]>;
  listKnowledgeRecommendations(policy: Readonly<{ highPriorityMaximum: number }>): Promise<YoutubeDiscoveryKnowledgeActionInput[]>;
}>;
export type YoutubeDiscoveryMissionOwnerPorts = Readonly<{
  listMissionCoverage(cursor: AdminYoutubeDiscoveryMissionCoverageCursor | null): Promise<AdminYoutubeDiscoveryMissionCoveragePage>;
  getMissionDetail(actionId: string): Promise<AdminYoutubeDiscoveryMissionCoverage | null>;
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
  listMissionCoverage(cursor: AdminYoutubeDiscoveryMissionCoverageCursor | null): Promise<AdminYoutubeDiscoveryMissionCoveragePage>;
  listMissionQueries(cursor: AdminYoutubeDiscoveryMissionQueryCursor | null): Promise<AdminYoutubeDiscoveryMissionQueryPage>;
  listMissionCandidates(cursor: AdminYoutubeDiscoveryMissionCandidateCursor | null): Promise<AdminYoutubeDiscoveryMissionCandidatePage>;
  missionFunnel(): Promise<AdminYoutubeDiscoveryMissionFunnel>;
  getMissionDetail(actionId: string, cursor: AdminYoutubeDiscoveryMissionCandidateCursor | null): Promise<AdminYoutubeDiscoveryMissionDetail | null>;
  healthOverview(): Promise<AdminYoutubeDiscoveryHealthOverview>;
  setEnabled(principal: RequestPrincipal, enabled: boolean): Promise<AdminYoutubeDiscoveryEnablementResult>;
  getHealthIncident(groupId: string, cursor: AdminYoutubeDiscoveryHealthIncidentCursor | null): Promise<AdminYoutubeDiscoveryHealthIncidentDetail | null>;
};

export type AdminYoutubeDiscoveryDependencies = { captureEligibility?: { check(videoId: string): Promise<"eligible" | "already_compatible" | "unavailable"> }; knowledgeHandoff?: KnowledgeOneUrlHandoff; actionOwners?: YoutubeDiscoveryActionOwnerPorts; missionOwners?: YoutubeDiscoveryMissionOwnerPorts };
