import "reflect-metadata";

import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import type { BffCredentialConfig } from "@xuyenviet/config";
import type { ApiIdentityRepository } from "@xuyenviet/database";

import { API_IDENTITY_REPOSITORY, BFF_CREDENTIAL_CONFIG, ResourceServerGuard } from "./auth/resource-server.guard";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { SafeValidationPipe } from "./common/safe-validation.pipe";
import { SafeApiExceptionFilter } from "./safe-api-exception.filter";

export function createApiModule(config: BffCredentialConfig, identities: ApiIdentityRepository) {
  @Module({
    providers: [
      { provide: BFF_CREDENTIAL_CONFIG, useValue: config },
      { provide: API_IDENTITY_REPOSITORY, useValue: identities },
      ResourceServerGuard,
      RequestIdMiddleware,
      SafeValidationPipe,
      { provide: APP_GUARD, useExisting: ResourceServerGuard },
      { provide: APP_PIPE, useClass: SafeValidationPipe },
      { provide: APP_FILTER, useClass: SafeApiExceptionFilter },
    ],
    exports: [BFF_CREDENTIAL_CONFIG, API_IDENTITY_REPOSITORY, ResourceServerGuard],
  })
  class ApiModule implements NestModule {
    configure(consumer: MiddlewareConsumer) { consumer.apply(RequestIdMiddleware).forRoutes("*"); }
  }
  return ApiModule;
}
