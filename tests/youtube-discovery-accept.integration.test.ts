import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RequestPrincipal } from "@xuyenviet/contracts";
import { and, eq } from "drizzle-orm";
import { aiGatewayModels, auditEvents, claimNextYoutubeDiscoveryRun, createPostgresAdminYoutubeDiscoveryPort, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, getYoutubeDiscoveryRecommendationBundle, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryRecommendation, persistYoutubeDiscoveryTriage, retainYoutubeDiscoveryRecords, selectYoutubeDiscoveryTriageModel, users, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryKnowledgeHandoffs, youtubeDiscoveryRecommendations } from "@xuyenviet/database";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

const principal: RequestPrincipal = { userId: "operator", email: "operator@example.com", roles: ["operator"], sessionId: "accept-session", authorizationVersion: 1 };
const secondPrincipal: RequestPrincipal = { userId: "operator-two", email: "operator-two@example.com", roles: ["operator"], sessionId: "accept-session-two", authorizationVersion: 1 };

describe.sequential("YouTube Discovery Accept reconciliation", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("keeps an unknown persisted handoff visible and non-actionable across fresh queue and detail reads", async () => {
    const review = await seedReview();
    await persistDiscoveryHandoff(review, "unknown-reference");
    const intake = handoff("reconciling");
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, intake);

    await expect(port.listReview(principal, null)).resolves.toMatchObject({ items: [{ recommendationId: review.recommendationId, actionAvailability: "reconciling" }] });
    await expect(port.getReview(principal, review.recommendationId)).resolves.toMatchObject({ actionAvailability: "reconciling" });
    await expect(port.acceptReview(principal, review.recommendationId)).resolves.toEqual({ outcome: "reconciling" });
    expect(intake.submit).not.toHaveBeenCalled();
    expect(intake.lookup).toHaveBeenCalled();
    await expect(decisionState(review)).resolves.toBe("pending");
  });

  test("reconciles an original submitted ledger result on a fresh read once and retains only its terminal marker", async () => {
    const review = await seedReview();
    await persistDiscoveryHandoff(review, "submitted-reference");
    const intake = handoff("submitted");
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, intake);

    await expect(port.listReview(principal, null)).resolves.toEqual({ items: [], nextCursor: null });
    await expect(port.getReview(principal, review.recommendationId)).resolves.toBeNull();
    await expect(decisionState(review)).resolves.toBe("accepted");
    await expect(testDb.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_candidate_review"), eq(auditEvents.targetId, review.recommendationId)))).resolves.toHaveLength(1);
    await expect(testDb.select({ reference: youtubeDiscoveryKnowledgeHandoffs.reference, outcome: youtubeDiscoveryKnowledgeHandoffs.outcome }).from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, review.candidateId))).resolves.toEqual([{ reference: "submitted-reference", outcome: "submitted" }]);
    expect(intake.submit).not.toHaveBeenCalled();
  });

  test("does not disclose a retained terminal outcome after the review becomes inactive", async () => {
    const review = await seedReview();
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, handoff("submitted"));

    await expect(port.acceptReview(principal, review.recommendationId)).resolves.toEqual({ outcome: "submitted" });
    await expect(port.acceptReview(principal, review.recommendationId)).resolves.toBeNull();
  });

  test("reconciles an original duplicate ledger result on a fresh detail read once", async () => {
    const review = await seedReview();
    await persistDiscoveryHandoff(review, "duplicate-reference");
    const intake = handoff("duplicate");
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, intake);

    await expect(port.getReview(principal, review.recommendationId)).resolves.toBeNull();
    await expect(decisionState(review)).resolves.toBe("accepted");
    await expect(testDb.select({ id: auditEvents.id, afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetId, review.recommendationId))).resolves.toEqual([{ id: expect.any(String), afterSummary: JSON.stringify({ decision: "accepted", intakeOutcome: "duplicate" }) }]);
    await expect(testDb.select({ reference: youtubeDiscoveryKnowledgeHandoffs.reference, outcome: youtubeDiscoveryKnowledgeHandoffs.outcome }).from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, review.candidateId))).resolves.toEqual([{ reference: "duplicate-reference", outcome: "duplicate" }]);
    expect(intake.submit).not.toHaveBeenCalled();
  });

  test("clears a confirmed failed handoff and makes the pending review actionable again", async () => {
    const review = await seedReview();
    await persistDiscoveryHandoff(review, "failed-reference");
    const intake = handoff("failed");
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, intake);

    await expect(port.listReview(principal, null)).resolves.toMatchObject({ items: [{ recommendationId: review.recommendationId, actionAvailability: "available" }] });
    await expect(decisionState(review)).resolves.toBe("pending");
    await expect(testDb.select().from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, review.candidateId))).resolves.toEqual([]);
    expect(intake.submit).not.toHaveBeenCalled();
  });

  test("returns the stored terminal result to concurrent finalizers, then hides an accepted review", async () => {
    const review = await seedReview();
    const intake = handoff("submitted");
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, intake);

    const results = await Promise.all([port.acceptReview(principal, review.recommendationId), port.acceptReview(principal, review.recommendationId)]);
    expect(results).toEqual([{ outcome: "submitted" }, { outcome: "submitted" }]);
    expect(intake.submit).toHaveBeenCalledOnce();
    await expect(testDb.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.targetId, review.recommendationId))).resolves.toHaveLength(1);

    await expect(port.acceptReview(principal, review.recommendationId)).resolves.toBeNull();
    await expect(port.acceptReview(principal, "missing-review")).resolves.toBeNull();
    expect(intake.submit).toHaveBeenCalledOnce();
  });

  test("reconciles a timeout retry once, then hides the accepted review", async () => {
    const review = await seedReview();
    const intake = { submit: vi.fn().mockResolvedValue("reconciling"), lookup: vi.fn().mockResolvedValue("submitted") };
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, intake);

    await expect(port.acceptReview(principal, review.recommendationId)).resolves.toEqual({ outcome: "reconciling" });
    await expect(port.acceptReview(principal, review.recommendationId)).resolves.toEqual({ outcome: "submitted" });
    await expect(port.acceptReview(principal, review.recommendationId)).resolves.toBeNull();
    await expect(testDb.select({ outcome: youtubeDiscoveryKnowledgeHandoffs.outcome }).from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, review.candidateId))).resolves.toEqual([{ outcome: "submitted" }]);
    await expect(testDb.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.targetId, review.recommendationId))).resolves.toHaveLength(1);
  });

  test("keeps a missing original ledger reconciling without retrying intake through another operator", async () => {
    const review = await seedReview();
    await testDb.insert(users).values({ id: "operator-two", email: "operator-two@example.com" });
    await persistDiscoveryHandoff(review, "missing-reference");
    const intake = { lookup: vi.fn().mockResolvedValue("missing"), submit: vi.fn().mockResolvedValue("submitted") };
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, intake);

    await expect(port.listReview(secondPrincipal, null)).resolves.toMatchObject({ items: [{ recommendationId: review.recommendationId, actionAvailability: "reconciling" }] });
    expect(intake.lookup).toHaveBeenCalledWith("missing-reference");
    expect(intake.submit).not.toHaveBeenCalled();
    await expect(port.acceptReview(secondPrincipal, review.recommendationId)).resolves.toEqual({ outcome: "reconciling" });
    await expect(decisionState(review)).resolves.toBe("pending");
    await expect(testDb.select({ actorUserId: auditEvents.actorUserId, actorEmail: auditEvents.actorEmail }).from(auditEvents).where(eq(auditEvents.targetId, review.recommendationId))).resolves.toEqual([]);
  });

  test("does not accept malformed internal outcomes", async () => {
    const review = await seedReview();
    const intake = { lookup: vi.fn().mockResolvedValue("unexpected"), submit: vi.fn().mockResolvedValue("unexpected") };
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, intake as never);

    await expect(port.acceptReview(principal, review.recommendationId)).resolves.toEqual({ outcome: "reconciling" });
    await expect(decisionState(review)).resolves.toBe("pending");
    await expect(testDb.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.targetId, review.recommendationId))).resolves.toEqual([]);
  });

  test("fails closed to reconciling when the internal handoff is unavailable", async () => {
    const review = await seedReview();
    const intake = { lookup: vi.fn(), submit: vi.fn().mockRejectedValue(new Error("unavailable")) };
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, intake);

    await expect(port.acceptReview(principal, review.recommendationId)).resolves.toEqual({ outcome: "reconciling" });
    await expect(decisionState(review)).resolves.toBe("pending");
    await expect(testDb.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.targetId, review.recommendationId))).resolves.toEqual([]);
  });

  test("does not report terminal success or audit when the active review is removed during Knowledge admission", async () => {
    const review = await seedReview();
    const intake = {
      lookup: vi.fn(),
      submit: vi.fn().mockImplementation(async () => {
        await testDb.delete(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, review.candidateId));
        await testDb.delete(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.candidateId, review.candidateId));
        return "submitted" as const;
      }),
    };
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, intake);

    await expect(port.acceptReview(principal, review.recommendationId)).resolves.toEqual({ outcome: "reconciling" });
    await expect(testDb.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.targetId, review.recommendationId))).resolves.toEqual([]);
    expect(intake.submit).toHaveBeenCalledOnce();
  });

  test("retention preserves an expired pending handoff until its original terminal result reconciles", async () => {
    const review = await seedReview();
    await persistDiscoveryHandoff(review, "retained-pending-reference");
    await testDb.update(youtubeDiscoveryCandidates).set({ updatedAt: new Date(0) }).where(eq(youtubeDiscoveryCandidates.id, review.candidateId));
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(0);
    await expect(testDb.select().from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, review.candidateId))).resolves.toHaveLength(1);
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, handoff("submitted"));
    await expect(port.listReview(principal, null)).resolves.toEqual({ items: [], nextCursor: null });
    await expect(decisionState(review)).resolves.toBe("accepted");
    await expect(testDb.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.targetId, review.recommendationId))).resolves.toHaveLength(1);
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(1);
    await expect(testDb.select().from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, review.candidateId))).resolves.toEqual([]);
  });
});

