import { BadRequestException, Controller, Get, Inject, Query, ServiceUnavailableException } from "@nestjs/common";
import { parseAdminQualityDashboard, parseAdminQualityQuery } from "@xuyenviet/contracts";
import type { AdminQualityPort } from "@xuyenviet/domain";
import { AllowsAdminBrowserSession, RequiresAdminCapability } from "../auth/admin-capability.decorator";

export const ADMIN_QUALITY_PORT = Symbol("ADMIN_QUALITY_PORT");
@Controller("v1/admin/quality")
@RequiresAdminCapability("admin.workspace.read")
@AllowsAdminBrowserSession()
export class AdminQualityController {
  constructor(@Inject(ADMIN_QUALITY_PORT) private readonly quality: AdminQualityPort) {}
  @Get()
  async get(@Query() query: Record<string, unknown>) {
    const input = parseAdminQualityQuery(query);
    if (!input) throw new BadRequestException({ code: "validation_error" });
    try {
      const result = parseAdminQualityDashboard(await this.quality.getQuality(input));
      if (!result) throw new Error("Invalid quality projection");
      return result;
    } catch { throw new ServiceUnavailableException({ code: "internal_error" }); }
  }
}
