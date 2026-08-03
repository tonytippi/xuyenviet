import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, ServiceUnavailableException } from "@nestjs/common";
import { parseAdminKnowledgeIntake, parseAdminKnowledgeSeedBatchRequest, parseAdminKnowledgeSeedBatchResponse, parseAdminKnowledgeSourceRemovalRequest, parseAdminKnowledgeSourceRemovalResponse, type RequestPrincipal } from "@xuyenviet/contracts";
import { AdminKnowledgeIntakePolicyError, removeAdminKnowledgeSource, submitAdminKnowledgeSeedBatch, type AdminKnowledgeIntakePort } from "@xuyenviet/domain";
import { AllowsAdminBrowserSession, RequiresAdminCapability } from "../auth/admin-capability.decorator";

export const ADMIN_KNOWLEDGE_INTAKE_PORT = Symbol("ADMIN_KNOWLEDGE_INTAKE_PORT");

@Controller("v1/admin/knowledge")
@RequiresAdminCapability("admin.knowledge.write")
@AllowsAdminBrowserSession()
export class AdminKnowledgeIntakeController {
  constructor(@Inject(ADMIN_KNOWLEDGE_INTAKE_PORT) private readonly intake: AdminKnowledgeIntakePort) {}

  @Get("intake")
  async list() { try { const result = parseAdminKnowledgeIntake(await this.intake.list()); if (!result) throw new Error("unsafe projection"); return result; } catch { throw unavailable(); } }

  @Post("seed-batches")
  @HttpCode(HttpStatus.CREATED)
  async submit(@Body() body: unknown, @Req() request: { principal?: RequestPrincipal }) {
    const input = parseAdminKnowledgeSeedBatchRequest(body); if (!input || !request.principal) throw invalid();
    try { const result = parseAdminKnowledgeSeedBatchResponse(await submitAdminKnowledgeSeedBatch(this.intake, request.principal, input)); if (!result) throw new Error("unsafe projection"); return result; } catch (error) { if (error instanceof AdminKnowledgeIntakePolicyError) throw invalid(); throw unavailable(); }
  }

  @Post("sources/:sourceId/removal")
  async remove(@Param("sourceId") sourceId: string, @Body() body: unknown, @Req() request: { principal?: RequestPrincipal }) {
    const input = parseAdminKnowledgeSourceRemovalRequest(body); if (!input || !request.principal) throw invalid();
    try { const result = parseAdminKnowledgeSourceRemovalResponse(await removeAdminKnowledgeSource(this.intake, request.principal, sourceId, input)); if (!result) throw new Error("unsafe projection"); return result; } catch (error) { if (error instanceof AdminKnowledgeIntakePolicyError) throw invalid(); throw unavailable(); }
  }
}
function invalid() { return new BadRequestException({ code: "validation_error" }); }
function unavailable() { return new ServiceUnavailableException({ code: "internal_error" }); }
