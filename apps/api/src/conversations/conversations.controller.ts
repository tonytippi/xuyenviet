import { Controller, Get, Inject } from "@nestjs/common";

import { type ConversationSummaryListResponse } from "@xuyenviet/contracts";
import { listOwnedConversationSummaries, serializeConversationSummaries } from "@xuyenviet/domain";
import type { ConversationSummaryRepository } from "@xuyenviet/database";

import { Principal } from "../auth/principal.decorator";
import type { RequestPrincipal } from "@xuyenviet/contracts";

export const CONVERSATION_SUMMARY_REPOSITORY = Symbol("CONVERSATION_SUMMARY_REPOSITORY");

@Controller("v1/conversations")
export class ConversationsController {
  constructor(@Inject(CONVERSATION_SUMMARY_REPOSITORY) private readonly repository: ConversationSummaryRepository) {}

  @Get("summaries")
  async list(@Principal() principal: RequestPrincipal): Promise<ConversationSummaryListResponse> {
    return { summaries: serializeConversationSummaries(await listOwnedConversationSummaries(this.repository, principal.userId)) };
  }
}
