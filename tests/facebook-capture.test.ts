import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sources, users } from "@/db/schema";
import { listQueuedFacebookSources, recordFacebookCaptureFailure, updateQueuedFacebookSourceRawText } from "@/features/knowledge/facebook-capture";

import { resetTestDatabase, testDb } from "./helpers/db";

async function createOperator() {
  await testDb.insert(users).values({ id: "operator-user", email: "operator@example.com" });
}

async function createSource(input: {
  id: string;
  kind: "facebook" | "url" | "pasted_text";
  rawText?: string | null;
  rawMetadata?: Record<string, unknown>;
  sourceType?: "community" | "curated";
  verificationStatus?: "unverified" | "verified";
  official?: boolean;
  partner?: boolean;
}) {
  await testDb.insert(sources).values({
    id: input.id,
    kind: input.kind,
    url: input.kind === "pasted_text" ? null : `https://facebook.com/groups/xuyenviet/posts/${input.id}`,
    canonicalUrl: input.kind === "pasted_text" ? null : `https://facebook.com/groups/xuyenviet/posts/${input.id}`,
    label: `Source ${input.id}`,
    sourceType: input.sourceType ?? (input.kind === "facebook" ? "community" : "curated"),
    verificationStatus: input.verificationStatus ?? "unverified",
    official: input.official ?? false,
    partner: input.partner ?? false,
    submittedByUserId: "operator-user",
  });

  await testDb.insert(rawSourceMaterial).values({
    id: `raw-${input.id}`,
    sourceId: input.id,
    rawText: input.rawText ?? null,
    rawMetadata: input.rawMetadata,
  });
}

