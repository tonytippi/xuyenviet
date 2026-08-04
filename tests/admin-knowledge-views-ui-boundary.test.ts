import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { parseAdminKnowledgeIntake } from "@xuyenviet/contracts";

describe("admin knowledge view boundary", () => {
  test("uses direct API and contracts without data or worker ownership", async () => {
    const files: string[] = [];
    for await (const file of glob("apps/admin/app/knowledge/**/*.{ts,tsx}")) files.push(file);
    const source = await Promise.all(files.map((file) => readFile(file, "utf8")));
    const combined = source.join("\n");
    expect(combined).toContain("@xuyenviet/contracts");
    expect(combined).toContain("NEXT_PUBLIC_API_ORIGIN");
    expect(combined).not.toMatch(/@xuyenviet\/(database|domain|worker-domain)|server action|\/api\/bff|next\/headers/);
    expect(combined).not.toMatch(/\.stage|reviewStatus|operationState|promptVersion/);
    expect(combined).not.toMatch(/\/knowledge\/(drafts|approved)|\/v1\/admin\/knowledge\/(drafts|approved)|approveDraft|rejectDraft|batchApprove/);
    expect(combined).toContain("/v1/admin/knowledge/cards");
  });

  test("rejects legacy batch state disclosure from the intake response", () => {
    const source = { id: "source-1", displayUrl: "https://example.com", displayTitle: "Nguồn", kind: "url", eligibility: "eligible", removalReason: null, createdAt: "2026-08-04T00:00:00.000Z" };
    expect(parseAdminKnowledgeIntake({ sources: [source] })).toEqual({ sources: [source] });
    expect(parseAdminKnowledgeIntake({ sources: [source], recentBatches: [] })).toBeNull();
    expect(parseAdminKnowledgeIntake({ sources: [{ ...source, rawText: "secret" }] })).toBeNull();
    expect(parseAdminKnowledgeIntake({ sources: [{ ...source, displayUrl: "https://user:password@example.com" }] })).toBeNull();
  });
});
