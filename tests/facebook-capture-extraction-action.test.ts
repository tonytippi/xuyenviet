import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, facebookCaptureReviews, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";
import { ensureFacebookCaptureReviewForCapturedSource, markFacebookCaptureReviewStatus } from "@/features/knowledge/facebook-capture-review";

import { resetTestDatabase, testDb } from "./helpers/db";

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

async function createExtractionModel(values: Partial<typeof aiGatewayModels.$inferInsert> = {}) {
  await testDb.insert(aiGatewayModels).values({
    id: values.id ?? "extract-model",
    gatewayModelName: values.gatewayModelName ?? "cx/extract",
    displayLabel: values.displayLabel ?? "Extract model",
    purpose: "extraction",
    active: values.active ?? true,
    defaultForPurpose: values.defaultForPurpose ?? true,
    supportsTextInput: values.supportsTextInput ?? true,
    supportsImageInput: values.supportsImageInput ?? false,
    supportsImageOutput: values.supportsImageOutput ?? false,
    supportsEmbeddings: values.supportsEmbeddings ?? false,
    supportsExtraction: values.supportsExtraction ?? true,
    supportsEvaluation: values.supportsEvaluation ?? false,
    supportsStreaming: values.supportsStreaming ?? false,
    supportsCachePricing: values.supportsCachePricing ?? false,
    pricingCurrency: values.pricingCurrency === undefined ? "USD" : values.pricingCurrency,
    inputTokenPriceMicros: values.inputTokenPriceMicros === undefined ? 1_000_000 : values.inputTokenPriceMicros,
    outputTokenPriceMicros: values.outputTokenPriceMicros === undefined ? 2_000_000 : values.outputTokenPriceMicros,
    pricingUnitTokens: values.pricingUnitTokens ?? 1_000_000,
    pricingVersion: values.pricingVersion ?? "test-v1",
    pricingEffectiveAt: values.pricingEffectiveAt ?? new Date("2026-07-08T00:00:00.000Z"),
  });
}

async function createCapturedFacebookReview(input: { id: string; rawText: string; sourceType?: "community" | "curated" }) {
  await testDb.insert(sources).values({
    id: input.id,
    kind: "facebook",
    url: `https://facebook.com/groups/xuyenviet/posts/${input.id}`,
    canonicalUrl: `https://facebook.com/groups/xuyenviet/posts/${input.id}`,
    label: `Facebook source ${input.id}`,
    sourceType: input.sourceType ?? "community",
    verificationStatus: "unverified",
    official: false,
    partner: false,
    submittedByUserId: "operator-user",
  });
  await testDb.insert(rawSourceMaterial).values({ id: `raw-${input.id}`, sourceId: input.id, rawText: input.rawText });
  const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: input.id, rawSourceMaterialId: `raw-${input.id}`, now: new Date("2026-07-13T00:00:00.000Z") });
  if (ensured.status !== "created") {
    throw new Error("test setup failed");
  }
  return ensured.review;
}

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

function mockGatewayJson(content: string) {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        model: "cx/extract",
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
}

