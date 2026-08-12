import { beforeEach, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { adminYoutubeDiscoveryActionRequiredPageSize, parseAdminYoutubeDiscoveryActionRequiredCursor, type AdminYoutubeDiscoveryActionRequiredCursor, type RequestPrincipal } from "@xuyenviet/contracts";
import { YoutubeDiscoveryActionRequiredCursorValidationError } from "@xuyenviet/domain";

import { aiGatewayModels, auditEvents, claimNextYoutubeDiscoveryRun, createPostgresAdminYoutubeDiscoveryPort, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryMissionActionFrontier, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, finishYoutubeDiscoveryRun, getYoutubeDiscoveryRecommendationBundle, knowledgeCards, knowledgeRecommendations, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryRecommendation, persistYoutubeDiscoveryTriage, retryYoutubeDiscoveryRun, selectYoutubeDiscoveryTriageModel, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryRecommendations, youtubeDiscoveryRuns } from "@xuyenviet/database";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

const principal: RequestPrincipal = { userId: "operator", email: "operator@example.com", roles: ["operator"], sessionId: "action-queue-session", authorizationVersion: 1 };

describe.sequential("YouTube Discovery action-required queue", () => {
  beforeEach(resetTestDatabase);

  test("reads active candidates once, applies their policy age threshold, and does not write", async () => {
    const { policy, proposal } = await queueFixture();
    const recommendationId = await createConsiderCandidate(policy.id, proposal.id, "agedcandidate");
    await testDb.transaction(async (transaction) => {
      await transaction.execute(sql`set local session_replication_role = replica`);
      await transaction.update(youtubeDiscoveryRecommendations).set({ createdAt: sql`clock_timestamp() - interval '96 hours'` }).where(eq(youtubeDiscoveryRecommendations.id, recommendationId));
    });
    await expect(testDb.select({ reviewAgeHours: youtubeDiscoveryPolicyVersions.actionQueueMaximumOperatorReviewAgeHours }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.id, policy.id))).resolves.toEqual([{ reviewAgeHours: 72 }]);
    const before = await queueWriteSnapshot();
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);

    const queue = await port.listActionRequired(principal, null);

    expect(queue.items.filter((item) => item.actionId === recommendationId)).toEqual([expect.objectContaining({ kind: "candidate_review", reason: "review_aged", priority: 10 })]);
    expect(await queueWriteSnapshot()).toEqual(before);
  });

  test("reads Health projections without reconciliation or writes", async () => {
    const { policy, proposal } = await queueFixture();
    await createConsiderCandidate(policy.id, proposal.id, "healthcandidate");
    const before = await queueWriteSnapshot();

    const health = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(health.throughput.windowHours).toBe(24);
    expect(health.backlog).toEqual(expect.objectContaining({ pending: 1, deferred: 0, oldestDeferredAt: null, deferredAge: "unavailable" }));
    expect(await queueWriteSnapshot()).toEqual(before);
  });

  test("uses typed incident escalation and clearance while excluding non-actionable runs", async () => {
    const { policy, proposal } = await queueFixture({ maxRetryAttempts: 0 });
    const other = await createProposal("Other route", 30);
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);

    await failRun(policy.id, proposal.id, "provider_rate_limited");
    let queue = await port.listActionRequired(principal, null);
    expect(queue.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "health_incident", actionId: `${proposal.id}:provider_rate_limited`, reason: "provider_rate_limited" })]));

    await completeRun(policy.id, proposal.id);
    queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.actionId === `${proposal.id}:provider_rate_limited`)).toBe(false);

    await failRun(policy.id, proposal.id, "provider_rate_limited");
    queue = await port.listActionRequired(principal, null);
    expect(queue.items).toEqual(expect.arrayContaining([expect.objectContaining({ actionId: `${proposal.id}:provider_rate_limited`, reason: "provider_rate_limited" })]));

    await failRun(policy.id, other.id, "execution_terminal");
    queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.actionId === `${other.id}:execution_terminal`)).toBe(false);
    await failRun(policy.id, other.id, "execution_terminal");
    queue = await port.listActionRequired(principal, null);
    expect(queue.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "health_incident", actionId: `${other.id}:execution_terminal`, reason: "execution_persistent_failure" })]));

    await testDb.insert(youtubeDiscoveryRuns).values({ policyVersionId: policy.id, state: "failed", maxRetryAttempts: 0, retryDelayMinutes: 15, maxConcurrentRuns: 1, terminalAt: new Date(), terminalOutcome: "failed", safeErrorCode: "retry_exhausted", incidentCategory: "execution_terminal" });
    queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.actionId.endsWith(":execution_terminal") && item.actionId !== `${other.id}:execution_terminal`)).toBe(false);
  });

  test("surfaces a typed provider rate limit before its retry is terminal", async () => {
    const { policy, proposal } = await queueFixture({ maxRetryAttempts: 1 });
    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "rate-limit-retry" }, testDb)).claim;
    if (!claim) throw new Error("expected rate-limit retry claim");
    expect(await retryYoutubeDiscoveryRun(claim, "provider_rate_limited", testDb)).toBe("retrying");

    const queue = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).listActionRequired(principal, null);

    expect(queue.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "health_incident", actionId: `${proposal.id}:provider_rate_limited`, reason: "provider_rate_limited" })]));
  });

  test("combines owner inputs deterministically, continues cursors, and rejects stale anchors", async () => {
    const { policy, proposal } = await queueFixture();
    const candidateId = await createConsiderCandidate(policy.id, proposal.id, "pagecandidate");
    const occurredAt = new Date("2026-08-01T00:00:00.000Z");
    let knowledgeInputs = Array.from({ length: 21 }, (_, index) => ({ recommendationId: `knowledge-${String(index).padStart(2, "0")}`, workType: "risk" as const, priority: 20, createdAt: occurredAt }));
    const missionInputs = Array.from({ length: 21 }, (_, index) => ({ actionId: `mission-${String(index).padStart(2, "0")}`, priority: 1, occurredAt, reason: "mission_no_enabled_query" as const }));
    const ownerInputs = {
      async listKnowledgeRecommendations(policyInput: { highPriorityMaximum: number }, cursor: AdminYoutubeDiscoveryActionRequiredCursor | null, limit: number) {
        expect(policyInput.highPriorityMaximum).toBe(20);
        expect(limit).toBe(adminYoutubeDiscoveryActionRequiredPageSize + 1);
        return actionFrontier(knowledgeInputs, "knowledge_recommendation", policyInput.highPriorityMaximum, cursor, limit, (item) => item.recommendationId, (item) => item.createdAt);
      },
    };
    const missionFrontier = {
      async listMissionNeeds(policyInput: { highPriorityMaximum: number }, cursor: AdminYoutubeDiscoveryActionRequiredCursor | null, limit: number) {
        expect(limit).toBe(adminYoutubeDiscoveryActionRequiredPageSize + 1);
        return actionFrontier(missionInputs, "mission_need", policyInput.highPriorityMaximum, cursor, limit, (item) => item.actionId, (item) => item.occurredAt);
      },
    };
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, undefined, ownerInputs, missionFrontier);

    const first = await port.listActionRequired(principal, null);
    expect(first.items).toHaveLength(20);
    expect(first.items).toEqual(Array.from({ length: 20 }, (_, index) => expect.objectContaining({ kind: "mission_need", actionId: `mission-${String(index).padStart(2, "0")}` })));
    expect(first.nextCursor).toMatch(/^yda1\./);
    expect(first.items).toEqual([...first.items].sort((left, right) => actionTuple(left).localeCompare(actionTuple(right))));

    const firstCursor = parseAdminYoutubeDiscoveryActionRequiredCursor(first.nextCursor);
    if (!firstCursor) throw new Error("expected first action queue cursor");
    const second = await port.listActionRequired(principal, firstCursor);
    expect(second.items).toHaveLength(20);
    expect(second.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "mission_need", actionId: "mission-20" }),
      expect.objectContaining({ kind: "candidate_review", actionId: candidateId }),
      expect.objectContaining({ kind: "knowledge_recommendation", actionId: "knowledge-17" }),
    ]));
    const secondCursor = parseAdminYoutubeDiscoveryActionRequiredCursor(second.nextCursor);
    if (!secondCursor) throw new Error("expected second action queue cursor");
    const third = await port.listActionRequired(principal, secondCursor);
    expect(third.items).toEqual([
      expect.objectContaining({ kind: "knowledge_recommendation", actionId: "knowledge-18" }),
      expect.objectContaining({ kind: "knowledge_recommendation", actionId: "knowledge-19" }),
      expect.objectContaining({ kind: "knowledge_recommendation", actionId: "knowledge-20" }),
    ]);
    expect(third.nextCursor).toBeNull();

    await expect(port.listActionRequired(principal, { ...secondCursor, priority: secondCursor.priority - 1 })).rejects.toBeInstanceOf(YoutubeDiscoveryActionRequiredCursorValidationError);
    await expect(port.listActionRequired(principal, { ...secondCursor, occurredAt: "2026-08-01T00:00:00.001Z" })).rejects.toBeInstanceOf(YoutubeDiscoveryActionRequiredCursorValidationError);

    knowledgeInputs = knowledgeInputs.filter((item) => item.recommendationId !== secondCursor.actionId);
    await expect(port.listActionRequired(principal, secondCursor)).rejects.toBeInstanceOf(YoutubeDiscoveryActionRequiredCursorValidationError);
  });

  test("excludes over-threshold missing-context Mission identities from the Action Queue", async () => {
    await queueFixture();
    const actionId = "mission-cccccccccccccccccccccccccccccccc";
    await testDb.insert(knowledgeCards).values({ id: "over-threshold-mission-card", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "route_note", title: "Over threshold Mission", summary: "Safe test summary", aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "over-threshold-mission-card", contentVersion: 1, evidenceSetRevision: 1, status: "open", workType: "missing_context", priority: 21, discoveryMissionActionId: actionId });

    const queue = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, undefined, undefined, createYoutubeDiscoveryMissionActionFrontier(testDb)).listActionRequired(principal, null);

    expect(queue.items.some((item) => item.actionId === actionId)).toBe(false);
  });

  test("uses current grouped run policy semantics and paginates complete owner sources", async () => {
    const { policy, proposal } = await queueFixture({ maxRetryAttempts: 0 });
    await failRun(policy.id, proposal.id, "execution_terminal");
    await failRun(policy.id, proposal.id, "execution_terminal");
    const secondPolicy = await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { maxRetryAttempts: 0, actionQueuePersistentIncidentFailureCount: 3 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    await failRun(secondPolicy.id, proposal.id, "execution_terminal");
    const missionInputs = Array.from({ length: 501 }, (_, index) => ({ actionId: `mission-${index.toString(16).padStart(32, "0")}`, priority: 20, occurredAt: new Date(`2026-08-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`), reason: "mission_no_enabled_query" as const }));
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, undefined, {
      async listKnowledgeRecommendations(_policy, cursor, limit) {
        expect(limit).toBe(adminYoutubeDiscoveryActionRequiredPageSize + 1);
        return actionFrontier([], "knowledge_recommendation", 20, cursor, limit, () => "", () => new Date(0));
      },
    }, {
      async listMissionNeeds(_policy, cursor, limit) {
        expect(limit).toBe(adminYoutubeDiscoveryActionRequiredPageSize + 1);
        return actionFrontier(missionInputs, "mission_need", 20, cursor, limit, (item) => item.actionId, (item) => item.occurredAt);
      },
    });
    let queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.actionId === `${proposal.id}:execution_terminal`)).toBe(false);
    await failRun(secondPolicy.id, proposal.id, "execution_terminal");
    queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.actionId === `${proposal.id}:execution_terminal`)).toBe(false);
    await failRun(secondPolicy.id, proposal.id, "execution_terminal");
    queue = await port.listActionRequired(principal, null);
    expect(queue.items).toEqual(expect.arrayContaining([expect.objectContaining({ actionId: `${proposal.id}:execution_terminal`, reason: "execution_persistent_failure" })]));
    const actionIds = new Set(queue.items.map((item) => item.actionId));
    let cursor = parseAdminYoutubeDiscoveryActionRequiredCursor(queue.nextCursor);
    while (cursor) {
      const next = await port.listActionRequired(principal, cursor);
      next.items.forEach((item) => actionIds.add(item.actionId));
      cursor = parseAdminYoutubeDiscoveryActionRequiredCursor(next.nextCursor);
    }
    expect(actionIds).toContain("mission-000000000000000000000000000001f4");
  });

  test("uses the Discovery-owned linked-query state for Mission stalls, not stale Knowledge timestamps", async () => {
    const { policy, proposal } = await queueFixture();
    const linkedActionId = "mission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const missingActionId = "mission-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    await testDb.update(youtubeDiscoveryQueryProposals).set({ missionActionId: linkedActionId }).where(eq(youtubeDiscoveryQueryProposals.id, proposal.id));
    await testDb.transaction(async (transaction) => {
      await transaction.execute(sql`set local session_replication_role = replica`);
      await transaction.update(youtubeDiscoveryQueryProposals).set({ createdAt: sql`clock_timestamp()` }).where(eq(youtubeDiscoveryQueryProposals.id, proposal.id));
    });
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, undefined, { async listKnowledgeRecommendations() { return { items: [], admitsCursor: true }; } }, { async listMissionNeeds() { return { items: [{ actionId: missingActionId, priority: 1, occurredAt: new Date("2020-01-01T00:00:00.000Z"), reason: "mission_no_enabled_query" as const }], admitsCursor: true }; } });
    const queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.actionId === linkedActionId)).toBe(false);
    expect(queue.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "mission_need", actionId: missingActionId, reason: "mission_no_enabled_query" })]));
  });

  test("rejects malformed cursors before reading owner inputs and preserves typed categories through retry and lease expiry", async () => {
    const { policy, proposal } = await queueFixture({ maxRetryAttempts: 1 });
    let ownerReads = 0;
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, undefined, { async listKnowledgeRecommendations() { ownerReads += 1; return { items: [], admitsCursor: false }; } }, { async listMissionNeeds() { ownerReads += 1; return { items: [], admitsCursor: false }; } });
    await expect(port.listActionRequired(principal, { version: 2 } as never)).rejects.toBeInstanceOf(YoutubeDiscoveryActionRequiredCursorValidationError);
    expect(ownerReads).toBe(0);
    await expect(port.listActionRequired(principal, { version: 1, urgency: 1, priority: 1, occurredAt: "2026-08-01T00:00:00.000Z", kind: "mission_need", actionId: "mission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })).rejects.toBeInstanceOf(YoutubeDiscoveryActionRequiredCursorValidationError);
    expect(ownerReads).toBe(2);

    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    let claim = (await claimNextYoutubeDiscoveryRun({ workerId: "typed-retry" }, testDb)).claim;
    if (!claim) throw new Error("expected typed retry claim");
    expect(await retryYoutubeDiscoveryRun(claim, "triage_schema_invalid", testDb)).toBe("retrying");
    await testDb.update(youtubeDiscoveryRuns).set({ nextRunAt: sql`clock_timestamp()` }).where(eq(youtubeDiscoveryRuns.id, claim.id));
    claim = (await claimNextYoutubeDiscoveryRun({ workerId: "typed-terminal" }, testDb)).claim;
    if (!claim) throw new Error("expected typed terminal claim");
    expect(await retryYoutubeDiscoveryRun(claim, testDb)).toBe("failed");
    const [terminal] = await testDb.select({ category: youtubeDiscoveryRuns.incidentCategory, state: youtubeDiscoveryRuns.state }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, claim.id));
    expect(terminal).toEqual({ category: "triage_schema_invalid", state: "failed" });

    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const expired = (await claimNextYoutubeDiscoveryRun({ workerId: "lease-expiry", leaseMs: 60_000 }, testDb)).claim;
    if (!expired) throw new Error("expected expiry claim");
    await testDb.update(youtubeDiscoveryRuns).set({ incidentCategory: "provider_rate_limited", claimedAt: sql`clock_timestamp() - interval '2 minutes'`, leaseExpiresAt: sql`clock_timestamp() - interval '1 minute'`, attemptCount: 2 }).where(eq(youtubeDiscoveryRuns.id, expired.id));
    await claimNextYoutubeDiscoveryRun({ workerId: "recover-expired" }, testDb);
    const [recovered] = await testDb.select({ category: youtubeDiscoveryRuns.incidentCategory, state: youtubeDiscoveryRuns.state }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, expired.id));
    expect(recovered).toEqual({ category: "provider_rate_limited", state: "failed" });
  });
});

