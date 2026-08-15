import { beforeEach, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { parseAdminYoutubeDiscoveryMissionCandidateCursor } from "@xuyenviet/contracts";
import { auditEvents, claimNextYoutubeDiscoveryRun, createPostgresAdminYoutubeDiscoveryPort, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, finishYoutubeDiscoveryRun, getYoutubeDiscoveryRecommendationBundle, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryRecommendation, persistYoutubeDiscoveryTriage, selectYoutubeDiscoveryTriageModel, youtubeDiscoveryAppearances, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryKnowledgeHandoffs, youtubeDiscoveryQueryProposals, youtubeDiscoveryRecommendations, youtubeDiscoveryRuns, aiGatewayModels, youtubeDiscoveryCandidates } from "@xuyenviet/database";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

const actionId = "mission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const principal = { userId: "operator", email: "operator@example.com", roles: ["operator"], sessionId: "mission-session", authorizationVersion: 1 };

describe.sequential("YouTube Discovery Mission projections", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("keeps durable Mission lineage, selects the latest run, deduplicates candidates, combines operator queries, and never writes on projections", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const system = await createYoutubeDiscoveryQueryProposal({ origin: "system", reason: "coverage_gap", priority: 1, queryText: "Da Lat kinh nghiệm cung đường đi ô tô", cadenceMinutes: 15, actor: createSystemAuditActor("system-youtube-discovery"), systemSignal: { reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 50 } }, testDb);
    await testDb.update(youtubeDiscoveryQueryProposals).set({ missionActionId: actionId }).where(eq(youtubeDiscoveryQueryProposals.id, system.id));
    const operator = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 20, queryText: "Da Lat lake", cadenceMinutes: 60, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const first = await completeCandidate(policy.id, system.id, "missioncandidate");
    // The same canonical video deliberately appears in two completed runs.
    await completeCandidate(policy.id, system.id, "missioncandidate");
    const later = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: system.id }, testDb);
    await testDb.transaction(async (transaction) => { await transaction.execute(sql`set local session_replication_role = replica`); await transaction.update(youtubeDiscoveryRuns).set({ createdAt: new Date("2030-08-10T00:00:00.000Z") }).where(eq(youtubeDiscoveryRuns.id, later.id)); });
    const owners = { async listMissionCoverage() { return { items: [], nextCursor: null }; }, async getMissionDetail(id: string) { return id === actionId ? { actionId, priority: 10, createdAt: "2026-08-01T00:00:00.000Z", corridor: null, location: "Da Lat", routeSegment: null, taxonomy: "route", freshness: "fresh" as const, conflict: "none" as const, demand: "unavailable" as const, seasonalContext: "unavailable" as const } : null; } };
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, undefined, undefined, undefined, owners);

    const detail = await readWithoutWrites(() => port.getMissionDetail(actionId, null));
    expect(detail).toMatchObject({ query: { id: system.id, origin: "system" }, latestRun: { createdAt: "2030-08-10T00:00:00.000Z", state: "queued" } });
    expect(detail?.candidates.items).toHaveLength(1);
    expect(detail?.candidates.items[0]).toMatchObject({ candidateId: first.candidateId, actionId, reviewAvailable: false, candidateState: "unavailable" });
    const queries = await readWithoutWrites(() => port.listMissionQueries(null));
    expect(queries.items.map((item) => item.id)).toEqual(expect.arrayContaining([system.id, operator.id]));
    expect(queries.items.find((item) => item.id === operator.id)).toMatchObject({ origin: "operator", queryText: "Da Lat lake" });
    const candidates = await readWithoutWrites(() => port.listMissionCandidates(null));
    expect(candidates.items.filter((item) => item.candidateId === first.candidateId)).toHaveLength(1);
    const funnel = await readWithoutWrites(() => port.missionFunnel());
    expect(funnel).toMatchObject({ recommended: 1, pendingReview: 0 });
    await expect(readWithoutWrites(() => port.getMissionDetail("mission-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", null))).resolves.toBeNull();
  });

  test("keeps a canonical candidate in each Mission trace and rejects stale Mission cursors", async () => {
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const secondActionId = "mission-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const firstQuery = await createSystemMissionQuery(actionId, "route");
    const secondQuery = await createSystemMissionQuery(secondActionId, "place");
    const candidate = await completeCandidate(policy.id, firstQuery.id, "sharedcandidate");
    await completeCandidate(policy.id, secondQuery.id, "sharedcandidate");
    for (let index = 0; index < 20; index += 1) await completeCandidate(policy.id, firstQuery.id, `detailcandidate${index}`);
    const owners = { async listMissionCoverage() { return { items: [], nextCursor: null }; }, async getMissionDetail(id: string) { return [actionId, secondActionId].includes(id) ? { actionId: id, priority: 10, createdAt: "2026-08-01T00:00:00.000Z", corridor: null, location: "Da Lat", routeSegment: null, taxonomy: "route", freshness: "fresh" as const, conflict: "none" as const, demand: "unavailable" as const, seasonalContext: "unavailable" as const } : null; } };
    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb, undefined, undefined, undefined, owners);
    const firstDetail = await port.getMissionDetail(actionId, null);
    expect(firstDetail?.candidates.items).toHaveLength(20);
    expect(firstDetail?.candidates.nextCursor).not.toBeNull();
    const nextCursor = parseAdminYoutubeDiscoveryMissionCandidateCursor(firstDetail?.candidates.nextCursor);
    const secondDetail = await port.getMissionDetail(actionId, nextCursor);
    expect(secondDetail?.candidates.items).toEqual([expect.objectContaining({ candidateId: candidate.candidateId, actionId })]);
    expect((await port.getMissionDetail(secondActionId, null))?.candidates.items).toEqual([expect.objectContaining({ candidateId: candidate.candidateId, actionId: secondActionId })]);
    expect((await port.missionFunnel()).recommended).toBe(21);
    const queries = await port.listMissionQueries(null);
    await testDb.update(youtubeDiscoveryQueryProposals).set({ priority: 2 }).where(eq(youtubeDiscoveryQueryProposals.id, firstQuery.id));
    await expect(port.listMissionQueries(queries.nextCursor ? null : { version: 1, priority: firstQuery.priority, createdAt: firstQuery.createdAt.toISOString(), id: firstQuery.id })).rejects.toThrow("Invalid YouTube Discovery Mission cursor.");
  });
});

