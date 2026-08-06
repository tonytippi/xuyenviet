import { describe, expect, it } from "vitest";

import { parseAcceptTripCreationRecommendationCommand, parseContinueInTripCommand, parseRecommendationDecisionCommand, parseTripRecommendationResponse } from "../packages/contracts/src";
import { fingerprintTripRecommendationFacts, normalizeTripRecommendationFacts } from "../packages/database/src/trip-recommendations";
import { buildCanonicalAiAskUrl, getSingleAiAskQueryValue } from "../apps/web/src/features/chat-trips/ai-ask-url";

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

  it("accepts each exact response shape and rejects leaked or reordered actions", () => {
    const valid = [
      { tripCreationRecommendation: { kind: "none" }, tripContextRecommendation: { kind: "none" } },
      { tripCreationRecommendation: { kind: "offer", decisionId: "decision-1", actions: ["save_trip", "private_answer"] }, tripContextRecommendation: { kind: "single", decisionId: "decision-2", tripProjectId: "project-1", title: "Đà Lạt", actions: ["continue_in_trip", "private_answer"] } },
      { tripCreationRecommendation: { kind: "clarify", question: "Bạn đi khi nào?", actions: ["private_answer"] }, tripContextRecommendation: { kind: "multiple", decisionId: "decision-3", actions: ["private_answer"] } },
    ];
    for (const value of valid) expect(parseTripRecommendationResponse(value)).not.toBeNull();
    expect(parseTripRecommendationResponse({ tripCreationRecommendation: { kind: "none", title: "Injected" }, tripContextRecommendation: { kind: "none" } })).toBeNull();
    expect(parseTripRecommendationResponse({ tripCreationRecommendation: { kind: "clarify", question: "Bạn đi khi nào?", actions: ["private_answer"], tripProjectId: "project-1" }, tripContextRecommendation: { kind: "none" } })).toBeNull();
    expect(parseTripRecommendationResponse({ tripCreationRecommendation: { kind: "offer", decisionId: "decision-1", actions: ["private_answer", "save_trip"] }, tripContextRecommendation: { kind: "none" } })).toBeNull();
    expect(parseTripRecommendationResponse({ tripCreationRecommendation: { kind: "none" }, tripContextRecommendation: { kind: "multiple", decisionId: "decision-1", actions: ["private_answer"], title: "Leaked" } })).toBeNull();
  });

  it("requires exact owner decision command shapes", () => {
    expect(parseRecommendationDecisionCommand({ decisionId: "decision-1" })).toEqual({ decisionId: "decision-1" });
    expect(parseRecommendationDecisionCommand({ decisionId: " decision-1" })).toBeNull();
    expect(parseRecommendationDecisionCommand({ decisionId: "decision-1", tripProjectId: "project-1" })).toBeNull();
    expect(parseContinueInTripCommand({ decisionId: "decision-1", tripProjectId: "project-1" })).toEqual({ decisionId: "decision-1", tripProjectId: "project-1" });
    expect(parseContinueInTripCommand({ decisionId: "decision-1" })).toBeNull();
    expect(parseContinueInTripCommand({ decisionId: "decision-1", tripProjectId: "project-1", title: "Injected" })).toBeNull();
  });
});

describe("canonical AI Ask URL", () => {
  it("uses one unscoped or server-returned scope URL and rejects multi-valued query inputs", () => {
    expect(buildCanonicalAiAskUrl()).toBe("/ai-ask");
    expect(buildCanonicalAiAskUrl("conversation-1")).toBe("/ai-ask?conversationId=conversation-1");
    expect(buildCanonicalAiAskUrl("conversation-1", "project-1")).toBe("/ai-ask?conversationId=conversation-1&tripProjectId=project-1");
    expect(buildCanonicalAiAskUrl(undefined, undefined, "historic-1")).toBe("/ai-ask?historyConversationId=historic-1");
    expect(getSingleAiAskQueryValue(["project-1", "project-2"])).toBeUndefined();
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
