import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, knowledgeCardSearchDocuments, knowledgeCardSources, knowledgeCards, knowledgeIndexDirtyMarkers, knowledgeIngestionJobs, rawSourceMaterial, sourceCaptureVersions, sources, users } from "@/db/schema";
import { listQueuedYoutubeSources, maxYoutubeEvidenceItemsPerVideo, maxYoutubeEvidenceItemsPerWindow, parseYoutubeEvidence, recordYoutubeCaptureFailure, saveYoutubeEvidence, serializeYoutubeEvidence } from "@/features/knowledge/youtube-capture";
import { getYoutubeMediaResolution, mergeYoutubeWindowEvidence, normalizeYoutubeWindowTimestamps, parseCachedYoutubePayload, parseCachedYoutubeSegmentPayload, parseYoutubeDuration, requestYoutubeEvidence, requestYoutubeTitle, retainedYoutubeEvidenceItemsPerWindow, youtubeWindows } from "../scripts/youtube-capture";

import { resetTestDatabase, testDb } from "./helpers/db";
import { seedSourceCaptureVersion } from "./helpers/source-captures";

const actor = { userId: "youtube-operator", email: "youtube-operator@example.com" };
const evidence = [{ category: "attraction", claim_vi: "NovaWorld Phan Thiết có công viên nước phù hợp cho gia đình có trẻ nhỏ.", evidence_type: "both", timestamp_start_seconds: 1590, timestamp_end_seconds: 1615, confidence: "high", freshness_sensitive: true, evidence_excerpt: "NovaWorld Phan Thiết đưa các bé đến đây chơi.", uncertainty_or_condition: null }];

