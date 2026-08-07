import "reflect-metadata";

import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import type { BrowserAuthConfig } from "@xuyenviet/config";
import { consoleOperationalTelemetrySink, type OperationalTelemetrySink } from "@xuyenviet/contracts";
import type { ApiIdentityRepository, ConversationSummaryRepository, TravelerShellRepository } from "@xuyenviet/database";
import type { AdminAiModelCatalogPort, AdminFacebookCapturePort, AdminKnowledgeCoveragePort, AdminKnowledgeIntakePort, AdminKnowledgeReviewPort, AdminOverviewPort, AdminQualityPort, AdminYoutubeCapturePort, AdminYoutubeDiscoveryPort, PlanningReadRepository, TravelerCommandPort, TripProjectSidebarReadRepository, TripRecommendationReadRepository, UserRoleGovernancePort } from "@xuyenviet/domain";

import { API_IDENTITY_REPOSITORY, ResourceServerGuard } from "./auth/resource-server.guard";
import { AdminCapabilityGuard } from "./auth/admin-capability.guard";
import { BrowserIdentityController } from "./auth/browser-identity.controller";
import { BROWSER_AUTH_CONFIG } from "./auth/browser-auth";
import { AdminWorkspaceController } from "./admin-workspace/admin-workspace.controller";
import { AdminUsersController, USER_ROLE_GOVERNANCE_PORT } from "./admin/admin-users.controller";
import { AdminAiModelsController, ADMIN_AI_MODEL_CATALOG_PORT } from "./admin/admin-ai-models.controller";
import { AdminOverviewController, ADMIN_OVERVIEW_PORT } from "./admin/admin-overview.controller";
import { AdminKnowledgeIntakeController, ADMIN_KNOWLEDGE_INTAKE_PORT } from "./admin/admin-knowledge-intake.controller";
import { AdminFacebookCapturesController, ADMIN_FACEBOOK_CAPTURE_PORT } from "./admin/admin-facebook-captures.controller";
import { AdminYoutubeCapturesController, ADMIN_YOUTUBE_CAPTURE_PORT } from "./admin/admin-youtube-captures.controller";
import { AdminKnowledgeReviewController, ADMIN_KNOWLEDGE_REVIEW_PORT } from "./admin/admin-knowledge-review.controller";
import { AdminKnowledgeCoverageController, ADMIN_KNOWLEDGE_COVERAGE_PORT } from "./admin/admin-knowledge-coverage.controller";
import { AdminQualityController, ADMIN_QUALITY_PORT } from "./admin/admin-quality.controller";
import { AdminYoutubeDiscoveryController, ADMIN_YOUTUBE_DISCOVERY_PORT } from "./admin/admin-youtube-discovery.controller";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { SafeValidationPipe } from "./common/safe-validation.pipe";
import { SafeApiExceptionFilter } from "./safe-api-exception.filter";
import { ConversationsController, CONVERSATION_SUMMARY_REPOSITORY, PLANNING_READ_REPOSITORY, TRAVELER_SHELL_REPOSITORY, TRIP_PROJECT_SIDEBAR_READ_REPOSITORY, TRIP_RECOMMENDATION_READ_REPOSITORY } from "./conversations/conversations.controller";
import { TravelerCommandsController, TRAVELER_COMMAND_PORT } from "./conversations/traveler-commands.controller";
import { HealthController } from "./health/health.controller";
import { OpenApiController } from "./openapi.controller";
import { VersionController } from "./version/version.controller";
import { AiAskController, AI_ASK_STREAM_EXECUTION, OPERATIONAL_TELEMETRY_SINK } from "./ai-ask/ai-ask.controller";
import type { AiAskStreamExecution } from "@xuyenviet/domain";

