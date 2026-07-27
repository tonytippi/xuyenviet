import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { knowledgeCardSearchDocuments, knowledgeCards, users } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";

describe("Story 8.3 executor schema", () => {
  test("requires a nonblank executor for every persisted search projection", async () => {
    await resetTestDatabase();
    await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
    await testDb.insert(knowledgeCards).values({ id: "card", type: "place", title: "Card", locationName: "Huế", summary: "Safe card.", aiPromptVersion: "test", createdByUserId: "operator" });
    await expect(testDb.execute(sql`insert into knowledge_card_search_documents (knowledge_card_id, content_version, accepted_fence, executor_system, status, searchable_text, text_hash, source_count, confidence, freshness_sensitive) values ('card', 1, 'test', null, 'active', 'safe', ${"a".repeat(64)}, 1, 'curated', false)`)).rejects.toThrow();
  });

  test("keeps the reset-only clean break while making the initial migration constraint non-null", async () => {
    const migration = await readFile("drizzle/migrations/0070_story_8_3_knowledge_executor_attribution.sql", "utf8");
    const repair = await readFile("drizzle/migrations/0071_story_8_3_search_projection_executor_required.sql", "utf8");
    expect(migration).toContain('DELETE FROM "knowledge_card_search_documents"');
    expect(migration).toContain('CHECK ("executor_system" is not null and length(btrim("executor_system")) between 1 and 160)');
    expect(repair).toContain('ALTER COLUMN "executor_system" SET NOT NULL');
    expect(knowledgeCardSearchDocuments.executorSystem.notNull).toBe(true);
  });
});
