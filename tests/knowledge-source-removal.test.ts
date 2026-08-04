import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { assistantProvenanceWithdrawalBackfillState, assistantResponseProvenance, auditEvents, conversations, knowledgeCardEvidence, knowledgeCards, knowledgeCardSources, knowledgeSourceSuggestions, messages, sourceCaptureVersions, sources, users } from "@/db/schema";
import { removeKnowledgeSource, withdrawKnowledgeEvidence } from "@/features/knowledge/source-removal";
import { backfillHistoricalAssistantProvenanceWithdrawal, classifyAssistantProvenanceRowsForInsertion, extractHistoricalAnchors, ProvenanceWithdrawalBackfillError } from "../packages/database/src/assistant-provenance-withdrawal";
import { createPostgresPlanningReadRepository } from "@xuyenviet/database";

import { resetTestDatabase, testDb } from "./helpers/db";
import { seedKnowledgeCardEvidence, seedSourceCaptureVersion } from "./helpers/source-captures";

async function source(id: string) {
  await testDb.insert(sources).values({ id, kind: "url", url: `https://example.com/${id}`, canonicalUrl: `https://example.com/${id}`, label: id, sourceType: "curated", verificationStatus: "verified", submittedByUserId: "operator" });
}

async function card(id: string) {
  await testDb.insert(knowledgeCards).values({ id, lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: id, locationName: "Huế", summary: "Điểm dừng hợp lệ.", confidence: "curated", aiPromptVersion: "test", createdByUserId: "operator" });
}

async function provenance(id: string, snapshot: Record<string, unknown>, createdAt = new Date("2026-07-01T00:00:00.000Z"), sourceReference = typeof snapshot.knowledgeCardId === "string" ? { id: snapshot.knowledgeCardId, type: "knowledge_card" } : null) {
  const [conversation] = await testDb.insert(conversations).values({ userId: "operator" }).returning({ id: conversations.id });
  const [question] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "operator", role: "user", content: "Question" }).returning({ id: messages.id });
  const [answer] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "operator", role: "assistant", content: "Answer" }).returning({ id: messages.id });
  await testDb.transaction(async (transaction) => {
    await transaction.execute(sql`select set_config('xuyenviet.provenance_writer_contract', 'v1', true)`);
    await transaction.insert(assistantResponseProvenance).values({ id, userId: "operator", conversationId: conversation.id, userMessageId: question.id, assistantMessageId: answer.id, sourceCategory: "knowledge", sourceReferenceId: sourceReference?.id ?? null, sourceReferenceType: sourceReference?.type ?? null, rank: 1, verificationStatus: "verified", usedInPrompt: true, citedInAnswer: false, sourceSnapshot: snapshot, createdAt });
  });
  return { conversationId: conversation.id, assistantMessageId: answer.id };
}

function knowledgeInsertionRow(sourceReferenceId: string | null, sourceReferenceType: string | null, sourceSnapshot: Record<string, unknown>) {
  return { userId: "operator", conversationId: "conversation", userMessageId: "question", assistantMessageId: "answer", sourceCategory: "knowledge" as const, sourceReferenceId, sourceReferenceType, rank: 1, verificationStatus: "verified" as const, usedInPrompt: true, citedInAnswer: false, sourceSnapshot } satisfies typeof assistantResponseProvenance.$inferInsert;
}

