import { execFileSync } from "node:child_process";

import { and, eq, inArray, like } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, conversations, sources, tripProjects, userRoles, users } from "@/db/schema";
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

  test("seeds only deliberate people and preserves their relationships", async () => {
    await expect(testDb.select().from(users).where(inArray(users.id, reservedUserIds))).resolves.toEqual([]);
    await expect(testDb.select().from(users).where(like(users.id, "system-%"))).resolves.toEqual([]);
    await expect(testDb.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ["seed-fixture-operator-user", "seed-traveler-user"]))).resolves.toEqual([
      { id: "seed-fixture-operator-user", email: "fixture-operator@xuyenviet.local" },
      { id: "seed-traveler-user", email: "fixture-traveler@xuyenviet.local" },
    ]);
    await expect(testDb.select().from(userRoles).where(and(eq(userRoles.userId, "seed-traveler-user"), eq(userRoles.role, "traveler")))).resolves.toHaveLength(1);
    await expect(testDb.select().from(sources).where(eq(sources.submittedByUserId, "seed-fixture-operator-user"))).resolves.toHaveLength(18);
    await expect(testDb.select().from(tripProjects).where(eq(tripProjects.userId, "seed-traveler-user"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(conversations).where(eq(conversations.userId, "seed-traveler-user"))).resolves.toHaveLength(1);
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
