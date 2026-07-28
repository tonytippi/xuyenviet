import "reflect-metadata";

import { Module } from "@nestjs/common";
import type { BffCredentialConfig } from "@xuyenviet/config";
import type { ApiIdentityRepository } from "@xuyenviet/database";

import { API_IDENTITY_REPOSITORY, BFF_CREDENTIAL_CONFIG, ResourceServerGuard } from "./auth/resource-server.guard";

export function createApiModule(config: BffCredentialConfig, identities: ApiIdentityRepository) {
  @Module({
    providers: [
      { provide: BFF_CREDENTIAL_CONFIG, useValue: config },
      { provide: API_IDENTITY_REPOSITORY, useValue: identities },
      ResourceServerGuard,
    ],
    exports: [BFF_CREDENTIAL_CONFIG, API_IDENTITY_REPOSITORY, ResourceServerGuard],
  })
  class ApiModule {}
  return ApiModule;
}
