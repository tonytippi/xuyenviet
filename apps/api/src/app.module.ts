import "reflect-metadata";

import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import type { BffCredentialConfig, BrowserAuthConfig } from "@xuyenviet/config";
import { consoleOperationalTelemetrySink, type OperationalTelemetrySink } from "@xuyenviet/contracts";
import type { ApiIdentityRepository, ConversationSummaryRepository, ReleaseSchemaVersionRepository } from "@xuyenviet/database";
import type { PlanningReadRepository, UserRoleGovernancePort } from "@xuyenviet/domain";

import { API_IDENTITY_REPOSITORY, BFF_CREDENTIAL_CONFIG, ResourceServerGuard } from "./auth/resource-server.guard";
import { AdminCapabilityGuard } from "./auth/admin-capability.guard";
import { AdminIdentityController, ADMIN_IDENTITY_SERVICE_TOKEN } from "./auth/admin-identity.controller";
import { BrowserIdentityController } from "./auth/browser-identity.controller";
import { BROWSER_AUTH_CONFIG } from "./auth/browser-auth";
import { AdminWorkspaceController } from "./admin-workspace/admin-workspace.controller";
import { AdminUsersController, USER_ROLE_GOVERNANCE_PORT } from "./admin/admin-users.controller";
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

export function createApiModule(config: BffCredentialConfig, identities: ApiIdentityRepository, dependencies?: { conversationSummaries: ConversationSummaryRepository; planningReads?: PlanningReadRepository; userRoleGovernance?: UserRoleGovernancePort; schemaVersions: ReleaseSchemaVersionRepository; aiAskExecution?: AiAskStreamExecution; telemetry?: OperationalTelemetrySink; configValid?: boolean; releasePhasePolicy?: import("@xuyenviet/contracts").SchemaReleasePhasePolicy | null; adminIdentityServiceToken?: string; browserAuth?: BrowserAuthConfig }) {
  @Module({
    controllers: [...(dependencies ? [HealthController, VersionController, ConversationsController, OpenApiController, AdminIdentityController, BrowserIdentityController, ...(dependencies.aiAskExecution ? [AiAskController] : []), ...(dependencies.userRoleGovernance ? [AdminUsersController] : [])] : []), AdminWorkspaceController],
    providers: [
      { provide: BFF_CREDENTIAL_CONFIG, useValue: config },
       { provide: API_IDENTITY_REPOSITORY, useValue: identities },
        { provide: ADMIN_IDENTITY_SERVICE_TOKEN, useValue: dependencies?.adminIdentityServiceToken },
       { provide: BROWSER_AUTH_CONFIG, useValue: { config: dependencies?.browserAuth } },
      ...(dependencies ? [
         { provide: CONVERSATION_SUMMARY_REPOSITORY, useValue: dependencies.conversationSummaries },
         { provide: PLANNING_READ_REPOSITORY, useValue: dependencies.planningReads ?? unavailablePlanningReads },
         ...(dependencies.userRoleGovernance ? [{ provide: USER_ROLE_GOVERNANCE_PORT, useValue: dependencies.userRoleGovernance }] : []),
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
       { provide: APP_PIPE, useValue: new SafeValidationPipe() },
      { provide: APP_FILTER, useClass: SafeApiExceptionFilter },
    ],
    exports: [BFF_CREDENTIAL_CONFIG, API_IDENTITY_REPOSITORY, BROWSER_AUTH_CONFIG, ResourceServerGuard],
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
