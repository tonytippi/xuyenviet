import { describe, expect, test } from "vitest";

import { defaultYoutubeDiscoveryPolicy, evaluateYoutubeDiscoveryRecommendation, parseYoutubeDiscoveryPolicy, round6 } from "@xuyenviet/domain";

const assessment = { relevanceScore: 1, expectedValueScore: 1, freshnessFitScore: 1, commercialRiskScore: 0, duplicateRiskScore: 0, signals: ["commercial_risk", "practical_question_demand", "commercial_risk"] };
const gates = { canonical: true, currentRunEnriched: true, eligibility: "eligible" as const };

describe("YouTube Discovery deterministic recommendations", () => {
  test("uses score-band equality and decimal half-up rounding", () => {
    const policy = parseYoutubeDiscoveryPolicy({ ...defaultYoutubeDiscoveryPolicy, deferMinimum: 0.5, considerMinimum: 0.8 });
    expect(evaluateYoutubeDiscoveryRecommendation(policy, { ...assessment, relevanceScore: 0.625, expectedValueScore: 0.625, freshnessFitScore: 0.625 }, gates)).toMatchObject({ score: 0.5, recommendation: "defer", reason: "between_defer_and_consider_band" });
    expect(evaluateYoutubeDiscoveryRecommendation(policy, assessment, gates)).toMatchObject({ score: 0.8, recommendation: "consider", reason: "eligible_score_band" });
    expect(round6(0.1234565)).toBe(0.123457);
    expect(round6(0.9999995)).toBe(1);
    expect(round6(0.0000005)).toBe(0.000001);
  });

  test("returns deterministic, bounded closed explanations", () => {
    const first = evaluateYoutubeDiscoveryRecommendation(defaultYoutubeDiscoveryPolicy, assessment, gates);
    expect(first).toEqual(evaluateYoutubeDiscoveryRecommendation(defaultYoutubeDiscoveryPolicy, assessment, gates));
    expect(first).toMatchObject({ factors: ["relevance", "expected_value", "freshness_fit"], penalties: [], signals: ["commercial_risk", "practical_question_demand"] });
    expect(first.factors.length + first.penalties.length).toBeLessThanOrEqual(5);
  });

  test("hard gates dominate model scores", () => {
    expect(evaluateYoutubeDiscoveryRecommendation(defaultYoutubeDiscoveryPolicy, assessment, { ...gates, canonical: false })).toMatchObject({ recommendation: "skip", reason: "canonical_mismatch" });
    expect(evaluateYoutubeDiscoveryRecommendation(defaultYoutubeDiscoveryPolicy, assessment, { ...gates, currentRunEnriched: false })).toMatchObject({ recommendation: "skip", reason: "not_current_run_enriched" });
    expect(evaluateYoutubeDiscoveryRecommendation(defaultYoutubeDiscoveryPolicy, assessment, { ...gates, eligibility: "already_compatible" })).toMatchObject({ recommendation: "skip", reason: "already_compatible" });
  });

  test("rejects non-normalized weights and invalid bands", () => {
    expect(() => parseYoutubeDiscoveryPolicy({ ...defaultYoutubeDiscoveryPolicy, relevanceWeight: 0.3000001 })).toThrow();
    expect(() => parseYoutubeDiscoveryPolicy({ ...defaultYoutubeDiscoveryPolicy, duplicateRiskWeight: 0.2 })).toThrow();
    expect(() => parseYoutubeDiscoveryPolicy({ ...defaultYoutubeDiscoveryPolicy, deferMinimum: 0.7, considerMinimum: 0.7 })).toThrow();
    expect(() => parseYoutubeDiscoveryPolicy({ ...defaultYoutubeDiscoveryPolicy, deferMinimum: 0.3500001 })).toThrow();
  });
});
