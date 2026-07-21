import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, facebookCaptureReviews, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sourceCaptureVersions, sources, users } from "@/db/schema";
import { sourceKnowledgeDraftExtractionPromptVersion } from "@/features/ai/prompts";
import {
  ensureFacebookCaptureReviewForCapturedSource,
  getExistingCardsForCaptureSource,
  listFacebookCaptureReviews,
  markFacebookCaptureReviewStatus,
  markFacebookCaptureReviewStatusInTransaction,
  reopenFacebookCaptureForRecapture,
  requestFacebookCaptureRecapture,
} from "@/features/knowledge/facebook-capture-review";
import { listQueuedFacebookSources, updateQueuedFacebookSourceRawText } from "@/features/knowledge/facebook-capture";
import { lockFacebookCaptureResources } from "@/features/knowledge/facebook-capture-locks";

import { resetTestDatabase, testDb } from "./helpers/db";
import { seedSourceCaptureVersion } from "./helpers/source-captures";

async function createOperator(id = "operator-user") {
  await testDb.insert(users).values({ id, email: `${id}@example.com` });
}

async function createSource(input: { id: string; kind?: "facebook" | "url" | "pasted_text"; rawText?: string | null; rawMetadata?: Record<string, unknown> }) {
  const kind = input.kind ?? "facebook";

  await testDb.insert(sources).values({
    id: input.id,
    kind,
    url: kind === "pasted_text" ? null : `https://facebook.com/groups/xuyenviet/posts/${input.id}`,
    canonicalUrl: kind === "pasted_text" ? null : `https://facebook.com/groups/xuyenviet/posts/${input.id}`,
    label: `Source ${input.id}`,
    sourceType: kind === "facebook" ? "community" : "curated",
    verificationStatus: "unverified",
    official: false,
    partner: false,
    submittedByUserId: "operator-user",
  });

  await testDb.insert(rawSourceMaterial).values({
    id: `raw-${input.id}`,
    sourceId: input.id,
    rawText: null,
    rawMetadata: input.rawMetadata,
  });
  if (input.rawText) {
    await seedSourceCaptureVersion({
      sourceId: input.id,
      rawText: input.rawText,
      rawMetadata: input.rawMetadata,
      captureKind: kind,
    });
  }
}

