import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, facebookCaptureReviews, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sources, users } from "@/db/schema";
import { sourceKnowledgeDraftExtractionPromptVersion } from "@/features/ai/prompts";
import {
  ensureFacebookCaptureReviewForCapturedSource,
  getExistingCardsForCaptureSource,
  listFacebookCaptureReviews,
  markFacebookCaptureReviewStatus,
  reopenFacebookCaptureForRecapture,
} from "@/features/knowledge/facebook-capture-review";
import { listQueuedFacebookSources, updateQueuedFacebookSourceRawText } from "@/features/knowledge/facebook-capture";

import { resetTestDatabase, testDb } from "./helpers/db";

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
    rawText: input.rawText ?? null,
    rawMetadata: input.rawMetadata,
  });
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

    expect(result).toMatchObject({ status: "updated", rawMaterialId: "raw-captured-facebook" });
    await expect(testDb.select().from(facebookCaptureReviews)).resolves.toMatchObject([
      {
        sourceId: "captured-facebook",
        rawSourceMaterialId: "raw-captured-facebook",
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

  test("reopen clears rejected raw text, preserves provenance, audits safely, and allows controlled recapture", async () => {
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

    await expect(testDb.select().from(rawSourceMaterial).where(eq(rawSourceMaterial.id, "raw-recapture-facebook"))).resolves.toMatchObject([
      {
        id: "raw-recapture-facebook",
        sourceId: "recapture-facebook",
        rawText: null,
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
