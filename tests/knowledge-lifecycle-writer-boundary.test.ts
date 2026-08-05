import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("knowledge lifecycle writer boundary", () => {
  test("permits lifecycle/work mutation only in the central command", async () => {
    const files = await sourceFiles(["packages", "apps"]);
    const lifecycleTables = ["knowledgeCards", "knowledgeRecommendations", "knowledgeSamplingObligations", "knowledgeIngestionCandidates", "knowledgeIndexDirtyMarkers"];
    const allowed = new Set([
      "packages/database/src/knowledge-lifecycle.ts",
      "packages/database/src/knowledge-indexing-queue.ts", // lifecycle command helper; projection queue only
      "packages/worker-domain/src/features/knowledge/indexing-worker.ts", // documented technical lease/execution only
      "packages/worker-domain/src/features/knowledge/ingestion-jobs.ts", // documented technical candidate lease/failure only
      "packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts", // documented discovery/discard candidate persistence only
      "packages/worker-domain/src/features/knowledge/extraction.ts", // documented technical draft extraction only
    ]);
    const violations = await Promise.all(files.map(async (file) => {
      const path = relative(root, file);
      const content = await readFile(file, "utf8");
      return !allowed.has(path) && writesLifecycleTable(content, lifecycleTables) ? path : null;
    }));
    expect(violations.filter(Boolean)).toEqual([]);

    const command = await readFile(resolve(root, "packages/database/src/knowledge-lifecycle.ts"), "utf8");
    expect(command).toContain("knowledgeIngestionCandidates");
    expect(command).toContain("knowledgeRecommendations");
    expect(command).toContain("enqueueKnowledgeIndexWork");
    expect(command).toContain("recordAuditEvent");
  });

  test("detects lifecycle writes through object table aliases", () => {
    const tables = ["knowledgeCards"];
    expect(writesLifecycleTable("import { knowledgeCards } from './schema'; const tables = { card: knowledgeCards }; db.update(tables.card);", tables)).toBe(true);
    expect(writesLifecycleTable("import { knowledgeCards } from './schema'; const tables = { card: knowledgeCards }; const card = tables.card; db.delete(card);", tables)).toBe(true);
    expect(writesLifecycleTable("import { knowledgeCards } from './schema'; const tables = { card: knowledgeCards }; db.select().from(tables.card);", tables)).toBe(false);
  });

  test("keeps API admin routes out of Worker claim, run, and loop ownership", async () => {
    const files = await sourceFiles(["apps/api/src/admin"]);
    const violations = await Promise.all(files.map(async (file) => {
      const content = await readFile(file, "utf8");
      return /(?:claimNextKnowledge|runKnowledge(?:Ingestion|Indexing)|run.*Worker|start.*Loop)/.test(content) ? relative(root, file) : null;
    }));
    expect(violations.filter(Boolean)).toEqual([]);
  });

  test("retains the Facebook ingestion rerun route as an admitted port command, never a Worker execution path", async () => {
    const controller = await readFile(resolve(root, "apps/api/src/admin/admin-facebook-captures.controller.ts"), "utf8");
    const command = await readFile(resolve(root, "packages/domain/src/admin-facebook-capture.ts"), "utf8");

    expect(controller).toContain("rerunAdminFacebookCaptureIngestion(this.captures, request.principal, reviewId)");
    expect(controller).not.toMatch(/(?:claimNextKnowledge|runKnowledge(?:Ingestion|Indexing)|run.*Worker|start.*Loop|enqueue.*Loop)/);
    expect(command).toContain("return port.rerunIngestion(actor, reviewId)");
    expect(command).not.toMatch(/(?:claimNextKnowledge|runKnowledge(?:Ingestion|Indexing)|run.*Worker|start.*Loop)/);
  });
});

function writesLifecycleTable(content: string, tableNames: string[]) {
  const source = ts.createSourceFile("source.ts", content, ts.ScriptTarget.Latest, true);
  const tables = new Set(tableNames);
  const imports = new Set<string>();
  const namespaces = new Set<string>();
  const aliases = new Map<string, string>();
  const objectAliases = new Map<string, Map<string, string>>();
  const sqlTables = new Set(["knowledge_cards", "knowledge_recommendations", "knowledge_sampling_obligations", "knowledge_ingestion_candidates", "knowledge_index_dirty_markers"]);

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) for (const specifier of bindings.elements) {
      const imported = specifier.propertyName?.text ?? specifier.name.text;
      if (tables.has(imported)) imports.add(specifier.name.text);
    }
  }

  const resolveTable = (expression: ts.Expression): string | null => {
    while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isNonNullExpression(expression)) expression = expression.expression;
    if (ts.isIdentifier(expression)) return aliases.get(expression.text) ?? (imports.has(expression.text) ? expression.text : null);
    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) return objectAliases.get(expression.expression.text)?.get(expression.name.text) ?? (namespaces.has(expression.expression.text) && tables.has(expression.name.text) ? expression.name.text : null);
    if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression) && ts.isStringLiteral(expression.argumentExpression)) return objectAliases.get(expression.expression.text)?.get(expression.argumentExpression.text) ?? (namespaces.has(expression.expression.text) && tables.has(expression.argumentExpression.text) ? expression.argumentExpression.text : null);
    return null;
  };
  let violation = false;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const table = resolveTable(node.initializer);
      if (table) aliases.set(node.name.text, table);
      if (ts.isObjectLiteralExpression(node.initializer)) {
        const properties = new Map<string, string>();
        for (const property of node.initializer.properties) {
          if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
          const name = property.name?.getText(source);
          const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
          const propertyTable = name ? resolveTable(value) : null;
          if (name && propertyTable) properties.set(name.replace(/^['"]|['"]$/g, ""), propertyTable);
        }
        if (properties.size) objectAliases.set(node.name.text, properties);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && ts.isIdentifier(node.initializer) && namespaces.has(node.initializer.text)) {
      for (const element of node.name.elements) {
        const table = element.propertyName?.getText(source) ?? element.name.getText(source);
        if (tables.has(table) && ts.isIdentifier(element.name)) aliases.set(element.name.text, table);
      }
    }
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression) && ["insert", "update", "delete"].includes(node.expression.name.text) && node.arguments[0] && resolveTable(node.arguments[0])) violation = true;
      if (node.arguments.some((argument) => ts.isNoSubstitutionTemplateLiteral(argument) || ts.isTemplateExpression(argument)) && /\b(?:insert\s+into|update|delete\s+from)\s+(?:(?:"?public"?\.)?"?)(knowledge_cards|knowledge_recommendations|knowledge_sampling_obligations|knowledge_ingestion_candidates|knowledge_index_dirty_markers)\b/i.test(node.getText(source))) violation = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violation;
}

async function sourceFiles(roots: string[]): Promise<string[]> {
  const result: string[] = [];
  for (const directory of roots) await visit(resolve(root, directory), result);
  return result;
}

async function visit(directory: string, result: string[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path, result);
    else if (entry.isFile() && path.endsWith(".ts")) result.push(path);
  }
}
