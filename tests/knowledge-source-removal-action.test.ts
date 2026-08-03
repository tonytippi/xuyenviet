import { beforeEach, describe, expect, test, vi } from "vitest";

import { userRoles, users } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

describe("root source-removal evidence workflow", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetTestDatabase();
  });

  test("retains the root evidence removal service for non-intake workflows", async () => {
    const { removeKnowledgeSource } = await import("@/features/knowledge/source-removal");
    expect(removeKnowledgeSource).toBeTypeOf("function");
  });
});
