import { beforeEach, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";

import { auditEvents, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryRuns } from "@xuyenviet/database";

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
});
