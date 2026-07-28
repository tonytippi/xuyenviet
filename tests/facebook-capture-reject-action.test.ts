import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, auditEvents, facebookCaptureReviews, knowledgeCards, knowledgeIngestionCandidates, knowledgeIngestionJobs, rawSourceMaterial, sourceCaptureVersions, sources, userRoles, users, type UserRole } from "@/db/schema";
import { ensureFacebookCaptureReviewForCapturedSource, listFacebookCaptureReviews, markFacebookCaptureReviewStatus } from "@/features/knowledge/facebook-capture-review";
import { listQueuedFacebookSources } from "@/features/knowledge/facebook-capture";

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
    const { requestFacebookCaptureRecaptureForm } = await import("@/features/knowledge/actions");

    await expect(requestFacebookCaptureRecaptureForm(formData({ reviewId: review.id, recaptureReason: "Capture script selected incomplete text" }))).rejects.toThrow(/NEXT_REDIRECT:.*recaptureRequested=1/);

    if (!review.captureVersionId) throw new Error("Expected capture version");
    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.id, review.captureVersionId))).resolves.toMatchObject([{ rawText: "Raw text selected from the wrong Facebook post." }]);
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
    const { rejectFacebookCaptureReviewForm, reopenFacebookCaptureForRecaptureForm, requestFacebookCaptureRecaptureForm } = await import("@/features/knowledge/actions");

    await expect(rejectFacebookCaptureReviewForm(formData({ reviewId: review.id, rejectionReason: "Wrong visible post content" }))).rejects.toThrow(AdminAuthorizationError);
    await expect(reopenFacebookCaptureForRecaptureForm(formData({ reviewId: review.id, reopenReason: "Capture script selected incomplete text" }))).rejects.toThrow(AdminAuthorizationError);
    await expect(requestFacebookCaptureRecaptureForm(formData({ reviewId: review.id, recaptureReason: "Capture script selected incomplete text" }))).rejects.toThrow(AdminAuthorizationError);

    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "needs_review" }]);
  });

  test("operator can re-run an active v2 canonical job without changing the capture or canonical cards", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const review = await createCapturedFacebookReview({ id: "retry-canonical", rawText: "Raw Facebook text with a safe travel fact." });
    if (!review.captureVersionId) throw new Error("Expected capture version");
    await testDb.insert(aiGatewayModels).values({ id: "model", gatewayModelName: "extract-model", displayLabel: "Extract", purpose: "extraction", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000, pricingEffectiveAt: new Date() });
    await testDb.insert(knowledgeIngestionJobs).values({ id: "retry-canonical-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId, submittedByUserId: "operator-user", submittedByEmail: "operator-user@example.com", protocolVersion: 2, stage: "queued", stageVersion: 2, attemptCount: 1, maxAttempts: 3, nextRunAt: new Date(), discoveredCandidateCount: 1, terminalCandidateCount: 0, rawDiscoveryResponse: "{\"candidates\":[]}", claimedBy: "worker", claimedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000), fencingToken: "a".repeat(64) });
    await testDb.insert(knowledgeIngestionCandidates).values({ ingestionJobId: "retry-canonical-job", sourceId: review.sourceId, captureVersionId: review.captureVersionId, fingerprint: "a".repeat(64), type: "general_travel_tip", title: "Candidate extraction rejected", summary: "Rejected during structural validation.", conditions: [], freshnessSensitive: false, spanStart: 0, spanEnd: 1, extractionModelId: "model", extractionPromptVersion: "prompt", stage: "queued", stageVersion: 1, claimedBy: "worker", claimedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000), fencingToken: "b".repeat(64) });
    await testDb.insert(knowledgeCards).values({ id: "existing-card", status: "approved", type: "place", title: "Canonical card remains", summary: "Created by an earlier candidate.", locationName: "Đà Nẵng", conditions: [], confidence: "community", freshnessSensitive: false, aiPromptVersion: "old", createdByUserId: "operator-user" });
    const { rerunFacebookCanonicalIngestionForm } = await import("@/features/knowledge/actions");

    await expect(rerunFacebookCanonicalIngestionForm(formData({ reviewId: review.id }))).rejects.toThrow(/NEXT_REDIRECT:.*ingestionRerun=1/);

    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, "retry-canonical-job"))).resolves.toMatchObject([{ stage: "queued", stageVersion: 3, attemptCount: 0, discoveredCandidateCount: 0, terminalCandidateCount: 0, requeueReasonCode: "operator_rerun_current_pipeline", rawDiscoveryResponse: null, claimedBy: null, fencingToken: null }]);
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.ingestionJobId, "retry-canonical-job"))).resolves.toEqual([]);
    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.id, review.captureVersionId))).resolves.toMatchObject([{ rawText: "Raw Facebook text with a safe travel fact." }]);
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "existing-card"))).resolves.toHaveLength(1);
  });
});
