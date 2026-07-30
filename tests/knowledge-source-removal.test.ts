import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { assistantProvenanceWithdrawalBackfillState, assistantResponseProvenance, auditEvents, conversations, knowledgeCardEvidence, knowledgeCardSearchDocuments, knowledgeCards, knowledgeIndexDirtyMarkers, knowledgeCardSources, knowledgeRecommendations, knowledgeSourceSuggestions, messages, sourceCaptureVersions, sources, users } from "@/db/schema";
import { removeKnowledgeSource, withdrawKnowledgeEvidence } from "@/features/knowledge/source-removal";
import { backfillHistoricalAssistantProvenanceWithdrawal, classifyAssistantProvenanceRowsForInsertion, ProvenanceWithdrawalBackfillError } from "../packages/database/src/assistant-provenance-withdrawal";

import { resetTestDatabase, testDb } from "./helpers/db";
import { seedKnowledgeCardEvidence, seedSourceCaptureVersion } from "./helpers/source-captures";

async function source(id: string) {
  await testDb.insert(sources).values({ id, kind: "url", url: `https://example.com/${id}`, canonicalUrl: `https://example.com/${id}`, label: id, sourceType: "curated", verificationStatus: "verified", submittedByUserId: "operator" });
}

async function card(id: string) {
  await testDb.insert(knowledgeCards).values({ id, status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: id, locationName: "Huế", summary: "Điểm dừng hợp lệ.", confidence: "curated", needsReview: false, aiPromptVersion: "test", createdByUserId: "operator" });
}

async function provenance(id: string, snapshot: Record<string, unknown>, createdAt = new Date("2026-07-01T00:00:00.000Z"), sourceReference = typeof snapshot.knowledgeCardId === "string" ? { id: snapshot.knowledgeCardId, type: "knowledge_card" } : null) {
  const [conversation] = await testDb.insert(conversations).values({ userId: "operator" }).returning({ id: conversations.id });
  const [question] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "operator", role: "user", content: "Question" }).returning({ id: messages.id });
  const [answer] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "operator", role: "assistant", content: "Answer" }).returning({ id: messages.id });
  await testDb.insert(assistantResponseProvenance).values({ id, userId: "operator", conversationId: conversation.id, userMessageId: question.id, assistantMessageId: answer.id, sourceCategory: "knowledge", sourceReferenceId: sourceReference?.id ?? null, sourceReferenceType: sourceReference?.type ?? null, rank: 1, verificationStatus: "verified", usedInPrompt: true, citedInAnswer: false, sourceSnapshot: snapshot, createdAt });
}

function knowledgeInsertionRow(sourceReferenceId: string | null, sourceReferenceType: string | null, sourceSnapshot: Record<string, unknown>) {
  return { userId: "operator", conversationId: "conversation", userMessageId: "question", assistantMessageId: "answer", sourceCategory: "knowledge" as const, sourceReferenceId, sourceReferenceType, rank: 1, verificationStatus: "verified" as const, usedInPrompt: true, citedInAnswer: false, sourceSnapshot } satisfies typeof assistantResponseProvenance.$inferInsert;
}

