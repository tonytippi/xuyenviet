import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeExtractionJobs, knowledgeIngestionJobs, rawSourceMaterial, sourceCaptureVersions, sources, userRoles, users } from "@/db/schema";
import { hashCaptureText, retainExpiredFacebookCaptureVersions, validateSafeCaptureMetadata } from "@/features/knowledge/source-captures";

import { resetTestDatabase, testDb } from "./helpers/db";

async function createCandidate(id: string, capturedAt: Date, kind: "facebook" | "pasted_text" = "facebook") {
  await testDb.insert(sources).values({ id, kind, ...(kind === "facebook" ? { url: `https://facebook.com/${id}` } : {}), label: id, sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
  await testDb.insert(sourceCaptureVersions).values({ id: `version-${id}`, sourceId: id, versionSequence: 1, captureKind: kind, rawText: "Operator-only capture", rawMetadata: kind === "facebook" ? { kind: "facebook_operator", captureMethod: "playwright_operator_browser", capturedAt: capturedAt.toISOString(), sourceUrl: `https://facebook.com/${id}`, finalUrl: `https://facebook.com/${id}` } : { kind: "submitted" }, contentHash: hashCaptureText("Operator-only capture"), capturedAt });
  await testDb.update(sources).set({ currentCaptureVersionId: `version-${id}` }).where(eq(sources.id, id));
}

describe("source capture retention", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
    await testDb.insert(userRoles).values({ userId: "operator", role: "operator" });
  });

  test("retains a 179-day capture and tombstones an eligible 180-day current capture", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    await createCandidate("old", new Date("2026-01-22T00:00:00.000Z"));
    await createCandidate("recent", new Date("2026-01-23T00:00:00.000Z"));
    await expect(retainExpiredFacebookCaptureVersions({ actorUserId: "operator", actorEmail: "operator@example.com", dryRun: true, now }, testDb)).resolves.toMatchObject({ tombstonedVersionIds: ["version-old"] });
    await expect(testDb.select({ rawText: sourceCaptureVersions.rawText }).from(sourceCaptureVersions).where(eq(sourceCaptureVersions.id, "version-old"))).resolves.toEqual([{ rawText: "Operator-only capture" }]);
    await retainExpiredFacebookCaptureVersions({ actorUserId: "operator", actorEmail: "operator@example.com", dryRun: false, now }, testDb);
    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.id, "version-old"))).resolves.toMatchObject([{ id: "version-old", rawText: null, rawMetadata: null, payloadDeletedAt: now }]);
    await expect(testDb.select({ currentCaptureVersionId: sources.currentCaptureVersionId }).from(sources).where(eq(sources.id, "old"))).resolves.toEqual([{ currentCaptureVersionId: null }]);
    await expect(testDb.select({ rawText: sourceCaptureVersions.rawText }).from(sourceCaptureVersions).where(eq(sourceCaptureVersions.id, "version-recent"))).resolves.toEqual([{ rawText: "Operator-only capture" }]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "source_capture_version_retention"))).resolves.toHaveLength(1);
  });

  test("requires a matching actor and is idempotent", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    await createCandidate("old", new Date("2026-01-22T00:00:00.000Z"));
    await expect(retainExpiredFacebookCaptureVersions({ actorUserId: "operator", actorEmail: "wrong@example.com", dryRun: false, now }, testDb)).rejects.toThrow("matching existing user");
    await retainExpiredFacebookCaptureVersions({ actorUserId: "operator", actorEmail: "operator@example.com", dryRun: false, now }, testDb);
    await expect(retainExpiredFacebookCaptureVersions({ actorUserId: "operator", actorEmail: "operator@example.com", dryRun: false, now }, testDb)).resolves.toMatchObject({ tombstonedVersionIds: [] });
  });

  test("tombstones inactive non-Facebook captures and their migrated legacy payload", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    await createCandidate("legacy", new Date("2026-01-22T00:00:00.000Z"), "pasted_text");
    await testDb.insert(rawSourceMaterial).values({ sourceId: "legacy", rawText: "Operator-only capture" });

    await expect(retainExpiredFacebookCaptureVersions({ actorUserId: "operator", actorEmail: "operator@example.com", dryRun: false, now }, testDb)).resolves.toMatchObject({ tombstonedVersionIds: ["version-legacy"] });
    await expect(testDb.select({ rawText: sourceCaptureVersions.rawText }).from(sourceCaptureVersions).where(eq(sourceCaptureVersions.id, "version-legacy"))).resolves.toEqual([{ rawText: null }]);
    await expect(testDb.select({ rawText: rawSourceMaterial.rawText }).from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, "legacy"))).resolves.toEqual([{ rawText: null }]);
  });

  test("does not retain an expired capture only because a newer version supports a card", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    await createCandidate("recaptured", new Date("2026-01-22T00:00:00.000Z"));
    await testDb.insert(sourceCaptureVersions).values({ id: "version-recaptured-new", sourceId: "recaptured", versionSequence: 2, captureKind: "facebook", rawText: "New capture", rawMetadata: { kind: "facebook_operator", captureMethod: "playwright_operator_browser", capturedAt: now.toISOString(), sourceUrl: "https://facebook.com/recaptured", finalUrl: "https://facebook.com/recaptured" }, contentHash: hashCaptureText("New capture"), capturedAt: now });
    await testDb.update(sources).set({ currentCaptureVersionId: "version-recaptured-new" }).where(eq(sources.id, "recaptured"));
    await testDb.insert(knowledgeCards).values({ id: "active-card", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm dừng", summary: "Điểm dừng hợp lệ.", locationName: "Huế", confidence: "community", needsReview: false, aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "active-card", sourceId: "recaptured", supportLevel: "primary" });
    await testDb.insert(knowledgeCardEvidence).values({ knowledgeCardId: "active-card", sourceId: "recaptured", captureVersionId: "version-recaptured-new", quoteText: "New capture", spanStart: 0, spanEnd: 11, observedAt: now, capturedAt: now, independenceKey: "recaptured" });

    await expect(retainExpiredFacebookCaptureVersions({ actorUserId: "operator", actorEmail: "operator@example.com", dryRun: false, now }, testDb)).resolves.toMatchObject({ tombstonedVersionIds: ["version-recaptured"] });
  });

  test("rejects traveler actors and blocks unbackfilled active jobs", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    await testDb.insert(users).values({ id: "traveler", email: "traveler@example.com" });
    await testDb.insert(userRoles).values({ userId: "traveler", role: "traveler" });
    await createCandidate("blocked", new Date("2026-01-22T00:00:00.000Z"));
    await testDb.insert(knowledgeExtractionJobs).values({
      sourceId: "blocked",
      mode: "extract_only",
      status: "queued",
      createdByUserId: "operator",
      createdByEmail: "operator@example.com",
    });

    await expect(retainExpiredFacebookCaptureVersions({ actorUserId: "traveler", actorEmail: "traveler@example.com", dryRun: false, now }, testDb)).rejects.toThrow("matching existing user");
    await expect(retainExpiredFacebookCaptureVersions({ actorUserId: "operator", actorEmail: "operator@example.com", dryRun: false, now }, testDb)).resolves.toMatchObject({ blockedVersionIds: ["version-blocked"] });
    await expect(testDb.select({ rawText: sourceCaptureVersions.rawText }).from(sourceCaptureVersions).where(eq(sourceCaptureVersions.id, "version-blocked"))).resolves.toEqual([{ rawText: "Operator-only capture" }]);
  });

  test("blocks canonical queued, claimed, and expired-unrecovered jobs but permits terminal jobs", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    await createCandidate("queued", new Date("2026-01-22T00:00:00.000Z"));
    await createCandidate("claimed", new Date("2026-01-22T00:00:00.000Z"));
    await createCandidate("terminal", new Date("2026-01-22T00:00:00.000Z"));
    await testDb.insert(knowledgeIngestionJobs).values([
      { sourceId: "queued", captureVersionId: "version-queued", submittedByUserId: "operator", submittedByEmail: "operator@example.com" },
      { sourceId: "claimed", captureVersionId: "version-claimed", submittedByUserId: "operator", submittedByEmail: "operator@example.com", claimedBy: "dead-worker", claimedAt: new Date("2026-01-01T00:00:00.000Z"), leaseExpiresAt: new Date("2026-01-01T00:15:00.000Z"), fencingToken: "b".repeat(64) },
      { sourceId: "terminal", captureVersionId: "version-terminal", submittedByUserId: "operator", submittedByEmail: "operator@example.com", stage: "published" },
    ]);

    await expect(retainExpiredFacebookCaptureVersions({ actorUserId: "operator", actorEmail: "operator@example.com", dryRun: false, now }, testDb)).resolves.toMatchObject({ blockedVersionIds: expect.arrayContaining(["version-queued", "version-claimed"]), tombstonedVersionIds: ["version-terminal"] });
  });

  test("rejects unknown metadata kinds and nested metadata values", () => {
    expect(() => validateSafeCaptureMetadata("youtube", { kind: "unknown" } as never)).toThrow("kind is invalid");
    expect(() => validateSafeCaptureMetadata("youtube", {
      kind: "youtube",
      captureMethod: "gemini_youtube_url",
      capturedAt: "2026-07-21T00:00:00.000Z",
      sourceUrl: "https://youtube.com/watch?v=abc",
      model: "gemini",
      mediaResolution: "MEDIA_RESOLUTION_LOW",
      promptVersion: "v1",
      evidenceCount: 1,
      latencyMs: 10,
      captureArtifactId: { providerPayload: "secret" },
    } as never)).toThrow("invalid");
  });
});
