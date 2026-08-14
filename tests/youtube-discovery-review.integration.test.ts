import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { asc, desc, eq, sql } from "drizzle-orm";
import { parseAdminYoutubeDiscoveryBrowseCursor, parseAdminYoutubeDiscoveryReviewCursor, type RequestPrincipal } from "@xuyenviet/contracts";
import { YoutubeDiscoveryBrowseCursorValidationError, YoutubeDiscoveryReviewCursorValidationError } from "@xuyenviet/domain";

import { aiGatewayModels, auditEvents, claimNextYoutubeDiscoveryRun, createPostgresAdminYoutubeDiscoveryPort, createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal, createYoutubeDiscoveryRun, finishYoutubeDiscoveryRun, getYoutubeDiscoveryRecommendationBundle, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryRecommendation, persistYoutubeDiscoveryTriage, selectYoutubeDiscoveryTriageModel, youtubeDiscoveryCandidateReviewStates, youtubeDiscoveryCandidates, youtubeDiscoveryKnowledgeHandoffs, youtubeDiscoveryRecommendations } from "@xuyenviet/database";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

describe.sequential("YouTube Discovery review read model", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  test("backfills the durable pending association and projects only stable active provenance through an injected safe port", async () => {
    const publicReviewStateTable = (await testDb.execute<{ table_name: string | null }>(sql`select to_regclass('public.youtube_discovery_candidate_review_states') as table_name`))[0]?.table_name;
    await seedTestOperator();
    const policy = await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const query = await createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "operator_request", priority: 50, queryText: "Da Lat route", cadenceMinutes: 15, actor: createUserAuditActor({ userId: "operator", email: "operator@example.com" }) }, testDb);
    await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: query.id }, testDb);
    const claim = (await claimNextYoutubeDiscoveryRun({ workerId: "review-read-model" }, testDb)).claim!;
    const videos = Array.from({ length: 21 }, (_, index) => `rv${String(index).padStart(9, "0")}`);
    expect(await persistYoutubeDiscoveryCandidates(claim, videos.map((videoId, resultOrdinal) => ({ videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, resultOrdinal, searchTranche: "medium" as const })), testDb)).toBe("completed");
    await testDb.insert(aiGatewayModels).values({ id: "review-model", gatewayModelName: "test/review", displayLabel: "Review", purpose: "youtube_discovery_triage", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000 });
    const model = await selectYoutubeDiscoveryTriageModel(testDb);
    if (!model) throw new Error("expected review triage model");

    for (const videoId of videos) {
      await persistYoutubeDiscoveryEnrichment(claim, { videoId, signals: [] }, testDb);
      const [candidate] = await testDb.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates).where(eq(youtubeDiscoveryCandidates.videoId, videoId));
      if (!candidate) throw new Error(`expected persisted candidate for ${videoId}`);
      await persistYoutubeDiscoveryTriage(claim, { candidateId: candidate.id, status: "succeeded", assessment: { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: [] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 1 }, testDb);
      const bundle = await getYoutubeDiscoveryRecommendationBundle(claim, videoId, testDb);
      if (typeof bundle === "string") throw new Error("expected recommendation bundle");
      expect(await persistYoutubeDiscoveryRecommendation(claim, bundle, "eligible", Date.now() + 60_000, testDb)).toBe("completed");
    }

    // Exercise 0057 against a 0056-shaped copy of the prerequisite tables.
    // A rollback-only schema keeps the shared integration schema untouched.
    const migration = await readFile("drizzle/migrations/0057_add_discovery_candidate_review_state.sql", "utf8");
    await expect(testDb.transaction(async (transaction) => {
      const schemaName = `migration_${randomUUID().replaceAll("-", "_")}`;
      const [historicCandidate] = await transaction.select({ id: youtubeDiscoveryCandidates.id, videoId: youtubeDiscoveryCandidates.videoId }).from(youtubeDiscoveryCandidates).orderBy(asc(youtubeDiscoveryCandidates.videoId)).limit(1);
      if (!historicCandidate) throw new Error("expected historic candidate");
      expect(await finishYoutubeDiscoveryRun(claim, transaction)).toBe("completed");
      for (const workerId of ["review-backfill-second", "review-backfill-third"]) {
        await createYoutubeDiscoveryRun({ policyVersionId: policy.id, queryProposalId: query.id }, transaction);
        const historicClaim = (await claimNextYoutubeDiscoveryRun({ workerId }, transaction)).claim;
        if (!historicClaim) throw new Error("expected historic claim");
        await persistYoutubeDiscoveryCandidates(historicClaim, [{ videoId: historicCandidate.videoId, canonicalUrl: `https://www.youtube.com/watch?v=${historicCandidate.videoId}`, resultOrdinal: 0, searchTranche: "medium" }], transaction);
        await persistYoutubeDiscoveryEnrichment(historicClaim, { videoId: historicCandidate.videoId, signals: [] }, transaction);
        await persistYoutubeDiscoveryTriage(historicClaim, { candidateId: historicCandidate.id, status: "succeeded", assessment: { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: [] }, model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: 1 }, transaction);
        const bundle = await getYoutubeDiscoveryRecommendationBundle(historicClaim, historicCandidate.videoId, transaction);
        if (typeof bundle === "string") throw new Error("expected historic recommendation bundle");
        expect(await persistYoutubeDiscoveryRecommendation(historicClaim, bundle, "eligible", Date.now() + 60_000, transaction)).toBe("completed");
        expect(await finishYoutubeDiscoveryRun(historicClaim, transaction)).toBe("completed");
      }
      const historicRecommendations = await transaction.select({ id: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryRecommendations).where(eq(youtubeDiscoveryRecommendations.candidateId, historicCandidate.id)).orderBy(asc(youtubeDiscoveryRecommendations.id));
      expect(historicRecommendations).toHaveLength(3);
      await transaction.execute(sql.raw(`CREATE SCHEMA "${schemaName}"`));
      for (const tableName of ["youtube_discovery_candidates", "youtube_discovery_recommendations", "youtube_discovery_runs"]) {
        await transaction.execute(sql.raw(`CREATE TABLE "${schemaName}"."${tableName}" (LIKE public."${tableName}" INCLUDING ALL)`));
        await transaction.execute(sql.raw(`INSERT INTO "${schemaName}"."${tableName}" SELECT * FROM public."${tableName}"`));
      }
      await transaction.execute(sql.raw(`SET LOCAL search_path TO "${schemaName}", public`));
      for (const [index, recommendation] of historicRecommendations.entries()) await transaction.execute(sql`update youtube_discovery_recommendations set created_at = timestamp '2026-08-07 00:00:00' + ${Math.min(index, 1)} * interval '1 microsecond' where id = ${recommendation.id}`);
      for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await transaction.execute(sql.raw(statement));
      const expectedHistoricRecommendationId = historicRecommendations.slice(1).map((recommendation) => recommendation.id).sort().at(-1);
      await expect(transaction.select({ recommendationId: youtubeDiscoveryCandidateReviewStates.recommendationId }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.candidateId, historicCandidate.id))).resolves.toEqual([{ recommendationId: expectedHistoricRecommendationId }]);
      const recommendations = await transaction.select({ id: youtubeDiscoveryRecommendations.id, candidateId: youtubeDiscoveryRecommendations.candidateId }).from(youtubeDiscoveryRecommendations).orderBy(asc(youtubeDiscoveryRecommendations.id));
      expect(await transaction.select().from(youtubeDiscoveryCandidateReviewStates)).toHaveLength(21);
      await expect(transaction.insert(youtubeDiscoveryCandidateReviewStates).values({ candidateId: recommendations[0]!.candidateId, recommendationId: recommendations[0]!.id, state: "pending" })).rejects.toThrow();
      await expect(transaction.insert(youtubeDiscoveryCandidateReviewStates).values({ candidateId: recommendations[1]!.candidateId, recommendationId: recommendations[0]!.id, state: "pending" })).rejects.toThrow();

      const eligibility = { check: vi.fn().mockResolvedValue("unavailable" as const) };
      const port = createPostgresAdminYoutubeDiscoveryPort(eligibility, transaction);
       const principal: RequestPrincipal = { userId: "operator", email: "operator@example.com", roles: ["operator"], sessionId: "review-session", authorizationVersion: 1 };
       const first = await port.listReview(principal, null);
      expect(first.nextCursor).toMatch(/^ydr2\./);
       const second = await port.listReview(principal, parseAdminYoutubeDiscoveryReviewCursor(first.nextCursor));
      const ids = [...first.items, ...second.items].map((item) => item.recommendationId);
      expect(first.items).toHaveLength(20);
      expect(second.items).toHaveLength(1);
      expect(new Set(ids)).toHaveLength(21);
      expect(ids).toEqual((await transaction.select({ id: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryCandidateReviewStates).innerJoin(youtubeDiscoveryRecommendations, eq(youtubeDiscoveryRecommendations.id, youtubeDiscoveryCandidateReviewStates.recommendationId)).orderBy(sql`${youtubeDiscoveryRecommendations.score} desc`, asc(youtubeDiscoveryRecommendations.createdAt), asc(youtubeDiscoveryRecommendations.id))).map((row) => row.id));
       const anchor = parseAdminYoutubeDiscoveryReviewCursor(first.nextCursor);
       if (!anchor) throw new Error("expected review cursor anchor");
       await expect(port.listReview(principal, { ...anchor, recommendationId: "fabricated-recommendation" })).rejects.toBeInstanceOf(YoutubeDiscoveryReviewCursorValidationError);
       const [anchorCandidate] = await transaction.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, anchor.recommendationId));
       if (!anchorCandidate) throw new Error("expected cursor candidate");
        await transaction.insert(youtubeDiscoveryKnowledgeHandoffs).values({ candidateId: anchorCandidate.candidateId, recommendationId: anchor.recommendationId, reference: "cursor-reconcile", reconciling: true });
       const reconcilingPort = createPostgresAdminYoutubeDiscoveryPort(eligibility, transaction, { submit: vi.fn(), lookup: vi.fn().mockResolvedValue("submitted" as const) });
       await expect(reconcilingPort.listReview(principal, anchor)).resolves.toMatchObject({ items: expect.any(Array) });
       await transaction.update(youtubeDiscoveryCandidateReviewStates).set({ state: "deferred" }).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, anchor.recommendationId));
       await expect(port.listReview(principal, anchor)).rejects.toBeInstanceOf(YoutubeDiscoveryReviewCursorValidationError);

        await transaction.execute(sql`update youtube_discovery_query_proposals set query_text = 'rewritten proposal query' where id = ${query.id}`);
        const detail = await port.getReview(principal, first.items[0]!.recommendationId);
      expect(detail).toMatchObject({ recommendationId: first.items[0]!.recommendationId, queryText: "Da Lat route", queryReason: "operator_request", priorCaptureOutcome: "unavailable" });
      expect(eligibility.check).toHaveBeenCalledWith(expect.stringMatching(/^rv\d{9}$/));
       expect(detail).not.toHaveProperty("videoId");
       const intake = { submit: vi.fn().mockResolvedValue("submitted" as const), lookup: vi.fn().mockResolvedValue("submitted" as const) };
       const acceptingPort = createPostgresAdminYoutubeDiscoveryPort(eligibility, transaction, intake);
       await expect(acceptingPort.acceptReview(principal, first.items[0]!.recommendationId)).resolves.toEqual({ outcome: "submitted" });
        expect(intake.submit).toHaveBeenCalledWith({ reference: expect.any(String), canonicalUrl: expect.stringMatching(/^https:\/\/www\.youtube\.com\/watch\?v=/), actorUserId: principal.userId });
       expect(await transaction.select({ state: youtubeDiscoveryCandidateReviewStates.state }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, first.items[0]!.recommendationId))).toEqual([{ state: "accepted" }]);
       expect(await transaction.select({ id: auditEvents.id, afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetId, first.items[0]!.recommendationId))).toEqual([{ id: expect.any(String), afterSummary: JSON.stringify({ decision: "accepted", intakeOutcome: "submitted" }) }]);
        await expect(acceptingPort.acceptReview(principal, first.items[0]!.recommendationId)).resolves.toBeNull();
        expect(intake.submit).toHaveBeenCalledOnce();
        const terminalRecommendationId = first.items[1]!.recommendationId;
        const [terminalCandidate] = await transaction.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, terminalRecommendationId));
        if (!terminalCandidate) throw new Error("expected terminal candidate");
        const terminalPort = createPostgresAdminYoutubeDiscoveryPort(eligibility, transaction, intake);
        await expect(terminalPort.deferReview(principal, terminalRecommendationId)).resolves.toEqual({ outcome: "deferred" });
         expect(await transaction.select({ state: youtubeDiscoveryCandidateReviewStates.state, deferredAt: youtubeDiscoveryCandidateReviewStates.deferredAt }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, terminalRecommendationId))).toEqual([{ state: "deferred", deferredAt: expect.any(Date) }]);
        expect(await transaction.select({ afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetId, terminalRecommendationId))).toEqual([{ afterSummary: JSON.stringify({ decision: "deferred" }) }]);
        expect(intake.submit).toHaveBeenCalledOnce();
        await expect(terminalPort.skipReview(principal, terminalRecommendationId)).resolves.toBeNull();
        const skippedRecommendationId = first.items[2]!.recommendationId;
        const [skippedCandidate] = await transaction.select({ candidateId: youtubeDiscoveryCandidateReviewStates.candidateId }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, skippedRecommendationId));
        if (!skippedCandidate) throw new Error("expected skipped candidate");
        await transaction.insert(youtubeDiscoveryKnowledgeHandoffs).values({ candidateId: skippedCandidate.candidateId, recommendationId: skippedRecommendationId, reference: "handoff-owned-by-knowledge", reconciling: true });
        await expect(terminalPort.skipReview(principal, skippedRecommendationId)).resolves.toBeNull();
        expect(await transaction.select({ state: youtubeDiscoveryCandidateReviewStates.state }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, skippedRecommendationId))).toEqual([{ state: "pending" }]);
        expect(await transaction.select({ reference: youtubeDiscoveryKnowledgeHandoffs.reference }).from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.candidateId, skippedCandidate.candidateId))).toEqual([{ reference: "handoff-owned-by-knowledge" }]);
        const validSkipRecommendationId = first.items[3]!.recommendationId;
        await expect(terminalPort.skipReview(principal, validSkipRecommendationId)).resolves.toEqual({ outcome: "skipped" });
        expect(await transaction.select({ state: youtubeDiscoveryCandidateReviewStates.state }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, validSkipRecommendationId))).toEqual([{ state: "skipped" }]);
        expect(await transaction.select({ afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetId, validSkipRecommendationId))).toEqual([{ afterSummary: JSON.stringify({ decision: "skipped" }) }]);
        const racedRecommendationId = first.items[4]!.recommendationId;
        const [deferred, skipped] = await Promise.all([terminalPort.deferReview(principal, racedRecommendationId), terminalPort.skipReview(principal, racedRecommendationId)]);
        expect([deferred, skipped]).toContain(null);
        expect([deferred, skipped]).toContainEqual(expect.objectContaining({ outcome: expect.stringMatching(/deferred|skipped/) }));
        expect(await transaction.select({ state: youtubeDiscoveryCandidateReviewStates.state }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, racedRecommendationId))).toEqual([{ state: expect.stringMatching(/deferred|skipped/) }]);
        expect(await transaction.select({ afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetId, racedRecommendationId))).toHaveLength(1);
        expect(await transaction.select({ reference: youtubeDiscoveryKnowledgeHandoffs.reference }).from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.recommendationId, racedRecommendationId))).toEqual([]);
        const acceptRaceRecommendationId = first.items[5]!.recommendationId;
        const [acceptRace, deferRace] = await Promise.all([acceptingPort.acceptReview(principal, acceptRaceRecommendationId), terminalPort.deferReview(principal, acceptRaceRecommendationId)]);
        expect([acceptRace, deferRace]).toContain(null);
        expect([acceptRace, deferRace]).toContainEqual(expect.objectContaining({ outcome: expect.stringMatching(/submitted|deferred/) }));
        const [acceptRaceState] = await transaction.select({ state: youtubeDiscoveryCandidateReviewStates.state }).from(youtubeDiscoveryCandidateReviewStates).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, acceptRaceRecommendationId));
        expect(acceptRaceState?.state).toMatch(/accepted|deferred/);
        const acceptRaceHandoffs = await transaction.select({ reference: youtubeDiscoveryKnowledgeHandoffs.reference }).from(youtubeDiscoveryKnowledgeHandoffs).where(eq(youtubeDiscoveryKnowledgeHandoffs.recommendationId, acceptRaceRecommendationId));
        expect(acceptRaceHandoffs).toHaveLength(acceptRaceState?.state === "accepted" ? 1 : 0);
       const browseFirst = await port.listBrowse(principal, "all", null);
       const browseSecond = await port.listBrowse(principal, "all", parseAdminYoutubeDiscoveryBrowseCursor(browseFirst.nextCursor));
       const browseIds = [...browseFirst.items, ...browseSecond.items].map((item) => item.recommendationId);
       expect(browseFirst.items).toHaveLength(20);
       expect(browseSecond.items).toHaveLength(1);
       expect(new Set(browseIds)).toHaveLength(21);
       expect(browseIds).toEqual((await transaction.select({ id: youtubeDiscoveryRecommendations.id }).from(youtubeDiscoveryRecommendations).orderBy(desc(youtubeDiscoveryRecommendations.createdAt), desc(youtubeDiscoveryRecommendations.id))).map((row) => row.id));
       const browseAnchor = parseAdminYoutubeDiscoveryBrowseCursor(browseFirst.nextCursor);
       if (!browseAnchor) throw new Error("expected browse cursor");
       await expect(port.listBrowse(principal, "all", { ...browseAnchor, recommendationId: "fabricated-recommendation" })).rejects.toBeInstanceOf(YoutubeDiscoveryBrowseCursorValidationError);
       await transaction.update(youtubeDiscoveryRecommendations).set({ recommendation: "skip" }).where(eq(youtubeDiscoveryRecommendations.id, browseIds[0]!));
       const skippedBrowse = await port.listBrowse(principal, "skip", null);
       expect(skippedBrowse.items.map((item) => item.recommendation)).toEqual(["skip"]);
       await transaction.update(youtubeDiscoveryCandidateReviewStates).set({ state: "deferred" }).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, browseIds[0]!));
       expect((await port.listBrowse(principal, "all", null)).items).not.toHaveLength(0);
       await transaction.update(youtubeDiscoveryCandidates).set({ title: "  Padded title  ", channelName: "   " }).where(eq(youtubeDiscoveryCandidates.id, historicCandidate.id));
       const normalized = await port.listReview(principal, null);
      expect(normalized.items.some((item) => item.title === "Padded title" && item.channelName === null)).toBe(true);
      await transaction.update(youtubeDiscoveryCandidateReviewStates).set({ state: "deferred" }).where(eq(youtubeDiscoveryCandidateReviewStates.recommendationId, first.items[0]!.recommendationId));
       await expect(port.getReview(principal, first.items[0]!.recommendationId)).resolves.toBeNull();
       await expect(port.getReview(principal, "missing-recommendation")).resolves.toBeNull();
      throw new Error("rollback migration exercise");
    })).rejects.toThrow();
    expect((await testDb.execute<{ table_name: string | null }>(sql`select to_regclass('public.youtube_discovery_candidate_review_states') as table_name`))[0]?.table_name).toBe(publicReviewStateTable);
  });
});
