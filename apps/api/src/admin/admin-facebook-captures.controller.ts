import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Query, Req, ServiceUnavailableException } from "@nestjs/common";
import { parseAdminFacebookCaptureCommandResult, parseAdminFacebookCaptureDetail, parseAdminFacebookCaptureQueue, parseAdminFacebookCaptureQueueQuery, parseAdminFacebookCaptureRecaptureRequest, type RequestPrincipal } from "@xuyenviet/contracts";
import { AdminFacebookCapturePolicyError, recaptureAdminFacebookCapture, rerunAdminFacebookCaptureIngestion, type AdminFacebookCapturePort } from "@xuyenviet/domain";
import { AllowsAdminBrowserSession, RequiresAdminCapability } from "../auth/admin-capability.decorator";

export const ADMIN_FACEBOOK_CAPTURE_PORT = Symbol("ADMIN_FACEBOOK_CAPTURE_PORT");
@Controller("v1/admin/knowledge/facebook-captures")
@RequiresAdminCapability("admin.knowledge.write")
@AllowsAdminBrowserSession()
export class AdminFacebookCapturesController {
  constructor(@Inject(ADMIN_FACEBOOK_CAPTURE_PORT) private readonly captures: AdminFacebookCapturePort) {}
  @Get()
  async list(@Query() query: Record<string, unknown>) { const input = parseAdminFacebookCaptureQueueQuery(query); if (!input) throw invalid(); try { const result = parseAdminFacebookCaptureQueue(await this.captures.list(input)); if (!result) throw new Error("unsafe projection"); return result; } catch { throw unavailable(); } }
  @Get(":reviewId")
  async detail(@Param("reviewId") reviewId: string) { if (!validId(reviewId)) throw invalid(); try { const result = await this.captures.detail(reviewId); if (!result) throw invalid(); const parsed = parseAdminFacebookCaptureDetail(result); if (!parsed) throw new Error("unsafe projection"); return parsed; } catch (error) { if (error instanceof BadRequestException) throw error; throw unavailable(); } }
  @Post(":reviewId/recapture")
  async recapture(@Param("reviewId") reviewId: string, @Body() body: unknown, @Req() request: { principal?: RequestPrincipal }) { const input = parseAdminFacebookCaptureRecaptureRequest(body); if (!validId(reviewId) || !input || !request.principal) throw invalid(); try { const result = parseAdminFacebookCaptureCommandResult(await recaptureAdminFacebookCapture(this.captures, request.principal, reviewId, input.reason)); if (!result) throw new Error("unsafe projection"); return result; } catch (error) { if (error instanceof AdminFacebookCapturePolicyError) throw invalid(); throw unavailable(); } }
  @Post(":reviewId/ingestion-rerun")
  async rerun(@Param("reviewId") reviewId: string, @Req() request: { principal?: RequestPrincipal }) { if (!validId(reviewId) || !request.principal) throw invalid(); try { const result = parseAdminFacebookCaptureCommandResult(await rerunAdminFacebookCaptureIngestion(this.captures, request.principal, reviewId)); if (!result) throw new Error("unsafe projection"); return result; } catch (error) { if (error instanceof AdminFacebookCapturePolicyError) throw invalid(); throw unavailable(); } }
}
function validId(value: string) { return value.trim() === value && value.length > 0 && value.length <= 128; }
function invalid() { return new BadRequestException({ code: "validation_error" }); }
function unavailable() { return new ServiceUnavailableException({ code: "internal_error" }); }
