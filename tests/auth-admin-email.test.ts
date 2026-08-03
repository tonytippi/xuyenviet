import { beforeEach, describe, expect, test, vi } from "vitest";

import { userRoles, users } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";

type SignInEvent = (message: { user: { id?: string; email?: string | null } }) => Promise<void>;

const authMocks = vi.hoisted(() => ({
  nextAuthConfigFactory: undefined as (() => { events?: { signIn?: SignInEvent } }) | undefined,
}));

vi.mock("next-auth", () => ({
  default: vi.fn((configFactory: () => { events?: { signIn?: SignInEvent } }) => {
    authMocks.nextAuthConfigFactory = configFactory;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  }),
  customFetch: Symbol("customFetch"),
}));

async function getSignInEvent() {
  await import("@/auth");
  const signIn = authMocks.nextAuthConfigFactory?.().events?.signIn;
  if (!signIn) throw new Error("Auth signIn event was not configured");
  return signIn;
}

describe("root-admin sign-in events", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    delete process.env.ADMIN_EMAIL;
    authMocks.nextAuthConfigFactory = undefined;
  });

  test("grants admin when ADMIN_EMAIL matches", async () => {
    process.env.ADMIN_EMAIL = " Admin@Example.com ";
    await testDb.insert(users).values({ id: "admin-user", email: "admin@example.com" });

    await (await getSignInEvent())({ user: { id: "admin-user", email: "admin@example.com" } });

    await expect(testDb.select().from(userRoles)).resolves.toEqual([{ userId: "admin-user", role: "admin" }]);
  });

  test("does not grant a role when ADMIN_EMAIL is absent", async () => {
    await testDb.insert(users).values({ id: "unconfigured-user", email: "admin@example.com" });

    await (await getSignInEvent())({ user: { id: "unconfigured-user", email: "admin@example.com" } });

    await expect(testDb.select().from(userRoles)).resolves.toEqual([]);
  });
});
