import { describe, expect, test } from "vitest";

import { parsePlanningContextSession, planningSessionSlotNames } from "@xuyenviet/contracts";
import { reducePlanningClarification } from "../packages/database/src/planning-context";

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

describe("planning clarification reducer", () => {
  test("collects one deterministic material value at a time and becomes ready", () => {
    const initial = reducePlanningClarification({ session: null, question: "Tôi muốn đi Đà Nẵng", sourceMessageId: "message-1" });
    expect(initial).toMatchObject({ kind: "question", question: "Bạn sẽ xuất phát từ đâu?", session: { slots: { destination: "Đà Nẵng" }, missingSlots: ["origin", "start_date", "adults"], revision: 1 } });
    if (initial.kind !== "question") throw new Error("Expected clarification");
    const origin = reducePlanningClarification({ session: initial.session, question: "Xuất phát từ Hà Nội", sourceMessageId: "message-2" });
    expect(origin).toMatchObject({ kind: "question", question: "Bạn dự định khởi hành ngày nào?", session: { slots: { origin: "Hà Nội", destination: "Đà Nẵng" }, revision: 2 } });
    if (origin.kind !== "question") throw new Error("Expected clarification");
    const date = reducePlanningClarification({ session: origin.session, question: "2026-12-20", sourceMessageId: "message-3" });
    if (date.kind !== "question") throw new Error("Expected clarification");
    const complete = reducePlanningClarification({ session: date.session, question: "2 người lớn", sourceMessageId: "message-4" });
    expect(complete).toMatchObject({ kind: "ready", session: { status: "ready", missingSlots: [], slots: { adults: "2" }, revision: 4 } });
  });

  test("keeps contradictory scope missing and supersedes a changed destination", () => {
    const collecting = { intent: "trip_planning" as const, slots: { origin: "Hà Nội", destination: "Đà Nẵng", start_date: "2026-12-20", adults: "2" }, missingSlots: [], status: "ready" as const, sourceMessageIds: ["message-1"], revision: 1 };
    const conflict = reducePlanningClarification({ session: collecting, question: "3 người lớn", sourceMessageId: "message-2" });
    expect(conflict).toMatchObject({ kind: "question", question: "Có bao nhiêu người lớn cùng đi?", session: { slots: { origin: "Hà Nội", destination: "Đà Nẵng", start_date: "2026-12-20" }, missingSlots: ["adults"], revision: 2 } });
    const changed = reducePlanningClarification({ session: collecting, question: "Tôi muốn đi Huế", sourceMessageId: "message-3" });
    expect(changed).toMatchObject({ kind: "question", question: "Bạn sẽ xuất phát từ đâu?", session: { slots: { destination: "Huế" }, missingSlots: ["origin", "start_date", "adults"], sourceMessageIds: ["message-3"], revision: 2 } });
  });

  test("does not profile ordinary questions and rejects invalid reducer input safely", () => {
    expect(reducePlanningClarification({ session: null, question: "Thời tiết hôm nay thế nào?", sourceMessageId: "message-1" })).toEqual({ kind: "not_applicable" });
    expect(reducePlanningClarification({ session: null, question: "Đi đâu?", sourceMessageId: "message-1" })).toEqual({ kind: "not_applicable" });
    expect(reducePlanningClarification({ session: null, question: "Gợi ý lịch trình road trip 5 ngày", sourceMessageId: "message-1" })).toEqual({ kind: "not_applicable" });
    expect(reducePlanningClarification({ session: null, question: "Đi Huế", sourceMessageId: "" })).toEqual({ kind: "retry" });
  });

  test("does not persist arbitrary text, invalid dates, or invalid adult counts", () => {
    const collecting = { intent: "trip_planning" as const, slots: { destination: "Đà Nẵng" }, missingSlots: ["origin", "start_date", "adults"] as Array<"origin" | "start_date" | "adults">, status: "collecting" as const, sourceMessageIds: ["message-1"], revision: 1 };
    expect(reducePlanningClarification({ session: collecting, question: "Tôi thích ăn hải sản", sourceMessageId: "message-2" })).toMatchObject({ kind: "question", session: collecting });
    expect(reducePlanningClarification({ session: collecting, question: "2026-02-30", sourceMessageId: "message-3" })).toMatchObject({ kind: "question", session: collecting });
    expect(reducePlanningClarification({ session: collecting, question: "0 người lớn", sourceMessageId: "message-4" })).toMatchObject({ kind: "question", session: collecting });
  });
});
