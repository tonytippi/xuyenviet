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

  test.each(["//evil.example", "https://evil.example", "/unknown", "", null])("falls back for %s", async (path) => {
    const { getSafeRedirectPath } = await import("@/features/auth/redirects");

    expect(getSafeRedirectPath(path)).toBe("/ai-ask");
  });
});

describe("AI Ask route gate", () => {
  test("redirects unauthenticated travelers to sign-in before rendering protected content", async () => {
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      }),
    }));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/features/auth/actions", () => ({
      signOutCurrentUser: vi.fn(),
    }));

    const { default: AiAskPage } = await import("@/app/ai-ask/page");

    await expect(AiAskPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/sign-in?next=%2Fai-ask");
  });

  test("renders protected content only for authenticated travelers", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "tony@example.com" }),
    }));
    vi.doMock("@/features/auth/actions", () => ({
      signOutCurrentUser: vi.fn(),
    }));

    const { default: AiAskPage } = await import("@/app/ai-ask/page");
    const element = await AiAskPage({ searchParams: Promise.resolve({}) });

    expect(renderToStaticMarkup(element)).toContain("tony@example.com");
  });
});
