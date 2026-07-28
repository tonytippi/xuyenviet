import "reflect-metadata";

import { Controller, Get, Module, UseGuards } from "@nestjs/common";

import type { RequestPrincipal } from "@xuyenviet/contracts";
import type { BffCredentialConfig } from "@xuyenviet/config";
import type { ApiIdentityRepository } from "@xuyenviet/database";

import { Principal } from "./auth/principal.decorator";
import { API_IDENTITY_REPOSITORY, BFF_CREDENTIAL_CONFIG, ResourceServerGuard } from "./auth/resource-server.guard";

@Controller("_identity-test")
class IdentityTestController {
  calls = 0;

  @Get()
  @UseGuards(ResourceServerGuard)
  getPrincipal(@Principal() principal: RequestPrincipal) {
    this.calls += 1;
    return { userId: principal.userId };
  }
}

export function createApiModule(config: BffCredentialConfig, identities: ApiIdentityRepository) {
  @Module({
    controllers: [IdentityTestController],
    providers: [
      { provide: BFF_CREDENTIAL_CONFIG, useValue: config },
      { provide: API_IDENTITY_REPOSITORY, useValue: identities },
      ResourceServerGuard,
    ],
  })
  class ApiModule {}
  return ApiModule;
}

export { IdentityTestController };
