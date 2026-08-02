import { Controller, Get, Inject, Param } from "@nestjs/common";

import { type ConversationSummaryListResponse, type PlanningAnswerDetailResponse, type PlanningContextResponse } from "@xuyenviet/contracts";
import { listOwnedConversationSummaries, serializeConversationSummaries } from "@xuyenviet/domain";
import type { ConversationSummaryRepository } from "@xuyenviet/database";
import type { PlanningReadRepository } from "@xuyenviet/domain";

import { Principal } from "../auth/principal.decorator";
import type { RequestPrincipal } from "@xuyenviet/contracts";

export const CONVERSATION_SUMMARY_REPOSITORY = Symbol("CONVERSATION_SUMMARY_REPOSITORY");
export const PLANNING_READ_REPOSITORY = Symbol("PLANNING_READ_REPOSITORY");

@Controller("v1/conversations")
export class ConversationsController {
  constructor(@Inject(CONVERSATION_SUMMARY_REPOSITORY) private readonly repository: ConversationSummaryRepository, @Inject(PLANNING_READ_REPOSITORY) private readonly planning: PlanningReadRepository) {}

  @Get("summaries")
  async list(@Principal() principal: RequestPrincipal): Promise<ConversationSummaryListResponse> {
    return { summaries: serializeConversationSummaries(await listOwnedConversationSummaries(this.repository, principal.userId)) };
  }

  @Get("planning-context/:tripProjectId")
  async context(@Principal() principal: RequestPrincipal, @Param("tripProjectId") tripProjectId: string): Promise<PlanningContextResponse> {
    return { context: validIdentifier(tripProjectId) ? await this.planning.loadOwnedPlanningContext(principal.userId, tripProjectId) : null };
  }

  @Get(":conversationId/answers/:assistantMessageId")
  async answerDetail(@Principal() principal: RequestPrincipal, @Param("conversationId") conversationId: string, @Param("assistantMessageId") assistantMessageId: string): Promise<PlanningAnswerDetailResponse> {
    return { detail: validIdentifier(conversationId) && validIdentifier(assistantMessageId) ? await this.planning.loadOwnedAnswerDetail(principal.userId, conversationId, assistantMessageId) : null };
  }
}

function validIdentifier(value: string) { return value.length > 0 && value.length <= 128 && value.trim() === value; }
