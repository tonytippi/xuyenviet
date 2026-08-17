import { describe, expect, test } from "vitest";

import { assembleContextPrioritySourceBundle, decideWebSearchFallback, evaluateRequiredNeeds, renderSourceBundlePromptSection, setSourceBundleTestDependencies, type ContextPrioritySourceBundle } from "../packages/database/src/source-bundle";
import { renderApprovedKnowledgePromptSection } from "../packages/database/src/approved-knowledge";
import { afterEach, vi } from "vitest";
import type { KnowledgeSearchResult } from "../packages/database/src/knowledge-search";

const card = (id: string, overrides: Partial<KnowledgeSearchResult> = {}): KnowledgeSearchResult => ({
  id,
  type: "place",
  title: "Điểm dừng Huế",
  locationName: "Huế",
  routeSegment: null,
  summary: "Dừng chân phù hợp cho hành trình.",
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

const context = { tripProjectFacts: [], chatFacts: [], conflicts: [] };

describe("required-need retrieval", () => {
  afterEach(() => setSourceBundleTestDependencies(undefined));
  test("does not trigger web merely because one applicable card is below a legacy count", () => {
    const decision = decideWebSearchFallback({ question: "Gợi ý điểm dừng ở Huế", knowledge: [card("one")], chatTripContext: context, warnings: [] });
    expect(decision.webSearchTriggered).toBe(false);
    expect(decision.requiredNeeds).toEqual({ version: "required-needs-v1", needs: [{ id: "itinerary", outcome: "satisfied", evidenceCardIds: ["one"] }] });
  });

  test("does not add a route need for generic planning when one place card covers the request", () => {
    const decision = decideWebSearchFallback({ question: "Gợi ý điểm dừng ở Huế", knowledge: [card("one")], chatTripContext: context, warnings: [] });
    const rendered = renderSourceBundlePromptSection({ requiredNeedQuestion: "Gợi ý điểm dừng ở Huế", chatTripContext: context, knowledge: [card("one")], web: [], general: { available: true }, retrievalDecision: decision, warnings: [] });
    expect(rendered.retrievalDecision.requiredNeeds).toEqual({ version: "required-needs-v1", needs: [{ id: "itinerary", outcome: "satisfied", evidenceCardIds: ["one"] }] });
    expect(rendered.retrievalDecision.webSearchTriggered).toBe(false);
  });

  test("requires a material location anchor in addition to generic accommodation terms", () => {
    const hoiAn = card("hoi-an", { type: "hotel_area", title: "Khách sạn ở Hội An", locationName: "Hội An", summary: "Khu khách sạn gần phố cổ." });
    const daNang = card("da-nang", { type: "hotel_area", title: "Khách sạn ở Đà Nẵng", locationName: "Đà Nẵng", summary: "Khu khách sạn gần biển." });
    const snapshot = evaluateRequiredNeeds({ question: "Gợi ý khách sạn ở Đà Nẵng", knowledge: [hoiAn, daNang] });
    expect(snapshot.needs).toEqual([{ id: "itinerary", outcome: "satisfied", evidenceCardIds: ["da-nang"] }]);
    expect(evaluateRequiredNeeds({ question: "Gợi ý khách sạn ở Đà Nẵng", knowledge: [hoiAn] }).needs).toEqual([{ id: "itinerary", outcome: "missing", evidenceCardIds: [] }]);
  });

  test("does not let a route note satisfy a generic itinerary need", () => {
    const routeNote = card("route-note", { type: "route_note", title: "Cung đường Huế", locationName: "Huế", routeSegment: "hue-route", summary: "Điểm dừng ở Huế." });
    const activity = card("activity", { type: "activity", title: "Hoạt động ở Huế", locationName: "Huế" });
    const generalTip = card("general", { type: "general_travel_tip", title: "Mẹo điểm dừng Huế", locationName: "Huế" });
    const question = "Gợi ý điểm dừng ở Huế";
    expect(evaluateRequiredNeeds({ question, knowledge: [routeNote] }).needs).toEqual([{ id: "itinerary", outcome: "missing", evidenceCardIds: [] }]);
    expect(evaluateRequiredNeeds({ question, knowledge: [activity, generalTip] }).needs).toEqual([{ id: "itinerary", outcome: "satisfied", evidenceCardIds: ["activity", "general"] }]);
  });

  test("omits an oversized first card and continues to a later required contributor", () => {
    const oversized = card("oversized", { conditions: Array.from({ length: 12 }, () => "x".repeat(160)) });
    const rendered = renderApprovedKnowledgePromptSection([oversized, card("later")]);
    expect(rendered.omittedCardIds).toEqual(["oversized"]);
    expect(rendered.renderedCardIds).toEqual(["later"]);
  });

  test("revalidates withdrawn knowledge before it can satisfy a need or enter the prompt", async () => {
    const withdrawn = card("withdrawn");
    setSourceBundleTestDependencies({
      loadAnswerContext: vi.fn().mockResolvedValue({ version: 1, hasProjectScope: false, tripProjectId: null, aggregateVersion: null, primaryConversationId: null, anchors: [], planItems: [], constraints: null, currentConversationFacts: [], facts: [], conflicts: [] }),
      loadApprovedKnowledgeForAiAsk: vi.fn().mockResolvedValue({ results: [withdrawn], candidateCount: 1, policySummary: { excludedPolicyCounts: { conflict: 0, verificationRequired: 0, other: 0 }, excludedReasonCodes: [] } }),
      isKnowledgeCardEligibleForProjection: vi.fn().mockResolvedValue(false),
    });
    const bundle = await assembleContextPrioritySourceBundle({ userId: "user", conversationId: "conversation", question: "Gợi ý điểm dừng ở Huế" });
    expect(bundle.knowledge).toEqual([]);
    expect(bundle.retrievalDecision.requiredNeeds.needs).toEqual([{ id: "itinerary", outcome: "missing", evidenceCardIds: [] }]);
  });

  test("returns every required-need outcome without letting unrelated facts satisfy itinerary", () => {
    expect(evaluateRequiredNeeds({ question: "Đi Huế", knowledge: [card("match")]}).needs).toEqual([{ id: "itinerary", outcome: "satisfied", evidenceCardIds: ["match"] }]);
    expect(evaluateRequiredNeeds({ question: "Đi Sa Pa", knowledge: [card("hue")]}).needs).toEqual([{ id: "itinerary", outcome: "missing", evidenceCardIds: [] }]);
    expect(evaluateRequiredNeeds({ question: "Đi Huế", knowledge: [card("verify", { policy: "caveat_only" })]}).needs).toEqual([{ id: "itinerary", outcome: "requires_verification", evidenceCardIds: ["verify"] }]);
    expect(evaluateRequiredNeeds({ question: "Gợi ý cung đường Huế", knowledge: [card("route", { type: "route_note", routeSegment: "hanoi-da-nang-national-1a" })]}).needs).toContainEqual({ id: "route", outcome: "requires_clarification", evidenceCardIds: [] });
  });

  test("marks a freshness-sensitive itinerary fact as requiring verification", () => {
    const snapshot = evaluateRequiredNeeds({ question: "Đi Huế", knowledge: [card("fresh", { freshnessSensitive: true })] });
    expect(snapshot.needs).toEqual([{ id: "itinerary", outcome: "requires_verification", evidenceCardIds: ["fresh"] }]);
  });

  test("keeps current-plan route clarification after rendering without route authority", () => {
    const decision = decideWebSearchFallback({ question: "Gợi ý cung đường Huế", knowledge: [card("hue")], chatTripContext: context, warnings: [], planningExecutionRef: { mode: "current_plan", tripProjectId: "trip", tripAggregateVersion: 1, proposalId: null, proposalUpdatedAt: null, sessionRevision: 1 } });
    const rendered = renderSourceBundlePromptSection({ requiredNeedQuestion: "Gợi ý cung đường Huế", planningExecutionRef: { mode: "current_plan", tripProjectId: "trip", tripAggregateVersion: 1, proposalId: null, proposalUpdatedAt: null, sessionRevision: 1 }, chatTripContext: context, knowledge: [card("hue")], web: [], general: { available: true }, retrievalDecision: decision, warnings: [] });
    expect(rendered.retrievalDecision.requiredNeeds.needs).toContainEqual({ id: "route", outcome: "requires_clarification", evidenceCardIds: [] });
  });

  test("scopes a route need to one question-matched selected transport leg", () => {
    const legA = { id: "leg-a", version: 1, kind: "leg" as const, anchorRole: null, type: "transport" as const, state: "planned" as const, label: "Chặng Hà Nội Đà Nẵng", ordinal: 0, parentItemId: null, canonicalRoutePathId: "hanoi-da-nang-national-1a", transportOriginLabel: "Hà Nội", transportDestinationLabel: "Đà Nẵng" };
    const legB = { ...legA, id: "leg-b", label: "Chặng Đà Nẵng Quy Nhơn", ordinal: 1, canonicalRoutePathId: "da-nang-quy-nhon-coastal", transportOriginLabel: "Đà Nẵng", transportDestinationLabel: "Quy Nhơn" };
    const planningExecutionRef = { mode: "current_plan", tripProjectId: "trip", tripAggregateVersion: 1, proposalId: null, proposalUpdatedAt: null, sessionRevision: 1 } as const;
    const question = "Cung đường Hà Nội Đà Nẵng thế nào?";
    const decision = decideWebSearchFallback({ question, knowledge: [card("leg-b-fact", { type: "route_note", routeSegment: "da-nang-quy-nhon-coastal" })], chatTripContext: context, warnings: [], planningExecutionRef, routePathIds: ["hanoi-da-nang-national-1a"] });
    const rendered = renderSourceBundlePromptSection({ requiredNeedQuestion: question, planningExecutionRef, tripAnswerContext: { version: 1, hasProjectScope: true, tripProjectId: "trip", aggregateVersion: 1, primaryConversationId: "conversation", anchors: [], planItems: [legA, legB], constraints: null, currentConversationFacts: [], conflicts: [] }, chatTripContext: context, knowledge: [card("leg-b-fact", { type: "route_note", routeSegment: "da-nang-quy-nhon-coastal" })], web: [], general: { available: true }, retrievalDecision: decision, warnings: [] });
    expect(rendered.retrievalDecision.requiredNeeds.needs).toContainEqual({ id: "route", outcome: "missing", evidenceCardIds: [] });
  });

  test("keeps a freshness gap explicit even when multiple cards are available", () => {
    const decision = decideWebSearchFallback({ question: "Giá vé ở Huế hôm nay?", knowledge: [card("one"), card("two")], chatTripContext: context, warnings: [] });
    expect(decision.requiredNeeds.needs).toContainEqual({ id: "freshness", outcome: "missing", evidenceCardIds: [] });
    expect(decision.webSearchTriggered).toBe(true);
  });

  test("recomputes coverage from cards that survive prompt rendering", () => {
    const long = card("omitted", { summary: "x".repeat(3_000) });
    const bundle: ContextPrioritySourceBundle = {
      chatTripContext: context,
      knowledge: [long, card("rendered")],
      web: [],
      general: { available: true },
      retrievalDecision: decideWebSearchFallback({ question: "Gợi ý điểm dừng ở Huế", knowledge: [long, card("rendered")], chatTripContext: context, warnings: [] }),
      warnings: [],
    };
    const rendered = renderSourceBundlePromptSection(bundle);
    expect(rendered.promptUsage.knowledgeCardIds).toEqual(["omitted"]);
    expect(bundle.retrievalDecision.requiredNeeds.needs[0]).toMatchObject({ evidenceCardIds: ["omitted"] });
    expect(rendered.retrievalDecision.approvedKnowledgeSelectedCount).toBe(1);
  });

  test("bounds persisted required-need evidence IDs", () => {
    const snapshot = evaluateRequiredNeeds({ question: "Gợi ý điểm dừng ở Huế", knowledge: Array.from({ length: 8 }, (_, index) => card(`card-${index}`)) });
    expect(snapshot.needs[0]?.evidenceCardIds).toHaveLength(5);
    expect(Buffer.byteLength(JSON.stringify(snapshot), "utf8")).toBeLessThanOrEqual(4_096);
  });
});
