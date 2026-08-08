import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { auditEvents, cancelYoutubeDiscoveryRunIfDisabled, claimNextYoutubeDiscoveryRun, claimYoutubeDiscoveryPlanning, createSystemAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryRun, finishYoutubeDiscoveryRun, refreshYoutubeDiscoverySystemProposals, retryYoutubeDiscoveryRun, schema, youtubeDiscoveryPlanningLeases, youtubeDiscoveryQueryProposals, youtubeDiscoveryRuns } from "@xuyenviet/database";
import { resetTestDatabase, testDb } from "./helpers/db";
import { runYoutubeDiscoveryPoll, setYoutubeDiscoveryExecutionStageForTest, setYoutubeDiscoveryPlanningPortsForTest } from "../packages/worker-domain/src/features/youtube-discovery/execution";

let firstWorker: ReturnType<typeof drizzle<typeof schema>>;
let secondWorker: ReturnType<typeof drizzle<typeof schema>>;
let firstWorkerSql: ReturnType<typeof postgres>;
let secondWorkerSql: ReturnType<typeof postgres>;

async function completeDuePlanning() {
  const claim = await claimYoutubeDiscoveryPlanning("discovery-planning-fixture", testDb);
  expect(claim).not.toBeNull();
  expect(await refreshYoutubeDiscoverySystemProposals(claim!, [], testDb)).toBe("completed");
  const [lease] = await testDb.select({ state: youtubeDiscoveryPlanningLeases.state, nextRunAt: youtubeDiscoveryPlanningLeases.nextRunAt }).from(youtubeDiscoveryPlanningLeases).where(eq(youtubeDiscoveryPlanningLeases.id, "youtube-discovery-planning"));
  expect(lease).toMatchObject({ state: "queued", nextRunAt: expect.any(Date) });
  expect(lease!.nextRunAt.getTime()).toBeGreaterThan(Date.now());
}

