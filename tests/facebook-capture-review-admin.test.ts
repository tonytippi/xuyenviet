import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { facebookCaptureReviews, knowledgeCards, knowledgeCardSources, knowledgeExtractionJobs, knowledgeIngestionCandidates, knowledgeIngestionJobs, knowledgeRecommendations, rawSourceMaterial, sourceCaptureVersions, sources, userRoles, users, type UserRole } from "@/db/schema";
import { ensureFacebookCaptureReviewForCapturedSource, markFacebookCaptureReviewStatus } from "@/features/knowledge/facebook-capture-review";

import { resetTestDatabase, testDb } from "./helpers/db";
import { seedSourceCaptureVersion } from "./helpers/source-captures";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

async function createUserWithRoles(userId: string, roles: UserRole[]) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });

  if (roles.length > 0) {
    await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
  }
}

async function createCapturedFacebookSource(input: { id: string; rawText: string; rawMetadata?: Record<string, unknown> }) {
  await testDb.insert(sources).values({
    id: input.id,
    kind: "facebook",
    url: `https://facebook.com/groups/xuyenviet/posts/${input.id}`,
    canonicalUrl: `https://facebook.com/groups/xuyenviet/posts/${input.id}`,
    label: `Facebook source ${input.id}`,
    sourceType: "community",
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
  await seedSourceCaptureVersion({ sourceId: input.id, rawText: input.rawText, rawMetadata: input.rawMetadata });
  const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: input.id, rawSourceMaterialId: `raw-${input.id}`, now: new Date("2026-07-13T00:00:00.000Z") });
  if (ensured.status !== "created") {
    throw new Error("test setup failed");
  }
  return ensured.review;
}

