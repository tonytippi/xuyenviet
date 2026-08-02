import { Controller, Get } from "@nestjs/common";

import { RequiresAdminCapability } from "../auth/admin-capability.decorator";

/** A non-disclosing BFF bootstrap capability; legacy admin capabilities remain untouched. */
@Controller("v1/admin/workspace")
export class AdminWorkspaceController {
  @Get()
  @RequiresAdminCapability("admin.workspace.read")
  bootstrap() { return { ready: true }; }
}
