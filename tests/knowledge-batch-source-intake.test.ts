import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, knowledgeCardSources, knowledgeCards, knowledgeRecommendations, knowledgeSeedBatchItems, knowledgeSeedBatches, knowledgeSourceSuggestions, sourceCaptureVersions, sources, userRoles, users, type KnowledgeCardType, type UserRole } from "@/db/schema";

import { testDb } from "./helpers/db";
import { seedKnowledgeCardEvidence, seedSourceCaptureVersion } from "./helpers/source-captures";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

async function createUser(userId: string, roles: UserRole[] = []) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });

  if (roles.length > 0) {
    await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
  }
}

describe("knowledge batch source intake", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test("operator batch intake persists valid URLs and failed invalid rows without rollback", async () => {
    await createUser("batch-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "batch-operator", email: "batch-operator@example.com" } });
    const { submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/actions");

    const result = await submitKnowledgeSeedUrlBatch({
      urls: "https://example.com/a?utm_source=x&keep=1\nnot-a-url\nhttps://fb.watch/post?fbclid=abc",
      label: "Seed miền Trung",
      publisher: "Curated list",
      collectedDate: "2026-07-08",
    });

    expect(result).toMatchObject({ totalItems: 3, pendingCount: 2, failedCount: 1, duplicateCount: 0 });
    await expect(testDb.select().from(knowledgeSeedBatches).where(eq(knowledgeSeedBatches.id, result.batchId))).resolves.toMatchObject([{ label: "Seed miền Trung" }]);
    await expect(testDb.select().from(sources)).resolves.toHaveLength(2);
    await expect(testDb.select().from(sourceCaptureVersions)).resolves.toHaveLength(0);
    await expect(testDb.select({ currentCaptureVersionId: sources.currentCaptureVersionId }).from(sources)).resolves.toEqual([{ currentCaptureVersionId: null }, { currentCaptureVersionId: null }]);

    const items = await testDb.select().from(knowledgeSeedBatchItems).orderBy(knowledgeSeedBatchItems.lineNumber);
    expect(items).toMatchObject([
      { lineNumber: 1, status: "pending", canonicalUrl: "https://example.com/a?keep=1", errorSummary: null },
      { lineNumber: 2, status: "failed", canonicalUrl: null, sourceId: null },
      { lineNumber: 3, status: "pending", canonicalUrl: "https://fb.watch/post" },
    ]);
    expect(items[1].errorSummary).toContain("URL nguồn không hợp lệ");
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_seed_batch"))).resolves.toHaveLength(1);
  });

  test("canonical duplicates within one batch create one source and a duplicate item", async () => {
    await createUser("duplicate-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "duplicate-operator", email: "duplicate-operator@example.com" } });
    const { submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/actions");

    const result = await submitKnowledgeSeedUrlBatch({ urls: "https://example.com/a?utm_campaign=x&b=2\nhttps://example.com/a?b=2" });

    expect(result).toMatchObject({ totalItems: 2, pendingCount: 1, failedCount: 0, duplicateCount: 1 });
    await expect(testDb.select().from(sources)).resolves.toHaveLength(1);
    const items = await testDb.select().from(knowledgeSeedBatchItems).orderBy(knowledgeSeedBatchItems.lineNumber);
    expect(items).toMatchObject([
      { lineNumber: 1, status: "pending", canonicalUrl: "https://example.com/a?b=2" },
      { lineNumber: 2, status: "duplicate", canonicalUrl: "https://example.com/a?b=2", sourceId: null },
    ]);
    expect(items[1].errorSummary).toContain("URL trùng trong cùng batch");
  });

  test("batch intake accepts and canonicalizes individual YouTube videos", async () => {
    await createUser("youtube-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "youtube-operator", email: "youtube-operator@example.com" } });
    const { submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/actions");

    const result = await submitKnowledgeSeedUrlBatch({ urls: "https://youtu.be/abcDEF12345?si=tracking" });

    expect(result).toMatchObject({ totalItems: 1, pendingCount: 1, failedCount: 0, duplicateCount: 0 });
    await expect(testDb.select().from(sources)).resolves.toMatchObject([
      { kind: "youtube", url: "https://www.youtube.com/watch?v=abcDEF12345", sourceType: "community" },
    ]);
    await expect(testDb.select().from(knowledgeSeedBatchItems)).resolves.toMatchObject([
      { canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", status: "pending" },
    ]);
  });

  test("recent batch listing derives later statuses from linked cards and suggestion traces", async () => {
    await createUser("status-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "status-operator", email: "status-operator@example.com" } });
    const { listRecentKnowledgeSeedBatches, submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/batch-intake");

    await submitKnowledgeSeedUrlBatch({ urls: "https://example.com/draft\nhttps://example.com/approved\nhttps://example.com/duplicate" });
    const items = await testDb.select().from(knowledgeSeedBatchItems).orderBy(knowledgeSeedBatchItems.lineNumber);
    const draftSourceId = items[0].sourceId ?? "";
    const approvedSourceId = items[1].sourceId ?? "";
    const duplicateSourceId = items[2].sourceId ?? "";

    const [draftCard] = await testDb
      .insert(knowledgeCards)
      .values({
        id: "draft-card",
        status: "draft",
        type: "place",
        title: "Điểm dừng cần duyệt",
        locationName: "Đà Nẵng",
        summary: "Bản nháp cần vận hành duyệt.",
        confidence: "unverified",
        aiPromptVersion: "test",
        createdByUserId: "status-operator",
      })
      .returning({ id: knowledgeCards.id });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: draftCard.id, sourceId: draftSourceId, supportLevel: "primary" });

    const [approvedCard] = await testDb
      .insert(knowledgeCards)
      .values({
        id: "approved-card",
        status: "approved",
        needsReview: false,
        type: "place",
        title: "Điểm đã duyệt",
        locationName: "Huế",
        summary: "Thẻ đã được duyệt.",
        confidence: "curated",
        aiPromptVersion: "test",
        createdByUserId: "status-operator",
      })
      .returning({ id: knowledgeCards.id });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: approvedCard.id, sourceId: approvedSourceId, supportLevel: "primary" });
    await testDb.insert(knowledgeSourceSuggestions).values({
      sourceId: duplicateSourceId,
      action: "duplicate",
      targetCardId: approvedCard.id,
      rationale: "Nguồn trùng nội dung hiện có.",
      aiPromptVersion: "test",
      createdByUserId: "status-operator",
    });

    const [batch] = await listRecentKnowledgeSeedBatches();
    expect(batch.items.map((item) => item.status)).toEqual(["needs_review", "needs_review", "duplicate"]);
    expect(batch.counts).toMatchObject({ needs_review: 2, approved: 0, duplicate: 1, pending: 0, reading: 0 });
    expect(batch.items[0]).not.toHaveProperty("rawText");

    const persistedItems = await testDb.select().from(knowledgeSeedBatchItems).orderBy(knowledgeSeedBatchItems.lineNumber);
    expect(persistedItems.map((item) => item.status)).toEqual(["needs_review", "needs_review", "duplicate"]);
  });

  test("recent batch listing marks captured YouTube evidence as reading", async () => {
    await createUser("youtube-status-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "youtube-status-operator", email: "youtube-status-operator@example.com" } });
    const { listRecentKnowledgeSeedBatches, submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/batch-intake");

    await submitKnowledgeSeedUrlBatch({ urls: "https://www.youtube.com/watch?v=abcDEF12345" });
    const [item] = await testDb.select().from(knowledgeSeedBatchItems);
    await seedSourceCaptureVersion({ sourceId: item!.sourceId!, captureKind: "youtube", rawText: '{"evidence":[]}', rawMetadata: { kind: "youtube", captureMethod: "gemini_youtube_url" } });

    const [batch] = await listRecentKnowledgeSeedBatches();

    expect(batch.items).toMatchObject([{ sourceId: item!.sourceId, status: "reading" }]);
    await expect(testDb.select().from(knowledgeSeedBatchItems)).resolves.toMatchObject([{ id: item!.id, status: "reading" }]);
  });

  test("batch intake handles carriage-return lines and oversized URLs as item failures", async () => {
    await createUser("edge-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "edge-operator", email: "edge-operator@example.com" } });
    const { submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/actions");
    const oversizedUrl = `https://example.com/${"x".repeat(2050)}`;

    const result = await submitKnowledgeSeedUrlBatch({ urls: `https://example.com/a\r${oversizedUrl}` });

    expect(result).toMatchObject({ totalItems: 2, pendingCount: 1, failedCount: 1 });
    await expect(testDb.select().from(sources)).resolves.toHaveLength(1);
    const items = await testDb.select().from(knowledgeSeedBatchItems).orderBy(knowledgeSeedBatchItems.lineNumber);
    expect(items).toMatchObject([
      { lineNumber: 1, status: "pending", canonicalUrl: "https://example.com/a" },
      { lineNumber: 2, status: "failed", canonicalUrl: null, sourceId: null },
    ]);
    expect(items[1].errorSummary).toContain("URL nguồn quá dài");
  });

  test("traveler is denied before parsing, validation, inserts, or audit", async () => {
    await createUser("batch-traveler", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "batch-traveler", email: "batch-traveler@example.com" } });
    const { submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/actions");

    await expect(submitKnowledgeSeedUrlBatch({ urls: "not-a-url" })).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(testDb.select().from(knowledgeSeedBatches)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeSeedBatchItems)).resolves.toHaveLength(0);
    await expect(testDb.select().from(sources)).resolves.toHaveLength(0);
    await expect(testDb.select().from(sourceCaptureVersions)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("operator coverage counts only active current evidence and separately reports caveats and version-current work", async () => {
    await createUser("progress-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "progress-operator", email: "progress-operator@example.com" } });
    const { getActiveEvidenceGroundedSeedCoverage, submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/batch-intake");

    await submitKnowledgeSeedUrlBatch({ urls: "https://example.com/hue-food\nhttps://example.com/needs-review\nhttps://example.com/dalat\nhttps://example.com/duplicate" });
    const items = await testDb.select().from(knowledgeSeedBatchItems).orderBy(knowledgeSeedBatchItems.lineNumber);
    const [eligibleItem, needsReviewItem, nonCorridorItem, duplicateItem] = items;

    await insertCardWithOptionalSource({ id: "eligible-hue-food", sourceId: eligibleItem!.sourceId, status: "approved", needsReview: false, type: "food", locationName: "Huế", routeSegment: "Hà Nội - TP.HCM", knowledgeState: "community_observation" });
    await insertCardWithOptionalSource({ id: "ineligible-needs-review", sourceId: needsReviewItem!.sourceId, status: "approved", needsReview: true, type: "place", locationName: "Đà Nẵng", knowledgeState: "uncertain", reviewState: "ai_recommended", verificationState: "required" });
    await insertCardWithOptionalSource({ id: "ineligible-non-corridor", sourceId: nonCorridorItem!.sourceId, status: "approved", needsReview: false, type: "place", locationName: "Vinhomes Central Park" });
    await insertCardWithOptionalSource({ id: "source-orphan-hanoi", sourceId: null, status: "approved", needsReview: false, type: "warning", locationName: "Hà Nội" });
    await insertCardWithOptionalSource({ id: "archived-danang", sourceId: null, status: "archived", needsReview: false, type: "route_note", locationName: "Đà Nẵng" });
    await testDb.insert(knowledgeSourceSuggestions).values({
      sourceId: duplicateItem!.sourceId ?? "",
      action: "duplicate",
      targetCardId: "eligible-hue-food",
      rationale: "Nguồn trùng nội dung hiện có.",
      aiPromptVersion: "test",
      createdByUserId: "progress-operator",
    });
    const eligibleCapture = await seedSourceCaptureVersion({ sourceId: eligibleItem!.sourceId!, captureKind: "url", rawText: "Evidence Huế đã xác minh." });
    await seedKnowledgeCardEvidence({ cardId: "eligible-hue-food", sourceId: eligibleItem!.sourceId!, captureVersionId: eligibleCapture.id, quoteText: "Evidence Huế đã xác minh." });
    const caveatCapture = await seedSourceCaptureVersion({ sourceId: needsReviewItem!.sourceId!, captureKind: "url", rawText: "Cần kiểm tra tình trạng trước khi đi." });
    await seedKnowledgeCardEvidence({ cardId: "ineligible-needs-review", sourceId: needsReviewItem!.sourceId!, captureVersionId: caveatCapture.id, quoteText: "Cần kiểm tra tình trạng trước khi đi." });
    await testDb.insert(knowledgeRecommendations).values([
      { knowledgeCardId: "eligible-hue-food", contentVersion: 1, evidenceSetRevision: 1, reason: "freshness", priority: 5 },
      { knowledgeCardId: "eligible-hue-food", contentVersion: 2, evidenceSetRevision: 1, reason: "risk", priority: 1 },
    ]);

    const progress = await getActiveEvidenceGroundedSeedCoverage();

    expect(progress).toMatchObject({ targetActiveCards: 100, activeEvidenceGroundedCards: 1, remainingActiveCards: 99, isComplete: false, activeCommunityObservations: 1, activeCommunityPatterns: 0, caveatOnlyHighRiskCards: 1, pendingReviewCards: 1, pendingVerificationCards: 1 });
    expect(progress.actionableWork).toEqual([{ reason: "freshness", priority: 5, count: 1 }]);
    expect(progress.byType.find((item) => item.type === "food")).toEqual({ type: "food", count: 1 });
    expect(progress.byType.find((item) => item.type === "place")).toEqual({ type: "place", count: 0 });
    expect(progress.byRouteOrLocation.find((item) => item.routeOrLocation === "Huế")).toEqual({ routeOrLocation: "Huế", count: 1 });
    expect(progress.byRouteOrLocation.find((item) => item.routeOrLocation === "Hà Nội")).toEqual({ routeOrLocation: "Hà Nội", count: 0 });
    expect(progress.byRouteOrLocation.find((item) => item.routeOrLocation === "Nha Trang / Khánh Hòa")).toEqual({ routeOrLocation: "Nha Trang / Khánh Hòa", count: 0 });
    expect(JSON.stringify(progress)).not.toContain("raw");
    expect(JSON.stringify(progress)).not.toContain("submittedUrl");
    expect(JSON.stringify(progress)).not.toContain("quoteText");
  });

  test("coverage excludes withdrawn sources, tombstoned captures, removed evidence, and incomplete current cards", async () => {
    await createUser("coverage-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "coverage-operator", email: "coverage-operator@example.com" } });
    const { getActiveEvidenceGroundedSeedCoverage, submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/batch-intake");

    await submitKnowledgeSeedUrlBatch({ urls: "https://example.com/withdrawn\nhttps://example.com/tombstone\nhttps://example.com/removed\nhttps://example.com/incomplete" });
    const items = await testDb.select().from(knowledgeSeedBatchItems).orderBy(knowledgeSeedBatchItems.lineNumber);
    for (const [index, item] of items.entries()) {
      const id = ["withdrawn", "tombstone", "removed", "incomplete"][index]!;
      await insertCardWithOptionalSource({ id, sourceId: item!.sourceId, status: "approved", needsReview: false, type: "place", locationName: "Đà Nẵng", knowledgeState: "community_observation", createdByUserId: "coverage-operator" });
      if (id !== "incomplete") {
        const capture = await seedSourceCaptureVersion({ sourceId: item!.sourceId!, captureKind: "url", rawText: `Evidence ${id}.` });
        await seedKnowledgeCardEvidence({ cardId: id, sourceId: item!.sourceId!, captureVersionId: capture.id, quoteText: `Evidence ${id}.`, state: id === "removed" ? "removed" : "active" });
        if (id === "tombstone") await testDb.update(sourceCaptureVersions).set({ rawText: null, rawMetadata: null, payloadDeletedAt: new Date() }).where(eq(sourceCaptureVersions.id, capture.id));
      }
    }
    await testDb.update(sources).set({ eligibility: "withdrawn", removalReason: "removed", removedByUserId: "coverage-operator", removalCompletedAt: new Date() }).where(eq(sources.id, items[0]!.sourceId!));

    await expect(getActiveEvidenceGroundedSeedCoverage()).resolves.toMatchObject({ activeEvidenceGroundedCards: 0 });
  });

  test("traveler cannot read active evidence-grounded seed coverage", async () => {
    await createUser("progress-operator-denied", ["operator"]);
    await createUser("progress-traveler", ["traveler"]);
    authMock.mockResolvedValueOnce({ user: { id: "progress-operator-denied", email: "progress-operator-denied@example.com" } });
    const { getActiveEvidenceGroundedSeedCoverage, submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/batch-intake");

    await submitKnowledgeSeedUrlBatch({ urls: "https://example.com/hanoi" });
    const [item] = await testDb.select().from(knowledgeSeedBatchItems);
    await insertCardWithOptionalSource({ id: "denied-approved-card", sourceId: item!.sourceId, status: "approved", needsReview: false, type: "place", locationName: "Hà Nội", createdByUserId: "progress-operator-denied" });
    authMock.mockResolvedValue({ user: { id: "progress-traveler", email: "progress-traveler@example.com" } });

    await expect(getActiveEvidenceGroundedSeedCoverage()).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(testDb.select().from(knowledgeSeedBatchItems)).resolves.toMatchObject([{ status: "pending" }]);
  });

  test("batch cap fails closed with no side effects", async () => {
    await createUser("cap-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "cap-operator", email: "cap-operator@example.com" } });
    const { submitKnowledgeSeedUrlBatch } = await import("@/features/knowledge/actions");
    const urls = Array.from({ length: 51 }, (_, index) => `https://example.com/${index}`).join("\n");

    await expect(submitKnowledgeSeedUrlBatch({ urls })).rejects.toThrow("tối đa 50 URL");
    await expect(testDb.select().from(knowledgeSeedBatches)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeSeedBatchItems)).resolves.toHaveLength(0);
    await expect(testDb.select().from(sources)).resolves.toHaveLength(0);
  });

  test("database rejects invalid batch item constraints", async () => {
    await createUser("constraint-operator", ["operator"]);
    await testDb.execute(sql`insert into knowledge_seed_batches (id, submitted_by_user_id) values ('constraint-batch', 'constraint-operator')`);

    await expect(
      testDb.execute(sql`insert into knowledge_seed_batch_items (id, batch_id, line_number, submitted_url, status) values ('bad-status', 'constraint-batch', 1, 'https://example.com', 'unknown')`),
    ).rejects.toThrow();

    await expect(
      testDb.execute(sql`insert into knowledge_seed_batch_items (id, batch_id, line_number, submitted_url, status) values ('bad-failed', 'constraint-batch', 1, 'https://example.com', 'failed')`),
    ).rejects.toThrow();

    await expect(
      testDb.execute(sql`insert into knowledge_seed_batch_items (id, batch_id, line_number, submitted_url, status) values ('bad-source-shape', 'constraint-batch', 2, 'https://example.com', 'pending')`),
    ).rejects.toThrow();
  });
});

async function insertCardWithOptionalSource(input: {
  id: string;
  sourceId: string | null | undefined;
  status: "draft" | "approved" | "archived" | "rejected" | "duplicate" | "no_action";
  needsReview: boolean;
  type: KnowledgeCardType;
  locationName?: string | null;
  routeSegment?: string | null;
  createdByUserId?: string;
  knowledgeState?: "community_observation" | "community_pattern" | "conditional" | "uncertain" | "conflicted" | "confirmed" | "superseded";
  reviewState?: "none" | "ai_recommended" | "in_review" | "reviewed";
  verificationState?: "not_required" | "required" | "corroborated" | "failed";
}) {
  await testDb.insert(knowledgeCards).values({
    id: input.id,
    status: input.status,
    needsReview: input.needsReview,
    publicationState: input.status === "approved" ? "active" : undefined,
    knowledgeState: input.status === "approved" ? input.knowledgeState ?? "uncertain" : undefined,
    reviewState: input.status === "approved" ? input.reviewState ?? "reviewed" : undefined,
    verificationState: input.status === "approved" ? input.verificationState ?? "not_required" : undefined,
    type: input.type,
    title: input.id,
    locationName: input.locationName ?? null,
    routeSegment: input.routeSegment ?? null,
    summary: "Thẻ kiểm thử cho tiến độ seed corridor.",
    confidence: "curated",
    aiPromptVersion: "test",
    createdByUserId: input.createdByUserId ?? "progress-operator",
  });

  if (input.sourceId) {
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: input.id, sourceId: input.sourceId, supportLevel: "primary" });
  }
}
