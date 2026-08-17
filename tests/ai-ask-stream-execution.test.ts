import { beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { createAiAskStreamExecution } from "@xuyenviet/domain";
import { createAiAskStreamExecutionPort, setAiAskStreamTestDependencies } from "../packages/database/src/ai-ask-stream-execution";
import { aiAskCommands, aiGatewayModels, aiUsageEvents, assistantResponseProvenance, assistantRetrievalDecisions, conversations, domainOutbox, messages, planningContextSessions, publicMvpEvaluationResults, tripAnswerContextSnapshots, tripChangeProposals, tripProjects, users } from "../packages/database/src/schema";
import { renderSourceBundlePromptSection, type ContextPrioritySourceBundle } from "../packages/database/src/source-bundle";

import { resetTestDatabase, testDb } from "./helpers/db";

describe("AI Ask stream execution", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    setAiAskStreamTestDependencies(undefined);
  });

  test("terminalizes a profiled incomplete turn before source assembly or provider work", async () => {
    await testDb.insert(users).values({ id: "user-1", email: "user-1@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const assemble = vi.fn().mockResolvedValue(sourceBundle());
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: assemble });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const events = await collect(await port().admit({ question: "Tôi muốn đi Đà Nẵng", idempotencyKey: "clarification_blocked_test".padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-1", new AbortController().signal));

    expect(events).toEqual([expect.objectContaining({ type: "preparing" }), expect.objectContaining({ type: "done", assistantMessage: { content: "Bạn sẽ xuất phát từ đâu?" } })]);
    expect(assemble).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await testDb.select().from(planningContextSessions)).toHaveLength(1);
    expect(await testDb.select().from(domainOutbox)).toEqual([]);
    expect(await testDb.select().from(assistantRetrievalDecisions)).toEqual([]);
    expect(await testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.purpose, "ai_ask_initial_answer"))).toHaveLength(1);
  });

  test("revokes admission context extraction when preflight observes a newer collecting session", async () => {
    await testDb.insert(users).values({ id: "user-1", email: "user-1@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const telemetry = { emit: vi.fn() };
    setAiAskStreamTestDependencies({ prepareOwnedPlanningClarification: vi.fn().mockResolvedValue({ kind: "question", session: {} as never, question: "Bạn sẽ xuất phát từ đâu?" }) });

    const admission = await createAiAskStreamExecutionPort(telemetry).admit({ question: "Thời tiết hôm nay thế nào?", idempotencyKey: "clarification_admission_race".padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-race", new AbortController().signal);
    expect(admission.kind).toBe("admitted");
    await expect(testDb.select().from(domainOutbox)).resolves.toHaveLength(1);
    if (admission.kind !== "admitted") return;
    const events = [];
    for await (const event of admission.execution) events.push(event);

    expect(events.at(-1)).toMatchObject({ type: "done", assistantMessage: { content: "Bạn sẽ xuất phát từ đâu?" } });
    await expect(testDb.select().from(domainOutbox)).resolves.toEqual([]);
    expect(telemetry.emit).toHaveBeenCalledWith(expect.objectContaining({ correlationId: "request-race", capability: "ai_ask.clarification", resultCode: "success", durableId: expect.any(String) }));
  });

  test("records one local failure usage when clarification preflight requests retry", async () => {
    await testDb.insert(users).values({ id: "user-1", email: "user-1@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const assemble = vi.fn();
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: assemble, prepareOwnedPlanningClarification: vi.fn().mockResolvedValue({ kind: "retry" }) });

    const telemetry = { emit: vi.fn() };
    const admission = await createAiAskStreamExecutionPort(telemetry).admit({ question: "Tôi muốn đi Huế", idempotencyKey: "clarification_retry_test".padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-1", new AbortController().signal);
    const events = await collect(admission);

    expect(events.at(-1)).toMatchObject({ type: "error", errorMessage: "Mình chưa thể ghi nhận thông tin chuyến đi. Vui lòng thử lại." });
    expect(assemble).not.toHaveBeenCalled();
    await expect(testDb.select({ status: aiUsageEvents.status, provider: aiUsageEvents.provider, errorCode: aiUsageEvents.errorCode }).from(aiUsageEvents)).resolves.toEqual([{ status: "failure", provider: "local", errorCode: "planning_clarification_retry" }]);
    await expect(testDb.select().from(domainOutbox)).resolves.toEqual([]);
    expect(telemetry.emit).toHaveBeenCalledWith(expect.objectContaining({ capability: "ai_ask.clarification", resultCode: "failure" }));
  });

  test("records one local failure usage when clarification preflight throws", async () => {
    await testDb.insert(users).values({ id: "user-1", email: "user-1@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const assemble = vi.fn();
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: assemble, prepareOwnedPlanningClarification: vi.fn().mockRejectedValue(new Error("CAS unavailable")) });

    const events = await collect(await port().admit({ question: "Tôi muốn đi Huế", idempotencyKey: "clarification_throw_test".padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-1", new AbortController().signal));

    expect(events.at(-1)).toMatchObject({ type: "error", errorMessage: "Mình chưa thể ghi nhận thông tin chuyến đi. Vui lòng thử lại." });
    expect(assemble).not.toHaveBeenCalled();
    await expect(testDb.select({ status: aiUsageEvents.status, errorCode: aiUsageEvents.errorCode }).from(aiUsageEvents)).resolves.toEqual([{ status: "failure", errorCode: "planning_clarification_retry" }]);
  });

  test.each([
    { image: undefined, expectedError: "No active streaming AI Ask model is configured." },
    { image: { fileName: "photo.png", mimeType: "image/png" as const, byteSize: 3, bytes: new Uint8Array([1, 2, 3]) }, expectedError: "Selected AI model does not support streaming image input." },
  ])("preserves the model configuration error when no compatible model is available", async ({ image, expectedError }) => {
    await testDb.insert(users).values({ id: "user-1", email: "user-1@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    if (image) await testDb.insert(aiGatewayModels).values({ id: "text-only-model", gatewayModelName: "test/text", displayLabel: "Text", purpose: "ai_ask_initial_answer", defaultForPurpose: true, supportsTextInput: true, supportsStreaming: true, supportsImageInput: false });

    const events = await collect(await port().admit({ question: "Thời tiết hôm nay thế nào?", idempotencyKey: `model_configuration_${image ? "image" : "none"}`.padEnd(24, "x"), conversationId: conversation.id, image }, principal(), "request-1", new AbortController().signal));

    expect(events.at(-1)).toMatchObject({ type: "error", errorMessage: expectedError });
    await expect(testDb.select({ status: aiAskCommands.status }).from(aiAskCommands)).resolves.toEqual([{ status: "failed" }]);
  });

  test("returns the retained refresh terminal when conversation deletion wins clarification finalization", async () => {
    await testDb.insert(users).values({ id: "user-1", email: "user-1@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    setAiAskStreamTestDependencies({ prepareOwnedPlanningClarification: vi.fn().mockImplementation(async () => { await pending; return { kind: "question", session: {} as never, question: "Bạn sẽ xuất phát từ đâu?" }; }) });
    const admission = await port().admit({ question: "Tôi muốn đi Huế", idempotencyKey: "clarification_delete_test".padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-1", new AbortController().signal);
    if (admission.kind !== "admitted") throw new Error("Expected admitted execution");
    const iterator = admission.execution[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "preparing" } });
    await testDb.delete(conversations).where(eq(conversations.id, conversation.id));
    release();
    expect((await collectIterator(iterator)).at(-1)).toMatchObject({ type: "error", code: "refresh_required" });
    await expect(testDb.select().from(messages).where(eq(messages.role, "assistant"))).resolves.toEqual([]);
  });

  test("persists the exact rendered snapshot and links every answer-side record after a completed stream", async () => {
    await seedUserAndModel();
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.update(tripProjects).set({ primaryConversationId: conversation.id }).where(eq(tripProjects.id, project.id));
    const bundle = sourceBundle({
      web: [{ query: "Đi đâu?", title: "Nguồn web", url: "https://example.com", snippet: "Thông tin tham khảo", provider: "tavily", checkedAt: new Date("2026-08-07T00:00:00.000Z"), sourceType: "official", confidence: "unverified", triggerReason: "no_active_knowledge", rank: 1 }],
    });
    const rendered = renderSourceBundlePromptSection(bundle);
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: vi.fn().mockResolvedValue(bundle) });
    mockGateway();

    const events = await collect(await port().admit({ question: "Đi đâu?", idempotencyKey: "snapshot_execution_test".padEnd(24, "x"), conversationId: conversation.id, tripProjectId: project.id }, principal(), "request-1", new AbortController().signal));
    const [snapshot] = await testDb.select().from(tripAnswerContextSnapshots);
    const [command] = await testDb.select().from(aiAskCommands);
    const [decision] = await testDb.select().from(assistantRetrievalDecisions);
    const [usage] = await testDb.select().from(aiUsageEvents).where(eq(aiUsageEvents.purpose, "ai_ask_initial_answer"));
    const provenance = await testDb.select().from(assistantResponseProvenance);

    expect(events.at(-1)).toMatchObject({ type: "done" });
    expect(rendered.section).toContain('lower="Đà Lạt"');
    expect(rendered.section.split("2. Ngữ cảnh phiên chat hiện tại")[1]?.split("Mâu thuẫn giữa chat và dự án")[0]).not.toContain("Đà Lạt");
    expect(snapshot).toMatchObject({ tripProjectId: project.id, serialization: rendered.tripContext.serialization, promptDigest: rendered.tripContext.promptDigest, includedReferences: rendered.tripContext.included, excludedReferences: rendered.tripContext.excluded });
    expect(snapshot?.conflicts).toEqual(rendered.tripContext.conflicts);
    expect(command).toMatchObject({ status: "completed", tripAnswerContextSnapshotId: snapshot.id });
    expect(decision?.tripAnswerContextSnapshotId).toBe(snapshot.id);
    expect(decision?.knowledgePolicySnapshot).toEqual({ version: "required-needs-v1", needs: [] });
    expect(usage?.tripAnswerContextSnapshotId).toBe(snapshot.id);
    expect(provenance).toHaveLength(3);
    expect(provenance.every((row) => row.tripAnswerContextSnapshotId === snapshot.id)).toBe(true);
    expect(provenance.map((row) => row.usedInPrompt)).toEqual([true, true, true]);
  });

  test("persists only valid fragmented source attribution and keeps tool metadata out of answer deltas", async () => {
    await seedUserAndModel();
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    const bundle = sourceBundle();
    const rendered = renderSourceBundlePromptSection(bundle);
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: vi.fn().mockResolvedValue(bundle) });
    mockGatewayWithToolCalls([
      { index: 0, function: { name: "report_used_", arguments: "{\"provenance_" } },
      { index: 0, function: { name: "sources", arguments: "handles\":[\"source_01\"]}" } },
    ]);

    const events = await collect(await port().admit({ question: "Đi đâu?", idempotencyKey: "source_attribution_test".padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-1", new AbortController().signal));
    const provenance = await testDb.select().from(assistantResponseProvenance);
    const request = JSON.parse((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string);

    expect(request.tools).toEqual([expect.objectContaining({ function: expect.objectContaining({ name: "report_used_sources" }) })]);
    expect(request.tool_choice).toBe("auto");
    expect(rendered.promptUsage.sourceHandles.map((item) => item.handle)).toEqual(["source_01"]);
    expect(events).toContainEqual({ type: "delta", content: "Gợi ý an toàn." });
    expect(JSON.stringify(events)).not.toContain("report_used_sources");
    expect(JSON.stringify(events)).not.toContain("source_01");
    expect(provenance.map((row) => row.citedInAnswer)).toEqual([false, false, true, false]);
  });

  test.each([
    [[{ index: 0, function: { name: "other_tool", arguments: "{\"provenance_handles\":[\"source_01\"]}" } }]],
    [[{ index: 0, function: { name: "report_used_sources", arguments: "{\"provenance_handles\":[\"unknown\"]}" } }]],
    [[{ index: 0, function: { name: "report_used_sources", arguments: "{\"provenance_handles\":[\"source_01\",\"source_01\"]}" } }]],
    [[{ index: 0, function: { name: "report_used_sources", arguments: "not-json" } }]],
  ])("completes without citations for invalid source attribution metadata", async (toolCalls) => {
    await seedUserAndModel();
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: vi.fn().mockResolvedValue(sourceBundle()) });
    mockGatewayWithToolCalls(toolCalls);

    const events = await collect(await port().admit({ question: "Đi đâu?", idempotencyKey: `invalid_source_${Math.random()}`.padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-1", new AbortController().signal));
    const provenance = await testDb.select().from(assistantResponseProvenance);

    expect(events.at(-1)).toMatchObject({ type: "done" });
    expect(provenance.every((row) => !row.citedInAnswer)).toBe(true);
  });

  test.each([
    { warning: "web_search_load_failed" as const, reason: "no_active_knowledge" as const },
    { warning: "web_search_low_quality" as const, reason: "no_active_knowledge" as const },
  ])("retains broad planning guidance with a bounded warning when $warning follows $reason", async ({ warning, reason }) => {
    await seedUserAndModel();
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: vi.fn().mockResolvedValue(sourceBundle({
      warnings: [warning],
      retrievalDecision: { broadPlanningQuestion: true, webSearchTriggered: true, webSearchTriggerReasons: [reason] },
    })) });
    mockGateway("Chia hành trình thành các chặng ngắn và dành thời gian nghỉ hợp lý.");

    const events = await collect(await port().admit({ question: "Gợi ý lịch trình road trip 5 ngày", idempotencyKey: "general_fallback_test".padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-1", new AbortController().signal));
    const [assistantMessage] = await testDb.select().from(messages).where(eq(messages.role, "assistant"));

    expect(events).toContainEqual({ type: "delta", content: "Chia hành trình thành các chặng ngắn và dành thời gian nghỉ hợp lý." });
    expect(assistantMessage?.content).toContain("Chia hành trình thành các chặng ngắn");
    expect(assistantMessage?.content).toContain("Mình chưa thể xác minh các thông tin hiện tại từ nguồn bên ngoài.");
  });

  test("replaces unsupported output for a freshness-sensitive request when web fallback fails", async () => {
    await seedUserAndModel();
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: vi.fn().mockResolvedValue(sourceBundle({
      warnings: ["web_search_low_quality"],
      retrievalDecision: { freshnessRequired: true, webSearchTriggered: true, webSearchTriggerReasons: ["freshness_sensitive_request"] },
    })) });
    mockGateway("Giá vé hôm nay là 100.000 đồng.");

    const events = await collect(await port().admit({ question: "Giá vé hôm nay bao nhiêu?", idempotencyKey: "dynamic_fallback_test".padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-1", new AbortController().signal));
    const [assistantMessage] = await testDb.select().from(messages).where(eq(messages.role, "assistant"));

    expect(events).toContainEqual({ type: "delta", content: "Giá vé hôm nay là 100.000 đồng." });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "delta", content: expect.stringContaining("Mình chưa thể xác minh thông tin hiện tại") }));
    expect(assistantMessage?.content).toContain("Mình chưa thể xác minh thông tin hiện tại từ nguồn bên ngoài.");
    expect(assistantMessage?.content).not.toContain("Giá vé hôm nay là 100.000 đồng.");
  });

  test("persists an answer after the browser stops consuming an admitted stream", async () => {
    await seedUserAndModel();
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    let releaseBundle!: () => void;
    const bundlePending = new Promise<void>((resolve) => { releaseBundle = resolve; });
    const receivedSignals: AbortSignal[] = [];
    setAiAskStreamTestDependencies({
      assembleContextPrioritySourceBundle: vi.fn().mockImplementation(async (input) => {
        receivedSignals.push(input.abortSignal!);
        await bundlePending;
        return sourceBundle();
      }),
    });
    mockGateway();
    const browser = new AbortController();
    const admission = await port().admit({ question: "Đi đâu?", idempotencyKey: "persist_after_disconnect".padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-1", browser.signal);
    expect(admission.kind).toBe("admitted");
    const iterator = (admission as Extract<typeof admission, { kind: "admitted" }>).execution[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "preparing" } });
    browser.abort();
    await iterator.return?.();
    releaseBundle();

    await vi.waitFor(async () => {
      const assistantMessages = await testDb.select().from(messages).where(eq(messages.role, "assistant"));
      expect(assistantMessages).toHaveLength(1);
    });
    expect(receivedSignals).toHaveLength(1);
    expect(receivedSignals[0]?.aborted).toBe(false);
    await expect(testDb.select({ status: aiAskCommands.status }).from(aiAskCommands)).resolves.toEqual([{ status: "completed" }]);
  });

  test("persists a clean gateway EOF without provider terminal metadata", async () => {
    await seedUserAndModel();
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1" }).returning({ id: conversations.id });
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: vi.fn().mockResolvedValue(sourceBundle()) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('data: {"model":"test/answer","choices":[{"delta":{"content":"Gợi ý an toàn."}}]}\n\n', { status: 200, headers: { "content-type": "text/event-stream" } })));

    const events = await collect(await port().admit({ question: "Đi đâu?", idempotencyKey: "clean_gateway_eof".padEnd(24, "x"), conversationId: conversation.id }, principal(), "request-1", new AbortController().signal));

    expect(events.at(-1)).toMatchObject({ type: "done", assistantMessage: { content: "Gợi ý an toàn." } });
    await expect(testDb.select({ status: aiAskCommands.status }).from(aiAskCommands)).resolves.toEqual([{ status: "completed" }]);
  });

  test.each(["aggregate", "deletion"])("does not persist a partial snapshot or completed answer when the %s fence changes during generation", async (race) => {
    await seedUserAndModel();
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.update(tripProjects).set({ primaryConversationId: conversation.id }).where(eq(tripProjects.id, project.id));
    let releaseBundle: (() => void) | undefined;
    const bundleReady = new Promise<void>((resolve) => { releaseBundle = resolve; });
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: vi.fn().mockImplementation(async () => { await bundleReady; return sourceBundle(); }) });
    mockGateway();

    const admission = await port().admit({ question: "Đi đâu?", idempotencyKey: `snapshot_${race}_test`.padEnd(24, "x"), conversationId: conversation.id, tripProjectId: project.id }, principal(), "request-1", new AbortController().signal);
    expect(admission.kind).toBe("admitted");
    const iterator = (admission as Extract<typeof admission, { kind: "admitted" }>).execution[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "preparing" } });
    if (race === "aggregate") await testDb.update(tripProjects).set({ aggregateVersion: 2 }).where(eq(tripProjects.id, project.id));
    else await testDb.delete(tripProjects).where(eq(tripProjects.id, project.id));
    releaseBundle?.();
    const remaining = await collectIterator(iterator);

    expect(remaining.at(-1)).toMatchObject({ type: "error", code: "refresh_required" });
    await expect(testDb.select().from(tripAnswerContextSnapshots)).resolves.toEqual([]);
    await expect(testDb.select().from(messages).where(eq(messages.role, "assistant"))).resolves.toEqual([]);
    await expect(testDb.select({ status: aiAskCommands.status }).from(aiAskCommands)).resolves.toEqual([{ status: "discarded" }]);
    await expect(testDb.select().from(publicMvpEvaluationResults)).resolves.toEqual([]);
  });

  test("discards generated output when the pinned planning session changes", async () => {
    await seedUserAndModel();
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.update(tripProjects).set({ primaryConversationId: conversation.id }).where(eq(tripProjects.id, project.id));
    await testDb.insert(planningContextSessions).values({ userId: "user-1", conversationId: conversation.id, revision: 1, payload: { intent: "trip_planning", slots: { origin: "Hà Nội", destination: "Huế", start_date: "2026-09-01", adults: "2" }, missingSlots: [], status: "ready", sourceMessageIds: ["seed"], revision: 1 } });
    let releaseBundle!: () => void;
    const bundleReady = new Promise<void>((resolve) => { releaseBundle = resolve; });
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: vi.fn().mockImplementation(async () => { await bundleReady; return sourceBundle(); }) });
    mockGateway();

    const admission = await port().admit({ question: "Kế hoạch hiện tại là gì?", idempotencyKey: "planning_session_race".padEnd(24, "x"), conversationId: conversation.id, tripProjectId: project.id }, principal(), "request-1", new AbortController().signal);
    if (admission.kind !== "admitted") throw new Error("Expected admitted execution");
    const iterator = admission.execution[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "preparing" } });
    await testDb.update(planningContextSessions).set({ revision: 2, payload: { intent: "trip_planning", slots: { origin: "Hà Nội", destination: "Huế", start_date: "2026-09-02", adults: "2" }, missingSlots: [], status: "ready", sourceMessageIds: ["seed", "changed"], revision: 2 } }).where(eq(planningContextSessions.conversationId, conversation.id));
    releaseBundle();

    expect((await collectIterator(iterator)).at(-1)).toMatchObject({ type: "error", code: "refresh_required" });
    await expect(testDb.select().from(messages).where(eq(messages.role, "assistant"))).resolves.toEqual([]);
    await expect(testDb.select().from(tripAnswerContextSnapshots)).resolves.toEqual([]);
    await expect(testDb.select({ status: aiUsageEvents.status }).from(aiUsageEvents).where(eq(aiUsageEvents.purpose, "ai_ask_initial_answer"))).resolves.toEqual([]);
  });

  test.each(["dismissed", "applied", "updated"] as const)("discards generated output when the pinned proposal becomes %s", async (transition) => {
    await seedUserAndModel();
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.update(tripProjects).set({ primaryConversationId: conversation.id }).where(eq(tripProjects.id, project.id));
    await testDb.insert(planningContextSessions).values({ userId: "user-1", conversationId: conversation.id, revision: 1, payload: { intent: "trip_planning", slots: { origin: "Hà Nội", destination: "Huế", start_date: "2026-09-01", adults: "2" }, missingSlots: [], status: "ready", sourceMessageIds: ["seed"], revision: 1 } });
    const [proposal] = await testDb.insert(tripChangeProposals).values({ userId: "user-1", tripProjectId: project.id, creatorClass: "owner_command", rationale: "Đổi điểm dừng", operations: [{ kind: "create-item" }], expectedAggregateVersion: 1 }).returning({ id: tripChangeProposals.id });
    let releaseBundle!: () => void;
    let assembled!: () => void;
    const bundleReady = new Promise<void>((resolve) => { releaseBundle = resolve; });
    const bundleAssembled = new Promise<void>((resolve) => { assembled = resolve; });
    setAiAskStreamTestDependencies({ assembleContextPrioritySourceBundle: vi.fn().mockImplementation(async () => { assembled(); await bundleReady; return sourceBundle(); }) });
    mockGateway();

    const admission = await port().admit({ question: "Xem đề xuất này", idempotencyKey: `proposal_${transition}_race`.padEnd(24, "x"), conversationId: conversation.id, tripProjectId: project.id }, principal(), "request-1", new AbortController().signal);
    if (admission.kind !== "admitted") throw new Error("Expected admitted execution");
    const iterator = admission.execution[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "preparing" } });
    await bundleAssembled;
    const changedAt = new Date();
    await testDb.update(tripChangeProposals).set(transition === "updated" ? { rationale: "Đổi điểm dừng mới", updatedAt: changedAt } : { status: transition, terminalTimestamp: changedAt, updatedAt: changedAt }).where(eq(tripChangeProposals.id, proposal.id));
    releaseBundle();

    expect((await collectIterator(iterator)).at(-1)).toMatchObject({ type: "error", code: "refresh_required" });
    await expect(testDb.select().from(messages).where(eq(messages.role, "assistant"))).resolves.toEqual([]);
    await expect(testDb.select().from(tripAnswerContextSnapshots)).resolves.toEqual([]);
    await expect(testDb.select().from(assistantResponseProvenance)).resolves.toEqual([]);
    await expect(testDb.select({ status: aiUsageEvents.status }).from(aiUsageEvents).where(eq(aiUsageEvents.purpose, "ai_ask_initial_answer"))).resolves.toEqual([]);
  });

  test("serializes the port events as byte-compatible NDJSON without correlation in the body", async () => {
    const execution = createAiAskStreamExecution({
      async admit() {
        return {
          kind: "admitted",
          execution: (async function* () {
            yield { type: "preparing" } as const;
            yield { type: "delta", content: "Xin chào" } as const;
            yield {
              type: "done",
              conversationId: "conversation-1",
              userMessage: { id: "user-message-1", content: "Đi đâu?" },
              assistantMessage: { id: "assistant-message-1", content: "Đi Huế." },
            } as const;
          })(),
        };
      },
    });

    const bytes: Uint8Array[] = [];
    for await (const chunk of execution.execute({ question: "Đi đâu?", idempotencyKey: "valid_idempotency_key" }, principal(), "request_1", new AbortController().signal)) bytes.push(chunk);

    const body = new TextDecoder().decode(concatenate(bytes));
    expect(body).toBe('{"type":"preparing"}\n{"type":"delta","content":"Xin chào"}\n{"type":"done","conversationId":"conversation-1","userMessage":{"id":"user-message-1","content":"Đi đâu?"},"assistantMessage":{"id":"assistant-message-1","content":"Đi Huế."}}\n');
    expect(body).not.toContain("request_1");
    expect(body).not.toContain("requestId");
  });

  test("writes a replay as its one retained event", async () => {
    const execution = createAiAskStreamExecution({
      async admit() {
        return { kind: "replay", event: { type: "in_progress", conversationId: "conversation-1" } };
      },
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of execution.execute({ question: "Đi đâu?", idempotencyKey: "valid_idempotency_key" }, principal(), "request_1", new AbortController().signal)) chunks.push(chunk);
    expect(new TextDecoder().decode(concatenate(chunks))).toBe('{"type":"in_progress","conversationId":"conversation-1"}\n');
  });

  test("closes an admitted execution with one safe terminal event when its port ends early", async () => {
    const execution = createAiAskStreamExecution({
      async admit() {
        return {
          kind: "admitted",
          execution: (async function* () {
            yield { type: "preparing" } as const;
          })(),
        };
      },
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of execution.execute({ question: "Đi đâu?", idempotencyKey: "valid_idempotency_key" }, principal(), "request_1", new AbortController().signal)) chunks.push(chunk);

    expect(new TextDecoder().decode(concatenate(chunks))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
  });

  test("emits preparing and exactly one safe terminal error when admission execution throws before preparing", async () => {
    const execution = createAiAskStreamExecution({
      async admit() {
        return { kind: "admitted", execution: (async function* () { throw new Error("setup failed"); })() };
      },
    });
    const chunks: Uint8Array[] = [];
    for await (const chunk of execution.execute({ question: "Đi đâu?", idempotencyKey: "valid_idempotency_key" }, principal(), "request_1", new AbortController().signal)) chunks.push(chunk);

    expect(new TextDecoder().decode(concatenate(chunks))).toBe('{"type":"preparing"}\n{"type":"error","errorMessage":"Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau."}\n');
  });
});

function port() {
  return createAiAskStreamExecutionPort();
}

async function seedUserAndModel() {
  await testDb.insert(users).values({ id: "user-1", email: "user-1@example.com" });
  await testDb.insert(aiGatewayModels).values({ id: "answer-model", gatewayModelName: "test/answer", displayLabel: "Test", purpose: "ai_ask_initial_answer", defaultForPurpose: true, supportsTextInput: true, supportsStreaming: true });
}

function sourceBundle(overrides?: { warnings?: ContextPrioritySourceBundle["warnings"]; retrievalDecision?: Partial<ContextPrioritySourceBundle["retrievalDecision"]>; web?: ContextPrioritySourceBundle["web"] }): ContextPrioritySourceBundle {
  return {
    tripAnswerContext: { version: 1, hasProjectScope: true, tripProjectId: "project", aggregateVersion: 1, primaryConversationId: "conversation", anchors: [{ field: "destination", value: "Huế", source: "trip_project" }], planItems: [], constraints: null, currentConversationFacts: [{ field: "budget", value: "5 triệu", source: "conversation" }], conflicts: [{ field: "destination", canonicalValue: "Huế", lowerPriorityValue: "Đà Lạt", projectValue: "Huế", conversationValue: "Đà Lạt", source: "conversation_chat", priority: "lower", material: true }] },
    chatTripContext: { tripProjectFacts: [{ field: "destination", value: "Huế", source: "trip_project" }], chatFacts: [{ field: "budget", value: "5 triệu", source: "conversation" }], conflicts: [{ field: "destination", canonicalValue: "Huế", lowerPriorityValue: "Đà Lạt", projectValue: "Huế", conversationValue: "Đà Lạt", source: "conversation_chat", priority: "lower", material: true }] },
    knowledge: [], web: overrides?.web ?? [], general: { available: true },
    retrievalDecision: { approvedKnowledgeCandidateCount: 0, approvedKnowledgeSelectedCount: 0, approvedKnowledgeRelevanceThreshold: 1, broadPlanningQuestion: false, freshnessRequired: false, conflictDetected: false, webSearchTriggered: false, webSearchTriggerReasons: [], generalReasoningUsed: true, requiredNeeds: { version: "required-needs-v1", needs: [] }, ...overrides?.retrievalDecision },
    warnings: overrides?.warnings ?? [],
  };
}

function mockGateway(content = "Gợi ý an toàn.") {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`data: {"model":"test/answer","choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } })));
}

function mockGatewayWithToolCalls(toolCalls: unknown[]) {
  const toolDeltas = toolCalls.map((toolCall) => `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [toolCall] } }] })}\n\n`).join("");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`data: {"model":"test/answer","choices":[{"delta":{"content":"Gợi ý an toàn."}}]}\n\n${toolDeltas}data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } })));
}

async function collect(admission: Awaited<ReturnType<ReturnType<typeof port>["admit"]>>) {
  if (admission.kind !== "admitted") throw new Error("Expected admitted execution.");
  const events = [];
  for await (const event of admission.execution) events.push(event);
  return events;
}

async function collectIterator(iterator: AsyncIterator<unknown>) {
  const events: unknown[] = [];
  for (let next = await iterator.next(); !next.done; next = await iterator.next()) events.push(next.value);
  return events;
}

function principal() {
  return { userId: "user-1", sessionId: "session-1", roles: ["traveler" as const], authorizationVersion: 1 };
}

function concatenate(chunks: Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
