import { SetMetadata } from "@nestjs/common";

import type { AdminCapability } from "@xuyenviet/contracts";

export const ADMIN_CAPABILITY = "admin-capability";
export const RequiresAdminCapability = (capability: AdminCapability) => SetMetadata(ADMIN_CAPABILITY, capability);
/** Explicit opt-in prevents a shared capability from widening legacy BFF routes. */
export const ADMIN_BROWSER_SESSION = "admin-browser-session";
export const AllowsAdminBrowserSession = () => SetMetadata(ADMIN_BROWSER_SESSION, true);
