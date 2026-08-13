import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { aiGatewayModels, aiUsageEvents, claimNextYoutubeDiscoveryCandidateJob, claimNextYoutubeDiscoveryRun, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, finishYoutubeDiscoveryCandidateJob, getYoutubeDiscoveryTriageBundle, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryTriage, retainYoutubeDiscoveryRecords, selectYoutubeDiscoveryTriageModel, youtubeDiscoveryCandidates, youtubeDiscoveryCommentSignals, youtubeDiscoveryRuns, youtubeDiscoveryTriages } from "@xuyenviet/database";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

const videoId = "abcDEF12345";
const candidate = { videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal: 0 };
const enrichment = { videoId, title: "Da Lat route", channelName: "Route channel", signals: [{ signal: "practical_question_demand" as const, count: 2, score: 20 }] };

async function claimedCandidate() {
  await seedTestOperator();
  const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { retentionDays: 2, commentSignalTtlDays: 1 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
  const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
  const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
  const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "triage-test" }, testDb)).claim!;
  expect(await persistYoutubeDiscoveryCandidates(claim, [candidate], testDb)).toBe("completed");
  expect(await persistYoutubeDiscoveryEnrichment(claim, enrichment, testDb)).toBe("completed");
  const [stored] = await testDb.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates);
  return { policy, run, claim, candidateId: stored!.id };
}

async function insertModel() {
  await testDb.insert(aiGatewayModels).values({ id: "triage-model", gatewayModelName: "test/triage", displayLabel: "Triage", purpose: "youtube_discovery_triage", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 });
  return (await selectYoutubeDiscoveryTriageModel(testDb))!;
}

const assessment = { relevanceScore: 0.8, expectedValueScore: 0.7, freshnessFitScore: 0.6, commercialRiskScore: 0.2, duplicateRiskScore: 0.1, signals: ["practical_question_demand"] as const };