describe("Facebook capture extraction action", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetTestDatabase();
    await createUser("operator-user", ["operator"]);
  });

  test("extracts drafts from a needs-review capture and marks review extracted", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "success", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh, cần kiểm tra chỗ đậu xe trước khi duyệt." });
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "route_note",
            title: "Điểm dừng ngắm cảnh Hải Vân",
            route_segment: "Đà Nẵng - Huế",
            summary: "Điểm dừng ngắm cảnh trên cung đường Hải Vân, cần operator kiểm tra lại điều kiện đậu xe.",
            practical_details: { tips: ["Duyệt lại trước khi dùng cho khách"] },
            tags: ["hai-van"],
            confidence: "official",
            freshness_sensitive: false,
          },
        ],
      }),
    );
    const { extractKnowledgeDraftsFromFacebookCaptureForm } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromFacebookCaptureForm(formData({ reviewId: review.id, sourceId: "attacker-source" }))).rejects.toThrow(/NEXT_REDIRECT:.*extracted=1/);

    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ status: "draft", needsReview: true, confidence: "unverified" }]);
    await expect(testDb.select().from(knowledgeCardSources)).resolves.toMatchObject([{ sourceId: "success", supportLevel: "primary" }]);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([
      { status: "extracted", reviewerUserId: "operator-user", extractionError: null },
    ]);
  });

  test("marks extraction_failed with a safe summary when no capable model is active", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel({ id: "bad-model", supportsExtraction: false });
    const review = await createCapturedFacebookReview({ id: "no-model", rawText: "Raw Facebook text that must not appear in errors." });
    const { extractKnowledgeDraftsFromFacebookCaptureForm } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromFacebookCaptureForm(formData({ reviewId: review.id }))).rejects.toThrow(/NEXT_REDIRECT:.*extractError=/);

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([
      { status: "extraction_failed", extractionError: "Extraction failed: model_unavailable" },
    ]);
  });

  test("blocks duplicate extraction before provider calls and exposes existing card context", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookReview({ id: "duplicate", rawText: "Duplicate source raw text." });
    await testDb.insert(knowledgeCards).values({
      id: "existing-draft",
      status: "draft",
      type: "route_note",
      title: "Existing draft",
      routeSegment: "Huế - Đà Nẵng",
      summary: "Existing extracted draft",
      confidence: "community",
      aiPromptVersion: "source_knowledge_draft_extraction_v1",
      createdByUserId: "operator-user",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "existing-draft", sourceId: "duplicate" });
    const { extractKnowledgeDraftsFromFacebookCaptureForm } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromFacebookCaptureForm(formData({ reviewId: review.id }))).rejects.toThrow(/NEXT_REDIRECT:.*alreadyExtracted=1.*existingCards=1/);

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "needs_review" }]);
  });

  test("rechecks review status under the extraction lock before provider calls", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "stale-before-provider", rawText: "Readable raw text that should not reach the provider." });
    const { assertFacebookCaptureStillNeedsReview } = await import("@/features/knowledge/extraction");
    const { extractKnowledgeDraftsFromSource } = await import("@/features/knowledge/actions");

    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: review.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Not useful for route planning",
    });

    await expect(
      extractKnowledgeDraftsFromSource(review.sourceId, {
        preProviderGuard: ({ db, sourceId }) => assertFacebookCaptureStillNeedsReview(db, { reviewId: review.id, sourceId }),
      }),
    ).rejects.toMatchObject({ name: "KnowledgeExtractionError", code: "capture_not_actionable" });

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("renders recovery status instead of silently ignoring non-updated extraction transitions", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookReview({ id: "recovery-status", rawText: "Readable captured Facebook text." });
    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const { renderToStaticMarkup } = await import("react-dom/server");

    const element = await FacebookCaptureReviewDetailPage({
      params: Promise.resolve({ reviewId: review.id }),
      searchParams: Promise.resolve({ recoveryStatus: "stale_review", existingCards: "1" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Không thể hoàn tất cập nhật trạng thái sau khi trích xuất (stale_review)");
  });

  test("does not claim extraction_failed status changed when failure transition was not updated", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookReview({ id: "failure-status", rawText: "Readable captured Facebook text." });
    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const { renderToStaticMarkup } = await import("react-dom/server");

    const element = await FacebookCaptureReviewDetailPage({
      params: Promise.resolve({ reviewId: review.id }),
      searchParams: Promise.resolve({ extractError: "1", failureStatus: "stale_review" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Trạng thái review có thể đã thay đổi");
    expect(html).not.toContain("Trạng thái đã chuyển sang Trích xuất lỗi");
  });

  test("unauthorized users fail before reading source material or mutating extraction state", async () => {
    const review = await createCapturedFacebookReview({ id: "private", rawText: "Private raw text" });
    await createUser("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    const { AdminAuthorizationError } = await import("@/server/auth");
    const { extractKnowledgeDraftsFromFacebookCaptureForm } = await import("@/features/knowledge/actions");

    await expect(extractKnowledgeDraftsFromFacebookCaptureForm(formData({ reviewId: review.id }))).rejects.toThrow(AdminAuthorizationError);

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "needs_review" }]);
  });
});
