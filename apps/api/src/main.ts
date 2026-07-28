import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { parseBffCredentialConfig } from "@xuyenviet/config";
import { createPostgresApiIdentityRepository } from "@xuyenviet/database";

import { createApiModule } from "./app.module";

async function bootstrap() {
  const config = parseBffCredentialConfig(JSON.parse(required("XV_BFF_CREDENTIAL_CONFIG")));
  const app = await NestFactory.create(createApiModule(config, createPostgresApiIdentityRepository(required("DATABASE_URL"))));
  await app.listen(Number(process.env.PORT ?? 3001));
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

void bootstrap();
