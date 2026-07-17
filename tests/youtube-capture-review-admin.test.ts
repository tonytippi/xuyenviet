import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { knowledgeCards, knowledgeCardSources, knowledgeExtractionJobs, rawSourceMaterial, sources, userRoles, users, type UserRole } from "@/db/schema";
import { serializeYoutubeEvidence, type YoutubeEvidence } from "@/features/knowledge/youtube-capture";

import { resetTestDatabase, testDb } from "./helpers/db";

const authMock = vi.fn();
const evidence: YoutubeEvidence[] = [{ category: "route", claim_vi: "Đèo Hải Vân cần kiểm tra thời tiết trước khi đi.", evidence_type: "spoken", timestamp_start_seconds: 60, timestamp_end_seconds: 85, confidence: "medium", freshness_sensitive: true, evidence_excerpt: "Hôm nay trên đèo có mưa.", uncertainty_or_condition: "Điều kiện thay đổi theo ngày." }];

vi.mock("@/auth", () => ({ auth: authMock, signIn: vi.fn(), signOut: vi.fn() }));

async function createUser(userId: string, roles: UserRole[] = []) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
  if (roles.length) await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
}

async function createYoutubeCapture(input: { id: string; rawText?: string | null; captureMethod?: string }) {
  await testDb.insert(sources).values({ id: input.id, kind: "youtube", url: `https://www.youtube.com/watch?v=${input.id}`, canonicalUrl: `https://www.youtube.com/watch?v=${input.id}`, label: `Video ${input.id}`, sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator-user" });
  await testDb.insert(rawSourceMaterial).values({ id: `raw-${input.id}`, sourceId: input.id, rawText: input.rawText ?? serializeYoutubeEvidence(evidence), rawMetadata: { captureMethod: input.captureMethod ?? "gemini_youtube_url", capturedAt: "2026-07-17T08:00:00.000Z", model: "gemini-test", promptVersion: "youtube-evidence-v1", providerPayload: "secret-provider-payload" } });
}

function formData(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }

describe("admin YouTube capture review", () => {
  beforeEach(async () => { authMock.mockReset(); await resetTestDatabase(); await createUser("operator-user", ["operator"]); });

  test("lists only valid captured YouTube evidence without raw payloads", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createYoutubeCapture({ id: "valid" });
    await createYoutubeCapture({ id: "invalid", rawText: "not-json" });
    await createYoutubeCapture({ id: "wrong-method", captureMethod: "manual" });

    const { listAdminYoutubeCaptureReviews, getAdminYoutubeCaptureReviewDetail } = await import("@/features/knowledge/youtube-capture-review-admin");
    const captures = await listAdminYoutubeCaptureReviews();
    const detail = await getAdminYoutubeCaptureReviewDetail("valid");

    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ sourceId: "valid", evidenceCount: 1, evidence });
    expect(JSON.stringify({ captures, detail })).not.toContain("secret-provider-payload");
    expect(JSON.stringify({ captures, detail })).not.toContain("rawMetadata");
  });

  test("requires an operator before returning captured evidence", async () => {
    await createYoutubeCapture({ id: "private" });
    const { AdminAuthorizationError } = await import("@/server/auth");
    const { getAdminYoutubeCaptureReviewDetail } = await import("@/features/knowledge/youtube-capture-review-admin");

    authMock.mockResolvedValue(null);
    await expect(getAdminYoutubeCaptureReviewDetail("private")).rejects.toThrow(AdminAuthorizationError);
    await createUser("traveler", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler", email: "traveler@example.com" } });
    await expect(getAdminYoutubeCaptureReviewDetail("private")).rejects.toThrow(AdminAuthorizationError);
  });

  test("redacts unsafe metadata and sensitive video URL values", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createYoutubeCapture({ id: "sensitive" });
    await testDb.update(sources).set({ url: "https://user:password@youtube.com/watch?v=sensitive&token=private", canonicalUrl: "https://youtube.com/watch?v=sensitive&signature=private" }).where(eq(sources.id, "sensitive"));
    await testDb.update(rawSourceMaterial).set({ rawMetadata: { captureMethod: "gemini_youtube_url", model: "provider payload private", promptVersion: "secret prompt" } }).where(eq(rawSourceMaterial.sourceId, "sensitive"));
    const { getAdminYoutubeCaptureReviewDetail } = await import("@/features/knowledge/youtube-capture-review-admin");
    const detail = await getAdminYoutubeCaptureReviewDetail("sensitive");
    expect(detail).toMatchObject({ model: null, promptVersion: null, sourceUrl: "https://youtube.com/watch?v=sensitive&token=%5B%E1%BA%A9n%5D", sourceCanonicalUrl: "https://youtube.com/watch?v=sensitive&signature=%5B%E1%BA%A9n%5D" });
    expect(JSON.stringify(detail)).not.toContain("private");
    expect(JSON.stringify(detail)).not.toContain("password");
  });

  test("renders parsed evidence and queues only an eligible source", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createYoutubeCapture({ id: "reviewable" });
    const { default: YoutubeCaptureDetailPage } = await import("@/app/admin/knowledge/youtube-captures/[sourceId]/page");
    const detail = await YoutubeCaptureDetailPage({ params: Promise.resolve({ sourceId: "reviewable" }), searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(detail);

    expect(html).toContain("Evidence đã capture");
    expect(html).toContain(evidence[0].claim_vi);
    expect(html).toContain("Trích xuất bản nháp");
    expect(html).not.toContain("secret-provider-payload");

    const { extractKnowledgeDraftsFromYoutubeCaptureForm } = await import("@/features/knowledge/actions");
    await expect(extractKnowledgeDraftsFromYoutubeCaptureForm(formData({ sourceId: "reviewable" }))).rejects.toThrow(/NEXT_REDIRECT:.*extractQueued=1/);
    await expect(testDb.select().from(knowledgeExtractionJobs)).resolves.toMatchObject([{ sourceId: "reviewable", mode: "extract_only", status: "queued" }]);
  });

  test("blocks extraction for a non-YouTube source and existing extracted cards", async () => {
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    await createYoutubeCapture({ id: "existing" });
    await testDb.insert(knowledgeCards).values({ id: "existing-card", status: "draft", type: "route_note", title: "Existing card", routeSegment: "Huế - Đà Nẵng", summary: "Existing extracted draft", confidence: "unverified", aiPromptVersion: "source_knowledge_draft_extraction_v1", createdByUserId: "operator-user" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "existing-card", sourceId: "existing" });
    await testDb.insert(sources).values({ id: "facebook-source", kind: "facebook", url: "https://facebook.com/post", canonicalUrl: "https://facebook.com/post", label: "Facebook", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator-user" });
    await testDb.insert(rawSourceMaterial).values({ id: "raw-facebook-source", sourceId: "facebook-source", rawText: serializeYoutubeEvidence(evidence), rawMetadata: { captureMethod: "gemini_youtube_url" } });

    const { extractKnowledgeDraftsFromYoutubeCaptureForm } = await import("@/features/knowledge/actions");
    await expect(extractKnowledgeDraftsFromYoutubeCaptureForm(formData({ sourceId: "existing" }))).rejects.toThrow(/NEXT_REDIRECT:.*alreadyExtracted=1/);
    await expect(extractKnowledgeDraftsFromYoutubeCaptureForm(formData({ sourceId: "facebook-source" }))).rejects.toThrow(/NEXT_REDIRECT:.*extractError/);
    await expect(testDb.select().from(knowledgeExtractionJobs)).resolves.toHaveLength(0);
  });
});
