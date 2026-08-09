import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

describe("YouTube Discovery ownership boundary", () => {
  test("uses only Discovery tables and the Audit writer", () => {
    const source = readFileSync("packages/database/src/youtube-discovery/index.ts", "utf8");

    expect(source).toContain('from "../audit-writers"');
    expect(source).toContain("recordAuditEvent(");
    expect(source).not.toMatch(/\b(auditEvents|tripPlanChangeHistory|aiUsageEvents|sources|sourceCaptureVersions|knowledge[A-Z]\w*)\b/);
    expect(source).not.toMatch(/knowledge-youtube-capture-eligibility/);
  });
});