export function createApiModule(identities: ApiIdentityRepository, dependencies?: { conversationSummaries: ConversationSummaryRepository; travelerShells?: TravelerShellRepository; planningReads?: PlanningReadRepository; tripRecommendations?: TripRecommendationReadRepository; tripProjectSidebarReads?: TripProjectSidebarReadRepository; travelerCommands?: TravelerCommandPort; userRoleGovernance?: UserRoleGovernancePort; adminAiModelCatalog?: AdminAiModelCatalogPort; adminOverview?: AdminOverviewPort; adminQuality?: AdminQualityPort; adminKnowledgeIntake?: AdminKnowledgeIntakePort; adminKnowledgeReview?: AdminKnowledgeReviewPort; adminKnowledgeCoverage?: AdminKnowledgeCoveragePort; adminFacebookCaptures?: AdminFacebookCapturePort; adminYoutubeCaptures?: AdminYoutubeCapturePort; adminYoutubeDiscovery?: AdminYoutubeDiscoveryPort; aiAskExecution?: AiAskStreamExecution; telemetry?: OperationalTelemetrySink; browserAuth?: BrowserAuthConfig }) {
  @Module({
     controllers: [...(dependencies ? [HealthController, VersionController, ConversationsController, OpenApiController, BrowserIdentityController, ...(dependencies.travelerCommands ? [TravelerCommandsController] : []), ...(dependencies.adminYoutubeDiscovery ? [AdminYoutubeDiscoveryController] : []), ...(dependencies.aiAskExecution ? [AiAskController] : []), ...(dependencies.userRoleGovernance ? [AdminUsersController] : []), ...(dependencies.adminAiModelCatalog ? [AdminAiModelsController] : []), ...(dependencies.adminOverview ? [AdminOverviewController] : []), ...(dependencies.adminQuality ? [AdminQualityController] : []), ...(dependencies.adminKnowledgeIntake ? [AdminKnowledgeIntakeController] : []), ...(dependencies.adminKnowledgeReview ? [AdminKnowledgeReviewController] : []), ...(dependencies.adminKnowledgeCoverage ? [AdminKnowledgeCoverageController] : []), ...(dependencies.adminFacebookCaptures ? [AdminFacebookCapturesController] : []), ...(dependencies.adminYoutubeCaptures ? [AdminYoutubeCapturesController] : [])] : []), AdminWorkspaceController],
    providers: [
        { provide: API_IDENTITY_REPOSITORY, useValue: identities },
       { provide: BROWSER_AUTH_CONFIG, useValue: { config: dependencies?.browserAuth } },
      ...(dependencies ? [
         { provide: CONVERSATION_SUMMARY_REPOSITORY, useValue: dependencies.conversationSummaries },
          { provide: PLANNING_READ_REPOSITORY, useValue: dependencies.planningReads ?? unavailablePlanningReads },
           { provide: TRAVELER_SHELL_REPOSITORY, useValue: dependencies.travelerShells ?? unavailableTravelerShells },
            { provide: TRIP_RECOMMENDATION_READ_REPOSITORY, useValue: dependencies.tripRecommendations ?? unavailableTripRecommendations },
            { provide: TRIP_PROJECT_SIDEBAR_READ_REPOSITORY, useValue: dependencies.tripProjectSidebarReads ?? unavailableTripProjectSidebarReads },
          ...(dependencies.travelerCommands ? [{ provide: TRAVELER_COMMAND_PORT, useValue: dependencies.travelerCommands }] : []),
          ...(dependencies.userRoleGovernance ? [{ provide: USER_ROLE_GOVERNANCE_PORT, useValue: dependencies.userRoleGovernance }] : []),
           ...(dependencies.adminAiModelCatalog ? [{ provide: ADMIN_AI_MODEL_CATALOG_PORT, useValue: dependencies.adminAiModelCatalog }] : []),
             ...(dependencies.adminOverview ? [{ provide: ADMIN_OVERVIEW_PORT, useValue: dependencies.adminOverview }] : []),
             ...(dependencies.adminQuality ? [{ provide: ADMIN_QUALITY_PORT, useValue: dependencies.adminQuality }] : []),
               ...(dependencies.adminKnowledgeIntake ? [{ provide: ADMIN_KNOWLEDGE_INTAKE_PORT, useValue: dependencies.adminKnowledgeIntake }] : []),
                ...(dependencies.adminKnowledgeReview ? [{ provide: ADMIN_KNOWLEDGE_REVIEW_PORT, useValue: dependencies.adminKnowledgeReview }] : []),
                ...(dependencies.adminKnowledgeCoverage ? [{ provide: ADMIN_KNOWLEDGE_COVERAGE_PORT, useValue: dependencies.adminKnowledgeCoverage }] : []),
              ...(dependencies.adminFacebookCaptures ? [{ provide: ADMIN_FACEBOOK_CAPTURE_PORT, useValue: dependencies.adminFacebookCaptures }] : []),
               ...(dependencies.adminYoutubeCaptures ? [{ provide: ADMIN_YOUTUBE_CAPTURE_PORT, useValue: dependencies.adminYoutubeCaptures }] : []),
               ...(dependencies.adminYoutubeDiscovery ? [{ provide: ADMIN_YOUTUBE_DISCOVERY_PORT, useValue: dependencies.adminYoutubeDiscovery }] : []),
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
    exports: [API_IDENTITY_REPOSITORY, BROWSER_AUTH_CONFIG, ResourceServerGuard],
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
const unavailableTravelerShells: TravelerShellRepository = { async loadOwnedTravelerShell() { return { conversation: null, tripProject: null, workspace: null }; } };
const unavailableTripRecommendations: TripRecommendationReadRepository = { async loadOwnedTripRecommendations() { return { tripCreationRecommendation: { kind: "none" }, tripContextRecommendation: { kind: "none" } }; } };
const unavailableTripProjectSidebarReads: TripProjectSidebarReadRepository = { async listOwnedTripProjectSidebarSummaries() { return []; } };
