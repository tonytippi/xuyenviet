import { describe, expect, it } from "vitest";
import { parseAdminFacebookCaptureDetail, parseAdminFacebookCaptureQueue, parseAdminFacebookCaptureQueueQuery, parseAdminFacebookCaptureRecaptureRequest } from "@xuyenviet/contracts";

const capture = { id: "review-1", sourceLabel: "Facebook post", displayUrl: "https://facebook.com/posts/1?token=%5Bredacted%5D", reviewStatus: "needs_review" as const, capturedAt: null, captureMethod: "visible-text", groupName: null, authorText: null, postCreatedAt: null, updatedAt: "2026-08-03T00:00:00.000Z", ingestionJob: null, operationState: "recapture_pending" as const };

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
    const queue = { status: "in_progress" as const, page: 1, pageSize: 25, totalCount: 1, counts: { in_progress: 1, needs_attention: 0, failed: 0, published: 0, suppressed: 0 }, items: [capture] };
    expect(parseAdminFacebookCaptureQueue(queue)).toEqual(queue);
    expect(parseAdminFacebookCaptureQueue({ ...queue, rawText: "secret" })).toBeNull();
    expect(parseAdminFacebookCaptureQueue({ ...queue, items: [{ ...capture, rawDiscoveryResponse: "secret" }] })).toBeNull();
    expect(parseAdminFacebookCaptureDetail({ ...capture, canRecapture: true, canRerunIngestion: false, rawMetadata: {} })).toBeNull();
  });
});
