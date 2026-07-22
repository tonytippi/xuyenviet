import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { resetTestDatabase, testDb } from "./helpers/db";

const reservedId = "system-knowledge-pipeline";
const reservedEmail = "system-knowledge-pipeline@xuyenviet.invalid";

describe("system knowledge pipeline actor migration", () => {
  let migration: string;

  beforeEach(async () => {
    await resetTestDatabase();
    migration = await readFile("drizzle/migrations/0044_system_knowledge_pipeline_actor.sql", "utf8");
  });

  async function executeInIsolatedSchema(users: Array<{ id: string; email: string }>) {
    const schemaName = `migration_0044_${randomUUID().replaceAll("-", "")}`;
    return testDb.transaction(async (tx) => {
      await tx.execute(sql.raw(`create schema "${schemaName}"`));
      await tx.execute(sql.raw(`create table "${schemaName}".users (id text primary key, name text, email text unique not null)`));
      for (const user of users) await tx.execute(sql.raw(`insert into "${schemaName}".users (id, email) values ('${user.id}', '${user.email}')`));
      await tx.execute(sql.raw(`set local search_path to "${schemaName}"`));
      await tx.execute(sql.raw(migration));
      return tx.execute(sql`select id, email from users order by id`);
    });
  }

  test("creates the reserved actor and is idempotent only for that exact identity", async () => {
    await expect(executeInIsolatedSchema([])).resolves.toEqual([{ id: reservedId, email: reservedEmail }]);
    await expect(executeInIsolatedSchema([{ id: reservedId, email: reservedEmail }])).resolves.toEqual([{ id: reservedId, email: reservedEmail }]);
  });

  test.each([
    [[{ id: reservedId, email: "person@example.com" }]],
    [[{ id: "person", email: reservedEmail }]],
  ])("fails transactionally for a reserved identity collision", async (users) => {
    await expect(executeInIsolatedSchema(users)).rejects.toThrow("Reserved system knowledge pipeline identity collides");
  });
});
