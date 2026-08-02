import { afterAll } from "vitest";

import { closeTestDatabase } from "./helpers/db";
import "./unit-setup";

const applicationDatabaseUrl = process.env.DATABASE_URL;

process.env.TEST_APPLICATION_DATABASE_URL = applicationDatabaseUrl;
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

afterAll(async () => {
  await closeTestDatabase();
});
