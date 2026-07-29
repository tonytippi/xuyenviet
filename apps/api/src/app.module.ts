import "reflect-metadata";

import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import type { BffCredentialConfig } from "@xuyenviet/config";
import type { ApiIdentityRepository, ConversationSummaryRepository, ReleaseSchemaVersionRepository } from "@xuyenviet/database";

import { API_IDENTITY_REPOSITORY, BFF_CREDENTIAL_CONFIG, ResourceServerGuard } from "./auth/resource-server.guard";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { SafeValidationPipe } from "./common/safe-validation.pipe";
import { SafeApiExceptionFilter } from "./safe-api-exception.filter";
import { ConversationsController, CONVERSATION_SUMMARY_REPOSITORY } from "./conversations/conversations.controller";
import { HealthController } from "./health/health.controller";
import { OpenApiController } from "./openapi.controller";
import { API_CONFIGURATION_VALID, RELEASE_SCHEMA_VERSION_REPOSITORY } from "./release-schema";
import { VersionController } from "./version/version.controller";
import { AiAskController, AI_ASK_STREAM_EXECUTION } from "./ai-ask/ai-ask.controller";
import type { AiAskStreamExecution } from "@xuyenviet/domain";

export function createApiModule(config: BffCredentialConfig, identities: ApiIdentityRepository, dependencies?: { conversationSummaries: ConversationSummaryRepository; schemaVersions: ReleaseSchemaVersionRepository; aiAskExecution?: AiAskStreamExecution; configValid?: boolean }) {
  @Module({
    controllers: dependencies ? [HealthController, VersionController, ConversationsController, OpenApiController, ...(dependencies.aiAskExecution ? [AiAskController] : [])] : [],
    providers: [
      { provide: BFF_CREDENTIAL_CONFIG, useValue: config },
      { provide: API_IDENTITY_REPOSITORY, useValue: identities },
      ...(dependencies ? [
        { provide: CONVERSATION_SUMMARY_REPOSITORY, useValue: dependencies.conversationSummaries },
        { provide: RELEASE_SCHEMA_VERSION_REPOSITORY, useValue: dependencies.schemaVersions },
        { provide: API_CONFIGURATION_VALID, useValue: dependencies.configValid ?? true },
        ...(dependencies.aiAskExecution ? [{ provide: AI_ASK_STREAM_EXECUTION, useValue: dependencies.aiAskExecution }] : []),
      ] : []),
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
