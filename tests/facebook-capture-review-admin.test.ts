import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { facebookCaptureReviews, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";
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

  test.each(["operator", "admin"] as UserRole[])("%s can read default actionable queue without raw text", async (role) => {
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
        timestampText: "2 giờ trước",
      },
    ]);
    expect(JSON.stringify(reviews)).not.toContain("Raw Facebook text");
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
      timestampText: null,
    });
    expect(detail).toMatchObject({
      captureMethod: null,
      capturedAt: null,
      finalUrl: "https://m.facebook.com/detail?safe=1",
      authorText: null,
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

  test("queue page renders Vietnamese labels without raw captured text", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createCapturedFacebookSource({
      id: "queue-page",
      rawText: "Queue page must not render this raw Facebook paragraph.",
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
    expect(html).not.toContain("Queue page must not render");
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

  test("detail page renders real Extract form for needs-review captures and keeps future actions disabled", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookSource({ id: "extract-action", rawText: "Readable captured Facebook text." });

    const { default: FacebookCaptureReviewDetailPage } = await import("@/app/admin/knowledge/facebook-captures/[reviewId]/page");
    const element = await FacebookCaptureReviewDetailPage({ params: Promise.resolve({ reviewId: review.id }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Trích xuất bản nháp");
    expect(html).toContain("AI sẽ tạo thẻ nháp để bạn duyệt");
    expect(html).toContain(`name="reviewId" value="${review.id}"`);
    expect(html).toContain("Extract &amp; Approve All (4.1E)");
    expect(html).toContain("Reject / reopen capture (4.1F)");
  });
});
