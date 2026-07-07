import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, conversations, messages, tripProjects, users } from "@/db/schema";

import { testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

describe("Trip project helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("throws a safe error when unauthenticated create is attempted", async () => {
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
    }));
    const { createTripProject } = await import("@/features/chat-trips/trip-projects");

    await expect(createTripProject({ title: "Đà Nẵng" })).rejects.toThrow("Authentication required");
    await expect(testDb.select().from(tripProjects)).resolves.toHaveLength(0);
  });

  test("creates an owned trip project with trimmed fields and an audit event", async () => {
    await createTestUser("user-1");
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { createTripProject } = await import("@/features/chat-trips/trip-projects");

    const project = await createTripProject({
      title: "  Đà Nẵng 7 ngày  ",
      origin: " Hà Nội ",
      destination: " Đà Nẵng ",
      startDate: " 2026-08-01 ",
      endDate: " ",
      travelers: " 2 người lớn ",
      notes: "  Đi chậm  ",
    });
    const audits = await testDb.select().from(auditEvents);

    expect(project).toMatchObject({ title: "Đà Nẵng 7 ngày", origin: "Hà Nội", destination: "Đà Nẵng", startDate: "2026-08-01", endDate: null, travelers: "2 người lớn", notes: "Đi chậm" });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorUserId: "user-1", actorEmail: "user-1@example.com", operation: "create", targetType: "trip_project", targetId: project.id });
    expect(audits[0].afterSummary).toContain("titleLength");
    expect(audits[0].afterSummary).not.toContain("Đà Nẵng 7 ngày");
    expect(audits[0].afterSummary).not.toContain("Hà Nội");
    expect(audits[0].afterSummary).not.toContain("2026-08-01");
  });

  test("rejects blank project titles before insert", async () => {
    await createTestUser("user-1");
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { createTripProject } = await import("@/features/chat-trips/trip-projects");

    await expect(createTripProject({ title: "   " })).rejects.toThrow("Trip project title is required");
    await expect(testDb.select().from(tripProjects)).resolves.toHaveLength(0);
  });

  test("lists and reads only projects owned by the authenticated user", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [ownOld] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế", updatedAt: new Date("2026-07-01T00:00:00.000Z") }).returning({ id: tripProjects.id });
    const [ownNew] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt", updatedAt: new Date("2026-07-03T00:00:00.000Z") }).returning({ id: tripProjects.id });
    const [other] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Riêng tư", updatedAt: new Date("2026-07-04T00:00:00.000Z") }).returning({ id: tripProjects.id });
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { getOwnedTripProject, listOwnedTripProjects } = await import("@/features/chat-trips/trip-projects");

    const projects = await listOwnedTripProjects();

    expect(projects?.map((project) => project.id)).toEqual([ownNew.id, ownOld.id]);
    await expect(getOwnedTripProject(ownNew.id)).resolves.toMatchObject({ id: ownNew.id, title: "Đà Lạt" });
    await expect(getOwnedTripProject(other.id)).resolves.toBeNull();
  });

  test("returns related chat summaries only for the selected owned project", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Hà Giang" }).returning({ id: tripProjects.id });
    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt" }).returning({ id: tripProjects.id });
    const [related] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    const [unrelated] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: otherProject.id }).returning({ id: conversations.id });
    await testDb.insert(messages).values([
      { conversationId: related.id, userId: "user-1", role: "user", content: "Lịch trình Hà Giang 4 ngày" },
      { conversationId: unrelated.id, userId: "user-1", role: "user", content: "Tin của dự án khác" },
    ]);
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);
    const savedConversations = await testDb.select().from(conversations).orderBy(asc(conversations.createdAt));

    expect(savedConversations).toHaveLength(2);
    expect(summary?.relatedChats).toEqual([{ id: related.id, updatedAt: expect.any(Date), preview: "Lịch trình Hà Giang 4 ngày" }]);
  });

  test("deleting a trip project detaches related conversations without clearing ownership", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Hà Giang" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });

    await testDb.delete(tripProjects).where(eq(tripProjects.id, project.id));
    const [savedConversation] = await testDb.select().from(conversations).where(eq(conversations.id, conversation.id));

    expect(savedConversation).toMatchObject({ id: conversation.id, userId: "user-1", tripProjectId: null });
  });
});
