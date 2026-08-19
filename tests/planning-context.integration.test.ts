import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { loadOwnedPlanningContextSession, saveOwnedPlanningContextSession } from "@xuyenviet/database";
import { conversations, planningContextSessions, users } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";

function session(revision: number, origin = "Hà Nội") {
  return { intent: "trip_planning" as const, slots: { origin }, slotSourceMessageIds: { origin: "message-1" }, missingSlots: ["destination"] as const, status: "collecting" as const, sourceMessageIds: ["message-1"], revision };
}

describe("planning context session storage", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("loads and saves only an owned conversation with revision fencing", async () => {
    await testDb.insert(users).values([{ id: "owner", email: "owner@example.com" }, { id: "other", email: "other@example.com" }]);
    await testDb.insert(conversations).values([{ id: "owner-conversation", userId: "owner" }, { id: "other-conversation", userId: "other" }]);

    await expect(saveOwnedPlanningContextSession("owner", "owner-conversation", null, session(1))).resolves.toMatchObject({ status: "saved" });
    await expect(loadOwnedPlanningContextSession("other", "owner-conversation")).resolves.toBeNull();
    await expect(saveOwnedPlanningContextSession("other", "owner-conversation", null, session(1))).resolves.toEqual({ status: "not_found" });
    await expect(saveOwnedPlanningContextSession("owner", "owner-conversation", 1, session(2, "Huế"))).resolves.toMatchObject({ status: "saved" });
    await expect(saveOwnedPlanningContextSession("owner", "owner-conversation", 1, session(2, "Đà Nẵng"))).resolves.toEqual({ status: "stale" });
    await expect(loadOwnedPlanningContextSession("owner", "owner-conversation")).resolves.toEqual(session(2, "Huế"));
  });

  test("cascades the session when its conversation is deleted", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await testDb.insert(conversations).values({ id: "conversation", userId: "owner" });
    await saveOwnedPlanningContextSession("owner", "conversation", null, session(1));

    await testDb.delete(conversations).where(and(eq(conversations.id, "conversation"), eq(conversations.userId, "owner")));
    await expect(testDb.select().from(planningContextSessions).where(eq(planningContextSessions.conversationId, "conversation"))).resolves.toEqual([]);
  });
});
