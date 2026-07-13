import { eq } from "drizzle-orm";
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

async function createUser(id: string, email: string) {
  await testDb.insert(users).values({ id, email });
}

async function getRoles(userId: string) {
  const rows = await testDb.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));

  return rows.map((row) => row.role).sort();
}

describe("ADMIN_EMAIL login-time role provisioning", () => {
  beforeEach(() => {
    delete process.env.ADMIN_EMAIL;
    authMocks.captureFirstTouchReferralAttribution.mockReset();
    authMocks.nextAuthConfigFactory = undefined;
  });

  test("grants admin and operator roles when ADMIN_EMAIL matches with normalization", async () => {
    process.env.ADMIN_EMAIL = " Admin@Example.com ";
    await createUser("admin-user", "admin@example.com");
    const signIn = await getSignInEvent();

    await signIn({ user: { id: "admin-user", email: "admin@example.com" }, isNewUser: false });

    expect(await getRoles("admin-user")).toEqual(["admin", "operator"]);
  });

  test("does not grant roles when ADMIN_EMAIL does not match", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    await createUser("traveler-user", "traveler@example.com");
    const signIn = await getSignInEvent();

    await signIn({ user: { id: "traveler-user", email: "traveler@example.com" }, isNewUser: false });

    expect(await getRoles("traveler-user")).toEqual([]);
  });

  test.each([
    { name: "missing ADMIN_EMAIL", adminEmail: undefined, user: { id: "incomplete-user", email: "admin@example.com" } },
    { name: "blank ADMIN_EMAIL", adminEmail: "  ", user: { id: "incomplete-user", email: "admin@example.com" } },
    { name: "missing user id", adminEmail: "admin@example.com", user: { email: "admin@example.com" } },
    { name: "missing user email", adminEmail: "admin@example.com", user: { id: "incomplete-user" } },
  ])("does not grant roles for $name", async ({ adminEmail, user }) => {
    if (adminEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = adminEmail;
    }

    await createUser("incomplete-user", "admin@example.com");
    const signIn = await getSignInEvent();

    await signIn({ user, isNewUser: false });

    expect(await getRoles("incomplete-user")).toEqual([]);
  });

  test("repeated matching sign-ins are idempotent", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    await createUser("admin-user", "admin@example.com");
    const signIn = await getSignInEvent();

    await signIn({ user: { id: "admin-user", email: "admin@example.com" }, isNewUser: false });
    await signIn({ user: { id: "admin-user", email: "admin@example.com" }, isNewUser: false });

    expect(await getRoles("admin-user")).toEqual(["admin", "operator"]);
  });

  test("preserves first-touch referral attribution for new admin users", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    await createUser("new-admin-user", "admin@example.com");
    const signIn = await getSignInEvent();

    await signIn({ user: { id: "new-admin-user", email: "admin@example.com" }, isNewUser: true });

    expect(authMocks.captureFirstTouchReferralAttribution).toHaveBeenCalledWith("new-admin-user");
    expect(await getRoles("new-admin-user")).toEqual(["admin", "operator"]);
  });
});
