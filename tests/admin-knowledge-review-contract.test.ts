import { describe, expect, test } from "vitest";
import { parseAdminKnowledgeCard, parseAdminKnowledgeCardList, parseAdminKnowledgeRecommendationDetail, parseAdminKnowledgeRecommendationList, parseAdminKnowledgeRecommendationResolve } from "@xuyenviet/contracts";

const card = { id: "card-1", type: "place", title: "Điểm dừng", locationName: "Huế", routeSegment: null, summary: "Thông tin có bằng chứng.", conditions: ["Áp dụng khi trời khô ráo."], practicalDetails: {}, tags: [], confidence: "community", freshnessSensitive: false, lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", updatedAt: "2026-08-04T00:00:00.000Z", createdAt: "2026-08-03T00:00:00.000Z", sources: [], indexStatus: { state: "indexed", label: "Đã index", documentStatus: "active", indexedAt: "2026-08-04T00:00:00.000Z" } };
const recommendation = { id: "work-1", status: "open", resolution: null, workType: "verification", priority: 1, createdAt: "2026-08-04T00:00:00.000Z", card: { id: "card-1", title: "Điểm dừng", summary: "Thông tin có bằng chứng.", lifecycleState: "pending_operator", knowledgeState: "community_observation", verificationRequirement: "operator_required" } };

describe("target-shaped admin knowledge read contracts", () => {
  test("accepts only exact card fields and a validated technical index state", () => {
    expect(parseAdminKnowledgeCard(card)).toEqual(card);
    expect(parseAdminKnowledgeCardList({ items: [card] })).toEqual({ items: [card] });
    expect(parseAdminKnowledgeCard({ ...card, suggestion: null })).toBeNull();
    expect(parseAdminKnowledgeCard({ ...card, indexStatus: { ...card.indexStatus, fence: "secret" } })).toBeNull();
    expect(parseAdminKnowledgeCard({ ...card, sources: [{ rawText: "secret" }] })).toBeNull();
  });

  test("rejects read fences and unknown nested recommendation fields", () => {
    expect(parseAdminKnowledgeRecommendationList({ items: [recommendation], counts: { actionable: 1, completed: 0, inactive: 0 } })).toEqual({ items: [recommendation], counts: { actionable: 1, completed: 0, inactive: 0 } });
    expect(parseAdminKnowledgeRecommendationList({ items: [{ ...recommendation, contentVersion: 1 }], counts: { actionable: 1, completed: 0, inactive: 0 } })).toBeNull();
    const detail = { ...recommendation, card: { ...recommendation.card, type: "place", locationName: "Huế", routeSegment: null, tags: [], freshnessSensitive: false }, evidence: [{ quote: "Đường dễ đi", conditions: [], supportLevel: "supporting", displayPolicy: "operator_only", capturedAt: "2026-08-04T00:00:00.000Z", sourceLabel: "Nguồn", sourceKind: "url", facebookReviewId: null }] };
    expect(parseAdminKnowledgeRecommendationDetail(detail)).toEqual(detail);
    expect(parseAdminKnowledgeRecommendationDetail({ ...detail, evidence: [{ ...detail.evidence[0], providerPayload: "secret" }] })).toBeNull();
  });

  test("uses a fence-free resolution payload so read DTOs do not disclose lifecycle versions", () => {
    expect(parseAdminKnowledgeRecommendationResolve({ action: "verify" })).toEqual({ action: "verify" });
    expect(parseAdminKnowledgeRecommendationResolve({ action: "verify", expectedContentVersion: 1 })).toBeNull();
  });
});
