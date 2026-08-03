import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { AdminOverview, AdminOverviewCoverage } from "@xuyenviet/contracts";
import type { AdminOverviewPort } from "@xuyenviet/domain";

import { getDb } from "./client";
import { getCorridorBucketLabel, getCorridorBuckets } from "./knowledge-corridor";
import { evaluateKnowledgeTravelerPolicy } from "./knowledge-state";
import { knowledgeCardEvidence, knowledgeCards, knowledgeIngestionJobs, knowledgeRecommendations, knowledgeSourceSuggestions, knowledgeCardTypeValues, sourceCaptureVersions, sources, type KnowledgeCardType } from "./schema";

const activeCorridorSeedTarget = 100;
type OverviewDb = Pick<ReturnType<typeof getDb>, "select">;

export function createPostgresAdminOverviewPort(): AdminOverviewPort {
  return { getOverview: () => getAdminOverview(getDb()) };
}

async function getAdminOverview(db: OverviewDb): Promise<AdminOverview> {
  const [sourceRows, processingRows, failedRows, draftRows, recommendationRows, activeRows, coverage] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(sources).where(eq(sources.eligibility, "eligible")),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeIngestionJobs).where(inArray(knowledgeIngestionJobs.stage, ["queued", "triaging", "extracting", "judging", "relating"])),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.stage, "failed")),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeCards).where(and(eq(knowledgeCards.status, "draft"), eq(knowledgeCards.needsReview, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeRecommendations).where(inArray(knowledgeRecommendations.status, ["open", "in_review"])),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeCards).where(eq(knowledgeCards.publicationState, "active")),
    getAdminOverviewCoverage(db),
  ]);
  return { sourcesReadyForProcessing: sourceRows[0]?.count ?? 0, processingJobs: processingRows[0]?.count ?? 0, failedProcessingJobs: failedRows[0]?.count ?? 0, draftsAwaitingReview: draftRows[0]?.count ?? 0, openRecommendations: recommendationRows[0]?.count ?? 0, activeKnowledgeCards: activeRows[0]?.count ?? 0, coverage };
}

