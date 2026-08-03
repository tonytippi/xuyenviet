import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, ServiceUnavailableException } from "@nestjs/common";
import { parseAdminKnowledgeCoverage, parseAdminKnowledgeSamplingPolicySealResult } from "@xuyenviet/contracts";
import type { AdminKnowledgeCoveragePort } from "@xuyenviet/domain";
import { AllowsAdminBrowserSession, RequiresAdminCapability } from "../auth/admin-capability.decorator";

export const ADMIN_KNOWLEDGE_COVERAGE_PORT = Symbol("ADMIN_KNOWLEDGE_COVERAGE_PORT");

@Controller("v1/admin/knowledge")
@RequiresAdminCapability("admin.knowledge.write")
@AllowsAdminBrowserSession()
export class AdminKnowledgeCoverageController {
  constructor(@Inject(ADMIN_KNOWLEDGE_COVERAGE_PORT) private readonly coverage: AdminKnowledgeCoveragePort) {}

  @Get("coverage")
  async get() {
    try {
      const result = parseAdminKnowledgeCoverage(await this.coverage.getCoverage());
      if (!result) throw new Error("Invalid coverage projection");
      return result;
    } catch {
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
  }

  @Post("sampling-policies/:policyId/seal")
  @HttpCode(HttpStatus.OK)
  async seal(@Param("policyId") policyId: string) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(policyId)) throw new BadRequestException({ code: "validation_error" });
    try {
      const result = parseAdminKnowledgeSamplingPolicySealResult(await this.coverage.sealClosedSamplingPolicy(policyId));
      if (!result) throw new Error("Invalid seal result");
      return result;
    } catch {
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
  }
}
