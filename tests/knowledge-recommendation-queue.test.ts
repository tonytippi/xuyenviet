import { beforeEach, describe, expect, test } from "vitest";

import { knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, knowledgeSamplingObligations, sources } from "@/db/schema";
import { resolveKnowledgeRecommendation, scheduleKnowledgeRecommendation } from "@/features/knowledge/recommendations";
import { appendSourceCaptureVersion } from "@/features/knowledge/source-captures";
import { resolveKnowledgeRecommendation as resolveDatabaseKnowledgeRecommendation } from "@xuyenviet/database";

import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

async function createCard() {
  await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Điểm dừng", summary: "Thông tin có bằng chứng.", locationName: "Huế", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
}

async function createCompletedCandidate() {
  await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
  const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Source text", metadata: { kind: "submitted" } });
  const [job] = await testDb.select().from(knowledgeIngestionJobs);
  if (!job) throw new Error("expected job");
  await testDb.insert(knowledgeIngestionCandidates).values({ id: "candidate", ingestionJobId: job.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "candidate", type: "place", title: "Candidate", summary: "Candidate summary", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", processingStatus: "completed", aiDisposition: "apply", outcomeReasonCode: "applied" });
}

describe("target knowledge recommendation queue", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedTestOperator();
    await createCard();
  });

  test("allows one open primary work item and one open sampling item for a card fence", async () => {
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification" }, testDb);
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "relation" }, testDb);
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling" }, testDb);
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling" }, testDb);

    await expect(testDb.select({ workType: knowledgeRecommendations.workType }).from(knowledgeRecommendations)).resolves.toEqual([{ workType: "verification" }, { workType: "sampling" }]);
  });

  test("enforces sampling-obligation fences and sampled disposition shape", async () => {
    await createCompletedCandidate();

    await expect(testDb.insert(knowledgeSamplingObligations).values({ id: "invalid", candidateId: "candidate", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, samplingDisposition: "sampling_passed" })).rejects.toThrow();
    await testDb.insert(knowledgeSamplingObligations).values({ id: "obligation", candidateId: "candidate", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1 });
    await expect(testDb.insert(knowledgeSamplingObligations).values({ id: "duplicate", candidateId: "candidate", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1 })).rejects.toThrow();
    await expect(testDb.insert(knowledgeSamplingObligations).values({ id: "sampled", candidateId: "candidate", knowledgeCardId: "card", contentVersion: 2, evidenceSetRevision: 1, samplingDisposition: "sampling_passed", sampledAt: new Date() })).resolves.toBeDefined();
  });

  test("enforces target recommendation resolution and resolved-row shapes", async () => {
    const base = { knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification" as const, priority: 1 };

    await expect(testDb.insert(knowledgeRecommendations).values({ id: "invalid-resolution", ...base, status: "resolved", resolution: "accepted" as never, resolvedAt: new Date() })).rejects.toThrow();
    await expect(testDb.insert(knowledgeRecommendations).values({ id: "missing-resolved-at", ...base, status: "resolved", resolution: "published_operator_confirmed" })).rejects.toThrow();
    await expect(testDb.insert(knowledgeRecommendations).values({ id: "open-with-resolution", ...base, status: "open", resolution: "published_operator_confirmed" })).rejects.toThrow();
    await expect(testDb.insert(knowledgeRecommendations).values({ id: "resolved", ...base, status: "resolved", resolution: "published_operator_confirmed", resolvedAt: new Date() })).resolves.toBeDefined();
  });

  test("rejects resolutions that do not match recommendation work type", async () => {
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification" }, testDb);
    const [recommendation] = await testDb.select({ id: knowledgeRecommendations.id }).from(knowledgeRecommendations);
    if (!recommendation) throw new Error("expected recommendation");

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, resolution: "sampling_passed", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid" });
  });

  test("resolves admin work through the central lifecycle transition", async () => {
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);
    await expect(resolveDatabaseKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "verify", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "resolved", cardId: "card" });
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toMatchObject([{ status: "resolved", resolution: "published_operator_confirmed" }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ lifecycleState: "active", contentVersion: 2 }]);
  });
});
