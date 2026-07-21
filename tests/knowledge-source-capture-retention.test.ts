import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, sourceCaptureVersions, sources, userRoles, users } from "@/db/schema";
import { hashCaptureText, retainExpiredFacebookCaptureVersions } from "@/features/knowledge/source-captures";

import { resetTestDatabase, testDb } from "./helpers/db";

async function createCandidate(id: string, capturedAt: Date) {
  await testDb.insert(sources).values({ id, kind: "facebook", url: `https://facebook.com/${id}`, label: id, sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
  await testDb.insert(sourceCaptureVersions).values({ id: `version-${id}`, sourceId: id, versionSequence: 1, captureKind: "facebook", rawText: "Operator-only capture", rawMetadata: { kind: "facebook_operator", captureMethod: "playwright_operator_browser", capturedAt: capturedAt.toISOString(), sourceUrl: `https://facebook.com/${id}`, finalUrl: `https://facebook.com/${id}` }, contentHash: hashCaptureText("Operator-only capture"), capturedAt });
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
});
