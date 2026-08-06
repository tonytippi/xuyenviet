import { describe, expect, it } from "vitest";
import { parseAdminFacebookCaptureDetail, parseAdminFacebookCaptureQueue, parseAdminFacebookCaptureQueueQuery, parseAdminFacebookCaptureRecaptureRequest } from "@xuyenviet/contracts";

const capture = { id: "review-1", sourceLabel: "Facebook post", displayUrl: "https://facebook.com/posts/1?token=%5Bredacted%5D", capturedAt: null, captureMethod: "visible-text", updatedAt: "2026-08-03T00:00:00.000Z", ingestionJob: null };

describe("admin Facebook capture direct contract", () => {
  it("bounds queue input and refuses extra query fields", () => {
    expect(parseAdminFacebookCaptureQueueQuery({ status: "failed", page: "2" })).toEqual({ status: "failed", page: 2 });
    expect(parseAdminFacebookCaptureQueueQuery({ status: "failed", page: "201" })).toBeNull();
    expect(parseAdminFacebookCaptureQueueQuery({ status: "failed", raw: "no" })).toBeNull();
  });
  it("accepts only a short explicit recapture reason", () => {
    expect(parseAdminFacebookCaptureRecaptureRequest({ reason: "Visible text was incomplete" })).toEqual({ reason: "Visible text was incomplete" });
    expect(parseAdminFacebookCaptureRecaptureRequest({ reason: "bad\nreason" })).toBeNull();
    expect(parseAdminFacebookCaptureRecaptureRequest({ reason: "x", sourceId: "ignored" })).toBeNull();
  });
  it("rejects raw fields from safe queue and detail projections", () => {
    const queue = { status: "queued" as const, page: 1, pageSize: 25, totalCount: 1, counts: { queued: 1, running: 0, completed: 0, failed: 0, not_started: 0 }, items: [capture] };
    expect(parseAdminFacebookCaptureQueue(queue)).toEqual(queue);
    expect(parseAdminFacebookCaptureQueue({ ...queue, rawText: "secret" })).toBeNull();
    expect(parseAdminFacebookCaptureQueue({ ...queue, items: [{ ...capture, rawDiscoveryResponse: "secret" }] })).toBeNull();
    expect(parseAdminFacebookCaptureQueue({ ...queue, items: [{ ...capture, displayUrl: "https://user:password@facebook.com/posts/1" }] })).toBeNull();
    expect(parseAdminFacebookCaptureQueue({ ...queue, items: [{ ...capture, displayUrl: "https://facebook.com/posts/1?continue=provider-payload" }] })).toBeNull();
    expect(parseAdminFacebookCaptureDetail({ ...capture, capture: null, candidates: [], canRecapture: true, canRerunIngestion: false, rawMetadata: {} })).toBeNull();
    expect(parseAdminFacebookCaptureDetail({ ...capture, capture: { id: "capture-1", capturedAt: "2026-08-03T00:00:00.000Z", captureMethod: "visible-text", rawText: "Nội dung đã thu thập." }, candidates: [{ type: "place", title: "Điểm dừng", summary: "Có điểm dừng ngắm cảnh.", processingStatus: "completed", aiDisposition: "needs_operator", outcomeReasonCode: "verification_required", card: { id: "card-1", lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none" } }], canRecapture: true, canRerunIngestion: false })).not.toBeNull();
    expect(parseAdminFacebookCaptureDetail({ ...capture, capture: { id: "capture-1", capturedAt: "2026-08-03T00:00:00.000Z", captureMethod: "visible-text", rawText: "x".repeat(120_001) }, candidates: [], canRecapture: true, canRerunIngestion: false })).toBeNull();
  });
  it("accepts safe ingestion codes and rejects unsafe diagnostics", () => {
    const failedCapture = { ...capture, ingestionJob: { status: "failed" as const, updatedAt: "2026-08-03T00:00:00.000Z", lastErrorCode: "discovery_gateway_http_error", candidateCount: 0, completedCandidateCount: 0, needsOperatorCandidateCount: 0, failedCandidateCount: 0 } };
    const queue = { status: "failed" as const, page: 1, pageSize: 25, totalCount: 1, counts: { queued: 0, running: 0, completed: 0, failed: 1, not_started: 0 }, items: [failedCapture] };
    expect(parseAdminFacebookCaptureQueue(queue)).toEqual(queue);
    expect(parseAdminFacebookCaptureQueue({ ...queue, items: [{ ...failedCapture, ingestionJob: { ...failedCapture.ingestionJob, lastErrorCode: "unknown_error" } }] })).toBeNull();
    expect(parseAdminFacebookCaptureQueue({ ...queue, items: [{ ...failedCapture, ingestionJob: { ...failedCapture.ingestionJob, lastErrorCode: "Provider returned raw payload" } }] })).toBeNull();
  });
  it("accepts safe evidence-validation diagnostics", () => {
    const failedCapture = { ...capture, ingestionJob: { status: "failed" as const, updatedAt: "2026-08-03T00:00:00.000Z", lastErrorCode: "discovery_ungrounded_evidence", candidateCount: 0, completedCandidateCount: 0, needsOperatorCandidateCount: 0, failedCandidateCount: 0 } };
    const queue = { status: "failed" as const, page: 1, pageSize: 25, totalCount: 1, counts: { queued: 0, running: 0, completed: 0, failed: 1, not_started: 0 }, items: [failedCapture] };

    expect(parseAdminFacebookCaptureQueue(queue)).toEqual(queue);
  });
});
