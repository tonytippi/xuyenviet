import { describe, expect, test } from "vitest";

import { evaluateKnowledgeTravelerPolicy } from "@/features/knowledge/state";

describe("knowledge traveler policy", () => {
  test("identifies a known but unsupported knowledge state", () => {
    expect(evaluateKnowledgeTravelerPolicy({
      publicationState: "active",
      knowledgeState: "confirmed",
      reviewState: "reviewed",
      verificationState: "not_required",
      title: "Điểm dừng đã xác nhận",
      summary: "Thông tin có đủ metadata an toàn cho traveler.",
      locationName: "Huế",
      conditions: [],
      activeTravelerSafeEvidenceCount: 1,
      activeTravelerSafeIndependenceKeyCount: 1,
    })).toEqual({
      policy: "exclude",
      reasons: ["unsupported_knowledge_state"],
    });
  });

  test("excludes conditional knowledge without at least one bounded condition", () => {
    expect(evaluateKnowledgeTravelerPolicy({
      publicationState: "active",
      knowledgeState: "conditional",
      reviewState: "reviewed",
      verificationState: "not_required",
      title: "Điểm dừng theo điều kiện",
      summary: "Thông tin có đủ metadata an toàn cho traveler.",
      locationName: "Huế",
      conditions: [],
      activeTravelerSafeEvidenceCount: 1,
      activeTravelerSafeIndependenceKeyCount: 1,
    })).toEqual({
      policy: "exclude",
      reasons: ["invalid_conditions"],
    });
  });
});
