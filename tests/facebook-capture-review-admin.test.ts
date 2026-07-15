import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { facebookCaptureReviews, knowledgeCards, knowledgeCardSources, knowledgeExtractionJobs, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";
import { ensureFacebookCaptureReviewForCapturedSource, markFacebookCaptureReviewStatus } from "@/features/knowledge/facebook-capture-review";

import { resetTestDatabase, testDb } from "./helpers/db";

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
    rawText: input.rawText,
    rawMetadata: input.rawMetadata,
  });
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

  test.each(["operator", "admin"] as UserRole[])("%s can read default actionable queue with raw text for review", async (role) => {
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
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: rejected.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Wrong visible post content",
    });

    const { listAdminFacebookCaptureReviews } = await import("@/features/knowledge/facebook-capture-review-admin");
    const reviews = await listAdminFacebookCaptureReviews();

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
        rawText: "Raw Facebook text must stay out of queue rows.",
      },
    ]);
    expect(JSON.stringify(reviews)).toContain("Raw Facebook text");
  });

  test("explicit status filters include non-actionable captures and linked existing cards", async () => {
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

    const { listAdminFacebookCaptureReviews } = await import("@/features/knowledge/facebook-capture-review-admin");
    await expect(listAdminFacebookCaptureReviews({ status: "extracted" })).resolves.toMatchObject([
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

    const { getAdminFacebookCaptureReviewDetail, listAdminFacebookCaptureReviews } = await import("@/features/knowledge/facebook-capture-review-admin");
    const [queueRow] = await listAdminFacebookCaptureReviews();
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

  test("queue page renders compact Vietnamese labels with captured text preview for operators", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({
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

    expect(html).toContain("Hàng đợi duyệt capture Facebook");
    expect(html).toContain("Nguồn Facebook/cộng đồng, chưa xác minh");
    expect(html).toContain("Tác giả cộng đồng");
    expect(html).toContain("Preview nội dung đã capture");
    expect(html).toContain("Mở chi tiết để đọc toàn bộ raw text");
    expect(html).toContain("Bước tiếp theo");
    expect(html).toContain("Cần xử lý");
    expect(html).toContain("Cần duyệt");
    expect(html).toContain("1");
    expect(html).toContain("Queue preview sentence.");
    expect(html).toContain("Trích xuất và phê duyệt tất cả");
    expect(html).toContain(`name="reviewId" value="${review.id}"`);
    expect(html).toContain("name=\"returnTo\" value=\"facebook_capture_queue\"");
    expect(html).toContain("name=\"approveAllConfirmed\"");
    expect(html).not.toContain("Sensitive tail should only be on detail.");
  });

  test("queue page confirms an approve-all job without leaving the list", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const { default: FacebookCaptureReviewQueuePage } = await import("@/app/admin/knowledge/facebook-captures/page");
    const element = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({ approveAllQueued: "1", jobId: "queued-job" }) });

    expect(renderToStaticMarkup(element)).toContain("Yêu cầu trích xuất và phê duyệt tất cả đã được đưa vào hàng đợi");
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
    const adminHtml = renderToStaticMarkup(AdminPage());

    expect(adminHtml).toContain("Duyệt capture Facebook");
    expect(adminHtml).toContain("/admin/knowledge/facebook-captures");
    expect(adminHtml).toContain("Nguồn Facebook/cộng đồng vẫn chưa xác minh");

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
      rawText: "Captured Facebook text for intake status.",
      rawMetadata: { authorText: "Tác giả cộng đồng", timestampText: "Hôm qua" },
    });
    await testDb.insert(rawSourceMaterial).values({
      id: "raw-captured-only-facebook-source",
      sourceId: "captured-only-facebook-source",
      rawText: "Captured-only Facebook text for intake title.",
    });
    await testDb.insert(facebookCaptureReviews).values({
      id: "review-newer-facebook-source",
      sourceId: "newer-facebook-source",
      rawSourceMaterialId: "raw-newer-facebook-source",
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

  test("default and rejected queue empty states explain actionable workflow outcomes", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });

    const { default: FacebookCaptureReviewQueuePage } = await import("@/app/admin/knowledge/facebook-captures/page");
    const defaultElement = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({}) });
    const defaultHtml = renderToStaticMarkup(defaultElement);

    expect(defaultHtml).toContain("Chưa có capture cần duyệt");
    expect(defaultHtml).toContain("hãy chạy công cụ capture trước");
    expect(defaultHtml).toContain("kiểm tra các filter Đã trích xuất, Đã trích xuất và duyệt, hoặc Đã từ chối");

    const rejectedElement = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({ status: "rejected" }) });
    const rejectedHtml = renderToStaticMarkup(rejectedElement);

    expect(rejectedHtml).toContain("Capture đã từ chối không còn nằm trong hàng đợi cần xử lý");
    expect(rejectedHtml).toContain("chưa tạo thẻ tri thức cho traveler");
  });

  test("rejected queue page renders safe rejection reason and captured text preview", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "rejected-queue-page", rawText: `${"Rejected queue preview. ".repeat(30)}Rejected tail should only be on detail.` });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: review.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Wrong visible post content",
    });

    const { default: FacebookCaptureReviewQueuePage } = await import("@/app/admin/knowledge/facebook-captures/page");
    const element = await FacebookCaptureReviewQueuePage({ searchParams: Promise.resolve({ status: "rejected" }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Lý do từ chối");
    expect(html).toContain("Wrong visible post content");
    expect(html).toContain("Rejected queue preview.");
    expect(html).not.toContain("Rejected tail should only be on detail.");
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

  test("detail page renders recapture form for needs-review captures", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "extract-action", rawText: "Readable captured Facebook text." });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const element = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Trích xuất bản nháp");
    expect(html).toContain("AI sẽ tạo thẻ nháp để bạn duyệt");
    expect(html).toContain(`name="reviewId" value="${review.id}"`);
    expect(html).toContain("Trích xuất và phê duyệt tất cả");
    expect(html).toContain("Tôi đã kiểm tra nội dung capture, trust/confidence và freshness");
    expect(html).toContain("Recapture");
    expect(html).toContain("Xóa text capture hiện tại");
    expect(html).not.toContain("Từ chối capture");
    expect(html).not.toContain("Lý do từ chối an toàn");
    expect(html).not.toContain("Reject / reopen capture (4.1F)");
  });

  test("detail page routes extracted and approved captures to next workflow steps without duplicate extraction", async () => {
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

    expect(extractedHtml).toContain("hàng đợi bản nháp");
    expect(extractedHtml).toContain("/admin/knowledge/drafts/draft-detail-card");
    expect(extractedHtml).toContain("Capture này đã có thẻ liên kết");
    expect(extractedHtml).not.toContain("Trích xuất bản nháp</button>");
    expect(extractedHtml).not.toContain("approveAllConfirmed");

    const approvedElement = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: approvedReview.id }), searchParams: Promise.resolve({ approvedAll: "1" }) });
    const approvedHtml = renderToStaticMarkup(approvedElement);

    expect(approvedHtml).toContain("/admin/knowledge/approved/approved-detail-card");
    expect(approvedHtml).toContain("Confidence nguồn Facebook/cộng đồng vẫn được giữ theo guardrail");
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
