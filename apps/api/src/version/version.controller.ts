import { Controller, Get } from "@nestjs/common";

import { conversationSummaryLimit, type ApiVersionResponse } from "@xuyenviet/contracts";

import { PublicRoute } from "../auth/public-route.decorator";

@Controller("v1")
export class VersionController {
  @Get("version")
  @PublicRoute()
  version(): ApiVersionResponse { return { version: "v1", conversationSummaryLimit }; }
}
