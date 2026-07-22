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

  test("adds bounded source-versioned evidence and reports ambiguous legacy support without fabricating it", async () => {
    const migration = await readFile("drizzle/migrations/0040_medical_hercules.sql", "utf8");

    expect(migration).toContain('CREATE TABLE "knowledge_card_evidence"');
    expect(migration).toContain('"capture_version_id" text NOT NULL');
    expect(migration).toContain('"knowledge_card_evidence_capture_version_source_fk"');
    expect(migration).toContain('"knowledge_card_evidence_card_source_fk"');
    expect(migration).toContain('REFERENCES "public"."knowledge_card_sources"("knowledge_card_id","source_id")');
    expect(migration).toContain("legacy_support_ambiguous");
    expect(migration).toContain("Do not fabricate evidence from card text");
    expect(migration).toContain('substring(capture."raw_text" from evidence."span_start" + 1');
    expect(migration).not.toContain('INSERT INTO "knowledge_card_evidence"');
  });
});
