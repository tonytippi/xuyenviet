import { describe, expect, test, vi } from "vitest";

import { resolvePlanningAnnotationCapabilities, sanitizeStoredPlanningAnnotations } from "@xuyenviet/domain";
import { parsePlanningAnswerDetailResponse, parsePlanningContextResponse } from "@xuyenviet/contracts";
import { createPostgresPlanningReadRepository } from "@xuyenviet/database";
import { assistantResponseProvenance, conversations, messages, tripPlanItems, tripProjects, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loadSelectedAnswerDetail, loadSelectedPlanningContext } from "@/features/chat-trips/planning-read-loader";
import { testDb } from "./helpers/db";

const provenance = [{
  id: "source-1", rank: 1, availability: "available" as const, sourceCategory: "knowledge" as const,
  title: "Nguồn an toàn", sourceType: "curated", url: "https://example.com/safe", checkedAt: null,
  confidenceLabel: "đã xác minh", verificationStatus: "verified" as const, usedInPrompt: true,
  citedInAnswer: false, retrievalScore: 1, freshnessSensitive: false,
}];

describe("planning API read policy", () => {
  test("rebuilds safe descriptors, rejects stale source bindings, and derives capability only from current state", async () => {
    const answerText = "Xem Nguồn an toàn. Áp dụng thay đổi.";
    const annotations = sanitizeStoredPlanningAnnotations({
      answerText,
      provenance,
      annotations: [
        { id: "source", start: 4, end: 17, text: "Nguồn an toàn", type: "source", detail: { type: "source", label: "Nguồn an toàn", provenanceIds: ["source-1"], owner: { table: "assistant_response_provenance", id: "source-1" }, detail: { URL: "https://attacker.example" } } },
        { id: "stale", start: 4, end: 17, text: "Nguồn an toàn", type: "source", detail: { type: "source", label: "Nguồn an toàn", provenanceIds: ["missing"] } },
        { id: "trip-change-proposal-apply", start: 19, end: answerText.length - 1, text: "Áp dụng thay đổi", type: "action", detail: { type: "action", label: "Áp dụng thay đổi", action: { command: "trip_change_proposal.apply", label: "Áp dụng thay đổi", arguments: {}, anchor: "trip-change-proposal-action.v1" } } },
      ],
    });

    expect(annotations.map((annotation) => annotation.id)).toEqual(["source", "trip-change-proposal-apply"]);
    expect(annotations[0].detail.detail?.URL).toBe("https://example.com/safe");
    expect(JSON.stringify(annotations)).not.toContain("attacker.example");
    await expect(resolvePlanningAnnotationCapabilities({ annotations, hasCurrentPendingProposal: async () => false })).resolves.toEqual(annotations);
    await expect(resolvePlanningAnnotationCapabilities({ annotations, hasCurrentPendingProposal: async () => true })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: "trip-change-proposal-apply", detail: expect.objectContaining({ capability: { command: "trip_change_proposal.apply", label: "Áp dụng thay đổi", available: true } }) })]));
  });

  test("selects exactly one planning owner and runs shadow comparison only after local or staging responses", async () => {
    const legacy = vi.fn(async () => ({ context: null }));
    const api = vi.fn(async () => ({ context: null }));
    const logger = { info: vi.fn(), warn: vi.fn() };
    await loadSelectedPlanningContext({ tripProjectId: "project-1", legacy, api, correlationId: "request-1", logger, environment: { APP_ENV: "staging", XV_PLANNING_READ_API_ENABLED: "true", XV_PLANNING_READ_SHADOW_COMPARE_ENABLED: "true" } });
    expect(api).toHaveBeenCalledWith("request-1");
    await vi.waitFor(() => expect(legacy).toHaveBeenCalledTimes(1));
    expect(logger.info).toHaveBeenCalledWith("planning_read_shadow_comparison", { correlationId: "request-1", equivalent: true });

    const legacyDetail = vi.fn(async () => ({ detail: null }));
    const apiDetail = vi.fn(async () => ({ detail: null }));
    await loadSelectedAnswerDetail({ conversationId: "conversation-1", assistantMessageId: "answer-1", legacy: legacyDetail, api: apiDetail, environment: { APP_ENV: "production", XV_PLANNING_READ_API_ENABLED: "false", XV_PLANNING_READ_SHADOW_COMPARE_ENABLED: "true" } });
    // No production shadow request is observable: the selected legacy path is the only call.
    expect(legacyDetail).toHaveBeenCalledTimes(1);
    expect(apiDetail).not.toHaveBeenCalled();
  });

  test("uses a safe empty detail and never calls legacy when API core detail fails", async () => {
    const legacy = vi.fn(async () => ({ detail: { conversationId: "conversation-1", assistantMessageId: "answer-1", content: "legacy", provenance, annotations: [] } }));
    const detail = await loadSelectedAnswerDetail({
      conversationId: "conversation-1",
      assistantMessageId: "answer-1",
      legacy,
      api: async () => { throw new Error("malformed transport"); },
      environment: { APP_ENV: "production", XV_PLANNING_READ_API_ENABLED: "true" },
    });
    expect(detail).toEqual({ detail: null });
    expect(legacy).not.toHaveBeenCalled();
  });

  test("accepts API-owned core prose only for the requested answer", async () => {
    const legacy = vi.fn(async () => ({ detail: { conversationId: "conversation-1", assistantMessageId: "answer-1", content: "legacy", provenance, annotations: [] } }));
    const api = vi.fn(async () => ({ detail: { conversationId: "other-conversation", assistantMessageId: "other-answer", content: "untrusted prose", provenance, annotations: [] } }));
    await expect(loadSelectedAnswerDetail({
      conversationId: "conversation-1",
      assistantMessageId: "answer-1",
      legacy,
      api,
      environment: { APP_ENV: "production", XV_PLANNING_READ_API_ENABLED: "true" },
    })).resolves.toEqual({ detail: null });
    expect(legacy).not.toHaveBeenCalled();

    await expect(loadSelectedAnswerDetail({
      conversationId: "conversation-1",
      assistantMessageId: "answer-1",
      legacy,
      api: async () => ({ detail: { conversationId: "conversation-1", assistantMessageId: "answer-1", content: "changed prose", provenance, annotations: [] } }),
      environment: { APP_ENV: "production", XV_PLANNING_READ_API_ENABLED: "true" },
    })).resolves.toEqual({ detail: { conversationId: "conversation-1", assistantMessageId: "answer-1", content: "changed prose", provenance, annotations: [] } });
    expect(legacy).not.toHaveBeenCalled();
  });

  test("rejects malformed, raw, unsafe, and non-canonical planning transport payloads", () => {
    const available = {
      id: "source-1", rank: 1, availability: "available", sourceCategory: "knowledge", title: "Nguồn an toàn", sourceType: "curated", url: "https://example.com/safe", checkedAt: "2026-07-30T00:00:00.000Z", confidenceLabel: "đã xác minh", verificationStatus: "verified", usedInPrompt: true, citedInAnswer: false, retrievalScore: 1, freshnessSensitive: false,
    };
    const detail = { conversationId: "conversation-1", assistantMessageId: "answer-1", content: "Nội dung", provenance: [available], annotations: [] };
    expect(parsePlanningAnswerDetailResponse({ detail })).toEqual({ detail });
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, provenance: [{ ...available, sourceSnapshot: { raw: true } }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, provenance: [available, { ...available, id: "source-2", rank: 1 }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, provenance: [{ ...available, rank: 2 }, { ...available, id: "source-2", rank: 1 }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, annotations: [{ id: "range", start: 0, end: 2, text: "khác", type: "warning", detail: { type: "warning", label: "khác" } }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, provenance: [{ ...available, checkedAt: "2026-07-30T07:00:00+07:00" }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, provenance: [{ ...available, url: "javascript:alert(1)" }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, provenance: [{ ...available, url: "https://traveler:secret@example.com/private" }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, annotations: [{ id: "unsafe", start: 0, end: 1, text: "N", type: "warning", detail: { type: "warning", label: "N", capability: { command: "trip_change_proposal.apply", label: "N", available: true } } }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, annotations: [{ id: "unknown-source", start: 0, end: 1, text: "N", type: "source", detail: { type: "source", label: "N", provenanceIds: ["missing"] } }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, annotations: [{ id: "withdrawn-source", start: 0, end: 1, text: "N", type: "source", detail: { type: "source", label: "N", provenanceIds: ["source-1"] } }], provenance: [{ id: "source-1", rank: 1, availability: "withdrawn", unavailableLabel: "Nguồn này không còn khả dụng.", usedInPrompt: true, citedInAnswer: false }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, annotations: [{ id: "bad-action", start: 0, end: 1, text: "N", type: "warning", detail: { type: "warning", label: "N", action: { command: "trip_change_proposal.apply", label: "N", arguments: {}, anchor: "trip-change-proposal-action.v1" } } }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, annotations: [{ id: "trip-change-proposal-apply", start: 0, end: 1, text: "N", type: "action", detail: { type: "action", label: "N", action: { command: "trip_change_proposal.dismiss", label: "N", arguments: {}, anchor: "trip-change-proposal-action.v1" } } }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, annotations: [{ id: "trip-change-proposal-dismiss", start: 0, end: 1, text: "N", type: "action", detail: { type: "action", label: "N", capability: { command: "trip_change_proposal.apply", label: "N", available: true } } }] } })).toBeNull();
    expect(parsePlanningAnswerDetailResponse({ detail: { ...detail, annotations: [{ id: "local-warning", start: 0, end: 1, text: "N", type: "warning", detail: { type: "warning", label: "N" } }, { id: "local-fact", start: 1, end: 2, text: "ộ", type: "trip_fact", detail: { type: "trip_fact", label: "ộ" } }] } })).toEqual(expect.objectContaining({ detail: expect.objectContaining({ annotations: expect.arrayContaining([expect.objectContaining({ id: "local-warning" }), expect.objectContaining({ id: "local-fact" })]) }) }));
    expect(parsePlanningContextResponse({ context: { version: 1, hasProjectScope: true, tripProjectId: "project-1", aggregateVersion: 1, primaryConversationId: "conversation-1", anchors: [], planItems: [], constraints: { version: 1, values: { raw: { a: { b: { c: { d: { e: "too-deep" } } } } } } }, currentConversationFacts: [], conflicts: [] } })).toBeNull();
    expect(parsePlanningContextResponse({ context: null, raw: "leak" })).toBeNull();
  });

  test("preserves Story 11.3 legacy descriptor semantics without trusting persisted display data", () => {
    const answerText = "Hành động";
    expect(sanitizeStoredPlanningAnnotations({
      answerText,
      provenance: [],
      annotations: [{ id: "legacy", start: 0, end: answerText.length, text: answerText, type: "action", detail: { type: "action", label: answerText, section: "Gợi ý hành động", detail: { "Nhãn": "Hành động gợi ý", "Giải thích": "Gợi ý thao tác tiếp theo từ câu trả lời, không phải nguồn đã xác minh." } } }],
    })).toEqual([expect.objectContaining({ detail: expect.not.objectContaining({ action: expect.anything(), capability: expect.anything() }) })]);
  });

  test("uses the PostgreSQL adapter for owner scope, withdrawal-safe detail, and canonical context", async () => {
    await testDb.insert(users).values([{ id: "planning-owner", email: "planning-owner@example.com" }, { id: "planning-other", email: "planning-other@example.com" }]);
    const [project] = await testDb.insert(tripProjects).values({ userId: "planning-owner", title: "Canonical project", origin: "Hà Nội", destination: "Huế" }).returning();
    const [primary] = await testDb.insert(conversations).values({ userId: "planning-owner", tripProjectId: project.id }).returning();
    await testDb.update(tripProjects).set({ primaryConversationId: primary.id }).where(eq(tripProjects.id, project.id));
    const [userMessage] = await testDb.insert(messages).values({ userId: "planning-owner", conversationId: primary.id, role: "user", content: "Hỏi đường" }).returning();
    const answerText = "Nguồn đã rút";
    const [assistant] = await testDb.insert(messages).values({ userId: "planning-owner", conversationId: primary.id, role: "assistant", content: answerText, answerAnnotations: [{ id: "stale-source", start: 0, end: answerText.length, text: answerText, type: "source", detail: { type: "source", label: answerText, provenanceIds: ["withdrawn-source"] } }] }).returning();
    await testDb.insert(tripPlanItems).values([
      { id: "destination-anchor", userId: "planning-owner", tripProjectId: project.id, kind: "anchor", anchorRole: "destination", state: "planned", label: "Huế canonical", ordinal: 1 },
      { id: "origin-anchor", userId: "planning-owner", tripProjectId: project.id, kind: "anchor", anchorRole: "origin", state: "planned", label: "Hà Nội canonical", ordinal: 0 },
    ]);
    await testDb.insert(assistantResponseProvenance).values({ id: "withdrawn-source", userId: "planning-owner", conversationId: primary.id, userMessageId: userMessage.id, assistantMessageId: assistant.id, sourceCategory: "web", rank: 1, verificationStatus: "unverified", availability: "withdrawn", withdrawnAt: new Date(), withdrawalReason: "withdrawn", sourceSnapshot: { title: "secret title", url: "https://secret.example", rawMaterial: "must not leave" } });

    const repository = createPostgresPlanningReadRepository();
    expect(await repository.loadOwnedPlanningContext("planning-other", project.id)).toBeNull();
    const context = await repository.loadOwnedPlanningContext("planning-owner", project.id);
    expect(context?.anchors).toEqual([{ field: "destination", value: "Huế canonical", source: "trip_project" }, { field: "origin", value: "Hà Nội canonical", source: "trip_project" }]);
    expect(context?.planItems.map((item) => item.id)).toEqual(["origin-anchor", "destination-anchor"]);
    expect(await repository.loadOwnedAnswerDetail("planning-other", primary.id, assistant.id)).toBeNull();
    expect(await repository.loadOwnedAnswerDetail("planning-owner", primary.id, "missing-answer")).toBeNull();
    const detail = await repository.loadOwnedAnswerDetail("planning-owner", primary.id, assistant.id);
    expect(detail).toEqual({ conversationId: primary.id, assistantMessageId: assistant.id, content: answerText, provenance: [{ id: "withdrawn-source", rank: 1, availability: "withdrawn", unavailableLabel: "Nguồn này không còn khả dụng.", usedInPrompt: true, citedInAnswer: false }], annotations: [] });
    expect(JSON.stringify(detail)).not.toContain("secret");
    expect(JSON.stringify(detail)).not.toContain("rawMaterial");
  });

  test("keeps required assistant prose when optional stored enrichment is invalid", async () => {
    await testDb.insert(users).values({ id: "planning-safe-answer", email: "planning-safe-answer@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ userId: "planning-safe-answer" }).returning();
    const [assistant] = await testDb.insert(messages).values({
      userId: "planning-safe-answer",
      conversationId: conversation.id,
      role: "assistant",
      content: "Câu trả lời vẫn dùng được.",
      answerAnnotations: [{ id: "invalid-source", start: 0, end: 3, text: "Câu", type: "source", detail: { type: "source", label: "Câu", provenanceIds: ["missing"] } }],
    }).returning();

    const detail = await createPostgresPlanningReadRepository().loadOwnedAnswerDetail("planning-safe-answer", conversation.id, assistant.id);

    expect(detail).toEqual({ conversationId: conversation.id, assistantMessageId: assistant.id, content: "Câu trả lời vẫn dùng được.", provenance: [], annotations: [] });
  });
});
