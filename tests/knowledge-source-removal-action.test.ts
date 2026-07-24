import { beforeEach, describe, expect, test, vi } from "vitest";

import { userRoles, users } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";

const authMock = vi.fn();
const removeKnowledgeSourceMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/features/knowledge/source-removal", () => ({
  SourceRemovalError: class SourceRemovalError extends Error {},
  removeKnowledgeSource: removeKnowledgeSourceMock,
}));

function removalForm() {
  const formData = new FormData();
  formData.set("sourceId", "source-for-removal");
  formData.set("reason", "withdrawn");
  return formData;
}

describe("removeKnowledgeSourceForm", () => {
  beforeEach(async () => {
    authMock.mockReset();
    removeKnowledgeSourceMock.mockReset();
    await resetTestDatabase();
  });

  test("denies anonymous and traveler sessions before removal", async () => {
    const { AdminAuthorizationError } = await import("@/server/auth");
    const { removeKnowledgeSourceForm } = await import("@/features/knowledge/actions");

    await expect(removeKnowledgeSourceForm(removalForm())).rejects.toThrow(AdminAuthorizationError);
    expect(removeKnowledgeSourceMock).not.toHaveBeenCalled();

    await testDb.insert(users).values({ id: "traveler", email: "traveler@example.com" });
    await testDb.insert(userRoles).values({ userId: "traveler", role: "traveler" });
    authMock.mockResolvedValue({ user: { id: "traveler", email: "traveler@example.com" } });

    await expect(removeKnowledgeSourceForm(removalForm())).rejects.toThrow(AdminAuthorizationError);
    expect(removeKnowledgeSourceMock).not.toHaveBeenCalled();
  });

  test("forwards the authenticated operator actor to source removal", async () => {
    await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
    await testDb.insert(userRoles).values({ userId: "operator", role: "operator" });
    authMock.mockResolvedValue({ user: { id: "operator", email: "operator@example.com" } });
    removeKnowledgeSourceMock.mockResolvedValue({ status: "completed", sourceId: "source-for-removal", changedCardIds: [] });
    const { removeKnowledgeSourceForm } = await import("@/features/knowledge/actions");

    await expect(removeKnowledgeSourceForm(removalForm())).rejects.toThrow(/NEXT_REDIRECT:.*sourceRemoved=completed/);
    expect(removeKnowledgeSourceMock).toHaveBeenCalledWith({
      sourceId: "source-for-removal",
      reason: "withdrawn",
      actor: { userId: "operator", email: "operator@example.com" },
    });
  });
});
