import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Req, ServiceUnavailableException } from "@nestjs/common";

import { parseAdminAiGatewayModelInput, parseAdminAiPurposeAssignment, type AdminAiGatewayModelInput, type AdminAiGatewayModelUpdate, type AdminAiPurposeAssignment, type RequestPrincipal } from "@xuyenviet/contracts";
import { archiveAdminAiGatewayModel, assignAdminAiPurpose, createAdminAiGatewayModel, updateAdminAiGatewayModel, type AdminAiModelCatalogPort, AdminAiModelCatalogPolicyError } from "@xuyenviet/domain";

import { AllowsAdminBrowserSession, RequiresAdminCapability } from "../auth/admin-capability.decorator";

export const ADMIN_AI_MODEL_CATALOG_PORT = Symbol("ADMIN_AI_MODEL_CATALOG_PORT");

@Controller("v1/admin/ai-models")
@RequiresAdminCapability("admin.ai-model-catalog.write")
@AllowsAdminBrowserSession()
export class AdminAiModelsController {
  constructor(@Inject(ADMIN_AI_MODEL_CATALOG_PORT) private readonly catalog: AdminAiModelCatalogPort) {}

  @Get()
  async list() { try { return await this.catalog.list(); } catch { throw unavailable(); } }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @Req() request: { principal?: RequestPrincipal }) { return this.run(request.principal, parseAdminAiGatewayModelInput(body) as AdminAiGatewayModelInput | null, (principal, input) => createAdminAiGatewayModel(this.catalog, principal, input)); }

  @Put(":id")
  async update(@Param("id") id: string, @Body() body: unknown, @Req() request: { principal?: RequestPrincipal }) { return this.run(request.principal, parseAdminAiGatewayModelInput(body, true) as AdminAiGatewayModelUpdate | null, (principal, input) => updateAdminAiGatewayModel(this.catalog, principal, id, input)); }

  @Post("assignments")
  async assign(@Body() body: unknown, @Req() request: { principal?: RequestPrincipal }) { return this.run(request.principal, parseAdminAiPurposeAssignment(body), (principal, input) => assignAdminAiPurpose(this.catalog, principal, input as AdminAiPurposeAssignment)); }

  @Post(":id/archive")
  async archive(@Param("id") id: string, @Req() request: { principal?: RequestPrincipal }) { return this.run(request.principal, {}, (principal) => archiveAdminAiGatewayModel(this.catalog, principal, id)); }

  private async run<T>(principal: RequestPrincipal | undefined, input: T | null, operation: (principal: RequestPrincipal, input: T) => Promise<unknown>) {
    if (!principal) throw unavailable();
    if (input === null) throw invalid();
    try { return await operation(principal, input); } catch (error) { if (error instanceof AdminAiModelCatalogPolicyError) throw invalid(); throw unavailable(); }
  }
}

function invalid() { return new BadRequestException({ code: "validation_error" }); }
function unavailable() { return new ServiceUnavailableException({ code: "internal_error" }); }
