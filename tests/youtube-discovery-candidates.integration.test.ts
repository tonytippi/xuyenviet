import { beforeEach, describe, expect, test } from "vitest";
import { and, eq, sql } from "drizzle-orm";

import { auditEvents, claimNextYoutubeDiscoveryRun, createSystemAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, createYoutubeCaptureEligibilityPort, persistYoutubeDiscoveryCandidates, sourceCaptureVersions, sources, youtubeDiscoveryAppearances, youtubeDiscoveryCandidates, youtubeDiscoveryRankingHistory, youtubeDiscoveryRuns } from "@xuyenviet/database";
import { createUserAuditActor } from "@xuyenviet/database";
import { youtubeCaptureCompatibilityForMediaResolution } from "@xuyenviet/domain";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

const candidate = (videoId: string, resultOrdinal = 0) => ({ videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal });

async function claimedRun() {
  await seedTestOperator();
  const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, policy: { maxConcurrentRuns: 2 }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
  const proposal = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
  const run = await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: proposal.id }, testDb);
  const claim = (await claimNextYoutubeDiscoveryRun({ workerId: `discovery-${run.id}` }, testDb)).claim;
  expect(claim).not.toBeNull();
  return { policy, proposal, run, claim: claim! };
}

describe.sequential("YouTube Discovery candidate persistence", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("persists many unique results as independent appearances and history", async () => {
    const { claim } = await claimedRun();
    const results = Array.from({ length: 25 }, (_, index) => candidate(`video${String(index).padStart(6, "0")}`, index));
    expect(await persistYoutubeDiscoveryCandidates(claim, results, testDb)).toBe("completed");
    await expect(testDb.select().from(youtubeDiscoveryCandidates)).resolves.toHaveLength(25);
    await expect(testDb.select().from(youtubeDiscoveryAppearances)).resolves.toHaveLength(25);
    await expect(testDb.select().from(youtubeDiscoveryRankingHistory)).resolves.toHaveLength(25);
  });

  test("deduplicates a candidate while retaining appearances and history across concurrent runs", async () => {
    const first = await claimedRun();
    const secondRun = await createYoutubeDiscoveryRun({ policyVersionId: first.policy.id, queryProposalId: first.proposal.id }, testDb);
    const secondClaim = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-later" }, testDb)).claim!;
    expect(secondClaim.id).toBe(secondRun.id);
    expect(await Promise.all([persistYoutubeDiscoveryCandidates(first.claim, [candidate("abcDEF12345")], testDb), persistYoutubeDiscoveryCandidates(secondClaim, [candidate("abcDEF12345")], testDb)])).toEqual(["completed", "completed"]);
    await expect(testDb.select().from(youtubeDiscoveryCandidates)).resolves.toHaveLength(1);
    await expect(testDb.select().from(youtubeDiscoveryAppearances)).resolves.toHaveLength(2);
    await expect(testDb.select().from(youtubeDiscoveryRankingHistory)).resolves.toHaveLength(2);
  });

  test("fences a revoked claimant after provider work without graph writes and records one terminal audit", async () => {
    const { policy, claim, run } = await claimedRun();
    await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: true, policy: { enabled: false }, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    expect(await persistYoutubeDiscoveryCandidates(claim, [candidate("abcDEF12345")], testDb)).toBe("cancelled");
    await expect(testDb.select().from(youtubeDiscoveryCandidates)).resolves.toEqual([]);
    await expect(testDb.select().from(youtubeDiscoveryAppearances)).resolves.toEqual([]);
    await expect(testDb.select().from(youtubeDiscoveryRankingHistory)).resolves.toEqual([]);
    await expect(testDb.select().from(auditEvents).where(and(eq(auditEvents.targetType, "youtube_discovery_run_terminal"), eq(auditEvents.targetId, run.id)))).resolves.toHaveLength(1);
    expect(policy.id).toBeTruthy();
  });

  test("rolls back graph writes when the lease expires after the first candidate write", async () => {
    const { claim } = await claimedRun();
    await testDb.execute(sql`drop trigger if exists pause_youtube_candidate_insert on youtube_discovery_candidates`);
    await testDb.execute(sql`create or replace function pause_youtube_candidate_insert() returns trigger language plpgsql as $$ begin perform pg_sleep(0.03); return new; end $$`);
    await testDb.execute(sql`create trigger pause_youtube_candidate_insert before insert on youtube_discovery_candidates for each row execute function pause_youtube_candidate_insert()`);
    await testDb.execute(sql`update youtube_discovery_runs set lease_expires_at = clock_timestamp() + interval '10 milliseconds' where id = ${claim.id}`);
    expect(await persistYoutubeDiscoveryCandidates(claim, [candidate("abcDEF12345")], testDb)).toBe("contended");
    await expect(testDb.select().from(youtubeDiscoveryCandidates)).resolves.toEqual([]);
    await expect(testDb.select().from(youtubeDiscoveryAppearances)).resolves.toEqual([]);
    await expect(testDb.select().from(youtubeDiscoveryRankingHistory)).resolves.toEqual([]);
  });

  test("caps ranking history at the newest twenty entries", async () => {
    const { claim } = await claimedRun();
    const [run] = await testDb.select({ policyVersionId: youtubeDiscoveryRuns.policyVersionId, queryProposalId: youtubeDiscoveryRuns.queryProposalId }).from(youtubeDiscoveryRuns).where(eq(youtubeDiscoveryRuns.id, claim.id));
    for (let index = 0; index < 20; index += 1) {
      await testDb.insert(youtubeDiscoveryRuns).values({ id: `history-run-${index}`, policyVersionId: run!.policyVersionId, queryProposalId: run!.queryProposalId, state: "completed", maxRetryAttempts: 3, retryDelayMinutes: 15, maxConcurrentRuns: 1, terminalAt: new Date(), terminalOutcome: "completed" });
      await testDb.execute(sql`insert into youtube_discovery_candidates (id, video_id, canonical_url) values ('history-candidate', 'abcDEF12345', 'https://www.youtube.com/watch?v=abcDEF12345') on conflict (video_id) do nothing`);
      await testDb.execute(sql`insert into youtube_discovery_appearances (id, candidate_id, run_id, result_ordinal) values (${`history-appearance-${index}`}, 'history-candidate', ${`history-run-${index}`}, 0)`);
      await testDb.execute(sql`insert into youtube_discovery_ranking_history (id, candidate_id, appearance_id, run_id, policy_version_id, stage, created_at) values (${`history-${index}`}, 'history-candidate', ${`history-appearance-${index}`}, ${`history-run-${index}`}, (select policy_version_id from youtube_discovery_runs where id = ${claim.id}), 'discovered', clock_timestamp() - ${21 - index} * interval '1 second')`);
    }
    expect(await persistYoutubeDiscoveryCandidates(claim, [candidate("abcDEF12345")], testDb)).toBe("completed");
    await expect(testDb.select().from(youtubeDiscoveryRankingHistory).where(eq(youtubeDiscoveryRankingHistory.candidateId, "history-candidate"))).resolves.toHaveLength(20);
  });

  test("rejects ranking history whose appearance belongs to another candidate or run", async () => {
    const first = await claimedRun();
    const secondRun = await createYoutubeDiscoveryRun({ policyVersionId: first.policy.id, queryProposalId: first.proposal.id }, testDb);
    const secondClaim = (await claimNextYoutubeDiscoveryRun({ workerId: "discovery-provenance" }, testDb)).claim!;
    await persistYoutubeDiscoveryCandidates(first.claim, [candidate("abcDEF12345")], testDb);
    await persistYoutubeDiscoveryCandidates(secondClaim, [candidate("zyxWV987654")], testDb);
    const [appearance] = await testDb.select().from(youtubeDiscoveryAppearances).where(eq(youtubeDiscoveryAppearances.runId, first.run.id));
    const [otherCandidate] = await testDb.select().from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, "zyxWV987654"));
    await expect(testDb.execute(sql`insert into youtube_discovery_ranking_history (id, candidate_id, appearance_id, run_id, policy_version_id, stage) values ('mismatched-history', ${otherCandidate!.id}, ${appearance!.id}, ${secondRun.id}, ${first.policy.id}, 'discovered')`)).rejects.toThrow();
    await expect(testDb.execute(sql`insert into youtube_discovery_ranking_history (id, candidate_id, appearance_id, run_id, policy_version_id, stage) values ('missing-appearance', ${appearance!.candidateId}, null, ${first.run.id}, ${first.policy.id}, 'discovered')`)).rejects.toThrow();
  });

  test("rejects ranking history with a policy other than its referenced run policy", async () => {
    const { policy, run, claim } = await claimedRun();
    await persistYoutubeDiscoveryCandidates(claim, [candidate("abcDEF12345")], testDb);
    const [appearance] = await testDb.select().from(youtubeDiscoveryAppearances).where(eq(youtubeDiscoveryAppearances.runId, run.id));
    const otherPolicy = await createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: false, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    // The long-lived test database may have recorded 0049 before this repair;
    // install the migration constraint once so this regression exercises it.
    await testDb.execute(sql`create unique index if not exists youtube_discovery_runs_id_policy_idx on youtube_discovery_runs (id, policy_version_id)`);
    await testDb.execute(sql`alter table youtube_discovery_ranking_history drop constraint if exists youtube_discovery_ranking_history_run_policy_fk`);
    await testDb.execute(sql`alter table youtube_discovery_ranking_history add constraint youtube_discovery_ranking_history_run_policy_fk foreign key (run_id, policy_version_id) references youtube_discovery_runs (id, policy_version_id) on delete restrict`);
    await expect(testDb.execute(sql`insert into youtube_discovery_ranking_history (id, candidate_id, appearance_id, run_id, policy_version_id, stage) values ('mismatched-policy', ${appearance!.candidateId}, ${appearance!.id}, ${run.id}, ${otherPolicy.id}, 'discovered')`)).rejects.toThrow();
    expect(policy.id).toBeTruthy();
  });

  test.each(["MEDIA_RESOLUTION_LOW", "MEDIA_RESOLUTION_MEDIUM", "MEDIA_RESOLUTION_HIGH"] as const)("production-equivalent Knowledge eligibility recognizes %s captures without Discovery compatibility input", async (mediaResolution) => {
    await seedTestOperator();
    await testDb.insert(sources).values({ id: "youtube-source", url: "https://www.youtube.com/watch?v=abcDEF12345", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", kind: "youtube", sourceType: "community", label: "Video", submittedByUserId: "operator" });
    const compatibility = youtubeCaptureCompatibilityForMediaResolution(mediaResolution);
    await testDb.insert(sourceCaptureVersions).values({ id: "youtube-capture", sourceId: "youtube-source", versionSequence: 1, captureKind: "youtube", contentHash: "a".repeat(64), captureMethodVersion: compatibility.captureMethodVersion, payloadSchemaVersion: compatibility.payloadSchemaVersion, capturedAt: new Date() });
    await testDb.update(sources).set({ currentCaptureVersionId: "youtube-capture" }).where(eq(sources.id, "youtube-source"));
    const previousResolution = process.env.GEMINI_YOUTUBE_MEDIA_RESOLUTION;
    process.env.GEMINI_YOUTUBE_MEDIA_RESOLUTION = mediaResolution;
    try {
      const port = createYoutubeCaptureEligibilityPort(testDb);
      await expect(port.check("abcDEF12345")).resolves.toBe("already_compatible");
      await testDb.update(sourceCaptureVersions).set({ payloadSchemaVersion: "changed" }).where(eq(sourceCaptureVersions.id, "youtube-capture"));
      await expect(port.check("abcDEF12345")).resolves.toBe("eligible");
      await expect(port.check("abcDEF12345", AbortSignal.abort())).resolves.toBe("unavailable");
    } finally {
      if (previousResolution === undefined) delete process.env.GEMINI_YOUTUBE_MEDIA_RESOLUTION;
      else process.env.GEMINI_YOUTUBE_MEDIA_RESOLUTION = previousResolution;
    }
  });

  test("0049 backfills only identifiable legacy aggregate captures", async () => {
    await seedTestOperator();
    await testDb.insert(sources).values([{ id: "legacy-identifiable", url: "https://www.youtube.com/watch?v=abcDEF12345", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", kind: "youtube", sourceType: "community", label: "Video", submittedByUserId: "operator" }, { id: "legacy-unknown", url: "https://www.youtube.com/watch?v=zyxWV987654", canonicalUrl: "https://www.youtube.com/watch?v=zyxWV987654", kind: "youtube", sourceType: "community", label: "Video", submittedByUserId: "operator" }, { id: "legacy-spoofed", url: "https://www.youtube.com/watch?v=qwerty12345", canonicalUrl: "https://www.youtube.com/watch?v=qwerty12345", kind: "youtube", sourceType: "community", label: "Video", submittedByUserId: "operator" }]);
    await testDb.insert(sourceCaptureVersions).values([{ id: "legacy-identifiable-capture", sourceId: "legacy-identifiable", versionSequence: 1, captureKind: "youtube", contentHash: "b".repeat(64), rawMetadata: { captureMethod: "gemini_youtube_url", captureMethodVersion: "youtube-gemini-windowed-v4-aggregate-medium", mediaResolution: "MEDIA_RESOLUTION_MEDIUM", payloadSchemaVersion: "2" }, capturedAt: new Date() }, { id: "legacy-unknown-capture", sourceId: "legacy-unknown", versionSequence: 1, captureKind: "youtube", contentHash: "c".repeat(64), rawMetadata: { captureMethod: "gemini_youtube_url" }, capturedAt: new Date() }, { id: "legacy-spoofed-capture", sourceId: "legacy-spoofed", versionSequence: 1, captureKind: "youtube", contentHash: "d".repeat(64), rawMetadata: { captureMethod: "gemini_youtube_url", captureMethodVersion: "arbitrary-version", mediaResolution: "MEDIA_RESOLUTION_HIGH", payloadSchemaVersion: "arbitrary-schema" }, capturedAt: new Date() }]);
    await testDb.execute(sql`update source_capture_versions set capture_method_version = raw_metadata->>'captureMethodVersion', payload_schema_version = raw_metadata->>'payloadSchemaVersion' where capture_kind = 'youtube' and capture_method_version is null and payload_schema_version is null and raw_metadata->>'captureMethod' = 'gemini_youtube_url' and raw_metadata->>'payloadSchemaVersion' = '2' and raw_metadata->>'mediaResolution' in ('MEDIA_RESOLUTION_LOW', 'MEDIA_RESOLUTION_MEDIUM', 'MEDIA_RESOLUTION_HIGH') and raw_metadata->>'captureMethodVersion' = 'youtube-gemini-windowed-v4-aggregate-' || lower(replace(raw_metadata->>'mediaResolution', 'MEDIA_RESOLUTION_', ''))`);
    await expect(testDb.select({ id: sourceCaptureVersions.id, captureMethodVersion: sourceCaptureVersions.captureMethodVersion, payloadSchemaVersion: sourceCaptureVersions.payloadSchemaVersion }).from(sourceCaptureVersions).orderBy(sourceCaptureVersions.id)).resolves.toEqual([{ id: "legacy-identifiable-capture", captureMethodVersion: "youtube-gemini-windowed-v4-aggregate-medium", payloadSchemaVersion: "2" }, { id: "legacy-spoofed-capture", captureMethodVersion: null, payloadSchemaVersion: null }, { id: "legacy-unknown-capture", captureMethodVersion: null, payloadSchemaVersion: null }]);
  });
});
