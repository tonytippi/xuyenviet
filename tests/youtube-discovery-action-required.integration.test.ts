import { beforeEach, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { adminYoutubeDiscoveryActionRequiredPageSize, parseAdminYoutubeDiscoveryActionRequiredCursor, type AdminYoutubeDiscoveryActionRequiredCursor, type RequestPrincipal } from "@xuyenviet/contracts";
import { YoutubeDiscoveryActionRequiredCursorValidationError } from "@xuyenviet/domain";

import { aiPurposes, auditEvents, cancelYoutubeDiscoveryRunIfDisabled, claimNextYoutubeDiscoveryRun, createPostgresAdminYoutubeDiscoveryPort, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryMissionActionFrontier, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, finishYoutubeDiscoveryRun, getYoutubeDiscoveryRecommendationBundle, knowledgeCards, knowledgeRecommendations, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryRecommendation, persistYoutubeDiscoveryTriage, retryYoutubeDiscoveryRun, selectYoutubeDiscoveryTriageModel, youtubeDiscoveryAppearances, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryRecommendations, youtubeDiscoveryRuns } from "@xuyenviet/database";
import { resetTestDatabase, seedAiPurposeModel, seedTestOperator, testDb } from "./helpers/db";

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

  test("keeps foreign fallback out of primary work while reporting bounded policy-scoped quality without writes", async () => {
    const { policy, proposal } = await queueFixture();
    const primaryRecommendationId = await createConsiderCandidate(policy.id, proposal.id, "primaryquality");
    const fallbackRecommendationId = await createConsiderCandidate(policy.id, proposal.id, "fallbackquality");
    const [fallback] = await testDb.select({ appearanceId: youtubeDiscoveryRecommendations.appearanceId }).from(youtubeDiscoveryRecommendations).where(eq(youtubeDiscoveryRecommendations.id, fallbackRecommendationId));
    if (!fallback) throw new Error("expected fallback appearance");
    await testDb.update(youtubeDiscoveryAppearances).set({ languageFit: "non_vi", eligibilityReason: "foreign_fallback" }).where(eq(youtubeDiscoveryAppearances.id, fallback.appearanceId));
    const before = await queueWriteSnapshot();
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);

    const [review, actions, fallbackProjection, health, mission] = await Promise.all([port.listReview(principal, null), port.listActionRequired(principal, null), port.listForeignFallback(), port.healthOverview(), port.missionFunnel()]);

    expect(review.items.map((item) => item.recommendationId)).toEqual([primaryRecommendationId]);
    expect(actions.items.some((item) => item.actionId === fallbackRecommendationId)).toBe(false);
    expect(fallbackProjection.items).toEqual([expect.objectContaining({ eligibilityReason: "foreign_fallback", languageFit: "non_vi", queryText: "Da Lat route" })]);
    expect(health.quality).toMatchObject({ foreignFallback: 1, vietnameseConsider: 1, considered: 2, vietnameseFitPercent: 50, durationViolations: 0 });
    expect(mission.quality).toEqual(health.quality);
    expect(await queueWriteSnapshot()).toEqual(before);
  });

  test("excludes fallback without its immutable minimum-duration evidence", async () => {
    const { policy, proposal } = await queueFixture();
    const fallbackRecommendationId = await createConsiderCandidate(policy.id, proposal.id, "fallbacknoduration");
    const [fallback] = await testDb.select({ appearanceId: youtubeDiscoveryRecommendations.appearanceId }).from(youtubeDiscoveryRecommendations).where(eq(youtubeDiscoveryRecommendations.id, fallbackRecommendationId));
    if (!fallback) throw new Error("expected fallback appearance");
    await testDb.update(youtubeDiscoveryAppearances).set({ languageFit: "non_vi", eligibilityReason: "foreign_fallback", durationFit: "eligible", durationSeconds: null }).where(eq(youtubeDiscoveryAppearances.id, fallback.appearanceId));

    const [projection, health] = await Promise.all([createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).listForeignFallback(), createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview()]);

    expect(projection.items).toEqual([]);
    expect(health.quality).toMatchObject({ foreignFallback: 0, vietnameseConsider: 0, considered: 1, vietnameseFitPercent: 0, durationViolations: 1 });
  });

  test("projects only the latest fallback appearance for a canonical candidate", async () => {
    const { policy, proposal } = await queueFixture();
    await createConsiderCandidate(policy.id, proposal.id, "fallbackdup");
    await createConsiderCandidate(policy.id, proposal.id, "fallbackdup");
    const [candidate] = await testDb.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, "fallbackdup"));
    if (!candidate) throw new Error("expected duplicate fallback candidate");
    await testDb.update(youtubeDiscoveryAppearances).set({ languageFit: "non_vi", eligibilityReason: "foreign_fallback" }).where(eq(youtubeDiscoveryAppearances.candidateId, candidate.id));

    const projection = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).listForeignFallback();

    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({ canonicalUrl: "https://www.youtube.com/watch?v=fallbackdup", languageFit: "non_vi", eligibilityReason: "foreign_fallback" });
  });

  test("reports each new-policy gate failure and keeps it in the all-consider quality denominator", async () => {
    const { policy, proposal } = await queueFixture();
    const primaryRecommendationId = await createConsiderCandidate(policy.id, proposal.id, "qualityprimary");
    const cases = [{ reason: "too_short", videoId: "qualityshort" }, { reason: "duration_unknown", videoId: "qualityduration" }, { reason: "non_vietnamese", videoId: "qualitynonvi" }, { reason: "language_unknown", videoId: "qualityunknown" }] as const;
    for (const { reason, videoId } of cases) {
      const recommendationId = await createConsiderCandidate(policy.id, proposal.id, videoId);
      const [recommendation] = await testDb.select({ appearanceId: youtubeDiscoveryRecommendations.appearanceId }).from(youtubeDiscoveryRecommendations).where(eq(youtubeDiscoveryRecommendations.id, recommendationId));
      if (!recommendation) throw new Error("expected gate-failed recommendation");
      await testDb.update(youtubeDiscoveryAppearances).set({ eligibilityReason: reason, languageFit: reason === "non_vietnamese" ? "non_vi" : reason === "language_unknown" ? "unknown" : "vi", durationFit: reason === "too_short" ? "too_short" : reason === "duration_unknown" ? "duration_unknown" : "eligible", durationSeconds: reason === "too_short" ? 179 : reason === "duration_unknown" ? null : 180 }).where(eq(youtubeDiscoveryAppearances.id, recommendation.appearanceId));
    }

    const health = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).healthOverview();

    expect(health.quality).toMatchObject({ tooShort: 1, durationUnknown: 1, nonVietnamese: 1, languageUnknown: 1, vietnameseConsider: 1, considered: 5, vietnameseFitPercent: 20, durationViolations: 2 });
    expect(primaryRecommendationId).toBeTruthy();
  });

  test("uses typed incident escalation and clearance while excluding non-actionable runs", async () => {
    const { policy, proposal } = await queueFixture({ maxRetryAttempts: 0 });
    const other = await createProposal("Other route", 30);
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);

    const failed = await failRun(policy.id, proposal.id, "provider_rate_limited");
    let queue = await port.listActionRequired(principal, null);
    expect(queue.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "health_incident", actionId: `${failed}:provider_rate_limited`, reason: "provider_rate_limited" })]));

    await completeRun(policy.id, proposal.id);
    queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.actionId === `${failed}:provider_rate_limited`)).toBe(true);

    const retryPolicy = await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { maxRetryAttempts: 1 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    await createYoutubeDiscoveryRun({ policyVersionId: retryPolicy.id, queryProposalId: proposal.id }, testDb);
    const cancelledClaim = (await claimNextYoutubeDiscoveryRun({ workerId: "rate-limit-cancelled" }, testDb)).claim;
    if (!cancelledClaim) throw new Error("expected rate-limit cancellation claim");
    expect(await retryYoutubeDiscoveryRun(cancelledClaim, "provider_rate_limited", testDb)).toBe("retrying");
    queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.kind === "health_incident" && item.reason === "provider_rate_limited")).toBe(true);
    await testDb.update(youtubeDiscoveryRuns).set({ nextRunAt: sql`clock_timestamp()` }).where(eq(youtubeDiscoveryRuns.id, cancelledClaim.id));
    const cancellationClaim = (await claimNextYoutubeDiscoveryRun({ workerId: "cancel-rate-limit" }, testDb)).claim;
    if (!cancellationClaim) throw new Error("expected cancellation claim");
    await testDb.update(youtubeDiscoveryQueryProposals).set({ enabled: false }).where(eq(youtubeDiscoveryQueryProposals.id, proposal.id));
    expect(await cancelYoutubeDiscoveryRunIfDisabled(cancellationClaim, testDb)).toBe("cancelled");
    queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.kind === "health_incident" && item.reason === "provider_rate_limited" && item.actionId !== `${failed}:provider_rate_limited`)).toBe(false);
    await testDb.update(youtubeDiscoveryQueryProposals).set({ enabled: true }).where(eq(youtubeDiscoveryQueryProposals.id, proposal.id));

    const terminalPolicy = await createYoutubeDiscoveryPolicyVersion({ version: 3, isCurrent: true, policy: { maxRetryAttempts: 0 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const terminalRateLimit = await failRun(terminalPolicy.id, proposal.id, "provider_rate_limited");
    queue = await port.listActionRequired(principal, null);
    expect(queue.items).toEqual(expect.arrayContaining([expect.objectContaining({ actionId: `${terminalRateLimit}:provider_rate_limited`, reason: "provider_rate_limited" })]));

    const firstTerminal = await failRun(terminalPolicy.id, other.id, "execution_terminal");
    queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.actionId === `${firstTerminal}:execution_terminal`)).toBe(false);
    const secondTerminal = await failRun(terminalPolicy.id, other.id, "execution_terminal");
    queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.actionId === `${secondTerminal}:execution_terminal`)).toBe(false);

    await testDb.insert(youtubeDiscoveryRuns).values({ policyVersionId: policy.id, state: "failed", maxRetryAttempts: 0, retryDelayMinutes: 15, maxConcurrentRuns: 1, terminalAt: new Date(), terminalOutcome: "failed", safeErrorCode: "retry_exhausted", incidentCategory: "execution_terminal" });
    queue = await port.listActionRequired(principal, null);
    expect(queue.items.some((item) => item.actionId.endsWith(":execution_terminal"))).toBe(false);
  });

  test("surfaces a typed provider rate limit before its retry is terminal", async () => {
    const { policy, proposal } = await queueFixture({ maxRetryAttempts: 1 });
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "rate-limit-retry" }, testDb)).claim;
    if (!claim) throw new Error("expected rate-limit retry claim");
    expect(await retryYoutubeDiscoveryRun(claim, "provider_rate_limited", testDb)).toBe("retrying");

    const queue = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).listActionRequired(principal, null);

    expect(queue.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "health_incident", actionId: `${run.id}:provider_rate_limited`, reason: "provider_rate_limited" })]));
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

  test("rejects a Mission cursor with a forged urgency", async () => {
    await queueFixture();
    const actionId = "mission-dddddddddddddddddddddddddddddddd";
    await testDb.insert(knowledgeCards).values({ id: "mission-cursor-card", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "route_note", title: "Mission cursor", summary: "Safe test summary", aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "mission-cursor-card", contentVersion: 1, evidenceSetRevision: 1, status: "open", workType: "missing_context", priority: 10, discoveryMissionActionId: actionId });
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, undefined, undefined, createYoutubeDiscoveryMissionActionFrontier(testDb));
    const queue = await port.listActionRequired(principal, null);
    const mission = queue.items.find((item) => item.kind === "mission_need");
    if (!mission) throw new Error("expected Mission action item");

    await expect(port.listActionRequired(principal, { version: 1, urgency: 0, priority: mission.priority, occurredAt: mission.occurredAt, kind: mission.kind, actionId: mission.actionId })).rejects.toBeInstanceOf(YoutubeDiscoveryActionRequiredCursorValidationError);
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
    expect(queue.items.some((item) => item.kind === "health_incident" && item.reason === "execution_persistent_failure")).toBe(false);
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
  await persistYoutubeDiscoveryCandidates(claim, [{ videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal: 0, searchTranche: "medium" }], testDb);
  await persistYoutubeDiscoveryEnrichment(claim, { videoId, title: "Đường đèo Việt Nam", durationSeconds: 180, defaultAudioLanguage: "vi", signals: [] }, testDb);
  await testDb.update(youtubeDiscoveryAppearances).set({ languageFit: "vi", durationFit: "eligible", eligibilityReason: "eligible_vietnamese", queryBuilderVersion: 2, languageClassifierVersion: 1, minimumUsefulDurationSeconds: 180 }).where(eq(youtubeDiscoveryAppearances.runId, claim.id));
  const existingModel = await testDb.select({ id: aiPurposes.aiGatewayModelId }).from(aiPurposes).where(eq(aiPurposes.purpose, "youtube_discovery_triage"));
  if (!existingModel.length) await seedAiPurposeModel({ id: `model-${videoId}`, gatewayModelName: `test/${videoId}`, displayLabel: "Action queue", purpose: "youtube_discovery_triage", active: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 });
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
  const run = await createYoutubeDiscoveryRun({ policyVersionId, queryProposalId }, testDb);
  const claim = (await claimNextYoutubeDiscoveryRun({ workerId: `failure-${crypto.randomUUID()}` }, testDb)).claim;
  if (!claim) throw new Error("expected failure run claim");
  expect(await retryYoutubeDiscoveryRun(claim, category === "execution_terminal" ? undefined : category, testDb)).toBe("failed");
  return run.id;
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
