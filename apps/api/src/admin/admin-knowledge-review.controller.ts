import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, Req, ServiceUnavailableException } from "@nestjs/common";
import { parseAdminKnowledgeCard, parseAdminKnowledgeCardList, parseAdminKnowledgeCardListQuery, parseAdminKnowledgeRecommendationDetail, parseAdminKnowledgeRecommendationList, parseAdminKnowledgeRecommendationListQuery, parseAdminKnowledgeRecommendationResolve, parseAdminKnowledgeRecommendationResult, type RequestPrincipal } from "@xuyenviet/contracts";
import { type AdminKnowledgeReviewPort, KnowledgeDraftReviewPolicyError } from "@xuyenviet/domain";
import { AllowsAdminBrowserSession, RequiresAdminCapability } from "../auth/admin-capability.decorator";
export const ADMIN_KNOWLEDGE_REVIEW_PORT = Symbol("ADMIN_KNOWLEDGE_REVIEW_PORT");
@Controller("v1/admin/knowledge") @RequiresAdminCapability("admin.knowledge.write") @AllowsAdminBrowserSession()
export class AdminKnowledgeReviewController {
  constructor(@Inject(ADMIN_KNOWLEDGE_REVIEW_PORT) private readonly review: AdminKnowledgeReviewPort) {}
  @Get("cards") async cards(@Query() query: Record<string, unknown>) { const input = parseAdminKnowledgeCardListQuery(query); if (!input) throw invalid(); return checked(await this.review.listCards(input), parseAdminKnowledgeCardList); }
  @Get("cards/:id") async card(@Param("id") id: string) { return found(await this.review.getCard(id), parseAdminKnowledgeCard); }
  @Get("recommendations") async recommendations(@Query() query: Record<string, unknown>) { const input = parseAdminKnowledgeRecommendationListQuery(query); if (!input) throw invalid(); return checked(await this.review.listRecommendations(input as Parameters<AdminKnowledgeReviewPort["listRecommendations"]>[0]), parseAdminKnowledgeRecommendationList); }
  @Get("recommendations/:id") async recommendation(@Param("id") id: string) { return found(await this.review.getRecommendation(id), parseAdminKnowledgeRecommendationDetail); }
  @Post("recommendations/:id/resolve") @HttpCode(HttpStatus.OK) async resolve(@Param("id") id: string, @Body() body: unknown, @Req() request: { principal?: RequestPrincipal }) { const input = parseAdminKnowledgeRecommendationResolve(body); const principal = request.principal; if (!input || !principal) throw invalid(); return mutation(() => this.review.resolveRecommendation(id, input as Parameters<AdminKnowledgeReviewPort["resolveRecommendation"]>[1], principal), parseAdminKnowledgeRecommendationResult); }
}
function checked<T>(value: unknown, parser: (value: unknown) => T | null): T { const parsed = parser(value); if (!parsed) throw unavailable(); return parsed; }
function found<T>(value: unknown, parser: (value: unknown) => T | null): T { if (value === null) throw invalid(); return checked(value, parser); }
async function mutation<T>(run: () => Promise<unknown>, parser: (value: unknown) => T | null) { try { return checked(await run(), parser); } catch (error) { if (error instanceof KnowledgeDraftReviewPolicyError) throw invalid(); throw unavailable(); } }
function invalid() { return new BadRequestException({ code: "validation_error" }); } function unavailable() { return new ServiceUnavailableException({ code: "internal_error" }); }
