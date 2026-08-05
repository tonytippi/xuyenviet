import { afterEach, describe, expect, test, vi } from "vitest";

import { acceptDirectTripCreationRecommendation, declineDirectTripCreationRecommendation, loadTravelerShell, loadTripProjectSidebarSummaries, submitDirectAiAskStream } from "../apps/web/src/features/ai/direct-api-client";

describe("direct traveler API client", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  test("uses relative cookie-authenticated shell reads", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ shell: { conversation: null, tripProject: null, workspace: null } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(loadTravelerShell("conversation-1")).resolves.toEqual({ shell: { conversation: null, tripProject: null, workspace: null } });
    expect(fetch).toHaveBeenCalledWith("/v1/conversations/shell?conversationId=conversation-1", expect.objectContaining({ credentials: "include" }));
  });

  test("uses a strict relative cookie-authenticated Trip Project list read", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: [{ id: "project-1", title: "Hè miền Trung", conversationId: "conversation-1", updatedAt: "2026-08-05T00:00:00.000Z" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(loadTripProjectSidebarSummaries()).resolves.toEqual([{ id: "project-1", title: "Hè miền Trung", conversationId: "conversation-1", updatedAt: "2026-08-05T00:00:00.000Z" }]);
    expect(fetch).toHaveBeenCalledWith("/v1/conversations/trip-projects", expect.objectContaining({ credentials: "include" }));
  });

  test("rejects malformed Trip Project list rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: [{ id: "project-1", title: "Hè miền Trung", updatedAt: "2026-08-05T00:00:00.000Z" }] }), { status: 200 })));
    await expect(loadTripProjectSidebarSummaries()).rejects.toThrow();
  });

  test("accepts a shell conversation with persisted messages", async () => {
    const shell = { conversation: { id: "conversation-1", tripProjectId: null, messages: [{ id: "message-1", role: "assistant", content: "Đi Huế." }] }, tripProject: null, workspace: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ shell }), { status: 200 })));

    await expect(loadTravelerShell("conversation-1")).resolves.toEqual({ shell });
  });

  test("accepts a non-null production workspace shell", async () => {
    const workspace = { focus: { kind: "pending-proposal-with-expiry", proposalId: "proposal-1", reason: "Chờ xác nhận", sortKey: "0|proposal-1" }, timelineGroups: [{ dateDivider: "2026-08-03", legId: "leg-1", entries: [{ id: "leg-1", kind: "leg", anchorRole: null, type: "transport", state: "planned", stateLabel: "Đã lên kế hoạch", typeLabel: "Di chuyển", label: "Hà Nội đến Huế", plannedAt: "2026-08-03T08:00:00.000Z", timeContext: "08:00", placeContext: "Hà Nội → Huế", notesPreview: null, parentItemId: null, ordinal: 0, depth: 0 }] }], constraints: { adultCount: 2, childCount: 1, childrenSummary: [{ ageRange: "6 tuổi", comfortTags: ["Ghế ngồi ô tô"], preferenceTags: ["Biển"] }], vehicleType: "car", evChargingNeed: null, drivingToleranceHours: 8, budgetCurrency: "VND", budgetMinVnd: 1000000, budgetMaxVnd: 5000000, preferenceTags: ["Ẩm thực"], avoidItems: [{ category: "activity", label: "Leo núi" }] }, planHistory: [{ proposalId: "proposal-old", operationLabel: "apply", actorLabel: "Người dùng", timestampLabel: "2026-08-02T08:00:00.000Z", affectedItemLabels: ["Hà Nội đến Huế"], beforeAfter: [{ operation: "Cập nhật", before: "A", after: "B" }] }], pendingProposals: [{ id: "proposal-1", expiresAt: "2026-08-04T08:00:00.000Z", createdAt: "2026-08-03T08:00:00.000Z", rationale: "Chờ xác nhận", status: "pending", affectedItems: [{ itemId: "(mới)", kind: "leg", label: "Hà Nội đến Huế", change: "create" }], beforeAfter: [{ operation: "Tạo mục mới", before: null, after: "Hà Nội đến Huế" }], alternatives: [{ summary: "Đi tàu" }], hasAlternatives: true }] };
    const shell = { conversation: { id: "conversation-1", tripProjectId: "project-1", messages: [{ id: "message-1", role: "assistant", content: "Đã chuẩn bị." }] }, tripProject: { id: "project-1", title: "Hà Nội đến Huế", origin: "Hà Nội", destination: "Huế", startDate: "2026-08-03", endDate: "2026-08-05", travelers: "3 người", primaryConversationId: "conversation-1" }, workspace };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ shell }), { status: 200 })));
    await expect(loadTravelerShell(undefined, "project-1")).resolves.toEqual({ shell });
    workspace.pendingProposals[0]!.affectedItems[0]!.change = "update";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ shell }), { status: 200 })));
    await expect(loadTravelerShell(undefined, "project-1")).rejects.toThrow();
  });

  test("obtains CSRF only for a direct stream mutation and preserves NDJSON events", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "a".repeat(43) }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"type":"preparing"}\n{"type":"done","conversationId":"conversation-1","userMessage":{"id":"user-1","content":"Đi đâu?"},"assistantMessage":{"id":"assistant-1","content":"Đi Huế."}}\n', { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const events = await submitDirectAiAskStream({ question: "Đi đâu?", image: null, idempotencyKey: "a".repeat(16), onPreparing: () => undefined, onDelta: () => undefined });
    expect(events.map((event) => event.type)).toEqual(["preparing", "done"]);
    expect(fetch).toHaveBeenLastCalledWith("/v1/ai-ask/stream", expect.objectContaining({ credentials: "include", headers: expect.objectContaining({ "X-XuyenViet-CSRF": "a".repeat(43), "Idempotency-Key": "a".repeat(16) }) }));
  });

  test("forwards Idempotency-Key only for accepted trip creation", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, destination: { tripProjectId: "project-1", conversationId: "conversation-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(declineDirectTripCreationRecommendation({ decisionId: "decision-1" })).resolves.toEqual({ success: true });
    await expect(acceptDirectTripCreationRecommendation("decision-2", "a".repeat(16))).resolves.toEqual({ success: true, destination: { tripProjectId: "project-1", conversationId: "conversation-1" } });
    expect(fetch.mock.calls[0]![1]).toEqual(expect.objectContaining({ headers: expect.not.objectContaining({ "Idempotency-Key": expect.anything() }) }));
    expect(fetch.mock.calls[1]![1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "a".repeat(16) }) }));
  });

  test("rejects an invalid accepted-creation command before it reaches the API", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(acceptDirectTripCreationRecommendation("decision-2", "short")).resolves.toEqual({ success: false, reason: "not_found" });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("accepts the persisted terminal answer with provenance", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"type":"preparing"}\n{"type":"done","conversationId":"conversation-1","userMessage":{"id":"user-1","content":"Đi đâu?"},"assistantMessage":{"id":"assistant-1","content":"Đi Huế.","provenance":[{"id":"source-1"}]}}\n', { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(submitDirectAiAskStream({ question: "Đi đâu?", image: null, idempotencyKey: "a".repeat(16), onPreparing: () => undefined, onDelta: () => undefined })).resolves.toMatchObject([
      { type: "preparing" },
      { type: "done", assistantMessage: { id: "assistant-1", content: "Đi Huế.", provenance: [{ id: "source-1" }] } },
    ]);
  });

  test("delivers each validated NDJSON event once before the stream closes", async () => {
    const encoder = new TextEncoder();
    let releaseSecondChunk!: () => void;
    const secondChunk = new Promise<void>((resolve) => { releaseSecondChunk = resolve; });
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('{"type":"preparing"}\n{"type":"delta","content":"Xin"}\n'));
        await secondChunk;
        controller.enqueue(encoder.encode('{"type":"delta","content":" chào"}\n{"type":"done","conversationId":"conversation-1","userMessage":{"id":"user-1","content":"Đi đâu?"},"assistantMessage":{"id":"assistant-1","content":"Đi Huế."}}\n'));
        controller.close();
      },
    });
    const fetch = vi.fn().mockResolvedValueOnce(new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const received: string[] = [];
    const submission = submitDirectAiAskStream({ question: "Đi đâu?", image: null, idempotencyKey: "a".repeat(16), onPreparing: () => received.push("preparing"), onDelta: (content) => received.push(content) });
    await vi.waitFor(() => expect(received).toEqual(["preparing", "Xin"]));
    releaseSecondChunk();
    await expect(submission).resolves.toMatchObject([{ type: "preparing" }, { type: "delta", content: "Xin" }, { type: "delta", content: " chào" }, { type: "done" }]);
    expect(received).toEqual(["preparing", "Xin", " chào"]);
  });

  test("rejects malformed NDJSON event shapes without delivering them", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"type":"delta","content":42}\n', { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const onDelta = vi.fn();
    await expect(submitDirectAiAskStream({ question: "Đi đâu?", image: null, idempotencyKey: "a".repeat(16), onPreparing: () => undefined, onDelta })).rejects.toThrow("Luồng trả lời bị gián đoạn trước khi hoàn tất.");
    expect(onDelta).not.toHaveBeenCalled();
  });

  test("requires one preparing prefix and one terminal event", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"type":"preparing"}\n{"type":"done","conversationId":"conversation-1","userMessage":{"id":"user-1","content":"Đi đâu?"},"assistantMessage":{"id":"assistant-1","content":"Đi Huế."}}\n{"type":"delta","content":" muộn"}\n', { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(submitDirectAiAskStream({ question: "Đi đâu?", image: null, idempotencyKey: "a".repeat(16), onPreparing: () => undefined, onDelta: () => undefined })).rejects.toThrow("Luồng trả lời bị gián đoạn trước khi hoàn tất.");
  });

  test("rejects an unterminated stream after a valid prefix", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"type":"preparing"}\n{"type":"delta","content":"Đi Huế"}\n', { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(submitDirectAiAskStream({ question: "Đi đâu?", image: null, idempotencyKey: "a".repeat(16), onPreparing: () => undefined, onDelta: () => undefined })).rejects.toThrow("Luồng trả lời bị gián đoạn trước khi hoàn tất.");
  });
});
