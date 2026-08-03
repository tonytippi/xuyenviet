import { asc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { auditEvents, conversations, messages, tripAnswerContextSnapshots, tripChangeProposals, tripPlanItems, tripProjectConstraints, tripProjects, users } from "@/db/schema";

import { resetTestDatabase, testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("Trip project helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
    expect(summary?.primaryConversation).toEqual({ id: related.id, updatedAt: expect.any(Date), preview: "Lịch trình Hà Giang 4 ngày" });
    expect(summary?.historicChats).toEqual([]);
  });

  test("database pointer rejects cross-project and cross-owner conversations", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning();
    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt" }).returning();
    const [otherOwnerProject] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Riêng" }).returning();
    const [wrongProject] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: otherProject.id }).returning();
    const [wrongOwner] = await testDb.insert(conversations).values({ userId: "user-2", tripProjectId: otherOwnerProject.id }).returning();

    await expect(testDb.update(tripProjects).set({ primaryConversationId: wrongProject.id }).where(eq(tripProjects.id, project.id))).rejects.toThrow();
    await expect(testDb.update(tripProjects).set({ primaryConversationId: wrongOwner.id }).where(eq(tripProjects.id, project.id))).rejects.toThrow();
  });

  test("direct database project deletion detaches conversations and cascades project snapshots", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Hà Giang" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    const [assistantMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "user-1", role: "assistant", content: "Ngữ cảnh riêng tư." }).returning({ id: messages.id });
    await testDb.update(tripProjects).set({ primaryConversationId: conversation.id }).where(eq(tripProjects.id, project.id));
    await testDb.insert(tripAnswerContextSnapshots).values({
      userId: "user-1",
      conversationId: conversation.id,
      assistantMessageId: assistantMessage.id,
      tripProjectId: project.id,
      contextVersion: 1,
      aggregateVersion: 1,
      serialization: JSON.stringify({ destination: "Không được giữ lại" }),
      promptDigest: "a".repeat(64),
    });

    await testDb.delete(tripProjects).where(eq(tripProjects.id, project.id));
    const [savedConversation] = await testDb.select().from(conversations).where(eq(conversations.id, conversation.id));

    expect(savedConversation).toMatchObject({ id: conversation.id, userId: "user-1", tripProjectId: null });
    await expect(testDb.select().from(tripAnswerContextSnapshots)).resolves.toEqual([]);
  });

  test("enforces aggregate database checks, owner FKs, and null-inclusive ordinal uniqueness", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "anchor", type: "transport", state: "idea", label: "Sai", ordinal: 0 })).rejects.toThrow();
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "idea", label: "\n", ordinal: 0 })).rejects.toThrow();
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-2", kind: "leg", type: "visit", state: "idea", label: "Không thuộc chủ", ordinal: 0 })).rejects.toThrow();
    const [leg] = await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "transport", state: "confirmed", label: "Đi Huế", ordinal: 0, transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" }).returning({ id: tripPlanItems.id });
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "idea", label: "Trùng gốc", ordinal: 0 })).rejects.toThrow();
    await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "activity", type: "visit", state: "idea", label: "Đại Nội", parentItemId: leg.id, ordinal: 0 });
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "activity", type: "food", state: "idea", label: "Trùng con", parentItemId: leg.id, ordinal: 0 })).rejects.toThrow();
    await expect(testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "idea", label: "Sai vị trí", ordinal: 1, accommodationPlaceAreaLabel: "Huế" })).rejects.toThrow();
    await expect(testDb.insert(tripProjectConstraints).values({ tripProjectId: project.id, userId: "user-1", adultCount: 1, vehicleType: "car", evChargingNeed: "required" })).rejects.toThrow();
    await expect(testDb.insert(tripProjectConstraints).values({ tripProjectId: project.id, userId: "user-1", adultCount: 1, budgetCurrency: "VND", budgetMinVnd: 2, budgetMaxVnd: 1 })).rejects.toThrow();
  });

  test("defers plan-item self references to commit while retaining foreign-key integrity", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Phú Yên" }).returning({ id: tripProjects.id });
    const constraints = await testDb.execute(sql`
      select conname, condeferrable, condeferred
      from pg_constraint
      where conname in (
        'trip_plan_items_parent_item_id_trip_plan_items_id_fk',
        'trip_plan_items_backup_target_item_id_trip_plan_items_id_fk'
      )
      order by conname
    `);

    expect(constraints).toEqual([
      { conname: "trip_plan_items_backup_target_item_id_trip_plan_items_id_fk", condeferrable: true, condeferred: true },
      { conname: "trip_plan_items_parent_item_id_trip_plan_items_id_fk", condeferrable: true, condeferred: true },
    ]);

    await testDb.transaction(async (transaction) => {
      await transaction.insert(tripPlanItems).values({ id: "deferred-activity", tripProjectId: project.id, userId: "user-1", kind: "activity", type: "visit", state: "idea", label: "Gành Đá Đĩa", parentItemId: "deferred-leg", ordinal: 0 });
      await transaction.insert(tripPlanItems).values({ id: "deferred-backup", tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "backup", label: "Phương án dự phòng", backupTargetItemId: "deferred-leg", ordinal: 0 });
      await transaction.insert(tripPlanItems).values({ id: "deferred-leg", tripProjectId: project.id, userId: "user-1", kind: "leg", type: "transport", state: "planned", label: "Tuyến chính", ordinal: 1 });
    });

    await expect(testDb.transaction(async (transaction) => {
      await transaction.insert(tripPlanItems).values({ id: "unresolved-activity", tripProjectId: project.id, userId: "user-1", kind: "activity", type: "visit", state: "idea", label: "Không hợp lệ", parentItemId: "missing-leg", ordinal: 1 });
    })).rejects.toThrow();
    await expect(testDb.select().from(tripPlanItems).where(eq(tripPlanItems.id, "unresolved-activity"))).resolves.toHaveLength(0);
  });

  test("getOwnedTripProjectSummary returns the workspace read model with plan items, constraints, and Trip Home focus for the owner", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế", origin: "Hà Nội", destination: "Huế", startDate: "2026-08-01", endDate: "2026-08-05", travelers: "2 người lớn" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id });
    await testDb.insert(tripPlanItems).values([
      { tripProjectId: project.id, userId: "user-1", kind: "anchor", anchorRole: "origin", state: "idea", label: "Hà Nội", ordinal: 0 },
      { tripProjectId: project.id, userId: "user-1", kind: "leg", type: "transport", state: "confirmed", label: "Chạy xe Hà Nội - Huế", ordinal: 1, plannedAt: new Date("2026-08-01T06:00:00.000Z"), transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" },
      { tripProjectId: project.id, userId: "user-1", kind: "leg", type: "accommodation", state: "confirmed", label: "Khách sạn Huế", ordinal: 2, accommodationPlaceAreaLabel: null },
    ]);
    await testDb.insert(tripProjectConstraints).values({
      tripProjectId: project.id,
      userId: "user-1",
      adultCount: 2,
      childCount: 1,
      vehicleType: "car",
      drivingToleranceHours: 4,
      budgetCurrency: "VND",
      budgetMinVnd: 5_000_000,
      budgetMaxVnd: 10_000_000,
      preferenceTags: ["nature", "culture"],
    });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);
    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));
    const savedPlanItems = await testDb.select().from(tripPlanItems).where(eq(tripPlanItems.tripProjectId, project.id));
    const [savedConstraints] = await testDb.select().from(tripProjectConstraints).where(eq(tripProjectConstraints.tripProjectId, project.id));

    expect(summary?.planItems).toHaveLength(3);
    expect(summary?.planItems.map((item) => item.label)).toEqual(["Hà Nội", "Chạy xe Hà Nội - Huế", "Khách sạn Huế"]);
    expect(summary?.constraints).toMatchObject({ adultCount: 2, childCount: 1, vehicleType: "car", drivingToleranceHours: 4, budgetCurrency: "VND", budgetMinVnd: 5_000_000, budgetMaxVnd: 10_000_000, preferenceTags: ["Thiên nhiên", "Văn hoá"] });
    expect(summary?.tripHome.kind).toBe("confirmed-item-gap");
    expect(savedProject.aggregateVersion).toBe(1);
    expect(savedPlanItems.every((item) => item.version === 1)).toBe(true);
    expect(savedConstraints.version).toBe(1);
  });

  test("getOwnedTripProjectSummary returns preparation focus when no plan items exist", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);

    expect(summary?.planItems).toEqual([]);
    expect(summary?.constraints).toBeNull();
    expect(summary?.tripHome.kind).toBe("preparation");
  });

  test("getOwnedTripProjectSummary returns preparation focus when only idea items exist", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id });
    await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-1", kind: "leg", type: "visit", state: "idea", label: "Đại Nội", ordinal: 0 });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);

    expect(summary?.tripHome.kind).toBe("preparation");
  });

  test("getOwnedTripProjectSummary returns null for a cross-owner project without leaking workspace data", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-2", title: "Dự án riêng user-2" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-2", tripProjectId: project.id });
    await testDb.insert(tripPlanItems).values({ tripProjectId: project.id, userId: "user-2", kind: "leg", type: "transport", state: "confirmed", label: "Chạy xe riêng", ordinal: 0, transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);

    expect(summary).toBeNull();
  });

  test("getOwnedTripProjectSummary does not write any audit event or advance any version when reading the workspace", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");
    const auditsBefore = await testDb.select().from(auditEvents);
    const [projectBefore] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));
    await getOwnedTripProjectSummary(project.id);
    await getOwnedTripProjectSummary(project.id);
    const auditsAfter = await testDb.select().from(auditEvents);
    const [savedProject] = await testDb.select().from(tripProjects).where(eq(tripProjects.id, project.id));

    expect(auditsAfter).toHaveLength(auditsBefore.length);
    expect(projectBefore.aggregateVersion).toBe(1);
    expect(savedProject.aggregateVersion).toBe(projectBefore.aggregateVersion);
  });

  test("getOwnedTripProjectSummary feeds real pending proposals into the workspace read model", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id });
    await testDb.insert(tripPlanItems).values({ id: "leg-1", tripProjectId: project.id, userId: "user-1", kind: "leg", type: "transport", state: "idea", label: "Chạy xe", ordinal: 0, version: 1 });
    const expiresAt = new Date(Date.now() + 86_400_000); // tomorrow — strictly future (E7R2-F4)
    await testDb.insert(tripChangeProposals).values({
      tripProjectId: project.id,
      userId: "user-1",
      creatorClass: "ai_orchestration",
      status: "pending",
      rationale: "Nên chốt chặng xe sớm.",
      operations: [{ kind: "change-item-state", itemId: "leg-1", state: "confirmed" }],
      expectedAggregateVersion: 1,
      expectedItemVersions: { "leg-1": 1 },
      expiresAt,
    });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);

    expect(summary?.pendingProposals).toHaveLength(1);
    expect(summary?.pendingProposals[0]).toMatchObject({ status: "pending", rationale: "Nên chốt chặng xe sớm.", expiresAt });
    expect(summary?.tripHome.kind).toBe("pending-proposal-with-expiry");
  });

  test("getOwnedTripProjectSummary excludes elapsed pending proposals without mutating them", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id });
    const [proposal] = await testDb.insert(tripChangeProposals).values({
      tripProjectId: project.id,
      userId: "user-1",
      creatorClass: "ai_orchestration",
      status: "pending",
      rationale: "Đề xuất đã quá hạn.",
      operations: [{ kind: "upsert-constraints", constraints: { adultCount: 2 } }],
      expectedAggregateVersion: 1,
      expiresAt: new Date(Date.now() - 1_000),
    }).returning({ id: tripChangeProposals.id });
    vi.doMock("@/server/auth", () => ({ getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }) }));
    const { getOwnedTripProjectSummary } = await import("@/features/chat-trips/trip-projects");

    const summary = await getOwnedTripProjectSummary(project.id);
    const [savedProposal] = await testDb.select({ status: tripChangeProposals.status, terminalTimestamp: tripChangeProposals.terminalTimestamp }).from(tripChangeProposals).where(eq(tripChangeProposals.id, proposal.id));

    expect(summary?.pendingProposals).toEqual([]);
    expect(summary?.tripHome.kind).toBe("preparation");
    expect(savedProposal).toEqual({ status: "pending", terminalTimestamp: null });
  });

});
