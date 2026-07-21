import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, auditEvents, facebookCaptureReviews, knowledgeCards, knowledgeCardSources, knowledgeExtractionJobs, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";
import { sourceKnowledgeDraftExtractionPromptVersion } from "@/features/ai/prompts";
import { ensureFacebookCaptureReviewForCapturedSource, markFacebookCaptureReviewStatus } from "@/features/knowledge/facebook-capture-review";

import { resetTestDatabase, testDb } from "./helpers/db";
import { seedSourceCaptureVersion } from "./helpers/source-captures";

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

async function createCapturedFacebookReview(input: { id: string; rawText: string; sourceType?: "community" | "curated"; official?: boolean; partner?: boolean }) {
  await testDb.insert(sources).values({
    id: input.id,
    kind: "facebook",
    url: `https://facebook.com/groups/xuyenviet/posts/${input.id}`,
    canonicalUrl: `https://facebook.com/groups/xuyenviet/posts/${input.id}`,
    label: `Facebook source ${input.id}`,
    sourceType: input.sourceType ?? "community",
    verificationStatus: "unverified",
    official: input.official ?? false,
    partner: input.partner ?? false,
    submittedByUserId: "operator-user",
  });
  await testDb.insert(rawSourceMaterial).values({ id: `raw-${input.id}`, sourceId: input.id });
  await seedSourceCaptureVersion({ sourceId: input.id, rawText: input.rawText });
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

function approveAllFormData(reviewId: string, extra: Record<string, string> = {}) {
  return formData({ reviewId, approveAllConfirmed: "on", ...extra });
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

describe("Facebook capture extract and approve all action", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetTestDatabase();
    await createUser("operator-user", ["operator"]);
  });

  test("requires confirmation before provider calls or mutations", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "missing-confirmation", rawText: "Readable captured Facebook text." });
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(formData({ reviewId: review.id }))).rejects.toThrow(/NEXT_REDIRECT:.*approveAllError=/);

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "needs_review" }]);
  });

  test("extracts and approves only generated drafts, preserving source links, freshness, and community confidence", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "approve-success", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh, lịch mở theo thời tiết nên cần cảnh báo freshness." });
    await testDb.insert(knowledgeCards).values({
      id: "unrelated-draft",
      status: "draft",
      type: "route_note",
      title: "Unrelated draft",
      routeSegment: "Huế - Đà Nẵng",
      summary: "This draft is linked but was not generated by the current request.",
      confidence: "community",
      freshnessSensitive: false,
      aiPromptVersion: "manual_draft",
      createdByUserId: "operator-user",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "unrelated-draft", sourceId: "approve-success" });
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "route_note",
            title: "Điểm dừng ngắm cảnh Hải Vân",
            route_segment: "Đà Nẵng - Huế",
            summary: "Điểm dừng ngắm cảnh trên cung đường Hải Vân, cần kiểm tra điều kiện thời tiết trước khi đi.",
            practical_details: { warnings: ["Kiểm tra thời tiết trước khi dừng"] },
            tags: ["hai-van"],
            confidence: "official",
            freshness_sensitive: true,
          },
        ],
      }),
    );
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(approveAllFormData(review.id, { sourceId: "attacker-source" }))).rejects.toThrow(/NEXT_REDIRECT:.*approveAllQueued=1/);

    await expect(testDb.select().from(knowledgeExtractionJobs)).resolves.toMatchObject([{ mode: "extract_and_approve_all", status: "queued", sourceId: "approve-success" }]);
    expect(fetch).not.toHaveBeenCalled();

    const { processNextKnowledgeExtractionJob } = await import("@/features/knowledge/extraction-jobs");
    await expect(processNextKnowledgeExtractionJob({ workerId: "test-worker" })).resolves.toMatchObject({ status: "processed" });

    const cards = await testDb.select().from(knowledgeCards);
    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "unrelated-draft", status: "draft", needsReview: true }),
        expect.objectContaining({ status: "approved", needsReview: false, confidence: "unverified", freshnessSensitive: true, aiPromptVersion: sourceKnowledgeDraftExtractionPromptVersion }),
      ]),
    );
    const approvedCard = cards.find((card) => card.status === "approved");
    expect(approvedCard).toBeDefined();
    await expect(testDb.select().from(knowledgeCardSources).where(eq(knowledgeCardSources.knowledgeCardId, approvedCard?.id ?? ""))).resolves.toMatchObject([{ sourceId: "approve-success", supportLevel: "primary" }]);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "extracted_approved", reviewerUserId: "operator-user" }]);
  });

  test("returns queue actions to the Facebook capture list after queueing", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "queue-return", rawText: "Readable captured Facebook text." });
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(approveAllFormData(review.id, { returnTo: "facebook_capture_queue" }))).rejects.toThrow(/NEXT_REDIRECT:.*\/admin\/knowledge\/facebook-captures\?status=needs_review&approveAllQueued=1/);
  });

  test("recovers existing generated drafts when extraction succeeded but review status stayed needs_review", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "partial-success", rawText: "Đà Nẵng có nhiều điểm dừng cần duyệt lại trước khi dùng." });
    const [generatedDraft] = await testDb
      .insert(knowledgeCards)
      .values({
        type: "route_note",
        title: "Gợi ý điểm dừng ở Đà Nẵng",
        locationName: "Đà Nẵng",
        summary: "Thông tin cộng đồng cần được operator kiểm tra trước khi dùng cho lịch trình.",
        practicalDetails: { tips: ["Kiểm tra lại trước khi đi"] },
        tags: ["da-nang"],
        confidence: "community",
        freshnessSensitive: false,
        aiPromptVersion: sourceKnowledgeDraftExtractionPromptVersion,
        createdByUserId: "operator-user",
      })
      .returning();
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: generatedDraft.id, sourceId: "partial-success", supportLevel: "primary" });
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(approveAllFormData(review.id))).rejects.toThrow(/NEXT_REDIRECT:.*recoveredExistingExtraction=1/);

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, generatedDraft.id))).resolves.toMatchObject([{ status: "approved", needsReview: false }]);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "extracted_approved", reviewerUserId: "operator-user" }]);
  });

  test("invalid provider output marks extraction_failed and approves no cards", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "invalid-output", rawText: "Readable raw text for invalid provider output." });
    mockGatewayJson(JSON.stringify({ drafts: [] }));
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(approveAllFormData(review.id))).rejects.toThrow(/NEXT_REDIRECT:.*approveAllQueued=1/);

    const { processNextKnowledgeExtractionJob } = await import("@/features/knowledge/extraction-jobs");
    await expect(processNextKnowledgeExtractionJob({ workerId: "test-worker" })).resolves.toMatchObject({ status: "failed" });

    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([
      { status: "extraction_failed", extractionError: "Extraction failed: invalid_model_output" },
    ]);
  });

  test("detail page renders safe approve-all extraction error diagnostics", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookReview({ id: "error-diagnostics", rawText: "Readable captured Facebook text." });
    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");

    const element = await FacebookCaptureReviewDetailPage({
      params: Promise.resolve({ reviewId: review.id }),
      searchParams: Promise.resolve({ approveAllError: "Không thể trích xuất và phê duyệt capture này.", errorCode: "invalid_model_output", errorDetail: "missing_location_or_route", failureStatus: "status_update_failed", statusReason: "23514:facebook_capture_reviews_reviewer_shape_check" }),
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("Mã lỗi an toàn: invalid_model_output");
    expect(html).toContain("Chi tiết an toàn: missing_location_or_route");
    expect(html).toContain("Cập nhật trạng thái lỗi: status_update_failed");
    expect(html).toContain("Lý do cập nhật trạng thái: 23514:facebook_capture_reviews_reviewer_shape_check");
  });

  test("provider failure marks extraction_failed, records safe usage failure, and approves no cards", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "provider-failure", rawText: "Raw text must not leak when provider fails." });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "raw provider payload" } }), { status: 200 }));
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(approveAllFormData(review.id))).rejects.toThrow(/NEXT_REDIRECT:.*approveAllQueued=1/);

    const { processNextKnowledgeExtractionJob } = await import("@/features/knowledge/extraction-jobs");
    await expect(processNextKnowledgeExtractionJob({ workerId: "test-worker" })).resolves.toMatchObject({ status: "failed" });

    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeExtractionJobs)).resolves.toMatchObject([{ status: "queued", lastErrorCode: "provider_failed" }]);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ status: "failure", errorCode: "invalid_gateway_response" }]);
    expect(JSON.stringify(await testDb.select().from(facebookCaptureReviews))).not.toContain("Raw text must not leak");
    expect(JSON.stringify(await testDb.select().from(facebookCaptureReviews))).not.toContain("raw provider payload");
  });

  test("retries approve-all after provider failure left capture in extraction_failed", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "retry-provider-failure", rawText: "Huế và Đà Nẵng có ghi chú cộng đồng cần duyệt lại." });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: review.id,
      status: "extraction_failed",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      extractionError: "Extraction failed: provider_failed",
    });
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "route_note",
            title: "Ghi chú cung Huế - Đà Nẵng",
            route_segment: "Huế - Đà Nẵng",
            summary: "Thông tin cộng đồng về cung Huế - Đà Nẵng cần giữ confidence phù hợp.",
            practical_details: { tips: ["Kiểm tra lại trước khi đi"] },
            tags: ["hue-da-nang"],
            confidence: "community",
            freshness_sensitive: true,
          },
        ],
      }),
    );
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(approveAllFormData(review.id))).rejects.toThrow(/NEXT_REDIRECT:.*approveAllQueued=1/);

    const { processNextKnowledgeExtractionJob } = await import("@/features/knowledge/extraction-jobs");
    await expect(processNextKnowledgeExtractionJob({ workerId: "test-worker" })).resolves.toMatchObject({ status: "processed" });

    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ status: "approved", needsReview: false }]);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "extracted_approved", reviewerUserId: "operator-user" }]);
  });

  test("model unavailable marks extraction_failed without provider payload or approvals", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel({ supportsExtraction: false });
    const review = await createCapturedFacebookReview({ id: "no-model", rawText: "Raw text must not appear in errors." });
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(approveAllFormData(review.id))).rejects.toThrow(/NEXT_REDIRECT:.*approveAllQueued=1/);

    const { processNextKnowledgeExtractionJob } = await import("@/features/knowledge/extraction-jobs");
    await expect(processNextKnowledgeExtractionJob({ workerId: "test-worker" })).resolves.toMatchObject({ status: "failed" });

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "extraction_failed", extractionError: "Extraction failed: model_unavailable" }]);
    expect(JSON.stringify(await testDb.select().from(facebookCaptureReviews))).not.toContain("Raw text must not appear");
  });

  test("stale review state blocks provider calls and card mutations", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "stale-review", rawText: "Readable raw text that should not reach the provider." });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: review.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Not useful for route planning",
    });
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(approveAllFormData(review.id))).rejects.toThrow(/NEXT_REDIRECT:.*approveAllStatus=rejected/);

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("approval failure after extraction keeps generated drafts reviewable and records only completed substep audits", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createExtractionModel();
    const review = await createCapturedFacebookReview({ id: "approval-failure", rawText: "Readable raw text for approval failure test." });
    mockGatewayJson(
      JSON.stringify({
        drafts: [
          {
            type: "route_note",
            title: "Valid draft before failing draft",
            route_segment: "Huế - Đà Nẵng",
            summary: "This valid generated draft must roll back if a later draft fails approval.",
            practical_details: { tips: ["Keep reviewable if batch approval fails"] },
            tags: ["rollback"],
            confidence: "community",
            freshness_sensitive: false,
          },
          {
            type: "service",
            title: "Service draft with unsafe metadata key",
            location_name: "Huế",
            summary: "A short generated service draft.",
            practical_details: { raw_source: "metadata key must fail during approval" },
            tags: ["service"],
            confidence: "community",
            freshness_sensitive: true,
          },
        ],
      }),
    );
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(approveAllFormData(review.id))).rejects.toThrow(/NEXT_REDIRECT:.*approveAllQueued=1/);

    const { processNextKnowledgeExtractionJob } = await import("@/features/knowledge/extraction-jobs");
    await expect(processNextKnowledgeExtractionJob({ workerId: "test-worker" })).resolves.toMatchObject({ status: "failed" });

    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([
      { status: "draft", needsReview: true },
      { status: "draft", needsReview: true },
    ]);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "extraction_failed" }]);
    const audits = await testDb.select().from(auditEvents);
    expect(audits.some((audit) => audit.targetType === "knowledge_draft_extraction")).toBe(true);
    expect(audits.some((audit) => audit.operation === "approve")).toBe(false);
  });

  test("detail page renders safe approve-all approval failure diagnostics", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookReview({ id: "approval-error-diagnostics", rawText: "Readable captured Facebook text." });
    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");

    const element = await FacebookCaptureReviewDetailPage({
      params: Promise.resolve({ reviewId: review.id }),
      searchParams: Promise.resolve({ approvalFailed: "1", approvalError: "not_reviewable" }),
    });

    expect(renderToStaticMarkup(element)).toContain("Mã lỗi an toàn: not_reviewable");
  });

  test("unauthorized users fail before review lookup, provider calls, usage writes, or mutations", async () => {
    const review = await createCapturedFacebookReview({ id: "private", rawText: "Private raw text" });
    await createUser("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    const { AdminAuthorizationError } = await import("@/server/auth");
    const { extractAndApproveFacebookCaptureDraftsForm } = await import("@/features/knowledge/actions");

    await expect(extractAndApproveFacebookCaptureDraftsForm(approveAllFormData(review.id))).rejects.toThrow(AdminAuthorizationError);

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "needs_review" }]);
  });

  test("detail page renders approve-all form only for actionable captures", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookReview({ id: "render-approve-all", rawText: "Detail page raw text for operator review." });
    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");

    const actionableElement = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) });
    const actionableHtml = renderToStaticMarkup(actionableElement);
    expect(actionableHtml).toContain("Trích xuất và phê duyệt tất cả");
    expect(actionableHtml).toContain("Tôi đã kiểm tra nội dung capture, trust/confidence và freshness");

    const missingConfirmationElement = await FacebookCaptureReviewDetailPage({
      params: Promise.resolve({ reviewId: review.id }),
      searchParams: Promise.resolve({ approveAllError: "Vui lòng xác nhận đã kiểm tra capture, trust/confidence và freshness trước khi phê duyệt tất cả." }),
    });
    expect(renderToStaticMarkup(missingConfirmationElement)).toContain("Vui lòng xác nhận đã kiểm tra capture, trust/confidence và freshness trước khi phê duyệt tất cả.");

    await testDb.insert(knowledgeCards).values({
      id: "render-extracted-card",
      status: "draft",
      type: "route_note",
      title: "Extracted render card",
      routeSegment: "Huế - Đà Nẵng",
      summary: "Existing extracted card makes the review non-actionable.",
      confidence: "community",
      freshnessSensitive: false,
      aiPromptVersion: sourceKnowledgeDraftExtractionPromptVersion,
      createdByUserId: "operator-user",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "render-extracted-card", sourceId: "render-approve-all" });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: review.id,
      status: "extracted",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
    });
    const extractedElement = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) });
    expect(renderToStaticMarkup(extractedElement)).not.toContain("approveAllConfirmed");

    const rejectedReview = await createCapturedFacebookReview({ id: "render-rejected", rawText: "Rejected detail page raw text." });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: rejectedReview.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Not useful for route planning",
    });
    const rejectedElement = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: rejectedReview.id }) });
    expect(renderToStaticMarkup(rejectedElement)).not.toContain("approveAllConfirmed");

    const failedReview = await createCapturedFacebookReview({ id: "render-failed", rawText: "Failed detail page raw text." });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: failedReview.id,
      status: "extraction_failed",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      extractionError: "Extraction failed: test_non_actionable",
    });
    const nonActionableElement = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: failedReview.id }) });
    const nonActionableHtml = renderToStaticMarkup(nonActionableElement);
    expect(nonActionableHtml).toContain("approveAllConfirmed");
  });
});
