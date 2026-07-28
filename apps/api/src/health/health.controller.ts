import { Controller, Get, HttpException, HttpStatus, Inject } from "@nestjs/common";

import type { HealthResponse } from "@xuyenviet/contracts";
import type { ReleaseSchemaVersionRepository } from "@xuyenviet/database";

import { PublicRoute } from "../auth/public-route.decorator";
import { API_CONFIGURATION_VALID, isApiReady, RELEASE_SCHEMA_VERSION_REPOSITORY } from "../release-schema";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(RELEASE_SCHEMA_VERSION_REPOSITORY) private readonly schemaVersions: ReleaseSchemaVersionRepository,
    @Inject(API_CONFIGURATION_VALID) private readonly configValid: boolean,
  ) {}

  @Get("live")
  @PublicRoute()
  live(): HealthResponse { return { status: "ok" }; }

  @Get("ready")
  @PublicRoute()
  async ready(): Promise<HealthResponse> {
    if (!await isApiReady({ configValid: this.configValid, repository: this.schemaVersions })) {
      throw new HttpException({ code: "internal_error" }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: "ok" };
  }
}
