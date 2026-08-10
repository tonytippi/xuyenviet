import { beforeEach, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";

import { aiGatewayModels, claimNextYoutubeDiscoveryRun, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, getYoutubeDiscoveryRecommendationBundle, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryRecommendation, persistYoutubeDiscoveryTriage, retainYoutubeDiscoveryRecords, selectYoutubeDiscoveryTriageModel, youtubeDiscoveryCandidates, youtubeDiscoveryCommentSignals, youtubeDiscoveryRankingHistory, youtubeDiscoveryRecommendations, youtubeDiscoveryTriages } from "@xuyenviet/database";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

describe.sequential("YouTube Discovery recommendation persistence", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("persists one immutable recommendation and its history atomically", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "recommendation-test" }, testDb)).claim!;
    const videoId = "abcDEF12345";
    await persistYoutubeDiscoveryCandidates(claim, [{ videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal: 0 }], testDb);
    await persistYoutubeDiscoveryEnrichment(claim, { videoId, signals: [] }, testDb);
    await testDb.insert(aiGatewayModels).values({ id: "recommendation-model", gatewayModelName: "test/recommendation", displayLabel: "Recommendation", purpose: "youtube_discovery_triage", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 });
    const model = (await selectYoutubeDiscoveryTriageModel(testDb))!;
    const [candidate] = await testDb.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, videoId));
    await persistYoutubeDiscoveryTriage(claim, { candidateId: candidate.id, status: "succeeded", assessment: { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: [] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 1 }, testDb);
    const bundle = await getYoutubeDiscoveryRecommendationBundle(claim, videoId, testDb);
    if (typeof bundle === "string") throw new Error("expected recommendation bundle");
    expect(await persistYoutubeDiscoveryRecommendation(claim, bundle, "eligible", Date.now() + 60_000, testDb)).toBe("completed");
    expect(await persistYoutubeDiscoveryRecommendation(claim, bundle, "eligible", Date.now() + 60_000, testDb)).toBe("completed");
    await expect(testDb.select().from(youtubeDiscoveryRecommendations)).resolves.toMatchObject([{ recommendation: "consider", score: "0.800000" }]);
    await expect(testDb.select().from(youtubeDiscoveryRankingHistory)).resolves.toHaveLength(4);
    await expect(testDb.select().from(youtubeDiscoveryRankingHistory).where(eq(youtubeDiscoveryRankingHistory.stage, "triaged"))).resolves.toMatchObject([{ candidateId: candidate.id, runId: claim.id, policyVersionId: policy.id }]);

    await expect(testDb.update(youtubeDiscoveryRecommendations).set({ reason: "below_defer_band" }).where(eq(youtubeDiscoveryRecommendations.id, (await testDb.select({ id: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryRecommendations))[0]!.id))).rejects.toThrow();
    await expect(testDb.delete(youtubeDiscoveryRecommendations)).rejects.toThrow();
    await testDb.update(youtubeDiscoveryCandidates).set({ updatedAt: new Date(0) }).where(eq(youtubeDiscoveryCandidates.id, candidate.id));
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(1);
    await expect(testDb.select().from(youtubeDiscoveryRecommendations)).resolves.toEqual([]);
  });

  test("retains recommended history and excludes expired derived signals", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "recommendation-expiry-test" }, testDb)).claim!;
    const videoId = "abcDEF12345";
    await persistYoutubeDiscoveryCandidates(claim, [{ videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal: 0 }], testDb);
    await persistYoutubeDiscoveryEnrichment(claim, { videoId, signals: [{ signal: "practical_question_demand", count: 1, score: 10 }] }, testDb);
    await testDb.insert(aiGatewayModels).values({ id: "recommendation-expiry-model", gatewayModelName: "test/recommendation-expiry", displayLabel: "Recommendation expiry", purpose: "youtube_discovery_triage", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 });
    const model = (await selectYoutubeDiscoveryTriageModel(testDb))!;
    const [candidate] = await testDb.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, videoId));
    await persistYoutubeDiscoveryTriage(claim, { candidateId: candidate!.id, status: "succeeded", assessment: { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: ["practical_question_demand"] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 1 }, testDb);
    await testDb.update(youtubeDiscoveryCommentSignals).set({ derivedAt: new Date(0) }).where(eq(youtubeDiscoveryCommentSignals.candidateId, candidate!.id));
    await testDb.update(youtubeDiscoveryCommentSignals).set({ expiresAt: new Date(1) }).where(eq(youtubeDiscoveryCommentSignals.candidateId, candidate!.id));
    const bundle = await getYoutubeDiscoveryRecommendationBundle(claim, videoId, testDb);
    if (typeof bundle === "string") throw new Error("expected recommendation bundle");
    expect(bundle.triage.signals).toEqual([]);
    expect(await persistYoutubeDiscoveryRecommendation(claim, bundle, "eligible", Date.now() + 60_000, testDb)).toBe("completed");
    await expect(testDb.select({ signals: youtubeDiscoveryRecommendations.signals }).from(youtubeDiscoveryRecommendations)).resolves.toEqual([{ signals: [] }]);

    await testDb.execute(sql`insert into youtube_discovery_ranking_history (id, candidate_id, appearance_id, run_id, policy_version_id, stage) select 'trim-history-' || value, ${candidate!.id}, null, ${claim.id}, ${policy.id}, 'triaged' from generate_series(1, 25) value`);
    await testDb.execute(sql`delete from youtube_discovery_ranking_history where id in (select id from youtube_discovery_ranking_history where candidate_id = ${candidate!.id} and stage <> 'recommended' order by created_at desc, id desc offset 20)`);
    await expect(testDb.select({ stage: youtubeDiscoveryRankingHistory.stage }).from(youtubeDiscoveryRankingHistory).where(eq(youtubeDiscoveryRankingHistory.stage, "recommended"))).resolves.toEqual([{ stage: "recommended" }]);
  });

  test("rejects direct recommendation insertion unless its linked triage succeeded", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "recommendation-trigger-test" }, testDb)).claim!;
    const videoId = "abcDEF12345";
    await persistYoutubeDiscoveryCandidates(claim, [{ videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal: 0 }], testDb);
    await persistYoutubeDiscoveryEnrichment(claim, { videoId, signals: [] }, testDb);
    await testDb.insert(aiGatewayModels).values({ id: "recommendation-trigger-model", gatewayModelName: "test/recommendation-trigger", displayLabel: "Recommendation trigger", purpose: "youtube_discovery_triage", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 });
    const model = (await selectYoutubeDiscoveryTriageModel(testDb))!;
    const [candidate] = await testDb.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, videoId));
    await persistYoutubeDiscoveryTriage(claim, { candidateId: candidate!.id, status: "succeeded", assessment: { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: [] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 1 }, testDb);
    const bundle = await getYoutubeDiscoveryRecommendationBundle(claim, videoId, testDb);
    if (typeof bundle === "string") throw new Error("expected recommendation bundle");
    expect(await persistYoutubeDiscoveryRecommendation(claim, bundle, "already_compatible", Date.now() + 60_000, testDb)).toBe("completed");
    await expect(testDb.select().from(youtubeDiscoveryRecommendations)).resolves.toMatchObject([{ recommendation: "skip", reason: "already_compatible" }]);

    await expect(testDb.update(youtubeDiscoveryTriages).set({ status: "invalid_output", relevanceScore: null, expectedValueScore: null, freshnessFitScore: null, commercialRiskScore: null, duplicateRiskScore: null, signals: null }).where(eq(youtubeDiscoveryTriages.id, bundle.triageId))).rejects.toThrow();
    await expect(testDb.delete(youtubeDiscoveryTriages).where(eq(youtubeDiscoveryTriages.id, bundle.triageId))).rejects.toThrow();
    await expect(testDb.execute(sql`insert into youtube_discovery_ranking_history (id, candidate_id, appearance_id, run_id, policy_version_id, stage, recommendation_id) values ('mismatched-recommendation-history', ${bundle.candidateId}, ${bundle.appearanceId}, ${claim.id}, 'wrong-policy', 'recommended', (select id from youtube_discovery_recommendations limit 1))`)).rejects.toThrow();
    await expect(testDb.execute(sql`insert into youtube_discovery_recommendations (id, candidate_id, appearance_id, run_id, policy_version_id, triage_id, score, relevance_score, expected_value_score, freshness_fit_score, commercial_risk_score, duplicate_risk_score, recommendation, factors, reason) values ('duplicate-factor-recommendation', ${bundle.candidateId}, ${bundle.appearanceId}, ${claim.id}, ${policy.id}, ${bundle.triageId}, 0, 0, 0, 0, 0, 0, 'skip', array['relevance', 'relevance'], 'below_defer_band')`)).rejects.toThrow();
    await expect(testDb.execute(sql`insert into youtube_discovery_recommendations (id, candidate_id, appearance_id, run_id, policy_version_id, triage_id, score, relevance_score, expected_value_score, freshness_fit_score, commercial_risk_score, duplicate_risk_score, recommendation, penalties, reason) values ('duplicate-penalty-recommendation', ${bundle.candidateId}, ${bundle.appearanceId}, ${claim.id}, ${policy.id}, ${bundle.triageId}, 0, 0, 0, 0, 0, 0, 'skip', array['commercial_risk', 'commercial_risk'], 'below_defer_band')`)).rejects.toThrow();
    await expect(testDb.execute(sql`insert into youtube_discovery_recommendations (id, candidate_id, appearance_id, run_id, policy_version_id, triage_id, score, relevance_score, expected_value_score, freshness_fit_score, commercial_risk_score, duplicate_risk_score, recommendation, signals, reason) values ('duplicate-signal-recommendation', ${bundle.candidateId}, ${bundle.appearanceId}, ${claim.id}, ${policy.id}, ${bundle.triageId}, 0, 0, 0, 0, 0, 0, 'skip', array['recent_discussion', 'recent_discussion'], 'below_defer_band')`)).rejects.toThrow();
  });
});
