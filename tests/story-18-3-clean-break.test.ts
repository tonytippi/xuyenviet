import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("Story 18.3 migration 0047 clean break", () => {
  test("contains schema-only changes and no legacy proposal data rewrite", () => {
    const migration = readFileSync(resolve(import.meta.dirname, "../drizzle/migrations/0047_discovery_query_planning.sql"), "utf8");
    expect(migration).toContain("schema only; it neither transforms nor backfills");
    expect(migration).not.toMatch(/UPDATE "youtube_discovery_query_proposals"/);
    expect(migration).toMatch(/"reason" IN \('coverage_gap', 'freshness_risk', 'unresolved_conflict', 'anonymized_demand'\)/);
  });

  test("guards every planning artifact created by the clean-break migration", () => {
    const migration = readFileSync(resolve(import.meta.dirname, "../drizzle/migrations/0047_discovery_query_planning.sql"), "utf8");
    for (const column of ["target_digest", "safe_signal_summary", "schedule_anchor_at", "next_due_at"]) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS "${column}"`);
    }
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "youtube_discovery_system_query_target_idx"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "youtube_discovery_runs_proposal_interval_idx"');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "youtube_discovery_planning_outcomes_planning_idx"');
    expect(migration).toContain("FROM pg_constraint WHERE conrelid = 'youtube_discovery_query_proposals'::regclass");
  });
});
