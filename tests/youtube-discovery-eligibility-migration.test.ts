import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("YouTube Discovery eligibility migration", () => {
  test("extends immutable policy coverage and closes eligibility outcomes", async () => {
    const migration = await readFile(resolve(process.cwd(), "drizzle/migrations/0070_discovery_vietnamese_eligibility.sql"), "utf8");
    expect(migration).toContain("language_classifier_version");
    expect(migration).toContain("minimum_useful_duration_seconds");
    expect(migration).toContain("allow_foreign_fallback");
    expect(migration).toContain('ADD COLUMN "query_builder_version" integer');
    expect(migration).toContain('current_policy."query_builder_version", 1, 180');
    expect(migration).toContain('UPDATE "youtube_discovery_policy_versions" SET "is_current" = false');
    expect(migration).toContain("to_jsonb(OLD) - ARRAY['id', 'is_current', 'created_at']");
    expect(migration).toContain("youtube_discovery_appearances_eligibility_check");
    expect(migration).toContain("when \"duration_fit\" = 'too_short' then 'too_short'");
    expect(migration).toContain("when \"eligibility_reason\" = 'foreign_fallback'");
    expect(migration).toContain("when \"language_fit\" = 'non_vi' then 'non_vietnamese'");
    const repair = await readFile(resolve(process.cwd(), "drizzle/migrations/0071_discovery_eligibility_query_builder_provenance.sql"), "utf8");
    expect(repair).toContain('ADD COLUMN IF NOT EXISTS "query_builder_version" integer');
  });
});
