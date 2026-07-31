import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { parseBffCredentialConfig } from "@xuyenviet/config";
import { createPostgresAiAskStreamExecutionPort, createPostgresApiIdentityRepository, createPostgresConversationSummaryRepository, createPostgresPlanningReadRepository, createPostgresReleaseSchemaVersionRepository } from "@xuyenviet/database";
import { createAiAskStreamExecution } from "@xuyenviet/domain";

import { createApiModule } from "./app.module";
import { readApiReleasePhasePolicy } from "./release-schema";

async function bootstrap() {
  const config = parseBffCredentialConfig(JSON.parse(required("XV_BFF_CREDENTIAL_CONFIG")));
  const databaseUrl = required("DATABASE_URL");
  const aiAskExecution = createAiAskStreamExecution(createPostgresAiAskStreamExecutionPort(databaseUrl));
  const app = await NestFactory.create(createApiModule(config, createPostgresApiIdentityRepository(databaseUrl), {
    conversationSummaries: createPostgresConversationSummaryRepository(databaseUrl),
    planningReads: createPostgresPlanningReadRepository(),
    schemaVersions: createPostgresReleaseSchemaVersionRepository(databaseUrl),
    releasePhasePolicy: readApiReleasePhasePolicy(),
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