describe.sequential("YouTube Discovery run execution", () => {
  beforeAll(() => {
    const databaseUrl = process.env.DATABASE_URL_TEST;
    if (!databaseUrl) throw new Error("DATABASE_URL_TEST is required for Discovery concurrency tests");
    firstWorkerSql = postgres(databaseUrl, { max: 1 });
    secondWorkerSql = postgres(databaseUrl, { max: 1 });
    firstWorker = drizzle(firstWorkerSql, { schema });
    secondWorker = drizzle(secondWorkerSql, { schema });
  });

  afterAll(async () => {
    await firstWorkerSql.end();
    await secondWorkerSql.end();
  });

  beforeEach(async () => { await resetTestDatabase(); });

  afterEach(() => { setYoutubeDiscoveryExecutionStageForTest(undefined); setYoutubeDiscoveryPlanningPortsForTest(undefined, undefined); });

  test("claims one due run and persists an atomic fenced terminal audit", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-a" }, testDb)).claim;
    expect(claim).toMatchObject({ id: run.id, attemptCount: 1, fencingToken: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect((await claimNextYoutubeDiscoveryRun({ workerId: "discovery-b" }, testDb)).claim).toBeNull();
    expect(await finishYoutubeDiscoveryRun(claim!, testDb)).toBe("completed");
    expect(await finishYoutubeDiscoveryRun(claim!, testDb)).toBe("contended");
    await expect(testDb.select().from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, run.id))).resolves.toMatchObject([{ state: "completed", terminalOutcome: "completed", claimedBy: null, fencingToken: null }]);
    const terminalAudits = await testDb.select().from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run_terminal"), eq(auditEvents.targetId, run.id)));
    expect(terminalAudits).toMatchObject([{ actorSystem: "system-youtube-discovery", afterSummary: JSON.stringify({ policyVersionId: policy.id, outcome: "completed", attemptCount: 1 }) }]);
    expect(terminalAudits).toHaveLength(1);
  });

  test("exhausts one run without affecting a later eligible run under the same policy", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { maxRetryAttempts: 1, retryDelayMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-a" }, testDb)).claim;
    expect(await retryYoutubeDiscoveryRun(claim!, testDb)).toBe("retrying");
    await testDb.update(youtubeDiscoveryRuns).set({ createdAt: new Date(0), nextRunAt: new Date(1) }).where(eq(youtubeDiscoveryRuns.id, run.id));
    const finalClaim = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-b" }, testDb)).claim;
    expect(await retryYoutubeDiscoveryRun(finalClaim!, testDb)).toBe("failed");
    await expect(testDb.select().from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, run.id))).resolves.toMatchObject([{ state: "failed", terminalOutcome: "failed", safeErrorCode: "retry_exhausted" }]);
    await expect(testDb.update(youtubeDiscoveryRuns).set({ nextRunAt: new Date(0) }).where(eq(youtubeDiscoveryRuns.id, run.id))).rejects.toThrow();
    expect((await claimNextYoutubeDiscoveryRun({ workerId: "discovery-c" }, testDb)).claim).toBeNull();

    const laterRun = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    const laterClaim = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-d" }, testDb)).claim;
    expect(laterClaim).toMatchObject({ id: laterRun.id, attemptCount: 1 });
    expect(await finishYoutubeDiscoveryRun(laterClaim!, testDb)).toBe("completed");

    await expect(testDb.select().from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, run.id))).resolves.toMatchObject([{ state: "failed", terminalOutcome: "failed", safeErrorCode: "retry_exhausted" }]);
    await expect(testDb.select().from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run_terminal"), eq(auditEvents.targetId, run.id)))).resolves.toHaveLength(1);
  });

  test("allows a zero retry limit one attempt before terminal exhaustion", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { maxRetryAttempts: 0 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-a" }, testDb)).claim;
    expect(claim).toMatchObject({ id: run.id, attemptCount: 1 });
    expect(await retryYoutubeDiscoveryRun(claim!, testDb)).toBe("failed");
    await expect(testDb.select().from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, run.id))).resolves.toMatchObject([{ state: "failed", attemptCount: 1, safeErrorCode: "retry_exhausted" }]);
  });

  test("uses separate physical connections without exceeding a policy concurrency snapshot", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { maxConcurrentRuns: 1 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    const [left, right] = await Promise.all([
      claimNextYoutubeDiscoveryRun({ workerId: "discovery-a" }, firstWorker),
      claimNextYoutubeDiscoveryRun({ workerId: "discovery-b" }, secondWorker),
    ]);
    expect([left.claim, right.claim].filter(Boolean)).toHaveLength(1);
  });

  test("allows one concurrent planning claim and audits the winning claim", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const [left, right] = await Promise.all([
      claimYoutubeDiscoveryPlanning("discovery-a", firstWorker),
      claimYoutubeDiscoveryPlanning("discovery-b", secondWorker),
    ]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    await expect(testDb.select({ actorSystem: auditEvents.actorSystem, afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetType, "youtube_discovery_planning"))).resolves.toEqual([{ actorSystem: "system-youtube-discovery", afterSummary: JSON.stringify({ action: "claim", reason: "due", policyVersionId: policy.id }) }]);
  });

  test("recovers an expired planning lease and records exactly one recovery audit", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const stale = await claimYoutubeDiscoveryPlanning("discovery-a", testDb);
    await testDb.update(youtubeDiscoveryPlanningLeases).set({ claimedAt: new Date(0), leaseExpiresAt: new Date(1) }).where(eq(youtubeDiscoveryPlanningLeases.id, "youtube-discovery-planning"));
    expect(await claimYoutubeDiscoveryPlanning("discovery-b", testDb)).toMatchObject({ policyVersionId: policy.id });
    await expect(testDb.select({ actorSystem: auditEvents.actorSystem, afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetType, "youtube_discovery_planning"))).resolves.toEqual([
      { actorSystem: "system-youtube-discovery", afterSummary: JSON.stringify({ action: "claim", reason: "due", policyVersionId: policy.id }) },
      { actorSystem: "system-youtube-discovery", afterSummary: JSON.stringify({ action: "recover_expired", reason: "lease_expired" }) },
      { actorSystem: "system-youtube-discovery", afterSummary: JSON.stringify({ action: "claim", reason: "due", policyVersionId: policy.id }) },
    ]);
    expect(stale).not.toBeNull();
  });

  test("cancels disabled planning with one safe system audit", async () => {
    await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const disabled = await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    expect(await claimYoutubeDiscoveryPlanning("discovery-a", testDb)).toBeNull();
    expect(await claimYoutubeDiscoveryPlanning("discovery-b", testDb)).toBeNull();
    await expect(testDb.select({ actorSystem: auditEvents.actorSystem, afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetType, "youtube_discovery_planning"))).resolves.toEqual([{ actorSystem: "system-youtube-discovery", afterSummary: JSON.stringify({ action: "cancel", reason: "policy_disabled", policyVersionId: disabled.id }) }]);
  });

  test("creates one proposal when two physical connections refresh the same planning claim", async () => {
    await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const claim = await claimYoutubeDiscoveryPlanning("discovery-a", testDb);
    const result = { status: "available" as const, signals: [{ reason: "coverage_gap" as const, geography: "Da Lat", taxonomy: "route", priority: 70 }] };
    const outcomes = await Promise.all([
      refreshYoutubeDiscoverySystemProposals(claim!, [result], firstWorker),
      refreshYoutubeDiscoverySystemProposals(claim!, [result], secondWorker),
    ]);
    expect(outcomes.filter((outcome) => outcome === "completed")).toHaveLength(1);
    await expect(testDb.select().from(youtubeDiscoveryQueryProposals)).resolves.toHaveLength(1);
  });

  test("does not deadlock a policy transition racing a planning refresh", async () => {
    await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const claim = await claimYoutubeDiscoveryPlanning("discovery-a", testDb);
    const results = await Promise.allSettled([
      createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false }, actor: createSystemAuditActor("system-youtube-discovery") }, firstWorker),
      refreshYoutubeDiscoverySystemProposals(claim!, [{ status: "available", signals: [{ reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 70 }] }], secondWorker),
    ]);

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(results[1]).toMatchObject({ status: "fulfilled", value: expect.stringMatching(/^(completed|cancelled|contended)$/) });
  });

  test("recovers an expired lease and fences its stale claimant", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    const stale = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-a" }, testDb)).claim;
    await testDb.update(youtubeDiscoveryRuns).set({ claimedAt: new Date(0), leaseExpiresAt: new Date(1) }).where(eq(youtubeDiscoveryRuns.id, run.id));
    const fresh = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-b" }, testDb)).claim;
    expect(fresh).toMatchObject({ id: run.id, attemptCount: 2 });
    expect(await finishYoutubeDiscoveryRun(stale!, testDb)).toBe("contended");
    expect(await finishYoutubeDiscoveryRun(fresh!, testDb)).toBe("completed");
  });

  test("fences stale completion, cancellation, and retry after lease reclaim", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    const stale = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-a" }, testDb)).claim;
    await testDb.update(youtubeDiscoveryRuns).set({ claimedAt: new Date(0), leaseExpiresAt: new Date(1) }).where(eq(youtubeDiscoveryRuns.id, run.id));
    const fresh = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-b" }, testDb)).claim;
    expect(await finishYoutubeDiscoveryRun(stale!, testDb)).toBe("contended");
    expect(await cancelYoutubeDiscoveryRunIfDisabled(stale!, testDb)).toBe("contended");
    expect(await retryYoutubeDiscoveryRun(stale!, testDb)).toBe("contended");
    await expect(testDb.select().from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, run.id))).resolves.toMatchObject([{ state: "running", claimedBy: "discovery-b", fencingToken: fresh!.fencingToken }]);
    await expect(testDb.select().from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run_terminal"), eq(auditEvents.targetId, run.id)))).resolves.toHaveLength(0);
    expect(await finishYoutubeDiscoveryRun(fresh!, testDb)).toBe("completed");
    await expect(testDb.select().from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run_terminal"), eq(auditEvents.targetId, run.id)))).resolves.toHaveLength(1);
  });

  test("cancels a pinned run when current global enablement is revoked", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-a" }, testDb)).claim;
    await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    expect(await finishYoutubeDiscoveryRun(claim!, testDb)).toBe("cancelled");
    await expect(testDb.execute(sql`select state, safe_error_code from youtube_discovery_runs where id = ${run.id}`)).resolves.toMatchObject([{ state: "cancelled", safe_error_code: "policy_revoked" }]);
  });

  test("cancels before an injected stage without continuation", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    let stageCalls = 0;
    setYoutubeDiscoveryExecutionStageForTest(async () => { stageCalls += 1; return "complete"; });
    await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    await expect(runYoutubeDiscoveryPoll("discovery-a")).resolves.toMatchObject({ resultCode: "success", durableId: run.id });
    expect(stageCalls).toBe(0);
    await expect(testDb.select().from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, run.id))).resolves.toMatchObject([{ state: "cancelled", safeErrorCode: "policy_revoked" }]);
    await expect(testDb.select().from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run_terminal"), eq(auditEvents.targetId, run.id)))).resolves.toHaveLength(1);
    await expect(runYoutubeDiscoveryPoll("discovery-b")).resolves.toMatchObject({ resultCode: "no_work" });
  });

  test("cancels before the final write when a stage revokes the policy", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    await completeDuePlanning();
    setYoutubeDiscoveryExecutionStageForTest(async () => {
      await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
      return "complete";
    });
    await expect(runYoutubeDiscoveryPoll("discovery-a")).resolves.toMatchObject({ resultCode: "success", durableId: run.id });
    await expect(testDb.select().from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, run.id))).resolves.toMatchObject([{ state: "cancelled", terminalOutcome: "cancelled", safeErrorCode: "policy_revoked" }]);
    await expect(testDb.select().from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run_terminal"), eq(auditEvents.targetId, run.id)))).resolves.toHaveLength(1);
    await expect(runYoutubeDiscoveryPoll("discovery-b")).resolves.toMatchObject({ resultCode: "no_work" });
  });

  test("cancels before retry requeue when a transient stage revokes the policy", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { maxRetryAttempts: 2 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    await completeDuePlanning();
    setYoutubeDiscoveryExecutionStageForTest(async () => {
      await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
      return "stage_transient";
    });
    await expect(runYoutubeDiscoveryPoll("discovery-a")).resolves.toMatchObject({ resultCode: "success", durableId: run.id });
    await expect(testDb.select().from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, run.id))).resolves.toMatchObject([{ state: "cancelled", terminalOutcome: "cancelled", safeErrorCode: "policy_revoked", claimedBy: null, fencingToken: null }]);
    await expect(testDb.select().from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run_terminal"), eq(auditEvents.targetId, run.id)))).resolves.toHaveLength(1);
    await expect(runYoutubeDiscoveryPoll("discovery-b")).resolves.toMatchObject({ resultCode: "no_work" });
  });

  test("converts a rejecting private stage seam into a fenced retry", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { maxRetryAttempts: 2 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    await completeDuePlanning();
    setYoutubeDiscoveryExecutionStageForTest(async () => { throw new Error("unsafe provider detail"); });
    await expect(runYoutubeDiscoveryPoll("discovery-a")).resolves.toMatchObject({ capability: "youtube.discovery", resultCode: "retry", durableId: run.id });
    await expect(testDb.select().from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, run.id))).resolves.toMatchObject([{ state: "retrying", safeErrorCode: "stage_transient", claimedBy: null }]);
    setYoutubeDiscoveryExecutionStageForTest(undefined);
  });

  test("aborts a timed-out planning read and fences its late resolution from proposal writes", async () => {
    await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    let resolveLate!: (value: { status: "available"; signals: Array<{ reason: "coverage_gap"; geography: string; taxonomy: string; priority: number }> }) => void;
    let aborted = false;
    setYoutubeDiscoveryPlanningPortsForTest((signal?: AbortSignal) => new Promise((resolve) => {
      resolveLate = resolve;
      signal?.addEventListener("abort", () => { aborted = true; });
    }), async () => ({ status: "available", signals: [] }));
    await expect(runYoutubeDiscoveryPoll("discovery-a")).resolves.toMatchObject({ capability: "youtube.discovery", resultCode: "success", durableId: "youtube-discovery-planning" });
    expect(aborted).toBe(true);
    resolveLate({ status: "available", signals: [{ reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 70 }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(testDb.select().from(youtubeDiscoveryQueryProposals)).resolves.toEqual([]);
  }, 3_000);

  test("observes recovery-only terminal maintenance safely", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { maxRetryAttempts: 0 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    await completeDuePlanning();
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-a" }, testDb)).claim;
    await testDb.update(youtubeDiscoveryRuns).set({ claimedAt: new Date(0), leaseExpiresAt: new Date(1) }).where(eq(youtubeDiscoveryRuns.id, run.id));
    await expect(runYoutubeDiscoveryPoll("discovery-b")).resolves.toEqual({ capability: "youtube.discovery", resultCode: "failure", leaseRecovery: "recovered", leaseRecoveryCount: 1 });
    expect(await finishYoutubeDiscoveryRun(claim!, testDb)).toBe("contended");
  });
});
