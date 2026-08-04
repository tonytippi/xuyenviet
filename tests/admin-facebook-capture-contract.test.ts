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
    expect(parseAdminFacebookCaptureDetail({ ...capture, candidates: [], canRecapture: true, canRerunIngestion: false, rawMetadata: {} })).toBeNull();
    expect(parseAdminFacebookCaptureDetail({ ...capture, candidates: [{ processingStatus: "completed", aiDisposition: "needs_operator", outcomeReasonCode: "verification_required", card: { id: "card-1", lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none" } }], canRecapture: true, canRerunIngestion: false })).not.toBeNull();
  });
});
