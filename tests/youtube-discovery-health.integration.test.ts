import { beforeEach, describe, expect, test } from "vitest";
import { aiUsageEvents, createPostgresAdminYoutubeDiscoveryPort, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, claimNextYoutubeDiscoveryRun, finishYoutubeDiscoveryRun, retryYoutubeDiscoveryRun, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryQueryProposals, youtubeDiscoveryRankingHistory, youtubeDiscoveryRuns } from "@xuyenviet/database";
import { parseAdminYoutubeDiscoveryHealthOverview } from "@xuyenviet/contracts";
import { eq, sql } from "drizzle-orm";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

describe.sequential("YouTube Discovery Health projections", () => {
  beforeEach(resetTestDatabase);

  test("returns populated overview and admitted incident detail without writes", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { maxRetryAttempts: 0 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "health-fixture" }, testDb)).claim;
    if (!claim) throw new Error("expected claim");
    expect(await retryYoutubeDiscoveryRun(claim, "provider_rate_limited", testDb)).toBe("failed");
    const before = await snapshot();
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);

    const overview = await port.healthOverview();
    const groupId = `${proposal.id}:provider_rate_limited`;
    const detail = await port.getHealthIncident(groupId, null);

    expect(overview).toMatchObject({ lastUpdatedAt: expect.any(String), policy: { enabled: true }, planning: { freshness: "unavailable", lastUpdatedAt: null }, latestQueryRun: { at: expect.any(String), lastUpdatedAt: expect.any(String), freshness: "current" }, querySchedule: { lastUpdatedAt: expect.any(String), freshness: "current" } });
    expect(overview.incidents).toEqual([{ kind: "health_incident", actionId: groupId, destination: "health", reason: "provider_rate_limited", priority: 10, occurredAt: expect.any(String) }]);
    expect(parseAdminYoutubeDiscoveryHealthOverview(overview)).toEqual(overview);
    expect(detail).toMatchObject({ groupId, category: "provider_rate_limited", items: [{ runId: expect.any(String), at: expect.any(String) }], nextCursor: null });
    expect(detail?.items).toEqual([expect.objectContaining({ runId: run.id, state: "failed", stage: "unavailable", phase: "terminal", category: "provider_rate_limited" })]);
    expect(await snapshot()).toEqual(before);
  });

  test("preserves an enabled policy when no enabled proposal can supply a schedule", async () => {
    await seedTestOperator();
    await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { enabled: true, cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.querySchedule).toMatchObject({ enabled: true, cadenceMinutes: 15, nextRunAt: null, lastUpdatedAt: expect.any(String), freshness: "unavailable" });
    expect(overview.policy).toEqual({ enabled: true });
    expect(overview.latestQueryRun).toMatchObject({ state: "no_run", freshness: "unavailable" });
    expect(overview.usage).toEqual({ availability: "missing", requests: 0, totalTokens: null, costMicros: null, lastUpdatedAt: null, freshness: "unavailable" });
  });

  test("derives a new enabled schedule's health from its durable schedule without a run", async () => {
    await seedTestOperator();
    await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { enabled: true, cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.querySchedule).toMatchObject({ enabled: true, cadenceMinutes: 15, nextRunAt: null, lastUpdatedAt: expect.any(String), freshness: "current" });
    expect(overview.latestQueryRun).toMatchObject({ state: "no_run", freshness: "unavailable" });
    const [durableSchedule] = await testDb.select({ scheduleAnchorAt: youtubeDiscoveryQueryProposals.scheduleAnchorAt, createdAt: youtubeDiscoveryQueryProposals.createdAt }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.id, proposal.id));
    expect(overview.querySchedule.lastUpdatedAt).toEqual((durableSchedule!.scheduleAnchorAt ?? durableSchedule!.createdAt).toISOString());
  });

  test("does not let a recent query run mask an old enabled schedule", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { enabled: true, cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    await testDb.update(youtubeDiscoveryQueryProposals).set({ scheduleAnchorAt: new Date(Date.now() - 31 * 60_000), nextDueAt: new Date(Date.now() - 16 * 60_000) }).where(eq(youtubeDiscoveryQueryProposals.id, proposal.id));

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.querySchedule).toMatchObject({ enabled: true, nextRunAt: expect.any(String), lastUpdatedAt: expect.any(String), freshness: "stale" });
    expect(overview.latestQueryRun).toMatchObject({ state: "queued", at: expect.any(String), freshness: "current" });
    expect(overview.querySchedule.lastUpdatedAt).not.toEqual(overview.latestQueryRun.lastUpdatedAt);
    expect(run.id).toEqual(expect.any(String));
  });

  test("reports global policy as unavailable without deriving it from query schedules", async () => {
    await seedTestOperator();

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.policy).toEqual({ enabled: null });
    expect(overview.querySchedule).toEqual({ enabled: null, cadenceMinutes: null, nextRunAt: null, lastUpdatedAt: null, freshness: "unavailable" });
    expect(overview.throughput).toEqual({ windowHours: 24, discovered: 0, enriched: 0, triaged: 0, recommended: 0, lastUpdatedAt: null, freshness: "unavailable" });
  });

  test("retains bounded empty-window counts while marking older throughput stale", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    await testDb.insert(youtubeDiscoveryCandidates).values({ id: "health-candidate", videoId: "abcDEF12345", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345" });
    await testDb.insert(youtubeDiscoveryRankingHistory).values({ id: "health-history", candidateId: "health-candidate", runId: run.id, policyVersionId: policy.id, stage: "enriched", createdAt: new Date(Date.now() - 25 * 3_600_000) });

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.throughput).toMatchObject({ discovered: 0, enriched: 0, triaged: 0, recommended: 0, lastUpdatedAt: expect.any(String), freshness: "stale" });
  });

  test("reports the schedule disabled when all query proposals are operator-paused", async () => {
    await seedTestOperator();
    await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { enabled: true, cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", enabled: false, cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.querySchedule).toMatchObject({ enabled: false, cadenceMinutes: 15, nextRunAt: null, freshness: "unavailable" });
    expect(overview.policy).toEqual({ enabled: true });
  });

  test("preserves the latest durable query result while globally paused", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { enabled: true, cadenceMinutes: 15, maxRetryAttempts: 0 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "health-fixture" }, testDb)).claim;
    if (!claim) throw new Error("expected claim");
    expect(await retryYoutubeDiscoveryRun(claim, "provider_rate_limited", testDb)).toBe("failed");
    await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false, cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.querySchedule).toMatchObject({ enabled: false, cadenceMinutes: 15, nextRunAt: null, freshness: "unavailable" });
    expect(overview.policy).toEqual({ enabled: false });
    expect(overview.latestQueryRun).toMatchObject({ state: "failed", at: expect.any(String), lastUpdatedAt: expect.any(String), freshness: "current" });
  });

  test("does not project a retry opportunity while Discovery is globally paused", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { enabled: true, cadenceMinutes: 15, maxRetryAttempts: 1 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "health-fixture" }, testDb)).claim;
    if (!claim) throw new Error("expected claim");
    expect(await retryYoutubeDiscoveryRun(claim, "provider_rate_limited", testDb)).toBe("retrying");
    await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false, cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.policy).toEqual({ enabled: false });
    expect(overview.querySchedule.nextRunAt).toBeNull();
    expect(overview.latestQueryRun).toMatchObject({ state: "retrying", nextRunAt: null });
    expect(parseAdminYoutubeDiscoveryHealthOverview(overview)).toEqual(overview);
  });

  test("orders and bounds paused context while fencing only live claimed runs with safe timestamps", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const runs = await Promise.all(Array.from({ length: 25 }, () => createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb)));
    const now = Date.now();
    const claimedAt = [new Date(now - 1_000), new Date(now - 2_000), new Date(now - 2_000)];
    const terminalAt = Array.from({ length: 20 }, (_, index) => new Date(now - (index + 10) * 1_000));
    const claim = (at: Date, leaseExpiresAt: ReturnType<typeof sql>) => ({ claimedBy: "paused-context", claimedAt: at, leaseExpiresAt, fencingToken: "a".repeat(64) });
    await Promise.all([
      ...runs.slice(4, 7).map((run, index) => testDb.update(youtubeDiscoveryRuns).set({ state: "cancelled", terminalAt: new Date(now - (index + 4) * 1_000), terminalOutcome: "cancelled", safeErrorCode: "policy_revoked" }).where(eq(youtubeDiscoveryRuns.id, run.id))),
      ...runs.slice(7).map((run, index) => testDb.update(youtubeDiscoveryRuns).set({ state: "completed", terminalAt: terminalAt[index]!, terminalOutcome: "completed" }).where(eq(youtubeDiscoveryRuns.id, run.id))),
    ]);
    const disabled = await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false, maxConcurrentRuns: 3 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    await Promise.all([
      ...runs.slice(0, 3).map((run, index) => testDb.update(youtubeDiscoveryRuns).set({ state: "running", ...claim(claimedAt[index]!, sql`clock_timestamp() + interval '1 hour'`) }).where(eq(youtubeDiscoveryRuns.id, run.id))),
      testDb.update(youtubeDiscoveryRuns).set({ state: "running", ...claim(new Date(now - 3_000), sql`clock_timestamp() - interval '1 second'`) }).where(eq(youtubeDiscoveryRuns.id, runs[3]!.id)),
    ]);
    const persisted = await testDb.select({ id: youtubeDiscoveryRuns.id, state: youtubeDiscoveryRuns.state, claimedAt: youtubeDiscoveryRuns.claimedAt, leaseExpiresAt: youtubeDiscoveryRuns.leaseExpiresAt }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, runs[0]!.id));
    expect(persisted[0]).toMatchObject({ state: "running", claimedAt: claimedAt[0], leaseExpiresAt: expect.any(Date) });

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.pausedRuns).toEqual([
      ...runs.slice(0, 3).sort((left, right) => claimedAt[runs.indexOf(right)]!.getTime() - claimedAt[runs.indexOf(left)]!.getTime() || left.id.localeCompare(right.id)).map((run) => ({ runId: run.id, state: "fencing_requested" as const, at: claimedAt[runs.indexOf(run)]!.toISOString() })),
      ...runs.slice(4, 7).map((run, index) => ({ runId: run.id, state: "policy_revoked" as const, at: new Date(now - (index + 4) * 1_000).toISOString() })),
      ...runs.slice(7, 21).map((run, index) => ({ runId: run.id, state: "completed_before_disabled" as const, at: terminalAt[index]!.toISOString() })),
    ]);
    expect(overview.pausedRuns).toHaveLength(20);
    expect(overview.pausedRuns.some((run) => run.runId === runs[3]!.id)).toBe(false);
    expect(overview.pausedRuns[0]?.at).not.toEqual(disabled.createdAt.toISOString());
    expect(overview.pausedRuns.every((run) => Object.keys(run).sort().join(",") === "at,runId,state")).toBe(true);
  });

  test("selects the latest terminal query result with a deterministic run-ID tie-breaker", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const completed = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "health-fixture" }, testDb)).claim;
    if (!claim) throw new Error("expected claim");
    expect(await finishYoutubeDiscoveryRun(claim, testDb)).toBe("completed");
    const queued = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const tied = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const terminalAt = new Date("2030-08-10T00:00:00.000Z");
    await testDb.transaction(async (transaction) => {
      await transaction.execute(sql`set local session_replication_role = replica`);
      await transaction.update(youtubeDiscoveryRuns).set({ createdAt: new Date("2030-08-01T00:00:00.000Z"), terminalAt }).where(eq(youtubeDiscoveryRuns.id, completed.id));
      await transaction.update(youtubeDiscoveryRuns).set({ createdAt: new Date("2030-08-05T00:00:00.000Z") }).where(eq(youtubeDiscoveryRuns.id, queued.id));
      await transaction.update(youtubeDiscoveryRuns).set({ createdAt: terminalAt }).where(eq(youtubeDiscoveryRuns.id, tied.id));
    });

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.latestQueryRun).toMatchObject({ state: completed.id > tied.id ? "completed" : "queued", at: terminalAt.toISOString(), lastUpdatedAt: terminalAt.toISOString() });
  });

  test("exposes only the safe next attempt for retrying run and incident detail", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { cadenceMinutes: 15, maxRetryAttempts: 1 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "health-fixture" }, testDb)).claim;
    if (!claim) throw new Error("expected claim");
    expect(await retryYoutubeDiscoveryRun(claim, "provider_rate_limited", testDb)).toBe("retrying");

    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    const overview = await port.healthOverview();
    const detail = await port.getHealthIncident(`${proposal.id}:provider_rate_limited`, null);

    expect(overview.latestQueryRun).toMatchObject({ state: "retrying", nextRunAt: expect.any(String), lastUpdatedAt: expect.any(String), freshness: "current" });
    expect(detail?.items).toEqual([expect.objectContaining({ runId: run.id, state: "retrying", stage: "unavailable", phase: "retrying", nextRunAt: expect.any(String) })]);
  });

  test.each(["triage_schema_invalid", "execution_terminal"] as const)("limits %s detail to the currently admitted incident episode", async (category) => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { maxRetryAttempts: 0 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const stale = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const staleClaim = (await claimNextYoutubeDiscoveryRun({ workerId: `stale-${category}` }, testDb)).claim;
    if (!staleClaim) throw new Error("expected stale claim");
    expect(await finishYoutubeDiscoveryRun(staleClaim, testDb)).toBe("completed");
    await testDb.transaction(async (transaction) => {
      await transaction.execute(sql`set local session_replication_role = replica`);
      await transaction.update(youtubeDiscoveryRuns).set({ incidentCategory: category, terminalAt: sql`clock_timestamp() - interval '48 hours'` }).where(eq(youtubeDiscoveryRuns.id, stale.id));
    });
    const currentIds: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
      const claim = (await claimNextYoutubeDiscoveryRun({ workerId: `current-${category}-${index}` }, testDb)).claim;
      if (!claim) throw new Error("expected current claim");
      expect(await retryYoutubeDiscoveryRun(claim, category === "execution_terminal" ? undefined : category, testDb)).toBe("failed");
      currentIds.push(run.id);
    }

    const detail = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).getHealthIncident(`${proposal.id}:${category}`, null);

    expect(detail?.items.map((item) => item.runId).sort()).toEqual(currentIds.sort());
    expect(detail?.items).toEqual(expect.arrayContaining([expect.objectContaining({ state: "failed", stage: "unavailable", phase: "terminal", category })]));
  });

  test("bounds usage totals to the documented 24-hour window while retaining all-time freshness", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const events = await testDb.insert(aiUsageEvents).values([
      { youtubeDiscoveryRunId: run.id, executorSystem: "system-youtube-discovery", purpose: "youtube_discovery_triage", provider: "test", model: "test", promptVersion: "v1", status: "success", totalTokens: 5, estimatedTotalCostMicros: 7 },
      { youtubeDiscoveryRunId: run.id, executorSystem: "system-youtube-discovery", purpose: "youtube_discovery_triage", provider: "test", model: "test", promptVersion: "v1", status: "success", totalTokens: null, estimatedTotalCostMicros: null },
      { youtubeDiscoveryRunId: run.id, executorSystem: "system-youtube-discovery", purpose: "youtube_discovery_triage", provider: "test", model: "test", promptVersion: "v1", status: "success", totalTokens: 13, estimatedTotalCostMicros: 17 },
    ]).returning({ id: aiUsageEvents.id });
    await Promise.all([
      testDb.update(aiUsageEvents).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(aiUsageEvents.id, events[0]!.id)),
      testDb.update(aiUsageEvents).set({ createdAt: new Date(Date.now() - 3_600_000) }).where(eq(aiUsageEvents.id, events[1]!.id)),
      testDb.update(aiUsageEvents).set({ createdAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(aiUsageEvents.id, events[2]!.id)),
    ]);

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.usage).toMatchObject({ availability: "incomplete_usage", requests: 2, totalTokens: null, costMicros: null, freshness: "current", lastUpdatedAt: expect.any(String) });
  });

  test("reports incomplete pricing separately when all qualifying token usage is present", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 10, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    await testDb.insert(aiUsageEvents).values({ youtubeDiscoveryRunId: run.id, executorSystem: "system-youtube-discovery", purpose: "youtube_discovery_triage", provider: "test", model: "test", promptVersion: "v1", status: "success", totalTokens: 5, estimatedTotalCostMicros: null });

    const overview = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(overview.usage).toMatchObject({ availability: "incomplete_pricing", requests: 1, totalTokens: 5, costMicros: null, freshness: "current", lastUpdatedAt: expect.any(String) });
  });

});

async function snapshot() { return { runs: await testDb.select({ id: youtubeDiscoveryRuns.id, state: youtubeDiscoveryRuns.state, terminalAt: youtubeDiscoveryRuns.terminalAt }).from(youtubeDiscoveryRuns), reviews: await testDb.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId, deferredAt: youtubeDiscoveryCandidateReviewStates.deferredAt }).from(youtubeDiscoveryCandidateReviewStates) }; }
