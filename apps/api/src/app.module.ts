import "reflect-metadata";

import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import type { BffCredentialConfig } from "@xuyenviet/config";
import { consoleOperationalTelemetrySink, type OperationalTelemetrySink } from "@xuyenviet/contracts";
import type { ApiIdentityRepository, ConversationSummaryRepository, ReleaseSchemaVersionRepository } from "@xuyenviet/database";
import type { PlanningReadRepository } from "@xuyenviet/domain";

import { API_IDENTITY_REPOSITORY, BFF_CREDENTIAL_CONFIG, ResourceServerGuard } from "./auth/resource-server.guard";
import { AdminCapabilityGuard } from "./auth/admin-capability.guard";
import { AdminIdentityController, ADMIN_IDENTITY_SERVICE_TOKEN } from "./auth/admin-identity.controller";
import { AdminWorkspaceController } from "./admin-workspace/admin-workspace.controller";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { SafeValidationPipe } from "./common/safe-validation.pipe";
import { SafeApiExceptionFilter } from "./safe-api-exception.filter";
import { ConversationsController, CONVERSATION_SUMMARY_REPOSITORY, PLANNING_READ_REPOSITORY } from "./conversations/conversations.controller";
import { HealthController } from "./health/health.controller";
import { OpenApiController } from "./openapi.controller";
import { API_CONFIGURATION_VALID, API_RELEASE_PHASE_POLICY, RELEASE_SCHEMA_VERSION_REPOSITORY } from "./release-schema";
import { VersionController } from "./version/version.controller";
import { AiAskController, AI_ASK_STREAM_EXECUTION, OPERATIONAL_TELEMETRY_SINK } from "./ai-ask/ai-ask.controller";
import type { AiAskStreamExecution } from "@xuyenviet/domain";

export function createApiModule(config: BffCredentialConfig, identities: ApiIdentityRepository, dependencies?: { conversationSummaries: ConversationSummaryRepository; planningReads?: PlanningReadRepository; schemaVersions: ReleaseSchemaVersionRepository; aiAskExecution?: AiAskStreamExecution; telemetry?: OperationalTelemetrySink; configValid?: boolean; releasePhasePolicy?: import("@xuyenviet/contracts").SchemaReleasePhasePolicy | null; adminIdentityServiceToken?: string }) {
  @Module({
    controllers: [...(dependencies ? [HealthController, VersionController, ConversationsController, OpenApiController, AdminIdentityController, ...(dependencies.aiAskExecution ? [AiAskController] : [])] : []), AdminWorkspaceController],
    providers: [
      { provide: BFF_CREDENTIAL_CONFIG, useValue: config },
       { provide: API_IDENTITY_REPOSITORY, useValue: identities },
       { provide: ADMIN_IDENTITY_SERVICE_TOKEN, useValue: dependencies?.adminIdentityServiceToken },
      ...(dependencies ? [
         { provide: CONVERSATION_SUMMARY_REPOSITORY, useValue: dependencies.conversationSummaries },
         { provide: PLANNING_READ_REPOSITORY, useValue: dependencies.planningReads ?? unavailablePlanningReads },
        { provide: RELEASE_SCHEMA_VERSION_REPOSITORY, useValue: dependencies.schemaVersions },
         { provide: API_CONFIGURATION_VALID, useValue: dependencies.configValid ?? true },
         { provide: API_RELEASE_PHASE_POLICY, useValue: dependencies.releasePhasePolicy },
         { provide: OPERATIONAL_TELEMETRY_SINK, useValue: dependencies.telemetry ?? consoleOperationalTelemetrySink },
        ...(dependencies.aiAskExecution ? [{ provide: AI_ASK_STREAM_EXECUTION, useValue: dependencies.aiAskExecution }] : []),
      ] : []),
       ResourceServerGuard,
       AdminCapabilityGuard,
      RequestIdMiddleware,
      SafeValidationPipe,
       { provide: APP_GUARD, useExisting: ResourceServerGuard },
       { provide: APP_GUARD, useExisting: AdminCapabilityGuard },
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

const unavailablePlanningReads: PlanningReadRepository = {
  async loadOwnedPlanningContext() { return null; },
  async loadOwnedAnswerDetail() { return null; },
};
