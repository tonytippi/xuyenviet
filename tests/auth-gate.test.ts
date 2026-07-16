import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

describe("auth gate fail-closed behavior", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test.each([
    { user: { email: "tony@example.com" } },
    { user: { id: "user-1" } },
    { user: {} },
    null,
  ])("returns null for incomplete session %#", async (session) => {
    authMock.mockResolvedValue(session);
    const { getAuthenticatedSession } = await import("@/server/auth");

    await expect(getAuthenticatedSession()).resolves.toBeNull();
  });

  test("returns null instead of throwing when session storage fails", async () => {
    authMock.mockRejectedValue(new Error("session storage unavailable"));
    const { getAuthenticatedSession } = await import("@/server/auth");

    await expect(getAuthenticatedSession()).resolves.toBeNull();
  });

  test("returns the user id and email for a complete session", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", email: "tony@example.com" } });
    const { getAuthenticatedSession } = await import("@/server/auth");

    await expect(getAuthenticatedSession()).resolves.toEqual({ userId: "user-1", email: "tony@example.com" });
  });
});

describe("safe sign-in redirects", () => {
  test.each(["/ai-ask", "/admin"])("allows %s", async (path) => {
    const { getSafeRedirectPath } = await import("@/features/auth/redirects");

    expect(getSafeRedirectPath(path)).toBe(path);
  });

  test("preserves a public ask draft only for the AI Ask redirect", async () => {
    const { getSafeRedirectPath } = await import("@/features/auth/redirects");

    expect(getSafeRedirectPath("/ai-ask", { draft: "  Hà Nội đi Huế 5 ngày  " })).toBe(
      "/ai-ask?draft=H%C3%A0+N%E1%BB%99i+%C4%91i+Hu%E1%BA%BF+5+ng%C3%A0y",
    );
    expect(getSafeRedirectPath("/admin", { draft: "không dùng" })).toBe("/admin");
  });

  test.each(["//evil.example", "https://evil.example", "/unknown", "", null])("falls back for %s", async (path) => {
    const { getSafeRedirectPath } = await import("@/features/auth/redirects");

    expect(getSafeRedirectPath(path)).toBe("/ai-ask");
  });
});

describe("public logged-out homepage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("renders the public AI-first homepage without protected shell content", async () => {
    const { default: HomePage } = await import("@/app/page");
    const element = await HomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Lên kế hoạch xuyên Việt trong một cuộc trò chuyện.");
    expect(html).toContain("Đăng nhập Google");
    expect(html).toContain("Bạn muốn đi đâu? Ví dụ: Hà Nội đi Huế 5 ngày cùng gia đình...");
    expect(html).toContain("Bạn cần đăng nhập trước khi XuyenViet tạo hội thoại");
    expect(html).toContain("Tuyến đường Hà Nội - Huế 5 ngày");
    expect(html).toContain("Trò chuyện ở giữa. Chi tiết ở bên phải.");
    expect(html).toContain('class="public-starter-icon size-4 text-[#14532d]"');
    expect(html.match(/public-starter-icon/g)).toHaveLength(4);
    expect(html).toContain('class="public-preview-icon size-4"');
    expect(html.match(/public-preview-icon/g)).toHaveLength(3);
    expect(html).not.toContain("tony@example.com");
    expect(html).not.toContain("Đăng xuất");
    expect(html).not.toContain("Khu vực hội thoại");
    expect(html).not.toContain("Quản trị");
  });

  test("preserves referral code through public sign-in and gated ask entry points", async () => {
    const { default: HomePage } = await import("@/app/page");
    const element = await HomePage({ searchParams: Promise.resolve({ ref: "abc 123" }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("/sign-in?next=%2Fai-ask&amp;ref=abc+123");
    expect(html).toContain('action="/sign-in"');
    expect(html).toContain('type="hidden" name="next" value="/ai-ask"');
    expect(html).toContain('type="hidden" name="ref" value="abc 123"');
    expect(html).toContain('name="draft"');
    expect(html).not.toContain("reward");
    expect(html).not.toContain("credit");
    expect(html).not.toContain("payout");
  });

  test("uses the first non-empty referral code when duplicate ref params are present", async () => {
    const { default: HomePage } = await import("@/app/page");
    const element = await HomePage({ searchParams: Promise.resolve({ ref: ["", "abc"] }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("/sign-in?next=%2Fai-ask&amp;ref=abc");
    expect(html).toContain('type="hidden" name="ref" value="abc"');
  });

  test("omits whitespace-only referral values from public sign-in entry points", async () => {
    const { default: HomePage } = await import("@/app/page");
    const element = await HomePage({ searchParams: Promise.resolve({ ref: "   " }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("/sign-in?next=%2Fai-ask");
    expect(html).not.toContain("&amp;ref=");
    expect(html).not.toContain('name="ref"');
  });
});

describe("AI Ask route gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("redirects unauthenticated travelers to sign-in before rendering protected content", async () => {
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      }),
    }));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSessionWithRoles: vi.fn().mockResolvedValue(null),
      hasAdminAccess: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/features/auth/actions", () => ({
      signOutCurrentUser: vi.fn(),
    }));

    const { default: AiAskPage } = await import("@/app/ai-ask/page");

    await expect(AiAskPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/sign-in?next=%2Fai-ask");
  });

  test("preserves referral code when redirecting unauthenticated travelers", async () => {
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      }),
    }));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSessionWithRoles: vi.fn().mockResolvedValue(null),
      hasAdminAccess: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/features/auth/actions", () => ({
      signOutCurrentUser: vi.fn(),
    }));

    const { default: AiAskPage } = await import("@/app/ai-ask/page");

    await expect(AiAskPage({ searchParams: Promise.resolve({ ref: "abc" }) })).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in?next=%2Fai-ask&ref=abc",
    );
  });

  test("preserves the first non-empty referral code when redirecting unauthenticated travelers", async () => {
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      }),
    }));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSessionWithRoles: vi.fn().mockResolvedValue(null),
      hasAdminAccess: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/features/auth/actions", () => ({
      signOutCurrentUser: vi.fn(),
    }));

    const { default: AiAskPage } = await import("@/app/ai-ask/page");

    await expect(AiAskPage({ searchParams: Promise.resolve({ ref: ["", "abc"] }) })).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in?next=%2Fai-ask&ref=abc",
    );
  });

  test("renders protected content only for authenticated travelers", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
      getAuthenticatedSessionWithRoles: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com", roles: [] }),
      hasAdminAccess: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/features/auth/actions", () => ({
      signOutCurrentUser: vi.fn(),
    }));

    const { default: AiAskPage } = await import("@/app/ai-ask/page");
    const element = await AiAskPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("tony@example.com");
    expect(html).toContain("Hỏi trợ lý chuyến đi Việt Nam");
    expect(html).toContain("Câu hỏi của bạn");
  });
});
