import "reflect-metadata";

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { NestFactory } from "@nestjs/core";

import { getBrowserAuthConfig } from "@xuyenviet/config";
import { createPostgresAdminAiModelCatalogPort, createPostgresAdminFacebookCapturePort, createPostgresAdminKnowledgeCoveragePort, createPostgresAdminKnowledgeIntakePort, createPostgresAdminKnowledgeReviewPort, createPostgresAdminOverviewPort, createPostgresAdminQualityDashboardPort, createPostgresAdminYoutubeCapturePort, createPostgresAiAskStreamExecutionPort, createPostgresApiIdentityRepository, createPostgresConversationSummaryRepository, createPostgresPlanningReadRepository, createPostgresReleaseSchemaVersionRepository, createPostgresTravelerCommandPort, createPostgresTravelerShellRepository, createPostgresTripProjectSidebarReadRepository, createPostgresTripRecommendationReadRepository, createPostgresUserRoleGovernancePort } from "@xuyenviet/database";
import { createAiAskStreamExecution } from "@xuyenviet/domain";

import { createApiModule } from "./app.module";
import { credentialedBrowserCors } from "./browser-cors";
import { readApiReleasePhasePolicy } from "./release-schema";

loadLocalEnvironment();

async function bootstrap() {
  const databaseUrl = required("DATABASE_URL");
  const aiAskExecution = createAiAskStreamExecution(createPostgresAiAskStreamExecutionPort(databaseUrl));
  const browserAuth = getBrowserAuthConfig();
  const app = await NestFactory.create(createApiModule(createPostgresApiIdentityRepository(databaseUrl, browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey), {
    conversationSummaries: createPostgresConversationSummaryRepository(databaseUrl),
    travelerShells: createPostgresTravelerShellRepository(),
    travelerCommands: createPostgresTravelerCommandPort(),
    planningReads: createPostgresPlanningReadRepository(),
    tripRecommendations: createPostgresTripRecommendationReadRepository(),
    tripProjectSidebarReads: createPostgresTripProjectSidebarReadRepository(),
    userRoleGovernance: createPostgresUserRoleGovernancePort(databaseUrl),
    adminAiModelCatalog: createPostgresAdminAiModelCatalogPort(databaseUrl),
    adminOverview: createPostgresAdminOverviewPort(),
    adminQuality: createPostgresAdminQualityDashboardPort(),
    adminKnowledgeIntake: createPostgresAdminKnowledgeIntakePort(),
    adminKnowledgeReview: createPostgresAdminKnowledgeReviewPort(),
    adminKnowledgeCoverage: createPostgresAdminKnowledgeCoveragePort(),
    adminFacebookCaptures: createPostgresAdminFacebookCapturePort(),
    adminYoutubeCaptures: createPostgresAdminYoutubeCapturePort(),
    schemaVersions: createPostgresReleaseSchemaVersionRepository(databaseUrl),
    releasePhasePolicy: readApiReleasePhasePolicy(),
    aiAskExecution,
    browserAuth,
  }));
  app.enableCors(credentialedBrowserCors(browserAuth.allowedOrigins));
  await app.listen(Number(process.env.PORT ?? 3001));
}

function loadLocalEnvironment() {
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  const environmentFile = resolve(sourceDirectory, "..", ".env.local");
  if (existsSync(environmentFile)) loadEnvFile(environmentFile);
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

void bootstrap();
