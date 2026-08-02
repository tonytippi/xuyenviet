import { SetMetadata } from "@nestjs/common";

export const PUBLIC_ROUTE = "xuyenviet:public-route";
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);
