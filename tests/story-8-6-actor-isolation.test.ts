import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import {
  accounts,
  auditEvents,
  conversations,
  referralAttributions,
  referralCodes,
  sessions,
  sources,
  tripProjects,
  userRoles,
  users,
} from "@/db/schema";
import {
  AuditActorValidationError,
  createSystemAuditActor,
  systemAuditActorCatalog,
  validateAuditActor,
} from "@/features/audit/actors";
import { recordAuditEvent } from "@/features/audit/events";

import { resetTestDatabase, testDb } from "./helpers/db";
import { getTestDatabaseUrl } from "./helpers/env-file";

const catalogIds = systemAuditActorCatalog.map(({ id }) => id);
const testDatabaseUrl = getTestDatabaseUrl();

describe("Story 8.6 actor isolation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    execFileSync("pnpm", ["exec", "tsx", "scripts/db-seed.ts"], {
      cwd: process.cwd(),
      // Keep the disposable integration database explicit even under Vitest remapping.
      env: { ...process.env, APP_ENV: "local", DATABASE_URL: testDatabaseUrl },
      stdio: "inherit",
    });
  });

  test("accepts the real user and every catalog executor while rejecting malformed actor shapes before writing", async () => {
    const userActor = { kind: "user", userId: "seed-traveler-user", email: "fixture-traveler@xuyenviet.local" };
    expect(validateAuditActor(userActor)).toEqual(userActor);

    for (const system of catalogIds) {
      expect(createSystemAuditActor(system)).toEqual({ kind: "system", system });
      await recordAuditEvent({ actor: { kind: "system", system }, operation: "create", targetType: "story_8_6_actor" }, testDb);
    }

    await expect(testDb.select({ actorSystem: auditEvents.actorSystem }).from(auditEvents).where(eq(auditEvents.targetType, "story_8_6_actor"))).resolves.toEqual(catalogIds.map((actorSystem) => ({ actorSystem })));

    for (const invalidActor of [
      { kind: "user", userId: "", email: "person@example.com" },
      { kind: "user", userId: "seed-traveler-user", email: " " },
      { kind: "system", system: "" },
      { kind: "system", system: "untrusted-system" },
      { kind: "system", system: "system-trip-planning", userId: "seed-traveler-user" },
      { kind: "worker", system: "system-trip-planning" },
      null,
      [],
    ]) {
      expect(() => validateAuditActor(invalidActor)).toThrow(AuditActorValidationError);
    }

    await expect(recordAuditEvent({
      actor: { kind: "system", system: "untrusted-system" } as never,
      operation: "create",
      targetType: "story_8_6_invalid_actor",
    }, testDb)).rejects.toThrow(AuditActorValidationError);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "story_8_6_invalid_actor"))).resolves.toEqual([]);
  });

  test("keeps catalog executors out of authentication, roles, referrals, ownership, submitter, and session-principal fields", async () => {
    await expect(testDb.select().from(users).where(inArray(users.id, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(accounts).where(inArray(accounts.userId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(sessions).where(inArray(sessions.userId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(userRoles).where(inArray(userRoles.userId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(referralCodes).where(inArray(referralCodes.referrerUserId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(referralAttributions).where(inArray(referralAttributions.userId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(referralAttributions).where(inArray(referralAttributions.referrerUserId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(sources).where(inArray(sources.submittedByUserId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(tripProjects).where(inArray(tripProjects.userId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(conversations).where(inArray(conversations.userId, catalogIds))).resolves.toEqual([]);

    await expect(testDb.select({ id: users.id }).from(users).where(inArray(users.id, ["seed-fixture-operator-user", "seed-traveler-user"]))).resolves.toEqual([
      { id: "seed-fixture-operator-user" },
      { id: "seed-traveler-user" },
    ]);
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "seed-traveler-user"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(sources).where(eq(sources.submittedByUserId, "seed-fixture-operator-user"))).resolves.toHaveLength(18);
    await expect(testDb.select().from(tripProjects).where(eq(tripProjects.userId, "seed-traveler-user"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(conversations).where(eq(conversations.userId, "seed-traveler-user"))).resolves.toHaveLength(1);
  });

  test("has clean seed data with no reserved user IDs or system-email people", async () => {
    await expect(testDb.execute(sql`select id from users where id like 'system-%' or email like 'system-%@%'`)).resolves.toEqual([]);
    await expect(testDb.execute(sql`select id from users where id in (${sql.join(catalogIds.map((id) => sql`${id}`), sql`, `)})`)).resolves.toEqual([]);
  });
});

describe("Story 8.6 Audit-owned write boundary", () => {
  test("permits direct protected-table inserts only in Audit-owned writers", () => {
    const protectedTables = ["auditEvents", "tripPlanChangeHistory", "aiUsageEvents"];
    const allowedFiles = new Set([
      "src/features/audit/events.ts",
      "src/features/audit/history.ts",
      "src/features/audit/usage.ts",
    ]);
    const directInsert = new RegExp(`\\.\\s*insert\\s*\\(\\s*(?:${protectedTables.join("|")})\\b`);

    for (const file of listTypeScriptFiles("src")) {
      if (allowedFiles.has(file)) continue;
      expect(readFileSync(file, "utf8"), file).not.toMatch(directInsert);
    }

    expect("getDb().insert(\n  auditEvents,\n)").toMatch(directInsert);
    expect("transaction.insert(tripPlanChangeHistory)").toMatch(directInsert);
    expect("writer.insert( aiUsageEvents )").toMatch(directInsert);
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
