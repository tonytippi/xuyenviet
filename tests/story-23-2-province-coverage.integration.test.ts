import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/db/gateway", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/gateway")>(),
  completeYoutubeDiscoveryProvinceSuggestion: vi.fn(),
}));

import { createPostgresAdminYoutubeDiscoveryPort, createSystemAuditActor, createYoutubeDiscoveryPolicyVersion } from "@xuyenviet/database";
import { parseAdminKnowledgeProvinceCoverageList, type RequestPrincipal } from "@xuyenviet/contracts";
import { completeYoutubeDiscoveryProvinceSuggestion } from "@/db/gateway";
import { knowledgeProvinceReferenceFixture } from "@/db/knowledge-geography";
import { aiGatewayModels, aiUsageEvents, auditEvents, knowledgeCards, sourceCaptureVersions, youtubeDiscoveryCandidateJobs, youtubeDiscoveryCandidates, youtubeDiscoveryKnowledgeHandoffs, youtubeDiscoveryQueryProposals, youtubeDiscoveryRuns } from "@/db/schema";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

const principal: RequestPrincipal = { userId: "operator", email: "operator@example.com", roles: ["operator"], sessionId: "story-23-2", authorizationVersion: 1 };
const daNang = "vn-21-da-nang";

describe.sequential("Story 23.2 province coverage and suggestions", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedTestOperator();
    vi.mocked(completeYoutubeDiscoveryProvinceSuggestion).mockReset();
  });

  test("projects every current unit from active canonical cards only, including zero units and official aliases", async () => {
    await insertCard({ id: "active-place", type: "place", lifecycleState: "active", normalizedCurrentProvinceId: daNang, normalizedCurrentProvinceName: "Đà Nẵng", freshnessSensitive: true, updatedAt: new Date("2026-08-12T00:00:00.000Z") });
    const latestUpdatedAt = new Date("2026-08-13T12:00:00.000Z");
    await insertCard({ id: "active-warning", type: "warning", lifecycleState: "active", normalizedCurrentProvinceId: daNang, normalizedCurrentProvinceName: "Đà Nẵng", freshnessSensitive: false, updatedAt: latestUpdatedAt });
    await insertCard({ id: "active-legacy", type: "place", lifecycleState: "active", normalizedCurrentProvinceId: "legacy-quang-nam", normalizedCurrentProvinceName: "Quảng Nam", freshnessSensitive: false, updatedAt: new Date("2026-08-11T00:00:00.000Z") });
    await insertCard({ id: "pending", type: "place", lifecycleState: "pending_operator", normalizedCurrentProvinceId: daNang, normalizedCurrentProvinceName: "Đà Nẵng", freshnessSensitive: true });
    await insertCard({ id: "unresolved", type: "food", lifecycleState: "active", normalizedCurrentProvinceId: null, normalizedCurrentProvinceName: null, freshnessSensitive: true });

    const coverage = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).listProvinceCoverage();
    expect(coverage.items).toHaveLength(knowledgeProvinceReferenceFixture.filter((reference) => reference.id === reference.currentUnitId).length);
    expect(parseAdminKnowledgeProvinceCoverageList(coverage)).toEqual(coverage);
    expect(coverage.items.find((item) => item.canonicalProvinceId === daNang)).toMatchObject({ canonicalProvinceId: daNang, currentName: "Đà Nẵng", legacyNames: ["Quảng Nam"], topics: [{ topic: "place", count: 2 }, { topic: "warning", count: 1 }], freshnessSensitiveCount: 1 });
    expect(coverage.items.find((item) => item.canonicalProvinceId === daNang)!.latestUpdatedAt).toContain("2026-08-13");
    expect(coverage.items.find((item) => item.canonicalProvinceId === "vn-01-ha-noi")).toEqual({ canonicalProvinceId: "vn-01-ha-noi", currentName: "Hà Nội", legacyNames: [], topics: [], freshnessSensitiveCount: 0, latestUpdatedAt: null });
  });

  test("sends only selected aggregate metadata and records safe usage and audit for a valid suggestion", async () => {
    await insertCard({ id: "aggregate-only", type: "route_note", lifecycleState: "active", normalizedCurrentProvinceId: daNang, normalizedCurrentProvinceName: "Đà Nẵng", freshnessSensitive: true, title: "RAW CARD TITLE", summary: "RAW KNOWLEDGE AND SOURCE TEXT" });
    await insertSuggestionModel();
    vi.mocked(completeYoutubeDiscoveryProvinceSuggestion).mockResolvedValue({ ok: true, provider: "ai_gateway", model: "test-model", latencyMs: 8, usage: { promptTokens: 11, completionTokens: 22, totalTokens: 33, cachedPromptTokens: null, cacheWritePromptTokens: null }, content: JSON.stringify({ canonicalProvinceId: daNang, need: "Bổ sung thông tin cung đường.", reason: "Chủ đề đường đi còn ít.", queryText: "kinh nghiệm lái xe Đà Nẵng" }), requestMetadata: { providerRequestId: "request-23-2" }, reportedSourceHandles: null } as never);

    const port = createPostgresAdminYoutubeDiscoveryPort(undefined, testDb);
    await expect(port.suggestProvinceQuery(principal, daNang)).resolves.toEqual({ canonicalProvinceId: daNang, need: "Bổ sung thông tin cung đường.", reason: "Chủ đề đường đi còn ít.", queryText: "kinh nghiệm lái xe Đà Nẵng" });

    const call = vi.mocked(completeYoutubeDiscoveryProvinceSuggestion).mock.calls[0]?.[0];
    expect(call?.model).toBe("test-model");
    expect(call?.messages).toHaveLength(2);
    expect(typeof call!.messages[1]!.content).toBe("string");
    expect(JSON.parse(call!.messages[1]!.content as string)).toEqual({ canonicalProvinceId: daNang, currentName: "Đà Nẵng", legacyNames: ["Quảng Nam"], topics: [{ topic: "route_note", count: 1 }], freshnessSensitiveCount: 1, latestUpdatedAt: expect.any(String) });
    expect(JSON.stringify(call?.messages)).not.toContain("RAW");
    await expect(testDb.select({ initiatedByUserId: aiUsageEvents.initiatedByUserId, executorSystem: aiUsageEvents.executorSystem, purpose: aiUsageEvents.purpose, status: aiUsageEvents.status, youtubeDiscoveryRunId: aiUsageEvents.youtubeDiscoveryRunId, errorCode: aiUsageEvents.errorCode, providerRequestId: aiUsageEvents.providerRequestId }).from(aiUsageEvents)).resolves.toEqual([{ initiatedByUserId: "operator", executorSystem: "system-youtube-discovery", purpose: "youtube_discovery_province_suggestion", status: "success", youtubeDiscoveryRunId: null, errorCode: null, providerRequestId: "request-23-2" }]);
    const [audit] = await testDb.select({ afterSummary: auditEvents.afterSummary }).from(auditEvents).where(eq(auditEvents.targetType, "youtube_discovery_province_suggestion"));
    expect(audit?.afterSummary).toBe(JSON.stringify({ canonicalProvinceId: daNang, outcome: "valid", promptVersion: "youtube_discovery_province_suggestion_v1" }));
    expect(JSON.stringify({ audit, usage: await testDb.select().from(aiUsageEvents) })).not.toContain("kinh nghiệm lái xe");
  });

  test("rejects malformed or unavailable output without creating Discovery or Knowledge work", async () => {
    await insertSuggestionModel();
    vi.mocked(completeYoutubeDiscoveryProvinceSuggestion).mockResolvedValue({ ok: true, provider: "ai_gateway", model: "test-model", latencyMs: 8, usage: { promptTokens: 11, completionTokens: 22, totalTokens: 33, cachedPromptTokens: null, cacheWritePromptTokens: null }, content: JSON.stringify({ canonicalProvinceId: daNang, need: "unsafe", reason: "unsafe", queryText: "https://unsafe.example" }), requestMetadata: { providerRequestId: "request-invalid" }, reportedSourceHandles: null } as never);
    await expect(createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).suggestProvinceQuery(principal, daNang)).resolves.toBeNull();
    await expect(sideEffects()).resolves.toEqual({ queries: 0, runs: 0, candidates: 0, candidateJobs: 0, handoffs: 0, captures: 0, cards: 0 });
    await expect(testDb.select({ status: aiUsageEvents.status, errorCode: aiUsageEvents.errorCode }).from(aiUsageEvents)).resolves.toEqual([{ status: "failure", errorCode: "invalid_output" }]);
    vi.mocked(completeYoutubeDiscoveryProvinceSuggestion).mockResolvedValueOnce({ ok: false, provider: "ai_gateway", model: "test-model", latencyMs: 8, errorCode: "gateway_network_error", failureKind: "other", requestMetadata: { providerRequestId: null } } as never);
    await expect(createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).suggestProvinceQuery(principal, daNang)).resolves.toBeNull();
    await expect(sideEffects()).resolves.toEqual({ queries: 0, runs: 0, candidates: 0, candidateJobs: 0, handoffs: 0, captures: 0, cards: 0 });
  });

  test("creates the existing scheduled operator proposal without admitting a run", async () => {
    await createYoutubeDiscoveryPolicyVersion({ version: 1, isCurrent: true, actor: createSystemAuditActor("system-youtube-discovery") }, testDb);
    const query = await createPostgresAdminYoutubeDiscoveryPort(undefined, testDb).create(principal, { queryText: "kinh nghiệm lái xe Đà Nẵng", priority: 50, cadenceMinutes: 60 });
    expect(query).toMatchObject({ origin: "operator", reason: "operator_request", enabled: true, cadenceMinutes: 60, nextRunAt: expect.any(String) });
    await expect(testDb.select({ id: youtubeDiscoveryRuns.id }).from(youtubeDiscoveryRuns)).resolves.toEqual([]);
    await expect(testDb.select({ origin: youtubeDiscoveryQueryProposals.origin, reason: youtubeDiscoveryQueryProposals.reason }).from(youtubeDiscoveryQueryProposals)).resolves.toEqual([{ origin: "operator", reason: "operator_request" }]);
  });
});

