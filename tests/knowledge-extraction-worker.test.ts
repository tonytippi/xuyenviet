import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, facebookCaptureReviews, knowledgeCards, knowledgeCardSources, knowledgeExtractionJobs, rawSourceMaterial, sourceCaptureVersions, sources, userRoles, users, type UserRole } from "@/db/schema";
import { ensureFacebookCaptureReviewForCapturedSource } from "@/features/knowledge/facebook-capture-review";
import { enqueueKnowledgeExtractionJob, processKnowledgeExtractionJob, recoverStaleKnowledgeExtractionJobs, runKnowledgeExtractionWorkerLoop } from "@/features/knowledge/extraction-jobs";

import { resetTestDatabase, testDb } from "./helpers/db";
import { seedSourceCaptureVersion } from "./helpers/source-captures";

const authMock = vi.hoisted(() => vi.fn());

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

async function createExtractionModel() {
  await testDb.insert(aiGatewayModels).values({
    id: "extract-model",
    gatewayModelName: "cx/extract",
    displayLabel: "Extract model",
    purpose: "extraction",
    active: true,
    defaultForPurpose: true,
    supportsTextInput: true,
    supportsExtraction: true,
    pricingUnitTokens: 1_000_000,
    pricingEffectiveAt: new Date("2026-07-08T00:00:00.000Z"),
  });
}

