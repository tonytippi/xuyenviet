import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, rawSourceMaterial, sources, users } from "@/db/schema";
import { listQueuedYoutubeSources, parseYoutubeEvidence, saveYoutubeEvidence } from "@/features/knowledge/youtube-capture";
import { requestYoutubeEvidence } from "../scripts/youtube-capture";

import { resetTestDatabase, testDb } from "./helpers/db";

const actor = { userId: "youtube-operator", email: "youtube-operator@example.com" };
const evidence = [{ category: "attraction", claim_vi: "NovaWorld Phan Thiết có công viên nước phù hợp cho gia đình có trẻ nhỏ.", evidence_type: "both", timestamp_start_seconds: 1590, timestamp_end_seconds: 1615, confidence: "high", freshness_sensitive: true, evidence_excerpt: "NovaWorld Phan Thiết đưa các bé đến đây chơi.", uncertainty_or_condition: null }];

async function createSource(id: string, rawText: string | null = null) {
  await testDb.insert(sources).values({ id, kind: "youtube", url: "https://www.youtube.com/watch?v=abcDEF12345", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", label: "YouTube video", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: actor.userId });
  await testDb.insert(rawSourceMaterial).values({ id: `raw-${id}`, sourceId: id, rawText });
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
    await expect(saveYoutubeEvidence(testDb, { sourceId: "queued", evidence: parseYoutubeEvidence({ evidence }), metadata: { captureMethod: "gemini_youtube_url", capturedAt: "2026-07-17T00:00:00.000Z", sourceUrl: "https://www.youtube.com/watch?v=abcDEF12345", model: "gemini-3.5-flash", promptVersion: "youtube-evidence-v1", evidenceCount: 1, latencyMs: 2000, promptTokens: 150000, outputTokens: 7500, totalTokens: 157500 }, actor })).resolves.toMatchObject({ status: "updated" });
    const [raw] = await testDb.select().from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, "queued"));
    expect(raw.rawText).toContain("NovaWorld Phan Thiết");
    const [audit] = await testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "raw_source_material"));
    expect(audit.afterSummary).not.toContain("NovaWorld");
    expect(audit.afterSummary).toContain("evidenceCount: 1");
  });

  test("rejects malformed, unbounded, and transcript-like provider output", () => {
    expect(() => parseYoutubeEvidence({ evidence: [{}] })).toThrow("gemini_invalid_evidence_item");
    expect(() => parseYoutubeEvidence({ evidence: Array.from({ length: 21 }, () => evidence[0]) })).toThrow("gemini_evidence_limit_exceeded");
    expect(() => parseYoutubeEvidence({ evidence: [{ ...evidence[0], evidence_excerpt: "x".repeat(241) }] })).toThrow("gemini_invalid_evidence_item");
  });

  test("does not overwrite evidence after another worker captures it", async () => {
    await createSource("race", "Captured elsewhere");
    await expect(saveYoutubeEvidence(testDb, { sourceId: "race", evidence: parseYoutubeEvidence({ evidence }), metadata: { captureMethod: "gemini_youtube_url", capturedAt: "2026-07-17T00:00:00.000Z", sourceUrl: "https://www.youtube.com/watch?v=abcDEF12345", model: "gemini-3.5-flash", promptVersion: "youtube-evidence-v1", evidenceCount: 1, latencyMs: 1 }, actor })).resolves.toEqual({ status: "not_queued" });
  });

  test("sends the Gemini key in a header rather than the request URL", async () => {
    const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).not.toContain("secret-key");
      expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("secret-key");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ evidence }) }] } }] }), { status: 200 });
    };

    await expect(requestYoutubeEvidence("https://www.youtube.com/watch?v=abcDEF12345", "secret-key", "gemini-3.5-flash", fetchMock)).resolves.toMatchObject({ evidence: parseYoutubeEvidence({ evidence }) });
  });
});