describe("knowledge source removal", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
    await testDb.insert(assistantProvenanceWithdrawalBackfillState).values({ contractKey: "v1", cutoverAt: new Date(), completedAt: new Date() });
  });

  test("withdraws evidence, suppresses unsupported cards, disables projections, and tombstones payloads atomically", async () => {
    await source("removed-source"); await card("removed-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "removed-card", sourceId: "removed-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "removed-source", captureKind: "url", rawText: "Bằng chứng bị gỡ." });
    await seedKnowledgeCardEvidence({ cardId: "removed-card", sourceId: "removed-source", captureVersionId: capture.id, quoteText: "Bằng chứng bị gỡ." });
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: "removed-card", executorSystem: "system-knowledge-pipeline", status: "active", searchableText: "Huế", textHash: "a".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false });
    const [recommendation] = await testDb.insert(knowledgeRecommendations).values({ knowledgeCardId: "removed-card", contentVersion: 1, evidenceSetRevision: 1, reason: "risk", priority: 50, executorSystem: "system-knowledge-pipeline" }).returning();

    await expect(removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "completed", sourceId: "removed-source", changedCardIds: ["removed-card"] });
    await expect(testDb.select({ eligibility: sources.eligibility, removalReason: sources.removalReason, current: sources.currentCaptureVersionId }).from(sources).where(eq(sources.id, "removed-source"))).resolves.toEqual([{ eligibility: "withdrawn", removalReason: "withdrawn", current: null }]);
    await expect(testDb.select({ state: knowledgeCardEvidence.state }).from(knowledgeCardEvidence)).resolves.toEqual([{ state: "removed" }]);
    await expect(testDb.select({ publicationState: knowledgeCards.publicationState, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, "removed-card"))).resolves.toEqual([{ publicationState: "suppressed", evidenceSetRevision: 2 }]);
    await expect(testDb.select({ status: knowledgeCardSearchDocuments.status }).from(knowledgeCardSearchDocuments)).resolves.toEqual([{ status: "disabled" }]);
    await expect(testDb.select({ rawText: sourceCaptureVersions.rawText, rawMetadata: sourceCaptureVersions.rawMetadata }).from(sourceCaptureVersions)).resolves.toEqual([{ rawText: null, rawMetadata: null }]);
    await expect(testDb.select({ status: knowledgeRecommendations.status, executorSystem: knowledgeRecommendations.executorSystem, resolvedByUserId: knowledgeRecommendations.resolvedByUserId }).from(knowledgeRecommendations).where(eq(knowledgeRecommendations.id, recommendation.id))).resolves.toEqual([{ status: "superseded", executorSystem: null, resolvedByUserId: "operator" }]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers)).resolves.toHaveLength(1);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_source_removal"))).resolves.toHaveLength(1);
    await expect(removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "already_completed" });
  });

  test("does not reactivate the disabled projection when indexing runs after source removal", async () => {
    await source("reindexed-removed-source"); await card("reindexed-removed-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "reindexed-removed-card", sourceId: "reindexed-removed-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "reindexed-removed-source", captureKind: "url", rawText: "Bằng chứng cần được xóa khỏi index." });
    await seedKnowledgeCardEvidence({ cardId: "reindexed-removed-card", sourceId: "reindexed-removed-source", captureVersionId: capture.id, quoteText: "Bằng chứng cần được xóa khỏi index." });
    const { indexApprovedKnowledgeCard } = await import("@/features/knowledge/search");
    const { processNextApprovedKnowledgeIndexingBatch } = await import("@/features/knowledge/indexing-worker");

    await indexApprovedKnowledgeCard("reindexed-removed-card");
    await expect(processNextApprovedKnowledgeIndexingBatch({}, testDb)).resolves.toMatchObject({ indexedCount: 1 });
    await removeKnowledgeSource({ sourceId: "reindexed-removed-source", reason: "removed", actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await indexApprovedKnowledgeCard("reindexed-removed-card");
    await expect(processNextApprovedKnowledgeIndexingBatch({}, testDb)).resolves.toMatchObject({ indexedCount: 0 });
    await expect(testDb.select({ status: knowledgeCardSearchDocuments.status }).from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, "reindexed-removed-card"))).resolves.toEqual([{ status: "disabled" }]);
  });

  test("keeps a card active when an eligible independent source still supports it", async () => {
    await source("removed-source"); await source("remaining-source"); await card("supported-card");
    await testDb.insert(knowledgeCardSources).values([{ knowledgeCardId: "supported-card", sourceId: "removed-source", supportLevel: "primary" }, { knowledgeCardId: "supported-card", sourceId: "remaining-source", supportLevel: "supporting" }]);
    const removed = await seedSourceCaptureVersion({ sourceId: "removed-source", captureKind: "url", rawText: "Bằng chứng bị gỡ." });
    const remaining = await seedSourceCaptureVersion({ sourceId: "remaining-source", captureKind: "url", rawText: "Bằng chứng còn hiệu lực." });
    await seedKnowledgeCardEvidence({ cardId: "supported-card", sourceId: "removed-source", captureVersionId: removed.id, quoteText: "Bằng chứng bị gỡ." });
    await seedKnowledgeCardEvidence({ cardId: "supported-card", sourceId: "remaining-source", captureVersionId: remaining.id, quoteText: "Bằng chứng còn hiệu lực." });

    await removeKnowledgeSource({ sourceId: "removed-source", reason: "inaccessible", actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await expect(testDb.select({ publicationState: knowledgeCards.publicationState, evidenceSetRevision: knowledgeCards.evidenceSetRevision }).from(knowledgeCards).where(eq(knowledgeCards.id, "supported-card"))).resolves.toEqual([{ publicationState: "active", evidenceSetRevision: 2 }]);
  });

  test("downgrades a pattern when removal leaves only one independent supporting source", async () => {
    await source("removed-source"); await source("remaining-source"); await card("pattern-card");
    await testDb.update(knowledgeCards).set({ knowledgeState: "community_pattern" }).where(eq(knowledgeCards.id, "pattern-card"));
    await testDb.insert(knowledgeCardSources).values([{ knowledgeCardId: "pattern-card", sourceId: "removed-source", supportLevel: "primary" }, { knowledgeCardId: "pattern-card", sourceId: "remaining-source", supportLevel: "supporting" }]);
    const removed = await seedSourceCaptureVersion({ sourceId: "removed-source", captureKind: "url", rawText: "Bằng chứng bị gỡ." });
    const remaining = await seedSourceCaptureVersion({ sourceId: "remaining-source", captureKind: "url", rawText: "Bằng chứng còn hiệu lực." });
    await seedKnowledgeCardEvidence({ cardId: "pattern-card", sourceId: "removed-source", captureVersionId: removed.id, quoteText: "Bằng chứng bị gỡ.", independenceKey: "removed" });
    await seedKnowledgeCardEvidence({ cardId: "pattern-card", sourceId: "remaining-source", captureVersionId: remaining.id, quoteText: "Bằng chứng còn hiệu lực.", independenceKey: "remaining" });

    await removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await expect(testDb.select({ knowledgeState: knowledgeCards.knowledgeState, contentVersion: knowledgeCards.contentVersion }).from(knowledgeCards).where(eq(knowledgeCards.id, "pattern-card"))).resolves.toEqual([{ knowledgeState: "community_observation", contentVersion: 2 }]);
  });

  test("removes operational source suggestions with the withdrawn source", async () => {
    await source("removed-source");
    await testDb.insert(knowledgeSourceSuggestions).values({ sourceId: "removed-source", action: "no_action", aiPromptVersion: "test", createdByUserId: "operator" });

    await removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await expect(testDb.select().from(knowledgeSourceSuggestions).where(eq(knowledgeSourceSuggestions.sourceId, "removed-source"))).resolves.toEqual([]);
  });

  test("withdraws one evidence through the same card suppression and index invalidation path", async () => {
    await source("evidence-source"); await card("evidence-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "evidence-card", sourceId: "evidence-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "evidence-source", captureKind: "url", rawText: "Evidence withdrawn." });
    const evidence = await seedKnowledgeCardEvidence({ cardId: "evidence-card", sourceId: "evidence-source", captureVersionId: capture.id, quoteText: "Evidence withdrawn." });
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: "evidence-card", executorSystem: "system-knowledge-pipeline", status: "active", searchableText: "Huế", textHash: "b".repeat(64), sourceCount: 1, confidence: "curated", freshnessSensitive: false });

    await expect(withdrawKnowledgeEvidence({ evidenceId: evidence.id, reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "completed" });
    await expect(testDb.select({ state: knowledgeCardEvidence.state }).from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.id, evidence.id))).resolves.toEqual([{ state: "removed" }]);
    await expect(testDb.select({ publicationState: knowledgeCards.publicationState }).from(knowledgeCards).where(eq(knowledgeCards.id, "evidence-card"))).resolves.toEqual([{ publicationState: "suppressed" }]);
    await expect(testDb.select({ status: knowledgeCardSearchDocuments.status }).from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, "evidence-card"))).resolves.toEqual([{ status: "disabled" }]);
    await expect(withdrawKnowledgeEvidence({ evidenceId: evidence.id, reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "already_completed" });
  });

  test("backfills supported exact anchors and advances the durable checkpoint", async () => {
    await source("backfill-source"); await card("backfill-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "backfill-card", sourceId: "backfill-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "backfill-source", captureKind: "url", rawText: "Backfill evidence." });
    const evidence = await seedKnowledgeCardEvidence({ cardId: "backfill-card", sourceId: "backfill-source", captureVersionId: capture.id, quoteText: "Backfill evidence." });
    await provenance("backfill-provenance", { knowledgeCardId: "backfill-card", evidence: [{ evidenceId: evidence.id, sourceId: "backfill-source" }] });
    await testDb.update(sources).set({ eligibility: "withdrawn", removalReason: "withdrawn", removedByUserId: "operator", removalCompletedAt: new Date() }).where(eq(sources.id, "backfill-source"));
    await testDb.update(assistantProvenanceWithdrawalBackfillState).set({ cutoverAt: new Date("2026-07-02T00:00:00.000Z"), completedAt: null }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, "v1"));

    await expect(backfillHistoricalAssistantProvenanceWithdrawal({}, testDb)).resolves.toEqual({ status: "progressed", scannedCount: 1 });
    await expect(testDb.select({ availability: assistantResponseProvenance.availability }).from(assistantResponseProvenance)).resolves.toEqual([{ availability: "withdrawn" }]);
    await expect(testDb.select({ cursorId: assistantProvenanceWithdrawalBackfillState.cursorId }).from(assistantProvenanceWithdrawalBackfillState)).resolves.toEqual([{ cursorId: "backfill-provenance" }]);
  });

  test("fails atomically on malformed or unresolvable owners, preserves its checkpoint, and retries after repair", async () => {
    await provenance("valid-before-failure", { knowledgeCardId: "missing-card" }, new Date("2026-07-01T00:00:00.000Z"));
    await provenance("malformed-after-valid", { evidence: "not-an-array" }, new Date("2026-07-01T00:00:01.000Z"));
    await testDb.update(assistantProvenanceWithdrawalBackfillState).set({ cutoverAt: new Date("2026-07-02T00:00:00.000Z"), completedAt: null }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, "v1"));

    await expect(backfillHistoricalAssistantProvenanceWithdrawal({ batchSize: 1 }, testDb)).resolves.toEqual({ status: "failed", failureCode: "owner_relation_unresolved" });
    await expect(testDb.select({ cursorId: assistantProvenanceWithdrawalBackfillState.cursorId, failureCode: assistantProvenanceWithdrawalBackfillState.failureCode }).from(assistantProvenanceWithdrawalBackfillState)).resolves.toEqual([{ cursorId: null, failureCode: "owner_relation_unresolved" }]);
    await expect(backfillHistoricalAssistantProvenanceWithdrawal({}, testDb)).resolves.toEqual({ status: "failed", failureCode: "owner_relation_unresolved" });

    await card("missing-card");
    await expect(backfillHistoricalAssistantProvenanceWithdrawal({ batchSize: 1, retryFailed: true }, testDb)).resolves.toEqual({ status: "progressed", scannedCount: 1 });
    await expect(backfillHistoricalAssistantProvenanceWithdrawal({ batchSize: 1 }, testDb)).resolves.toEqual({ status: "failed", failureCode: "unclassifiable_anchor" });
    await testDb.update(assistantResponseProvenance).set({ sourceSnapshot: { knowledgeCardId: "missing-card" } }).where(eq(assistantResponseProvenance.id, "malformed-after-valid"));
    await expect(backfillHistoricalAssistantProvenanceWithdrawal({ batchSize: 1, retryFailed: true }, testDb)).resolves.toEqual({ status: "progressed", scannedCount: 1 });
  });

  test("rejects malformed, anchorless, and unresolved new knowledge provenance before insertion", async () => {
    await expect(classifyAssistantProvenanceRowsForInsertion(testDb, [knowledgeInsertionRow(null, null, { evidence: "not-an-array" })])).rejects.toMatchObject({ code: "unclassifiable_anchor" });
    await expect(classifyAssistantProvenanceRowsForInsertion(testDb, [knowledgeInsertionRow(null, null, {})])).rejects.toMatchObject({ code: "unclassifiable_anchor" });
    await expect(classifyAssistantProvenanceRowsForInsertion(testDb, [knowledgeInsertionRow("missing-card", "knowledge_card", { knowledgeCardId: "missing-card" })])).rejects.toMatchObject({ code: "owner_relation_unresolved" });
  });

  test("requires every source anchor to resolve to the knowledge card", async () => {
    await source("linked-source"); await source("unlinked-source"); await card("multi-source-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "multi-source-card", sourceId: "linked-source", supportLevel: "primary" });
    await expect(classifyAssistantProvenanceRowsForInsertion(testDb, [knowledgeInsertionRow("multi-source-card", "knowledge_card", { knowledgeCardId: "multi-source-card", sources: [{ sourceId: "linked-source" }, { sourceId: "unlinked-source" }] })])).rejects.toMatchObject({ code: "owner_relation_unresolved" });
  });

  test("blocks removal before completion and after a backfill failure without changing knowledge state", async () => {
    await source("gated-source"); await card("gated-card");
    await testDb.update(assistantProvenanceWithdrawalBackfillState).set({ completedAt: null }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, "v1"));
    await expect(removeKnowledgeSource({ sourceId: "gated-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).rejects.toBeInstanceOf(ProvenanceWithdrawalBackfillError);
    await expect(testDb.select({ eligibility: sources.eligibility }).from(sources).where(eq(sources.id, "gated-source"))).resolves.toEqual([{ eligibility: "eligible" }]);

    await testDb.update(assistantProvenanceWithdrawalBackfillState).set({ failedAt: new Date(), failureCode: "unclassifiable_anchor" }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, "v1"));
    await expect(removeKnowledgeSource({ sourceId: "gated-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).rejects.toBeInstanceOf(ProvenanceWithdrawalBackfillError);
    await expect(testDb.select({ eligibility: sources.eligibility }).from(sources).where(eq(sources.id, "gated-source"))).resolves.toEqual([{ eligibility: "eligible" }]);
  });

  test("withdraws only the matching direct evidence and keeps remediation idempotent", async () => {
    await source("shared-source"); await card("shared-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "shared-card", sourceId: "shared-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "shared-source", captureKind: "url", rawText: "First evidence. Second evidence." });
    const first = await seedKnowledgeCardEvidence({ cardId: "shared-card", sourceId: "shared-source", captureVersionId: capture.id, quoteText: "First evidence." });
    const second = await seedKnowledgeCardEvidence({ cardId: "shared-card", sourceId: "shared-source", captureVersionId: capture.id, quoteText: "Second evidence.", independenceKey: "shared-source:second" });
    await provenance("first-evidence-provenance", { knowledgeCardId: "shared-card", evidence: [{ evidenceId: first.id, sourceId: "shared-source" }] });
    await provenance("second-evidence-provenance", { knowledgeCardId: "shared-card", evidence: [{ evidenceId: second.id, sourceId: "shared-source" }] });

    await expect(withdrawKnowledgeEvidence({ evidenceId: first.id, reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "completed", provenanceCount: 1 });
    await expect(testDb.select({ id: assistantResponseProvenance.id, availability: assistantResponseProvenance.availability }).from(assistantResponseProvenance).orderBy(assistantResponseProvenance.id)).resolves.toEqual([{ id: "first-evidence-provenance", availability: "withdrawn" }, { id: "second-evidence-provenance", availability: "available" }]);
    await expect(withdrawKnowledgeEvidence({ evidenceId: first.id, reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "already_completed", provenanceCount: 1 });
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_evidence_withdrawal"))).resolves.toHaveLength(1);
  });

  test("does not withdraw unrelated knowledge provenance while removing a source", async () => {
    await source("removed-source"); await source("unrelated-source");
    await card("removed-card"); await card("unrelated-card");
    await testDb.insert(knowledgeCardSources).values([
      { knowledgeCardId: "removed-card", sourceId: "removed-source", supportLevel: "primary" },
      { knowledgeCardId: "unrelated-card", sourceId: "unrelated-source", supportLevel: "primary" },
    ]);
    const removedCapture = await seedSourceCaptureVersion({ sourceId: "removed-source", captureKind: "url", rawText: "Removed evidence." });
    const unrelatedCapture = await seedSourceCaptureVersion({ sourceId: "unrelated-source", captureKind: "url", rawText: "Unrelated evidence." });
    const removedEvidence = await seedKnowledgeCardEvidence({ cardId: "removed-card", sourceId: "removed-source", captureVersionId: removedCapture.id, quoteText: "Removed evidence." });
    const unrelatedEvidence = await seedKnowledgeCardEvidence({ cardId: "unrelated-card", sourceId: "unrelated-source", captureVersionId: unrelatedCapture.id, quoteText: "Unrelated evidence." });
    await provenance("removed-provenance", { knowledgeCardId: "removed-card", evidence: [{ evidenceId: removedEvidence.id, sourceId: "removed-source" }] });
    await provenance("unrelated-provenance", { knowledgeCardId: "unrelated-card", evidence: [{ evidenceId: unrelatedEvidence.id, sourceId: "unrelated-source" }] });
    await provenance("legacy-source-provenance", {}, undefined, { id: "removed-source", type: "knowledge_source" });
    await provenance("legacy-evidence-provenance", {}, undefined, { id: removedEvidence.id, type: "knowledge_evidence" });

    await expect(removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "completed", changedCardIds: ["removed-card"] });
    await expect(testDb.select({ id: assistantResponseProvenance.id, availability: assistantResponseProvenance.availability }).from(assistantResponseProvenance).orderBy(assistantResponseProvenance.id)).resolves.toEqual([
      { id: "legacy-evidence-provenance", availability: "withdrawn" },
      { id: "legacy-source-provenance", availability: "withdrawn" },
      { id: "removed-provenance", availability: "withdrawn" },
      { id: "unrelated-provenance", availability: "available" },
    ]);
  });
});