describe("admin Facebook capture review helpers", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetTestDatabase();
    await createUserWithRoles("operator-user", ["operator"]);
  });

  test.each(["operator", "admin"] as UserRole[])("%s can read the default ingestion-led queue without raw text", async (role) => {
    await createUserWithRoles(`${role}-reader`, [role]);
    authMock.mockResolvedValue({ user: { id: `${role}-reader`, email: `${role}-reader@example.com` } });
    await createCapturedFacebookSource({
      id: "needs-review",
      rawText: "Raw Facebook text must stay out of queue rows.",
      rawMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-13T08:00:00.000Z",
        finalUrl: "https://m.facebook.com/groups/xuyenviet/posts/needs-review",
        authorText: "Cộng đồng Xuyên Việt",
        groupName: "Nhóm Xuyên Việt",
        timestampText: "2 giờ trước",
      },
    });
    const rejected = await createCapturedFacebookSource({ id: "rejected", rawText: "Rejected raw text" });
    if (!rejected.captureVersionId) throw new Error("Expected capture version");
    await testDb.insert(knowledgeIngestionJobs).values({ id: "rejected-job", sourceId: rejected.sourceId, captureVersionId: rejected.captureVersionId, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", stage: "suppressed" });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: rejected.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Wrong visible post content",
    });

    const { listAdminFacebookCaptureQueue } = await import("@/features/knowledge/facebook-capture-review-admin");
    const reviews = await listAdminFacebookCaptureQueue();

    expect(reviews).toMatchObject([
      {
        sourceId: "needs-review",
        status: "needs_review",
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-13T08:00:00.000Z",
        finalUrl: "https://m.facebook.com/groups/xuyenviet/posts/needs-review",
        authorText: "Cộng đồng Xuyên Việt",
        groupName: "Nhóm Xuyên Việt",
        timestampText: "2 giờ trước",
        ingestionJob: null,
        captureOperation: "awaiting_ingestion_job",
      },
    ]);
    expect(JSON.stringify(reviews)).not.toContain("Raw Facebook text");
  });

  test("canonical terminal filters include linked existing cards regardless of legacy review status", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "extracted", rawText: "Extracted raw text" });
    await testDb.insert(knowledgeCards).values({
      id: "draft-from-capture",
      status: "draft",
      type: "route_note",
      title: "Draft from capture",
      routeSegment: "Huế - Đà Nẵng",
      summary: "Existing extracted draft",
      confidence: "community",
      aiPromptVersion: "knowledge_source_extraction_v1",
      createdByUserId: "operator-user",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "draft-from-capture", sourceId: "extracted" });
    await testDb
      .update(facebookCaptureReviews)
      .set({ status: "extracted", reviewerUserId: "operator-user", reviewedAt: new Date("2026-07-13T01:00:00.000Z"), updatedAt: new Date("2026-07-13T01:00:00.000Z") })
      .where(eq(facebookCaptureReviews.id, review.id));
    if (!review.captureVersionId) throw new Error("Expected capture version");
    await testDb.insert(knowledgeIngestionJobs).values({ id: "extracted-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", stage: "published" });

    const { listAdminFacebookCaptureQueue } = await import("@/features/knowledge/facebook-capture-review-admin");
    await expect(listAdminFacebookCaptureQueue({ filter: "published" })).resolves.toMatchObject([
      {
        sourceId: "extracted",
        status: "extracted",
        existingCards: [{ id: "draft-from-capture", status: "draft", title: "Draft from capture" }],
      },
    ]);
  });

  test("detail returns raw text only after admin authorization and omits unsafe raw metadata", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({
      id: "detail",
      rawText: "Raw detail text for admin review only.",
      rawMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-13T08:00:00.000Z",
        finalUrl: "https://m.facebook.com/detail",
        authorText: "Safe author",
        groupName: "Safe group",
        timestampText: "Hôm qua",
        cookies: "secret-cookie",
        providerPayload: { hidden: true },
        localStorage: "secret-storage",
      },
    });

    const { getAdminFacebookCaptureReviewDetail } = await import("@/features/knowledge/facebook-capture-review-admin");
    const detail = await getAdminFacebookCaptureReviewDetail(review.id);

    expect(detail).toMatchObject({
      id: review.id,
      sourceId: "detail",
      rawText: "Raw detail text for admin review only.",
      captureMethod: "playwright_operator_browser",
      capturedAt: "2026-07-13T08:00:00.000Z",
        finalUrl: "https://m.facebook.com/detail",
        authorText: "Safe author",
        groupName: "Safe group",
        timestampText: "Hôm qua",
    });
    expect(JSON.stringify(detail)).not.toContain("secret-cookie");
    expect(JSON.stringify(detail)).not.toContain("providerPayload");
    expect(JSON.stringify(detail)).not.toContain("secret-storage");
  });

  test("Admin queue and detail show the canonical ingestion job for the captured version", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "ingestion-status", rawText: "Đèo Hải Vân cần kiểm tra tình trạng đường trước khi đi." });
    await testDb.insert(knowledgeIngestionJobs).values({
      id: "ingestion-status-job",
      sourceId: review.sourceId,
      captureVersionId: review.captureVersionId!,
      submittedByUserId: "operator-user",
      submittedByEmail: "operator-user@example.com",
      stage: "judging",
      stageVersion: 3,
      attemptCount: 2,
      maxAttempts: 3,
      nextRunAt: new Date("2026-07-13T01:00:00.000Z"),
      lastErrorCode: "candidate_missing_required_fields",
    });

    const { default: FacebookCaptureReviewQueuePage } = await import("@/app/admin/knowledge/facebook-captures/page");
    const queueHtml = renderToStaticMarkup(await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({}) }));
    expect(queueHtml).toContain("Trạng thái chính: ");
    expect(queueHtml).toContain("Canonical ingestion Đang đánh giá evidence.");

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const detailHtml = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) }));
    expect(detailHtml).toContain("Đang đánh giá chất lượng evidence");
    expect(detailHtml).toContain("Job ingestion-status-job · lần thử 2/3");
    expect(detailHtml).toContain("AI không xác định đủ loại thông tin");
  });

  test("canonical stages drive in-progress, attention, failure, and history filters", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const published = await createCapturedFacebookSource({ id: "published-needs-review", rawText: "Published capture." });
    const verify = await createCapturedFacebookSource({ id: "verify-needs-review", rawText: "Verify capture." });
    const failed = await createCapturedFacebookSource({ id: "failed-needs-review", rawText: "Failed capture." });
    if (!published.captureVersionId || !verify.captureVersionId || !failed.captureVersionId) throw new Error("Expected capture versions");
    await testDb.insert(knowledgeIngestionJobs).values([
      { id: "published-needs-review-job", sourceId: published.sourceId, captureVersionId: published.captureVersionId, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", stage: "published" },
      { id: "verify-needs-review-job", sourceId: verify.sourceId, captureVersionId: verify.captureVersionId, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", stage: "verify_first" },
      { id: "failed-needs-review-job", sourceId: failed.sourceId, captureVersionId: failed.captureVersionId, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", stage: "failed" },
    ]);

    const { listAdminFacebookCaptureQueue, listAdminFacebookCaptureQueueCounts, parseFacebookCaptureQueueFilter } = await import("@/features/knowledge/facebook-capture-review-admin");
    await expect(listAdminFacebookCaptureQueue()).resolves.toEqual([]);
    await expect(listAdminFacebookCaptureQueue({ filter: "needs_attention" })).resolves.toMatchObject([{ sourceId: "verify-needs-review" }]);
    await expect(listAdminFacebookCaptureQueue({ filter: "failed" })).resolves.toMatchObject([{ sourceId: "failed-needs-review" }]);
    await expect(listAdminFacebookCaptureQueue({ filter: "published" })).resolves.toMatchObject([{ sourceId: "published-needs-review", status: "needs_review", ingestionJob: { stage: "published" } }]);
    await expect(listAdminFacebookCaptureQueueCounts()).resolves.toEqual({ in_progress: 0, needs_attention: 1, failed: 1, published: 1, suppressed: 0 });
    expect(parseFacebookCaptureQueueFilter("extracted")).toBe("published");
    expect(parseFacebookCaptureQueueFilter("attention")).toBe("in_progress");
    expect(parseFacebookCaptureQueueFilter("unexpected-status")).toBe("in_progress");
  });

  test("queue describes the current verification action without legacy review status", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "queue-verification-guidance", rawText: "Cần xác minh thông tin trước khi sử dụng." });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "queue-verification-guidance-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", stage: "verify_first" });

    const { default: FacebookCaptureReviewQueuePage } = await import("@/app/admin/knowledge/facebook-captures/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({ status: "needs_attention" }) }));

    expect(html).toContain("Trạng thái xử lý: </span>Cần xác minh trước.");
    expect(html).toContain("mở chi tiết để xem và xác minh bằng chứng");
    expect(html).not.toContain("Duyệt/thu thập lại");
    expect(html).not.toContain("Cần duyệt theo luồng cũ");
  });

  test("detail explains malformed discovery JSON and offers a current-pipeline rerun", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "malformed-discovery-json", rawText: "Nội dung cần xử lý lại." });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "malformed-discovery-json-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", protocolVersion: 2, stage: "failed", attemptCount: 3, maxAttempts: 3, lastErrorCode: "retry_exhausted", rawDiscoveryResponse: '{"candidates":[}]' });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) }));

    expect(html).toContain("Không thể xử lý nội dung đã thu thập");
    expect(html).toContain("Quy trình đã thử lại tối đa nhưng phản hồi AI không có cấu trúc hợp lệ");
    expect(html).toContain("Phản hồi này không phải JSON hợp lệ");
    expect(html).toContain("Chạy lại quy trình hiện hành");
  });

  test("v1 parent lifecycle is visible without v2 candidate controls", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "v1-job", rawText: "Historical capture." });
    if (!review.captureVersionId) throw new Error("Expected capture version");
    await testDb.insert(knowledgeIngestionJobs).values({ id: "v1-job-id", sourceId: review.sourceId, captureVersionId: review.captureVersionId, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", protocolVersion: 1, stage: "suppressed" });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) }));
    expect(html).toContain("Đã giữ lại, không xuất bản");
    expect(html).toContain("Job legacy v1");
    expect(html).not.toContain("Candidate canonical an toàn");
    expect(html).not.toContain("Re-run current pipeline");
  });

  test("detail exposes current-pipeline re-run for an active v2 canonical ingestion job", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "retry-ingestion", rawText: "Đèo Hải Vân có điểm dừng an toàn ban ngày." });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "retry-ingestion-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", protocolVersion: 2, stage: "queued", stageVersion: 2, attemptCount: 1, maxAttempts: 3, nextRunAt: new Date() });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) }));

    expect(html).toContain("Chạy lại với pipeline hiện hành");
    expect(html).toContain("Re-run current pipeline");
  });

  test("detail shows color-coded candidate statuses and Vietnamese reason labels", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "candidate-status", rawText: "Đèo Hải Vân có điểm dừng an toàn ban ngày." });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "candidate-status-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", protocolVersion: 2, stage: "queued", nextRunAt: new Date() });
    await testDb.insert(knowledgeIngestionCandidates).values([
      { ingestionJobId: "candidate-status-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, fingerprint: "b".repeat(64), type: "place", title: "Đã xuất bản", summary: "Candidate active.", locationName: "Đèo Hải Vân", conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", stage: "published", stageVersion: 2 },
      { ingestionJobId: "candidate-status-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, fingerprint: "c".repeat(64), type: "place", title: "Không có bằng chứng", summary: "Candidate suppressed.", locationName: "Đèo Hải Vân", conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", stage: "suppressed", stageVersion: 2, outcomeReasonCode: "judge_evidence_not_grounded" },
      { ingestionJobId: "candidate-status-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, fingerprint: "d".repeat(64), type: "place", title: "Trùng bài viết", summary: "Candidate suppressed.", locationName: "Đèo Hải Vân", conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", stage: "suppressed", stageVersion: 2, outcomeReasonCode: "candidate_unsafe_raw_overlap" },
    ]);

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }), searchParams: Promise.resolve({ candidateReason: "judge_evidence_not_grounded" }) }));

    expect(html).toContain("Đã xuất bản");
    expect(html).toContain("Không xuất bản");
    expect(html).toContain("Không tìm thấy bằng chứng trong bài viết");
    expect(html).toContain("Bộ đánh giá không tìm được đoạn nguyên văn liên tục");
    expect(html).toContain("Nội dung trùng bài viết gốc");
    expect(html).toContain("Không có bằng chứng");
    expect(html).not.toContain("Candidate active.");
  });

  test("detail translates relation condition mismatch reasons", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "condition-mismatch", rawText: "Quảng Bình đến Huế có ba tuyến với thời gian ước tính khác nhau." });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "condition-mismatch-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", protocolVersion: 2, stage: "queued", nextRunAt: new Date() });
    await testDb.insert(knowledgeIngestionCandidates).values({ ingestionJobId: "condition-mismatch-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, fingerprint: "e".repeat(64), type: "route_note", title: "Thời gian ba tuyến", summary: "Thời gian ước tính khác nhau.", locationName: "Huế", routeSegment: "Quảng Bình – Huế", conditions: ["thời gian thay đổi theo giao thông"], freshnessSensitive: true, spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", stage: "review_recommended", stageVersion: 2, outcomeReasonCode: "attach_condition_mismatch" });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) }));

    expect(html).toContain("Điều kiện không khớp để gắn bằng chứng");
    expect(html).toContain("điều kiện áp dụng không giống nhau");
  });

  test("candidate links to its open recommendation instead of the approved-only detail page", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "candidate-recommendation-link", rawText: "Quảng Bình đến Huế có ba tuyến với thời gian ước tính khác nhau." });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "candidate-recommendation-link-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", protocolVersion: 2, stage: "queued", nextRunAt: new Date() });
    await testDb.insert(knowledgeCards).values({ id: "review-needed-card", status: "approved", needsReview: true, type: "route_note", title: "Thời gian ba tuyến", summary: "Thời gian ước tính khác nhau.", locationName: "Huế", routeSegment: "Quảng Bình – Huế", confidence: "community", aiPromptVersion: "test", executorSystem: "system-knowledge-pipeline" });
    await testDb.insert(knowledgeRecommendations).values({ id: "open-card-recommendation", knowledgeCardId: "review-needed-card", contentVersion: 1, evidenceSetRevision: 1, reason: "missing_context", priority: 50 });
    await testDb.insert(knowledgeIngestionCandidates).values({ ingestionJobId: "candidate-recommendation-link-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, fingerprint: "f".repeat(64), type: "route_note", title: "Thời gian ba tuyến", summary: "Thời gian ước tính khác nhau.", locationName: "Huế", routeSegment: "Quảng Bình – Huế", conditions: ["thời gian thay đổi theo giao thông"], freshnessSensitive: true, spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", stage: "review_recommended", stageVersion: 2, knowledgeCardId: "review-needed-card" });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) }));

    expect(html).toContain("Mở xử lý đề xuất");
    expect(html).toContain("/admin/knowledge/recommendations/open-card-recommendation");
    expect(html).not.toContain("/admin/knowledge/approved/review-needed-card");
  });

  test("verify-first candidates provide one batch approval action for their verification recommendations", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "verify-first-candidate-action", rawText: "Điểm dừng cần vận hành xác minh trước khi xuất bản." });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "verify-first-candidate-action-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", protocolVersion: 2, stage: "verify_first", nextRunAt: new Date() });
    await testDb.insert(knowledgeCards).values({ id: "verify-first-candidate-card", status: "approved", needsReview: true, publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "ai_recommended", verificationState: "required", type: "place", title: "Điểm dừng cần xác minh", summary: "Thông tin nguồn cộng đồng.", locationName: "Huế", confidence: "community", aiPromptVersion: "test", executorSystem: "system-knowledge-pipeline" });
    await testDb.insert(knowledgeRecommendations).values({ id: "verify-first-candidate-recommendation", knowledgeCardId: "verify-first-candidate-card", contentVersion: 1, evidenceSetRevision: 1, reason: "verification", priority: 2 });
    await testDb.insert(knowledgeIngestionCandidates).values({ ingestionJobId: "verify-first-candidate-action-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, fingerprint: "8".repeat(64), type: "place", title: "Điểm dừng cần xác minh", summary: "Thông tin nguồn cộng đồng.", locationName: "Huế", conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", stage: "verify_first", stageVersion: 2, knowledgeCardId: "verify-first-candidate-card" });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) }));

    expect(html).toContain("Duyệt tất cả mục cần xác minh (1)");
    expect(html).toContain('name="approval" value="verify-first-candidate-recommendation:1:1"');
    expect(html).not.toContain("Duyệt cần xác minh");
  });

  test("suppressed candidates do not link to unrelated or stale open recommendations", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "suppressed-candidate-link", rawText: "Khách sạn có bãi đỗ xe rộng và gần trạm sạc." });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "suppressed-candidate-link-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", protocolVersion: 2, stage: "queued", nextRunAt: new Date() });
    await testDb.insert(knowledgeCards).values({ id: "suppressed-candidate-card", status: "approved", needsReview: true, type: "hotel_area", title: "Khách sạn MT Ngô Quyền", summary: "Có bãi đỗ xe.", locationName: "Đà Nẵng", confidence: "community", aiPromptVersion: "test", executorSystem: "system-knowledge-pipeline", contentVersion: 2, evidenceSetRevision: 2 });
    await testDb.insert(knowledgeRecommendations).values({ id: "stale-open-recommendation", knowledgeCardId: "suppressed-candidate-card", contentVersion: 1, evidenceSetRevision: 1, reason: "verification", priority: 2 });
    await testDb.insert(knowledgeIngestionCandidates).values({ ingestionJobId: "suppressed-candidate-link-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, fingerprint: "9".repeat(64), type: "hotel_area", title: "Khách sạn MT Ngô Quyền có bãi đỗ rộng và gần trạm sạc", summary: "Có bãi đỗ xe rộng và gần trạm sạc.", locationName: "Đà Nẵng", conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", stage: "suppressed", stageVersion: 2, knowledgeCardId: "suppressed-candidate-card" });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) }));

    expect(html).toContain("Khách sạn MT Ngô Quyền có bãi đỗ rộng và gần trạm sạc");
    expect(html).not.toContain("/admin/knowledge/recommendations/stale-open-recommendation");
    expect(html).not.toContain("Mở xử lý đề xuất");
  });

  test("detail reconstructs safe legacy evidence-mismatch content from the protected discovery completion", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "legacy-mismatch", rawText: "Quán Nguyệt nằm gần Bãi Đá Nhảy và có cháo canh." });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "legacy-mismatch-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", protocolVersion: 2, stage: "queued", rawDiscoveryResponse: JSON.stringify({ candidates: [{ type: "food", title: "Quán Nguyệt gần Bãi Đá Nhảy", summary: "Quán có cháo canh.", location_name: "Quán Nguyệt, Quảng Bình", route_segment: null, conditions: ["Theo trải nghiệm cá nhân."], freshness_sensitive: false, evidence: { quote_text: "Quán Nguyệt ... cháo canh" } }] }) });
    await testDb.insert(knowledgeIngestionCandidates).values({ ingestionJobId: "legacy-mismatch-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId!, fingerprint: "a".repeat(64), type: "general_travel_tip", title: "Candidate extraction rejected", summary: "Rejected during structural or safety validation.", conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", stage: "suppressed", stageVersion: 2, outcomeReasonCode: "candidate_evidence_mismatch" });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) }));

    expect(html).toContain("Quán Nguyệt gần Bãi Đá Nhảy");
    expect(html).toContain("Quán Nguyệt, Quảng Bình");
    expect(html).toContain("Quote AI bị từ chối: Quán Nguyệt ... cháo canh");
    expect(html).not.toContain("Candidate extraction rejected");
  });

  test("admin read models sanitize unsafe values inside allowed metadata fields", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({
      id: "unsafe-allowed-values",
      rawText: "Raw text remains available only on detail.",
      rawMetadata: {
        captureMethod: "cookie capture method",
        capturedAt: "localStorage timestamp",
        finalUrl: "https://m.facebook.com/detail?token=secret-token&safe=1",
        authorText: "browser profile /tmp/playwright/facebook-profile",
        groupName: "providerPayload hidden data",
        timestampText: "providerPayload hidden data",
      },
    });

    const { getAdminFacebookCaptureReviewDetail, listAdminFacebookCaptureQueue } = await import("@/features/knowledge/facebook-capture-review-admin");
    const [queueRow] = await listAdminFacebookCaptureQueue();
    const detail = await getAdminFacebookCaptureReviewDetail(review.id);

    expect(queueRow).toMatchObject({
      captureMethod: null,
      capturedAt: null,
        finalUrl: "https://m.facebook.com/detail?safe=1",
        authorText: null,
        groupName: null,
        timestampText: null,
    });
    expect(detail).toMatchObject({
      captureMethod: null,
      capturedAt: null,
        finalUrl: "https://m.facebook.com/detail?safe=1",
        authorText: null,
        groupName: null,
        timestampText: null,
    });
    expect(JSON.stringify({ queueRow, detail })).not.toContain("secret-token");
    expect(JSON.stringify({ queueRow, detail })).not.toContain("playwright/facebook-profile");
    expect(JSON.stringify({ queueRow, detail })).not.toContain("providerPayload");
  });

  test("traveler and unauthenticated users fail before raw text is returned", async () => {
    const review = await createCapturedFacebookSource({ id: "private", rawText: "Private Facebook text" });
    const { AdminAuthorizationError } = await import("@/server/auth");
    const { getAdminFacebookCaptureReviewDetail } = await import("@/features/knowledge/facebook-capture-review-admin");

    authMock.mockResolvedValue(null);
    await expect(getAdminFacebookCaptureReviewDetail(review.id)).rejects.toThrow(AdminAuthorizationError);

    await createUserWithRoles("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    await expect(getAdminFacebookCaptureReviewDetail(review.id)).rejects.toThrow(AdminAuthorizationError);
  });

  test("queue page renders Vietnamese ingestion-led labels without raw text for operators", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createCapturedFacebookSource({
      id: "queue-page",
      rawText: `${"Queue preview sentence. ".repeat(30)}Sensitive tail should only be on detail.`,
      rawMetadata: {
        capturedAt: "2026-07-13T08:00:00.000Z",
        authorText: "Tác giả cộng đồng",
        timestampText: "Sáng nay",
      },
    });

    const { default: FacebookCaptureReviewQueuePage } = await import("@/app/admin/knowledge/facebook-captures/page");
    const element = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Hàng đợi ingestion capture Facebook");
    expect(html).toContain("Nguồn Facebook/cộng đồng, chưa xác minh");
    expect(html).toContain("Tác giả cộng đồng");
    expect(html).toContain("Trạng thái chính");
    expect(html).toContain("Capture đang chờ tạo canonical ingestion job");
    expect(html).toContain("Cần xử lý");
    expect(html).not.toContain("Cần theo dõi");
    expect(html).toContain("1");
    expect(html).not.toContain("Queue preview sentence.");
    expect(html).not.toContain("Trích xuất và phê duyệt tất cả");
    expect(html).not.toContain("approveAllConfirmed");
    expect(html).not.toContain("Sensitive tail should only be on detail.");
  });

  test("queue page paginates capture rows", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });

    for (let index = 0; index < 26; index += 1) {
      await createCapturedFacebookSource({ id: `queue-page-${index}`, rawText: `Captured queue page text ${index}` });
    }

    const { default: FacebookCaptureReviewQueuePage } = await import("@/app/admin/knowledge/facebook-captures/page");
    const firstPageElement = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({}) });
    const firstPageHtml = renderToStaticMarkup(firstPageElement);

    expect(firstPageHtml).toContain("Trang sau");
    expect(firstPageHtml).toContain("hiển thị 25 / 26 capture");

    const secondPageElement = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({ page: "2" }) });
    const secondPageHtml = renderToStaticMarkup(secondPageElement);

    expect(secondPageHtml).toContain("Trang trước");
    expect(secondPageHtml).toContain("hiển thị 1 / 26 capture");
  });

  test("admin overview exposes Facebook routing and intake stays URL-only", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });

    const { default: AdminPage } = await import("@/app/admin/page");
    const adminHtml = renderToStaticMarkup(await AdminPage());

    expect(adminHtml).toContain("Theo dõi xử lý");
    expect(adminHtml).toContain("/admin/knowledge/facebook-captures");
    expect(adminHtml).toContain("Capture, trích xuất và sàng lọc AI.");

    await testDb.insert(sources).values([
      {
        id: "older-url-source",
        kind: "url",
        url: "https://example.com/older?access_token=unsafe-token&place=hue",
        canonicalUrl: "https://example.com/older?access_token=unsafe-token&place=hue",
        label: "Older URL source",
        sourceType: "curated",
        verificationStatus: "unverified",
        official: false,
        partner: false,
        submittedByUserId: "operator-user",
        createdAt: new Date("2026-07-13T01:00:00.000Z"),
      },
      {
        id: "captured-only-facebook-source",
        kind: "facebook",
        url: "https://facebook.com/groups/xuyenviet/posts/captured-only-facebook-source",
        canonicalUrl: "https://facebook.com/groups/xuyenviet/posts/captured-only-facebook-source",
        label: "Facebook post 2CapturedOnly",
        sourceType: "community",
        verificationStatus: "unverified",
        official: false,
        partner: false,
        submittedByUserId: "operator-user",
        createdAt: new Date("2026-07-13T01:30:00.000Z"),
      },
      {
        id: "newer-facebook-source",
        kind: "facebook",
        url: "https://facebook.com/groups/xuyenviet/posts/newer-facebook-source",
        canonicalUrl: "https://facebook.com/groups/xuyenviet/posts/newer-facebook-source",
        label: "Facebook post 1BaXNWkVRS",
        sourceType: "community",
        verificationStatus: "unverified",
        official: false,
        partner: false,
        submittedByUserId: "operator-user",
        createdAt: new Date("2026-07-13T02:00:00.000Z"),
      },
    ]);
    await testDb.insert(rawSourceMaterial).values({
      id: "raw-newer-facebook-source",
      sourceId: "newer-facebook-source",
    });
    await testDb.insert(rawSourceMaterial).values({
      id: "raw-captured-only-facebook-source",
      sourceId: "captured-only-facebook-source",
    });
    await seedSourceCaptureVersion({
      sourceId: "newer-facebook-source",
      rawText: "Captured Facebook text for intake status.",
      rawMetadata: { authorText: "Tác giả cộng đồng", timestampText: "Hôm qua" },
    });
    await seedSourceCaptureVersion({ sourceId: "captured-only-facebook-source", rawText: "Captured-only Facebook text for intake title." });
    await testDb.insert(facebookCaptureReviews).values({
      id: "review-newer-facebook-source",
      sourceId: "newer-facebook-source",
      rawSourceMaterialId: "raw-newer-facebook-source",
      captureVersionId: (await testDb.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, "newer-facebook-source")))[0].id,
      status: "extracted",
      reviewerUserId: "operator-user",
      reviewedAt: new Date("2026-07-13T03:00:00.000Z"),
      createdAt: new Date("2026-07-13T02:30:00.000Z"),
      updatedAt: new Date("2026-07-13T03:00:00.000Z"),
    });
    await testDb.insert(facebookCaptureReviews).values({
      id: "review-captured-only-facebook-source",
      sourceId: "captured-only-facebook-source",
      rawSourceMaterialId: "raw-captured-only-facebook-source",
      captureVersionId: (await testDb.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, "captured-only-facebook-source")))[0].id,
      status: "needs_review",
      createdAt: new Date("2026-07-13T01:45:00.000Z"),
      updatedAt: new Date("2026-07-13T01:45:00.000Z"),
    });
    await testDb.insert(knowledgeCards).values({
      id: "card-newer-facebook-source",
      status: "draft",
      type: "route_note",
      title: "Draft from captured source",
      routeSegment: "Huế - Đà Nẵng",
      summary: "Draft linked to captured source.",
      confidence: "community",
      aiPromptVersion: "test",
      createdByUserId: "operator-user",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "card-newer-facebook-source", sourceId: "newer-facebook-source" });

    const { default: KnowledgeIntakePage } = await import("@/app/admin/knowledge/intake/page");
    const intakeElement = await KnowledgeIntakePage({ searchParams: Promise.resolve({ success: "1", sourceId: "facebook-source" }) });
    const intakeHtml = renderToStaticMarkup(intakeElement);

    expect(intakeHtml).toContain("Quản lý các URL nguồn đã nhập");
    expect(intakeHtml).toContain("URL nguồn");
    expect(intakeHtml).toContain("Tất cả URL đã nhập");
    expect(intakeHtml).toContain("Tiêu đề");
    expect(intakeHtml).toContain("Older URL source");
    expect(intakeHtml).toContain("Draft from captured source");
    expect(intakeHtml).toContain("Captured-only Facebook text for intake title.");
    expect(intakeHtml).not.toContain("Facebook post 1BaXNWkVRS");
    expect(intakeHtml).not.toContain("Facebook post 2CapturedOnly");
    expect(intakeHtml).toContain("Facebook");
    expect(intakeHtml).toContain("Capture");
    expect(intakeHtml).toContain("Extract");
    expect(intakeHtml).toContain("Đã capture");
    expect(intakeHtml).toContain("Đã extract");
    expect(intakeHtml).toContain("Không áp dụng");
    expect(intakeHtml).toContain("/admin/knowledge/facebook-captures/review-newer-facebook-source");
    expect(intakeHtml).toContain("https://facebook.com/groups/xuyenviet/posts/newer-facebook-source");
    expect(intakeHtml).toContain("target=\"_blank\"");
    expect(intakeHtml).toContain("rel=\"noreferrer\"");
    expect(intakeHtml).toContain("https://example.com/older?access_token=");
    expect(intakeHtml).not.toContain("unsafe-token");
    expect(intakeHtml).not.toContain("name=\"rawText\"");
    expect(intakeHtml).not.toContain("name=\"screenshotFileName\"");
    expect(intakeHtml).not.toContain("name=\"batchPublisher\"");
    expect(intakeHtml.indexOf("URL</th>")).toBeLessThan(intakeHtml.indexOf("Tiêu đề</th>"));
    expect(intakeHtml.indexOf("newer-facebook-source")).toBeLessThan(intakeHtml.indexOf("https://example.com/older"));
  });

  test("canonical queue empty states explain in-progress, failure, and terminal outcomes", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });

    const { default: FacebookCaptureReviewQueuePage } = await import("@/app/admin/knowledge/facebook-captures/page");
    const defaultElement = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({}) });
    const defaultHtml = renderToStaticMarkup(defaultElement);

    expect(defaultHtml).toContain("Chưa có nội dung đang xử lý");
    expect(defaultHtml).toContain("tác vụ đang chạy, đang chờ tạo hoặc đang chờ thu thập lại");

    const failedElement = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({ status: "failed" }) });
    const failedHtml = renderToStaticMarkup(failedElement);
    expect(failedHtml).toContain("Chưa có nội dung xử lý thất bại");
    expect(failedHtml).toContain("tác vụ xử lý thất bại");

    const suppressedElement = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({ status: "suppressed" }) });
    const suppressedHtml = renderToStaticMarkup(suppressedElement);

    expect(suppressedHtml).toContain("Chưa có dữ liệu nhập bị giữ lại");
    expect(suppressedHtml).toContain("tác vụ xử lý chính ở trạng thái bị giữ lại");
  });

  test("recapture-pending reviews remain visible in the in-progress queue and detail route", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "recapture-pending", rawText: "Capture text queued for replacement." });
    await testDb
      .update(facebookCaptureReviews)
      .set({ captureVersionId: null, updatedAt: new Date("2026-07-13T03:00:00.000Z") })
      .where(eq(facebookCaptureReviews.id, review.id));

    const { listAdminFacebookCaptureQueue, listAdminFacebookCaptureQueueCounts, getAdminFacebookCaptureReviewDetail } = await import("@/features/knowledge/facebook-capture-review-admin");
    await expect(listAdminFacebookCaptureQueue()).resolves.toMatchObject([{ id: review.id, captureVersionId: null, ingestionJob: null, captureOperation: "recapture_pending" }]);
    await expect(listAdminFacebookCaptureQueueCounts()).resolves.toMatchObject({ in_progress: 1, needs_attention: 0, failed: 0, published: 0, suppressed: 0 });
    await expect(getAdminFacebookCaptureReviewDetail(review.id)).resolves.toMatchObject({ id: review.id, captureVersionId: null, rawText: null, ingestionJob: null });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const html = renderToStaticMarkup(await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }), searchParams: Promise.resolve({ recaptureRequested: "1" }) }));
    expect(html).toContain("Đã đưa capture này về hàng đợi recapture");
    expect(html).toContain("Chưa có canonical job cho capture version này");
    expect(html).toContain("Chưa có nội dung text.");
  });

  test("legacy rejected URL resolves safely to canonical suppressed history", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "rejected-queue-page", rawText: `${"Rejected queue preview. ".repeat(30)}Rejected tail should only be on detail.` });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: review.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Wrong visible post content",
    });
    if (!review.captureVersionId) throw new Error("Expected capture version");
    await testDb.insert(knowledgeIngestionJobs).values({ id: "rejected-queue-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", stage: "suppressed" });

    const { default: FacebookCaptureReviewQueuePage } = await import("@/app/admin/knowledge/facebook-captures/page");
    const element = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({ status: "rejected" }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Không xuất bản");
    expect(html).toContain("Canonical ingestion Đã giữ lại, không xuất bản.");
    expect(html).not.toContain("Wrong visible post content");
    expect(html).not.toContain("Rejected queue preview.");
    expect(html).not.toContain("approveAllConfirmed");
  });

  test("detail page renders raw text but not unsafe metadata values", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({
      id: "detail-page",
      rawText: "Detail page may render this raw text for operators.",
      rawMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-13T08:00:00.000Z",
        finalUrl: "https://m.facebook.com/detail-page",
        authorText: "Safe detail author",
        cookies: "unsafe-cookie-value",
        providerPayload: { token: "unsafe-provider-token" },
      },
    });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const element = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Detail page may render this raw text for operators.");
    expect(html).toContain("Nguồn Facebook/cộng đồng, chưa xác minh");
    expect(html).not.toContain("unsafe-cookie-value");
    expect(html).not.toContain("unsafe-provider-token");
  });

  test("detail page renders a concise processing status and recapture for needs-review captures", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "extract-action", rawText: "Readable captured Facebook text." });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const element = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Trạng thái xử lý");
    expect(html).toContain("Đang chờ xử lý");
    expect(html).not.toContain("Trích xuất bản nháp");
    expect(html).toContain(`name="reviewId" value="${review.id}"`);
    expect(html).not.toContain("Trích xuất và phê duyệt tất cả");
    expect(html).toContain("Recapture");
    expect(html).toContain("Xóa text capture hiện tại");
    expect(html).not.toContain("Từ chối capture");
    expect(html).not.toContain("Lý do từ chối an toàn");
    expect(html).not.toContain("Reject / reopen capture (4.1F)");
  });

  test("detail page keeps legacy linked cards visible without offering extraction actions", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const extractedReview = await createCapturedFacebookSource({ id: "detail-extracted", rawText: "Extracted detail raw text." });
    await testDb.insert(knowledgeCards).values({
      id: "draft-detail-card",
      status: "draft",
      type: "route_note",
      title: "Draft detail card",
      routeSegment: "Huế - Đà Nẵng",
      summary: "Draft from capture detail",
      confidence: "community",
      aiPromptVersion: "knowledge_source_extraction_v1",
      createdByUserId: "operator-user",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "draft-detail-card", sourceId: "detail-extracted" });
    await testDb
      .update(facebookCaptureReviews)
      .set({ status: "extracted", reviewerUserId: "operator-user", reviewedAt: new Date("2026-07-13T02:00:00.000Z"), updatedAt: new Date("2026-07-13T02:00:00.000Z") })
      .where(eq(facebookCaptureReviews.id, extractedReview.id));

    const approvedReview = await createCapturedFacebookSource({ id: "detail-approved", rawText: "Approved detail raw text." });
    await testDb.insert(knowledgeCards).values({
      id: "approved-detail-card",
      status: "approved",
      type: "route_note",
      title: "Approved detail card",
      routeSegment: "Đà Nẵng - Hội An",
      summary: "Approved from capture detail",
      confidence: "community",
      aiPromptVersion: "knowledge_source_extraction_v1",
      createdByUserId: "operator-user",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "approved-detail-card", sourceId: "detail-approved" });
    await testDb
      .update(facebookCaptureReviews)
      .set({ status: "extracted_approved", reviewerUserId: "operator-user", reviewedAt: new Date("2026-07-13T03:00:00.000Z"), updatedAt: new Date("2026-07-13T03:00:00.000Z") })
      .where(eq(facebookCaptureReviews.id, approvedReview.id));

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const extractedElement = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: extractedReview.id }), searchParams: Promise.resolve({ extracted: "1" }) });
    const extractedHtml = renderToStaticMarkup(extractedElement);

    expect(extractedHtml).toContain("/admin/knowledge/drafts/draft-detail-card");
    expect(extractedHtml).not.toContain("Trích xuất bản nháp</button>");
    expect(extractedHtml).not.toContain("approveAllConfirmed");

    const approvedElement = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: approvedReview.id }), searchParams: Promise.resolve({ approvedAll: "1" }) });
    const approvedHtml = renderToStaticMarkup(approvedElement);

    expect(approvedHtml).toContain("/admin/knowledge/approved/approved-detail-card");
    expect(approvedHtml).not.toContain("Trích xuất bản nháp</button>");
    expect(approvedHtml).not.toContain("approveAllConfirmed");
  });

  test("detail page does not link non-draft linked cards to the draft route", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "detail-rejected-linked-card", rawText: "Rejected linked card raw text." });
    await testDb.insert(knowledgeCards).values({
      id: "rejected-linked-card",
      status: "rejected",
      needsReview: false,
      type: "route_note",
      title: "Rejected linked card",
      routeSegment: "Huế - Đà Nẵng",
      summary: "Rejected from capture detail",
      confidence: "community",
      aiPromptVersion: "knowledge_source_extraction_v1",
      createdByUserId: "operator-user",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "rejected-linked-card", sourceId: "detail-rejected-linked-card" });
    await testDb
      .update(facebookCaptureReviews)
      .set({ status: "extracted", reviewerUserId: "operator-user", reviewedAt: new Date("2026-07-13T04:00:00.000Z"), updatedAt: new Date("2026-07-13T04:00:00.000Z") })
      .where(eq(facebookCaptureReviews.id, review.id));

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const element = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }), searchParams: Promise.resolve({ extracted: "1" }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Rejected linked card");
    expect(html).toContain("route_note · rejected");
    expect(html).not.toContain("/admin/knowledge/drafts/rejected-linked-card");
  });

  test("detail page renders recapture form for rejected captures and no extract actions", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "reopen-action", rawText: "Rejected detail page raw text." });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: review.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Wrong visible post content",
    });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const element = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Recapture");
    expect(html).toContain("Xóa text capture hiện tại");
    expect(html).not.toContain("Mở lại để capture lại");
    expect(html).not.toContain("Từ chối capture");
    expect(html).not.toContain("Trích xuất bản nháp</button>");
    expect(html).not.toContain("approveAllConfirmed");
  });

  test("detail page maps reject and reopen error query params to fixed safe messages", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "safe-query", rawText: "Detail raw text remains only in raw text panel." });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const element = await FacebookCaptureReviewDetailPage({
      params: Promise.resolve({ reviewId: review.id }),
      searchParams: Promise.resolve({ rejectError: "raw text token should not render", reopenError: "provider payload should not render" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Lý do từ chối không an toàn hoặc capture này không thể từ chối.");
    expect(html).toContain("Lý do mở lại không an toàn hoặc capture này không thể mở lại.");
    expect(html).not.toContain("raw text token should not render");
    expect(html).not.toContain("provider payload should not render");
  });

  test("detail page suppresses stale queued notice after extraction job succeeds", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "completed-queued-notice", rawText: "Completed extraction raw text." });
    await testDb.insert(knowledgeCards).values({
      id: "draft-completed-queued-notice",
      status: "draft",
      type: "route_note",
      title: "Draft after queued job",
      routeSegment: "Huế - Đà Nẵng",
      summary: "Created by completed worker job",
      confidence: "community",
      aiPromptVersion: "knowledge_source_extraction_v1",
      createdByUserId: "operator-user",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "draft-completed-queued-notice", sourceId: review.sourceId });
    await testDb.insert(knowledgeExtractionJobs).values({
      id: "completed-job",
      sourceId: review.sourceId,
      facebookCaptureReviewId: review.id,
      mode: "extract_only",
      status: "succeeded",
      attemptCount: 1,
      maxAttempts: 3,
      resultDraftIds: ["draft-completed-queued-notice"],
      resultDraftCount: 1,
      createdByUserId: "operator-user",
      createdByEmail: "operator-user@example.com",
      finishedAt: new Date("2026-07-13T01:00:00.000Z"),
    });
    await testDb
      .update(facebookCaptureReviews)
      .set({ status: "extracted", reviewerUserId: "operator-user", reviewedAt: new Date("2026-07-13T01:00:00.000Z"), updatedAt: new Date("2026-07-13T01:00:00.000Z") })
      .where(eq(facebookCaptureReviews.id, review.id));

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const element = await FacebookCaptureReviewDetailPage({
      params: Promise.resolve({ reviewId: review.id }),
      searchParams: Promise.resolve({ extractQueued: "1", jobId: "completed-job" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).not.toContain("Yêu cầu trích xuất đã được đưa vào hàng đợi");
    expect(html).toContain("Đã trích xuất");
    expect(html).toContain("Draft after queued job");
  });
});
