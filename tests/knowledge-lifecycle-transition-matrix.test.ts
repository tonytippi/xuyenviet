import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, knowledgeSamplingObligations, sources } from "@/db/schema";
import { transitionKnowledgeCard } from "@/db/knowledge-lifecycle";
import { appendSourceCaptureVersion } from "@/features/knowledge/source-captures";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

describe("knowledge lifecycle transition matrix", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedTestOperator();
  });

  test("opens only same-fence work and rejects a stale fence", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    await expect(transitionKnowledgeCard({ actor: { kind: "system", system: "system-knowledge-pipeline" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "open_work", cardId: "card", workType: "verification" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(transitionKnowledgeCard({ actor: { kind: "system", system: "system-knowledge-pipeline" }, fences: { contentVersion: 2, evidenceSetRevision: 1 }, trigger: { kind: "open_work", cardId: "card", workType: "risk" } }, testDb)).resolves.toEqual({ status: "stale" });
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "card"))).resolves.toMatchObject([{ status: "open", workType: "verification", contentVersion: 1, evidenceSetRevision: 1 }]);
  });

  test("suppresses and invalidates a card when final eligible support is gone", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "active", knowledgeState: "community_observation", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: {}, trigger: { kind: "support_loss", cardId: "card", reason: "source_withdrawn" } }, testDb)).resolves.toMatchObject({ status: "resolved", cardId: "card" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "suppressed", verificationRequirement: "failed", contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "card"))).resolves.toMatchObject([{ workType: "risk", status: "open", contentVersion: 2 }]);
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: {}, trigger: { kind: "support_loss", cardId: "card", reason: "source_withdrawn" } }, testDb)).resolves.toMatchObject({ status: "resolved", contentVersion: 2 });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "suppressed", verificationRequirement: "failed", contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "card"))).resolves.toHaveLength(1);
  });

  test("rejects a sampling resolution for primary work without side effects", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    const [work] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification", priority: 1, policySnapshot: {} }).returning();
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "operator_resolution", recommendationId: work!.id, resolution: "sampling_failed" } }, testDb)).resolves.toEqual({ status: "invalid", reason: "invalid_resolution" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ contentVersion: 1, lifecycleState: "pending_operator" }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, work!.id))).resolves.toMatchObject([{ status: "open" }]);
  });

  test("records a sampling disposition on the matching obligation atomically", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    const [work] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policySnapshot: {} }).returning();
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Nguồn", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Nguồn an toàn.", metadata: { kind: "submitted" } });
    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    await testDb.insert(knowledgeIngestionCandidates).values({ id: "candidate", ingestionJobId: job!.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "sampling-candidate", type: "place", title: "Điểm", summary: "Tóm tắt.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test" });
    await testDb.insert(knowledgeSamplingObligations).values({ candidateId: "candidate", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1 });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "operator_resolution", recommendationId: work!.id, resolution: "sampling_failed" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeSamplingObligations)).resolves.toMatchObject([{ samplingDisposition: "sampling_failed", sampledAt: expect.any(Date) }]);
  });

  test("preserves open sampling work while resolving primary work at the same fence", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    const [primary] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification", priority: 1, policySnapshot: {} }).returning();
    await testDb.insert(knowledgeRecommendations).values({ id: "sampling", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policySnapshot: {} });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "operator_resolution", recommendationId: primary!.id, resolution: "published_operator_confirmed" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, "sampling"))).resolves.toMatchObject([{ status: "open", workType: "sampling" }]);
  });

  test("rejects sampling work as a restore authority without card or work effects", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "suppressed", knowledgeState: "community_observation", verificationRequirement: "failed", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    const [work] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policySnapshot: {} }).returning();
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { recommendationId: work!.id, contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "restore", recommendationId: work!.id } }, testDb)).resolves.toEqual({ status: "invalid", reason: "invalid_restore_work" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "suppressed", contentVersion: 1, evidenceSetRevision: 1 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, work!.id))).resolves.toMatchObject([{ status: "open" }]);
  });

  test("returns stale for a restore evidence fence mismatch without card or work effects", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "suppressed", knowledgeState: "community_observation", verificationRequirement: "failed", contentVersion: 1, evidenceSetRevision: 2, type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    const [work] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "risk", priority: 3, policySnapshot: {} }).returning();
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { recommendationId: work!.id, contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "restore", recommendationId: work!.id } }, testDb)).resolves.toEqual({ status: "stale" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "suppressed", contentVersion: 1, evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, work!.id))).resolves.toMatchObject([{ status: "open" }]);
  });
});
