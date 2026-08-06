import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { createPostgresAdminFacebookCapturePort } from "@xuyenviet/database";

import { facebookCaptureReviews, knowledgeIngestionCandidates, knowledgeIngestionJobs, rawSourceMaterial, sources, userRoles } from "@/db/schema";
import { appendSourceCaptureVersion } from "@/features/knowledge/source-captures";

import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

async function createFailedCapture() {
  await testDb.insert(sources).values({ id: "source", kind: "facebook", label: "Facebook post", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, eligibility: "eligible", submittedByUserId: "operator" });
  const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "facebook", rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh.", metadata: { kind: "submitted" } });
  const [job] = await testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id));
  if (!job) throw new Error("expected ingestion job");
  await testDb.update(knowledgeIngestionJobs).set({ status: "failed", discoveryTerminal: true, attemptCount: 3, candidateCount: 1, completedCandidateCount: 1, needsOperatorCandidateCount: 1, lastErrorCode: "discovery_gateway_http_error" }).where(eq(knowledgeIngestionJobs.id, job.id));
  await testDb.insert(knowledgeIngestionCandidates).values({ ingestionJobId: job.id, sourceId: "source", captureVersionId: capture.id, fingerprint: "f".repeat(64), type: "place", title: "Điểm dừng", summary: "Có điểm dừng ngắm cảnh.", conditions: [], spanStart: 0, spanEnd: 1, extractionPromptVersion: "test", processingStatus: "completed", aiDisposition: "needs_operator", outcomeReasonCode: "verification_required" });
  await testDb.insert(rawSourceMaterial).values({ id: "raw", sourceId: "source" });
  await testDb.insert(facebookCaptureReviews).values({ id: "review", sourceId: "source", rawSourceMaterialId: "raw", captureVersionId: capture.id, status: "extraction_failed" });
  return { capture, job };
}

describe("Facebook capture ingestion rerun", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedTestOperator();
    await testDb.insert(userRoles).values({ userId: "operator", role: "operator" });
  });

  test("resets a failed current job and removes its prior candidates", async () => {
    const { job } = await createFailedCapture();

    await expect(createPostgresAdminFacebookCapturePort().rerunIngestion({ userId: "operator", email: "operator@example.com", sessionId: "session", roles: ["admin"], authorizationVersion: 1 }, "review")).resolves.toEqual({ status: "updated" });
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, job.id))).resolves.toMatchObject([{ status: "queued", discoveryTerminal: false, candidateCount: 0, completedCandidateCount: 0, needsOperatorCandidateCount: 0, failedCandidateCount: 0, attemptCount: 0, lastErrorCode: null, requeueReasonCode: "operator_rerun", claimedBy: null, fencingToken: null }]);
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.ingestionJobId, job.id))).resolves.toEqual([]);
  });

  test("allows an operator to rerun a completed current job after an extraction upgrade", async () => {
    const { job } = await createFailedCapture();
    await testDb.update(knowledgeIngestionJobs).set({ status: "completed", lastErrorCode: null }).where(eq(knowledgeIngestionJobs.id, job.id));

    const detail = await createPostgresAdminFacebookCapturePort().detail("review");
    expect(detail?.canRerunIngestion).toBe(true);

    await expect(createPostgresAdminFacebookCapturePort().rerunIngestion({ userId: "operator", email: "operator@example.com", sessionId: "session", roles: ["admin"], authorizationVersion: 1 }, "review")).resolves.toEqual({ status: "updated" });
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, job.id))).resolves.toMatchObject([{ status: "queued", discoveryTerminal: false, candidateCount: 0, completedCandidateCount: 0, attemptCount: 0, lastErrorCode: null, requeueReasonCode: "operator_rerun" }]);
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.ingestionJobId, job.id))).resolves.toEqual([]);
  });

  test("refuses to rerun a capture that is no longer current", async () => {
    const { capture } = await createFailedCapture();
    await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "facebook", rawText: "Capture mới.", metadata: { kind: "submitted" } });

    await expect(createPostgresAdminFacebookCapturePort().rerunIngestion({ userId: "operator", email: "operator@example.com", sessionId: "session", roles: ["admin"], authorizationVersion: 1 }, "review")).resolves.toEqual({ status: "stale_review" });
    await expect(testDb.select({ status: knowledgeIngestionJobs.status }).from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id))).resolves.toEqual([{ status: "failed" }]);
  });

  test("returns only the current capture and its candidates on the detail projection", async () => {
    await createFailedCapture();
    const newerCapture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "facebook", rawText: "Nội dung Facebook mới.", metadata: { kind: "submitted" } });
    const port = createPostgresAdminFacebookCapturePort();

    const detail = await port.detail("review");
    const queue = await port.list({ status: "failed", page: 1 });

    expect(detail).toMatchObject({ capture: { id: newerCapture.id, rawText: "Nội dung Facebook mới." }, candidates: [] });
    expect(JSON.stringify(queue)).not.toContain("Đèo Hải Vân có điểm dừng ngắm cảnh.");
    expect(JSON.stringify(queue)).not.toContain("Nội dung Facebook mới.");
  });

  test("returns extracted candidate content for the current capture", async () => {
    const { capture, job } = await createFailedCapture();
    await testDb.update(knowledgeIngestionJobs).set({ status: "completed", discoveryTerminal: true, candidateCount: 1, completedCandidateCount: 1, needsOperatorCandidateCount: 1, lastErrorCode: null }).where(eq(knowledgeIngestionJobs.id, job.id));

    const detail = await createPostgresAdminFacebookCapturePort().detail("review");

    expect(detail).toMatchObject({ candidates: [{ type: "place", title: "Điểm dừng", summary: "Có điểm dừng ngắm cảnh.", processingStatus: "completed", aiDisposition: "needs_operator", outcomeReasonCode: "verification_required" }] });
    expect(detail?.capture?.id).toBe(capture.id);
  });
});
