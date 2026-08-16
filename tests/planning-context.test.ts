import { describe, expect, test } from "vitest";

import { parsePlanningContextSession, planningSessionSlotNames } from "@xuyenviet/contracts";

const session = {
  intent: "trip_planning",
  slots: { origin: "Hà Nội", destination: "Đà Nẵng" },
  missingSlots: ["start_date", "adults"],
  status: "collecting",
  sourceMessageIds: ["message-1"],
  revision: 1,
} as const;

describe("planning context session contract", () => {
  test("accepts the bounded flat session payload", () => {
    expect(parsePlanningContextSession(session)).toEqual(session);
  });

  test("rejects unknown, nested, workflow, reasoning, and provider data", () => {
    expect(parsePlanningContextSession({ ...session, graph: {} })).toBeNull();
    expect(parsePlanningContextSession({ ...session, slots: { origin: { value: "Hà Nội" } } })).toBeNull();
    expect(parsePlanningContextSession({ ...session, workflow: { state: "running" } })).toBeNull();
    expect(parsePlanningContextSession({ ...session, reasoning: "private" })).toBeNull();
    expect(parsePlanningContextSession({ ...session, providerPayload: {} })).toBeNull();
  });

  test("enforces slot, message, and revision bounds", () => {
    expect(parsePlanningContextSession({ ...session, slots: { unsupported: "x" } })).toBeNull();
    expect(parsePlanningContextSession({ ...session, slots: new Date() })).toBeNull();
    expect(parsePlanningContextSession({ ...session, missingSlots: ["origin", "origin"] })).toBeNull();
    expect(parsePlanningContextSession({ ...session, missingSlots: ["origin"], slots: { origin: "Hà Nội" } })).toBeNull();
    expect(parsePlanningContextSession({ ...session, sourceMessageIds: Array.from({ length: 41 }, (_, index) => `message-${index}`) })).toBeNull();
    expect(parsePlanningContextSession({ ...session, revision: 0 })).toBeNull();
    expect(parsePlanningContextSession({ ...session, revision: 2_147_483_648 })).toBeNull();
    expect(parsePlanningContextSession({ ...session, slots: Object.fromEntries(planningSessionSlotNames.map((name) => [name, "x".repeat(500)])) })).toBeNull();
  });
});
