import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, sources, userRoles } from "@/db/schema";
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

  test("completes a candidate with an immutable target disposition without mutating card lifecycle work", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    if (!job) throw new Error("expected ingestion job");
    await testDb.update(knowledgeIngestionJobs).set({ status: "running" }).where(eq(knowledgeIngestionJobs.id, job.id));
    await testDb.insert(knowledgeIngestionCandidates).values({ id: "candidate", ingestionJobId: job.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "candidate-fingerprint", type: "place", title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test" });
    const claim = await claimNextKnowledgeIngestionCandidate({ workerId: "candidate-worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected candidate claim");

    await expect(runKnowledgeIngestionCandidatePipeline(claim, testDb)).resolves.toBeDefined();
    await expect(testDb.select().from(knowledgeIngestionCandidates)).resolves.toMatchObject([{ processingStatus: "completed", aiDisposition: "needs_operator", outcomeReasonCode: "missing_context" }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toEqual([]);
  });
});