async function queueFixture(policyInput: { maxRetryAttempts?: number } = {}) {
  await seedTestOperator();
  const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { maxRetryAttempts: policyInput.maxRetryAttempts ?? 3 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
  const proposal = await createProposal("Da Lat route", 10);
  return { policy, proposal };
}

async function createProposal(queryText: string, priority: number) {
  return createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority, queryText, cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
}

async function createConsiderCandidate(policyVersionId: string, queryProposalId: string, videoId: string) {
  await createYoutubeDiscoveryRun({ policyVersionId, queryProposalId }, testDb);
  const claim = (await claimNextYoutubeDiscoveryRun({ workerId: `candidate-${videoId}` }, testDb)).claim;
  if (!claim) throw new Error("expected candidate run claim");
  await persistYoutubeDiscoveryCandidates(claim, [{ videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal: 0 }], testDb);
  await persistYoutubeDiscoveryEnrichment(claim, { videoId, signals: [] }, testDb);
  await testDb.insert(aiGatewayModels).values({ id: `model-${videoId}`, gatewayModelName: `test/${videoId}`, displayLabel: "Action queue", purpose: "youtube_discovery_triage", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 });
  const model = await selectYoutubeDiscoveryTriageModel(testDb);
  const [candidate] = await testDb.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, videoId));
  if (!model || !candidate) throw new Error("expected candidate triage fixture");
  await persistYoutubeDiscoveryTriage(claim, { candidateId: candidate.id, status: "succeeded", assessment: { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: [] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 1 }, testDb);
  const bundle = await getYoutubeDiscoveryRecommendationBundle(claim, videoId, testDb);
  if (typeof bundle === "string") throw new Error("expected recommendation bundle");
  await persistYoutubeDiscoveryRecommendation(claim, bundle, "eligible", Date.now() + 60_000, testDb);
  const [recommendation] = await testDb.select({ id: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryRecommendations).where(eq(youtubeDiscoveryRecommendations.runId, claim.id));
  if (!recommendation) throw new Error("expected consider recommendation");
  expect(await finishYoutubeDiscoveryRun(claim, testDb)).toBe("completed");
  return recommendation.id;
}

async function failRun(policyVersionId: string, queryProposalId: string, category: "provider_rate_limited" | "triage_schema_invalid" | "execution_terminal") {
  await createYoutubeDiscoveryRun({ policyVersionId, queryProposalId }, testDb);
  const claim = (await claimNextYoutubeDiscoveryRun({ workerId: `failure-${crypto.randomUUID()}` }, testDb)).claim;
  if (!claim) throw new Error("expected failure run claim");
  expect(await retryYoutubeDiscoveryRun(claim, category === "execution_terminal" ? undefined : category, testDb)).toBe("failed");
}

async function completeRun(policyVersionId: string, queryProposalId: string) {
  await createYoutubeDiscoveryRun({ policyVersionId, queryProposalId }, testDb);
  const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "rate-limit-clearance" }, testDb)).claim;
  if (!claim) throw new Error("expected successful run claim");
  expect(await finishYoutubeDiscoveryRun(claim, testDb)).toBe("completed");
}

