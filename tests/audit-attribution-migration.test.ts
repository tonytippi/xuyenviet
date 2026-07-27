import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { resetTestDatabase, testDb } from "./helpers/db";

describe("audit attribution clean-break migration", () => {
  let migration: string;

  beforeEach(async () => {
    await resetTestDatabase();
    migration = await readFile("drizzle/migrations/0069_persist_audit_usage_attribution.sql", "utf8");
  });

  async function executeInIsolatedSchema(assertions: (database: Parameters<Parameters<typeof testDb.transaction>[0]>[0]) => Promise<void>) {
    const schemaName = `migration_0069_${randomUUID().replaceAll("-", "")}`;

    await testDb.transaction(async (transaction) => {
      await transaction.execute(sql.raw(`create schema "${schemaName}"`));
      await transaction.execute(sql.raw(`set local search_path to "${schemaName}"`));
      await transaction.execute(sql.raw(`create table users (id text primary key)`));
      await transaction.execute(sql.raw(`create table trip_projects (id text primary key)`));
      await transaction.execute(sql.raw(`create table audit_events (id text primary key, actor_user_id text not null references users(id), actor_email text not null, actor_class text not null default 'user', actor_system text, operation text not null, target_type text not null, target_id text, before_summary text, after_summary text, created_at timestamp not null default now())`));
      await transaction.execute(sql.raw(`create table trip_plan_change_history (id text primary key, trip_project_id text not null, user_id text not null, proposal_id text, actor_user_id text references users(id), actor_class text not null default 'user', actor_system text, operation_class text not null, affected_item_references jsonb not null, safe_before_after_summary jsonb not null, created_at timestamp not null default now())`));
      await transaction.execute(sql.raw(`create table ai_usage_events (id text primary key, user_id text not null references users(id), purpose text not null, created_at timestamp not null default now())`));
      await transaction.execute(sql.raw(`create index ai_usage_events_user_id_created_at_idx on ai_usage_events (user_id)`));
      await transaction.execute(sql.raw(`insert into users values ('user-1')`));
      await transaction.execute(sql.raw(`insert into audit_events (id, actor_user_id, actor_email, actor_class, actor_system, operation, target_type) values ('legacy-audit', 'user-1', 'legacy@example.com', 'system', 'system-facebook-capture', 'create', 'legacy')`));
      await transaction.execute(sql.raw(`insert into trip_plan_change_history (id, trip_project_id, user_id, actor_user_id, actor_class, actor_system, operation_class, affected_item_references, safe_before_after_summary) values ('legacy-history', 'project-1', 'user-1', 'user-1', 'system', 'system-trip-planning', 'apply', '[]', '{}')`));
      await transaction.execute(sql.raw(`insert into ai_usage_events (id, user_id, purpose) values ('legacy-usage', 'user-1', 'legacy')`));

      const scopedMigration = migration.replaceAll('"public".', `"${schemaName}".`);
      for (const statement of scopedMigration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
        await transaction.execute(sql.raw(statement));
      }

      await assertions(transaction);
    });
  }

  test("clears disposable legacy attribution data before enforcing valid actor shapes", async () => {
    await executeInIsolatedSchema(async (database) => {
      await expect(database.execute(sql`select * from audit_events`)).resolves.toEqual([]);
      await expect(database.execute(sql`select * from trip_plan_change_history`)).resolves.toEqual([]);
      await expect(database.execute(sql`select * from ai_usage_events`)).resolves.toEqual([]);
    });
  });

  test("accepts valid user and system rows and rejects every invalid XOR shape", async () => {
    await executeInIsolatedSchema(async (database) => {
      await expect(database.execute(sql.raw(`insert into audit_events (id, actor_user_id, actor_email, actor_class, actor_system, operation, target_type) values ('audit-user', 'user-1', 'user@example.com', 'user', null, 'create', 'test'), ('audit-system', null, null, 'system', 'system-trip-planning', 'create', 'test')`))).resolves.toBeDefined();
      await expect(database.execute(sql.raw(`insert into trip_plan_change_history (id, trip_project_id, user_id, actor_user_id, actor_class, actor_system, operation_class, affected_item_references, safe_before_after_summary) values ('history-user', 'project-1', 'user-1', 'user-1', 'user', null, 'apply', '[]', '{}'), ('history-system', 'project-1', 'user-1', null, 'system', 'system-trip-planning', 'expire', '[]', '{}')`))).resolves.toBeDefined();

      for (const statement of [
        `insert into audit_events (id, actor_user_id, actor_email, actor_class, actor_system, operation, target_type) values ('audit-user-missing', null, 'user@example.com', 'user', null, 'create', 'test')`,
        `insert into audit_events (id, actor_user_id, actor_email, actor_class, actor_system, operation, target_type) values ('audit-user-email-null', 'user-1', null, 'user', null, 'create', 'test')`,
        `insert into audit_events (id, actor_user_id, actor_email, actor_class, actor_system, operation, target_type) values ('audit-user-system', 'user-1', 'user@example.com', 'user', 'system-trip-planning', 'create', 'test')`,
        `insert into audit_events (id, actor_user_id, actor_email, actor_class, actor_system, operation, target_type) values ('audit-system-human', 'user-1', 'user@example.com', 'system', 'system-trip-planning', 'create', 'test')`,
        `insert into audit_events (id, actor_user_id, actor_email, actor_class, actor_system, operation, target_type) values ('audit-system-id-null', null, null, 'system', null, 'create', 'test')`,
        `insert into audit_events (id, actor_user_id, actor_email, actor_class, actor_system, operation, target_type) values ('audit-system-blank', null, null, 'system', ' ', 'create', 'test')`,
        `insert into audit_events (id, actor_user_id, actor_email, actor_class, actor_system, operation, target_type) values ('audit-invalid-class', null, null, 'worker', 'system-trip-planning', 'create', 'test')`,
        `insert into trip_plan_change_history (id, trip_project_id, user_id, actor_user_id, actor_class, actor_system, operation_class, affected_item_references, safe_before_after_summary) values ('history-user-missing', 'project-1', 'user-1', null, 'user', null, 'apply', '[]', '{}')`,
        `insert into trip_plan_change_history (id, trip_project_id, user_id, actor_user_id, actor_class, actor_system, operation_class, affected_item_references, safe_before_after_summary) values ('history-user-system', 'project-1', 'user-1', 'user-1', 'user', 'system-trip-planning', 'apply', '[]', '{}')`,
        `insert into trip_plan_change_history (id, trip_project_id, user_id, actor_user_id, actor_class, actor_system, operation_class, affected_item_references, safe_before_after_summary) values ('history-system-human', 'project-1', 'user-1', 'user-1', 'system', 'system-trip-planning', 'apply', '[]', '{}')`,
        `insert into trip_plan_change_history (id, trip_project_id, user_id, actor_user_id, actor_class, actor_system, operation_class, affected_item_references, safe_before_after_summary) values ('history-system-id-null', 'project-1', 'user-1', null, 'system', null, 'apply', '[]', '{}')`,
        `insert into trip_plan_change_history (id, trip_project_id, user_id, actor_user_id, actor_class, actor_system, operation_class, affected_item_references, safe_before_after_summary) values ('history-system-blank', 'project-1', 'user-1', null, 'system', ' ', 'apply', '[]', '{}')`,
        `insert into trip_plan_change_history (id, trip_project_id, user_id, actor_user_id, actor_class, actor_system, operation_class, affected_item_references, safe_before_after_summary) values ('history-invalid-class', 'project-1', 'user-1', null, 'worker', 'system-trip-planning', 'apply', '[]', '{}')`,
      ]) {
        await expect(database.transaction((savepoint) => savepoint.execute(sql.raw(statement)))).rejects.toSatisfy((error: unknown) => getDatabaseErrorCode(error) === "23514");
      }
    });
  });
});

function getDatabaseErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }
  if ("cause" in error && typeof error.cause === "object" && error.cause !== null && "code" in error.cause && typeof error.cause.code === "string") {
    return error.cause.code;
  }

  return null;
}
