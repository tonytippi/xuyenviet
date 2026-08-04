import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("knowledge lifecycle writer boundary", () => {
  test("permits lifecycle/work mutation only in the central command", async () => {
    const files = await sourceFiles(["packages", "apps"]);
    const lifecycleTables = "knowledgeCards|knowledgeRecommendations|knowledgeSamplingObligations|knowledgeIngestionCandidates|knowledgeIndexDirtyMarkers";
    const prohibited = new RegExp(`(?:\\.(?:insert|update|delete)\\(\\s*(?:schema\\.)?(?:${lifecycleTables})\\)|\\b(?:insert\\s+into|delete\\s+from)\\s+(?:knowledge_cards|knowledge_recommendations|knowledge_sampling_obligations|knowledge_ingestion_candidates|knowledge_index_dirty_markers)\\b|\\bupdate\\s+(?:knowledge_cards|knowledge_recommendations|knowledge_sampling_obligations|knowledge_ingestion_candidates|knowledge_index_dirty_markers)\\b)`, "i");
    const allowed = new Set([
      "packages/database/src/knowledge-lifecycle.ts",
      "packages/database/src/knowledge-indexing-queue.ts", // lifecycle command helper; projection queue only
      "packages/worker-domain/src/features/knowledge/indexing-worker.ts", // technical lease/execution only
      "packages/worker-domain/src/features/knowledge/ingestion-jobs.ts", // technical candidate lease/failure only
      "packages/worker-domain/src/features/knowledge/extraction.ts", // technical draft extraction only
    ]);
    const violations = await Promise.all(files.map(async (file) => {
      const path = relative(root, file);
      return !allowed.has(path) && prohibited.test(await readFile(file, "utf8")) ? path : null;
    }));
    expect(violations.filter(Boolean)).toEqual([]);

    const command = await readFile(resolve(root, "packages/database/src/knowledge-lifecycle.ts"), "utf8");
    expect(command).toContain("knowledgeIngestionCandidates");
    expect(command).toContain("knowledgeRecommendations");
    expect(command).toContain("enqueueKnowledgeIndexWork");
    expect(command).toContain("recordAuditEvent");
  });
});

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
