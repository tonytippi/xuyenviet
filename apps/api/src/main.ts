import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { parseBffCredentialConfig } from "@xuyenviet/config";
import { createPostgresAiAskStreamExecutionPort, createPostgresApiIdentityRepository, createPostgresConversationSummaryRepository, createPostgresPlanningReadRepository, createPostgresReleaseSchemaVersionRepository, createPostgresUserRoleGovernancePort } from "@xuyenviet/database";
import { createAiAskStreamExecution } from "@xuyenviet/domain";

import { createApiModule } from "./app.module";
import { readApiReleasePhasePolicy } from "./release-schema";

async function bootstrap() {
  const config = parseBffCredentialConfig(JSON.parse(required("XV_BFF_CREDENTIAL_CONFIG")));
  const databaseUrl = required("DATABASE_URL");
  const aiAskExecution = createAiAskStreamExecution(createPostgresAiAskStreamExecutionPort(databaseUrl));
  const app = await NestFactory.create(createApiModule(config, createPostgresApiIdentityRepository(databaseUrl, required("XV_ADMIN_SESSION_LOOKUP_KEY")), {
    conversationSummaries: createPostgresConversationSummaryRepository(databaseUrl),
    planningReads: createPostgresPlanningReadRepository(),
    userRoleGovernance: createPostgresUserRoleGovernancePort(databaseUrl),
    schemaVersions: createPostgresReleaseSchemaVersionRepository(databaseUrl),
    releasePhasePolicy: readApiReleasePhasePolicy(),
    adminIdentityServiceToken: required("XV_ADMIN_IDENTITY_HANDOFF_SERVICE_TOKEN"),
    aiAskExecution,
  }));
  await app.listen(Number(process.env.PORT ?? 3001));
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

void bootstrap();
