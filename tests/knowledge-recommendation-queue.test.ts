import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, knowledgeCardEvidence, knowledgeCardSearchDocuments, knowledgeCardSources, knowledgeCards, knowledgeIndexDirtyMarkers, knowledgeRecommendations, knowledgeSamplingCohortMembers, knowledgeSamplingPolicies, sources, users } from "@/db/schema";
import { getKnowledgeRecommendationDetail, listKnowledgeRecommendations, resolveKnowledgeRecommendation, scheduleKnowledgeRecommendation, shouldSampleKnowledgeCard } from "@/features/knowledge/recommendations";

import { resetTestDatabase, testDb } from "./helpers/db";
import { seedKnowledgeCardEvidence, seedSourceCaptureVersion } from "./helpers/source-captures";

describe("knowledge recommendation queue", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await testDb.insert(users).values([{ id: "operator", email: "operator@example.com" }, { id: "author", email: "author@example.com" }]);
    await testDb.insert(knowledgeCards).values({ id: "card", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm dừng", summary: "Thông tin có bằng chứng.", locationName: "Huế", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" });
  });

  test("selects a persisted policy sample deterministically and idempotently", async () => {
    const starts = new Date("2026-07-22T00:00:00.000Z");
    await testDb.insert(knowledgeCards).values({ id: "sample-2", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm lấy mẫu", summary: "Thông tin được lấy mẫu.", locationName: "Huế", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" });
    expect(shouldSampleKnowledgeCard("sample-2", 1, starts)).toBe(true);
    await scheduleKnowledgeRecommendation({ cardId: "sample-2", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "sample", now: starts }, testDb);
    await scheduleKnowledgeRecommendation({ cardId: "sample-2", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "sample", now: starts }, testDb);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeSamplingCohortMembers)).resolves.toHaveLength(1);
  });

  test("reuses the persisted four-week sampling policy window", async () => {
    await testDb.insert(knowledgeCards).values([{ id: "sample-2", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm lấy mẫu một", summary: "Thông tin lấy mẫu một.", locationName: "Huế", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" }, { id: "sample-9", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm lấy mẫu hai", summary: "Thông tin lấy mẫu hai.", locationName: "Đà Nẵng", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" }]);
    await scheduleKnowledgeRecommendation({ cardId: "sample-2", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "sample", now: new Date("2026-07-22T00:00:00.000Z") }, testDb);
    await scheduleKnowledgeRecommendation({ cardId: "sample-9", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "sample", now: new Date("2026-07-23T00:00:00.000Z") }, testDb);

    await expect(testDb.select().from(knowledgeSamplingPolicies)).resolves.toMatchObject([{ cohortKey: "initial:2026-07-22", windowStartsAt: new Date("2026-07-22T00:00:00.000Z"), windowEndsAt: new Date("2026-08-19T00:00:00.000Z") }]);
    const recommendations = await testDb.select().from(knowledgeRecommendations);
    expect(recommendations[0]?.policyId).toBe(recommendations[1]?.policyId);
  });

  test("rejects a stale resolution without audit, dirty marker, or card mutation", async () => {
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);
    await testDb.update(knowledgeCards).set({ contentVersion: 2 }).where(eq(knowledgeCards.id, "card"));
    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "sampling_pass", samplingDispositionReason: "confirmed", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "stale" });
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers)).resolves.toEqual([]);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toMatchObject([{ status: "open" }]);
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ contentVersion: 2, publicationState: "active" }]);
  });

  test("supersedes earlier open work when scheduling a recommendation for a new version", async () => {
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "weak_evidence" }, testDb);
    await testDb.update(knowledgeCards).set({ contentVersion: 2 }).where(eq(knowledgeCards.id, "card"));

    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 2, evidenceSetRevision: 1, reason: "sampling", supersedeStaleBy: { userId: "author", email: "author@example.com" } }, testDb);

    await expect(testDb.select().from(knowledgeRecommendations).orderBy(knowledgeRecommendations.contentVersion)).resolves.toMatchObject([
      { contentVersion: 1, status: "superseded", resolvedByUserId: "author" },
      { contentVersion: 2, status: "open" },
    ]);
  });

  test("suppression resolves atomically, marks dirty, and disables the active projection", async () => {
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "risk" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);
    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "suppress", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "suppressed", contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers)).resolves.toMatchObject([{ knowledgeCardId: "card", contentVersion: 2 }]);
  });

  test("applies an evidence-supported factual edit with its versioned audit and dirty marker", async () => {
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source", supportLevel: "supporting" });
    const capture = await seedSourceCaptureVersion({ sourceId: "source", captureKind: "pasted_text", rawText: "RAW_CAPTURE_TEXT_MUST_NOT_LEAK. Bãi đỗ xe có mái che tại Huế." });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "Bãi đỗ xe có mái che tại Huế." });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "weak_evidence" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "card"));

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "edit", editSummary: "Bãi đỗ xe có mái che tại Huế.", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "resolved", cardId: "card" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ summary: "Bãi đỗ xe có mái che tại Huế.", contentVersion: 2, reviewState: "reviewed", needsReview: false }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, recommendation!.id))).resolves.toMatchObject([{ status: "resolved", resolution: "edited", resolvedByUserId: "operator" }]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetId, recommendation!.id))).resolves.toMatchObject([{ actorUserId: "operator", operation: "update", afterSummary: "Resolved weak_evidence recommendation with edit." }]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "card"))).resolves.toMatchObject([{ contentVersion: 2, evidenceSetRevision: 1, reason: "recommendation:edit" }]);
  });

  test("rejects an evidence-validated edit with an appended unsupported claim", async () => {
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source", supportLevel: "supporting" });
    const capture = await seedSourceCaptureVersion({ sourceId: "source", captureKind: "pasted_text", rawText: "Bãi đỗ xe có mái che tại Huế." });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "Bãi đỗ xe có mái che tại Huế." });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "weak_evidence" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "edit", editSummary: "Bãi đỗ xe có mái che tại Huế. Miễn phí cả ngày.", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_evidence" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ summary: "Thông tin có bằng chứng.", contentVersion: 1 }]);
  });

  test("rejects an evidence-validated edit backed only by conflicting evidence", async () => {
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source", supportLevel: "conflicting" });
    const capture = await seedSourceCaptureVersion({ sourceId: "source", captureKind: "pasted_text", rawText: "Bãi đỗ xe không có mái che tại Huế." });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "Bãi đỗ xe không có mái che tại Huế.", supportLevel: "conflicting" });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "weak_evidence" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "edit", editSummary: "Bãi đỗ xe không có mái che tại Huế.", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_evidence" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ summary: "Thông tin có bằng chứng.", contentVersion: 1 }]);
  });

  test("keeps verification recommendations actionable until verification, suppression, or an evidence-backed edit", async () => {
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "verification" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "accept_wording", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_action" });
    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "edit", editSummary: "   ", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_edit" });
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toMatchObject([{ status: "open" }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ contentVersion: 1 }]);
  });

  test("keeps an edited verification recommendation actionable on its successor version", async () => {
    await testDb.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "ai_recommended", verificationState: "required", needsReview: true }).where(eq(knowledgeCards.id, "card"));
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "source", captureKind: "pasted_text", rawText: "Bãi đỗ xe có mái che tại Huế." });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "Bãi đỗ xe có mái che tại Huế." });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "verification", policy: "verify_first" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "edit", editSummary: "Bãi đỗ xe có mái che tại Huế.", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ contentVersion: 2, reviewState: "ai_recommended", verificationState: "required", needsReview: true }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.status, "open"))).resolves.toMatchObject([{ reason: "verification", contentVersion: 2, evidenceSetRevision: 1 }]);
  });

  test("retires conflicting evidence and restores a supported conflicted card", async () => {
    await testDb.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "conflicted" }).where(eq(knowledgeCards.id, "card"));
    await testDb.insert(sources).values([{ id: "support", kind: "pasted_text", label: "Supporting source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" }, { id: "conflict", kind: "pasted_text", label: "Conflicting source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" }]);
    await testDb.insert(knowledgeCardSources).values([{ knowledgeCardId: "card", sourceId: "support", supportLevel: "supporting" }, { knowledgeCardId: "card", sourceId: "conflict", supportLevel: "conflicting" }]);
    const [supportCapture, conflictCapture] = await Promise.all([seedSourceCaptureVersion({ sourceId: "support", captureKind: "pasted_text", rawText: "Bãi đỗ xe có mái che tại Huế." }), seedSourceCaptureVersion({ sourceId: "conflict", captureKind: "pasted_text", rawText: "Bãi đỗ xe không có mái che tại Huế." })]);
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "support", captureVersionId: supportCapture.id, quoteText: "Bãi đỗ xe có mái che tại Huế.", supportLevel: "supporting" });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "conflict", captureVersionId: conflictCapture.id, quoteText: "Bãi đỗ xe không có mái che tại Huế.", supportLevel: "conflicting" });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "conflict" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "resolve_relation", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "active", knowledgeState: "community_observation", contentVersion: 2, evidenceSetRevision: 2, conditions: [] }]);
    await expect(testDb.select({ state: knowledgeCardEvidence.state }).from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.sourceId, "conflict"))).resolves.toEqual([{ state: "removed" }]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "card"))).resolves.toMatchObject([{ contentVersion: 2, evidenceSetRevision: 2, reason: "recommendation:resolve_relation" }]);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toMatchObject([{ status: "resolved", resolution: "relation_resolved" }]);
    await expect(testDb.select({ afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetId, recommendation!.id))).resolves.toEqual([{ afterSummary: "Resolved conflict recommendation with resolve_relation. Final card contentVersion=2, evidenceSetRevision=2, publicationState=active." }]);
  });

  test("keeps a conflicted card suppressed when relation resolution removes its only evidence", async () => {
    await testDb.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "conflicted" }).where(eq(knowledgeCards.id, "card"));
    await testDb.insert(sources).values({ id: "conflict", kind: "pasted_text", label: "Conflicting source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "conflict", supportLevel: "conflicting" });
    const capture = await seedSourceCaptureVersion({ sourceId: "conflict", captureKind: "pasted_text", rawText: "Bãi đỗ xe không có mái che tại Huế." });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "conflict", captureVersionId: capture.id, quoteText: "Bãi đỗ xe không có mái che tại Huế.", supportLevel: "conflicting" });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "conflict" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "resolve_relation", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "insufficient_support", cardId: "card" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "ai_recommended", needsReview: true, contentVersion: 2, evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeCardEvidence)).resolves.toMatchObject([{ state: "removed" }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.status, "open"))).resolves.toMatchObject([{ reason: "weak_evidence", contentVersion: 2, evidenceSetRevision: 2 }]);
    await expect(testDb.select({ afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetId, recommendation!.id))).resolves.toEqual([{ afterSummary: "Resolved conflict recommendation with resolve_relation without reactivation because supporting evidence is insufficient. Final card contentVersion=2, evidenceSetRevision=2, publicationState=suppressed." }]);
  });

  test("never restores failed verification through restore or conflict resolution", async () => {
    await testDb.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "conflicted", verificationState: "failed" }).where(eq(knowledgeCards.id, "card"));
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "weak_evidence" }, testDb);
    const [restoreRecommendation] = await testDb.select().from(knowledgeRecommendations);
    await expect(resolveKnowledgeRecommendation({ recommendationId: restoreRecommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "restore", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_action" });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "conflict" }, testDb);
    const [relationRecommendation] = await testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.reason, "conflict"));
    await expect(resolveKnowledgeRecommendation({ recommendationId: relationRecommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "resolve_relation", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_action" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "suppressed", verificationState: "failed", contentVersion: 1, evidenceSetRevision: 1 }]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers)).resolves.toEqual([]);
    await expect(testDb.select().from(auditEvents)).resolves.toEqual([]);
  });

  test("requires conflict verification before relation resolution can reactivate a required card", async () => {
    await testDb.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "conflicted", reviewState: "ai_recommended", verificationState: "required", needsReview: true }).where(eq(knowledgeCards.id, "card"));
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source", supportLevel: "conflicting" });
    const capture = await seedSourceCaptureVersion({ sourceId: "source", captureKind: "pasted_text", rawText: "Bãi đỗ xe có mái che tại Huế." });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "Bãi đỗ xe có mái che tại Huế.", supportLevel: "conflicting" });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "conflict" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "resolve_relation", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_action" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "suppressed", verificationState: "required", contentVersion: 1 }]);
    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "verify", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_verification" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ publicationState: "suppressed", knowledgeState: "conflicted", verificationState: "required", contentVersion: 1 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, recommendation!.id))).resolves.toMatchObject([{ status: "open", resolution: null }]);
    await testDb.insert(sources).values([{ id: "support-1", kind: "pasted_text", label: "Supporting source one", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" }, { id: "support-2", kind: "pasted_text", label: "Supporting source two", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" }]);
    await testDb.insert(knowledgeCardSources).values([{ knowledgeCardId: "card", sourceId: "support-1", supportLevel: "supporting" }, { knowledgeCardId: "card", sourceId: "support-2", supportLevel: "supporting" }]);
    const [supportCaptureOne, supportCaptureTwo] = await Promise.all([seedSourceCaptureVersion({ sourceId: "support-1", captureKind: "pasted_text", rawText: "Bãi đỗ xe có mái che tại Huế." }), seedSourceCaptureVersion({ sourceId: "support-2", captureKind: "pasted_text", rawText: "Bãi đỗ xe có mái che tại Huế." })]);
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "support-1", captureVersionId: supportCaptureOne.id, quoteText: "Bãi đỗ xe có mái che tại Huế.", supportLevel: "supporting", independenceKey: "support-1" });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "support-2", captureVersionId: supportCaptureTwo.id, quoteText: "Bãi đỗ xe có mái che tại Huế.", supportLevel: "supporting", independenceKey: "support-2" });
    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "verify", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    const [successor] = await testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.status, "open"));
    await expect(resolveKnowledgeRecommendation({ recommendationId: successor!.id, expectedContentVersion: 2, expectedEvidenceSetRevision: 1, action: "resolve_relation", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "active", knowledgeState: "community_observation", verificationState: "corroborated", contentVersion: 3, evidenceSetRevision: 2 }]);
  });

  test("does not let an evidence-backed edit or relation resolution bypass required verification", async () => {
    await testDb.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "ai_recommended", verificationState: "required", needsReview: true }).where(eq(knowledgeCards.id, "card"));
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source", supportLevel: "supporting" });
    const capture = await seedSourceCaptureVersion({ sourceId: "source", captureKind: "pasted_text", rawText: "Bãi đỗ xe có mái che tại Huế." });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "Bãi đỗ xe có mái che tại Huế." });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "missing_context" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "edit", editSummary: "Bãi đỗ xe có mái che tại Huế.", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "suppressed", verificationState: "required", reviewState: "ai_recommended", needsReview: true, contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.status, "open"))).resolves.toMatchObject([{ reason: "missing_context", contentVersion: 2 }]);
  });

  test("requires and persists a bounded sampling disposition without raw material", async () => {
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "sampling_pass", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_sampling_reason" });
    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "sampling_pass", samplingDispositionReason: "unknown", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_sampling_reason" });
    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "sampling_pass", samplingDispositionReason: "material_error", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_sampling_reason" });
    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "sampling_pass", samplingDispositionReason: "confirmed", samplingRationale: "Đối chiếu thẻ và evidence hiển thị.", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toMatchObject([{ resolution: "sampling_passed", samplingDispositionReason: "confirmed", samplingRationale: "Đối chiếu thẻ và evidence hiển thị." }]);
    await expect(testDb.select({ afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetId, recommendation!.id))).resolves.toEqual([{ afterSummary: "Resolved sampling recommendation with sampling_pass; disposition=confirmed." }]);
  });

  test("requires two independent supporting records before verifying a suppressed verify-first card", async () => {
    await testDb.update(knowledgeCards).set({ publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "ai_recommended", verificationState: "required", needsReview: true }).where(eq(knowledgeCards.id, "card"));
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "source", captureKind: "pasted_text", rawText: "Bãi đỗ xe có mái che tại Huế." });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "Bãi đỗ xe có mái che tại Huế." });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "verification", policy: "verify_first" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "verify", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "invalid_action" });
    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source-2", supportLevel: "supporting" });
    const secondCapture = await seedSourceCaptureVersion({ sourceId: "source-2", captureKind: "pasted_text", rawText: "Bãi đỗ xe có mái che tại Huế." });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "source-2", captureVersionId: secondCapture.id, quoteText: "Bãi đỗ xe có mái che tại Huế." });

    await expect(resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "verify", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "resolved" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "active", verificationState: "corroborated", reviewState: "reviewed", needsReview: false, contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeSamplingCohortMembers).where(eq(knowledgeSamplingCohortMembers.knowledgeCardId, "card"))).resolves.toEqual([]);
  });

  test("returns safe recommendation list and detail projections", async () => {
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "author" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card", sourceId: "source", supportLevel: "supporting" });
    const capture = await seedSourceCaptureVersion({ sourceId: "source", captureKind: "pasted_text", rawText: "RAW_CAPTURE_TEXT_MUST_NOT_LEAK. Bãi đỗ xe có mái che tại Huế.", rawMetadata: { provider_marker: "PROVIDER_MARKER_MUST_NOT_LEAK", checkpoint_marker: "CHECKPOINT_MARKER_MUST_NOT_LEAK" } });
    await seedKnowledgeCardEvidence({ cardId: "card", sourceId: "source", captureVersionId: capture.id, quoteText: "Bãi đỗ xe có mái che tại Huế." });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "weak_evidence" }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations);

    const list = await listKnowledgeRecommendations({}, testDb);
    const detail = await getKnowledgeRecommendationDetail(recommendation!.id, testDb);
    const projection = JSON.stringify({ list, detail });
    expect(projection).not.toContain("RAW_CAPTURE_TEXT_MUST_NOT_LEAK");
    expect(projection).not.toContain("PROVIDER_MARKER_MUST_NOT_LEAK");
    expect(projection).not.toContain("CHECKPOINT_MARKER_MUST_NOT_LEAK");
    expect(detail?.evidence).toEqual([expect.objectContaining({ quoteText: "Bãi đỗ xe có mái che tại Huế." })]);
    expect(Object.keys(detail?.evidence[0] ?? {})).not.toContain("captureVersionId");
    await expect(testDb.select().from(knowledgeCardEvidence)).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeCardSearchDocuments)).resolves.toEqual([]);
  });

  test("contains high-severity sampling escalation within its policy cohort", async () => {
    await testDb.insert(knowledgeCards).values([{ id: "sample-2", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm lấy mẫu", summary: "Thông tin lấy mẫu.", locationName: "Huế", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" }, { id: "sample-9", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm khác", summary: "Thông tin khác.", locationName: "Đà Nẵng", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" }]);
    await scheduleKnowledgeRecommendation({ cardId: "sample-2", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "sample", now: new Date("2026-07-22T00:00:00.000Z") }, testDb);
    await scheduleKnowledgeRecommendation({ cardId: "sample-9", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "sample", now: new Date("2026-08-22T00:00:00.000Z") }, testDb);
    const [recommendation] = await testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "sample-2"));
    await resolveKnowledgeRecommendation({ recommendationId: recommendation!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "sampling_fail", samplingDispositionReason: "safety_risk", highSeverity: true, actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "sample-9"))).resolves.toMatchObject([{ publicationState: "active" }]);
    await expect(testDb.select().from(knowledgeSamplingPolicies).where(eq(knowledgeSamplingPolicies.cohortKey, "initial:2026-07-22"))).resolves.toMatchObject([{ escalatedAt: expect.any(Date), suppressedAt: expect.any(Date) }]);
  });

  test("suppresses every current auto-active cohort member, including unselected cards", async () => {
    const now = new Date("2026-07-22T00:00:00.000Z");
    const unselectedId = Array.from({ length: 100 }, (_, index) => `unselected-${index}`).find((id) => !shouldSampleKnowledgeCard(id, 1, now));
    if (!unselectedId) throw new Error("expected deterministic unselected card");
    await testDb.insert(knowledgeCards).values([{ id: "sample-2", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm lấy mẫu", summary: "Thông tin lấy mẫu.", locationName: "Huế", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" }, { id: unselectedId, status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm không được lấy mẫu", summary: "Thông tin không được lấy mẫu.", locationName: "Huế", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" }]);
    await scheduleKnowledgeRecommendation({ cardId: "sample-2", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "sample", now }, testDb);
    await scheduleKnowledgeRecommendation({ cardId: unselectedId, contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "sample", now }, testDb);
    const [trigger] = await testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "sample-2"));
    if (!trigger?.policyId) throw new Error("expected sampling policy");
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, unselectedId))).resolves.toEqual([]);
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: unselectedId, searchableText: "Điểm không được lấy mẫu", textHash: "a".repeat(64), sourceCount: 1, confidence: "community", freshnessSensitive: false });

    await resolveKnowledgeRecommendation({ recommendationId: trigger.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "sampling_fail", samplingDispositionReason: "material_error", highSeverity: true, actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "sample-2"))).resolves.toMatchObject([{ publicationState: "suppressed", contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, unselectedId))).resolves.toMatchObject([{ publicationState: "suppressed", contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, unselectedId))).resolves.toMatchObject([{ status: "disabled", disabledAt: expect.any(Date) }]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, unselectedId))).resolves.toHaveLength(1);
  });

  test("does not suppress a cohort member after its version changes", async () => {
    const now = new Date("2026-07-22T00:00:00.000Z");
    await testDb.insert(knowledgeCards).values({ id: "trigger", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm kích hoạt", summary: "Thông tin kích hoạt.", locationName: "Huế", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "author" });
    await testDb.insert(knowledgeSamplingPolicies).values({ windowStartsAt: now, windowEndsAt: new Date("2026-08-19T00:00:00.000Z"), samplingPercent: 100, cohortKey: "initial:2026-07-22" });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "sample", now }, testDb);
    await scheduleKnowledgeRecommendation({ cardId: "trigger", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "sample", now }, testDb);
    const [trigger] = await testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "trigger"));
    await testDb.update(knowledgeCards).set({ contentVersion: 2 }).where(eq(knowledgeCards.id, "card"));

    await resolveKnowledgeRecommendation({ recommendationId: trigger!.id, expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "sampling_fail", samplingDispositionReason: "material_error", highSeverity: true, actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "card"))).resolves.toMatchObject([{ publicationState: "active", contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeSamplingPolicies)).resolves.toMatchObject([{ suppressedAt: expect.any(Date) }]);
  });

  test("replaces a suppressed policy instead of scheduling new work under it", async () => {
    const starts = new Date("2026-07-22T00:00:00.000Z");
    const now = new Date("2026-07-23T00:00:00.000Z");
    await testDb.insert(knowledgeSamplingPolicies).values({ windowStartsAt: starts, windowEndsAt: new Date("2026-08-19T00:00:00.000Z"), samplingPercent: 100, cohortKey: "initial:2026-07-22", suppressedAt: starts });
    await scheduleKnowledgeRecommendation({ cardId: "card", contentVersion: 1, evidenceSetRevision: 1, reason: "sampling", policy: "verify_first", now }, testDb);
    await expect(testDb.select({ policyId: knowledgeRecommendations.policyId }).from(knowledgeRecommendations)).resolves.toHaveLength(1);
    const policies = await testDb.select().from(knowledgeSamplingPolicies).orderBy(knowledgeSamplingPolicies.cohortKey);
    expect(policies).toHaveLength(2);
    expect(policies[1]?.suppressedAt).toBeNull();
    expect(policies[1]?.windowStartsAt).toEqual(starts);
  });
});
