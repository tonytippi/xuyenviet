import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeIndexDirtyMarkers, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, knowledgeSamplingCohortMembers, knowledgeSamplingObligations, knowledgeSamplingPolicies, knowledgeSamplingRecommendationObligations, sources } from "@/db/schema";
import { transitionKnowledgeCard } from "@/db/knowledge-lifecycle";
import { resolveKnowledgeRecommendation } from "@/db/knowledge-recommendations";
import { appendSourceCaptureVersion } from "@/features/knowledge/source-captures";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

describe("knowledge lifecycle transition matrix", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedTestOperator();
  });

  test.each([
    ["LTM-01", "candidate_relation", "knowledge-ingestion-pipeline.test.ts", "candidate leases and relation outcomes require Worker-owned setup"],
    ["LTM-02", "operator_resolution", "knowledge-lifecycle-transition-matrix.test.ts", "primary and sampling resolution races are asserted below"],
    ["LTM-03", "sampling_containment", "knowledge-recommendation-queue.test.ts", "sealed cohort persistence invariants are owned by the queue suite"],
    ["LTM-04", "draft_publish", "knowledge-lifecycle-transition-matrix.test.ts", "supported and unsupported draft publication is asserted below"],
    ["LTM-05", "open_work", "knowledge-lifecycle-transition-matrix.test.ts", "same-fence and terminal-state admission is asserted below"],
    ["LTM-06", "content_refresh", "knowledge-lifecycle-transition-matrix.test.ts", "replacement work and terminal no-op behavior is asserted below"],
    ["LTM-07", "support_loss", "knowledge-source-removal.test.ts", "source withdrawal owns evidence removal; lifecycle effects are asserted below"],
    ["LTM-08", "archive", "knowledge-lifecycle-transition-matrix.test.ts", "archive work supersession is asserted below"],
    ["LTM-09", "restore", "knowledge-lifecycle-transition-matrix.test.ts", "supported restore and stale work rejection is asserted below"],
  ] as const)("%s inventories %s through %s", (_caseId, trigger, suite, whyDelegated) => {
    expect({ trigger, suite, whyDelegated }).toEqual(expect.objectContaining({ trigger: expect.any(String), suite: expect.stringMatching(/\.test\.ts$/), whyDelegated: expect.any(String) }));
  });

  test("LTM-10 candidate relation rejects a stale lease without card, work, audit, or index effects", async () => {
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Nguồn", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    if (!job) throw new Error("expected ingestion job");
    await testDb.update(knowledgeIngestionJobs).set({ status: "running" }).where(eq(knowledgeIngestionJobs.id, job.id));
    await testDb.insert(knowledgeIngestionCandidates).values({ id: "candidate", ingestionJobId: job.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "candidate-matrix", type: "place", title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", processingStatus: "processing", claimedBy: "worker", claimedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000), fencingToken: "a".repeat(64) });

    await expect(transitionKnowledgeCard({ actor: { kind: "system", system: "system-knowledge-pipeline" }, fences: { candidateFencingToken: "b".repeat(64) }, trigger: { kind: "candidate_relation", candidateId: "candidate", disposition: "apply", outcomeReasonCode: "applied", relation: { kind: "create", rationale: "Supported new card." } } }, testDb)).resolves.toEqual({ status: "stale" });
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.id, "candidate"))).resolves.toMatchObject([{ processingStatus: "processing", fencingToken: "a".repeat(64), aiDisposition: null }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toEqual([]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_lifecycle"))).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers)).resolves.toEqual([]);
  });

  test("LTM-11 candidate relation commits one matching lease with its card, evidence, candidate, audit, and index effects", async () => {
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Nguồn", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
    const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
    if (!job) throw new Error("expected ingestion job");
    await testDb.update(knowledgeIngestionJobs).set({ status: "running" }).where(eq(knowledgeIngestionJobs.id, job.id));
    await testDb.insert(knowledgeIngestionCandidates).values({ id: "candidate", ingestionJobId: job.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "candidate-matrix-commit", type: "place", title: "Điểm dừng", summary: "Có điểm dừng phù hợp.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", processingStatus: "processing", claimedBy: "worker", claimedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000), fencingToken: "a".repeat(64) });

    await expect(transitionKnowledgeCard({ actor: { kind: "system", system: "system-knowledge-pipeline" }, fences: { candidateFencingToken: "a".repeat(64) }, trigger: { kind: "candidate_relation", candidateId: "candidate", disposition: "apply", outcomeReasonCode: "applied", relation: { kind: "create", rationale: "Supported new card." } } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.id, "candidate"))).resolves.toMatchObject([{ processingStatus: "completed", aiDisposition: "apply", outcomeReasonCode: "applied", fencingToken: null }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ lifecycleState: "active", verificationRequirement: "none" }]);
    await expect(testDb.select().from(knowledgeCardEvidence)).resolves.toHaveLength(1);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_lifecycle"))).resolves.toHaveLength(2);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers)).resolves.toHaveLength(1);
  });

  test("LTM-12 concurrent primary resolutions commit exactly one matching-fence transition", async () => {
    await testDb.insert(knowledgeCards).values({ id: "card", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Thông tin an toàn.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Nguồn", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Nguồn an toàn.", metadata: { kind: "submitted" } });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source" });
    await testDb.insert(knowledgeCardEvidence).values({ knowledgeCardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "N", spanStart: 0, spanEnd: 1, observedAt: new Date(), capturedAt: new Date(), independenceKey: "source" });
    await testDb.insert(knowledgeRecommendations).values({ id: "primary", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1, workType: "verification", priority: 1, policySnapshot: {} });
    const input = { actor: { kind: "user" as const, userId: "operator", email: "operator@example.com" }, fences: { recommendationId: "primary", contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "operator_resolution" as const, recommendationId: "primary", resolution: "published_operator_confirmed" as const } };

    const results = await Promise.all([transitionKnowledgeCard(input, testDb), transitionKnowledgeCard(input, testDb)]);
    expect(results.filter((result) => result.status === "resolved")).toHaveLength(1);
    expect(results.filter((result) => result.status === "stale")).toHaveLength(1);
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ lifecycleState: "active", contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, "primary"))).resolves.toMatchObject([{ status: "resolved", resolution: "published_operator_confirmed" }]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_lifecycle"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "card"))).resolves.toHaveLength(1);
  });

  test("LTM-13 stale sealed-cohort members abort containment without partial work, audit, or index effects", async () => {
    await testDb.insert(knowledgeCards).values([
      { id: "card-a", lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Điểm A", locationName: "Huế", summary: "Thông tin A.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" },
      { id: "card-b", lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Điểm B", locationName: "Huế", summary: "Thông tin B.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" },
    ]);
    const [policy] = await testDb.insert(knowledgeSamplingPolicies).values({ cohortKey: "stale-cohort", windowStartsAt: new Date("2026-08-01T00:00:00Z"), windowEndsAt: new Date("2026-08-02T00:00:00Z"), samplingPercent: 15, enrollmentCandidateCount: 2, enrollmentSelectedCount: 2, enrollmentDigest: "b".repeat(64), enrollmentSealedAt: new Date() }).returning();
    await testDb.insert(knowledgeSamplingCohortMembers).values([{ policyId: policy!.id, knowledgeCardId: "card-a", contentVersion: 1, evidenceSetRevision: 1, selectedForSampling: true }, { policyId: policy!.id, knowledgeCardId: "card-b", contentVersion: 1, evidenceSetRevision: 1, selectedForSampling: true }]);
    await testDb.insert(knowledgeRecommendations).values([{ id: "sampling-a", knowledgeCardId: "card-a", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policyId: policy!.id, policySnapshot: {} }, { id: "sampling-b", knowledgeCardId: "card-b", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policyId: policy!.id, policySnapshot: {} }]);
    await testDb.update(knowledgeCards).set({ contentVersion: 2 }).where(eq(knowledgeCards.id, "card-b"));

    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { recommendationId: "sampling-a", contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "sampling_containment", policyId: policy!.id, enrollmentDigest: "b".repeat(64), recommendationId: "sampling-a", members: [{ cardId: "card-a", contentVersion: 1, evidenceSetRevision: 1, disposition: "remediable" }, { cardId: "card-b", contentVersion: 1, evidenceSetRevision: 1, disposition: "unsafe" }] } }, testDb)).resolves.toEqual({ status: "stale" });
    await expect(testDb.select({ id: knowledgeCards.id, lifecycleState: knowledgeCards.lifecycleState, contentVersion: knowledgeCards.contentVersion }).from(knowledgeCards).orderBy(knowledgeCards.id)).resolves.toEqual([{ id: "card-a", lifecycleState: "active", contentVersion: 1 }, { id: "card-b", lifecycleState: "active", contentVersion: 2 }]);
    await expect(testDb.select({ id: knowledgeRecommendations.id, status: knowledgeRecommendations.status }).from(knowledgeRecommendations).orderBy(knowledgeRecommendations.id)).resolves.toEqual([{ id: "sampling-a", status: "open" }, { id: "sampling-b", status: "open" }]);
    await expect(testDb.select({ escalatedAt: knowledgeSamplingPolicies.escalatedAt, suppressedAt: knowledgeSamplingPolicies.suppressedAt }).from(knowledgeSamplingPolicies).where(eq(knowledgeSamplingPolicies.id, policy!.id))).resolves.toEqual([{ escalatedAt: null, suppressedAt: null }]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_lifecycle"))).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers)).resolves.toEqual([]);
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
    await testDb.insert(knowledgeIngestionCandidates).values({ id: "candidate", ingestionJobId: job!.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "sampling-candidate", type: "place", title: "Điểm", summary: "Tóm tắt.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", processingStatus: "completed", aiDisposition: "needs_operator", outcomeReasonCode: "verification_required", knowledgeCardId: "card", completedContentVersion: 1, completedEvidenceSetRevision: 1 });
    const [obligation] = await testDb.insert(knowledgeSamplingObligations).values({ candidateId: "candidate", knowledgeCardId: "card", contentVersion: 1, evidenceSetRevision: 1 }).returning();
    await testDb.insert(knowledgeSamplingRecommendationObligations).values({ recommendationId: work!.id, obligationId: obligation!.id });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { recommendationId: work!.id, contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "operator_resolution", recommendationId: work!.id, resolution: "sampling_failed" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeSamplingObligations)).resolves.toMatchObject([{ samplingDisposition: "sampling_failed", sampledAt: expect.any(Date) }]);
  });

  test("contains the sealed sampling cohort into fenced operator risk work on a high-severity failure", async () => {
    await testDb.insert(knowledgeCards).values([
      { id: "card-a", lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Điểm A", locationName: "Huế", summary: "Thông tin A.", confidence: "community", aiPromptVersion: "test", executorSystem: "system-knowledge-pipeline" },
      { id: "card-b", lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Điểm B", locationName: "Huế", summary: "Thông tin B.", confidence: "community", aiPromptVersion: "test", executorSystem: "system-knowledge-pipeline" },
    ]);
    const [policy] = await testDb.insert(knowledgeSamplingPolicies).values({ cohortKey: "test-cohort", windowStartsAt: new Date("2026-08-01T00:00:00Z"), windowEndsAt: new Date("2026-08-02T00:00:00Z"), samplingPercent: 15, enrollmentCandidateCount: 2, enrollmentSelectedCount: 2, enrollmentDigest: "a".repeat(64), enrollmentSealedAt: new Date() }).returning();
    await testDb.insert(knowledgeSamplingCohortMembers).values([{ policyId: policy!.id, knowledgeCardId: "card-a", contentVersion: 1, evidenceSetRevision: 1, selectedForSampling: true }, { policyId: policy!.id, knowledgeCardId: "card-b", contentVersion: 1, evidenceSetRevision: 1, selectedForSampling: true }]);
    const [sampling] = await testDb.insert(knowledgeRecommendations).values([{ id: "sampling-a", knowledgeCardId: "card-a", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policyId: policy!.id, policySnapshot: {} }, { id: "sampling-b", knowledgeCardId: "card-b", contentVersion: 1, evidenceSetRevision: 1, workType: "sampling", priority: 5, policyId: policy!.id, policySnapshot: {} }]).returning();
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { recommendationId: sampling!.id, contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "operator_resolution", recommendationId: sampling!.id, resolution: "sampling_failed", highSeverity: true } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select({ id: knowledgeCards.id, lifecycleState: knowledgeCards.lifecycleState, verificationRequirement: knowledgeCards.verificationRequirement, contentVersion: knowledgeCards.contentVersion }).from(knowledgeCards).orderBy(knowledgeCards.id)).resolves.toEqual([{ id: "card-a", lifecycleState: "pending_operator", verificationRequirement: "failed", contentVersion: 2 }, { id: "card-b", lifecycleState: "pending_operator", verificationRequirement: "failed", contentVersion: 2 }]);
    await expect(testDb.select({ cardId: knowledgeRecommendations.knowledgeCardId, workType: knowledgeRecommendations.workType, status: knowledgeRecommendations.status, contentVersion: knowledgeRecommendations.contentVersion }).from(knowledgeRecommendations).where(eq(knowledgeRecommendations.workType, "risk")).orderBy(knowledgeRecommendations.knowledgeCardId)).resolves.toEqual([{ cardId: "card-a", workType: "risk", status: "open", contentVersion: 2 }, { cardId: "card-b", workType: "risk", status: "open", contentVersion: 2 }]);
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

  test("publishes only a supported draft and leaves an unsupported draft unchanged", async () => {
    await testDb.insert(knowledgeCards).values([
      { id: "unsupported", lifecycleState: "draft", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Chưa có nguồn", locationName: "Huế", summary: "Chưa đủ bằng chứng.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" },
      { id: "supported", lifecycleState: "draft", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Có nguồn", locationName: "Huế", summary: "Đủ bằng chứng.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" },
    ]);
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Nguồn", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Nguồn an toàn.", metadata: { kind: "submitted" } });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "supported", sourceId: "source" });
    await testDb.insert(knowledgeCardEvidence).values({ knowledgeCardId: "supported", sourceId: "source", captureVersionId: capture.id, quoteText: "N", spanStart: 0, spanEnd: 1, observedAt: new Date(), capturedAt: new Date(), independenceKey: "source" });

    await expect(transitionKnowledgeCard({ actor: { kind: "system", system: "system-knowledge-pipeline" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "draft_publish", cardId: "unsupported" } }, testDb)).resolves.toEqual({ status: "invalid", reason: "ineligible_support" });
    await expect(transitionKnowledgeCard({ actor: { kind: "system", system: "system-knowledge-pipeline" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "draft_publish", cardId: "supported" } }, testDb)).resolves.toMatchObject({ status: "resolved", cardId: "supported", contentVersion: 2 });
    await expect(testDb.select({ id: knowledgeCards.id, lifecycleState: knowledgeCards.lifecycleState, contentVersion: knowledgeCards.contentVersion }).from(knowledgeCards).orderBy(knowledgeCards.id)).resolves.toEqual([
      { id: "supported", lifecycleState: "active", contentVersion: 2 },
      { id: "unsupported", lifecycleState: "draft", contentVersion: 1 },
    ]);
  });

  test("refreshes pending work onto one new fence and leaves terminal cards unchanged", async () => {
    await testDb.insert(knowledgeCards).values([
      { id: "pending", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required", type: "place", title: "Cần cập nhật", locationName: "Huế", summary: "Thông tin.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" },
      { id: "archived", lifecycleState: "archived", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Lưu trữ", locationName: "Huế", summary: "Thông tin.", confidence: "community", aiPromptVersion: "test", createdByUserId: "operator" },
    ]);
    await testDb.insert(knowledgeRecommendations).values({ id: "pending-work", knowledgeCardId: "pending", contentVersion: 1, evidenceSetRevision: 1, workType: "relation", priority: 2, policySnapshot: {} });

    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "content_refresh", cardId: "pending", reason: "source_label" } }, testDb)).resolves.toMatchObject({ status: "resolved", contentVersion: 2 });
    await expect(transitionKnowledgeCard({ actor: { kind: "user", userId: "operator", email: "operator@example.com" }, fences: { contentVersion: 1, evidenceSetRevision: 1 }, trigger: { kind: "content_refresh", cardId: "archived", reason: "source_label" } }, testDb)).resolves.toMatchObject({ status: "resolved", contentVersion: 1 });
    await expect(testDb.select({ id: knowledgeCards.id, contentVersion: knowledgeCards.contentVersion }).from(knowledgeCards).orderBy(knowledgeCards.id)).resolves.toEqual([{ id: "archived", contentVersion: 1 }, { id: "pending", contentVersion: 2 }]);
    await expect(testDb.select({ id: knowledgeRecommendations.id, status: knowledgeRecommendations.status, workType: knowledgeRecommendations.workType, contentVersion: knowledgeRecommendations.contentVersion }).from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "pending")).orderBy(knowledgeRecommendations.contentVersion)).resolves.toEqual([
      { id: "pending-work", status: "superseded", workType: "relation", contentVersion: 1 },
      { id: expect.any(String), status: "open", workType: "relation", contentVersion: 2 },
    ]);
  });
});
