import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, test, vi } from "vitest";
import { parseAdminKnowledgeCoverage, parseAdminKnowledgeRecommendationResolve } from "@xuyenviet/contracts";
import type { AdminKnowledgeCoveragePort } from "@xuyenviet/domain";
import { AdminKnowledgeCoverageController } from "../apps/api/src/admin/admin-knowledge-coverage.controller";

const progress = { targetActiveCards: 100, activeEvidenceGroundedCards: 1, remainingActiveCards: 99, isComplete: false, activeCommunityObservations: 0, activeCommunityPatterns: 0, caveatOnlyHighRiskCards: 0, pendingReviewCards: 0, pendingVerificationCards: 0, actionableWork: [], byType: [], byRouteOrLocation: [] };
const coverage = { progress, sampling: { closedPolicies: [{ cohortKey: "initial:2026-08-01", enrollmentSealedAt: "2026-08-02T00:00:00.000Z", candidateCount: 2, selectedCount: 1 }], obligations: { pending: 1, passed: 2, failed: 0 }, actionableWork: 1 } };

describe("admin knowledge coverage direct API", () => {
  test("accepts aggregate-only sampling and rejects hidden ledger detail", () => {
    expect(parseAdminKnowledgeCoverage(coverage)).toEqual(coverage);
    expect(parseAdminKnowledgeCoverage({ ...coverage, rawSourceText: "secret" })).toBeNull();
    expect(parseAdminKnowledgeCoverage({ ...coverage, sampling: { ...coverage.sampling, closedPolicies: [{ ...coverage.sampling.closedPolicies[0], candidateId: "secret" }] } })).toBeNull();
    expect(parseAdminKnowledgeCoverage({ ...coverage, sampling: { ...coverage.sampling, obligations: { ...coverage.sampling.obligations, fence: 1 } } })).toBeNull();
    expect(parseAdminKnowledgeRecommendationResolve({ expectedContentVersion: 1, expectedEvidenceSetRevision: 1, action: "sampling_fail", highSeverity: true })).toMatchObject({ highSeverity: true });
  });

  test("validates coverage before serialization", async () => {
    const port = { getCoverage: vi.fn(async () => coverage) } satisfies AdminKnowledgeCoveragePort;
    const controller = new AdminKnowledgeCoverageController(port);
    await expect(controller.get()).resolves.toEqual(coverage);
    await expect(new AdminKnowledgeCoverageController({ getCoverage: vi.fn(async () => ({ ...coverage, rawLedger: "secret" })) } as AdminKnowledgeCoveragePort).get()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
