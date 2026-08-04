import { describe, expect, test } from "vitest";

import { evaluateKnowledgeTravelerPolicy } from "@/features/knowledge/state";

describe("knowledge traveler policy", () => {
  test("identifies an invalid target knowledge classification", () => {
    expect(evaluateKnowledgeTravelerPolicy({
      lifecycleState: "active",
      knowledgeState: "unknown" as never,
      verificationRequirement: "none",
      title: "Điểm dừng đã xác nhận",
      summary: "Thông tin có đủ metadata an toàn cho traveler.",
      locationName: "Huế",
      conditions: [],
      activeTravelerSafeEvidenceCount: 1,
      activeTravelerSafeIndependenceKeyCount: 1,
    })).toEqual({
      policy: "exclude",
      reasons: ["invalid_knowledge_state", "unsupported_knowledge_state"],
    });
  });

  test("excludes conditional knowledge without at least one bounded condition", () => {
    expect(evaluateKnowledgeTravelerPolicy({
      lifecycleState: "active",
      knowledgeState: "conditional",
      verificationRequirement: "none",
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
