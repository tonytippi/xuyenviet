import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

async function renderAuthenticatedAiAskShell() {
  vi.doMock("@/server/auth", () => ({
    getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
  }));
  vi.doMock("@/features/auth/actions", () => ({
    signOutCurrentUser: vi.fn(),
  }));

  const { default: AiAskPage } = await import("@/app/ai-ask/page");
  const element = await AiAskPage({ searchParams: Promise.resolve({}) });

  return renderToStaticMarkup(element);
}

describe("AI Ask authenticated shell", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("renders the visible Story 2.1 shell contract", async () => {
    const html = await renderAuthenticatedAiAskShell();

    expect(html).toContain("Hỏi trợ lý chuyến đi Việt Nam");
    expect(html).toContain("tony@example.com");
    expect(html).toContain("Đăng xuất");
    expect(html).toContain("Bạn đang muốn đi đâu?");
    expect(html).toContain("Hà Nội đi Đà Nẵng 7 ngày cùng gia đình");
    expect(html).toContain("Lưu trữ hội thoại");
    expect(html).toContain("Khu vực hội thoại");
    expect(html).toContain("Câu hỏi của bạn");
    expect(html).toContain("Gửi câu hỏi");
    expect(html).toContain('aria-describedby="ai-ask-status ai-ask-shortcuts"');
    expect(html).toContain('id="ai-ask-status"');
  });

  test("does not render fake citations, source chips, or assistant answers", async () => {
    const html = await renderAuthenticatedAiAskShell();

    expect(html).not.toContain("Nguồn:");
    expect(html).not.toContain("[1]");
    expect(html).not.toContain("source-chip");
    expect(html).not.toContain("assistant answer");
  });
});

describe("AI Ask action gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("rejects empty questions", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    await expect(submitAiAsk({ question: "   " })).rejects.toThrow("AI Ask question must be between 1 and 2000 characters.");
  });

  test("rejects malformed question payloads", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    await expect(submitAiAsk({} as { question: string })).rejects.toThrow("AI Ask question must be between 1 and 2000 characters.");
  });

  test("rejects over-2000-character questions", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    await expect(submitAiAsk({ question: "a".repeat(2_001) })).rejects.toThrow(
      "AI Ask question must be between 1 and 2000 characters.",
    );
  });

  test("returns the future-story placeholder for valid questions", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    await expect(submitAiAsk({ question: "Hà Nội đi Huế 5 ngày nên dừng ở đâu?" })).resolves.toEqual({
      status: "queued-for-future-implementation",
    });
  });

  test("rejects unauthenticated submissions", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
    }));
    const { submitAiAsk } = await import("@/features/ai/ask-gate");

    await expect(submitAiAsk({ question: "Hà Nội đi Đà Nẵng?" })).rejects.toThrow(
      "Authentication required for this server mutation.",
    );
  });
});
