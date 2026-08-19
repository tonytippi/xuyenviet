import { beforeEach, describe, expect, test } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { RequestPrincipal } from "@xuyenviet/contracts";
import { auditEvents, createPostgresAdminYoutubeDiscoveryPort, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, claimNextYoutubeDiscoveryCandidateJob, claimNextYoutubeDiscoveryRun, finishYoutubeDiscoveryCandidateJob, finishYoutubeDiscoveryRun, getYoutubeDiscoveryRecommendationBundle, knowledgeCards, knowledgeRecommendations, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEligibility, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryRecommendation, persistYoutubeDiscoveryTriage, retryYoutubeDiscoveryRun, selectYoutubeDiscoveryTriageModel, users, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryCandidateJobs, youtubeDiscoveryKnowledgeHandoffs, youtubeDiscoveryQueryProposals, youtubeDiscoveryRuns, aiGatewayModels } from "@xuyenviet/database";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";
import { bindYoutubeDiscoveryExecutionPorts, runYoutubeDiscoveryPoll } from "../packages/worker-domain/src/features/youtube-discovery/execution";

const principal: RequestPrincipal = { userId: "operator", email: "operator@example.com", roles: ["operator"], sessionId: "story-23-3", authorizationVersion: 1 };
const confirmationKey = "story23immediateconfirm";

