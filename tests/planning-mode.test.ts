import { describe, expect, test } from "vitest";

import { planningModes, type PlanningExecutionRef } from "@xuyenviet/contracts";
import { resolvePlanningMode } from "../packages/database/src/answer-context";
import { renderSourceBundlePromptSection, type ContextPrioritySourceBundle } from "../packages/database/src/source-bundle";

const base = { sessionRevision: 4, pendingProposals: [] as Array<{ id: string; updatedAt: Date; rationale: string; operations: unknown }> };
const pending = { id: "proposal-1", updatedAt: new Date("2026-08-16T00:00:00.000Z"), rationale: "Đổi điểm dừng", operations: [] };

describe("planning mode resolver", () => {
  test("PM-01 resolves an applied selected Trip as the current plan", () => {
    const result = resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, question: "Kế hoạch hiện tại là gì?" });
    expect(result).toMatchObject({ kind: "resolved", executionRef: { mode: "current_plan", tripProjectId: "trip-1", tripAggregateVersion: 7, proposalId: null, sessionRevision: 4 } });
  });

  test("PM-02 resolves a hypothetical change without making it applied authority", () => {
    const result = resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, question: "Nếu ghé Quy Nhơn thì sao?" });
    expect(result).toMatchObject({ kind: "resolved", executionRef: { mode: "explore_change", tripAggregateVersion: 7, proposalId: null } });
  });

  test("PM-03 resolves one explicit pending proposal", () => {
    const result = resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, pendingProposals: [pending], question: "Xem đề xuất này" });
    expect(result).toMatchObject({ kind: "resolved", executionRef: { mode: "validate_proposal", proposalId: "proposal-1", proposalUpdatedAt: "2026-08-16T00:00:00.000Z" }, proposal: { id: "proposal-1" } });
  });

  test("PM-04 keeps a private turn unscoped", () => {
    const result = resolvePlanningMode({ ...base, tripProjectId: null, aggregateVersion: null, pendingProposals: [pending], question: "Nếu đổi đề xuất này thì sao?" });
    expect(result).toMatchObject({ kind: "resolved", executionRef: { mode: "unscoped_answer", tripProjectId: null, tripAggregateVersion: null, proposalId: null } });
  });

  test("PM-05 asks one clarification for ambiguous proposal/change intent", () => {
    expect(resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, pendingProposals: [pending], question: "Nếu đổi đề xuất thì sao?" })).toMatchObject({ kind: "clarification" });
  });

  test("PM-06 asks one clarification when a proposal request has no unique pending proposal", () => {
    expect(resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, pendingProposals: [pending], question: "Xem đề xuất" })).toMatchObject({ kind: "clarification" });
    expect(resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, question: "Xem đề xuất này" })).toMatchObject({ kind: "clarification", question: expect.stringContaining("chưa có") });
  });

  test("PM-07 resolves only the four supported modes without broad change-token false positives", () => {
    expect(planningModes).toEqual(["current_plan", "explore_change", "validate_proposal", "unscoped_answer"]);
    expect(resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, question: "Tôi thử món mới được không?" })).toMatchObject({ kind: "resolved", executionRef: { mode: "current_plan" } });
    expect(resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, question: "Nếu ghé Quy Nhơn thì sao?" })).toMatchObject({ kind: "resolved", executionRef: { mode: "explore_change" } });
  });

  test("renders proposal and exploration as non-applied context", () => {
    const proposal = resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, pendingProposals: [pending], question: "Xem đề xuất này" });
    const explore = resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, question: "Nếu ghé Quy Nhơn thì sao?" });
    if (proposal.kind !== "resolved" || explore.kind !== "resolved") throw new Error("Expected resolved planning modes.");
    expect(renderSourceBundlePromptSection(bundle(proposal.executionRef, proposal.proposal)).section).toContain("đang chờ áp dụng, không phải trạng thái Trip");
    expect(renderSourceBundlePromptSection(bundle(explore.executionRef, null)).section).toContain("khám phá thay đổi giả định");
  });

  test("retains the planning mode and reference ledger in an oversized essential fallback", () => {
    const proposal = resolvePlanningMode({ ...base, tripProjectId: "trip-1", aggregateVersion: 7, pendingProposals: [pending], question: "Xem đề xuất này" });
    if (proposal.kind !== "resolved") throw new Error("Expected resolved proposal mode.");
    const rendered = renderSourceBundlePromptSection({ ...bundle(proposal.executionRef, proposal.proposal), chatTripContext: { tripProjectFacts: [{ field: "notes", value: "x".repeat(20_000), source: "trip_project" }], chatFacts: [], conflicts: [] } });
    expect(rendered.section).toContain("xem đề xuất đang chờ");
    expect(JSON.parse(rendered.tripContext.serialization)).toMatchObject({ planningExecutionRef: proposal.executionRef, pendingProposalId: "proposal-1" });
    expect(rendered.tripContext.included).toEqual(expect.arrayContaining([{ kind: "planning_session", id: "planning_context_session", version: 4 }, { kind: "pending_proposal", id: "proposal-1", version: null }]));
  });
});

function bundle(planningExecutionRef: PlanningExecutionRef, pendingProposal: { id: string; rationale: string; operations: unknown } | null): ContextPrioritySourceBundle {
  return {
    planningExecutionRef,
    pendingProposal,
    tripAnswerContext: { version: 1, hasProjectScope: true, tripProjectId: "trip-1", aggregateVersion: 7, primaryConversationId: "conversation-1", anchors: [], planItems: [], constraints: null, currentConversationFacts: [], conflicts: [] },
    chatTripContext: { tripProjectFacts: [], chatFacts: [], conflicts: [] },
    knowledge: [], web: [], general: { available: true },
    retrievalDecision: { approvedKnowledgeCandidateCount: 0, approvedKnowledgeSelectedCount: 0, approvedKnowledgeTargetCount: 3, approvedKnowledgeRelevanceThreshold: 1, broadPlanningQuestion: false, freshnessRequired: false, conflictDetected: false, webSearchTriggered: false, webSearchTriggerReasons: [], generalReasoningUsed: true },
    warnings: [],
  };
}
