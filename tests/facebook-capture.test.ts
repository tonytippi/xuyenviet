import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { auditEvents, knowledgeCards, knowledgeCardSources, rawSourceMaterial, sources, users } from "@/db/schema";
import { listQueuedFacebookSources, normalizeDiscoveredFacebookPosts, queueDiscoveredFacebookPosts, recordFacebookCaptureFailure, updateQueuedFacebookSourceRawText } from "@/features/knowledge/facebook-capture";
import { facebookCaptureLockIds } from "@/features/knowledge/facebook-capture-locks";

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
        groupName: "Cộng đồng Xuyên Việt",
        timestampText: "Hôm qua lúc 10:00",
        postCreatedAt: "2026-07-09T10:00:00.000Z",
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
      groupName: "Cộng đồng Xuyên Việt",
      timestampText: "Hôm qua lúc 10:00",
      postCreatedAt: "2026-07-09T10:00:00.000Z",
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

  test("uses a resolved Facebook permalink as the source canonical URL", async () => {
    await createSource({ id: "redirected-facebook", kind: "facebook", rawText: null });

    await updateQueuedFacebookSourceRawText(testDb, {
      sourceId: "redirected-facebook",
      rawText: "Visible Facebook post text",
      captureMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-16T00:00:00.000Z",
        sourceUrl: "https://facebook.com/share/p/redirected-facebook",
        finalUrl: "https://www.facebook.com/groups/xuyenviet/posts/123?fbclid=ignored",
      },
    });

    await expect(testDb.select({ url: sources.url, canonicalUrl: sources.canonicalUrl }).from(sources).where(eq(sources.id, "redirected-facebook"))).resolves.toEqual([
      {
        url: "https://facebook.com/groups/xuyenviet/posts/redirected-facebook",
        canonicalUrl: "https://facebook.com/groups/xuyenviet/posts/123",
      },
    ]);
  });

  test("skips a capture that resolves to an existing canonical Facebook source", async () => {
    await createSource({ id: "existing-facebook", kind: "facebook", rawText: "Existing post text" });
    await testDb.update(sources).set({ canonicalUrl: "https://web.facebook.com/groups/xuyenviet/posts/123?fbclid=ignored" }).where(eq(sources.id, "existing-facebook"));
    await createSource({ id: "duplicate-facebook", kind: "facebook", rawText: null });

    const result = await updateQueuedFacebookSourceRawText(testDb, {
      sourceId: "duplicate-facebook",
      rawText: "Duplicate post text that must not be saved",
      captureMetadata: {
        captureMethod: "playwright_operator_browser",
        capturedAt: "2026-07-16T00:00:00.000Z",
        sourceUrl: "https://facebook.com/share/p/duplicate-facebook",
        finalUrl: "https://www.facebook.com/groups/xuyenviet/posts/123?fbclid=ignored",
      },
      actor: { userId: "operator-user", email: "operator@example.com" },
    });

    expect(result).toEqual({ status: "duplicate", duplicateSourceId: "existing-facebook" });
    await expect(testDb.select({ label: sources.label, canonicalUrl: sources.canonicalUrl }).from(sources).where(eq(sources.id, "duplicate-facebook"))).resolves.toEqual([
      {
        label: "Duplicate source existing-facebook",
        canonicalUrl: "https://facebook.com/groups/xuyenviet/posts/duplicate-facebook",
      },
    ]);
    await expect(testDb.select({ rawText: rawSourceMaterial.rawText, rawMetadata: rawSourceMaterial.rawMetadata }).from(rawSourceMaterial).where(eq(rawSourceMaterial.sourceId, "duplicate-facebook"))).resolves.toEqual([
      {
        rawText: null,
        rawMetadata: {
          duplicateSourceId: "existing-facebook",
          duplicateCanonicalUrl: "https://facebook.com/groups/xuyenviet/posts/123",
        },
      },
    ]);
    await expect(listQueuedFacebookSources(testDb, { limit: 10 })).resolves.not.toContainEqual(expect.objectContaining({ sourceId: "duplicate-facebook" }));
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

  test("queues shared Facebook post links and skips sources already present", async () => {
    await createSource({ id: "summary", kind: "facebook", rawText: "Summary post" });
    await createSource({ id: "existing-post", kind: "facebook", rawText: null });
    await testDb.update(sources).set({
      url: "https://www.facebook.com/share/p/existing",
      canonicalUrl: "https://www.facebook.com/share/p/existing",
    }).where(eq(sources.id, "existing-post"));

    const result = await queueDiscoveredFacebookPosts(testDb, {
      sourceId: "summary",
      sourceUrl: "https://web.facebook.com/share/p/summary/",
      urls: [
      "https://web.facebook.com/share/p/new-post/?fbclid=ignored&rdid=ignored",
        "https://m.facebook.com/share/p/existing/?fbclid=ignored",
        "https://web.facebook.com/share/p/new-post/",
        "https://web.facebook.com/groups/xuyenviet",
        "https://example.com/not-facebook",
      ],
      actor: { userId: "operator-user", email: "operator@example.com" },
    });

    expect(result).toEqual({ queuedCount: 1, duplicateCount: 1 });
    await expect(listQueuedFacebookSources(testDb, { limit: 10 })).resolves.toMatchObject([
      { sourceId: "existing-post" },
      { canonicalUrl: "https://facebook.com/share/p/new-post", rawMetadata: { discoveredFromSourceId: "summary" } },
    ]);
  });

  test("normalizes only unique Facebook post and share links", () => {
    expect(normalizeDiscoveredFacebookPosts([
      "https://web.facebook.com/share/p/child/?fbclid=ignored",
      "https://www.facebook.com/share/p/child",
      "https://facebook.com/groups/xuyenviet",
      "https://facebook.com/groups/xuyenviet/posts/123",
    ], "https://web.facebook.com/share/p/summary/")).toEqual([
      { url: "https://facebook.com/share/p/child", canonicalUrl: "https://facebook.com/share/p/child" },
      { url: "https://facebook.com/groups/xuyenviet/posts/123", canonicalUrl: "https://facebook.com/groups/xuyenviet/posts/123" },
    ]);
  });

  test("deduplicates and orders actual namespaced advisory lock IDs", () => {
    const first = facebookCaptureLockIds({
      sourceId: "summary",
      canonicalUrls: [
        "https://facebook.com/share/p/b",
        "https://facebook.com/share/p/a",
        "https://facebook.com/share/p/b",
      ],
    });
    const second = facebookCaptureLockIds({
      sourceId: "summary",
      canonicalUrls: [
        "https://facebook.com/share/p/a",
        "https://facebook.com/share/p/b",
      ],
    });

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(new Set(first.map((lock) => lock.namespace))).toEqual(new Set([1_179_990_092]));
    expect(first.map((lock) => lock.resourceId)).toEqual([...first.map((lock) => lock.resourceId)].sort((left, right) => left - right));
  });

  test("strips encoded browser artifacts after a shared post ID before queueing", () => {
    expect(normalizeDiscoveredFacebookPosts([
      "https://www.facebook.com/share/p/15jVBc5eRR/%EF%BF%BC%EF%BF%BC",
    ], "https://facebook.com/share/p/summary")).toEqual([
      { url: "https://facebook.com/share/p/15jVBc5eRR", canonicalUrl: "https://facebook.com/share/p/15jVBc5eRR" },
    ]);
  });

  test("strips Facebook tracking query parameters from group post links before queueing", () => {
    expect(normalizeDiscoveredFacebookPosts([
      "https://facebook.com/groups/1689835535154625/posts/1900464420758401?__cft__%5B0%5D=AZb8gL5cXP0OBmCPYmvza1OR-VG6NWsD7cImIeK5cKF8mzObF__AoSZAFjh85de9l7Q7odoJvSiJJL2A5DqnzCINPNnhr5TM8A0goiSUAU9JWjnu_AdNko43VObIlQLJq4VS4VXzBOoDCQW8qvrKFcm17a-AgQkzizCiLqQ_UaWJgs-ZuRz6YVQhnmHVMS2EXnSMc_h0z8189exLzb3a-eCqNZfYNUlxbdKRUDC7jxQ-SA&__tn__=-UK-R",
    ], "https://facebook.com/share/p/summary")).toEqual([
      { url: "https://facebook.com/groups/1689835535154625/posts/1900464420758401", canonicalUrl: "https://facebook.com/groups/1689835535154625/posts/1900464420758401" },
    ]);
  });

  test("normalizes fb.com aliases, tracking parameters, and trailing slash on post links", () => {
    expect(normalizeDiscoveredFacebookPosts([
      "https://fb.com/share/p/child/?fbclid=ignored&rdid=ignored",
    ], "https://facebook.com/share/p/summary")).toEqual([
      { url: "https://facebook.com/share/p/child", canonicalUrl: "https://facebook.com/share/p/child" },
    ]);
  });

  test("does not discover another generation from a discovered post", async () => {
    await createSource({ id: "summary", kind: "facebook", rawText: null });
    const actor = { userId: "operator-user", email: "operator@example.com" };

    const summaryResult = await updateQueuedFacebookSourceRawText(testDb, {
      sourceId: "summary",
      rawText: "Summary post",
      captureMetadata: { captureMethod: "playwright_operator_browser", capturedAt: "2026-07-15T00:00:00.000Z", sourceUrl: "https://facebook.com/share/p/summary", finalUrl: "https://facebook.com/share/p/summary" },
      sourceUrl: "https://facebook.com/share/p/summary",
      discoveredUrls: ["https://facebook.com/share/p/child"],
      actor,
    });
    const [child] = await testDb.select({ id: sources.id }).from(sources).where(eq(sources.canonicalUrl, "https://facebook.com/share/p/child"));

    const childResult = await updateQueuedFacebookSourceRawText(testDb, {
      sourceId: child.id,
      rawText: "Child post",
      captureMetadata: { captureMethod: "playwright_operator_browser", capturedAt: "2026-07-15T00:00:00.000Z", sourceUrl: "https://facebook.com/share/p/child", finalUrl: "https://facebook.com/share/p/child" },
      sourceUrl: "https://facebook.com/share/p/child",
      discoveredUrls: ["https://facebook.com/share/p/grandchild"],
      actor,
    });

    expect(summaryResult).toMatchObject({ status: "updated", discovered: { queuedCount: 1 } });
    expect(childResult).toMatchObject({ status: "updated", discovered: { queuedCount: 0 } });
    await expect(testDb.select().from(sources).where(eq(sources.canonicalUrl, "https://facebook.com/share/p/grandchild"))).resolves.toEqual([]);
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
