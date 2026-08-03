import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const runbook = readFileSync("docs/runbooks/direct-api-launch-evidence.md", "utf8");

describe("direct API launch evidence gate", () => {
  test("defines every mandatory platform gate as blocked by default", () => {
    for (const gateId of [
      "GATE-INGRESS-TOPOLOGY",
      "GATE-OAUTH-SESSION-ORIGIN-CSRF",
      "GATE-MIGRATION-WRITER",
      "GATE-LEGACY-RETIREMENT",
      "GATE-ROLLBACK-DRILL",
      "GATE-API-WORKER-READINESS",
      "GATE-MONITORING-ALERTS",
      "GATE-BACKUP-RESTORE",
      "GATE-AI-STREAM-CONCURRENCY",
    ]) expect(runbook).toContain(`\`${gateId}\` | \`BLOCKED\``);
  });

  test("fails closed and requires a complete safe evidence record", () => {
    expect(runbook).toContain("Every platform gate starts `BLOCKED`");
    expect(runbook).toContain("Missing, stale, unverifiable, or secret-bearing evidence leaves the gate `BLOCKED`");
    for (const field of ["Gate ID and environment", "Status", "Accountable role", "Deployed revision", "Timestamp", "Safe evidence reference", "Safe outcome"]) expect(runbook).toContain(`| ${field} |`);
    expect(runbook).toContain("`staging` or `production`");
    expect(runbook).toContain("`BLOCKED` or `PASSED`");
    expect(runbook).toContain("Public launch is NO-GO unless every required staging and production gate is `PASSED`");
    expect(runbook).toContain("missing safe outcome is a public-launch no-go");
  });

  test("prohibits sensitive evidence values", () => {
    for (const material of ["cookies", "OAuth codes or tokens", "CSRF proofs", "credentials", "database URLs", "raw provider payloads", "unredacted request headers"]) expect(runbook).toContain(material);
    expect(runbook).toContain("Never record");
  });

  test("does not present repository verification as public-launch approval", () => {
    expect(runbook).toContain("Repository checks are repository-only evidence and cannot approve a public launch.");
    expect(runbook).toContain("This verifies documentation structure only.");
    expect(runbook).toContain("it is not public-launch approval.");
  });
});
