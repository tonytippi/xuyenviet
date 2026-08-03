import { Body, Controller, Delete, HttpCode, Inject, Param, Post } from "@nestjs/common";

import { parseAnnotationProposalActionCommand, parseCreateTripProjectCommand, parseSaveAnswerUsefulnessFeedbackCommand, parseTripChangeProposalCommand, type AnnotationProposalActionCommand, type AnnotationProposalActionResult, type ApplyTripChangeProposalResult, type CreateTripProjectCommand, type CreateTripProjectResult, type DeleteOwnedResourceResult, type DismissTripChangeProposalResult, type RequestPrincipal, type SaveAnswerUsefulnessFeedbackCommand, type SaveAnswerUsefulnessFeedbackResult, type TripChangeProposalCommand } from "@xuyenviet/contracts";
import type { TravelerCommandPort } from "@xuyenviet/domain";

import { Principal } from "../auth/principal.decorator";
import { SafeValidationPipe } from "../common/safe-validation.pipe";

export const TRAVELER_COMMAND_PORT = Symbol("TRAVELER_COMMAND_PORT");

class CreateTripProjectDto {
  static parse(value: unknown) { const parsed = parseCreateTripProjectCommand(value); return parsed ? { ok: true as const, value: parsed } : { ok: false as const }; }
}
class SaveAnswerUsefulnessFeedbackDto {
  static parse(value: unknown) { const parsed = parseSaveAnswerUsefulnessFeedbackCommand(value); return parsed ? { ok: true as const, value: parsed } : { ok: false as const }; }
}
class TripChangeProposalDto { static parse(value: unknown) { const parsed = parseTripChangeProposalCommand(value); return parsed ? { ok: true as const, value: parsed } : { ok: false as const }; } }
class AnnotationProposalActionDto { static parse(value: unknown) { const parsed = parseAnnotationProposalActionCommand(value); return parsed ? { ok: true as const, value: parsed } : { ok: false as const }; } }

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
  async saveFeedback(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(SaveAnswerUsefulnessFeedbackDto)) input: SaveAnswerUsefulnessFeedbackCommand): Promise<SaveAnswerUsefulnessFeedbackResult> {
    return this.commands.saveAnswerUsefulnessFeedback(principal.userId, input);
  }

  @Post("trip-change-proposals/apply")
  async applyTripChangeProposal(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(TripChangeProposalDto)) input: TripChangeProposalCommand): Promise<ApplyTripChangeProposalResult> { return this.commands.applyTripChangeProposal(principal.userId, input); }

  @Post("trip-change-proposals/dismiss")
  async dismissTripChangeProposal(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(TripChangeProposalDto)) input: TripChangeProposalCommand): Promise<DismissTripChangeProposalResult> { return this.commands.dismissTripChangeProposal(principal.userId, input); }

  @Post("trip-change-proposals/annotation-action")
  async executeAnnotationProposalAction(@Principal() principal: RequestPrincipal, @Body(new SafeValidationPipe(AnnotationProposalActionDto)) input: AnnotationProposalActionCommand): Promise<AnnotationProposalActionResult> { return this.commands.executeAnnotationProposalAction(principal.userId, input); }


}
