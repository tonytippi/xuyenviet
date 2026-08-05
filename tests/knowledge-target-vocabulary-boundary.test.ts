import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const sources = ["apps/api/src/**/*.ts", "apps/admin/app/knowledge/**/*.{ts,tsx}", "packages/contracts/src/**/*.ts", "scripts/**/*.ts", "tests/**/*.test.ts"];
const excluded = new Set([
  "tests/knowledge-target-vocabulary-boundary.test.ts",
  "tests/admin-knowledge-views-ui-boundary.test.ts",
  "tests/admin-youtube-capture-contract.test.ts",
  "tests/knowledge-search.test.ts",
]);
const retiredShape = /\b(?:publicationState|reviewState|needsReview|reviewStatus|operationState|verify_first)\b|\.stage\b/;

describe("target knowledge vocabulary boundary", () => {
  test("keeps retired lifecycle fields and states out of active runtime, fixtures, and tests", async () => {
    const files = new Set<string>();
    for (const pattern of sources) for await (const file of glob(pattern)) if (!excluded.has(file)) files.add(file);
    const violations = (await Promise.all([...files].map(async (file) => retiredShape.test(await readFile(file, "utf8")) ? file : null))).filter(Boolean);
    expect(violations).toEqual([]);
  });

  test("does not use approved as a knowledge lifecycle, job, or candidate state", async () => {
    const files = new Set<string>();
    for (const pattern of sources) for await (const file of glob(pattern)) if (!excluded.has(file)) files.add(file);
    const violations = (await Promise.all([...files].map(async (file) => /(?:lifecycleState|processingStatus|status)\s*[:=][\s\S]{0,200}?["']approved["']/.test(await readFile(file, "utf8")) ? file : null))).filter(Boolean);
    expect(violations).toEqual([]);
  });
});
