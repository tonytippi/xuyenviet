import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { assistantRetrievalDecisions, conversations, messages, users } from "@/db/schema";
import { persistAssistantAnswerProvenance } from "../packages/database/src/provenance";
import { evaluateRequiredNeeds, type ContextPrioritySourceBundle } from "../packages/database/src/source-bundle";
import type { KnowledgeSearchResult } from "../packages/database/src/knowledge-search";
import { resetTestDatabase, testDb } from "./helpers/db";

const card = (id: string, routeSegment: string | null = null): KnowledgeSearchResult => ({
  id,
  type: "place",
  title: "Thông tin cung đường",
  locationName: "Đà Nẵng",
  normalizedCurrentProvinceName: null,
  routeSegment,
  summary: "Thông tin thực tế cho hành trình.",
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
  updatedAt: new Date("2026-08-17T00:00:00.000Z"),
  createdAt: new Date("2026-08-17T00:00:00.000Z"),
  score: 1,
  policy: "contextual_use",
  policyReasons: [],
  sources: [],
  evidence: [],
});

function sourceBundle(requiredNeeds: ContextPrioritySourceBundle["retrievalDecision"]["requiredNeeds"]): ContextPrioritySourceBundle {
  return {
    chatTripContext: { tripProjectFacts: [], chatFacts: [], conflicts: [] },
    knowledge: [],
    web: [],
    general: { available: true },
    retrievalDecision: {
      approvedKnowledgeCandidateCount: 8,
      approvedKnowledgeSelectedCount: 8,
      approvedKnowledgeRelevanceThreshold: 1,
      broadPlanningQuestion: true,
      freshnessRequired: false,
      conflictDetected: false,
      webSearchTriggered: false,
      webSearchTriggerReasons: [],
      generalReasoningUsed: true,
      requiredNeeds,
    },
    warnings: [],
  };
}

describe("required-need retrieval persistence and route isolation", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("persists one bounded required-needs-v1 snapshot through the existing provenance transaction", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await testDb.insert(conversations).values({ id: "conversation", userId: "owner" });
    await testDb.insert(messages).values([
      { id: "user-message", conversationId: "conversation", userId: "owner", role: "user", content: "Gợi ý hành trình" },
      { id: "assistant-message", conversationId: "conversation", userId: "owner", role: "assistant", content: "Gợi ý an toàn" },
    ]);
    const requiredNeeds = evaluateRequiredNeeds({ question: "Đà Nẵng", knowledge: Array.from({ length: 8 }, (_, index) => card(`card-${index}`)) });

    await persistAssistantAnswerProvenance(testDb, {
      userId: "owner",
      conversationId: "conversation",
      userMessageId: "user-message",
      assistantMessageId: "assistant-message",
      sourceBundle: sourceBundle(requiredNeeds),
    });

    const [decision] = await testDb.select({ snapshot: assistantRetrievalDecisions.knowledgePolicySnapshot }).from(assistantRetrievalDecisions).where(eq(assistantRetrievalDecisions.assistantMessageId, "assistant-message"));
    expect(decision?.snapshot).toEqual({ version: "required-needs-v1", needs: [{ id: "itinerary", outcome: "satisfied", evidenceCardIds: ["card-0", "card-1", "card-2", "card-3", "card-4"] }] });
    expect(Buffer.byteLength(JSON.stringify(decision?.snapshot), "utf8")).toBeLessThanOrEqual(4_096);
  });

  test("does not let an off-route card satisfy a selected canonical route need", () => {
    const requiredNeeds = evaluateRequiredNeeds({
      question: "Gợi ý cung đường Hà Nội đến Đà Nẵng",
      knowledge: [card("selected-route", "hanoi-da-nang-national-1a"), card("off-route", "hanoi-da-nang-ho-chi-minh-road")],
      planningExecutionRef: { mode: "current_plan", tripProjectId: "trip", tripAggregateVersion: 1, proposalId: null, proposalUpdatedAt: null, sessionRevision: 1 },
      routePathIds: ["hanoi-da-nang-national-1a"],
    });

    expect(requiredNeeds.needs).toContainEqual({ id: "route", outcome: "satisfied", evidenceCardIds: ["selected-route"] });
  });

  test("bounds malformed supplied snapshots at the persistence boundary", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    await testDb.insert(conversations).values({ id: "conversation", userId: "owner" });
    await testDb.insert(messages).values([{ id: "user-message", conversationId: "conversation", userId: "owner", role: "user", content: "Đà Nẵng" }, { id: "assistant-message", conversationId: "conversation", userId: "owner", role: "assistant", content: "Gợi ý" }]);
    const bundle = sourceBundle({ version: "required-needs-v1", needs: [{ id: "invalid" as never, outcome: "bad" as never, evidenceCardIds: ["x".repeat(10_000)] }] });

    await persistAssistantAnswerProvenance(testDb, { userId: "owner", conversationId: "conversation", userMessageId: "user-message", assistantMessageId: "assistant-message", sourceBundle: bundle });
    const [decision] = await testDb.select({ snapshot: assistantRetrievalDecisions.knowledgePolicySnapshot }).from(assistantRetrievalDecisions);
    expect(decision?.snapshot).toEqual({ version: "required-needs-v1", needs: [] });
  });
});