/** The coverage rules are kept with the database read owner, not an HTTP or root-app module. */
export async function getAdminOverviewCoverage(db: OverviewDb): Promise<AdminOverviewCoverage> {
  const cardRows = await db.select({ id: knowledgeCards.id, type: knowledgeCards.type, needsReview: knowledgeCards.needsReview, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, publicationState: knowledgeCards.publicationState, knowledgeState: knowledgeCards.knowledgeState, reviewState: knowledgeCards.reviewState, verificationState: knowledgeCards.verificationState, title: knowledgeCards.title, summary: knowledgeCards.summary, conditions: knowledgeCards.conditions }).from(knowledgeCards).where(inArray(knowledgeCards.publicationState, ["active", "suppressed"]));
  const evidenceRows = await db.select({ cardId: knowledgeCardEvidence.knowledgeCardId, independenceKey: knowledgeCardEvidence.independenceKey }).from(knowledgeCardEvidence).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardEvidence.knowledgeCardId)).innerJoin(sources, eq(sources.id, knowledgeCardEvidence.sourceId)).innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId), eq(sourceCaptureVersions.sourceId, knowledgeCardEvidence.sourceId), eq(sources.currentCaptureVersionId, knowledgeCardEvidence.captureVersionId))).where(and(eq(knowledgeCardEvidence.state, "active"), sql`${knowledgeCardEvidence.supportLevel} in ('primary', 'supporting')`, sql`${knowledgeCardEvidence.displayPolicy} in ('fact_only', 'traveler_visible')`, eq(sources.eligibility, "eligible"), sql`${sources.kind} = ${sourceCaptureVersions.captureKind} and ${sources.kind} in ('url', 'facebook', 'youtube')`, isNull(sourceCaptureVersions.payloadDeletedAt), sql`${sourceCaptureVersions.rawText} is not null`, sql`substring(${sourceCaptureVersions.rawText} from ${knowledgeCardEvidence.spanStart} + 1 for ${knowledgeCardEvidence.spanEnd} - ${knowledgeCardEvidence.spanStart}) = ${knowledgeCardEvidence.quoteText}`));
  const evidenceKeys = new Map<string, Set<string>>();
  for (const row of evidenceRows) { const keys = evidenceKeys.get(row.cardId) ?? new Set<string>(); keys.add(row.independenceKey); evidenceKeys.set(row.cardId, keys); }
  const eligible = new Map<string, { type: KnowledgeCardType; locationName: string | null; routeSegment: string | null }>();
  let activeCommunityObservations = 0; let activeCommunityPatterns = 0; let caveatOnlyHighRiskCards = 0; let pendingReviewCards = 0; let pendingVerificationCards = 0;
  for (const card of cardRows) {
    if (!hasCorridorSignal(card.routeSegment, card.locationName)) continue;
    const activeTravelerSafeEvidenceCount = evidenceKeys.get(card.id)?.size ?? 0;
    if (activeTravelerSafeEvidenceCount > 0 && (card.knowledgeState === "uncertain" || card.verificationState === "required")) caveatOnlyHighRiskCards += 1;
    if (card.needsReview || card.reviewState === "ai_recommended" || card.reviewState === "in_review") pendingReviewCards += 1;
    if (card.verificationState === "required") pendingVerificationCards += 1;
    if (evaluateKnowledgeTravelerPolicy({ ...card, activeTravelerSafeEvidenceCount, activeTravelerSafeIndependenceKeyCount: activeTravelerSafeEvidenceCount }).policy === "contextual_use" && !eligible.has(card.id)) {
      eligible.set(card.id, { type: card.type, locationName: card.locationName, routeSegment: card.routeSegment });
      if (card.knowledgeState === "community_observation") activeCommunityObservations += 1;
      if (card.knowledgeState === "community_pattern") activeCommunityPatterns += 1;
    }
  }
  const recommendationRows = await db.select({ cardId: knowledgeRecommendations.knowledgeCardId, reason: knowledgeRecommendations.reason, priority: knowledgeRecommendations.priority }).from(knowledgeRecommendations).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId)).where(and(sql`${knowledgeRecommendations.status} in ('open', 'in_review')`, eq(knowledgeRecommendations.contentVersion, knowledgeCards.contentVersion), eq(knowledgeRecommendations.evidenceSetRevision, knowledgeCards.evidenceSetRevision)));
  const corridorCardIds = new Set(cardRows.filter((card) => hasCorridorSignal(card.routeSegment, card.locationName)).map((card) => card.id));
  const actionableWork = new Map<string, AdminOverviewCoverage["actionableWork"][number]>();
  for (const row of recommendationRows) if (corridorCardIds.has(row.cardId)) { const key = `${row.priority}:${row.reason}`; const current = actionableWork.get(key); actionableWork.set(key, current ? { ...current, count: current.count + 1 } as typeof current : { kind: "recommendation", reason: row.reason, priority: row.priority, count: 1 }); }
  const suggestionRows = await db.select({ action: knowledgeSourceSuggestions.action, suggestedCardId: knowledgeSourceSuggestions.suggestedCardId, targetCardId: knowledgeSourceSuggestions.targetCardId }).from(knowledgeSourceSuggestions).innerJoin(sources, and(eq(sources.id, knowledgeSourceSuggestions.sourceId), eq(sources.eligibility, "eligible"))).innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.id, sources.currentCaptureVersionId), isNull(sourceCaptureVersions.payloadDeletedAt))).where(or(eq(knowledgeSourceSuggestions.action, "create"), eq(knowledgeSourceSuggestions.action, "update"), eq(knowledgeSourceSuggestions.action, "conflict")));
  const suggestionCardIds = Array.from(new Set(suggestionRows.flatMap((row) => [row.targetCardId, row.suggestedCardId]).filter((id): id is string => Boolean(id))));
  const suggestionCorridorIds = new Set(suggestionCardIds.length ? (await db.select({ id: knowledgeCards.id, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment }).from(knowledgeCards).where(inArray(knowledgeCards.id, suggestionCardIds))).filter((card) => hasCorridorSignal(card.routeSegment, card.locationName)).map((card) => card.id) : []);
  for (const row of suggestionRows) { const cardId = row.targetCardId ?? row.suggestedCardId; if (!cardId || !suggestionCorridorIds.has(cardId) || (row.action !== "create" && row.action !== "update" && row.action !== "conflict")) continue; const key = `source_intake:${row.action}`; const current = actionableWork.get(key); actionableWork.set(key, current ? { ...current, count: current.count + 1 } as typeof current : { kind: "source_intake", reason: row.action, priority: null, count: 1 }); }
  const activeEvidenceGroundedCards = eligible.size;
  const byType = Array.from(knowledgeCardTypeValues, (type) => ({ type, count: 0 }));
  for (const card of eligible.values()) { const item = byType.find((entry) => entry.type === card.type); if (item) item.count += 1; }
  const byRouteOrLocation = corridorLabels().map((routeOrLocation) => ({ routeOrLocation, count: 0 }));
  for (const card of eligible.values()) { const item = byRouteOrLocation.find((entry) => entry.routeOrLocation === corridorBucket(card.routeSegment, card.locationName)); if (item) item.count += 1; }
  return { targetActiveCards: activeCorridorSeedTarget, activeEvidenceGroundedCards, remainingActiveCards: Math.max(activeCorridorSeedTarget - activeEvidenceGroundedCards, 0), isComplete: activeEvidenceGroundedCards >= activeCorridorSeedTarget, activeCommunityObservations, activeCommunityPatterns, caveatOnlyHighRiskCards, pendingReviewCards, pendingVerificationCards, actionableWork: Array.from(actionableWork.values()).sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER) || a.reason.localeCompare(b.reason)), byType: byType.sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)), byRouteOrLocation: byRouteOrLocation.sort((a, b) => b.count - a.count || a.routeOrLocation.localeCompare(b.routeOrLocation)) };
}

function hasCorridorSignal(routeSegment: string | null, locationName: string | null) { return getCorridorBucketLabel(routeSegment, locationName) !== null; }
function corridorBucket(routeSegment: string | null, locationName: string | null) { return getCorridorBucketLabel(null, locationName) ?? getCorridorBucketLabel(routeSegment, null); }
function corridorLabels() { return getCorridorBuckets().map((bucket) => bucket.label); }
