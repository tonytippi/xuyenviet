import { beforeEach, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";

import { auditEvents, claimNextYoutubeDiscoveryRun, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, retainYoutubeDiscoveryRecords, sources, youtubeDiscoveryAppearances, youtubeDiscoveryCandidates, youtubeDiscoveryCommentSignals, youtubeDiscoveryRankingHistory, youtubeDiscoveryRuns } from "@xuyenviet/database";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

const videoId = "abcDEF12345";
const candidate = { videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal: 0 };
const enrichment = {
  videoId,
  title: "Da Lat route",
  description: "A bounded route description.",
  channelId: "channel123",
  channelName: "Route channel",
  publishedAt: new Date("2026-01-01T00:00:00Z"),
  durationSeconds: 3723,
  categoryId: "19",
  tags: ["route", "Da Lat"],
  viewCount: 100,
  likeCount: 10,
  commentCount: 2,
  channelSubscriberCount: 50,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  signals: [{ signal: "practical_question_demand" as const, count: 2, score: 20 }],
};

async function claimedRun(version = 1, policy: Record<string, unknown> = {}) {
  await seedTestOperator();
  const currentPolicy = await createYoutubeDiscoveryPolicyVersion({ version, isCurrent: true, policy, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
  const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
  const run = await createYoutubeDiscoveryRun({ policyVersionId: currentPolicy.id, queryProposalId: proposal.id }, testDb);
  const claim = (await claimNextYoutubeDiscoveryRun({ workerId: `enrichment-${run.id}` }, testDb)).claim;
  expect(claim).not.toBeNull();
  return { policy: currentPolicy, proposal, run, claim: claim! };
}

async function persistCandidateAndEnrichment(claim: Awaited<ReturnType<typeof claimedRun>>["claim"]) {
  expect(await persistYoutubeDiscoveryCandidates(claim, [candidate], testDb)).toBe("completed");
  expect(await persistYoutubeDiscoveryEnrichment(claim, enrichment, testDb)).toBe("completed");
}

describe.sequential("YouTube Discovery enrichment and retention", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("persists only safe enrichment metadata and signal aggregates with bounded provenance history", async () => {
    const { policy, run, claim } = await claimedRun();
    await persistCandidateAndEnrichment(claim);

    const [stored] = await testDb.select().from(youtubeDiscoveryCandidates);
    expect(stored).toMatchObject({ videoId, title: enrichment.title, description: enrichment.description, channelId: enrichment.channelId, durationSeconds: enrichment.durationSeconds, tags: enrichment.tags, viewCount: 100, thumbnailUrl: enrichment.thumbnailUrl });
    const signals = await testDb.select().from(youtubeDiscoveryCommentSignals);
    expect(signals).toMatchObject([{ candidateId: stored!.id, runId: run.id, policyVersionId: policy.id, signal: "practical_question_demand", count: 2, score: 20, derivedAt: expect.any(Date), expiresAt: expect.any(Date) }]);
    expect(signals[0]!.expiresAt.getTime() - signals[0]!.derivedAt.getTime()).toBeGreaterThanOrEqual(29 * 24 * 60 * 60 * 1000);
    expect(signals[0]!.expiresAt.getTime() - signals[0]!.derivedAt.getTime()).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000);
    const [history] = await testDb.select().from(youtubeDiscoveryRankingHistory).where(eq(youtubeDiscoveryRankingHistory.stage, "enriched"));
    const [appearance] = await testDb.select().from(youtubeDiscoveryAppearances).where(eq(youtubeDiscoveryAppearances.runId, run.id));
    expect(history).toMatchObject({ candidateId: stored!.id, appearanceId: appearance!.id, runId: run.id, policyVersionId: policy.id, stage: "enriched" });

    for (let index = 0; index < 19; index += 1) {
      await testDb.insert(youtubeDiscoveryRankingHistory).values({ id: `history-${index}`, candidateId: stored!.id, appearanceId: appearance!.id, runId: run.id, policyVersionId: policy.id, stage: "enriched", createdAt: new Date(Date.now() + index + 1) });
    }
    expect(await persistYoutubeDiscoveryEnrichment(claim, { ...enrichment, title: "Updated title", signals: [] }, testDb)).toBe("completed");
    await expect(testDb.select().from(youtubeDiscoveryRankingHistory).where(eq(youtubeDiscoveryRankingHistory.candidateId, stored!.id))).resolves.toHaveLength(20);
  });

  test("preserves canonical candidates across runs while attaching current-run enrichment provenance", async () => {
    const first = await claimedRun(1, { maxConcurrentRuns: 2 });
    await persistCandidateAndEnrichment(first.claim);
    const laterRun = await createYoutubeDiscoveryRun({ policyVersionId: first.policy.id, queryProposalId: first.proposal.id }, testDb);
    const laterClaim = (await claimNextYoutubeDiscoveryRun({ workerId: "enrichment-later" }, testDb)).claim!;
    expect(laterClaim.id).toBe(laterRun.id);
    expect(await persistYoutubeDiscoveryCandidates(laterClaim, [candidate], testDb)).toBe("completed");
    expect(await persistYoutubeDiscoveryEnrichment(laterClaim, { ...enrichment, title: "Later title" }, testDb)).toBe("completed");

    await expect(testDb.select().from(youtubeDiscoveryCandidates)).resolves.toHaveLength(1);
    await expect(testDb.select().from(youtubeDiscoveryAppearances)).resolves.toHaveLength(2);
    const histories = await testDb.select().from(youtubeDiscoveryRankingHistory).where(eq(youtubeDiscoveryRankingHistory.stage, "enriched"));
    expect(histories).toHaveLength(2);
    expect(histories.map((history) => history.runId).sort()).toEqual([first.run.id, laterRun.id].sort());
    expect(histories.every((history) => history.appearanceId !== null)).toBe(true);
  });

  test("discards provider-returned enrichment after revocation and records one terminal audit", async () => {
    const { policy, run, claim } = await claimedRun();
    expect(await persistYoutubeDiscoveryCandidates(claim, [candidate], testDb)).toBe("completed");
    await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);

    expect(await persistYoutubeDiscoveryEnrichment(claim, enrichment, testDb)).toBe("cancelled");
    expect(await persistYoutubeDiscoveryEnrichment(claim, enrichment, testDb)).toBe("contended");
    await expect(testDb.select({ title: youtubeDiscoveryCandidates.title }).from(youtubeDiscoveryCandidates)).resolves.toEqual([{ title: null }]);
    await expect(testDb.select().from(youtubeDiscoveryCommentSignals)).resolves.toEqual([]);
    await expect(testDb.select().from(youtubeDiscoveryRankingHistory).where(eq(youtubeDiscoveryRankingHistory.stage, "enriched"))).resolves.toEqual([]);
    await expect(testDb.select().from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run_terminal"), eq(auditEvents.targetId, run.id)))).resolves.toHaveLength(1);
    expect(policy.id).toBeTruthy();
  });

  test("expires signals before candidate and audit retention, then removes only Discovery records", async () => {
    const { policy, run, claim } = await claimedRun(1, { retentionDays: 2, commentSignalTtlDays: 1 });
    await persistCandidateAndEnrichment(claim);
    await testDb.insert(sources).values({ id: "unrelated-source", url: "https://example.com", canonicalUrl: "https://example.com", kind: "url", sourceType: "community", label: "Unrelated", submittedByUserId: "operator" });
    await testDb.insert(auditEvents).values({ id: "unrelated-audit", actorClass: "system", actorSystem: "system-test", operation: "update", targetType: "unrelated", targetId: "unrelated" });
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(0);
    await testDb.update(youtubeDiscoveryCommentSignals).set({ derivedAt: new Date(0), expiresAt: new Date(1) });
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(0);
    await expect(testDb.select().from(youtubeDiscoveryCommentSignals)).resolves.toEqual([]);
    await expect(testDb.select().from(youtubeDiscoveryCandidates)).resolves.toHaveLength(1);

    await testDb.update(youtubeDiscoveryCandidates).set({ updatedAt: new Date(0) });
    await testDb.insert(auditEvents).values({ id: "terminal-audit", actorClass: "system", actorSystem: "system-youtube-discovery", operation: "update", targetType: "youtube_discovery_run_terminal", targetId: run.id, afterSummary: "{}", createdAt: new Date(0) });
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(1);
    await expect(testDb.select().from(youtubeDiscoveryCandidates)).resolves.toEqual([]);
    await expect(testDb.select().from(youtubeDiscoveryAppearances)).resolves.toEqual([]);
    await expect(testDb.select().from(youtubeDiscoveryRankingHistory)).resolves.toEqual([]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.id, "terminal-audit"))).resolves.toEqual([]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.id, "unrelated-audit"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(sources).where(eq(sources.id, "unrelated-source"))).resolves.toHaveLength(1);
    expect(policy.id).toBeTruthy();
  });

  test("is idempotent and honors singleton and disabled-policy retention fences", async () => {
    const { claim: firstClaim } = await claimedRun(1, { retentionDays: 2, commentSignalTtlDays: 1 });
    await persistCandidateAndEnrichment(firstClaim);
    await testDb.update(youtubeDiscoveryCandidates).set({ updatedAt: new Date(0) });
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(1);
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(0);

    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { retentionDays: 2, commentSignalTtlDays: 1 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Nha Trang route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "enrichment-retention-second" }, testDb)).claim!;
    expect(await persistYoutubeDiscoveryCandidates(claim, [candidate], testDb)).toBe("completed");
    expect(await persistYoutubeDiscoveryEnrichment(claim, enrichment, testDb)).toBe("completed");
    await testDb.update(youtubeDiscoveryCandidates).set({ updatedAt: new Date(0) });
    const databaseUrl = process.env.DATABASE_URL_TEST!;
    const lockHolder = postgres(databaseUrl, { max: 1 });
    try {
      await lockHolder`select pg_advisory_lock(hashtext('youtube-discovery-retention'))`;
      expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(0);
      await expect(testDb.select().from(youtubeDiscoveryCandidates)).resolves.toHaveLength(1);
      await lockHolder`select pg_advisory_unlock(hashtext('youtube-discovery-retention'))`;
    } finally {
      await lockHolder.end();
    }
    await createYoutubeDiscoveryPolicyVersion({ version: 3, isCurrent: true, policy: { enabled: false }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(0);
    await expect(testDb.select().from(youtubeDiscoveryCandidates)).resolves.toHaveLength(1);
  });

  test("bounds each expired comment-signal deletion pass", async () => {
    const { claim, policy } = await claimedRun();
    const candidates = Array.from({ length: 4 }, (_, index) => ({ videoId: `sigtest000${index}`, canonicalUrl: `https://www.youtube.com/watch?v=sigtest000${index}`, resultOrdinal: index }));
    expect(await persistYoutubeDiscoveryCandidates(claim, candidates, testDb)).toBe("completed");
    const stored = await testDb.select().from(youtubeDiscoveryCandidates);
    const signals = ["recent_discussion", "stale_or_changed_warning", "practical_question_demand", "creator_responsiveness", "commercial_risk", "contradictory_discussion"] as const;
    for (const index of Array.from({ length: 24 }, (_, value) => value)) {
      await testDb.insert(youtubeDiscoveryCommentSignals).values({ id: `expired-signal-${index}`, candidateId: stored[index % 4]!.id, runId: claim.id, policyVersionId: policy.id, signal: signals[Math.floor(index / 4)]!, count: 1, score: 10, derivedAt: new Date(0), expiresAt: new Date(1) });
    }
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(0);
    await expect(testDb.select().from(youtubeDiscoveryCommentSignals)).resolves.toHaveLength(4);
    expect(await retainYoutubeDiscoveryRecords(testDb)).toBe(0);
    await expect(testDb.select().from(youtubeDiscoveryCommentSignals)).resolves.toHaveLength(0);
  });
});