async function createSystemMissionQuery(missionActionId: string, taxonomy: "route" | "place") {
  const query = await createYoutubeDiscoveryQueryProposal({ origin: "system", reason: "coverage_gap", priority: 50, queryText: taxonomy === "route" ? "Da Lat kinh nghiệm cung đường đi ô tô" : "Da Lat kinh nghiệm điểm dừng chân", cadenceMinutes: 15, actor: createSystemAuditActor("system-youtube-discovery"), systemSignal: { reason: "coverage_gap", geography: "Da Lat", taxonomy, priority: 50 } }, testDb);
  await testDb.update(youtubeDiscoveryQueryProposals).set({ missionActionId }).where(eq(youtubeDiscoveryQueryProposals.id, query.id));
  return query;
}

async function completeCandidate(policyVersionId: string, queryProposalId: string, videoId: string) {
  await createYoutubeDiscoveryRun({ policyVersionId, queryProposalId }, testDb);
  const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "mission-candidate" }, testDb)).claim;
  if (!claim) throw new Error("expected claim");
  await persistYoutubeDiscoveryCandidates(claim, [{ videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal: 0, searchTranche: "medium" }], testDb);
  await persistYoutubeDiscoveryEnrichment(claim, { videoId, title: "Đường đèo Việt Nam", durationSeconds: 180, defaultAudioLanguage: "vi", signals: [] }, testDb);
  await testDb.update(youtubeDiscoveryAppearances).set({ languageFit: "vi", durationFit: "eligible", eligibilityReason: "eligible_vietnamese", queryBuilderVersion: 2, languageClassifierVersion: 1, minimumUsefulDurationSeconds: 180 }).where(eq(youtubeDiscoveryAppearances.runId, claim.id));
  const existingModel = await testDb.select({ id: aiGatewayModels.id }).from(aiGatewayModels).where(eq(aiGatewayModels.purpose, "youtube_discovery_triage"));
  if (!existingModel.length) await testDb.insert(aiGatewayModels).values({ id: "mission-model", gatewayModelName: "test/mission", displayLabel: "Mission", purpose: "youtube_discovery_triage", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 });
  const model = await selectYoutubeDiscoveryTriageModel(testDb); const [candidate] = await testDb.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, videoId));
  if (!model || !candidate) throw new Error("expected candidate");
  await persistYoutubeDiscoveryTriage(claim, { candidateId: candidate.id, status: "succeeded", assessment: { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: [] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 1 }, testDb);
  const bundle = await getYoutubeDiscoveryRecommendationBundle(claim, videoId, testDb); if (typeof bundle === "string") throw new Error("expected bundle");
  await persistYoutubeDiscoveryRecommendation(claim, bundle, "eligible", Date.now() + 60_000, testDb); await finishYoutubeDiscoveryRun(claim, testDb);
  return { candidateId: candidate.id };
}

async function readWithoutWrites<T>(operation: () => Promise<T>) {
  const before = await snapshot(); const value = await operation(); expect(await snapshot()).toEqual(before); return value;
}
async function snapshot() {
  return { audits: await testDb.select({ id: auditEvents.id }).from(auditEvents).orderBy(auditEvents.id), reviews: await testDb.select({ recommendationId: youtubeDiscoveryCandidateReviewStates.recommendationId, state: youtubeDiscoveryCandidateReviewStates.state }).from(youtubeDiscoveryCandidateReviewStates).orderBy(youtubeDiscoveryCandidateReviewStates.recommendationId), handoffs: await testDb.select({ candidateId: youtubeDiscoveryKnowledgeHandoffs.candidateId, outcome: youtubeDiscoveryKnowledgeHandoffs.outcome }).from(youtubeDiscoveryKnowledgeHandoffs).orderBy(youtubeDiscoveryKnowledgeHandoffs.candidateId), runs: await testDb.select({ id: youtubeDiscoveryRuns.id, state: youtubeDiscoveryRuns.state, createdAt: youtubeDiscoveryRuns.createdAt }).from(youtubeDiscoveryRuns).orderBy(youtubeDiscoveryRuns.id) };
}
