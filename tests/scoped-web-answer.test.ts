import { describe, expect, test } from "vitest";

import { buildScopedWebSearchQuery, decideWebSearchFallback, type RequiredNeedSnapshot } from "../packages/database/src/source-bundle";
import type { KnowledgeSearchResult } from "../packages/database/src/knowledge-search";

const context = { tripProjectFacts: [], chatFacts: [], conflicts: [] };

const card = (overrides: Partial<KnowledgeSearchResult> = {}): KnowledgeSearchResult => ({
  id: "card-1",
  type: "place",
  title: "Điểm dừng Huế",
  locationName: "Huế",
  normalizedCurrentProvinceName: null,
  routeSegment: null,
  summary: "Điểm dừng phù hợp.",
  practicalDetails: {},
  tags: [],
  confidence: "curated",
  freshnessSensitive: false,
  lifecycleState: "active",
  knowledgeState: "community_observation",
  verificationRequirement: "none",
  conditions: [],
  contentVersion: 1,
  evidenceSetRevision: 1,
  updatedAt: new Date(),
  createdAt: new Date(),
  score: 1,
  policy: "contextual_use",
  policyReasons: [],
  sources: [],
  evidence: [],
  ...overrides,
});

describe("scoped web answer", () => {
  test("builds one minimized freshness query from the unresolved need and location", () => {
    const requiredNeeds: RequiredNeedSnapshot = {
      version: "required-needs-v1",
      needs: [
        { id: "itinerary", outcome: "satisfied", evidenceCardIds: ["card-1"] },
        { id: "freshness", outcome: "missing", evidenceCardIds: [] },
      ],
    };

    expect(buildScopedWebSearchQuery({
      question: "Tôi tên là An, hãy gợi ý lịch trình và giá vé ở Huế hôm nay",
      routePathIds: [],
      requiredNeeds,
    })).toBe("thong tin hien tai gia ve hue hom nay");
  });

  test("uses only the selected canonical route as route scope", () => {
    const query = buildScopedWebSearchQuery({
      question: "Tình trạng cung đường Hà Nội Đà Nẵng thế nào?",
      routePathIds: ["hanoi-da-nang-national-1a", "da-nang-quy-nhon-coastal"],
      requiredNeeds: { version: "required-needs-v1", needs: [{ id: "route", outcome: "missing", evidenceCardIds: [] }] },
    });

    expect(query).toContain("hanoi da nang national 1a");
    expect(query).not.toContain("quy nhon");
  });

  test("does not admit web fallback when every required need is satisfied", () => {
    const decision = decideWebSearchFallback({
      question: "Gợi ý điểm dừng ở Huế",
      knowledge: [card()],
      chatTripContext: context,
      warnings: [],
    });

    expect(decision.webSearchTriggered).toBe(false);
    expect(buildScopedWebSearchQuery({ question: "Gợi ý điểm dừng ở Huế", routePathIds: [], requiredNeeds: decision.requiredNeeds })).toBeNull();
  });

  test("maps a conflict to one verification-required need instead of an independent trigger", () => {
    const decision = decideWebSearchFallback({
      question: "Gợi ý điểm dừng ở Huế",
      knowledge: [card()],
      chatTripContext: { ...context, conflicts: [{ field: "destination", canonicalValue: "Huế", lowerPriorityValue: "Đà Lạt", projectValue: "Huế", conversationValue: "Đà Lạt", source: "conversation_chat", priority: "lower", material: true }] },
      warnings: [],
    });

    expect(decision.requiredNeeds.needs).toEqual([{ id: "itinerary", outcome: "requires_verification", evidenceCardIds: ["card-1"] }]);
    expect(decision.webSearchTriggerReasons).toEqual(["source_conflict"]);
  });

  test("uses a verification-required itinerary need rather than a broad planning trigger", () => {
    const decision = decideWebSearchFallback({
      question: "Gợi ý lịch trình ở Huế",
      knowledge: [card({ policy: "caveat_only" })],
      chatTripContext: context,
      warnings: [],
    });

    expect(decision.webSearchTriggerReasons).toEqual(["selected_knowledge_requires_verification"]);
    expect(buildScopedWebSearchQuery({ question: "Gợi ý lịch trình ở Huế", routePathIds: [], requiredNeeds: decision.requiredNeeds })).toBe("o hue");
  });
});
