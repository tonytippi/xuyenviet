import { describe, expect, it } from "vitest";

import { parseAcceptTripCreationRecommendationCommand, parseTripRecommendationResponse } from "../packages/contracts/src";
import { fingerprintTripRecommendationFacts, normalizeTripRecommendationFacts } from "../packages/database/src/trip-recommendations";

describe("trip recommendation contracts", () => {
  it("rejects browser authority beyond an exact decision and idempotency key", () => {
    expect(parseAcceptTripCreationRecommendationCommand({ decisionId: "decision-1", idempotencyKey: "a".repeat(16) })).toEqual({ decisionId: "decision-1", idempotencyKey: "a".repeat(16) });
    expect(parseAcceptTripCreationRecommendationCommand({ decisionId: "decision-1", idempotencyKey: "a".repeat(16), title: "Injected" })).toBeNull();
    expect(parseAcceptTripCreationRecommendationCommand({ decisionId: "decision-1", idempotencyKey: "short" })).toBeNull();
  });

  it("accepts bounded typed Vietnamese clarify data but rejects arbitrary actions", () => {
    expect(parseTripRecommendationResponse({ tripCreationRecommendation: { kind: "clarify", question: "Bạn dự định đi đâu?", actions: ["private_answer"] }, tripContextRecommendation: { kind: "none" } })).not.toBeNull();
    expect(parseTripRecommendationResponse({ tripCreationRecommendation: { kind: "clarify", question: "Bạn dự định đi đâu?", actions: ["save_trip"] }, tripContextRecommendation: { kind: "none" } })).toBeNull();
  });
});

describe("trip recommendation fact fingerprint", () => {
  it("normalizes whitespace, casing, and order deterministically", () => {
    const left = [{ field: "destination", value: "  Đà   Lạt " }, { field: "adults", value: " 2 " }];
    const right = [{ field: "adults", value: "2" }, { field: "destination", value: "đà lạt" }];
    expect(normalizeTripRecommendationFacts(left)).toEqual(normalizeTripRecommendationFacts(right));
    expect(fingerprintTripRecommendationFacts(left)).toBe(fingerprintTripRecommendationFacts(right));
  });

  it("changes when a normalized active fact changes", () => {
    expect(fingerprintTripRecommendationFacts([{ field: "destination", value: "Đà Lạt" }])).not.toBe(fingerprintTripRecommendationFacts([{ field: "destination", value: "Nha Trang" }]));
  });
});
