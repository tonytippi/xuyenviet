import { Controller, Get } from "@nestjs/common";

import { AllowsAdminBrowserSession, RequiresAdminCapability } from "../auth/admin-capability.decorator";

/** A non-disclosing direct-browser workspace admission check. */
@Controller("v1/admin/workspace")
@AllowsAdminBrowserSession()
export class AdminWorkspaceController {
  @Get()
  @RequiresAdminCapability("admin.workspace.read")
  bootstrap() { return { ready: true }; }
}
