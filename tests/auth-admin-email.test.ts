import { beforeEach, describe, expect, test, vi } from "vitest";

import { userRoles, users } from "@/db/schema";

import { testDb } from "./helpers/db";

type SignInEvent = (message: { user: { id?: string; email?: string | null }; isNewUser?: boolean }) => Promise<void>;

const authMocks = vi.hoisted(() => ({
  captureFirstTouchReferralAttribution: vi.fn(),
  nextAuthConfigFactory: undefined as (() => { events?: { signIn?: SignInEvent } }) | undefined,
}));

vi.mock("@/features/referrals/attribution", () => ({
  captureFirstTouchReferralAttribution: authMocks.captureFirstTouchReferralAttribution,
}));

vi.mock("next-auth", () => ({
  default: vi.fn((configFactory: () => { events?: { signIn?: SignInEvent } }) => {
    authMocks.nextAuthConfigFactory = configFactory;

    return {
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  }),
  customFetch: Symbol("customFetch"),
}));

async function getSignInEvent() {
  await import("@/auth");

  const signIn = authMocks.nextAuthConfigFactory?.().events?.signIn;

  if (!signIn) {
    throw new Error("Auth signIn event was not configured");
  }

  return signIn;
}

describe("sign-in events", () => {
  beforeEach(() => {
    delete process.env.ADMIN_EMAIL;
    authMocks.captureFirstTouchReferralAttribution.mockReset();
    authMocks.nextAuthConfigFactory = undefined;
  });

  test("does not grant roles when ADMIN_EMAIL matches", async () => {
    process.env.ADMIN_EMAIL = " Admin@Example.com ";
    await testDb.insert(users).values({ id: "admin-user", email: "admin@example.com" });
    const signIn = await getSignInEvent();

    await signIn({ user: { id: "admin-user", email: "admin@example.com" }, isNewUser: false });

    await expect(testDb.select().from(userRoles)).resolves.toEqual([]);
  });

  test("preserves first-touch referral attribution for new users", async () => {
    await testDb.insert(users).values({ id: "new-user", email: "new@example.com" });
    const signIn = await getSignInEvent();

    await signIn({ user: { id: "new-user", email: "new@example.com" }, isNewUser: true });

    expect(authMocks.captureFirstTouchReferralAttribution).toHaveBeenCalledWith("new-user");
    await expect(testDb.select().from(userRoles)).resolves.toEqual([]);
  });
});
