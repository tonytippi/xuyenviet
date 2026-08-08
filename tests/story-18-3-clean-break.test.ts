import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { describe, expect, test } from "vitest";
import { getTestDatabaseUrl } from "./helpers/env-file";

describe("Story 18.3 migration 0047 clean break", () => {
  test("converts a legacy system operator request before enforcing four safe system reasons", async () => {
    const migration = readFileSync(resolve(import.meta.dirname, "../drizzle/migrations/0047_discovery_query_planning.sql"), "utf8");
    const sql = postgres(getTestDatabaseUrl(), { max: 1 });
    expect(migration).toMatch(/SET "origin" = 'operator' WHERE "origin" = 'system' AND "reason" = 'operator_request'/);
    expect(migration).toMatch(/safe_signal_summary" IN \('coverage_gap', 'freshness_risk', 'unresolved_conflict', 'anonymized_demand'\)/);
    expect(migration).not.toMatch(/safe_signal_summary" IN \([^;]*'operator_request'/);
    try {
      await sql`create temporary table legacy_proposals (id text primary key, origin text not null, reason text not null, priority integer not null, query_text text not null, enabled boolean not null, cadence_minutes integer not null)`;
      await sql`insert into legacy_proposals values ('legacy-system-request', 'system', 'operator_request', 50, 'Da Lat route', true, 60)`;
      await sql.unsafe(migration.match(/UPDATE "youtube_discovery_query_proposals" SET "origin" = 'operator'[^;]+;/)![0].replaceAll('"youtube_discovery_query_proposals"', 'legacy_proposals'));
      await sql`alter table legacy_proposals add column target_digest text, add column safe_signal_summary text`;
      await expect(sql`alter table legacy_proposals add constraint legacy_system_reason_check check ((origin = 'system' and safe_signal_summary in ('coverage_gap', 'freshness_risk', 'unresolved_conflict', 'anonymized_demand')) or (origin = 'operator' and target_digest is null and safe_signal_summary is null))`).resolves.toBeDefined();
      await expect(sql`select origin, target_digest, safe_signal_summary from legacy_proposals where id = 'legacy-system-request'`).resolves.toEqual([{ origin: 'operator', target_digest: null, safe_signal_summary: null }]);
    } finally {
      await sql.end();
    }
  });
});
