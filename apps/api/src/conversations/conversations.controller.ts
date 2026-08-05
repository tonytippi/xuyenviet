import { Controller, Get, Inject, Param, Query } from "@nestjs/common";

import { type ConversationSummaryListResponse, type PlanningAnswerDetailResponse, type PlanningContextResponse, type TravelerShellResponse, type TripProjectSidebarListResponse, type TripRecommendationResponse } from "@xuyenviet/contracts";
import { listOwnedConversationSummaries, serializeConversationSummaries } from "@xuyenviet/domain";
import type { ConversationSummaryRepository, TravelerShellRepository } from "@xuyenviet/database";
import type { PlanningReadRepository, TripProjectSidebarReadRepository, TripRecommendationReadRepository } from "@xuyenviet/domain";

import { Principal } from "../auth/principal.decorator";
import type { RequestPrincipal } from "@xuyenviet/contracts";

export const CONVERSATION_SUMMARY_REPOSITORY = Symbol("CONVERSATION_SUMMARY_REPOSITORY");
export const PLANNING_READ_REPOSITORY = Symbol("PLANNING_READ_REPOSITORY");
export const TRAVELER_SHELL_REPOSITORY = Symbol("TRAVELER_SHELL_REPOSITORY");
export const TRIP_RECOMMENDATION_READ_REPOSITORY = Symbol("TRIP_RECOMMENDATION_READ_REPOSITORY");
export const TRIP_PROJECT_SIDEBAR_READ_REPOSITORY = Symbol("TRIP_PROJECT_SIDEBAR_READ_REPOSITORY");

@Controller("v1/conversations")
export class ConversationsController {
  constructor(@Inject(CONVERSATION_SUMMARY_REPOSITORY) private readonly repository: ConversationSummaryRepository, @Inject(PLANNING_READ_REPOSITORY) private readonly planning: PlanningReadRepository, @Inject(TRAVELER_SHELL_REPOSITORY) private readonly shell: TravelerShellRepository, @Inject(TRIP_RECOMMENDATION_READ_REPOSITORY) private readonly recommendations: TripRecommendationReadRepository, @Inject(TRIP_PROJECT_SIDEBAR_READ_REPOSITORY) private readonly projects: TripProjectSidebarReadRepository) {}

  @Get("summaries")
  async list(@Principal() principal: RequestPrincipal): Promise<ConversationSummaryListResponse> {
    return { summaries: serializeConversationSummaries(await listOwnedConversationSummaries(this.repository, principal.userId)) };
  }

  @Get("trip-projects")
  async listTripProjects(@Principal() principal: RequestPrincipal): Promise<TripProjectSidebarListResponse> {
    return { projects: await this.projects.listOwnedTripProjectSidebarSummaries(principal.userId) };
  }

  @Get("shell")
  async travelerShell(@Principal() principal: RequestPrincipal, @Query("conversationId") conversationId: string | undefined, @Query("tripProjectId") tripProjectId: string | undefined): Promise<TravelerShellResponse> {
    return { shell: await this.shell.loadOwnedTravelerShell(principal.userId, validOptionalIdentifier(conversationId), validOptionalIdentifier(tripProjectId)) };
  }

  @Get("planning-context/:tripProjectId")
  async context(@Principal() principal: RequestPrincipal, @Param("tripProjectId") tripProjectId: string): Promise<PlanningContextResponse> {
    return { context: validIdentifier(tripProjectId) ? await this.planning.loadOwnedPlanningContext(principal.userId, tripProjectId) : null };
  }

  @Get(":conversationId/trip-recommendation")
  async tripRecommendation(@Principal() principal: RequestPrincipal, @Param("conversationId") conversationId: string): Promise<TripRecommendationResponse> {
    return validIdentifier(conversationId) ? this.recommendations.loadOwnedTripRecommendations(principal.userId, conversationId) : { tripCreationRecommendation: { kind: "none" }, tripContextRecommendation: { kind: "none" } };
  }

  @Get(":conversationId/answers/:assistantMessageId")
  async answerDetail(@Principal() principal: RequestPrincipal, @Param("conversationId") conversationId: string, @Param("assistantMessageId") assistantMessageId: string): Promise<PlanningAnswerDetailResponse> {
    return { detail: validIdentifier(conversationId) && validIdentifier(assistantMessageId) ? await this.planning.loadOwnedAnswerDetail(principal.userId, conversationId, assistantMessageId) : null };
  }
}

function validIdentifier(value: string) { return value.length > 0 && value.length <= 128 && value.trim() === value; }
function validOptionalIdentifier(value: string | undefined) { return value && validIdentifier(value) ? value : undefined; }