async function insertSuggestionModel() {
  await testDb.insert(aiGatewayModels).values({ id: "suggestion-model", gatewayModelName: "test-model", displayLabel: "Story 23.2", purpose: "youtube_discovery_province_suggestion", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true });
}

async function insertCard(input: { id: string; type: "place" | "food" | "warning" | "route_note"; lifecycleState: "active" | "pending_operator"; normalizedCurrentProvinceId: string | null; normalizedCurrentProvinceName: string | null; freshnessSensitive: boolean; updatedAt?: Date; title?: string; summary?: string }) {
  await testDb.insert(knowledgeCards).values({ id: input.id, lifecycleState: input.lifecycleState, knowledgeState: "community_observation", verificationRequirement: "none", type: input.type, title: input.title ?? input.id, summary: input.summary ?? "Metadata aggregate test.", normalizedCurrentProvinceId: input.normalizedCurrentProvinceId, normalizedCurrentProvinceName: input.normalizedCurrentProvinceName, freshnessSensitive: input.freshnessSensitive, aiPromptVersion: "test", createdByUserId: "operator", updatedAt: input.updatedAt });
}

async function sideEffects() {
  const [queries, runs, candidates, candidateJobs, handoffs, captures, cards] = await Promise.all([
    testDb.select({ id: youtubeDiscoveryQueryProposals.id }).from(youtubeDiscoveryQueryProposals),
    testDb.select({ id: youtubeDiscoveryRuns.id }).from(youtubeDiscoveryRuns),
    testDb.select({ id: youtubeDiscoveryCandidates.id }).from(youtubeDiscoveryCandidates),
    testDb.select({ id: youtubeDiscoveryCandidateJobs.id }).from(youtubeDiscoveryCandidateJobs),
    testDb.select({ candidateId: youtubeDiscoveryKnowledgeHandoffs.candidateId }).from(youtubeDiscoveryKnowledgeHandoffs),
    testDb.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions),
    testDb.select({ id: knowledgeCards.id }).from(knowledgeCards),
  ]);
  return { queries: queries.length, runs: runs.length, candidates: candidates.length, candidateJobs: candidateJobs.length, handoffs: handoffs.length, captures: captures.length, cards: cards.length };
}