describe.sequential("YouTube Discovery metadata triage persistence", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("persists only the bounded assessment and attributable Usage event", async () => {
    const { claim, run, policy, candidateId } = await claimedCandidate();
    const model = await insertModel();
    expect(await persistYoutubeDiscoveryTriage(claim, { candidateId, status: "succeeded", assessment: { ...assessment, signals: [...assessment.signals] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 12, promptTokens: 4, completionTokens: 5, totalTokens: 9 }, testDb)).toBe("completed");
    await expect(testDb.select().from(youtubeDiscoveryTriages)).resolves.toMatchObject([{ candidateId, runId: run.id, policyVersionId: policy.id, promptVersion: "youtube_discovery_triage_v1", status: "succeeded", ...assessment, aiGatewayModelId: model.id }]);
    await expect(testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.youtubeDiscoveryRunId, run.id))).resolves.toMatchObject([{ purpose: "youtube_discovery_triage", promptVersion: "youtube_discovery_triage_v1", executorSystem: "system-youtube-discovery", status: "success", aiGatewayModelId: model.id }]);
  });

  test("does not duplicate a successful invocation or its Usage event", async () => {
    const { claim, candidateId } = await claimedCandidate();
    const model = await insertModel();
    const input = { candidateId, status: "succeeded" as const, assessment: { ...assessment, signals: [...assessment.signals] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 12 };
    expect(await persistYoutubeDiscoveryTriage(claim, input, testDb)).toBe("completed");
    expect(await persistYoutubeDiscoveryTriage(claim, input, testDb)).toBe("completed");
    await expect(testDb.select().from(youtubeDiscoveryTriages)).resolves.toHaveLength(1);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(1);
  });

  test("uses only the claimed run's unexpired signal bundle with bounded metrics", async () => {
    const { claim, candidateId, policy } = await claimedCandidate();
    const otherRun = await createYoutubeDiscoveryRun({ policyVersionId: policy.id }, testDb);
    await testDb.insert(youtubeDiscoveryCommentSignals).values({ id: "other-run-signal", candidateId, runId: otherRun.id, policyVersionId: policy.id, signal: "commercial_risk", count: 9, score: 90, derivedAt: new Date(0), expiresAt: new Date("2030-01-01T00:00:00Z") });
    await testDb.update(youtubeDiscoveryCommentSignals).set({ derivedAt: new Date(0), expiresAt: new Date(1) }).where(eq(youtubeDiscoveryCommentSignals.runId, claim.id));

    await expect(getYoutubeDiscoveryTriageBundle(claim, videoId, testDb)).resolves.toMatchObject({ signals: [] });

    await testDb.update(youtubeDiscoveryCommentSignals).set({ expiresAt: new Date("2030-01-01T00:00:00Z") }).where(eq(youtubeDiscoveryCommentSignals.runId, claim.id));
    await expect(getYoutubeDiscoveryTriageBundle(claim, videoId, testDb)).resolves.toMatchObject({ signals: [{ signal: "practical_question_demand", count: 2, score: 20 }] });
  });

  test("records no-model and invalid-output failures without assessment values", async () => {
    const { claim, candidateId } = await claimedCandidate();
    expect(await persistYoutubeDiscoveryTriage(claim, { candidateId, status: "no_eligible_model", model: null, provider: "unavailable", modelName: "unavailable", latencyMs: null, errorCode: "no_eligible_model" }, testDb)).toBe("completed");
    const [failure] = await testDb.select().from(youtubeDiscoveryTriages);
    expect(failure).toMatchObject({ status: "no_eligible_model", relevanceScore: null, expectedValueScore: null, freshnessFitScore: null, commercialRiskScore: null, duplicateRiskScore: null, signals: null, aiGatewayModelId: null });
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "failure", provider: "unavailable", model: "unavailable", aiGatewayModelId: null, pricingCurrency: null, errorCode: "no_eligible_model" }]);
  });

  test("does not write triage or Usage for a candidate without an appearance in the claimed run", async () => {
    const { claim } = await claimedCandidate();
    const model = await insertModel();
    await testDb.insert(youtubeDiscoveryCandidates).values({ id: "unseen-candidate", videoId: "defGHI67890", canonicalUrl: "https://www.youtube.com/watch?v=defGHI67890" });
    expect(await persistYoutubeDiscoveryTriage(claim, { candidateId: "unseen-candidate", status: "succeeded", assessment: { ...assessment, signals: [...assessment.signals] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 12 }, testDb)).toBe("contended");
    await expect(testDb.select().from(youtubeDiscoveryTriages)).resolves.toEqual([]);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toEqual([]);
  });

  test("normalizes hostile succeeded input without an assessment to an empty invalid-output failure", async () => {
    const { claim, candidateId } = await claimedCandidate();
    const model = await insertModel();
    const unsafeInput = { candidateId, status: "succeeded", model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 12 } as unknown as Parameters<typeof persistYoutubeDiscoveryTriage>[1];
    expect(await persistYoutubeDiscoveryTriage(claim, unsafeInput, testDb)).toBe("completed");
    await expect(testDb.select().from(youtubeDiscoveryTriages)).resolves.toMatchObject([{ status: "invalid_output", relevanceScore: null, expectedValueScore: null, freshnessFitScore: null, commercialRiskScore: null, duplicateRiskScore: null, signals: null }]);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "failure", errorCode: "invalid_output" }]);
  });

  test("rolls back Usage and triage when the claim is lost before the guarded write", async () => {
    const { claim, candidateId } = await claimedCandidate();
    const model = await insertModel();
    await testDb.update(youtubeDiscoveryRuns).set({ claimedAt: new Date(0), leaseExpiresAt: new Date(1) }).where(eq(youtubeDiscoveryRuns.id, claim.id));
    expect(await persistYoutubeDiscoveryTriage(claim, { candidateId, status: "succeeded", assessment: { ...assessment, signals: [...assessment.signals] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 12 }, testDb)).toBe("contended");
    await expect(testDb.select().from(youtubeDiscoveryTriages)).resolves.toEqual([]);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toEqual([]);
  });

  test("deletes triage before its candidate while retaining generic Usage", async () => {
    const { claim, candidateId } = await claimedCandidate();
    const model = await insertModel();
    expect(await persistYoutubeDiscoveryTriage(claim, { candidateId, status: "succeeded", assessment: { ...assessment, signals: [...assessment.signals] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 12 }, testDb)).toBe("completed");
    await testDb.update(youtubeDiscoveryCandidates).set({ updatedAt: new Date(0) }).where(eq(youtubeDiscoveryCandidates.id, candidateId));
    const candidateClaim = (await claimNextYoutubeDiscoveryCandidateJob({ workerId: "triage-retention" }, testDb)).claim!;
    expect(await finishYoutubeDiscoveryCandidateJob(candidateClaim, testDb)).toBe("completed");
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(1);
    await expect(testDb.select().from(youtubeDiscoveryTriages)).resolves.toEqual([]);
    await expect(testDb.select().from(youtubeDiscoveryCandidates)).resolves.toEqual([]);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(1);
  });
});
