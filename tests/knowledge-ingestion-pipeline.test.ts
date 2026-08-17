import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, sources, userRoles } from "@/db/schema";
import { claimNextKnowledgeIngestionCandidate, claimNextKnowledgeIngestionJob } from "@/features/knowledge/ingestion-jobs";
import { DiscoveryFailure, resolveEvidenceSpan, runKnowledgeIngestionCandidatePipeline, runKnowledgeIngestionPipeline } from "@/features/knowledge/ingestion-pipeline";
import { appendSourceCaptureVersion } from "@/features/knowledge/source-captures";

import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

describe("target knowledge ingestion pipeline", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedTestOperator();
    await testDb.insert(userRoles).values({ userId: "operator", role: "operator" });
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
  });

  test("resolves model evidence without offsets across decorative Unicode", () => {
    const capture = "📍 Hội\u200b An ✨ có chỗ đậu xe.";
    expect(resolveEvidenceSpan(capture, "Hội An có chỗ đậu xe.")).toEqual([2, Array.from(capture).length]);
  });

  test("uses the first exact match when an evidence quote appears more than once", () => {
    expect(resolveEvidenceSpan("✨ Hội An. Hội An.", "Hội An.")).toEqual([2, 9]);
  });

  test("records the target discovery checkpoint and completes a no-candidate job", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");

    await expect(runKnowledgeIngestionPipeline(claim, testDb, async () => [])).resolves.toMatchObject({ outcome: "completed", candidateCount: 0 });
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id))).resolves.toMatchObject([{ status: "completed", discoveryTerminal: true, candidateCount: 0 }]);
  });

  test("atomically relates a candidate through the lifecycle command and opens exactly one fenced work item", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    if (!job) throw new Error("expected ingestion job");
    await testDb.update(knowledgeIngestionJobs).set({ status: "running" }).where(eq(knowledgeIngestionJobs.id, job.id));
    await testDb.insert(knowledgeIngestionCandidates).values({ id: "candidate", ingestionJobId: job.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "candidate-fingerprint", type: "place", title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test" });
    const claim = await claimNextKnowledgeIngestionCandidate({ workerId: "candidate-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected candidate claim");

    await expect(runKnowledgeIngestionCandidatePipeline(claim, testDb, async () => ({ disposition: "needs_operator", outcomeReasonCode: "missing_context", relation: { kind: "create", rationale: "Needs verification." } }))).resolves.toBeDefined();
    await expect(testDb.select().from(knowledgeIngestionCandidates)).resolves.toMatchObject([{ processingStatus: "completed", aiDisposition: "needs_operator", outcomeReasonCode: "missing_context" }]);
    const [card] = await testDb.select().from(knowledgeCards);
    expect(card).toMatchObject({ lifecycleState: "pending_operator", verificationRequirement: "operator_required" });
    await expect(testDb.select().from(knowledgeCardSources)).resolves.toMatchObject([{ knowledgeCardId: card!.id, sourceId: "source", supportLevel: "primary" }]);
    await expect(testDb.select().from(knowledgeCardEvidence)).resolves.toMatchObject([{ knowledgeCardId: card!.id, sourceId: "source", quoteText: "Đ", spanStart: 0, spanEnd: 1, state: "active" }]);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toMatchObject([{ knowledgeCardId: card!.id, status: "open", workType: "missing_context", contentVersion: card!.contentVersion, evidenceSetRevision: card!.evidenceSetRevision }]);
  });

  test("rejects a relation decision whose shortlist is not the system shortlist without completing the candidate", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    await testDb.update(knowledgeIngestionJobs).set({ status: "running" }).where(eq(knowledgeIngestionJobs.id, job!.id));
    await testDb.insert(knowledgeIngestionCandidates).values({ id: "candidate", ingestionJobId: job!.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "candidate-shortlist", type: "place", title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test" });
    const claim = await claimNextKnowledgeIngestionCandidate({ workerId: "candidate-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected candidate claim");
    await expect(runKnowledgeIngestionCandidatePipeline(claim, testDb, async () => ({ disposition: "needs_operator", outcomeReasonCode: "conflict", relation: { kind: "conflict", targetCardId: "not-in-shortlist", shortlistCardIds: ["not-in-shortlist"], rationale: "Conflict." } }))).resolves.toMatchObject({ ingestionJobId: job!.id });
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.id, "candidate"))).resolves.toMatchObject([{ processingStatus: "failed", knowledgeCardId: null, fencingToken: null }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toEqual([]);
  });

  test("excludes archived cards and rejects a forged archived attach without side effects", async () => {
    await testDb.insert(knowledgeCards).values({ id: "archived", lifecycleState: "archived", knowledgeState: "community_observation", type: "place", title: "Cũ", locationName: "Huế", summary: "Không dùng.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    await testDb.update(knowledgeIngestionJobs).set({ status: "running" }).where(eq(knowledgeIngestionJobs.id, job!.id));
    await testDb.insert(knowledgeIngestionCandidates).values({ id: "candidate", ingestionJobId: job!.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "candidate-archived", type: "place", title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test" });
    const claim = await claimNextKnowledgeIngestionCandidate({ workerId: "candidate-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected candidate claim");
    await expect(runKnowledgeIngestionCandidatePipeline(claim, testDb, async ({ shortlist }) => { expect(shortlist).toEqual([]); return { disposition: "apply", outcomeReasonCode: "applied", relation: { kind: "attach", targetCardId: "archived", shortlistCardIds: [], rationale: "Forged." } }; })).resolves.toMatchObject({ ingestionJobId: job!.id });
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.id, "candidate"))).resolves.toMatchObject([{ processingStatus: "failed", knowledgeCardId: null, fencingToken: null }]);
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "archived"))).resolves.toMatchObject([{ lifecycleState: "archived", contentVersion: 1 }]);
  });

  test("persists validated discovery candidates idempotently before terminalizing", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");
    const discovery = async () => [{ fingerprint: "discovered", type: "place" as const, title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", locationName: "Đèo Hải Vân", spanStart: 0, spanEnd: 1 }];

    await expect(runKnowledgeIngestionPipeline(claim, testDb, discovery)).resolves.toMatchObject({ outcome: "completed", candidateCount: 1 });
    await expect(testDb.select().from(knowledgeIngestionCandidates)).resolves.toMatchObject([{ fingerprint: "discovered", processingStatus: "queued", spanStart: 0, spanEnd: 1 }]);
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId))).resolves.toMatchObject([{ discoveryTerminal: true, candidateCount: 1, status: "running" }]);
  });

  test("rejects duplicate discovery delivery after the parent terminalizes", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");
    const firstDiscovery = async () => [{ fingerprint: "first", type: "place" as const, title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", locationName: "Đèo Hải Vân", spanStart: 0, spanEnd: 1 }];
    const duplicateDiscovery = async () => [{ fingerprint: "duplicate", type: "place" as const, title: "Khác", summary: "Không được lưu.", locationName: "Đèo Hải Vân", spanStart: 0, spanEnd: 1 }];

    await expect(runKnowledgeIngestionPipeline(claim, testDb, firstDiscovery)).resolves.toMatchObject({ outcome: "completed" });
    await expect(runKnowledgeIngestionPipeline(claim, testDb, duplicateDiscovery)).resolves.toBeNull();
    await expect(testDb.select().from(knowledgeIngestionCandidates)).resolves.toMatchObject([{ fingerprint: "first" }]);
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id))).resolves.toMatchObject([{ candidateCount: 1, discoveryTerminal: true }]);
  });

  test("does not let an obsolete discovery failure terminalize a newer capture job", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");
    await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Phiên bản mới.", metadata: { kind: "submitted" } });

    await expect(runKnowledgeIngestionPipeline(claim, testDb, async () => { throw new Error("provider failed"); })).resolves.toBeNull();
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId))).resolves.toMatchObject([{ status: "running", fencingToken: claim.fencingToken, lastErrorCode: null, captureVersionId: capture.id }]);
  });

  test("completes discovery without persisting malformed candidates", async () => {
    await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");

    await expect(runKnowledgeIngestionPipeline(claim, testDb, async () => [{ fingerprint: "bad", type: "place" as const, title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", spanStart: 1, spanEnd: 0 }])).resolves.toMatchObject({ outcome: "completed", candidateCount: 0 });
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId))).resolves.toMatchObject([{ status: "completed", candidateCount: 0, lastErrorCode: null, claimedBy: null, fencingToken: null }]);
  });

  test("records an ungrounded evidence quote with a safe diagnostic code", async () => {
    await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");

    await expect(runKnowledgeIngestionPipeline(claim, testDb, async () => { throw new DiscoveryFailure("discovery_ungrounded_evidence"); })).resolves.toMatchObject({ outcome: "failed" });
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId))).resolves.toMatchObject([{ status: "failed", lastErrorCode: "discovery_ungrounded_evidence" }]);
  });

  test("persists scoped multi-fact discovery candidates with their travel metadata", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Quán có chỗ đậu xe.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");

    await expect(runKnowledgeIngestionPipeline(claim, testDb, async () => [{ fingerprint: "food-with-parking", type: "food" as const, title: "Quán ăn có chỗ đậu xe", summary: "Phù hợp dừng ăn khi đi ô tô.", locationName: "Hải Vân", conditions: ["Nên kiểm tra chỗ trống trước khi đến."], freshnessSensitive: true, practicalDetails: { parking_notes: ["Có chỗ đậu xe."] }, tags: ["ăn uống", "đậu xe"], spanStart: 0, spanEnd: 1 }])).resolves.toMatchObject({ outcome: "completed", candidateCount: 1 });
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.captureVersionId, capture.id))).resolves.toMatchObject([{ type: "food", locationName: "Hải Vân", conditions: ["Nên kiểm tra chỗ trống trước khi đến."], freshnessSensitive: true, practicalDetails: { parking_notes: ["Có chỗ đậu xe."] }, tags: ["ăn uống", "đậu xe"], extractionPromptVersion: "knowledge_pipeline_multi_fact_extraction_v3" }]);
  });

  test("persists valid candidates when the same discovery response includes an invalid candidate", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Quán có chỗ đậu xe.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");

    await expect(runKnowledgeIngestionPipeline(claim, testDb, async () => [
      { fingerprint: "valid", type: "food" as const, title: "Quán ăn có chỗ đậu xe", summary: "Phù hợp dừng ăn khi đi ô tô.", locationName: "Hải Vân", spanStart: 0, spanEnd: 1 },
      { fingerprint: "invalid", type: "food" as const, title: "Thiếu phạm vi", summary: "Không có địa điểm hoặc cung đường.", spanStart: 0, spanEnd: 1 },
    ])).resolves.toMatchObject({ outcome: "completed", candidateCount: 1 });
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.captureVersionId, capture.id))).resolves.toMatchObject([{ fingerprint: "valid" }]);
  });

  test("records an unexpected discovery exception with the generic safe code", async () => {
    await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");

    await expect(runKnowledgeIngestionPipeline(claim, testDb, async () => { throw new Error("provider failure with unsafe details"); })).resolves.toMatchObject({ outcome: "failed" });
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId))).resolves.toMatchObject([{ status: "failed", lastErrorCode: "discovery_failed" }]);
  });

  test("requeues retryable discovery failures with a bounded backoff", async () => {
    await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");
    const before = Date.now();

    await expect(runKnowledgeIngestionPipeline(claim, testDb, async () => { throw new DiscoveryFailure("discovery_gateway_network_error"); })).resolves.toMatchObject({ outcome: "retry" });
    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId));
    expect(job).toMatchObject({ status: "queued", attemptCount: 1, lastErrorCode: "discovery_gateway_network_error", claimedBy: null, fencingToken: null });
    expect(job!.nextRunAt.getTime()).toBeGreaterThanOrEqual(before + 30_000);
  });

  test("terminalizes a retryable discovery failure after its final attempt", async () => {
    await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const [job] = await testDb.select().from(knowledgeIngestionJobs);
    await testDb.update(knowledgeIngestionJobs).set({ maxAttempts: 1 }).where(eq(knowledgeIngestionJobs.id, job!.id));
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");

    await expect(runKnowledgeIngestionPipeline(claim, testDb, async () => { throw new DiscoveryFailure("discovery_gateway_http_error"); })).resolves.toMatchObject({ outcome: "failed" });
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId))).resolves.toMatchObject([{ status: "failed", attemptCount: 1, lastErrorCode: "discovery_gateway_http_error", claimedBy: null, fencingToken: null }]);
  });

  test("records discard as a terminal AI outcome without card or lifecycle effects", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    await testDb.update(knowledgeIngestionJobs).set({ status: "running", discoveryTerminal: true }).where(eq(knowledgeIngestionJobs.id, job!.id));
    await testDb.insert(knowledgeIngestionCandidates).values({ id: "discard", ingestionJobId: job!.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "candidate-discard", type: "place", title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test" });
    const claim = await claimNextKnowledgeIngestionCandidate({ workerId: "candidate-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected candidate claim");

    await expect(runKnowledgeIngestionCandidatePipeline(claim, testDb, async () => ({ disposition: "discard", outcomeReasonCode: "weak_evidence" }))).resolves.toMatchObject({ processingStatus: "completed" });
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.id, "discard"))).resolves.toMatchObject([{ processingStatus: "completed", aiDisposition: "discard", outcomeReasonCode: "weak_evidence", knowledgeCardId: null }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeCardEvidence)).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toEqual([]);
  });
});