function handoff(outcome: "submitted" | "duplicate" | "failed" | "reconciling") {
  return { submit: vi.fn().mockResolvedValue(outcome), lookup: vi.fn().mockResolvedValue(outcome) };
}
async function seedReview() {
  await seedTestOperator();
  const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
  const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
  await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
  const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "accept-reconciliation" }, testDb)).claim!;
  const videoId = "abcDEF12345";
  await persistYoutubeDiscoveryCandidates(claim, [{ videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal: 0 }], testDb);
  await persistYoutubeDiscoveryEnrichment(claim, { videoId, signals: [] }, testDb);
  await testDb.insert(aiGatewayModels).values({ id: "accept-model", gatewayModelName: "test/accept", displayLabel: "Accept", purpose: "youtube_discovery_triage", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 });
  const model = (await selectYoutubeDiscoveryTriageModel(testDb))!;
  const [candidate] = await testDb.select({ id: youtubeDiscoveryCandidates.id, canonicalUrl: youtubeDiscoveryCandidates.canonicalUrl }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, videoId));
  if (!candidate) throw new Error("expected candidate");
  await persistYoutubeDiscoveryTriage(claim, { candidateId: candidate.id, status: "succeeded", assessment: { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: [] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 1 }, testDb);
  const bundle = await getYoutubeDiscoveryRecommendationBundle(claim, videoId, testDb);
  if (typeof bundle === "string") throw new Error("expected recommendation bundle");
  await persistYoutubeDiscoveryRecommendation(claim, bundle, "eligible", Date.now() + 60_000, testDb);
  const [recommendation] = await testDb.select({ id: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryRecommendations).where(eq(youtubeDiscoveryRecommendations.candidateId, candidate.id));
  if (!recommendation) throw new Error("expected recommendation");
  return { candidateId: candidate.id, canonicalUrl: candidate.canonicalUrl, recommendationId: recommendation.id };
}
async function persistDiscoveryHandoff(review: Awaited<ReturnType<typeof seedReview>>, reference: string) {
  await testDb.insert(youtubeDiscoveryKnowledgeHandoffs).values({ candidateId: review.candidateId, recommendationId: review.recommendationId, reference, reconciling: true });
}
async function decisionState(review: Awaited<ReturnType<typeof seedReview>>) {
  return (await testDb.select({ state: youtubeDiscoveryCandidateReviewStates.state }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.candidateId, review.candidateId)))[0]?.state;
}
