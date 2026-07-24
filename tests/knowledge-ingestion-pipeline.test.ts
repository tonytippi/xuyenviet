import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { aiGatewayModels, aiUsageEvents, auditEvents, knowledgeCardEvidence, knowledgeCardSearchDocuments, knowledgeCards, knowledgeCardSources, knowledgeIndexDirtyMarkers, knowledgeIngestionJobs, knowledgeRecommendations, knowledgeSamplingCohortMembers, sourceCaptureVersions, sources, users } from "@/db/schema";
import { claimNextKnowledgeIngestionJob, commitKnowledgeIngestionStage, recoverKnowledgeIngestionJobs } from "@/features/knowledge/ingestion-jobs";
import { runKnowledgeIngestionPipeline } from "@/features/knowledge/ingestion-pipeline";
import { appendSourceCaptureVersion } from "@/features/knowledge/source-captures";

import { resetTestDatabase, testDb } from "./helpers/db";

describe("knowledge ingestion pipeline", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await testDb.insert(users).values([
      { id: "operator", email: "operator@example.com" },
      { id: "system-knowledge-pipeline", email: "system-knowledge-pipeline@xuyenviet.invalid" },
    ]);
    await testDb.insert(sources).values({ id: "source", kind: "pasted_text", label: "Safe source", sourceType: "curated", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    await testDb.insert(aiGatewayModels).values([
      { id: "extract", gatewayModelName: "extract-model", displayLabel: "Extract", purpose: "extraction", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingUnitTokens: 1_000_000, pricingEffectiveAt: new Date() },
      { id: "judge", gatewayModelName: "judge-model", displayLabel: "Judge", purpose: "evaluation", active: true, defaultForPurpose: true, supportsTextInput: true, supportsEvaluation: true, pricingUnitTokens: 1_000_000, pricingEffectiveAt: new Date() },
    ]);
    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { candidates?: Array<{ id: string }> };
      const target = body.candidates?.[0]?.id;
      return new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: target ? "attach" : "create", target_card_id: target ?? null, summary: "Quan hệ rõ ràng." }) } }] }), { status: 200 });
    });
  });

  function extractionResponse(candidate: Record<string, unknown> | null) {
    return new Response(JSON.stringify({ model: "extract-model", choices: [{ message: { content: JSON.stringify({ candidate }) } }] }), { status: 200 });
  }

  function judgmentResponse(decision: "publish" | "review_recommended" | "verify_first" | "suppress" = "publish", overrides: Record<string, number> = {}) {
    return new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ decision, summary: "Bằng chứng rõ và hữu ích.", relevance: .9, extractability: .9, evidence_grounding: .95, specificity: .8, actionability: .8, first_hand_likelihood: .7, spam_commercial_risk: .1, ...overrides }) } }] }), { status: 200 });
  }

  async function claimFor(rawText: string, sourceId = "source") {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId, captureKind: "pasted_text", rawText, metadata: { kind: "submitted" }, capturedAt: new Date("2026-07-22T00:00:00.000Z") });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "pipeline-worker", expectedStageVersion: 1, now: new Date(Date.now() + 1_000) }, testDb);
    if (!claim) throw new Error("expected claim");
    return { capture, claim };
  }

  function candidate(rawText: string, overrides: Record<string, unknown> = {}) {
    const quote = rawText;
    return { type: "place", title: "Điểm ngắm cảnh đèo Hải Vân", summary: "Có điểm dừng ngắm cảnh phù hợp ban ngày.", location_name: "Đèo Hải Vân", conditions: ["ban ngày"], freshness_sensitive: false, evidence: { quote_text: quote, span_start: 0, span_end: Array.from(rawText).length }, ...overrides };
  }

  test("publishes only after independent extraction and judgment with exact evidence", async () => {
    const rawText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText, metadata: { kind: "submitted" }, capturedAt: new Date("2026-07-22T00:00:00.000Z") });
    const start = rawText.indexOf("Đèo Hải Vân");
    const quote = rawText.slice(start);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ model: "extract-model", choices: [{ message: { content: JSON.stringify({ candidate: { type: "place", title: "Điểm ngắm cảnh đèo Hải Vân", summary: "Có điểm dừng ngắm cảnh phù hợp ban ngày.", location_name: "Đèo Hải Vân", conditions: ["ban ngày"], freshness_sensitive: false, evidence: { quote_text: quote, span_start: start, span_end: rawText.length } } }) } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ decision: "publish", summary: "Bằng chứng rõ và hữu ích.", relevance: .9, extractability: .9, evidence_grounding: .95, specificity: .8, actionability: .8, first_hand_likelihood: .7, spam_commercial_risk: .1 }) } }] }), { status: 200 }));
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "pipeline-worker", expectedStageVersion: 1 }, testDb);
    if (!claim) throw new Error("expected claim");

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "published", sourceId: "source" });
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId))).resolves.toMatchObject([{ stage: "published", claimedBy: null, fencingToken: null }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ createdByUserId: "system-knowledge-pipeline", publicationState: "active", reviewState: "reviewed", aiGatewayModelId: "extract", evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeCardEvidence)).resolves.toMatchObject([{ captureVersionId: capture.id, quoteText: quote, spanStart: start, spanEnd: rawText.length }]);
    await expect(testDb.select().from(aiUsageEvents)).resolves.toMatchObject([{ userId: "system-knowledge-pipeline", purpose: "extraction", promptVersion: "knowledge_pipeline_extraction_v1", status: "success" }, { userId: "system-knowledge-pipeline", purpose: "evaluation", promptVersion: "knowledge_pipeline_judgment_v1", status: "success" }, { userId: "system-knowledge-pipeline", purpose: "evaluation", promptVersion: "knowledge_pipeline_judgment_v1", status: "success" }]);
  });

  test("rejects a stale fence without changing the job", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Nội dung có thể đọc được.", metadata: { kind: "submitted" }, capturedAt: new Date() });
    const claim = await claimNextKnowledgeIngestionJob({ workerId: "pipeline-worker", expectedStageVersion: 1 }, testDb);
    if (!claim) throw new Error("expected claim");
    const result = await commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: "queued", expectedStageVersion: 1, fencingToken: "a".repeat(64), nextStage: "triaging" }, testDb);
    expect(result).toBeNull();
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.captureVersionId, capture.id))).resolves.toMatchObject([{ stage: "queued", stageVersion: 1, claimedBy: "pipeline-worker" }]);
  });

  test("uses PostgreSQL character offsets rather than UTF-16 offsets", async () => {
    const rawText = "🚗 Đèo Hải Vân có điểm dừng ngắm cảnh an toàn.";
    const { capture, claim } = await claimFor(rawText);
    const quote = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn.";
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(rawText, { evidence: { quote_text: quote, span_start: 2, span_end: Array.from(rawText).length } }))).mockResolvedValueOnce(judgmentResponse());

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "published" });
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.captureVersionId, capture.id))).resolves.toMatchObject([{ quoteText: quote, spanStart: 2, spanEnd: Array.from(rawText).length }]);
  });

  test.each([
    ["question-only material", "Ai biết Đèo Hải Vân có điểm dừng nào không?"],
    ["commercial material", "Đèo Hải Vân giảm giá, inbox Zalo để đặt ngay."],
  ])("suppresses deterministic %s without calling the judge", async (_label, rawText) => {
    const { claim } = await claimFor(rawText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(rawText)));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "suppressed" });
    expect(fetch).toHaveBeenCalledTimes(0);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test.each([
    ["opinion-only material", "Tôi nghĩ Đèo Hải Vân rất đẹp và đáng đi."],
    ["insufficient travel context", "Hôm nay thật tuyệt vời và nhiều cảm xúc."],
  ])("suppresses deterministic %s before extraction", async (_label, rawText) => {
    const { claim } = await claimFor(rawText);
    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "suppressed" });
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    ["title", { title: "Điểm dừng 0901234567" }],
    ["summary", { summary: "Liên hệ person@example.com để biết thêm." }],
    ["location name", { location_name: "Đèo Hải Vân 0901234567" }],
    ["route segment", { location_name: null, route_segment: "Huế - Đà Nẵng 0901234567" }],
    ["conditions", { conditions: ["Gọi 0901234567 trước khi đi"] }],
    ["evidence", { evidence: { quote_text: "Đèo Hải Vân 0901234567", span_start: 0, span_end: Array.from("Đèo Hải Vân 0901234567").length } }],
  ])("rejects PII in persisted candidate %s", async (_field, override) => {
    const rawText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim } = await claimFor(rawText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(rawText, override)));
    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "suppressed" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("suppresses a candidate when an independent judge misses a threshold", async () => {
    const rawText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim } = await claimFor(rawText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(rawText))).mockResolvedValueOnce(judgmentResponse("publish", { evidence_grounding: .89 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "suppressed" });
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("retains a judge-requested review as a version-bound weak-evidence recommendation", async () => {
    const rawText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim } = await claimFor(rawText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(rawText))).mockResolvedValueOnce(judgmentResponse("review_recommended"));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "review_recommended", cardId: expect.any(String) });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "suppressed", reviewState: "ai_recommended", needsReview: true }]);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toMatchObject([{ reason: "weak_evidence", status: "open", contentVersion: 2, evidenceSetRevision: 2 }]);
  });

  test("retains high-risk facts as suppressed canonical cards with a version-bound verification recommendation", async () => {
    const rawText = "Trạm sạc tại Đà Nẵng đang hoạt động.";
    const { claim } = await claimFor(rawText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(rawText, { type: "ev_charging", title: "Trạm sạc Đà Nẵng", summary: "Trạm sạc đang hoạt động.", location_name: "Đà Nẵng" }))).mockResolvedValueOnce(judgmentResponse("publish"));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "verify_first" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "suppressed", verificationState: "required", reviewState: "ai_recommended", evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeRecommendations)).resolves.toMatchObject([
      { reason: "verification", status: "open", contentVersion: 2, evidenceSetRevision: 2 },
      { reason: "sampling", requiredForSampling: true, status: "open", contentVersion: 2, evidenceSetRevision: 2 },
    ]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers)).resolves.toMatchObject([{ contentVersion: 2, evidenceSetRevision: 2, status: "pending" }]);
  });

  test("treats route conditions as verification-required even without a narrow hazard keyword", async () => {
    const rawText = "Đường QL1A đoạn qua Huế đang ngập sau mưa lớn.";
    const { claim } = await claimFor(rawText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(rawText, { type: "route_note", title: "QL1A qua Huế", summary: "Đoạn đường đang ngập sau mưa lớn.", location_name: "Huế", conditions: [] }))).mockResolvedValueOnce(judgmentResponse("publish"));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "verify_first" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject([{ publicationState: "suppressed", verificationState: "required", reviewState: "ai_recommended" }]);
  });

  test("attaches a later equivalent high-risk capture to a suppressed verify-first card without publishing it", async () => {
    const firstText = "Trạm sạc tại Đà Nẵng đang hoạt động.";
    const { claim: firstClaim } = await claimFor(firstText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText, { type: "ev_charging", title: "Trạm sạc Đà Nẵng", summary: "Trạm sạc đang hoạt động.", location_name: "Đà Nẵng" }))).mockResolvedValueOnce(judgmentResponse());
    const first = await runKnowledgeIngestionPipeline(firstClaim, testDb);
    if (!first?.cardId) throw new Error("expected verify-first card");
    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second safe source", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const { claim } = await claimFor(firstText, "source-2");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText, { type: "ev_charging", title: "Trạm sạc Đà Nẵng", summary: "Trạm sạc đang hoạt động.", location_name: "Đà Nẵng" }))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "attach", target_card_id: first.cardId, summary: "Tương đương." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "verify_first", cardId: first.cardId });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, first.cardId))).resolves.toMatchObject([{ publicationState: "suppressed", knowledgeState: "community_pattern", verificationState: "required", reviewState: "ai_recommended", needsReview: true, contentVersion: 4, evidenceSetRevision: 3 }]);
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.knowledgeCardId, first.cardId))).resolves.toHaveLength(2);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, first.cardId))).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ contentVersion: 3, evidenceSetRevision: 3 }), expect.objectContaining({ contentVersion: 4, evidenceSetRevision: 3 })]));
  });

  test("excludes suppressed conflicted cards from verification-canonical relation candidates", async () => {
    await testDb.insert(knowledgeCards).values({ id: "conflicted", status: "approved", publicationState: "suppressed", knowledgeState: "conflicted", reviewState: "ai_recommended", verificationState: "required", type: "ev_charging", title: "Trạm sạc Đà Nẵng", summary: "Thông tin đang mâu thuẫn.", locationName: "Đà Nẵng", conditions: [], confidence: "community", freshnessSensitive: true, needsReview: true, aiPromptVersion: "test", createdByUserId: "operator" });
    const rawText = "Trạm sạc tại Đà Nẵng đang hoạt động.";
    const { claim } = await claimFor(rawText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(rawText, { type: "ev_charging", title: "Trạm sạc Đà Nẵng", summary: "Trạm sạc đang hoạt động.", location_name: "Đà Nẵng" }))).mockResolvedValueOnce(judgmentResponse());

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "verify_first", cardId: expect.not.stringMatching(/^conflicted$/) });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "conflicted"))).resolves.toMatchObject([{ publicationState: "suppressed", knowledgeState: "conflicted", evidenceSetRevision: 1 }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(2);
  });

  test("uses the relation checkpoint to suppress an active conflicting card for a high-risk candidate", async () => {
    await testDb.insert(knowledgeCards).values({ id: "existing-high-risk", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "ev_charging", title: "Trạm sạc Đà Nẵng", summary: "Trạm sạc đang hoạt động.", locationName: "Đà Nẵng", conditions: [], confidence: "community", freshnessSensitive: false, needsReview: false, aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: "existing-high-risk", searchableText: "Trạm sạc đang hoạt động.", textHash: "a".repeat(64), sourceCount: 1, confidence: "community", freshnessSensitive: false });
    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second safe source", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const highRiskText = "Đà Nẵng không có trạm sạc đang hoạt động.";
    const { claim } = await claimFor(highRiskText, "source-2");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(highRiskText, { type: "ev_charging", title: "Trạm sạc Đà Nẵng", summary: "Không có trạm sạc đang hoạt động.", location_name: "Đà Nẵng", conditions: [] }))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "conflict", target_card_id: "existing-high-risk", summary: "Mâu thuẫn." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "review_recommended" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "existing-high-risk"))).resolves.toMatchObject([{ publicationState: "suppressed", knowledgeState: "conflicted", reviewState: "ai_recommended", verificationState: "required", needsReview: true }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.knowledgeCardId, "existing-high-risk"))).resolves.toMatchObject([{ reason: "conflict", status: "open" }]);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "existing-high-risk"))).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ reason: "ingestion_conflict" })]));
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, "existing-high-risk"))).resolves.toMatchObject([{ status: "disabled", disabledAt: expect.any(Date) }]);
  });

  test("fences a stale verify-first capture into the same safe terminal result", async () => {
    const rawText = "Trạm sạc tại Đà Nẵng đang hoạt động.";
    const { claim } = await claimFor(rawText);
    let releaseJudge!: () => void;
    const judging = new Promise<void>((resolve) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(extractionResponse(candidate(rawText, { type: "ev_charging", title: "Trạm sạc Đà Nẵng", summary: "Trạm sạc đang hoạt động.", location_name: "Đà Nẵng" })))
        .mockImplementationOnce(async () => {
          resolve();
          await new Promise<void>((release) => { releaseJudge = release; });
          return judgmentResponse("publish");
        });
    });
    const pipeline = runKnowledgeIngestionPipeline(claim, testDb);
    await judging;
    await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Phiên bản mới hơn của trạm sạc.", metadata: { kind: "submitted" }, capturedAt: new Date("2026-07-23T00:00:00.000Z") });
    releaseJudge();

    await expect(pipeline).resolves.toMatchObject({ outcome: "suppressed" });
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId))).resolves.toMatchObject([{ stage: "suppressed", lastErrorCode: "stale_or_deleted_capture", claimedBy: null, fencingToken: null }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toEqual([]);
  });

  test("attaches equivalent independent evidence and promotes a community pattern", async () => {
    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second safe source", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const firstText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const first = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: firstText, metadata: { kind: "submitted" }, capturedAt: new Date("2026-07-21T00:00:00.000Z") });
    await testDb.insert(knowledgeCards).values({ id: "existing", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm ngắm cảnh đèo Hải Vân", summary: "Có điểm dừng ngắm cảnh phù hợp ban ngày.", locationName: "Đèo Hải Vân", conditions: ["ban ngày"], confidence: "community", freshnessSensitive: false, needsReview: false, aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(knowledgeCardSources).values({ knowledgeCardId: "existing", sourceId: "source", supportLevel: "supporting" });
    await testDb.insert(knowledgeCardEvidence).values({ knowledgeCardId: "existing", sourceId: "source", captureVersionId: first.id, quoteText: firstText, spanStart: 0, spanEnd: Array.from(firstText).length, observedAt: new Date(), capturedAt: new Date(), conditions: ["ban ngày"], supportLevel: "supporting", displayPolicy: "fact_only", state: "active", independenceKey: `source:${first.id}` });
    await testDb.update(knowledgeIngestionJobs).set({ stage: "suppressed", stageVersion: 2 }).where(eq(knowledgeIngestionJobs.captureVersionId, first.id));
    const { claim } = await claimFor(firstText, "source-2");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "attach", target_card_id: "existing", summary: "Tương đương." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "published", cardId: "existing" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "existing"))).resolves.toMatchObject([{ knowledgeState: "community_pattern", evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.knowledgeCardId, "existing"))).resolves.toHaveLength(2);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, "existing"))).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ contentVersion: 2, evidenceSetRevision: 2 }), expect.objectContaining({ contentVersion: 3, evidenceSetRevision: 2 })]));
    await expect(testDb.select().from(knowledgeSamplingCohortMembers).where(eq(knowledgeSamplingCohortMembers.knowledgeCardId, "existing"))).resolves.toMatchObject([{ contentVersion: 3, evidenceSetRevision: 2 }]);
  });

  test("retains a freshness-sensitive attach condition mismatch as verification-required without mutating the target", async () => {
    const firstText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim: firstClaim } = await claimFor(firstText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText))).mockResolvedValueOnce(judgmentResponse());
    const first = await runKnowledgeIngestionPipeline(firstClaim, testDb);
    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const { capture, claim } = await claimFor("Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào sáng sớm.", "source-2");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate("Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào sáng sớm.", { conditions: ["sáng sớm"], freshness_sensitive: true }))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "attach", target_card_id: first?.cardId, summary: "Tương đương." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "review_recommended", cardId: expect.any(String) });
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.knowledgeCardId, first?.cardId ?? ""))).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject(expect.arrayContaining([expect.objectContaining({ publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "ai_recommended", verificationState: "required", needsReview: true, conditions: ["sáng sớm"] })]));
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.captureVersionId, capture.id))).resolves.toMatchObject([{ quoteText: "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào sáng sớm.", supportLevel: "supporting" }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.reason, "missing_context"))).resolves.toMatchObject([{ status: "open", contentVersion: 2, evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId))).resolves.toMatchObject([{ stage: "review_recommended", checkpoint: null }]);
  });

  test("does not publish an old capture when a recapture wins before publication", async () => {
    const rawText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim } = await claimFor(rawText);
    let releaseRelation!: () => void;
    const relationStarted = new Promise<void>((resolve) => {
      vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(rawText))).mockResolvedValueOnce(judgmentResponse()).mockImplementationOnce(async () => {
        resolve();
        await new Promise<void>((release) => { releaseRelation = release; });
        return new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "create", target_card_id: null, summary: "Khác biệt." }) } }] }), { status: 200 });
      });
    });
    const pipeline = runKnowledgeIngestionPipeline(claim, testDb);
    await relationStarted;
    await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "pasted_text", rawText: "Phiên bản thu thập mới hơn có ngữ cảnh hành trình.", metadata: { kind: "submitted" }, capturedAt: new Date("2026-07-23T00:00:00.000Z") });
    releaseRelation();

    await expect(pipeline).resolves.toMatchObject({ outcome: "suppressed" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test.each(["attach", "conflict"] as const)("does not %s evidence from an old capture when a recapture wins before mutation", async (action) => {
    const text = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim: firstClaim } = await claimFor(text);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(text))).mockResolvedValueOnce(judgmentResponse());
    const first = await runKnowledgeIngestionPipeline(firstClaim, testDb);
    if (!first?.cardId) throw new Error("expected initial card");

    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second safe source", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const { claim } = await claimFor(text, "source-2");
    let releaseRelation!: () => void;
    const relationStarted = new Promise<void>((resolve) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(extractionResponse(candidate(text)))
        .mockResolvedValueOnce(judgmentResponse())
        .mockImplementationOnce(async () => {
          resolve();
          await new Promise<void>((release) => { releaseRelation = release; });
          return new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action, target_card_id: first.cardId, summary: "Quan hệ rõ ràng." }) } }] }), { status: 200 });
        });
    });

    const pipeline = runKnowledgeIngestionPipeline(claim, testDb);
    await relationStarted;
    await appendSourceCaptureVersion(testDb, { sourceId: "source-2", captureKind: "pasted_text", rawText: "Phiên bản thu thập mới hơn có ngữ cảnh hành trình.", metadata: { kind: "submitted" }, capturedAt: new Date("2026-07-23T00:00:00.000Z") });
    releaseRelation();

    await expect(pipeline).resolves.toMatchObject({ outcome: "suppressed" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, first.cardId))).resolves.toMatchObject([{ publicationState: "active", knowledgeState: "community_observation", evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.knowledgeCardId, first.cardId))).resolves.toHaveLength(1);
  });

  test("selects same-scope relation candidates even when unrelated cards fill the old first-50 window", async () => {
    const rawText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    await testDb.insert(knowledgeCards).values(Array.from({ length: 55 }, (_, index) => ({ id: `unrelated-${index}`, status: "approved" as const, publicationState: "active" as const, knowledgeState: "community_observation" as const, reviewState: "reviewed" as const, verificationState: "not_required" as const, type: "place" as const, title: `Điểm ${index}`, summary: "Điểm dừng có thông tin cụ thể.", locationName: `Địa điểm ${index}`, conditions: ["ban ngày"], confidence: "community" as const, freshnessSensitive: false, needsReview: false, aiPromptVersion: "test", createdByUserId: "operator" })));
    await testDb.insert(knowledgeCards).values({ id: "scoped", status: "approved", publicationState: "active", knowledgeState: "community_observation", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm ngắm cảnh đèo Hải Vân", summary: "Có điểm dừng ngắm cảnh phù hợp ban ngày.", locationName: "Đèo Hải Vân", conditions: ["ban ngày"], confidence: "community", freshnessSensitive: false, needsReview: false, aiPromptVersion: "test", createdByUserId: "operator" });
    const { claim } = await claimFor(rawText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(rawText))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "attach", target_card_id: "scoped", summary: "Tương đương." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "published", cardId: "scoped" });
  });

  test("creates a distinct card for compatible materially different conditions", async () => {
    const firstText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim: firstClaim } = await claimFor(firstText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText))).mockResolvedValueOnce(judgmentResponse());
    await runKnowledgeIngestionPipeline(firstClaim, testDb);
    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second safe source", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const secondText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào sáng sớm.";
    const { claim } = await claimFor(secondText, "source-2");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(secondText, { conditions: ["sáng sớm"], summary: "Có điểm dừng ngắm cảnh phù hợp sáng sớm." }))).mockResolvedValueOnce(judgmentResponse());

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "published" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(2);
  });

  test("suppresses the affected card and recommends review for a same-condition conflict", async () => {
    const firstText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim: firstClaim } = await claimFor(firstText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText))).mockResolvedValueOnce(judgmentResponse());
    const firstResult = await runKnowledgeIngestionPipeline(firstClaim, testDb);
    if (!firstResult?.cardId) throw new Error("expected initial card");
    await testDb.insert(knowledgeCardSearchDocuments).values({ knowledgeCardId: firstResult.cardId, searchableText: "Có điểm dừng ngắm cảnh phù hợp ban ngày.", textHash: "b".repeat(64), sourceCount: 1, confidence: "community", freshnessSensitive: false });
    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second safe source", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const secondText = "Đèo Hải Vân không có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim } = await claimFor(secondText, "source-2");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(secondText, { summary: "Không có điểm dừng ngắm cảnh phù hợp ban ngày." }))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "conflict", target_card_id: firstResult?.cardId, summary: "Mâu thuẫn." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "review_recommended" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, firstResult?.cardId ?? ""))).resolves.toMatchObject([{ publicationState: "suppressed", knowledgeState: "conflicted", reviewState: "ai_recommended", needsReview: true, contentVersion: 4, evidenceSetRevision: 3 }]);
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.supportLevel, "conflicting"))).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeIndexDirtyMarkers).where(eq(knowledgeIndexDirtyMarkers.knowledgeCardId, firstResult.cardId))).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ reason: "ingestion_conflict", contentVersion: 4, evidenceSetRevision: 3 })]));
    await expect(testDb.select().from(knowledgeCardSearchDocuments).where(eq(knowledgeCardSearchDocuments.knowledgeCardId, firstResult.cardId))).resolves.toMatchObject([{ status: "disabled", disabledAt: expect.any(Date) }]);
    await expect(testDb.select().from(auditEvents).where(eq(auditEvents.targetType, "knowledge_ingestion_conflict"))).resolves.toMatchObject([{ actorUserId: "system-knowledge-pipeline", actorEmail: "system-knowledge-pipeline@xuyenviet.invalid" }]);
  });

  test("suppresses a conflict only when conditions are normalized equivalents", async () => {
    const firstText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim: firstClaim } = await claimFor(firstText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText))).mockResolvedValueOnce(judgmentResponse());
    const first = await runKnowledgeIngestionPipeline(firstClaim, testDb);
    await testDb.update(knowledgeCards).set({ conditions: ["  BAN NGÀY  "] }).where(eq(knowledgeCards.id, first?.cardId ?? ""));
    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second safe source", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const secondText = "Đèo Hải Vân không có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim } = await claimFor(secondText, "source-2");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(secondText, { summary: "Không có điểm dừng ngắm cảnh phù hợp ban ngày." }))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "conflict", target_card_id: first?.cardId, summary: "Mâu thuẫn." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "review_recommended" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, first?.cardId ?? ""))).resolves.toMatchObject([{ publicationState: "suppressed", knowledgeState: "conflicted" }]);
  });

  test("retains a conflict condition mismatch for missing-context review without mutating the target", async () => {
    const firstText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim: firstClaim } = await claimFor(firstText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText))).mockResolvedValueOnce(judgmentResponse());
    const first = await runKnowledgeIngestionPipeline(firstClaim, testDb);
    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second safe source", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const secondText = "Đèo Hải Vân không có điểm dừng ngắm cảnh an toàn vào sáng sớm.";
    const { capture, claim } = await claimFor(secondText, "source-2");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(secondText, { conditions: ["sáng sớm"], summary: "Không có điểm dừng ngắm cảnh phù hợp sáng sớm." }))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "conflict", target_card_id: first?.cardId, summary: "Mâu thuẫn." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "review_recommended", cardId: expect.any(String) });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, first?.cardId ?? ""))).resolves.toMatchObject([{ publicationState: "active", knowledgeState: "community_observation", evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.knowledgeCardId, first?.cardId ?? ""))).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.captureVersionId, capture.id))).resolves.toMatchObject([{ quoteText: secondText, supportLevel: "supporting" }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.reason, "missing_context"))).resolves.toHaveLength(1);
  });

  test("keeps recaptures from creating a second independent supporting evidence record", async () => {
    const firstText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim: firstClaim } = await claimFor(firstText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText))).mockResolvedValueOnce(judgmentResponse());
    const first = await runKnowledgeIngestionPipeline(firstClaim, testDb);
    const { claim } = await claimFor(firstText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "attach", target_card_id: first?.cardId, summary: "Tương đương." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "published", cardId: first?.cardId });
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.knowledgeCardId, first?.cardId ?? ""))).resolves.toHaveLength(1);
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, first?.cardId ?? ""))).resolves.toMatchObject([{ knowledgeState: "community_observation", evidenceSetRevision: 3 }]);
  });

  test("increments the evidence revision once when an attach evicts the supporting-evidence cap", async () => {
    await testDb.insert(sources).values([
      { id: "source-2", kind: "pasted_text", label: "Second", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" },
      { id: "source-3", kind: "pasted_text", label: "Third", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" },
    ]);
    await testDb.insert(sourceCaptureVersions).values([
      { id: "capture-1", sourceId: "source", versionSequence: 1, captureKind: "pasted_text", rawText: "Evidence one", contentHash: "1".repeat(64), capturedAt: new Date("2026-07-19T00:00:00.000Z") },
      { id: "capture-2", sourceId: "source-2", versionSequence: 1, captureKind: "pasted_text", rawText: "Evidence two", contentHash: "2".repeat(64), capturedAt: new Date("2026-07-20T00:00:00.000Z") },
      { id: "capture-3", sourceId: "source-3", versionSequence: 1, captureKind: "pasted_text", rawText: "Evidence three", contentHash: "3".repeat(64), capturedAt: new Date("2026-07-21T00:00:00.000Z") },
    ]);
    await testDb.insert(knowledgeCards).values({ id: "existing", status: "approved", publicationState: "active", knowledgeState: "community_pattern", reviewState: "reviewed", verificationState: "not_required", type: "place", title: "Điểm ngắm cảnh đèo Hải Vân", summary: "Có điểm dừng ngắm cảnh phù hợp ban ngày.", locationName: "Đèo Hải Vân", conditions: ["ban ngày"], confidence: "community", freshnessSensitive: false, needsReview: false, aiPromptVersion: "test", createdByUserId: "operator" });
    await testDb.insert(knowledgeCardSources).values(["source", "source-2", "source-3"].map((sourceId) => ({ knowledgeCardId: "existing", sourceId, supportLevel: "supporting" as const })));
    await testDb.insert(knowledgeCardEvidence).values(["capture-1", "capture-2", "capture-3"].map((captureVersionId, index) => ({ knowledgeCardId: "existing", sourceId: ["source", "source-2", "source-3"][index], captureVersionId, quoteText: `Evidence ${index + 1}`, spanStart: 0, spanEnd: 10, observedAt: new Date(`2026-07-${19 + index}T00:00:00.000Z`), capturedAt: new Date(`2026-07-${19 + index}T00:00:00.000Z`), conditions: ["ban ngày"], supportLevel: "supporting" as const, displayPolicy: "fact_only" as const, state: "active" as const, independenceKey: ["source", "source-2", "source-3"][index] })));
    await testDb.insert(sources).values({ id: "source-4", kind: "pasted_text", label: "Fourth", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const text = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim } = await claimFor(text, "source-4");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(text))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "attach", target_card_id: "existing", summary: "Tương đương." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "published", cardId: "existing" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "existing"))).resolves.toMatchObject([{ evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.knowledgeCardId, "existing"))).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "removed", sourceId: "source" }),
      expect.objectContaining({ state: "active", sourceId: "source-2" }),
      expect.objectContaining({ state: "active", sourceId: "source-3" }),
      expect.objectContaining({ state: "active", sourceId: "source-4" }),
    ]));
  });

  test("retains an ambiguous high-risk normalized-location relation as verification-required without mutation", async () => {
    const firstText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim: firstClaim } = await claimFor(firstText);
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(firstText))).mockResolvedValueOnce(judgmentResponse());
    const first = await runKnowledgeIngestionPipeline(firstClaim, testDb);
    await testDb.insert(sources).values({ id: "source-2", kind: "pasted_text", label: "Second", sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: "operator" });
    const highRiskText = "Trạm sạc tại Đèo Hải Vân đang hoạt động.";
    const { capture, claim } = await claimFor(highRiskText, "source-2");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate(highRiskText, { type: "ev_charging", title: "Trạm sạc đèo Hải Vân", summary: "Trạm sạc đang hoạt động.", location_name: "  Đèo\u00a0Hải Vân  " }))).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "ambiguous", target_card_id: null, summary: "Chưa đủ rõ." }) } }] }), { status: 200 }));

    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "review_recommended", cardId: expect.any(String) });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(2);
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, first?.cardId ?? ""))).resolves.toMatchObject([{ publicationState: "active" }]);
    await expect(testDb.select().from(knowledgeCards)).resolves.toMatchObject(expect.arrayContaining([expect.objectContaining({ publicationState: "suppressed", knowledgeState: "uncertain", reviewState: "ai_recommended", verificationState: "required", needsReview: true })]));
    await expect(testDb.select().from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.captureVersionId, capture.id))).resolves.toMatchObject([{ quoteText: highRiskText, supportLevel: "supporting" }]);
    await expect(testDb.select().from(knowledgeRecommendations).where(eq(knowledgeRecommendations.reason, "relation"))).resolves.toMatchObject([{ status: "open", contentVersion: 2, evidenceSetRevision: 2 }]);
    await expect(testDb.select().from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId))).resolves.toMatchObject([{ stage: "review_recommended", checkpoint: null }]);
  });

  test("fails safe when extraction and judgment select the same model", async () => {
    await testDb.update(aiGatewayModels).set({ gatewayModelName: "extract-model" }).where(eq(aiGatewayModels.id, "judge"));
    const { claim } = await claimFor("Đèo Hải Vân có điểm dừng ngắm cảnh an toàn.");
    vi.mocked(fetch).mockResolvedValueOnce(extractionResponse(candidate("Đèo Hải Vân có điểm dừng ngắm cảnh an toàn.")));
    await expect(runKnowledgeIngestionPipeline(claim, testDb)).resolves.toMatchObject({ outcome: "review_recommended" });
    await expect(testDb.select().from(knowledgeCards)).resolves.toHaveLength(0);
  });

  test("resumes from an extraction checkpoint without repeating extraction", async () => {
    const rawText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim } = await claimFor(rawText);
    const triaged = await commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: "queued", expectedStageVersion: 1, fencingToken: claim.fencingToken, nextStage: "triaging", checkpoint: { version: 1, completedStage: "triaging", passed: true } }, testDb);
    if (!triaged) throw new Error("expected triage commit");
    const checkpoint = { version: 1 as const, completedStage: "extracting" as const, candidate: { type: "place" as const, title: "Điểm ngắm cảnh đèo Hải Vân", summary: "Có điểm dừng ngắm cảnh phù hợp ban ngày.", locationName: "Đèo Hải Vân", routeSegment: null, conditions: ["ban ngày"], freshnessSensitive: false, spanStart: 0, spanEnd: Array.from(rawText).length, modelId: "extract", modelGatewayName: "extract-model", promptVersion: "knowledge_pipeline_extraction_v1" } };
    const extracted = await commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: "triaging", expectedStageVersion: triaged.stageVersion, fencingToken: claim.fencingToken, nextStage: "extracting", checkpoint }, testDb);
    if (!extracted) throw new Error("expected extraction commit");
    const recoveredAt = new Date((await testDb.select({ lease: knowledgeIngestionJobs.leaseExpiresAt }).from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId)))[0].lease!.getTime() + 1);
    await recoverKnowledgeIngestionJobs(testDb, recoveredAt);
    const resumed = await claimNextKnowledgeIngestionJob({ workerId: "resumed-worker", now: recoveredAt }, testDb);
    if (!resumed) throw new Error("expected resumed claim");
    vi.mocked(fetch).mockResolvedValueOnce(judgmentResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ model: "judge-model", choices: [{ message: { content: JSON.stringify({ action: "create", target_card_id: null, summary: "Khác biệt." }) } }] }), { status: 200 }));
    await expect(runKnowledgeIngestionPipeline(resumed, testDb)).resolves.toMatchObject({ outcome: "published" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("does not publish a recovered extraction checkpoint when the judge reuses its gateway model", async () => {
    await testDb.update(aiGatewayModels).set({ gatewayModelName: "extract-model" }).where(eq(aiGatewayModels.id, "judge"));
    const rawText = "Đèo Hải Vân có điểm dừng ngắm cảnh an toàn vào ban ngày.";
    const { claim } = await claimFor(rawText);
    const triaged = await commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: "queued", expectedStageVersion: 1, fencingToken: claim.fencingToken, nextStage: "triaging", checkpoint: { version: 1, completedStage: "triaging", passed: true } }, testDb);
    if (!triaged) throw new Error("expected triage commit");
    const checkpoint = { version: 1 as const, completedStage: "extracting" as const, candidate: { type: "place" as const, title: "Điểm ngắm cảnh đèo Hải Vân", summary: "Có điểm dừng ngắm cảnh phù hợp ban ngày.", locationName: "Đèo Hải Vân", routeSegment: null, conditions: ["ban ngày"], freshnessSensitive: false, spanStart: 0, spanEnd: Array.from(rawText).length, modelId: "extract", modelGatewayName: "extract-model", promptVersion: "knowledge_pipeline_extraction_v1" } };
    const extracted = await commitKnowledgeIngestionStage({ jobId: claim.jobId, expectedStage: "triaging", expectedStageVersion: triaged.stageVersion, fencingToken: claim.fencingToken, nextStage: "extracting", checkpoint }, testDb);
    if (!extracted) throw new Error("expected extraction commit");
    const recoveredAt = new Date((await testDb.select({ lease: knowledgeIngestionJobs.leaseExpiresAt }).from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.id, claim.jobId)))[0].lease!.getTime() + 1);
    await recoverKnowledgeIngestionJobs(testDb, recoveredAt);
    const resumed = await claimNextKnowledgeIngestionJob({ workerId: "resumed-worker", now: recoveredAt }, testDb);
    if (!resumed) throw new Error("expected resumed claim");
    await expect(runKnowledgeIngestionPipeline(resumed, testDb)).resolves.toMatchObject({ outcome: "review_recommended" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
