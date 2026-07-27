import { execFileSync } from "node:child_process";

import { eq, inArray, like } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import {
  assistantRetrievalDecisions,
  auditEvents,
  chatContext,
  conversations,
  messages,
  rawSourceMaterial,
  sources,
  tripProjects,
  users,
  webSearchResults,
} from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";

import { resetTestDatabase, testDb } from "./helpers/db";
import { getTestDatabaseUrl } from "./helpers/env-file";

const reservedUserIds = [
  "system-knowledge-pipeline",
  "system-trip-planning",
  "system-facebook-capture",
  "system-youtube-capture",
];
const testDatabaseUrl = getTestDatabaseUrl();

describe("Story 8.5 clean-break seed", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    execFileSync("pnpm", ["exec", "tsx", "scripts/db-seed.ts"], {
      cwd: process.cwd(),
      // The seed subprocess must not inherit Vitest's DATABASE_URL remapping.
      env: { ...process.env, APP_ENV: "local", DATABASE_URL: testDatabaseUrl },
      stdio: "inherit",
    });
  });

  test("seeds only the operator and preserves source provenance", async () => {
    await expect(testDb.select().from(users).where(inArray(users.id, reservedUserIds))).resolves.toEqual([]);
    await expect(testDb.select().from(users).where(like(users.id, "system-%"))).resolves.toEqual([]);
    await expect(testDb.select({ id: users.id, email: users.email }).from(users)).resolves.toEqual([
      { id: "seed-fixture-operator-user", email: "fixture-operator@xuyenviet.local" },
    ]);
    const seededSources = await testDb.select({ id: sources.id, kind: sources.kind, submittedByUserId: sources.submittedByUserId }).from(sources);
    expect(seededSources).toHaveLength(18);
    expect(seededSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "facebook", submittedByUserId: "seed-fixture-operator-user" }),
      expect.objectContaining({ kind: "youtube", submittedByUserId: "seed-fixture-operator-user" }),
    ]));
    expect(seededSources.every(({ kind, submittedByUserId }) => (kind === "facebook" || kind === "youtube") && submittedByUserId === "seed-fixture-operator-user")).toBe(true);
    const rawMaterial = await testDb.select({ sourceId: rawSourceMaterial.sourceId }).from(rawSourceMaterial);
    expect(rawMaterial.map(({ sourceId }) => sourceId).sort()).toEqual(seededSources.map(({ id }) => id).sort());
    await expect(testDb.select().from(users).where(eq(users.id, "seed-traveler-user"))).resolves.toEqual([]);
    await expect(testDb.select().from(tripProjects).where(eq(tripProjects.id, "seed-trip-hanoi-hue"))).resolves.toEqual([]);
    await expect(testDb.select().from(conversations).where(eq(conversations.id, "seed-conversation-hanoi-hue"))).resolves.toEqual([]);
    await expect(testDb.select().from(messages).where(inArray(messages.id, ["seed-message-user-1", "seed-message-assistant-1"]))).resolves.toEqual([]);
    await expect(testDb.select().from(chatContext).where(inArray(chatContext.id, ["seed-chat-context-origin", "seed-chat-context-destination"]))).resolves.toEqual([]);
    await expect(testDb.select().from(webSearchResults).where(eq(webSearchResults.id, "seed-web-result-hue-weather"))).resolves.toEqual([]);
    await expect(testDb.select().from(assistantRetrievalDecisions).where(eq(assistantRetrievalDecisions.id, "seed-retrieval-decision-1"))).resolves.toEqual([]);
  });

  test("records a cataloged system audit without a matching user row", async () => {
    await recordAuditEvent({
      actor: { kind: "system", system: "system-youtube-capture" },
      operation: "create",
      targetType: "story_8_5_test",
    }, testDb);

    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "story_8_5_test"))).resolves.toMatchObject([
      { actorClass: "system", actorUserId: null, actorEmail: null, actorSystem: "system-youtube-capture" },
    ]);
    await expect(testDb.select().from(users).where(eq(users.id, "system-youtube-capture"))).resolves.toEqual([]);
  });
});
