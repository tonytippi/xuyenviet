import { randomBytes } from "node:crypto";
import { createHmac } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, sql as drizzleSql } from "drizzle-orm";
import { aiGatewayModels, browserSessions, claimNextYoutubeDiscoveryRun, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, finishYoutubeDiscoveryRun, getYoutubeDiscoveryRecommendationBundle, knowledgeCards, knowledgeRecommendations, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryRecommendation, persistYoutubeDiscoveryTriage, retryYoutubeDiscoveryRun, schema, selectYoutubeDiscoveryTriageModel, youtubeDiscoveryCandidates, youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryRecommendations, youtubeDiscoveryRuns, userRoles, users } from "@xuyenviet/database";

const databaseUrl = required("DATABASE_URL");
const sessionLookupKey = required("XV_BROWSER_SESSION_LOOKUP_KEY");
const csrfKey = required("XV_BROWSER_CSRF_KEY");

if (process.env.STORY_20_5_FIXTURE_CONFIRMATION !== "confirm-disposable-fixture") throw new Error("Set STORY_20_5_FIXTURE_CONFIRMATION=confirm-disposable-fixture for the controlled local fixture.");
if (!isLocal(databaseUrl)) throw new Error("Story 20.5 fixtures require a controlled local database.");

const sql = postgres(databaseUrl, { max: 1 });
const db = drizzle(sql, { schema });
const operatorId = "story-20-5-operator";
const actionId = "mission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const videoId = "abcDEF12345";

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; }
function isLocal(value: string) { const url = new URL(value); return ["localhost", "127.0.0.1", "::1"].includes(url.hostname); }

