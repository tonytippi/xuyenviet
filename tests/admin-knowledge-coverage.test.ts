import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, test, vi } from "vitest";
import { parseAdminKnowledgeCoverage, parseAdminKnowledgeSamplingPolicySealResult } from "@xuyenviet/contracts";
import type { AdminKnowledgeCoveragePort } from "@xuyenviet/domain";
import { AdminKnowledgeCoverageController } from "../apps/api/src/admin/admin-knowledge-coverage.controller";

const progress = { targetActiveCards: 100, activeEvidenceGroundedCards: 1, remainingActiveCards: 99, isComplete: false, activeCommunityObservations: 0, activeCommunityPatterns: 0, caveatOnlyHighRiskCards: 0, pendingReviewCards: 0, pendingVerificationCards: 0, actionableWork: [], byType: [], byRouteOrLocation: [] };

describe("admin knowledge coverage direct API", () => {
  test("accepts only the aggregate and closed-policy seal projection", () => {
    expect(parseAdminKnowledgeCoverage({ progress, closedSamplingPolicies: [{ id: "policy", cohortKey: "initial:2026-08-01", enrollmentSealedAt: null }] })).toEqual({ progress, closedSamplingPolicies: [{ id: "policy", cohortKey: "initial:2026-08-01", enrollmentSealedAt: null }] });
    expect(parseAdminKnowledgeCoverage({ progress: { ...progress, rawSourceText: "secret" }, closedSamplingPolicies: [] })).toBeNull();
    expect(parseAdminKnowledgeCoverage({ progress, closedSamplingPolicies: [{ id: "policy", cohortKey: "cohort", enrollmentSealedAt: null, memberId: "secret" }] })).toBeNull();
    expect(parseAdminKnowledgeSamplingPolicySealResult({ status: "sealed", candidateCount: 2, selectedCount: 1 })).toEqual({ status: "sealed", candidateCount: 2, selectedCount: 1 });
    expect(parseAdminKnowledgeSamplingPolicySealResult({ status: "incomplete" })).toEqual({ status: "incomplete" });
    expect(parseAdminKnowledgeSamplingPolicySealResult({ status: "sealed", candidateCount: 1, selectedCount: 2 })).toBeNull();
  });

  test("validates safe coverage and seal responses before serialization", async () => {
    const port = { getCoverage: vi.fn(async () => ({ progress, closedSamplingPolicies: [] })), sealClosedSamplingPolicy: vi.fn(async () => ({ status: "sealed" as const, candidateCount: 2, selectedCount: 1 })) } satisfies AdminKnowledgeCoveragePort;
    const controller = new AdminKnowledgeCoverageController(port);
    await expect(controller.get()).resolves.toEqual({ progress, closedSamplingPolicies: [] });
    await expect(controller.seal("policy")).resolves.toEqual({ status: "sealed", candidateCount: 2, selectedCount: 1 });
    await expect(controller.seal("bad/id")).rejects.toBeInstanceOf(Error);
    await expect(new AdminKnowledgeCoverageController({ ...port, getCoverage: vi.fn(async () => ({ progress, closedSamplingPolicies: [], rawLedger: "secret" })) }).get()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
