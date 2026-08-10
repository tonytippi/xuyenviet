import { describe, expect, test } from "vitest";

import { parseYoutubeDiscoveryTriageAssessment } from "../packages/database/src/youtube-discovery";

const allowedSignals = ["practical_question_demand", "commercial_risk"] as const;
const assessment = { relevanceScore: 0.8, expectedValueScore: 0.6, freshnessFitScore: 0.4, commercialRiskScore: 0.2, duplicateRiskScore: 0.1, signals: ["practical_question_demand"] };

describe("YouTube Discovery AI metadata triage contract", () => {
  test("accepts only the closed, finite, bounded assessment shape", () => {
    expect(parseYoutubeDiscoveryTriageAssessment(assessment, allowedSignals)).toEqual(assessment);
  });

  test("rejects free text, unknown keys, invalid scores, and unsafe signals", () => {
    expect(parseYoutubeDiscoveryTriageAssessment({ ...assessment, explanation: "retain this" }, allowedSignals)).toBeNull();
    expect(parseYoutubeDiscoveryTriageAssessment({ ...assessment, relevanceScore: Number.NaN }, allowedSignals)).toBeNull();
    expect(parseYoutubeDiscoveryTriageAssessment({ ...assessment, signals: ["commercial_risk", "commercial_risk"] }, allowedSignals)).toBeNull();
    expect(parseYoutubeDiscoveryTriageAssessment({ ...assessment, signals: [] }, allowedSignals)).toEqual({ ...assessment, signals: [] });
    expect(parseYoutubeDiscoveryTriageAssessment({ ...assessment, signals: ["creator_responsiveness"] }, allowedSignals)).toBeNull();
  });
});
