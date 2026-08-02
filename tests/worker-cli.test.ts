import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, test } from "vitest";

import { tripChangeProposals, tripPlanChangeHistory, tripPlanItems, tripProjects, users } from "@/db/schema";

import { parseProposalExpiryArguments } from "../scripts/trip-proposal-expiry";
import { parseKnowledgeExtractionWorkerArguments } from "../scripts/knowledge-extraction-worker";
import { parseKnowledgeIngestionWorkerArguments } from "../scripts/knowledge-ingestion-worker";
import { parseKnowledgeIndexingWorkerArguments } from "../scripts/knowledge-indexing-worker";
import { parseAiAskDomainOutboxWorkerArguments } from "../scripts/ai-ask-domain-outbox-worker";
import { resetTestDatabase, testDb } from "./helpers/db";

describe("trip proposal expiry CLI", () => {
  beforeEach(async () => { await resetTestDatabase(); });
  it("accepts only the required finite invocation", () => {
    expect(parseProposalExpiryArguments(["--once"])).toEqual({ once: true });
  });

  it("rejects missing, duplicate, and unsafe arguments before work starts", () => {
    expect(() => parseProposalExpiryArguments([])).toThrow();
    expect(() => parseProposalExpiryArguments(["--once", "--once"])).toThrow();
    expect(() => parseProposalExpiryArguments(["--poll-ms=1"])).toThrow();
  });

  test.runIf(Boolean(process.env.DATABASE_URL_TEST))("runs the bounded expiry CLI against persisted work and remains idempotent", async () => {
    await testDb.insert(users).values({ id: "expiry-cli-user", email: "expiry-cli-user@example.com" });
    await testDb.insert(tripProjects).values({ id: "expiry-cli-project", userId: "expiry-cli-user", title: "Hue", aggregateVersion: 1 });
    await testDb.insert(tripPlanItems).values({ id: "expiry-cli-leg", tripProjectId: "expiry-cli-project", userId: "expiry-cli-user", kind: "leg", type: "transport", state: "planned", label: "Drive", ordinal: 0, version: 1 });
    await testDb.insert(tripChangeProposals).values({ id: "expiry-cli-proposal", tripProjectId: "expiry-cli-project", userId: "expiry-cli-user", creatorClass: "ai_orchestration", status: "pending", rationale: "Expired.", operations: [{ kind: "change-item-state", itemId: "expiry-cli-leg", state: "confirmed" }], expectedAggregateVersion: 1, expiresAt: new Date("2026-01-01T00:00:00.000Z") });
    const root = resolve(import.meta.dirname, "..");
    const environment = { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST };
    const first = execFileSync("pnpm", ["trip-proposal-expiry", "--once"], { cwd: root, env: environment, encoding: "utf8", timeout: 30_000 });
    expect(JSON.parse(first.trim().split("\n").at(-1)!)).toMatchObject({ status: "processed", processed: 1 });
    await expect(testDb.select().from(tripChangeProposals).where(eq(tripChangeProposals.id, "expiry-cli-proposal"))).resolves.toMatchObject([{ status: "expired" }]);
    const second = execFileSync("pnpm", ["trip-proposal-expiry", "--once"], { cwd: root, env: environment, encoding: "utf8", timeout: 30_000 });
    expect(JSON.parse(second.trim().split("\n").at(-1)!)).toEqual({ status: "no_work" });
    await expect(testDb.select().from(tripPlanChangeHistory).where(eq(tripPlanChangeHistory.proposalId, "expiry-cli-proposal"))).resolves.toHaveLength(1);
  });
});

describe("worker runtime CLIs", () => {
  it("requires explicit bounded --once commands with safe worker IDs", () => {
    expect(parseKnowledgeExtractionWorkerArguments(["--once", "--worker-id=extract-1"])).toEqual({ once: true, workerId: "extract-1" });
    expect(parseKnowledgeIngestionWorkerArguments(["--once", "--worker-id=ingest-1"])).toEqual({ once: true, workerId: "ingest-1" });
    expect(parseKnowledgeIndexingWorkerArguments(["--once"])).toEqual({ once: true });
    expect(parseAiAskDomainOutboxWorkerArguments(["--once", "--worker-id=outbox-1"])).toBe("outbox-1");
  });

  it("rejects continuous, duplicate, and unknown runtime command arguments", () => {
    expect(() => parseKnowledgeExtractionWorkerArguments(["--worker-id=x"])).toThrow();
    expect(() => parseKnowledgeIngestionWorkerArguments(["--once", "--worker-id=x", "--once"])).toThrow();
    expect(() => parseKnowledgeIndexingWorkerArguments(["--once", "--batch-size=2"])).toThrow();
    expect(() => parseAiAskDomainOutboxWorkerArguments(["--once", "--worker-id=unsafe value"])).toThrow();
  });
});