async function createSource(id: string, rawText: string | null = null) {
  await testDb.insert(sources).values({ id, kind: "youtube", url: "https://www.youtube.com/watch?v=abcDEF12345", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", label: "YouTube video", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: actor.userId });
  await testDb.insert(rawSourceMaterial).values({ id: `raw-${id}`, sourceId: id });
  if (rawText) await seedSourceCaptureVersion({ sourceId: id, captureKind: "youtube", rawText, rawMetadata: { kind: "youtube", captureMethod: "gemini_youtube_url" } });
}

describe("YouTube capture", () => {
  beforeEach(async () => { await resetTestDatabase(); await testDb.insert(users).values({ id: actor.userId, email: actor.email }); });

  test("queues only YouTube sources without evidence", async () => {
    await createSource("queued");
    await createSource("captured", "Existing evidence");
    expect((await listQueuedYoutubeSources(testDb, { limit: 10 })).map((source) => source.sourceId)).toEqual(["queued"]);
  });

  test("persists bounded evidence and a content-free audit summary", async () => {
    await createSource("queued");
    await expect(saveYoutubeEvidence(testDb, { sourceId: "queued", evidence: parseYoutubeEvidence({ evidence }), metadata: { captureMethod: "gemini_youtube_url", capturedAt: "2026-07-17T00:00:00.000Z", sourceUrl: "https://www.youtube.com/watch?v=abcDEF12345", model: "gemini-3.5-flash", mediaResolution: "MEDIA_RESOLUTION_LOW", promptVersion: "youtube-evidence-v1", evidenceCount: 1, latencyMs: 2000, promptTokens: 150000, outputTokens: 7500, totalTokens: 157500 }, actor, title: "Hành trình qua Phan Thiết" })).resolves.toMatchObject({ status: "updated" });
    const [raw] = await testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, "queued"));
    expect(raw.rawText).toContain("NovaWorld Phan Thiết");
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, raw.id))).resolves.toMatchObject([{ stage: "queued" }]);
    await expect(testDb.select({ label: sources.label }).from(sources).where(eq(sources.id, "queued"))).resolves.toEqual([{ label: "Hành trình qua Phan Thiết" }]);
    const [audit] = await testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "source_capture_version"));
    expect(audit.afterSummary).not.toContain("NovaWorld");
    expect(audit.afterSummary).toContain("evidenceCount: 1");
  });

  test("invalidates linked search projections when a YouTube title changes", async () => {
    await createSource("linked");
    await testDb.insert(knowledgeCards).values({ id: "linked-card", type: "place", title: "Điểm dừng", locationName: "Huế", summary: "Tóm tắt", aiPromptVersion: "test", createdByUserId: actor.userId });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "linked-card", sourceId: "linked", supportLevel: "primary" });
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: "linked-card", contentVersion: 1, acceptedFence: "legacy", status: "active", searchableText: "YouTube video", textHash: "b".repeat(64), sourceCount: 1, confidence: "community", freshnessSensitive: false });
    await saveYoutubeEvidence(testDb, { sourceId: "linked", evidence: parseYoutubeEvidence({ evidence }), metadata: { captureMethod: "gemini_youtube_url", capturedAt: "2026-07-17T00:00:00.000Z", sourceUrl: "https://www.youtube.com/watch?v=abcDEF12345", model: "gemini-3.5-flash", mediaResolution: "MEDIA_RESOLUTION_LOW", promptVersion: "youtube-evidence-v1", evidenceCount: 1, latencyMs: 1 }, actor, title: "Tiêu đề mới" });
    await expect(testDb.select({ contentVersion: knowledgeCards.contentVersion }).from(knowledgeCards).where(eq(knowledgeCards.id, "linked-card"))).resolves.toEqual([{ contentVersion: 2 }]);
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, "linked-card"))).resolves.toMatchObject([{ status: "disabled" }]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "linked-card"))).resolves.toMatchObject([{ contentVersion: 2, status: "pending" }]);
  });

  test("records a safe audit outcome when Gemini capture fails", async () => {
    await createSource("failed");
    await recordYoutubeCaptureFailure(testDb, { sourceId: "failed", reason: "gemini_http_400", actor });

    const [audit] = await testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "youtube_capture"));
    expect(audit).toMatchObject({ targetId: "failed", afterSummary: "YouTube capture failed: gemini_http_400." });
    await expect(testDb.select({ rawText: rawSourceMaterial.rawText }).from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, "failed"))).resolves.toEqual([{ rawText: null }]);
  });

  test("keeps a failed window number in the safe audit code", async () => {
    await createSource("segment-failed");
    await recordYoutubeCaptureFailure(testDb, { sourceId: "segment-failed", reason: "youtube_segment_2_gemini_http_429", actor });

    const [audit] = await testDb.select().from(auditEvents).where(eq(auditEvents.targetId, "segment-failed"));
    expect(audit.afterSummary).toBe("YouTube capture failed: youtube_segment_2_gemini_http_429.");
  });

  test("rejects malformed, unbounded, and transcript-like provider output", () => {
    expect(() => parseYoutubeEvidence({ evidence: [{}] })).toThrow("gemini_invalid_evidence_item_1_category");
    expect(() => parseYoutubeEvidence({ evidence: Array.from({ length: maxYoutubeEvidenceItemsPerVideo + 1 }, () => evidence[0]) })).toThrow("gemini_evidence_limit_exceeded");
    expect(() => parseYoutubeEvidence({ evidence: [{ ...evidence[0], evidence_excerpt: "x".repeat(241) }] })).toThrow("gemini_invalid_evidence_item_1_evidence_excerpt");
    expect(() => parseYoutubeEvidence({ evidence: [{ ...evidence[0], freshness_sensitive: "yes" }] })).toThrow("gemini_invalid_evidence_item_1_freshness_sensitive");
  });

  test("does not overwrite evidence after another worker captures it", async () => {
    await createSource("race", "Captured elsewhere");
    await expect(saveYoutubeEvidence(testDb, { sourceId: "race", evidence: parseYoutubeEvidence({ evidence }), metadata: { captureMethod: "gemini_youtube_url", capturedAt: "2026-07-17T00:00:00.000Z", sourceUrl: "https://www.youtube.com/watch?v=abcDEF12345", model: "gemini-3.5-flash", mediaResolution: "MEDIA_RESOLUTION_LOW", promptVersion: "youtube-evidence-v1", evidenceCount: 1, latencyMs: 1 }, actor })).resolves.toEqual({ status: "not_queued" });
  });

  test("sends the Gemini key in a header rather than the request URL", async () => {
    const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).not.toContain("secret-key");
      expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("secret-key");
      expect(JSON.parse(String(init?.body)).generationConfig.mediaResolution).toBe("MEDIA_RESOLUTION_LOW");
      expect(JSON.parse(String(init?.body)).contents[0].parts[0].video_metadata).toEqual({ start_offset: "1800s", end_offset: "3600s" });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ evidence: [{ ...evidence[0], timestamp_start_seconds: 3390, timestamp_end_seconds: 3415 }] }) }] } }] }), { status: 200 });
    };

    await expect(requestYoutubeEvidence("https://www.youtube.com/watch?v=abcDEF12345", "secret-key", "gemini-3.5-flash", { startOffsetSeconds: 1800, endOffsetSeconds: 3600 }, undefined, fetchMock)).resolves.toMatchObject({ evidence: parseYoutubeEvidence({ evidence }) });
  });

  test("reports only the Gemini error status without changing the failure code", async () => {
    const fetchMock = async () => new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "Invalid file URI; api_key=provider-secret; Authorization: Bearer provider-token" } }), { status: 400 });

    await expect(requestYoutubeEvidence("https://www.youtube.com/watch?v=abcDEF12345", "secret-key", "gemini-3.5-flash", { startOffsetSeconds: 0, endOffsetSeconds: 30 }, undefined, fetchMock)).rejects.toMatchObject({ message: "gemini_http_400", diagnostic: "INVALID_ARGUMENT" });
  });

  test("normalizes Gemini absolute timestamps to their requested window", () => {
    const window = { startOffsetSeconds: 7200, endOffsetSeconds: 9000 };
    const item = parseYoutubeEvidence({ evidence })[0];
    expect(normalizeYoutubeWindowTimestamps([{ ...item, timestamp_start_seconds: 7260, timestamp_end_seconds: 7290 }], window)).toMatchObject([{ timestamp_start_seconds: 60, timestamp_end_seconds: 90 }]);
    expect(() => normalizeYoutubeWindowTimestamps([{ ...item, timestamp_start_seconds: 60, timestamp_end_seconds: 90 }], window)).toThrow("gemini_window_timestamp_out_of_range");
    expect(() => normalizeYoutubeWindowTimestamps([{ ...item, timestamp_start_seconds: 1790, timestamp_end_seconds: 1800 }], window)).toThrow("gemini_window_timestamp_out_of_range");
  });

  test("uses only supported configured media resolutions", () => {
    expect(getYoutubeMediaResolution()).toBe("MEDIA_RESOLUTION_LOW");
    expect(getYoutubeMediaResolution("MEDIA_RESOLUTION_MEDIUM")).toBe("MEDIA_RESOLUTION_MEDIUM");
    expect(() => getYoutubeMediaResolution("low")).toThrow("GEMINI_YOUTUBE_MEDIA_RESOLUTION must be");
  });

  test("returns a safe YouTube oEmbed title without blocking on lookup failure", async () => {
    const fetchMock = async () => new Response(JSON.stringify({ title: "  Đường ven biển\nPhan Thiết  " }), { status: 200 });
    await expect(requestYoutubeTitle("https://www.youtube.com/watch?v=abcDEF12345", fetchMock)).resolves.toBe("Đường ven biển Phan Thiết");
    await expect(requestYoutubeTitle("https://www.youtube.com/watch?v=abcDEF12345", async () => new Response(null, { status: 404 }))).resolves.toBeNull();
  });

  test("safely parses YouTube ISO 8601 durations and creates bounded windows", () => {
    expect(parseYoutubeDuration("PT1H2M3S")).toBe(3723);
    expect(parseYoutubeDuration("PT30M")).toBe(1800);
    expect(parseYoutubeDuration("PT0S")).toBeNull();
    expect(parseYoutubeDuration("P1D")).toBeNull();
    expect(parseYoutubeDuration("PT999999999999999999999S")).toBeNull();
    expect(youtubeWindows(3723)).toEqual([{ startOffsetSeconds: 0, endOffsetSeconds: 1800 }, { startOffsetSeconds: 1800, endOffsetSeconds: 3600 }, { startOffsetSeconds: 3600, endOffsetSeconds: 3723 }]);
  });

  test("retains evidence from every window while enforcing each window and video cap", () => {
    const duplicate = { ...parseYoutubeEvidence({ evidence })[0], timestamp_start_seconds: 0, timestamp_end_seconds: 5 };
    const items = Array.from({ length: maxYoutubeEvidenceItemsPerWindow }, (_, index) => ({ ...duplicate, claim_vi: `Điểm dừng ${index}`, timestamp_start_seconds: index + 10, timestamp_end_seconds: index + 11 }));
    const merged = mergeYoutubeWindowEvidence(Array.from({ length: 9 }, (_, windowIndex) => ({ window: { startOffsetSeconds: windowIndex * 1800, endOffsetSeconds: (windowIndex + 1) * 1800 }, evidence: items })));
    expect(merged).toHaveLength(maxYoutubeEvidenceItemsPerVideo);
    expect(merged.filter((item) => item.timestamp_start_seconds < 1800)).toHaveLength(9);
    expect(merged.filter((item) => item.timestamp_start_seconds >= 1800 && item.timestamp_start_seconds < 3600)).toHaveLength(9);
    expect(merged.filter((item) => item.timestamp_start_seconds >= 14_400)).toHaveLength(8);
    expect(retainedYoutubeEvidenceItemsPerWindow).toBe(10);
  });

  test("samples time-spanning windows when a video has more non-empty windows than the video cap", () => {
    const item = parseYoutubeEvidence({ evidence })[0];
    const merged = mergeYoutubeWindowEvidence(Array.from({ length: maxYoutubeEvidenceItemsPerVideo + 1 }, (_, windowIndex) => ({ window: { startOffsetSeconds: windowIndex * 1800, endOffsetSeconds: (windowIndex + 1) * 1800 }, evidence: [{ ...item, timestamp_start_seconds: 0, timestamp_end_seconds: 5 }] })));

    expect(merged).toHaveLength(maxYoutubeEvidenceItemsPerVideo);
    expect(merged[0].timestamp_start_seconds).toBe(0);
    expect(merged.at(-1)?.timestamp_start_seconds).toBe(maxYoutubeEvidenceItemsPerVideo * 1800);
  });

  test("serializes the full bounded video evidence bundle", () => {
    const item = parseYoutubeEvidence({ evidence })[0];
    const bundle = Array.from({ length: maxYoutubeEvidenceItemsPerVideo }, (_, index) => ({ ...item, claim_vi: "x".repeat(500), evidence_excerpt: "y".repeat(240), uncertainty_or_condition: "z".repeat(400), timestamp_start_seconds: index, timestamp_end_seconds: index + 1 }));

    expect(serializeYoutubeEvidence(bundle).length).toBeLessThanOrEqual(120_000);
  });

  test("accepts empty evidence only in a segment cache payload", () => {
    expect(parseCachedYoutubeSegmentPayload({ evidence: [], window: { startOffsetSeconds: 0, endOffsetSeconds: 30 }, metadata: {} })).toMatchObject({ evidence: [] });
  });

  test("rejects cached segment evidence outside its stored window", () => {
    expect(() => parseCachedYoutubeSegmentPayload({ evidence: [{ ...evidence[0], timestamp_start_seconds: 29, timestamp_end_seconds: 31 }], window: { startOffsetSeconds: 0, endOffsetSeconds: 30 }, metadata: {} })).toThrow("cache_invalid_youtube_segment_payload");
  });

  test("keeps the provider's per-window evidence limit when reading cached segments", () => {
    expect(() => parseCachedYoutubeSegmentPayload({ evidence: Array.from({ length: maxYoutubeEvidenceItemsPerWindow + 1 }, () => evidence[0]), window: { startOffsetSeconds: 0, endOffsetSeconds: 1800 }, metadata: {} })).toThrow("gemini_evidence_limit_exceeded");
  });

  test("rejects cached aggregate evidence outside its stored duration", () => {
    expect(() => parseCachedYoutubePayload({ evidence: [{ ...evidence[0], timestamp_start_seconds: 29, timestamp_end_seconds: 31 }], metadata: { videoDurationSeconds: 30 } })).toThrow("cache_invalid_youtube_payload");
  });
});