async function createCapturedFacebookReview(id: string) {
  await testDb.insert(sources).values({
    id,
    kind: "facebook",
    url: `https://facebook.com/posts/${id}`,
    label: `Facebook source ${id}`,
    sourceType: "community",
    verificationStatus: "unverified",
    official: false,
    partner: false,
    submittedByUserId: "operator-user",
  });
  await testDb.insert(rawSourceMaterial).values({ id: `raw-${id}`, sourceId: id });
  await seedSourceCaptureVersion({ sourceId: id, rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh cần kiểm tra trước khi đi." });
  const ensured = await ensureFacebookCaptureReviewForCapturedSource(testDb, { sourceId: id, rawSourceMaterialId: `raw-${id}` });
  if (ensured.status !== "created") throw new Error("setup failed");
  return ensured.review;
}

async function createUrlSource(id: string) {
  await testDb.insert(sources).values({
    id,
    kind: "url",
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    label: `URL source ${id}`,
    sourceType: "curated",
    verificationStatus: "unverified",
    official: false,
    partner: false,
    submittedByUserId: "operator-user",
  });
  await testDb.insert(rawSourceMaterial).values({ id: `raw-${id}`, sourceId: id });
  await seedSourceCaptureVersion({ sourceId: id, rawText: "Nguồn URL có nội dung đọc được để AI trích xuất.", captureKind: "url" });
}

describe("knowledge extraction worker jobs", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await createUser("operator-user", ["operator"]);
    vi.mocked(fetch).mockReset();
  });

  test("blocks active duplicate jobs across extraction modes", async () => {
    const review = await createCapturedFacebookReview("duplicate-active-job");
    const actor = { userId: "operator-user", email: "operator-user@example.com" };

    await expect(enqueueKnowledgeExtractionJob({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", actor }, testDb)).resolves.toMatchObject({ status: "queued" });
    await expect(enqueueKnowledgeExtractionJob({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_and_approve_all", actor }, testDb)).resolves.toMatchObject({ status: "already_active" });
    await expect(testDb.select().from(knowledgeExtractionJobs)).resolves.toHaveLength(1);
  });

  test("serializes concurrent enqueue attempts for the same source", async () => {
    const review = await createCapturedFacebookReview("duplicate-concurrent-job");
    const actor = { userId: "operator-user", email: "operator-user@example.com" };

    const results = await Promise.all([
      enqueueKnowledgeExtractionJob({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", actor }, testDb),
      enqueueKnowledgeExtractionJob({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_and_approve_all", actor }, testDb),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["already_active", "queued"]);
    await expect(testDb.select().from(knowledgeExtractionJobs)).resolves.toHaveLength(1);
  });

  test("recovers stale running jobs", async () => {
    const review = await createCapturedFacebookReview("stale-job");
    const [job] = await testDb.insert(knowledgeExtractionJobs).values({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", status: "running", attemptCount: 1, lockedAt: new Date("2026-07-14T00:00:00.000Z"), lockedBy: "dead-worker", startedAt: new Date("2026-07-14T00:00:00.000Z"), createdByUserId: "operator-user", createdByEmail: "operator-user@example.com" }).returning();

    await expect(recoverStaleKnowledgeExtractionJobs({ now: new Date("2026-07-14T00:20:00.000Z"), staleMs: 15 * 60_000 }, testDb)).resolves.toMatchObject({ recoveredCount: 1, jobIds: [job.id] });
    await expect(testDb.select().from(knowledgeExtractionJobs).where(eq(knowledgeExtractionJobs.id, job.id))).resolves.toMatchObject([{ status: "queued", lockedAt: null, lockedBy: null }]);
  });

  test("fails stale running jobs that have no attempts remaining", async () => {
    const review = await createCapturedFacebookReview("stale-max-attempt-job");
    const [job] = await testDb.insert(knowledgeExtractionJobs).values({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, captureVersionId: review.captureVersionId, mode: "extract_only", status: "running", attemptCount: 3, maxAttempts: 3, lockedAt: new Date("2026-07-14T00:00:00.000Z"), lockedBy: "dead-worker", startedAt: new Date("2026-07-14T00:00:00.000Z"), createdByUserId: "operator-user", createdByEmail: "operator-user@example.com" }).returning();

    await expect(recoverStaleKnowledgeExtractionJobs({ now: new Date("2026-07-14T00:20:00.000Z"), staleMs: 15 * 60_000 }, testDb)).resolves.toMatchObject({ recoveredCount: 0, failedCount: 1 });
    await expect(testDb.select().from(knowledgeExtractionJobs).where(eq(knowledgeExtractionJobs.id, job.id))).resolves.toMatchObject([{ status: "failed", lastErrorCode: "stale_max_attempts" }]);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "extraction_failed" }]);
  });

  test("logs stale terminal recovery with safe job metadata", async () => {
    const review = await createCapturedFacebookReview("stale-log-job");
    const [job] = await testDb.insert(knowledgeExtractionJobs).values({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", status: "running", attemptCount: 3, maxAttempts: 3, lockedAt: new Date(Date.now() - 20 * 60_000), lockedBy: "dead-worker", startedAt: new Date(Date.now() - 20 * 60_000), createdByUserId: "operator-user", createdByEmail: "operator-user@example.com" }).returning();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(runKnowledgeExtractionWorkerLoop({ once: true, workerId: "test-worker" })).resolves.toMatchObject({
      status: "no_job",
      recoveredFailures: [{ jobId: job.id, sourceId: review.sourceId, code: "stale_max_attempts", retryable: false, outcome: "failed" }],
    });

    expect(warn).toHaveBeenCalledWith("Knowledge extraction job failed", expect.objectContaining({ jobId: job.id, sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", attemptCount: 3, maxAttempts: 3, code: "stale_max_attempts", retryable: false, outcome: "failed" }));
  });

  test("source intake list exposes active async extraction job state", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createUrlSource("url-active-job");
    const actor = { userId: "operator-user", email: "operator-user@example.com" };
    const queued = await enqueueKnowledgeExtractionJob({ sourceId: "url-active-job", mode: "extract_only", actor }, testDb);

    const { listKnowledgeUrlSources } = await import("@/features/knowledge/sources");
    await expect(listKnowledgeUrlSources()).resolves.toMatchObject([{ id: "url-active-job", activeExtractionJob: { id: queued.job.id, status: "queued", mode: "extract_only" } }]);
  });

  test("one-shot worker exits when no jobs are available", async () => {
    await expect(runKnowledgeExtractionWorkerLoop({ once: true, workerId: "test-worker" })).resolves.toMatchObject({ status: "no_job" });
  });

  test("logs and persists only safe malformed-output diagnostics", async () => {
    await createExtractionModel();
    const review = await createCapturedFacebookReview("malformed-output-job");
    const rawMarker = "RAW_SOURCE_MARKER_DO_NOT_LOG";
    const modelMarker = "RAW_MODEL_MARKER_DO_NOT_LOG";
    if (!review.captureVersionId) throw new Error("Expected capture version");
    await testDb.update(sourceCaptureVersions).set({ rawText: rawMarker }).where(eq(sourceCaptureVersions.id, review.captureVersionId));
    const actor = { userId: "operator-user", email: "operator-user@example.com" };
    const queued = await enqueueKnowledgeExtractionJob({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", actor }, testDb);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ drafts: [{ type: "general_travel_tip", title: modelMarker, summary: "Bản nháp thiếu vị trí hoặc cung đường." , confidence: "community", freshness_sensitive: false }] }) } }], model: "cx/extract" }), { status: 200 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const originalAppEnv = process.env.APP_ENV;
    const originalDebugFlag = process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT;
    process.env.APP_ENV = "local";
    process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT = "false";

    try {
      await expect(runKnowledgeExtractionWorkerLoop({ once: true, workerId: "test-worker" })).resolves.toMatchObject({
        status: "failed",
        jobId: queued.job.id,
        failure: { jobId: queued.job.id, sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", attemptCount: 1, maxAttempts: 3, code: "invalid_model_output", detail: "missing_location_or_route", retryable: false, outcome: "failed" },
      });

      const [failedJob] = await testDb.select().from(knowledgeExtractionJobs).where(eq(knowledgeExtractionJobs.id, queued.job.id));
      expect(failedJob).toMatchObject({ status: "failed", lastErrorCode: "invalid_model_output", lastErrorMessage: "Extraction failed: invalid_model_output (missing_location_or_route)" });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Knowledge extraction job failed", expect.objectContaining({ jobId: queued.job.id, sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", attemptCount: 1, maxAttempts: 3, code: "invalid_model_output", detail: "missing_location_or_route", retryable: false, outcome: "failed" }));
      expect(JSON.stringify(failedJob)).not.toContain(rawMarker);
      expect(JSON.stringify(failedJob)).not.toContain(modelMarker);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(rawMarker);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(modelMarker);
    } finally {
      if (originalAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = originalAppEnv;
      if (originalDebugFlag === undefined) delete process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT;
      else process.env.AI_DEBUG_RAW_EXTRACTION_OUTPUT = originalDebugFlag;
      warn.mockRestore();
    }
  });

  test("logs a safe queued outcome for a retryable provider failure", async () => {
    await createExtractionModel();
    const review = await createCapturedFacebookReview("retryable-provider-job");
    const actor = { userId: "operator-user", email: "operator-user@example.com" };
    const queued = await enqueueKnowledgeExtractionJob({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", actor }, testDb);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(runKnowledgeExtractionWorkerLoop({ once: true, workerId: "test-worker" })).resolves.toMatchObject({
      status: "failed",
      jobId: queued.job.id,
      failure: { jobId: queued.job.id, code: "provider_failed", retryable: true, outcome: "queued" },
    });

    await expect(testDb.select().from(knowledgeExtractionJobs).where(eq(knowledgeExtractionJobs.id, queued.job.id))).resolves.toMatchObject([
      { status: "queued", lastErrorCode: "provider_failed", lastErrorMessage: "Extraction failed: provider_failed" },
    ]);
    const workerWarnings = warn.mock.calls.filter(([message]) => message === "Knowledge extraction job failed");
    expect(workerWarnings).toHaveLength(1);
    expect(workerWarnings[0]).toEqual(["Knowledge extraction job failed", expect.objectContaining({ jobId: queued.job.id, sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", attemptCount: 1, maxAttempts: 3, code: "provider_failed", detail: undefined, retryable: true, outcome: "queued" })]);
  });

  test("does not persist or log an unexpected error message", async () => {
    const review = await createCapturedFacebookReview("unexpected-worker-error");
    const rawMarker = "RAW_SOURCE_MARKER_DO_NOT_LOG";
    if (!review.captureVersionId) throw new Error("Expected capture version");
    await testDb.update(sourceCaptureVersions).set({ rawText: rawMarker }).where(eq(sourceCaptureVersions.id, review.captureVersionId));
    const [job] = await testDb.insert(knowledgeExtractionJobs).values({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, mode: "extract_only", status: "queued", resultDraftIds: ["missing-draft"], resultDraftCount: 1, createdByUserId: "operator-user", createdByEmail: "operator-user@example.com" }).returning();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(runKnowledgeExtractionWorkerLoop({ once: true, workerId: "test-worker" })).resolves.toMatchObject({
      status: "failed",
      jobId: job.id,
      failure: { jobId: job.id, code: "worker_error", detail: undefined, retryable: false, outcome: "failed" },
    });

    const [failedJob] = await testDb.select().from(knowledgeExtractionJobs).where(eq(knowledgeExtractionJobs.id, job.id));
    expect(failedJob).toMatchObject({ status: "failed", lastErrorCode: "worker_error", lastErrorMessage: "Extraction failed: worker_error" });
    expect(JSON.stringify(failedJob)).not.toContain(rawMarker);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(rawMarker);
  });

  test("approve-all retry resumes job-owned draft IDs without calling provider again", async () => {
    await createExtractionModel();
    const review = await createCapturedFacebookReview("approve-retry-owned-drafts");
    const [draft] = await testDb.insert(knowledgeCards).values({ type: "route_note", title: "Owned draft", routeSegment: "Huế - Đà Nẵng", summary: "Thông tin cộng đồng cần duyệt trước khi dùng.", confidence: "community", freshnessSensitive: false, aiPromptVersion: "source_knowledge_draft_extraction_v1", createdByUserId: "operator-user" }).returning();
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: draft.id, sourceId: review.sourceId, supportLevel: "primary" });
    const [job] = await testDb.insert(knowledgeExtractionJobs).values({ sourceId: review.sourceId, facebookCaptureReviewId: review.id, captureVersionId: review.captureVersionId, mode: "extract_and_approve_all", status: "running", attemptCount: 2, lockedAt: new Date(), lockedBy: "retry-worker", startedAt: new Date(), resultDraftIds: [draft.id], resultDraftCount: 1, createdByUserId: "operator-user", createdByEmail: "operator-user@example.com" }).returning();

    await expect(processKnowledgeExtractionJob(job.id, testDb)).resolves.toMatchObject({ status: "processed" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, draft.id))).resolves.toMatchObject([{ status: "approved", needsReview: false }]);
    await expect(testDb.select().from(facebookCaptureReviews).where(eq(facebookCaptureReviews.id, review.id))).resolves.toMatchObject([{ status: "extracted_approved" }]);
  });

  test("worker script entrypoint can be imported by vitest", async () => {
    await expect(import("../scripts/knowledge-extraction-worker")).resolves.toBeDefined();
  });
});
