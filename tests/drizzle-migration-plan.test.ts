import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("Epic 21 migration plan", () => {
  test("finalizes 0073 as the single-table planning-session migration", async () => {
    const migrationDirectory = resolve(process.cwd(), "drizzle/migrations");
    const migrationNames = await readdir(migrationDirectory);
    expect(migrationNames.filter((name) => name.startsWith("0073_"))).toEqual(["0073_clean_break_trip_aware_planning.sql"]);
    const migration = await readFile(resolve(migrationDirectory, "0073_clean_break_trip_aware_planning.sql"), "utf8");
    expect(migration.match(/CREATE TABLE/g)).toHaveLength(1);
    expect(migration).toContain('CREATE TABLE "planning_context_sessions"');
    expect(migration).toContain('REFERENCES "conversations"("id", "user_id") ON DELETE CASCADE');
    expect(migration).toContain('"planning_context_sessions_revision_check"');
    expect(migration).not.toMatch(/ALTER TABLE|DROP TABLE|INSERT INTO|UPDATE |DELETE FROM/);
  });
});
