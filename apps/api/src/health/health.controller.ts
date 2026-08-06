import { Controller, Get } from "@nestjs/common";

import type { HealthResponse } from "@xuyenviet/contracts";
import { PublicRoute } from "../auth/public-route.decorator";

@Controller("health")
export class HealthController {
  @Get("live")
  @PublicRoute()
  live(): HealthResponse { return { status: "ok" }; }

  @Get("ready")
  @PublicRoute()
  ready(): HealthResponse { return { status: "ok" }; }
}
