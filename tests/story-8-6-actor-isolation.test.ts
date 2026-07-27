import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

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

import { testDb } from "./helpers/db";
import { getTestDatabaseUrl } from "./helpers/env-file";

const catalogIds = systemAuditActorCatalog.map(({ id }) => id);
const testDatabaseUrl = getTestDatabaseUrl();

describe("Story 8.6 actor isolation", () => {
  beforeEach(async () => {
    await testDb.execute(sql.raw("drop schema public cascade; drop schema drizzle cascade; create schema public"));
    execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
      cwd: process.cwd(),
      // Migration must target the isolated database, never the development URL.
      env: { ...process.env, APP_ENV: "local", DATABASE_URL: testDatabaseUrl },
      stdio: "inherit",
    });
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

  test("rejects catalog executors as users before they can become authentication or role principals", async () => {
    for (const id of catalogIds) {
      await expect(testDb.execute(sql`insert into users (id, email) values (${id}, ${`${id}@xuyenviet.local`})`)).rejects.toThrow();
    }

    await expect(testDb.execute(sql`insert into accounts (user_id, type, provider, provider_account_id) values (${catalogIds[0]}, 'oauth', 'story-8-6', 'catalog-account')`)).rejects.toThrow();
    await expect(testDb.execute(sql`insert into sessions (session_token, user_id, expires) values ('story-8-6-catalog-session', ${catalogIds[0]}, now() + interval '1 day')`)).rejects.toThrow();
    await expect(testDb.execute(sql`insert into user_roles (user_id, role) values (${catalogIds[0]}, 'admin')`)).rejects.toThrow();
  });

  test("keeps catalog executors out of every discovered user-scoped relationship", async () => {
    await expect(testDb.select().from(users).where(inArray(users.id, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(accounts).where(inArray(accounts.userId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(sessions).where(inArray(sessions.userId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(userRoles).where(inArray(userRoles.userId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(referralCodes).where(inArray(referralCodes.referrerUserId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(referralAttributions).where(inArray(referralAttributions.userId, catalogIds))).resolves.toEqual([]);
    await expect(testDb.select().from(referralAttributions).where(inArray(referralAttributions.referrerUserId, catalogIds))).resolves.toEqual([]);
    const userRelationships = await testDb.execute<{ table_name: string; column_name: string }>(sql`
      select tc.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and ccu.table_name = 'users'
      order by tc.table_name, kcu.column_name
    `);
    expect(userRelationships.map(({ table_name, column_name }) => `${table_name}.${column_name}`)).toEqual(expect.arrayContaining([
      "sources.removed_by_user_id",
      "sources.submitted_by_user_id",
      "facebook_capture_reviews.reviewer_user_id",
      "knowledge_cards.created_by_user_id",
      "knowledge_recommendations.resolved_by_user_id",
      "knowledge_source_suggestions.created_by_user_id",
      "knowledge_seed_batches.submitted_by_user_id",
    ]));

    for (const { table_name, column_name } of userRelationships) {
      const rows = await testDb.execute(sql.raw(`select "${column_name}" as user_id from "${table_name}" where "${column_name}" = any(array[${catalogIds.map((id) => `'${id}'`).join(",")}])`));
      expect(rows, `${table_name}.${column_name}`).toEqual([]);
    }

    await expect(testDb.select({ id: users.id }).from(users).where(inArray(users.id, ["seed-fixture-operator-user", "seed-traveler-user"]))).resolves.toEqual([
      { id: "seed-fixture-operator-user" },
      { id: "seed-traveler-user" },
    ]);
    await expect(testDb.select().from(userRoles).where(eq(userRoles.userId, "seed-traveler-user"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(sources).where(eq(sources.submittedByUserId, "seed-fixture-operator-user"))).resolves.toHaveLength(18);
    await expect(testDb.select().from(sources).where(eq(sources.removedByUserId, "seed-fixture-operator-user"))).resolves.toEqual([]);
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
    const allowedFiles = new Set([
      "src/features/audit/events.ts",
      "src/features/audit/history.ts",
      "src/features/audit/usage.ts",
    ]);
    for (const file of listTypeScriptFiles("src")) {
      if (allowedFiles.has(file)) continue;
      expect(findProtectedTableInserts(readFileSync(file, "utf8")), file).toEqual([]);
    }

    for (const source of [
      'import { auditEvents as events } from "@/db/schema"; db.insert(events)',
      'import * as schema from "@/db/schema"; db?.insert(schema.auditEvents)',
      'import { tripPlanChangeHistory } from "@/db/schema"; transaction["insert"](tripPlanChangeHistory)',
      'import { aiUsageEvents } from "@/db/schema"; writer?.["insert"](aiUsageEvents)',
      'import { auditEvents } from "@/db/schema"; const events = auditEvents; getDb().insert(events)',
    ]) {
      expect(findProtectedTableInserts(source), source).not.toEqual([]);
    }
  });
});

const protectedTables = new Set(["auditEvents", "tripPlanChangeHistory", "aiUsageEvents"]);

function findProtectedTableInserts(source: string) {
  const file = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true);
  const importedTables = new Set<string>();
  const namespaces = new Set<string>();
  const aliases = new Map<string, string>();

  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "@/db/schema") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const specifier of bindings.elements) {
        const imported = specifier.propertyName?.text ?? specifier.name.text;
        if (protectedTables.has(imported)) importedTables.add(specifier.name.text);
      }
    }
  }

  const failures: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const table = resolveProtectedTable(node.initializer, importedTables, namespaces, aliases);
      if (table) aliases.set(node.name.text, table);
    }
    if (ts.isCallExpression(node) && isInsertCall(node.expression)) {
      const table = node.arguments[0] && resolveProtectedTable(node.arguments[0], importedTables, namespaces, aliases);
      if (table) failures.push(table);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return failures;
}

function isInsertCall(expression: ts.Expression) {
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return false;
  const name = ts.isPropertyAccessExpression(expression)
    ? expression.name.text
    : expression.argumentExpression && ts.isStringLiteral(expression.argumentExpression)
      ? expression.argumentExpression.text
      : null;
  return name === "insert";
}

function resolveProtectedTable(expression: ts.Expression, importedTables: Set<string>, namespaces: Set<string>, aliases: Map<string, string>): string | null {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isNonNullExpression(expression)) expression = expression.expression;
  if (ts.isIdentifier(expression)) return aliases.get(expression.text) ?? (importedTables.has(expression.text) ? expression.text : null);
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && namespaces.has(expression.expression.text) && protectedTables.has(expression.name.text)) return expression.name.text;
  return null;
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
