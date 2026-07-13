import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiUsageEvents, auditEvents, facebookCaptureReviews, knowledgeCards, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";
import { ensureFacebookCaptureReviewForCapturedSource, listFacebookCaptureReviews, markFacebookCaptureReviewStatus } from "@/features/knowledge/facebook-capture-review";
import { listQueuedFacebookSources } from "@/features/knowledge/facebook-capture";

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

async function createCapturedFacebookReview(input: { id: string; rawText: string }) {
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

describe("Facebook capture reject and reopen actions", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetTestDatabase();
    await createUser("operator-user", ["operator"]);
  });

  test("rejects a needs-review capture with safe reason and creates no traveler-facing side effects", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookReview({ id: "reject-success", rawText: "Raw Facebook text must not leak through rejection." });
    const { rejectFacebookCaptureReviewForm } = await import("@/features/knowledge/actions");

    await expect(rejectFacebookCaptureReviewForm(formData({ reviewId: review.id, rejectionReason: "Wrong visible post content", sourceId: "attacker-source" }))).rejects.toThrow(/NEXT_REDIRECT:.*rejected=1/);

    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([
      { status: "rejected", rejectionReason: "Wrong visible post content", reviewerUserId: "operator-user" },
    ]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(await testDb.select().from(auditEvents))).not.toContain("Raw Facebook text must not leak");
  });

  test("reject action handles invalid statuses and unsafe reasons without claiming success", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookReview({ id: "reject-invalid", rawText: "Captured text" });
    const unsafeReview = await createCapturedFacebookReview({ id: "reject-unsafe", rawText: "Another captured text" });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: review.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Wrong visible post content",
    });
    const { rejectFacebookCaptureReviewForm } = await import("@/features/knowledge/actions");

    await expect(rejectFacebookCaptureReviewForm(formData({ reviewId: review.id, rejectionReason: "Another safe reason" }))).rejects.toThrow(/NEXT_REDIRECT:.*rejectStatus=invalid_transition/);
    await expect(rejectFacebookCaptureReviewForm(formData({ reviewId: unsafeReview.id, rejectionReason: "cookie token provider_payload" }))).rejects.toThrow(/NEXT_REDIRECT:.*rejectError=/);
  });

  test("reopen action clears rejected raw text for recapture and redirects with safe status", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookReview({ id: "reopen-success", rawText: "Raw text selected from the wrong Facebook post." });
    await markFacebookCaptureReviewStatus(testDb, {
      reviewId: review.id,
      status: "rejected",
      actor: { userId: "operator-user", email: "operator-user@example.com" },
      rejectionReason: "Wrong visible post content",
    });
    const { reopenFacebookCaptureForRecaptureForm } = await import("@/features/knowledge/actions");

    await expect(reopenFacebookCaptureForRecaptureForm(formData({ reviewId: review.id, reopenReason: "Capture script selected incomplete text" }))).rejects.toThrow(/NEXT_REDIRECT:.*reopened=1/);

    await expect(testDb.select().from(rawSourceMaterial).where(eq(rawSourceMaterial.id, review.rawSourceMaterialId))).resolves.toMatchObject([{ rawText: null }]);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "needs_review", rejectionReason: null }]);
    await expect(listQueuedFacebookSources(testDb, { sourceId: review.sourceId })).resolves.toMatchObject([{ sourceId: review.sourceId, rawMaterialId: review.rawSourceMaterialId }]);
    await expect(listFacebookCaptureReviews(testDb, { status: "needs_review" })).resolves.toEqual([]);
    const { rejectFacebookCaptureReviewForm } = await import("@/features/knowledge/actions");
    await expect(rejectFacebookCaptureReviewForm(formData({ reviewId: review.id, rejectionReason: "Still missing captured text" }))).rejects.toThrow(/NEXT_REDIRECT:.*rejectStatus=missing_raw_text/);
  });

  test("unauthorized users fail before review lookup, raw text clearing, audits, provider calls, or status updates", async () => {
    const review = await createCapturedFacebookReview({ id: "private", rawText: "Private raw text" });
    await createUser("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    const { AdminAuthorizationError } = await import("@/server/auth");
    const { rejectFacebookCaptureReviewForm, reopenFacebookCaptureForRecaptureForm } = await import("@/features/knowledge/actions");

    await expect(rejectFacebookCaptureReviewForm(formData({ reviewId: review.id, rejectionReason: "Wrong visible post content" }))).rejects.toThrow(AdminAuthorizationError);
    await expect(reopenFacebookCaptureForRecaptureForm(formData({ reviewId: review.id, reopenReason: "Capture script selected incomplete text" }))).rejects.toThrow(AdminAuthorizationError);

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "needs_review" }]);
  });
});
