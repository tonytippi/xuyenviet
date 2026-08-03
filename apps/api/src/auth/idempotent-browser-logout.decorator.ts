import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_BROWSER_LOGOUT = "xuyenviet:idempotent-browser-logout";
export const IdempotentBrowserLogout = () => SetMetadata(IDEMPOTENT_BROWSER_LOGOUT, true);
