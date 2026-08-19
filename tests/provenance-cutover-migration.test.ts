import { execFileSync } from "node:child_process";

import postgres from "postgres";
import { describe, expect, test } from "vitest";

import { getTestDatabaseUrl } from "./helpers/env-file";
import { invalidateTestDatabaseTableCache, resetTestDatabase } from "./helpers/db";

const testDatabaseUrl = getTestDatabaseUrl();

describe("Story 11.2 provenance cutover migration", () => {
  test("fails closed without recorded old-writer quiescence and fences legacy inserts after cutover", async () => {
    const sql = postgres(testDatabaseUrl, { max: 1 });
    try {
      await sql.unsafe("drop schema public cascade; drop schema if exists drizzle cascade; create schema public");
      invalidateTestDatabaseTableCache();

      expectMigrationFailure({});
      await expect(sql`select to_regclass('public.assistant_provenance_withdrawal_backfill_state') as state_table`).resolves.toEqual([{ state_table: null }]);

      migrate({ DATABASE_URL: migrationUrlWithQuiescenceAdmission() });
      const [state] = await sql<{ old_writers_admission: string; cutover_at: Date; old_writers_quiesced_at: Date }[]>`
        select old_writers_admission, cutover_at, old_writers_quiesced_at
        from assistant_provenance_withdrawal_backfill_state
        where contract_key = 'v1'
      `;
      expect(state).toMatchObject({ old_writers_admission: "old_terminal_evaluation_writers_quiesced_v1" });
      expect(state.cutover_at.getTime()).toBe(state.old_writers_quiesced_at.getTime());

      await expect(sql`
        insert into assistant_response_provenance (
          id, user_id, conversation_id, user_message_id, assistant_message_id,
          source_category, rank, verification_status, source_snapshot
        ) values (
          'legacy-unscanned-provenance', 'missing', 'missing', 'missing', 'missing',
          'knowledge', 1, 'verified', '{}'::jsonb
        )
      `).rejects.toThrow(/coordinated v1 writer/);
    } finally {
      await resetTestDatabase();
      await sql.end();
    }
  });
});

function migrate(environment: Partial<NodeJS.ProcessEnv>) {
  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, APP_ENV: "local", DATABASE_URL: testDatabaseUrl, ...environment },
    stdio: "pipe",
  });
}

function migrationUrlWithQuiescenceAdmission() {
  const url = new URL(testDatabaseUrl);
  url.searchParams.set("options", "-c xuyenviet.provenance_old_writers_quiesced=v1");
  return url.toString();
}

function expectMigrationFailure(environment: Partial<NodeJS.ProcessEnv>) {
  try {
    migrate(environment);
  } catch (error) {
    if (error && typeof error === "object" && "stderr" in error) {
      const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString() : String(error.stderr ?? "");
      const stdout = "stdout" in error && Buffer.isBuffer(error.stdout) ? error.stdout.toString() : "";
      return `${stdout}\n${stderr}`;
    }
    throw error;
  }
  throw new Error("Expected migration to fail.");
}