describe("knowledge source removal", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
    await testDb.insert(assistantProvenanceWithdrawalBackfillState).values({ contractKey: "v1", cutoverAt: new Date(), oldWritersQuiescedAt: new Date(), oldWritersAdmission: "old_terminal_evaluation_writers_quiesced_v1", completedAt: new Date() });
  });

  test("withdraws evidence, tombstones payloads, and records the removal atomically", async () => {
    await source("removed-source"); await card("removed-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "removed-card", sourceId: "removed-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "removed-source", captureKind: "url", rawText: "Bằng chứng bị gỡ." });
    await seedKnowledgeCardEvidence({ cardId: "removed-card", sourceId: "removed-source", captureVersionId: capture.id, quoteText: "Bằng chứng bị gỡ." });
    await expect(removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toEqual({ status: "completed", sourceId: "removed-source", changedCardIds: ["removed-card"] });
    await expect(testDb.select({ eligibility: sources.eligibility, removalReason: sources.removalReason, current: sources.currentCaptureVersionId }).from(sources).where(eq(sources.id, "removed-source"))).resolves.toEqual([{ eligibility: "withdrawn", removalReason: "withdrawn", current: null }]);
    await expect(testDb.select({ state: knowledgeCardEvidence.state }).from(knowledgeCardEvidence)).resolves.toEqual([{ state: "removed" }]);
    await expect(testDb.select({ rawText: sourceCaptureVersions.rawText, rawMetadata: sourceCaptureVersions.rawMetadata }).from(sourceCaptureVersions)).resolves.toEqual([{ rawText: null, rawMetadata: null }]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_source_removal"))).resolves.toHaveLength(1);
    await expect(removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "already_completed" });
  });

  test("removes operational source suggestions with the withdrawn source", async () => {
    await source("removed-source");
    await testDb.insert(knowledgeSourceSuggestions).values({ sourceId: "removed-source", action: "no_action", aiPromptVersion: "test", createdByUserId: "operator" });

    await removeKnowledgeSource({ sourceId: "removed-source", reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb);
    await expect(testDb.select().from(knowledgeSourceSuggestions).where(eq(knowledgeSourceSuggestions.sourceId, "removed-source"))).resolves.toEqual([]);
  });

  test("withdraws one evidence and records the operation", async () => {
    await source("evidence-source"); await card("evidence-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "evidence-card", sourceId: "evidence-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "evidence-source", captureKind: "url", rawText: "Evidence withdrawn." });
    const evidence = await seedKnowledgeCardEvidence({ cardId: "evidence-card", sourceId: "evidence-source", captureVersionId: capture.id, quoteText: "Evidence withdrawn." });
    await expect(withdrawKnowledgeEvidence({ evidenceId: evidence.id, reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "completed" });
    await expect(testDb.select({ state: knowledgeCardEvidence.state }).from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.id, evidence.id))).resolves.toEqual([{ state: "removed" }]);
    await expect(withdrawKnowledgeEvidence({ evidenceId: evidence.id, reason: "withdrawn", actor: { userId: "operator", email: "operator@example.com" } }, testDb)).resolves.toMatchObject({ status: "already_completed" });
  });

  test("backfills supported exact anchors and advances the durable checkpoint", async () => {
    await source("backfill-source"); await card("backfill-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "backfill-card", sourceId: "backfill-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "backfill-source", captureKind: "url", rawText: "Backfill evidence." });
    const evidence = await seedKnowledgeCardEvidence({ cardId: "backfill-card", sourceId: "backfill-source", captureVersionId: capture.id, quoteText: "Backfill evidence." });
    const historic = await provenance("backfill-provenance", { knowledgeCardId: "backfill-card", evidence: [{ evidenceId: evidence.id, sourceId: "backfill-source" }] });
    await testDb.update(sources).set({ eligibility: "withdrawn", removalReason: "withdrawn", removedByUserId: "operator", removalCompletedAt: new Date() }).where(eq(sources.id, "backfill-source"));
    await testDb.update(assistantProvenanceWithdrawalBackfillState).set({ cutoverAt: new Date("2026-07-02T00:00:00.000Z"), completedAt: null }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, "v1"));

    await expect(backfillHistoricalAssistantProvenanceWithdrawal({}, testDb)).resolves.toEqual({ status: "progressed", scannedCount: 1 });
    await expect(testDb.select({ availability: assistantResponseProvenance.availability }).from(assistantResponseProvenance)).resolves.toEqual([{ availability: "withdrawn" }]);
    await expect(testDb.select({ cursorId: assistantProvenanceWithdrawalBackfillState.cursorId }).from(assistantProvenanceWithdrawalBackfillState)).resolves.toEqual([{ cursorId: "backfill-provenance" }]);
    await expect(createPostgresPlanningReadRepository().loadOwnedAnswerDetail("operator", historic.conversationId, historic.assistantMessageId)).resolves.toEqual({
      conversationId: historic.conversationId,
      assistantMessageId: historic.assistantMessageId,
      content: "Answer",
      provenance: [{ id: "backfill-provenance", rank: 1, availability: "withdrawn", unavailableLabel: "Nguồn này không còn khả dụng.", usedInPrompt: true, citedInAnswer: false }],
      annotations: [],
    });
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

  test("fails closed when any evidence object lacks an exact anchor despite a valid card anchor", async () => {
    await source("malformed-evidence-source"); await card("malformed-evidence-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "malformed-evidence-card", sourceId: "malformed-evidence-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "malformed-evidence-source", captureKind: "url", rawText: "Malformed evidence anchor." });
    await seedKnowledgeCardEvidence({ cardId: "malformed-evidence-card", sourceId: "malformed-evidence-source", captureVersionId: capture.id, quoteText: "Malformed evidence anchor." });
    await provenance("malformed-evidence-anchor", { knowledgeCardId: "malformed-evidence-card", evidence: [{}] });
    await testDb.update(assistantProvenanceWithdrawalBackfillState).set({ cutoverAt: new Date("2026-07-02T00:00:00.000Z"), completedAt: null }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, "v1"));

    expect(extractHistoricalAnchors({ sourceReferenceId: "malformed-evidence-card", sourceReferenceType: "knowledge_card", sourceSnapshot: { knowledgeCardId: "malformed-evidence-card", evidence: [{}] } })).toBeNull();
    await expect(backfillHistoricalAssistantProvenanceWithdrawal({}, testDb)).resolves.toEqual({ status: "failed", failureCode: "unclassifiable_anchor" });
  });

  test("does not treat non-destructive removed evidence as historic withdrawal", async () => {
    await source("retained-source"); await card("retained-card");
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "retained-card", sourceId: "retained-source", supportLevel: "primary" });
    const capture = await seedSourceCaptureVersion({ sourceId: "retained-source", captureKind: "url", rawText: "Retention trim." });
    const evidence = await seedKnowledgeCardEvidence({ cardId: "retained-card", sourceId: "retained-source", captureVersionId: capture.id, quoteText: "Retention trim." });
    await provenance("retained-provenance", { knowledgeCardId: "retained-card", evidence: [{ evidenceId: evidence.id, sourceId: "retained-source" }] });
    await testDb.update(knowledgeCardEvidence).set({ state: "removed" }).where(eq(knowledgeCardEvidence.id, evidence.id));
    await testDb.update(assistantProvenanceWithdrawalBackfillState).set({ cutoverAt: new Date("2026-07-02T00:00:00.000Z"), completedAt: null }).where(eq(assistantProvenanceWithdrawalBackfillState.contractKey, "v1"));

    await expect(backfillHistoricalAssistantProvenanceWithdrawal({}, testDb)).resolves.toEqual({ status: "progressed", scannedCount: 1 });
    await expect(testDb.select({ availability: assistantResponseProvenance.availability }).from(assistantResponseProvenance).where(eq(assistantResponseProvenance.id, "retained-provenance"))).resolves.toEqual([{ availability: "available" }]);
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
