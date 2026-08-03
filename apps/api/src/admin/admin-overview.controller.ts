import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";

import { parseAdminOverview } from "@xuyenviet/contracts";
import type { AdminOverviewPort } from "@xuyenviet/domain";

import { AllowsAdminBrowserSession, RequiresAdminCapability } from "../auth/admin-capability.decorator";

export const ADMIN_OVERVIEW_PORT = Symbol("ADMIN_OVERVIEW_PORT");

@Controller("v1/admin/overview")
@RequiresAdminCapability("admin.workspace.read")
@AllowsAdminBrowserSession()
export class AdminOverviewController {
  constructor(@Inject(ADMIN_OVERVIEW_PORT) private readonly overview: AdminOverviewPort) {}

  @Get()
  async get() {
    try {
      const overview = parseAdminOverview(await this.overview.getOverview());
      if (!overview) throw new Error("Invalid admin overview projection");
      return overview;
    } catch {
      throw new ServiceUnavailableException({ code: "internal_error" });
    }
  }
}
