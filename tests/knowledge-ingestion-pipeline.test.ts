import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, sources, userRoles } from "@/db/schema";
import { claimNextKnowledgeIngestionCandidate, claimNextKnowledgeIngestionJob } from "@/features/knowledge/ingestion-jobs";
import { runKnowledgeIngestionCandidatePipeline, runKnowledgeIngestionPipeline } from "@/features/knowledge/ingestion-pipeline";
import { appendSourceCaptureVersion } from "@/features/knowledge/source-captures";

import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

describe("target knowledge ingestion pipeline", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedTestOperator();
    await testDb.insert(userRoles).values({ userId: "operator", role: "operator" });
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
  });

  test("records the target discovery checkpoint and completes a no-candidate job", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "discovery-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected job claim");

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "completed", candidateCount: 0 });
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
});
