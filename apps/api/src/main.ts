import "reflect-metadata";

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { NestFactory } from "@nestjs/core";

import { getBrowserAuthConfig, parseBffCredentialConfig } from "@xuyenviet/config";
import { createPostgresAiAskStreamExecutionPort, createPostgresApiIdentityRepository, createPostgresConversationSummaryRepository, createPostgresPlanningReadRepository, createPostgresReleaseSchemaVersionRepository, createPostgresTravelerShellRepository, createPostgresUserRoleGovernancePort } from "@xuyenviet/database";
import { createAiAskStreamExecution } from "@xuyenviet/domain";

import { createApiModule } from "./app.module";
import { credentialedBrowserCors } from "./browser-cors";
import { readApiReleasePhasePolicy } from "./release-schema";

loadLocalEnvironment();

async function bootstrap() {
  const config = parseBffCredentialConfig(JSON.parse(required("XV_BFF_CREDENTIAL_CONFIG")));
  const databaseUrl = required("DATABASE_URL");
  const aiAskExecution = createAiAskStreamExecution(createPostgresAiAskStreamExecutionPort(databaseUrl));
  const browserAuth = getBrowserAuthConfig();
  const app = await NestFactory.create(createApiModule(config, createPostgresApiIdentityRepository(databaseUrl, required("XV_ADMIN_SESSION_LOOKUP_KEY"), browserAuth.sessionLookupKey, browserAuth.oauthTransactionProtectionKey), {
    conversationSummaries: createPostgresConversationSummaryRepository(databaseUrl),
    travelerShells: createPostgresTravelerShellRepository(),
    planningReads: createPostgresPlanningReadRepository(),
    userRoleGovernance: createPostgresUserRoleGovernancePort(databaseUrl),
    schemaVersions: createPostgresReleaseSchemaVersionRepository(databaseUrl),
    releasePhasePolicy: readApiReleasePhasePolicy(),
    adminIdentityServiceToken: required("XV_ADMIN_IDENTITY_HANDOFF_SERVICE_TOKEN"),
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