async function queueWriteSnapshot() {
  return {
    audits: await testDb.select({ id: auditEvents.id }).from(auditEvents).orderBy(auditEvents.id),
    reviews: await testDb.select({ recommendationId: youtubeDiscoveryCandidateReviewStates.recommendationId, state: youtubeDiscoveryCandidateReviewStates.state }).from(youtubeDiscoveryCandidateReviewStates).orderBy(youtubeDiscoveryCandidateReviewStates.recommendationId),
    runs: await testDb.select({ id: youtubeDiscoveryRuns.id, state: youtubeDiscoveryRuns.state, terminalAt: youtubeDiscoveryRuns.terminalAt }).from(youtubeDiscoveryRuns).orderBy(youtubeDiscoveryRuns.id),
  };
}

function actionTuple(item: { kind: string; actionId: string; priority: number; occurredAt: string }) {
  const urgency = item.kind === "candidate_review" ? 2 : item.kind === "mission_need" ? 1 : item.kind === "knowledge_recommendation" ? 3 : 0;
  return `${urgency.toString().padStart(2, "0")}:${item.priority.toString().padStart(3, "0")}:${item.occurredAt}:${item.kind}:${item.actionId}`;
}

function actionFrontier<T extends { priority: number }>(items: T[], kind: "mission_need" | "knowledge_recommendation", highPriorityMaximum: number, cursor: AdminYoutubeDiscoveryActionRequiredCursor | null, limit: number, actionId: (item: T) => string, occurredAt: (item: T) => Date) {
  const urgency = kind === "mission_need" ? 1 : 3;
  const admitted = items.filter((item) => item.priority <= highPriorityMaximum);
  const after = !cursor || cursor.urgency < urgency
    ? admitted
    : cursor.urgency > urgency
      ? []
      : admitted.filter((item) => actionTuple({ kind, actionId: actionId(item), priority: item.priority, occurredAt: occurredAt(item).toISOString() }) > actionTuple(cursor));
  return { items: [...after].sort((left, right) => actionTuple({ kind, actionId: actionId(left), priority: left.priority, occurredAt: occurredAt(left).toISOString() }).localeCompare(actionTuple({ kind, actionId: actionId(right), priority: right.priority, occurredAt: occurredAt(right).toISOString() }))).slice(0, limit), admitsCursor: !cursor || cursor.kind !== kind || cursor.urgency === urgency && admitted.some((item) => actionTuple({ kind, actionId: actionId(item), priority: item.priority, occurredAt: occurredAt(item).toISOString() }) === actionTuple(cursor)) };
}
