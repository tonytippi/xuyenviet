import { beforeEach, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { RequestPrincipal } from "@xuyenviet/contracts";

import { auditEvents, claimYoutubeDiscoveryPlanning, createPostgresAdminYoutubeDiscoveryPort, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, refreshYoutubeDiscoverySystemProposals, scheduleYoutubeDiscoveryDueRuns, youtubeDiscoveryPlanningLeases, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryRuns } from "@xuyenviet/database";

import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

describe.sequential("YouTube Discovery foundation persistence", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  test("enforces one current immutable policy version and exact run snapshots", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    await seedTestOperator();
    const query = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "coverage_gap", priority: 50, queryText: "Đà Lạt đường đèo", cadenceMinutes: 1440, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: query.id }, testDb);

    const nextPolicy = await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    await expect(testDb.update(youtubeDiscoveryPolicyVersions).set({ retentionDays: 90 }).where(eq(youtubeDiscoveryPolicyVersions.id, policy.id))).rejects.toThrow();
    await expect(testDb.execute(sql`insert into youtube_discovery_runs (id, policy_version_id, state) values ('missing-policy', 'missing-policy', 'queued')`)).rejects.toThrow();
    await expect(createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb)).rejects.toThrow("current policy version");
    await expect(testDb.select({ policyVersionId: youtubeDiscoveryRuns.policyVersionId, state: youtubeDiscoveryRuns.state }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, run.id))).resolves.toEqual([{ policyVersionId: policy.id, state: "queued" }]);
    await expect(testDb.select({ id: youtubeDiscoveryPolicyVersions.id }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.id, nextPolicy.id))).resolves.toHaveLength(1);
    const audits = await testDb.select({ actorClass: auditEvents.actorClass, actorSystem: auditEvents.actorSystem, actorUserId: auditEvents.actorUserId, actorEmail: auditEvents.actorEmail, targetType: auditEvents.targetType, afterSummary: auditEvents.afterSummary }).from(auditEvents);
    expect(audits).toHaveLength(4);
    expect(audits).toEqual(expect.arrayContaining([
      { actorClass: "system", actorSystem: "system-youtube-discovery", actorUserId: null, actorEmail: null, targetType: "youtube_discovery_policy_version", afterSummary: JSON.stringify({ version: 1, enabled: true, minimumCandidateScore: 0.5, priorityScoreWeight: 0.6, freshnessScoreWeight: 0.4, cadenceMinutes: 1440, retentionDays: 180, commentSignalTtlDays: 30, maxConcurrentRuns: 1, maxRetryAttempts: 3, retryDelayMinutes: 15 }) },
      { actorClass: "system", actorSystem: "system-youtube-discovery", actorUserId: null, actorEmail: null, targetType: "youtube_discovery_policy_version", afterSummary: JSON.stringify({ version: 2, enabled: true, minimumCandidateScore: 0.5, priorityScoreWeight: 0.6, freshnessScoreWeight: 0.4, cadenceMinutes: 1440, retentionDays: 180, commentSignalTtlDays: 30, maxConcurrentRuns: 1, maxRetryAttempts: 3, retryDelayMinutes: 15 }) },
      { actorClass: "user", actorSystem: null, actorUserId: "operator", actorEmail: "operator@example.com", targetType: "youtube_discovery_query_proposal", afterSummary: JSON.stringify({ origin: "operator", priority: 50, enabled: true, cadenceMinutes: 1440 }) },
      { actorClass: "system", actorSystem: "system-youtube-discovery", actorUserId: null, actorEmail: null, targetType: "youtube_discovery_run", afterSummary: JSON.stringify({ policyVersionId: policy.id, state: "queued" }) },
    ]));
    expect(audits.find((audit) => audit.targetType === "youtube_discovery_query_proposal")?.afterSummary).not.toContain("coverage_gap");
  });

  test("rolls back a policy insert when its audit row cannot be persisted", async () => {
    await expect(createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createUserAuditActor({ userId: "missing-operator", email: "missing@example.com" }) }, testDb)).rejects.toThrow();

    await expect(testDb.select().from(youtubeDiscoveryPolicyVersions)).resolves.toEqual([]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "youtube_discovery_policy_version"))).resolves.toEqual([]);
  });

  test("rolls back a query proposal when its audit row cannot be persisted", async () => {
    await expect(createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "coverage_gap", priority: 50, queryText: "Đà Lạt đường đèo", cadenceMinutes: 1440, actor: createUserAuditActor({ userId: "missing-operator", email: "missing@example.com" }) }, testDb)).rejects.toThrow();

    await expect(testDb.select().from(youtubeDiscoveryQueryProposals)).resolves.toEqual([]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "youtube_discovery_query_proposal"))).resolves.toEqual([]);
  });

  test("does not create runs from a disabled current policy", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { enabled: false }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);

    await expect(createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb)).rejects.toThrow("enabled current policy version");
    await expect(testDb.select().from(youtubeDiscoveryRuns)).resolves.toEqual([]);
  });

  test("rejects disabled queries and invalid policy or query persistence", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const query = await createYoutubeDiscoveryQueryProposal({ origin: "system", reason: "coverage_gap", priority: 50, queryText: "Da Lat route", enabled: false, cadenceMinutes: 1440, actor: createSystemAuditActor("system-youtube-discovery"), systemSignal: { reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 50 } }, testDb);

    await expect(createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: query.id }, testDb)).rejects.toThrow("enabled query proposal");
    await expect(testDb.execute(sql`insert into youtube_discovery_policy_versions (id, version, is_current, enabled, minimum_candidate_score, priority_score_weight, freshness_score_weight, cadence_minutes, retention_days, comment_signal_ttl_days, max_concurrent_runs, max_retry_attempts, retry_delay_minutes) values ('invalid-policy', 2, false, true, 0.5, 0.6, 0.4, 14, 180, 30, 1, 3, 15)`)).rejects.toThrow();
    await expect(testDb.execute(sql`insert into youtube_discovery_query_proposals (id, origin, reason, priority, query_text, enabled, cadence_minutes) values ('unsafe-query', 'system', 'not_a_safe_reason', 50, 'https://example.com/?token=secret', true, 1440)`)).rejects.toThrow();
  });

  test("audits each fenced system proposal upsert without storing signal values", async () => {
    await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const claim = await claimYoutubeDiscoveryPlanning("discovery-a", testDb);
    expect(claim).not.toBeNull();
    await expect(refreshYoutubeDiscoverySystemProposals(claim!, [{ status: "available", signals: [{ reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 70 }] }], testDb)).resolves.toBe("completed");
    const proposal = await testDb.select().from(youtubeDiscoveryQueryProposals);
    const audits = await testDb.select({ targetId: auditEvents.targetId, afterSummary: auditEvents.afterSummary, actorSystem: auditEvents.actorSystem }).from(auditEvents).where(eq(auditEvents.targetType, "youtube_discovery_query_proposal"));
    expect(proposal).toHaveLength(1);
    expect(audits).toEqual([{ targetId: proposal[0]!.id, actorSystem: "system-youtube-discovery", afterSummary: JSON.stringify({ origin: "system", priority: 70, enabled: true, cadenceMinutes: 15 }) }]);
    expect(audits[0]!.afterSummary).not.toContain("Da Lat");
  });

  test("does not catch up planning or proposal intervals after global disable", async () => {
    const enabled = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    await seedTestOperator();
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    await testDb.update(youtubeDiscoveryQueryProposals).set({ scheduleAnchorAt: new Date(0), nextDueAt: new Date(1) }).where(eq(youtubeDiscoveryQueryProposals.id, proposal.id));
    await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false, cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    expect(await scheduleYoutubeDiscoveryDueRuns(testDb)).toBe(0);
    expect((await testDb.select({ nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.id, proposal.id)))[0]!.nextDueAt).toBeNull();
    expect(await claimYoutubeDiscoveryPlanning("discovery-a", testDb)).toBeNull();
    await expect(testDb.select({ state: youtubeDiscoveryPlanningLeases.state }).from(youtubeDiscoveryPlanningLeases)).resolves.toEqual([{ state: "cancelled" }]);
    await createYoutubeDiscoveryPolicyVersion({ version: 3, isCurrent: true, policy: { cadenceMinutes: 15 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    expect(await claimYoutubeDiscoveryPlanning("discovery-b", testDb)).toBeNull();
    expect(await scheduleYoutubeDiscoveryDueRuns(testDb)).toBe(0);
    const resumed = (await testDb.select({ nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.id, proposal.id)))[0]!.nextDueAt;
    expect(resumed).toBeInstanceOf(Date);
    expect(resumed!.getTime()).toBeGreaterThan(Date.now());
    expect(enabled.id).toBeTruthy();
  });

  test("preserves origin and attributes every operator command to the authenticated user", async () => {
    await seedTestOperator();
    await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const port = createPostgresAdminYoutubeDiscoveryPort();
    const principal: RequestPrincipal = { userId: "operator", email: "operator@example.com", roles: ["operator"], authorizationVersion: 1, sessionId: "operator-session" };
    const created = await port.create(principal, { queryText: "Da Lat route", priority: 40, cadenceMinutes: 15 });
    await port.edit(principal, created.id, "Da Lat pass route");
    await port.reprioritize(principal, created.id, 70);
    await port.pause(principal, created.id);
    const resumed = await port.resume(principal, created.id);
    expect(resumed).toMatchObject({ origin: "operator", enabled: true, priority: 70, queryText: "Da Lat pass route" });
    await expect(testDb.select({ origin: youtubeDiscoveryQueryProposals.origin }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.id, created.id))).resolves.toEqual([{ origin: "operator" }]);
    await expect(testDb.select({ actorUserId: auditEvents.actorUserId, actorSystem: auditEvents.actorSystem }).from(auditEvents).where(eq(auditEvents.targetId, created.id))).resolves.toEqual(Array.from({ length: 5 }, () => ({ actorUserId: "operator", actorSystem: null })));
  });

  test("uses one singleton planning lease and fences a stale planner", async () => {
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const stale = await claimYoutubeDiscoveryPlanning("discovery-a", testDb);
    expect(stale).not.toBeNull();
    await testDb.update(youtubeDiscoveryPlanningLeases).set({ claimedAt: new Date(0), leaseExpiresAt: new Date(1) }).where(eq(youtubeDiscoveryPlanningLeases.id, "youtube-discovery-planning"));
    const fresh = await claimYoutubeDiscoveryPlanning("discovery-b", testDb);
    expect(fresh).toMatchObject({ id: "youtube-discovery-planning", policyVersionId: policy.id });
    expect(fresh!.fencingToken).not.toBe(stale!.fencingToken);
    expect(await refreshYoutubeDiscoverySystemProposals(stale!, [], testDb)).toBe("contended");
    expect(await refreshYoutubeDiscoverySystemProposals(fresh!, [], testDb)).toBe("completed");
  });

  test("admits each due interval once without driver-error duplicate recovery", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    await testDb.update(youtubeDiscoveryQueryProposals).set({ scheduleAnchorAt: new Date(0), nextDueAt: new Date(1) }).where(eq(youtubeDiscoveryQueryProposals.id, proposal.id));
    expect(await scheduleYoutubeDiscoveryDueRuns(testDb)).toBe(1);
    expect(await scheduleYoutubeDiscoveryDueRuns(testDb)).toBe(1);
    const runs = await testDb.select({ scheduleIntervalAt: youtubeDiscoveryRuns.scheduleIntervalAt }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.queryProposalId, proposal.id));
    expect(runs).toHaveLength(2);
    expect(runs[0]!.scheduleIntervalAt).not.toEqual(runs[1]!.scheduleIntervalAt);
    await expect(createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id, scheduleIntervalAt: runs[0]!.scheduleIntervalAt! }, testDb)).resolves.toBeNull();
  });
});