describe("Facebook capture review state", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await createOperator();
  });

  test("capture update creates an initial needs_review row atomically", async () => {
    await createSource({ id: "captured-facebook", rawText: null });

    const result = await updateQueuedFacebookSourceRawText(testDb, {
      sourceId: "captured-facebook",
      rawText: "Nội dung Facebook đã capture để admin duyệt.",
      captureMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-13T00:00:00.000Z",
        sourceUrl: "https://facebook.com/groups/xuyenviet/posts/captured-facebook",
        finalUrl: "https://facebook.com/groups/xuyenviet/posts/captured-facebook",
      },
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      now: new Date("2026-07-13T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "updated", rawMaterialId: "raw-captured-facebook", captureVersionId: expect.any(String) });
    await expect(testDb.select().from(facebookCaptureReviews)).resolves.toMatchObject([
      {
        sourceId: "captured-facebook",
        rawSourceMaterialId: "raw-captured-facebook",
        captureVersionId: result.captureVersionId,
        status: "needs_review",
        reviewerUserId: null,
        reviewedAt: null,
      },
    ]);
  });

  test("review creation is idempotent and rejects non-reviewable sources", async () => {
    await createSource({ id: "ready-facebook", rawText: "Captured text" });
    await createSource({ id: "not-captured-facebook", rawText: null });
    await createSource({ id: "regular-url", kind: "url", rawText: "URL raw text" });

    await expect(ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "ready-facebook", rawSourceMaterialId: "raw-ready-facebook" })).resolves.toMatchObject({
      status: "created",
      review: { sourceId: "ready-facebook", status: "needs_review" },
    });
    await expect(ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "ready-facebook", rawSourceMaterialId: "raw-ready-facebook" })).resolves.toMatchObject({
      status: "exists",
      review: { sourceId: "ready-facebook", status: "needs_review" },
    });
    await expect(ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "not-captured-facebook", rawSourceMaterialId: "raw-not-captured-facebook" })).resolves.toMatchObject({ status: "not_reviewable" });
    await expect(ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "regular-url", rawSourceMaterialId: "raw-regular-url" })).resolves.toMatchObject({ status: "not_reviewable" });
    await expect(testDb.select().from(facebookCaptureReviews)).resolves.toHaveLength(1);
  });

  test("lists captures by explicit review status without raw metadata filtering", async () => {
    await createSource({ id: "needs-review", rawText: "Captured A", rawMetadata: { captureMethod: "playwright_operator_browser" } });
    await createSource({ id: "failed-review", rawText: "Captured B", rawMetadata: { captureMethod: "not-used-for-filter" } });
    const first = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "needs-review", rawSourceMaterialId: "raw-needs-review", now: new Date("2026-07-13T00:00:00.000Z") });
    const second = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "failed-review", rawSourceMaterialId: "raw-failed-review", now: new Date("2026-07-13T00:00:00.000Z") });
    if (first.status !== "created" || second.status !== "created") throw new Error("test setup failed");
    await markFacebookCaptureReviewStatus(testDb, { reviewId: second.review.id, status: "extraction_failed", actor: { userId: "operator-user", email: "operator-user@example.com" }, extractionError: "Model unavailable", now: new Date("2026-07-13T01:00:00.000Z") });

    await expect(listFacebookCaptureReviews(testDb, { status: "needs_review" })).resolves.toMatchObject([
      {
        sourceId: "needs-review",
        status: "needs_review",
        captureMethod: "playwright_operator_browser",
        existingCards: [],
      },
    ]);
    await expect(listFacebookCaptureReviews(testDb, { status: "extraction_failed" })).resolves.toMatchObject([{ sourceId: "failed-review", status: "extraction_failed" }]);
  });

  test("model-unavailable extraction failures can mark needs-review captures as failed", async () => {
    await createSource({ id: "model-unavailable-review", rawText: "Captured text for extraction failure recovery." });
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "model-unavailable-review", rawSourceMaterialId: "raw-model-unavailable-review", now: new Date("2026-07-13T08:37:53.462Z") });
    if (ensured.status !== "created") throw new Error("test setup failed");

    await expect(
      markFacebookCaptureReviewStatus(testDb, {
        reviewId: ensured.review.id,
        status: "extraction_failed",
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        extractionError: "Extraction failed: model_unavailable",
        now: new Date("2026-07-13T08:47:58.514Z"),
      }),
    ).resolves.toMatchObject({ status: "updated", review: { status: "extraction_failed", rejectionReason: null, extractionError: "Extraction failed: model_unavailable" } });
  });

  test("status transitions do not write timestamps before review creation", async () => {
    await createSource({ id: "future-created-review", rawText: "Captured text for future-created review." });
    const createdAt = new Date("2026-07-13T09:41:36.669Z");
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "future-created-review", rawSourceMaterialId: "raw-future-created-review", now: createdAt });
    if (ensured.status !== "created") throw new Error("test setup failed");

    const result = await markFacebookCaptureReviewStatus(testDb, {
      reviewId: ensured.review.id,
      status: "extraction_failed",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      extractionError: "Extraction failed: invalid_model_output",
      now: new Date("2026-07-13T09:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "updated", review: { status: "extraction_failed" } });
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, ensured.review.id))).resolves.toMatchObject([
      { status: "extraction_failed", reviewedAt: createdAt, updatedAt: createdAt },
    ]);
  });

  test("status transitions retain created_at microseconds when an explicit clock is earlier", async () => {
    await createSource({ id: "microsecond-created-review", rawText: "Captured text for timestamp precision." });
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "microsecond-created-review", rawSourceMaterialId: "raw-microsecond-created-review" });
    if (ensured.status !== "created") throw new Error("test setup failed");
    await testDb.execute(sql`update ${facebookCaptureReviews} set created_at = '2026-07-13 09:41:36.669321', updated_at = '2026-07-13 09:41:36.669321' where ${facebookCaptureReviews.id} = ${ensured.review.id}`);

    await expect(markFacebookCaptureReviewStatus(testDb, {
      reviewId: ensured.review.id,
      status: "extraction_failed",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      extractionError: "Extraction failed: invalid_model_output",
      now: new Date("2026-07-13T09:41:36.669Z"),
    })).resolves.toMatchObject({
      status: "updated",
      review: { reviewedAt: new Date("2026-07-13T09:41:36.669Z"), updatedAt: new Date("2026-07-13T09:41:36.669Z") },
    });
    await expect(testDb.select({
      updatedAt: sql<string>`to_char(${facebookCaptureReviews.updatedAt}, 'YYYY-MM-DD HH24:MI:SS.US')`,
      reviewedAt: sql<string>`to_char(${facebookCaptureReviews.reviewedAt}, 'YYYY-MM-DD HH24:MI:SS.US')`,
    }).from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, ensured.review.id))).resolves.toEqual([
      { updatedAt: "2026-07-13 09:41:36.669321", reviewedAt: "2026-07-13 09:41:36.669321" },
    ]);
  });

  test("status transitions store safe reviewer metadata and audit without raw captured text", async () => {
    await createSource({ id: "transition-facebook", rawText: "Raw Facebook text that must not be copied into audit." });
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "transition-facebook", rawSourceMaterialId: "raw-transition-facebook", now: new Date("2026-07-13T00:00:00.000Z") });
    if (ensured.status !== "created") throw new Error("test setup failed");

    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: ensured.review.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Wrong visible post content",
      now: new Date("2026-07-13T02:00:00.000Z"),
    });

    const [review] = await testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, ensured.review.id));
    expect(review).toMatchObject({ status: "rejected", reviewerUserId: "operator-user", rejectionReason: "Wrong visible post content", extractionError: null });
    expect(review.reviewedAt?.toISOString()).toBe("2026-07-13T02:00:00.000Z");

    const audits = await testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "facebook_capture_review"));
    expect(audits).toHaveLength(1);
    expect(audits[0].afterSummary).toContain("needs_review -> rejected");
    expect(audits[0].afterSummary).not.toContain("Raw Facebook text");

    await expect(
      markFacebookCaptureReviewStatus(testDb, {
        reviewId: ensured.review.id,
        status: "extraction_failed",
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        extractionError: "Follow-up failure",
      }),
    ).resolves.toMatchObject({ status: "invalid_transition", currentStatus: "rejected" });
  });

  test("status transitions reenter an already-held source advisory lock", async () => {
    await createSource({ id: "reentrant-status-lock", rawText: "Captured Facebook text for status transition." });
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "reentrant-status-lock", rawSourceMaterialId: "raw-reentrant-status-lock" });
    if (ensured.status !== "created") throw new Error("test setup failed");

    await expect(testDb.transaction(async (transaction) => {
      await lockFacebookCaptureResources(transaction, { sourceId: "reentrant-status-lock" });
      return markFacebookCaptureReviewStatusInTransaction(transaction, {
        reviewId: ensured.review.id,
        status: "rejected",
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        rejectionReason: "Wrong visible post content",
      });
    })).resolves.toMatchObject({ status: "updated", review: { status: "rejected" } });
  });

  test("transition summaries reject captured raw text overlap", async () => {
    await createSource({ id: "raw-leak-facebook", rawText: "This captured Facebook paragraph should never move into audit summaries." });
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "raw-leak-facebook", rawSourceMaterialId: "raw-raw-leak-facebook" });
    if (ensured.status !== "created") throw new Error("test setup failed");

    await expect(
      markFacebookCaptureReviewStatus(testDb, {
        reviewId: ensured.review.id,
        status: "rejected",
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        rejectionReason: "captured Facebook paragraph should never move into audit",
      }),
    ).rejects.toThrow("rejectionReason must be a short safe summary.");
  });

  test("reopen preserves rejected capture versions, audits safely, and allows controlled recapture", async () => {
    await createSource({
      id: "recapture-facebook",
      rawText: "Rejected raw Facebook text that must not survive recapture reopen.",
      rawMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-13T00:00:00.000Z",
        finalUrl: "https://m.facebook.com/groups/xuyenviet/posts/recapture-facebook",
      },
    });
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "recapture-facebook", rawSourceMaterialId: "raw-recapture-facebook", now: new Date("2026-07-13T00:00:00.000Z") });
    if (ensured.status !== "created") throw new Error("test setup failed");
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: ensured.review.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Wrong visible post content",
      now: new Date("2026-07-13T01:00:00.000Z"),
    });

    await expect(
      reopenFacebookCaptureForRecapture(testDb, {
        reviewId: ensured.review.id,
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        reason: "Capture script selected incomplete text",
        now: new Date("2026-07-13T02:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ status: "updated", review: { status: "needs_review", sourceId: "recapture-facebook", rawSourceMaterialId: "raw-recapture-facebook" } });

    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, "recapture-facebook"))).resolves.toMatchObject([
      {
        sourceId: "recapture-facebook",
        rawText: "Rejected raw Facebook text that must not survive recapture reopen.",
      },
    ]);
    await expect(listQueuedFacebookSources(testDb, { sourceId: "recapture-facebook" })).resolves.toMatchObject([{ sourceId: "recapture-facebook", rawMaterialId: "raw-recapture-facebook" }]);
    await expect(listFacebookCaptureReviews(testDb, { status: "needs_review" })).resolves.toEqual([]);
    await expect(
      markFacebookCaptureReviewStatus(testDb, {
        reviewId: ensured.review.id,
        status: "rejected",
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        rejectionReason: "Still missing captured text",
      }),
    ).resolves.toMatchObject({ status: "missing_raw_text" });

    await expect(
      updateQueuedFacebookSourceRawText(testDb, {
        sourceId: "recapture-facebook",
        rawText: "New controlled recapture text for operator review.",
        captureMetadata: {
          captureMethod: "playwright_operator_browser",
          capturedAt: "2026-07-13T03:00:00.000Z",
          sourceUrl: "https://facebook.com/groups/xuyenviet/posts/recapture-facebook",
          finalUrl: "https://m.facebook.com/groups/xuyenviet/posts/recapture-facebook",
        },
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        now: new Date("2026-07-13T03:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ status: "updated", rawMaterialId: "raw-recapture-facebook", reviewId: ensured.review.id });
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, ensured.review.id))).resolves.toMatchObject([{ status: "needs_review", rejectionReason: null, extractionError: null }]);
    await expect(listFacebookCaptureReviews(testDb, { status: "needs_review" })).resolves.toMatchObject([{ sourceId: "recapture-facebook", status: "needs_review" }]);

    const audits = await testDb.select().from(auditEvents).where(eq(auditEvents.targetId, ensured.review.id));
    expect(audits.some((audit) => audit.afterSummary?.includes("rejected -> recapture-ready"))).toBe(true);
    expect(JSON.stringify(audits)).not.toContain("Rejected raw Facebook text");
  });

  test("reopen only accepts rejected captures and safe short reasons", async () => {
    await createSource({ id: "not-rejected", rawText: "Captured text" });
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "not-rejected", rawSourceMaterialId: "raw-not-rejected" });
    if (ensured.status !== "created") throw new Error("test setup failed");

    await expect(
      reopenFacebookCaptureForRecapture(testDb, {
        reviewId: ensured.review.id,
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        reason: "Capture script selected incomplete text",
      }),
    ).resolves.toMatchObject({ status: "invalid_transition", currentStatus: "needs_review" });

    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: ensured.review.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Wrong visible post content",
      now: new Date("2026-07-14T14:00:00.000Z"),
    });

    await expect(
      reopenFacebookCaptureForRecapture(testDb, {
        reviewId: ensured.review.id,
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        reason: "cookie token provider_payload",
      }),
    ).rejects.toThrow("reopenReason must be a short safe summary.");
  });

  test("direct recapture clears raw text from actionable captures without requiring rejection", async () => {
    await createSource({
      id: "direct-recapture-facebook",
      rawText: "Captured text with missing visible characters should be replaced.",
      rawMetadata: { captureMethod: "playwright_operator_browser", capturedAt: "2026-07-13T00:00:00.000Z" },
    });
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "direct-recapture-facebook", rawSourceMaterialId: "raw-direct-recapture-facebook", now: new Date("2026-07-13T00:00:00.000Z") });
    if (ensured.status !== "created") throw new Error("test setup failed");

    await expect(
      requestFacebookCaptureRecapture(testDb, {
        reviewId: ensured.review.id,
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        reason: "Capture text lost characters",
        now: new Date("2026-07-13T01:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ status: "updated", review: { status: "needs_review", sourceId: "direct-recapture-facebook" } });

    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, "direct-recapture-facebook"))).resolves.toMatchObject([{ rawText: "Captured text with missing visible characters should be replaced." }]);
    await expect(listQueuedFacebookSources(testDb, { sourceId: "direct-recapture-facebook" })).resolves.toMatchObject([{ sourceId: "direct-recapture-facebook", rawMaterialId: "raw-direct-recapture-facebook" }]);
    await expect(listFacebookCaptureReviews(testDb, { status: "needs_review" })).resolves.toEqual([]);

    const audits = await testDb.select().from(auditEvents).where(eq(auditEvents.targetId, ensured.review.id));
    expect(audits.some((audit) => audit.afterSummary?.includes("needs_review -> recapture-ready"))).toBe(true);
    expect(JSON.stringify(audits)).not.toContain("Captured text with missing visible characters");
  });

  test("rejects a normal capture flush that became stale after an operator requests recapture", async () => {
    await createSource({ id: "stale-normal-flush", rawText: null });

    const [queued] = await listQueuedFacebookSources(testDb, { sourceId: "stale-normal-flush" });
    expect(queued).toMatchObject({ forceLiveCapture: false, forceLiveCaptureGeneration: 0 });
    const [review] = await testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.sourceId, queued.sourceId));

    await expect(requestFacebookCaptureRecapture(testDb, {
      reviewId: review.id,
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      reason: "Capture must be refreshed live",
    })).resolves.toMatchObject({ status: "updated", review: { forceLiveCapture: true, forceLiveCaptureGeneration: 1 } });

    await expect(updateQueuedFacebookSourceRawText(testDb, {
      sourceId: queued.sourceId,
      rawText: "Stale normal cache payload must not be written.",
      captureMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-17T00:00:00.000Z",
        sourceUrl: "https://facebook.com/groups/xuyenviet/posts/stale-normal-flush",
        finalUrl: "https://facebook.com/groups/xuyenviet/posts/stale-normal-flush",
      },
      expectedForceLiveCapture: queued.forceLiveCapture,
      expectedForceLiveCaptureGeneration: queued.forceLiveCaptureGeneration,
    })).resolves.toEqual({ status: "no_longer_queued" });

    await expect(testDb.select({ rawText: sourceCaptureVersions.rawText }).from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, queued.sourceId))).resolves.toEqual([]);
    await expect(testDb.select({ forceLiveCapture: facebookCaptureReviews.forceLiveCapture, forceLiveCaptureGeneration: facebookCaptureReviews.forceLiveCaptureGeneration }).from(facebookCaptureReviews).where(eq(facebookCaptureReviews.sourceId, queued.sourceId))).resolves.toEqual([{ forceLiveCapture: true, forceLiveCaptureGeneration: 1 }]);
  });

  test("direct recapture blocks already extracted captures", async () => {
    await createSource({ id: "direct-recapture-extracted", rawText: "Captured text already has extraction cards." });
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "direct-recapture-extracted", rawSourceMaterialId: "raw-direct-recapture-extracted" });
    if (ensured.status !== "created") throw new Error("test setup failed");
    await testDb.insert(knowledgeCards).values({ id: "direct-recapture-card", status: "draft", type: "route_note", title: "Existing extraction", routeSegment: "Huế - Đà Nẵng", summary: "Existing extracted card.", confidence: "community", aiPromptVersion: sourceKnowledgeDraftExtractionPromptVersion, createdByUserId: "operator-user" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "direct-recapture-card", sourceId: "direct-recapture-extracted" });

    await expect(
      requestFacebookCaptureRecapture(testDb, {
        reviewId: ensured.review.id,
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        reason: "Try recapture after extraction",
      }),
    ).resolves.toMatchObject({ status: "already_extracted", existingCards: 1 });

    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, "direct-recapture-extracted"))).resolves.toMatchObject([{ rawText: "Captured text already has extraction cards." }]);
  });

  test("extraction transitions require extracted cards and ignore unrelated linked cards", async () => {
    await createSource({ id: "already-extracted", rawText: "Captured text" });
    const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: "already-extracted", rawSourceMaterialId: "raw-already-extracted", now: new Date("2026-07-13T00:00:00.000Z") });
    if (ensured.status !== "created") throw new Error("test setup failed");
    await testDb.insert(knowledgeCards).values({ id: "manual-draft", status: "draft", type: "route_note", title: "Manual draft", routeSegment: "Huế - Đà Nẵng", summary: "Existing summary", confidence: "community", aiPromptVersion: "manual_test_prompt", createdByUserId: "operator-user" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "manual-draft", sourceId: "already-extracted" });

    await expect(
      markFacebookCaptureReviewStatus(testDb, {
        reviewId: ensured.review.id,
        status: "extracted",
        actor: { userId: "operator-user", email: "operator-user@example.com" },
      }),
    ).resolves.toMatchObject({ status: "missing_extracted_cards" });

    await testDb.insert(knowledgeCards).values({ id: "existing-draft", status: "draft", type: "route_note", title: "Existing draft", routeSegment: "Huế - Đà Nẵng", summary: "Existing summary", confidence: "community", aiPromptVersion: sourceKnowledgeDraftExtractionPromptVersion, createdByUserId: "operator-user" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "existing-draft", sourceId: "already-extracted" });

    await expect(
      markFacebookCaptureReviewStatus(testDb, {
        reviewId: ensured.review.id,
        status: "extracted",
        actor: { userId: "operator-user", email: "operator-user@example.com" },
        now: new Date("2026-07-13T03:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ status: "updated", review: { status: "extracted" } });
    await expect(getExistingCardsForCaptureSource(testDb, "already-extracted")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "existing-draft", status: "draft", aiPromptVersion: sourceKnowledgeDraftExtractionPromptVersion }),
        expect.objectContaining({ id: "manual-draft", status: "draft", aiPromptVersion: "manual_test_prompt" }),
      ]),
    );
  });
});
