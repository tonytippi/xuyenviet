import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, knowledgeSamplingObligations, knowledgeSamplingRecommendationObligations, sources } from "@/db/schema";
import { transitionKnowledgeCard } from "@/db/knowledge-lifecycle";
import { resolveKnowledgeRecommendation } from "@/db/knowledge-recommendations";
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

  test("reopens suppressed cards only for primary work and rejects work in terminal states", async () => {
    await testDb.insert(knowledgeCards).values({ id: "suppressed", lifecycleState: "suppressed", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    await expect(transitionKnowledgeCard({ actor: { kind: "system", system: "system-knowledge-pipeline" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "open_work", cardId: "suppressed", workType: "risk" } }, testDb)).resolves.toMatchObject({ status: "resolved", contentVersion: 2 });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "suppressed"))).resolves.toMatchObject([{ lifecycleState: "pending_operator", verificationRequirement: "operator_required", contentVersion: 2 }]);
    await expect(testDb.insert(knowledgeCards).values({ id: "archived", lifecycleState: "archived", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Lưu trữ", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" })).resolves.toBeDefined();
    await expect(transitionKnowledgeCard({ actor: { kind: "system", system: "system-knowledge-pipeline" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "open_work", cardId: "archived", workType: "verification" } }, testDb)).resolves.toEqual({ status: "invalid", reason: "invalid_work_state" });
  });

  test("suppresses active cards and supersedes work when final eligible support is gone", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "active", knowledgeState: "community_observation", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "support_loss", cardId: "card", reason: "source_withdrawn" } }, testDb)).resolves.toMatchObject({ status: "resolved", cardId: "card" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "suppressed", verificationRequirement: "none", contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "card"))).resolves.toEqual([]);
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 2, evidenceSetRevision: 1 }, trigger: { kind: "support_loss", cardId: "card", reason: "source_withdrawn" } }, testDb)).resolves.toMatchObject({ status: "resolved", contentVersion: 2 });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "suppressed", verificationRequirement: "none", contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "card"))).resolves.toHaveLength(0);
  });

  test("does not alter archived cards when their support is withdrawn", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "archived", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "support_loss", cardId: "card", reason: "source_withdrawn" } }, testDb)).resolves.toMatchObject({ status: "resolved", contentVersion: 1 });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "archived", contentVersion: 1 }]);
  });

  test("rejects a sampling resolution for primary work without side effects", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    const [work] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification", priority: 1, policySnapshot: {} }).returning();
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { recommendationId: work!.id, contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "operator_resolution", recommendationId: work!.id, resolution: "sampling_failed" } }, testDb)).resolves.toEqual({ status: "invalid", reason: "invalid_resolution" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ contentVersion: 1, lifecycleState: "pending_operator" }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, work!.id))).resolves.toMatchObject([{ status: "open" }]);
  });

  test("records a sampling disposition on the matching obligation atomically", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    const [work] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policySnapshot: {} }).returning();
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Nguồn", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Nguồn an toàn.", metadata: { kind: "submitted" } });
    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    await testDb.insert(knowledgeIngestionCandidates).values({ id: "candidate", ingestionJobId: job!.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "sampling-candidate", type: "place", title: "Điểm", summary: "Tóm tắt.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", processingStatus: "completed", aiDisposition: "needs_operator", outcomeReasonCode: "verification_required", knowledgeCardId: "card" });
    const [obligation] = await testDb.insert(knowledgeSamplingObligations).values({ candidateId: "candidate", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1 }).returning();
    await testDb.insert(knowledgeSamplingRecommendationObligations).values({ recommendationId: work!.id, obligationId: obligation!.id });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { recommendationId: work!.id, contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "operator_resolution", recommendationId: work!.id, resolution: "sampling_failed" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeSamplingObligations)).resolves.toMatchObject([{ samplingDisposition: "sampling_failed", sampledAt: expect.any(Date) }]);
  });

  test("supersedes sampling work while resolving primary work onto a new fence", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Nguồn", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Nguồn an toàn.", metadata: { kind: "submitted" } });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source" });
    await testDb.insert(knowledgeCardEvidence).values({ knowledgeCardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "N", spanStart: 0, spanEnd: 1, observedAt: new Date(), capturedAt: new Date(), independenceKey: "source" });
    const [primary] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification", priority: 1, policySnapshot: {} }).returning();
    await testDb.insert(knowledgeRecommendations).values({ id: "sampling", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policySnapshot: {} });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { recommendationId: primary!.id, contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "operator_resolution", recommendationId: primary!.id, resolution: "published_operator_confirmed" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, "sampling"))).resolves.toMatchObject([{ status: "superseded", workType: "sampling" }]);
  });

  test("rejects sampling work as a restore authority without card or work effects", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "suppressed", knowledgeState: "community_observation", verificationRequirement: "failed", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    const [work] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policySnapshot: {} }).returning();
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "restore", cardId: "card", target: "pending_operator" } }, testDb)).resolves.toEqual({ status: "stale" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "suppressed", contentVersion: 1, evidenceSetRevision: 1 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, work!.id))).resolves.toMatchObject([{ status: "open" }]);
  });

  test("does not restore an archived card from superseded or sampling work", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "archived", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Nguồn", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Nguồn an toàn.", metadata: { kind: "submitted" } });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source" });
    await testDb.insert(knowledgeCardEvidence).values({ knowledgeCardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "N", spanStart: 0, spanEnd: 1, observedAt: new Date(), capturedAt: new Date(), independenceKey: "source" });
    await testDb.insert(knowledgeRecommendations).values([
      { id: "superseded", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification", priority: 1, status: "superseded", resolution: "edited_and_requeued", resolvedAt: new Date(), policySnapshot: {} },
      { id: "sampling", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policySnapshot: {} },
    ]);

    for (const recommendationId of ["superseded", "sampling"]) {
      await expect(resolveKnowledgeRecommendation({ recommendationId, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "restore", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "stale" });
    }
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "archived", contentVersion: 1, evidenceSetRevision: 1 }]);
  });

  test("returns stale for a restore evidence fence mismatch without card or work effects", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "suppressed", knowledgeState: "community_observation", verificationRequirement: "failed", contentVersion: 1, evidenceSetRevision: 2, type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    const [work] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "risk", priority: 3, policySnapshot: {} }).returning();
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "restore", cardId: "card", target: "pending_operator" } }, testDb)).resolves.toEqual({ status: "stale" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "suppressed", contentVersion: 1, evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, work!.id))).resolves.toMatchObject([{ status: "open" }]);
  });

  test("archives with verification cleared and restores an archived card to pending work", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification", priority: 1, policySnapshot: {} });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "archive", cardId: "card" } }, testDb)).resolves.toMatchObject({ status: "resolved", contentVersion: 2 });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "archived", verificationRequirement: "none", contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "card"))).resolves.toMatchObject([{ status: "superseded" }]);

    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Nguồn", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Nguồn an toàn.", metadata: { kind: "submitted" } });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source" });
    await testDb.insert(knowledgeCardEvidence).values({ knowledgeCardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "N", spanStart: 0, spanEnd: 1, observedAt: new Date(), capturedAt: new Date(), independenceKey: "source" });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 2, evidenceSetRevision: 1 }, trigger: { kind: "restore", cardId: "card", target: "pending_operator" } }, testDb)).resolves.toMatchObject({ status: "resolved", contentVersion: 3 });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "pending_operator", verificationRequirement: "operator_required", contentVersion: 3 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.knowledgeCardId, "card"), eq(knowledgeRecommendations.status, "open")))).resolves.toMatchObject([{ workType: "verification", contentVersion: 3 }]);
  });
});
