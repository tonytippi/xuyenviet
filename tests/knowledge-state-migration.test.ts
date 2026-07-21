import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

describe("knowledge card state migration", () => {
  test("maps legacy states, records mapping counts, and disables existing projections", async () => {
    const migration = await readFile("drizzle/migrations/0038_ai_first_knowledge_card_state_model.sql", "utf8");

    expect(migration).toContain("WHEN \"status\" = 'approved' AND \"needs_review\" = false THEN 'active'");
    expect(migration).toContain("WHEN \"status\" = 'archived' THEN 'archived'");
    expect(migration).toContain("'legacy_approved_active_evidence_required'");
    expect(migration).toContain('INSERT INTO "knowledge_card_state_migration_reports"');
    expect(migration).toContain('SET "status" = \'disabled\', "updated_at" = now(), "disabled_at" = now()');
    expect(migration).toContain("DEFAULT 'Current judgment has not been completed.'");
    expect(migration).toContain('"current_judge_summary" = \'Legacy state migration; bounded evidence is required before traveler retrieval.\'');
  });
});
