import { BadRequestException, Body, Controller, Delete, Headers, HttpCode, Inject, Param, Post } from "@nestjs/common";

import { parseAiAskIdempotencyKey, parseAnnotationProposalActionCommand, parseContinueInTripCommand, parseCreateTripProjectCommand, parseRecommendationDecisionCommand, parseSaveAnswerUsefulnessFeedbackCommand, parseTripChangeProposalCommand, type AcceptTripCreationRecommendationResult, type AnnotationProposalActionCommand, type AnnotationProposalActionResult, type ApplyTripChangeProposalResult, type ContinueInTripResult, type CreateTripProjectCommand, type CreateTripProjectResult, type DeleteOwnedResourceResult, type DismissTripChangeProposalResult, type RecommendationActionResult, type RequestPrincipal, type SaveAnswerUsefulnessFeedbackResult, type TripChangeProposalCommand } from "@xuyenviet/contracts";
import type { TravelerCommandPort } from "@xuyenviet/domain";

import { Principal } from "../auth/principal.decorator";
import { SafeValidationPipe } from "../common/safe-validation.pipe";

export const TRAVELER_COMMAND_PORT = Symbol("TRAVELER_COMMAND_PORT");

class CreateTripProjectDto {
  static parse(value: unknown) { const parsed = parseCreateTripProjectCommand(value); return parsed ? { ok: true as const, value: parsed } : { ok: false as const }; }
}
class SaveAnswerUsefulnessFeedbackDto {
  declare assistantMessageId: string;
  declare rating: "useful" | "not_useful";
  declare comment?: string | null;
  static parse(value: unknown) { const parsed = parseSaveAnswerUsefulnessFeedbackCommand(value); return parsed ? { ok: true as const, value: parsed } : { ok: false as const }; }
}
class TripChangeProposalDto { static parse(value: unknown) { const parsed = parseTripChangeProposalCommand(value); return parsed ? { ok: true as const, value: parsed } : { ok: false as const }; } }
class AnnotationProposalActionDto { static parse(value: unknown) { const parsed = parseAnnotationProposalActionCommand(value); return parsed ? { ok: true as const, value: parsed } : { ok: false as const }; } }
class RecommendationDecisionDto { declare decisionId: string; static parse(value: unknown) { const parsed = parseRecommendationDecisionCommand(value); return parsed ? { ok: true as const, value: parsed } : { ok: false as const }; } }
class ContinueInTripDto { declare decisionId: string; declare tripProjectId: string; static parse(value: unknown) { const parsed = parseContinueInTripCommand(value); return parsed ? { ok: true as const, value: parsed } : { ok: false as const }; } }

@Controller("v1")
export class TravelerCommandsController {
  constructor(@Inject(TRAVELER_COMMAND_PORT) private readonly commands: TravelerCommandPort) {}

  @Post("trip-projects")
  async createTripProject(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(CreateTripProjectDto)) input: CreateTripProjectCommand): Promise<CreateTripProjectResult> {
    return this.commands.createTripProject(principal.userId, input);
  }

  @Delete("conversations/:conversationId")
  @HttpCode(200)
  async deleteConversation(@Principal() principal: RequestPrincipal, @Param("conversationId") conversationId: string): Promise<DeleteOwnedResourceResult> {
    return this.commands.deleteConversation(principal.userId, conversationId);
  }

  @Delete("trip-projects/:tripProjectId")
  @HttpCode(200)
  async deleteTripProject(@Principal() principal: RequestPrincipal, @Param("tripProjectId") tripProjectId: string): Promise<DeleteOwnedResourceResult> {
    return this.commands.deleteTripProject(principal.userId, tripProjectId);
  }

  @Post("answer-usefulness-feedback")
  async saveFeedback(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(SaveAnswerUsefulnessFeedbackDto)) input: SaveAnswerUsefulnessFeedbackDto): Promise<SaveAnswerUsefulnessFeedbackResult> {
    return this.commands.saveAnswerUsefulnessFeedback(principal.userId, input);
  }

  @Post("trip-change-proposals/apply")
  async applyTripChangeProposal(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(TripChangeProposalDto)) input: TripChangeProposalCommand): Promise<ApplyTripChangeProposalResult> { return this.commands.applyTripChangeProposal(principal.userId, input); }

  @Post("trip-change-proposals/dismiss")
  async dismissTripChangeProposal(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(TripChangeProposalDto)) input: TripChangeProposalCommand): Promise<DismissTripChangeProposalResult> { return this.commands.dismissTripChangeProposal(principal.userId, input); }

  @Post("trip-change-proposals/annotation-action")
  async executeAnnotationProposalAction(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(AnnotationProposalActionDto)) input: AnnotationProposalActionCommand): Promise<AnnotationProposalActionResult> { return this.commands.executeAnnotationProposalAction(principal.userId, input); }

  @Post("trip-recommendations/decline-creation")
  async declineTripCreation(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(RecommendationDecisionDto)) input: RecommendationDecisionDto): Promise<RecommendationActionResult> { return this.commands.declineTripCreationRecommendation(principal.userId, input); }

  @Post("trip-recommendations/private")
  async choosePrivate(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(RecommendationDecisionDto)) input: RecommendationDecisionDto): Promise<RecommendationActionResult> { return this.commands.choosePrivateTripRecommendation(principal.userId, input); }

  @Post("trip-recommendations/continue")
  async continueInTrip(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(ContinueInTripDto)) input: ContinueInTripDto): Promise<ContinueInTripResult> { return this.commands.continueInTrip(principal.userId, input); }

  @Post("trip-recommendations/accept-creation")
  async acceptTripCreation(@Principal() principal: RequestPrincipal, @Headers("idempotency-key") idempotencyKey: string | undefined, @Body(new SafeValidationPipe(RecommendationDecisionDto)) input: RecommendationDecisionDto): Promise<AcceptTripCreationRecommendationResult> {
    const key = parseAiAskIdempotencyKey(idempotencyKey); if (!key) throw new BadRequestException("Idempotency-Key is invalid.");
    return this.commands.acceptTripCreationRecommendation(principal.userId, { decisionId: input.decisionId, idempotencyKey: key });
  }


}
