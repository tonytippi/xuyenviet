import { beforeEach, describe, expect, test } from "vitest";

import { loadOwnedPlanningContextSession, prepareOwnedPlanningClarification, saveOwnedPlanningContextSession } from "@xuyenviet/database";
import { conversations, users } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";

describe("planning clarification persistence", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("persists initial and partial explicit answers, then becomes ready", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await testDb.insert(conversations).values({ id: "conversation", userId: "owner" });

    await expect(prepareOwnedPlanningClarification("owner", "conversation", "Tôi muốn đi Đà Nẵng", "message-1")).resolves.toMatchObject({ kind: "question", question: "Bạn sẽ xuất phát từ đâu?" });
    await expect(prepareOwnedPlanningClarification("owner", "conversation", "Xuất phát từ Hà Nội", "message-2")).resolves.toMatchObject({ kind: "question", question: "Bạn dự định khởi hành ngày nào?" });
    await expect(prepareOwnedPlanningClarification("owner", "conversation", "2026-12-20", "message-3")).resolves.toMatchObject({ kind: "question", question: "Có bao nhiêu người lớn cùng đi?" });
    await expect(prepareOwnedPlanningClarification("owner", "conversation", "2 người lớn", "message-4")).resolves.toMatchObject({ kind: "ready" });
    await expect(loadOwnedPlanningContextSession("owner", "conversation")).resolves.toMatchObject({ status: "ready", revision: 4, missingSlots: [] });
  });

  test("leaves a newer session unchanged when a stale expected revision loses", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await testDb.insert(conversations).values({ id: "conversation", userId: "owner" });
    await prepareOwnedPlanningClarification("owner", "conversation", "Tôi muốn đi Đà Nẵng", "message-1");
    const before = await loadOwnedPlanningContextSession("owner", "conversation");
    await prepareOwnedPlanningClarification("owner", "conversation", "Xuất phát từ Hà Nội", "message-2");
    expect(before?.revision).toBe(1);
    await expect(saveOwnedPlanningContextSession("owner", "conversation", before!.revision, { ...before!, slots: { ...before!.slots, origin: "Huế" }, slotSourceMessageIds: { ...before!.slotSourceMessageIds, origin: "stale-message" }, missingSlots: ["start_date", "adults"], revision: before!.revision + 1, sourceMessageIds: [...before!.sourceMessageIds, "stale-message"] })).resolves.toEqual({ status: "stale" });
    await expect(loadOwnedPlanningContextSession("owner", "conversation")).resolves.toMatchObject({ revision: 2, slots: { origin: "Hà Nội" } });
  });
});
