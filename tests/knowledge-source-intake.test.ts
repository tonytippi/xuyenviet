import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, knowledgeIngestionJobs, sourceCaptureVersions, sources, userRoles, users, type UserRole } from "@/db/schema";

import { testDb } from "./helpers/db";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

async function createUser(userId: string, roles: UserRole[] = []) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });

  if (roles.length > 0) {
    await testDb.insert(userRoles).values(roles.map((role) => ({ userId, role })));
  }
}

describe("knowledge source intake", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test("operator URL intake stores safe source metadata without creating readable legacy material", async () => {
    await createUser("operator-user", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "operator-user", email: "operator-user@example.com" } });
    const { submitTravelSourceForAiReading } = await import("@/features/knowledge/actions");

    const result = await submitTravelSourceForAiReading({
      url: "https://example.com/path?utm_source=x&keep=1",
      label: "Bài gợi ý dừng chân",
      publisher: "Example Travel",
      collectedDate: "2026-07-08",
      rawMetadata: { submittedFrom: "test" },
    });

    expect(result).toMatchObject({
      kind: "url",
      url: "https://example.com/path?keep=1",
      canonicalUrl: null,
      label: "Bài gợi ý dừng chân",
      publisher: "Example Travel",
      collectedDate: "2026-07-08",
      sourceType: "curated",
      verificationStatus: "unverified",
      official: false,
      partner: false,
    });

    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, result.id))).resolves.toEqual([]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_source"))).resolves.toHaveLength(1);
  });

  test("Facebook links and copied community content default to community unverified", async () => {
    await createUser("community-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "community-operator", email: "community-operator@example.com" } });
    const { submitTravelSourceForAiReading } = await import("@/features/knowledge/actions");

    const facebook = await submitTravelSourceForAiReading({ url: "https://web.facebook.com/groups/xuyenviet/posts/123?fbclid=abc" });
    const facebookShortLink = await submitTravelSourceForAiReading({ url: "https://fb.watch/example-video?fbclid=abc" });
    const copied = await submitTravelSourceForAiReading({ rawText: "Quán này có bãi đậu xe rộng.", copiedCommunityContent: true });
    const youtube = await submitTravelSourceForAiReading({ url: "https://youtu.be/abcDEF12345?si=tracking" });

    expect(facebook).toMatchObject({
      kind: "facebook",
      url: "https://web.facebook.com/groups/xuyenviet/posts/123",
      canonicalUrl: null,
      sourceType: "community",
      verificationStatus: "unverified",
      official: false,
      partner: false,
    });
    expect(facebookShortLink).toMatchObject({ kind: "facebook", canonicalUrl: null, sourceType: "community" });
    expect(copied).toMatchObject({ kind: "copied_post", sourceType: "community", verificationStatus: "unverified", official: false, partner: false });
    expect(youtube).toMatchObject({ kind: "youtube", url: "https://www.youtube.com/watch?v=abcDEF12345", sourceType: "community", verificationStatus: "unverified" });
  });

  test("pasted text intake keeps raw text out of the action response", async () => {
    await createUser("text-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "text-operator", email: "text-operator@example.com" } });
    const { submitTravelSourceForAiReading } = await import("@/features/knowledge/actions");

    const result = await submitTravelSourceForAiReading({ rawText: "Đèo Hải Vân có nhiều điểm dừng ngắm cảnh." });

    expect(result).toMatchObject({ kind: "pasted_text", label: "Văn bản đã dán", url: null, canonicalUrl: null });
    expect(result).not.toHaveProperty("rawText");
    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, result.id))).resolves.toMatchObject([
      { rawText: "Đèo Hải Vân có nhiều điểm dừng ngắm cảnh." },
    ]);
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.sourceId, result.id))).resolves.toMatchObject([
      { stage: "queued", stageVersion: 1 },
    ]);
  });

  test("screenshot metadata intake validates file metadata without upload", async () => {
    await createUser("image-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "image-operator", email: "image-operator@example.com" } });
    const { submitTravelSourceForAiReading } = await import("@/features/knowledge/actions");

    const result = await submitTravelSourceForAiReading({
      screenshot: { fileName: "bien-bao.png", mimeType: "image/png", byteSize: 1024, storageKey: "operator/bien-bao.png" },
    });

    expect(result).toMatchObject({ kind: "screenshot", label: "Ảnh chụp nguồn du lịch" });
    await expect(testDb.select().from(sourceCaptureVersions).where(eq(sourceCaptureVersions.sourceId, result.id))).resolves.toEqual([]);
  });

  test("validation failures create no source, raw material, or audit side effects", async () => {
    await createUser("invalid-operator", ["operator"]);
    authMock.mockResolvedValue({ user: { id: "invalid-operator", email: "invalid-operator@example.com" } });
    const { submitTravelSourceForAiReading } = await import("@/features/knowledge/actions");

    await expect(submitTravelSourceForAiReading({ rawText: "" })).rejects.toThrow("Cần nhập URL");
    await expect(submitTravelSourceForAiReading({ rawText: "x".repeat(20_001) })).rejects.toThrow("Nội dung nguồn quá dài");
    await expect(submitTravelSourceForAiReading({ rawText: "Ngày sai", collectedDate: "2026-02-31" })).rejects.toThrow("Ngày thu thập");
    await expect(submitTravelSourceForAiReading({ rawText: "Metadata sai", label: "x".repeat(201) })).rejects.toThrow("Nhãn nguồn");
    await expect(submitTravelSourceForAiReading({ rawText: "Metadata sai", publisher: "Nguồn\nthô" })).rejects.toThrow("Nhà xuất bản");
    await expect(submitTravelSourceForAiReading({ screenshot: { fileName: "bad.gif", mimeType: "image/gif", byteSize: 100 } })).rejects.toThrow("Ảnh chụp chỉ hỗ trợ");

    await expect(testDb.select().from(sources)).resolves.toHaveLength(0);
    await expect(testDb.select().from(sourceCaptureVersions)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("traveler is denied before intake side effects", async () => {
    await createUser("traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "traveler-user", email: "traveler-user@example.com" } });
    const { submitTravelSourceForAiReading } = await import("@/features/knowledge/actions");

    await expect(submitTravelSourceForAiReading({ url: "https://example.com" })).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(testDb.select().from(sources)).resolves.toHaveLength(0);
    await expect(testDb.select().from(sourceCaptureVersions)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("traveler with invalid input is denied before validation", async () => {
    await createUser("invalid-traveler-user", ["traveler"]);
    authMock.mockResolvedValue({ user: { id: "invalid-traveler-user", email: "invalid-traveler-user@example.com" } });
    const { submitTravelSourceForAiReading } = await import("@/features/knowledge/actions");

    await expect(submitTravelSourceForAiReading({ rawText: "" })).rejects.toMatchObject({ name: "AdminAuthorizationError" });
    await expect(testDb.select().from(sources)).resolves.toHaveLength(0);
    await expect(testDb.select().from(sourceCaptureVersions)).resolves.toHaveLength(0);
    await expect(testDb.select().from(auditEvents)).resolves.toHaveLength(0);
  });

  test("database rejects invalid source and raw material constraints", async () => {
    await createUser("constraint-operator", ["operator"]);

    await expect(
      testDb.execute(sql`insert into sources (id, kind, label, source_type, verification_status, official, partner, submitted_by_user_id) values ('bad-community', 'copied_post', 'Bad', 'community', 'verified', false, false, 'constraint-operator')`),
    ).rejects.toThrow();

    await testDb.execute(sql`insert into sources (id, kind, label, source_type, verification_status, submitted_by_user_id) values ('good-source', 'pasted_text', 'Good', 'curated', 'unverified', 'constraint-operator')`);

    await expect(
      testDb.execute(sql`insert into sources (id, kind, label, collected_date, source_type, verification_status, submitted_by_user_id) values ('bad-date', 'pasted_text', 'Bad date', '2026-02-31', 'curated', 'unverified', 'constraint-operator')`),
    ).rejects.toThrow();

    await expect(
      testDb.execute(sql`insert into raw_source_material (id, source_id, file_name, mime_type, byte_size) values ('bad-material', 'good-source', 'bad.gif', 'image/gif', 10)`),
    ).rejects.toThrow();

    await testDb.execute(sql`insert into raw_source_material (id, source_id, raw_text) values ('good-material', 'good-source', 'Một nguồn thô')`);

    await expect(
      testDb.execute(sql`insert into raw_source_material (id, source_id, raw_text) values ('duplicate-material', 'good-source', 'Nguồn thô trùng')`),
    ).rejects.toThrow();
  });
});