describe("Facebook capture queue", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await createOperator();
  });

  test("lists only queued Facebook sources with null raw text", async () => {
    await createSource({ id: "queued-null", kind: "facebook", rawText: null });
    await createSource({ id: "already-captured", kind: "facebook", rawText: "Existing post text" });
    await createSource({ id: "regular-url", kind: "url", rawText: null });

    const queued = await listQueuedFacebookSources(testDb, { limit: 10 });

    expect(queued.map((source) => source.sourceId)).toEqual(["queued-null"]);
  });

  test("selects by source ID only when the source is queued Facebook", async () => {
    await createSource({ id: "queued-facebook", kind: "facebook", rawText: null });
    await createSource({ id: "url-source", kind: "url", rawText: null });
    await createSource({ id: "done-facebook", kind: "facebook", rawText: "Captured" });

    await expect(listQueuedFacebookSources(testDb, { sourceId: "queued-facebook" })).resolves.toMatchObject([{ sourceId: "queued-facebook" }]);
    await expect(listQueuedFacebookSources(testDb, { sourceId: "url-source" })).resolves.toEqual([]);
    await expect(listQueuedFacebookSources(testDb, { sourceId: "done-facebook" })).resolves.toEqual([]);
  });

  test("updates the existing raw material row with safe metadata and audit summary", async () => {
    await createSource({ id: "queued-facebook", kind: "facebook", rawText: null, rawMetadata: { submittedFrom: "intake" } });

    const result = await updateQueuedFacebookSourceRawText(testDb, {
      sourceId: "queued-facebook",
      rawText: "  Nội dung bài viết Facebook về điểm dừng chân.  ",
      captureMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-10T00:00:00.000Z",
        sourceUrl: "https://facebook.com/groups/xuyenviet/posts/queued-facebook",
        finalUrl: "https://www.facebook.com/groups/xuyenviet/posts/queued-facebook",
        authorText: "Xuyen Viet member",
        timestampText: "Hôm qua lúc 10:00",
        cookies: "must-not-store",
        localStorage: { secret: true },
        html: "<html>hidden dump</html>",
      },
      actor: { userId: "operator-user", email: "operator@example.com" },
      now: new Date("2026-07-10T00:00:00.000Z"),
    });

    expect(result.status).toBe("updated");

    const [raw] = await testDb.select().from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, "queued-facebook"));
    expect(raw.rawText).toBe("Nội dung bài viết Facebook về điểm dừng chân.");
    expect(raw.rawMetadata).toMatchObject({
      submittedFrom: "intake",
      captureMethod: "playwright_operator_browser",
      capturedAt: "2026-07-10T00:00:00.000Z",
      sourceUrl: "https://facebook.com/groups/xuyenviet/posts/queued-facebook",
      finalUrl: "https://www.facebook.com/groups/xuyenviet/posts/queued-facebook",
      authorText: "Xuyen Viet member",
      timestampText: "Hôm qua lúc 10:00",
    });
    expect(raw.rawMetadata).not.toHaveProperty("cookies");
    expect(raw.rawMetadata).not.toHaveProperty("localStorage");
    expect(raw.rawMetadata).not.toHaveProperty("html");

    const [source] = await testDb.select().from(sources).where(eq(sources.id, "queued-facebook"));
    expect(source).toMatchObject({ sourceType: "community", verificationStatus: "unverified", official: false, partner: false });

    const [audit] = await testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "raw_source_material"));
    expect(audit).toMatchObject({ operation: "update", targetId: "raw-queued-facebook" });
    expect(audit.beforeSummary).not.toContain("Nội dung bài viết");
    expect(audit.afterSummary).not.toContain("Nội dung bài viết");
  });

  test("removes unsafe existing metadata and nested diagnostics before update", async () => {
    await createSource({
      id: "metadata-facebook",
      kind: "facebook",
      rawText: null,
      rawMetadata: { submittedFrom: "intake", cookies: "old-cookie", diagnostics: { html: "<main>hidden</main>", safeCount: 1 } },
    });

    await updateQueuedFacebookSourceRawText(testDb, {
      sourceId: "metadata-facebook",
      rawText: "Visible Facebook post text",
      captureMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-10T00:00:00.000Z",
        sourceUrl: "https://facebook.com/groups/xuyenviet/posts/metadata-facebook",
        finalUrl: "https://facebook.com/groups/xuyenviet/posts/metadata-facebook",
        diagnostics: { textLength: 26, html: "<html>hidden dump</html>", cookieValue: "secret" },
      },
      actor: { userId: "operator-user", email: "operator@example.com" },
    });

    const [raw] = await testDb.select().from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, "metadata-facebook"));

    expect(raw.rawMetadata).toMatchObject({ submittedFrom: "intake", diagnostics: { textLength: 26 } });
    expect(raw.rawMetadata).not.toHaveProperty("cookies");
  });

  test("does not overwrite raw text if the row is no longer queued", async () => {
    await createSource({ id: "race-facebook", kind: "facebook", rawText: null });

    await testDb.update(rawSourceMaterial).set({ rawText: "Captured by another process" }).where(eq(rawSourceMaterial.sourceId, "race-facebook"));

    const result = await updateQueuedFacebookSourceRawText(testDb, {
      sourceId: "race-facebook",
      rawText: "New capture",
      captureMetadata: { captureMethod: "playwright_operator_browser", capturedAt: "2026-07-10T00:00:00.000Z", sourceUrl: "https://facebook.com/a", finalUrl: "https://facebook.com/a" },
    });

    expect(result).toEqual({ status: "not_queued" });
    await expect(testDb.select().from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, "race-facebook"))).resolves.toMatchObject([
      { rawText: "Captured by another process" },
    ]);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("reports skip and capture failure without database changes", async () => {
    await createSource({ id: "blocked-facebook", kind: "facebook", rawText: null });

    expect(recordFacebookCaptureFailure("blocked-facebook", "login_required")).toEqual({ sourceId: "blocked-facebook", status: "failed", reason: "login_required" });
    await expect(testDb.select().from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, "blocked-facebook"))).resolves.toMatchObject([{ rawText: null }]);
  });

  test("captured raw text remains readable by the existing extraction handoff", async () => {
    await createSource({ id: "handoff-facebook", kind: "facebook", rawText: null });

    await updateQueuedFacebookSourceRawText(testDb, {
      sourceId: "handoff-facebook",
      rawText: "Bài viết nói rằng đoạn nghỉ Đồng Hới phù hợp cho gia đình tự lái.",
      captureMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-10T00:00:00.000Z",
        sourceUrl: "https://facebook.com/groups/xuyenviet/posts/handoff-facebook",
        finalUrl: "https://facebook.com/groups/xuyenviet/posts/handoff-facebook",
      },
      actor: { userId: "operator-user", email: "operator@example.com" },
    });

    const [raw] = await testDb.select().from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, "handoff-facebook"));
    expect(raw.rawText?.trim()).toBe("Bài viết nói rằng đoạn nghỉ Đồng Hới phù hợp cho gia đình tự lái.");

    await testDb.insert(knowledgeCards).values({
      id: "handoff-draft",
      status: "draft",
      type: "route_note",
      title: "Chia chặng Đồng Hới cho gia đình",
      summary: "Đồng Hới có thể là điểm nghỉ phù hợp cho gia đình tự lái.",
      confidence: "community",
      aiPromptVersion: "test",
      createdByUserId: "operator-user",
    });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "handoff-draft", sourceId: "handoff-facebook" });

    await expect(testDb.select().from(knowledgeCardSources).where(eq(knowledgeCardSources.sourceId, "handoff-facebook"))).resolves.toMatchObject([
      { knowledgeCardId: "handoff-draft", sourceId: "handoff-facebook" },
    ]);
  });
});