async function main() {
  try {
    await db.insert(users).values({ id: operatorId, email: "story-20-5-operator@example.test", name: "Story 20.5 Operator" }).onConflictDoNothing();
    await db.insert(userRoles).values({ userId: operatorId, role: "operator" }).onConflictDoNothing();
    await db.insert(userRoles).values({ userId: operatorId, role: "admin" }).onConflictDoNothing();
    const [policy] = await db.select({ id: youtubeDiscoveryPolicyVersions.id }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true));
    if (!policy) throw new Error("Controlled database seed did not provide a current Discovery policy.");
    const reviewQuery = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 1, queryText: "Da Lat evidence route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: operatorId, email: "story-20-5-operator@example.test" }) }, db);
    const [existingMissionQuery] = await db.select({ id: youtubeDiscoveryQueryProposals.id }).from(youtubeDiscoveryQueryProposals).where(and(eq(youtubeDiscoveryQueryProposals.origin, "system"), eq(youtubeDiscoveryQueryProposals.reason, "coverage_gap"), eq(youtubeDiscoveryQueryProposals.queryText, "Da Lat route")));
    const missionQuery = existingMissionQuery ?? await createYoutubeDiscoveryQueryProposal({ origin: "system", reason: "coverage_gap", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createSystemAuditActor("system-youtube-discovery"), systemSignal: { reason: "coverage_gap", geography: "Da Lat", taxonomy: "route", priority: 50 } }, db);
    await db.update(youtubeDiscoveryQueryProposals).set({ missionActionId: actionId }).where(eq(youtubeDiscoveryQueryProposals.id, missionQuery.id));
    await db.insert(knowledgeCards).values({ id: "story-20-5-mission-card", type: "route_note", title: "Story 20.5 Mission coverage", locationName: "Da Lat", summary: "Controlled local Mission coverage fixture.", aiPromptVersion: "story-20-5", executorSystem: "story-20-5" }).onConflictDoNothing();
    const [missionCoverage] = await db.select({ id: knowledgeRecommendations.id }).from(knowledgeRecommendations).where(eq(knowledgeRecommendations.discoveryMissionActionId, actionId));
    if (!missionCoverage) await db.insert(knowledgeRecommendations).values({ knowledgeCardId: "story-20-5-mission-card", contentVersion: 1, evidenceSetRevision: 1, status: "open", workType: "missing_context", priority: 50, discoveryMissionActionId: actionId, executorSystem: "story-20-5" });

    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: missionQuery.id }, db);
    const reviewClaim = (await claimNextYoutubeDiscoveryRun({ workerId: "story-20-5-review" }, db)).claim;
    if (!reviewClaim) throw new Error("Could not claim controlled review run.");
    await persistYoutubeDiscoveryCandidates(reviewClaim, [{ videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal: 0, searchTranche: "medium" }], db);
    await persistYoutubeDiscoveryEnrichment(reviewClaim, { videoId, signals: [] }, db);
    await db.insert(aiGatewayModels).values({ id: "story-20-5-triage", gatewayModelName: "test/story-20-5", displayLabel: "Story 20.5", purpose: "youtube_discovery_triage", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 }).onConflictDoNothing();
    const model = await selectYoutubeDiscoveryTriageModel(db);
    const [candidate] = await db.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, videoId));
    if (!model || !candidate) throw new Error("Could not create controlled candidate.");
    await persistYoutubeDiscoveryTriage(reviewClaim, { candidateId: candidate.id, status: "succeeded", assessment: { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: [] }, model, provider: "fixture", modelName: model.gatewayModelName, latencyMs: 1 }, db);
    const bundle = await getYoutubeDiscoveryRecommendationBundle(reviewClaim, videoId, db);
    if (typeof bundle === "string") throw new Error("Could not create controlled recommendation bundle.");
    await persistYoutubeDiscoveryRecommendation(reviewClaim, bundle, "eligible", Date.now() + 60_000, db);
    const [recommendation] = await db.select({ id: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryRecommendations).where(eq(youtubeDiscoveryRecommendations.candidateId, candidate.id));
    if (!recommendation) throw new Error("Could not create controlled recommendation.");
    if (await finishYoutubeDiscoveryRun(reviewClaim, db) !== "completed") throw new Error("Could not finish controlled review run.");

    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: reviewQuery.id }, db);
    const incidentClaim = (await claimNextYoutubeDiscoveryRun({ workerId: "story-20-5-health" }, db)).claim;
    if (!incidentClaim) throw new Error("Could not claim controlled health run.");
    if (await retryYoutubeDiscoveryRun(incidentClaim, "provider_rate_limited", db) !== "retrying") throw new Error("Could not produce controlled Health incident.");
    const [incidentRun] = await db.select({ queryProposalId: youtubeDiscoveryRuns.queryProposalId }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, incidentClaim.id));
    if (!incidentRun?.queryProposalId) throw new Error("Could not resolve controlled Health incident group.");

    const sessionId = randomBytes(48).toString("base64url").slice(0, 64);
    const csrf = createHmac("sha256", csrfKey).update(`nonce.${sessionId}`).digest("base64url");
    const lookup = createHmac("sha256", sessionLookupKey).update(sessionId).digest("base64url");
    const csrfHash = createHmac("sha256", csrfKey).update(`${sessionId}.${csrf}`).digest("base64url");
    const [operator] = await db.select({ authorizationVersion: users.authorizationVersion }).from(users).where(eq(users.id, operatorId));
    if (!operator) throw new Error("Could not load controlled operator session version.");
    // The API evaluates expiry against PostgreSQL's clock, so mint the evidence
    // session there rather than relying on a potentially skewed host clock.
    await db.insert(browserSessions).values({ sessionLookupHash: lookup, userId: operatorId, csrfHash, authorizationVersion: operator.authorizationVersion, expires: drizzleSql`now() + interval '1 hour'` });
    const [session] = await db.select({ userId: browserSessions.userId, authorizationVersion: browserSessions.authorizationVersion }).from(browserSessions).where(eq(browserSessions.sessionLookupHash, lookup));
    const roles = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, operatorId));
    if (session?.userId !== operatorId || session.authorizationVersion !== operator.authorizationVersion || !roles.some(({ role }) => role === "admin")) throw new Error("Controlled browser fixture session is incomplete.");

    console.log(JSON.stringify({ fixtureId: "story-20-5-local", cookieName: "xuyenviet-session", cookieValue: sessionId, recommendationId: recommendation.id, missionActionId: actionId, incidentActionId: `${incidentRun.queryProposalId}:provider_rate_limited` }));
  } finally { await sql.end(); }
}

void main();
