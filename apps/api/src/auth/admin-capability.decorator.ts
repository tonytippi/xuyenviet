import { SetMetadata } from "@nestjs/common";

import type { AdminCapability } from "@xuyenviet/contracts";

export const ADMIN_CAPABILITY = "admin-capability";
export const RequiresAdminCapability = (capability: AdminCapability) => SetMetadata(ADMIN_CAPABILITY, capability);
