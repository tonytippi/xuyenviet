import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { knowledgeCards, users } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";

describe("Story 8.3 executor schema", () => {
  test("requires a nonblank executor for every persisted search projection", async () => {
    await resetTestDatabase();
    await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
    await testDb.insert(knowledgeCards).values({ id: "card", type: "place", title: "Card", locationName: "Huế", summary: "Safe card.", aiPromptVersion: "test", createdByUserId: "operator" });
    await expect(testDb.execute(sql`insert into knowledge_card_search_documents (knowledge_card_id, content_version, accepted_fence, executor_system, status, searchable_text, text_hash, source_count, confidence, freshness_sensitive) values ('card', 1, 'test', null, 'active', 'safe', ${"a".repeat(64)}, 1, 'curated', false)`)).rejects.toThrow();
  });
});