describe.sequential("Story 23.3 immediate Discovery runs", () => {
  beforeEach(async () => { await resetTestDatabase(); await seedTestOperator(); });

  test("admits one immediate run idempotently without advancing the scheduled due time, and a worker can claim it", async () => {
    const { query } = await enabledQuery();
    const scheduledDueAt = query.nextDueAt!;
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);

    const first = await port.admitImmediateRun(principal, query.id, confirmationKey);
    const duplicate = await port.admitImmediateRun(principal, query.id, confirmationKey);

    expect(first).toEqual(duplicate);
    await expect(testDb.select({ id: youtubeDiscoveryRuns.id, queryProposalId: youtubeDiscoveryRuns.queryProposalId, immediateOperatorUserId: youtubeDiscoveryRuns.immediateOperatorUserId, immediateConfirmationKey: youtubeDiscoveryRuns.immediateConfirmationKey, scheduleIntervalAt: youtubeDiscoveryRuns.scheduleIntervalAt }).from(youtubeDiscoveryRuns)).resolves.toEqual([{ id: first!.runId, queryProposalId: query.id, immediateOperatorUserId: principal.userId, immediateConfirmationKey: confirmationKey, scheduleIntervalAt: null }]);
    await expect(testDb.select({ nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.id, query.id))).resolves.toEqual([{ nextDueAt: scheduledDueAt }]);

    expect((await claimNextYoutubeDiscoveryRun({ workerId: "story-23-3-worker" }, testDb)).claim).toMatchObject({ id: first!.runId, attemptCount: 1 });
  });

  test("does not admit an immediate run when the policy is disabled or the query is paused", async () => {
    const { policy, query } = await enabledQuery();
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);

    await port.setEnabled(principal, false);
    await expect(port.admitImmediateRun(principal, query.id, confirmationKey)).resolves.toBeNull();
    await expect(testDb.select().from(youtubeDiscoveryRuns)).resolves.toEqual([]);

    await createYoutubeDiscoveryPolicyVersion({ version: policy.version + 2, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    await port.pause(principal, query.id);
    await expect(port.admitImmediateRun(principal, query.id, confirmationKey)).resolves.toBeNull();
    await expect(testDb.select().from(youtubeDiscoveryRuns)).resolves.toEqual([]);
  });

  test("returns one active immediate run for concurrent confirmations without another admission audit", async () => {
    const { query } = await enabledQuery();
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    const [first, second] = await Promise.all([port.admitImmediateRun(principal, query.id, "story23concurrentone"), port.admitImmediateRun(principal, query.id, "story23concurrenttwo")]);
    expect(first).toEqual(second);
    await expect(testDb.select({ id: youtubeDiscoveryRuns.id }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.queryProposalId, query.id))).resolves.toHaveLength(1);
    await expect(testDb.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run"), eq(auditEvents.targetId, first!.runId)))).resolves.toHaveLength(1);
  });

  test("deduplicates concurrent delivery of the same operator query confirmation", async () => {
    const { query } = await enabledQuery();
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    const [first, second] = await Promise.all([port.admitImmediateRun(principal, query.id, confirmationKey), port.admitImmediateRun(principal, query.id, confirmationKey)]);
    expect(first).toEqual(second);
    await expect(testDb.select({ id: youtubeDiscoveryRuns.id }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.queryProposalId, query.id))).resolves.toHaveLength(1);
    await expect(testDb.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run"), eq(auditEvents.targetId, first!.runId)))).resolves.toHaveLength(1);
  });

  test("scopes a confirmation key to its operator after the first run is terminal", async () => {
    const { query } = await enabledQuery();
    const other: RequestPrincipal = { userId: "operator-two", email: "operator-two@example.com", roles: ["operator"], sessionId: "story-23-3-two", authorizationVersion: 1 };
    await testDb.insert(users).values({ id: other.userId, email: other.email });
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    const first = await port.admitImmediateRun(principal, query.id, confirmationKey);
    if (!first) throw new Error("expected first admission");
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "story-23-3-operator-scope" }, testDb)).claim;
    if (!claim) throw new Error("expected claim");
    await finishYoutubeDiscoveryRun(claim, testDb);
    const second = await port.admitImmediateRun(other, query.id, confirmationKey);
    expect(second?.runId).not.toBe(first.runId);
    await expect(testDb.select({ operator: youtubeDiscoveryRuns.immediateOperatorUserId, key: youtubeDiscoveryRuns.immediateConfirmationKey }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.queryProposalId, query.id))).resolves.toEqual(expect.arrayContaining([{ operator: principal.userId, key: confirmationKey }, { operator: other.userId, key: confirmationKey }]));
  });

  test("runs an admitted immediate query through the existing Worker search and terminal path", async () => {
    const { query } = await enabledQuery();
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    const admitted = await port.admitImmediateRun(principal, query.id, confirmationKey);
    if (!admitted) throw new Error("expected immediate admission");
    bindYoutubeDiscoveryExecutionPorts({ check: async () => "eligible" }, async () => [{ videoId: "story233poll", canonicalUrl: "https://www.youtube.com/watch?v=story233poll", resultOrdinal: 0, searchTranche: "medium" }], "test-key");
    await expect(runYoutubeDiscoveryPoll("story-23-3-poll-plan")).resolves.toMatchObject({ durableId: "youtube-discovery-planning", resultCode: "success" });
    await expect(runYoutubeDiscoveryPoll("story-23-3-poll")).resolves.toMatchObject({ executionKind: "query_run", durableId: admitted.runId, resultCode: "success" });
    await expect(testDb.select({ state: youtubeDiscoveryRuns.state, terminalOutcome: youtubeDiscoveryRuns.terminalOutcome }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, admitted.runId))).resolves.toEqual([{ state: "completed", terminalOutcome: "completed" }]);
    await expect(testDb.select({ runId: youtubeDiscoveryCandidateJobs.runId }).from(youtubeDiscoveryCandidateJobs).where(eq(youtubeDiscoveryCandidateJobs.runId, admitted.runId))).resolves.toHaveLength(1);
    await expect(testDb.select({ actorUserId: auditEvents.actorUserId, actorSystem: auditEvents.actorSystem }).from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run"), eq(auditEvents.targetId, admitted.runId)))).resolves.toEqual([{ actorUserId: principal.userId, actorSystem: null }]);
    await expect(testDb.select({ actorSystem: auditEvents.actorSystem }).from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run_terminal"), eq(auditEvents.targetId, admitted.runId)))).resolves.toEqual([{ actorSystem: "system-youtube-discovery" }]);
  });

  test("projects bounded immediate progress and does not write Capture or Knowledge data", async () => {
    const { query } = await enabledQuery();
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    const admitted = await port.admitImmediateRun(principal, query.id, confirmationKey);
    if (!admitted) throw new Error("expected immediate admission");
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "story-23-3-progress" }, testDb)).claim;
    if (!claim) throw new Error("expected immediate claim");

    await persistYoutubeDiscoveryCandidates(claim, [{ videoId: "story233video", canonicalUrl: "https://www.youtube.com/watch?v=story233video", resultOrdinal: 0, searchTranche: "medium" }], testDb);
    const candidateJob = (await claimNextYoutubeDiscoveryCandidateJob({ workerId: "story-23-3-candidate" }, testDb)).claim;
    if (!candidateJob) throw new Error("expected candidate job claim");
    const [candidate] = await testDb.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, "story233video"));
    if (!candidate) throw new Error("expected candidate");
    const models = await testDb.select({ id: aiGatewayModels.id }).from(aiGatewayModels).where(eq(aiGatewayModels.purpose, "youtube_discovery_triage"));
    if (!models.length) await testDb.insert(aiGatewayModels).values({ id: "story-23-3-model", gatewayModelName: "test/story-23-3", displayLabel: "Story 23.3", purpose: "youtube_discovery_triage", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 });
    const model = await selectYoutubeDiscoveryTriageModel(testDb);
    if (!model) throw new Error("expected triage model");
    await persistYoutubeDiscoveryEnrichment(candidateJob, { videoId: "story233video", durationSeconds: 180, defaultAudioLanguage: "vi", signals: [] }, testDb);
    await persistYoutubeDiscoveryEligibility(candidateJob, { videoId: "story233video", durationSeconds: 180, defaultAudioLanguage: "vi" }, testDb);
    await persistYoutubeDiscoveryTriage(candidateJob, { candidateId: candidate.id, status: "succeeded", assessment: { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: [] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 1 }, testDb);
    const bundle = await getYoutubeDiscoveryRecommendationBundle(claim, "story233video", testDb);
    if (typeof bundle === "string") throw new Error("expected recommendation bundle");
    await persistYoutubeDiscoveryRecommendation(claim, bundle, "eligible", Date.now() + 60_000, testDb);
    await finishYoutubeDiscoveryCandidateJob(candidateJob, testDb);

    const progress = await port.getQueryProgress(query.id, admitted.runId);
    expect(progress).toEqual({ run: { runId: admitted.runId, state: "running", createdAt: admitted.createdAt, claimedAt: expect.any(String), terminalAt: null, retryCount: 1, nextRetryAt: null, safeErrorCode: null }, candidateCount: 1, jobs: { queued: 0, running: 0, retrying: 0, completed: 1, failed: 0, cancelled: 0 }, reviewAvailable: true });
    expect(Object.keys(progress!)).toEqual(["run", "candidateCount", "jobs", "reviewAvailable"]);
    expect(Object.keys(progress!.run)).toEqual(["runId", "state", "createdAt", "claimedAt", "terminalAt", "retryCount", "nextRetryAt", "safeErrorCode"]);
    await expect(testDb.select().from(youtubeDiscoveryCandidateReviewStates)).resolves.toHaveLength(1);
    await expect(testDb.select().from(youtubeDiscoveryKnowledgeHandoffs)).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toEqual([]);
  });

  test("fails closed when a progress run does not belong to its query", async () => {
    const { query } = await enabledQuery();
    const other = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 40, queryText: "Da Nang itinerary", cadenceMinutes: 60, actor: createUserAuditActor({ userId: principal.userId, email: principal.email }) }, testDb);
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    const admitted = await port.admitImmediateRun(principal, query.id, confirmationKey);
    if (!admitted) throw new Error("expected immediate admission");
    await expect(port.getQueryProgress(other.id, admitted.runId)).resolves.toBeNull();
  });

  test("admits a distinct immediate run after the prior immediate run reaches a terminal state", async () => {
    const { query } = await enabledQuery();
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    const first = await port.admitImmediateRun(principal, query.id, confirmationKey);
    if (!first) throw new Error("expected first admission");
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "story-23-3-terminal" }, testDb)).claim;
    if (!claim) throw new Error("expected claim");
    await finishYoutubeDiscoveryRun(claim, testDb);
    const second = await port.admitImmediateRun(principal, query.id, "story23afterterminal");
    expect(second).toMatchObject({ state: "queued" });
    expect(second?.runId).not.toBe(first.runId);
  });

  test("uses the existing immediate run retry, cancellation, terminal, and reclaim lifecycle", async () => {
    const { query } = await enabledQuery({ maxRetryAttempts: 1, retryDelayMinutes: 1 });
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    const admitted = await port.admitImmediateRun(principal, query.id, confirmationKey);
    if (!admitted) throw new Error("expected immediate admission");
    const first = (await claimNextYoutubeDiscoveryRun({ workerId: "story-23-3-retry" }, testDb)).claim;
    if (!first) throw new Error("expected immediate claim");
    expect(await retryYoutubeDiscoveryRun(first, testDb)).toBe("retrying");
    await testDb.update(youtubeDiscoveryRuns).set({ createdAt: new Date(0), nextRunAt: new Date(1) }).where(eq(youtubeDiscoveryRuns.id, admitted.runId));
    const reclaimed = (await claimNextYoutubeDiscoveryRun({ workerId: "story-23-3-reclaim" }, testDb)).claim;
    if (!reclaimed) throw new Error("expected reclaimed immediate run");
    expect(reclaimed.attemptCount).toBe(2);
    expect(await finishYoutubeDiscoveryRun(reclaimed, testDb)).toBe("completed");
    await expect(testDb.select({ state: youtubeDiscoveryRuns.state, terminalOutcome: youtubeDiscoveryRuns.terminalOutcome }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, admitted.runId))).resolves.toEqual([{ state: "completed", terminalOutcome: "completed" }]);
  });

  test("does not prioritize an immediate run over an already admitted candidate job", async () => {
    const { query } = await enabledQuery({ candidateBacklogThreshold: 1 });
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    const admitted = await port.admitImmediateRun(principal, query.id, confirmationKey);
    if (!admitted) throw new Error("expected immediate admission");
    await testDb.transaction(async (transaction) => { await transaction.execute(sql`set local session_replication_role = replica`); await transaction.insert(youtubeDiscoveryCandidateJobs).values({ id: "backlog-job", candidateId: "backlog-candidate", appearanceId: "backlog-appearance", runId: admitted.runId, policyVersionId: (await transaction.select({ id: youtubeDiscoveryRuns.policyVersionId }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, admitted.runId)))[0]!.id, state: "queued", maxRetryAttempts: 0, retryDelayMinutes: 1, maxConcurrentJobs: 1 }); });
    bindYoutubeDiscoveryExecutionPorts({ check: async () => "eligible" }, async () => { throw new Error("immediate search must wait"); }, "test-key");
    await expect(runYoutubeDiscoveryPoll("story-23-3-backlog-plan")).resolves.toMatchObject({ durableId: "youtube-discovery-planning", resultCode: "success" });
    await expect(runYoutubeDiscoveryPoll("story-23-3-backlog")).rejects.toThrow("candidate is missing");
    await expect(testDb.select({ state: youtubeDiscoveryRuns.state }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, admitted.runId))).resolves.toEqual([{ state: "queued" }]);
  });
});

async function enabledQuery(policyInput: Record<string, unknown> = {}) {
  const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: policyInput, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
  const query = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat itinerary", cadenceMinutes: 60, actor: createUserAuditActor({ userId: principal.userId, email: principal.email }) }, testDb);
  return { policy, query };
}
