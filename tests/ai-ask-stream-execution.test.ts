import { describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { createAiAskStreamExecution } from "@xuyenviet/domain";
import { createAiAskStreamExecutionPort, setAiAskStreamTestDependencies } from "../packages/database/src/ai-ask-stream-execution";
import { aiAskCommands, aiGatewayModels, aiUsageEvents, assistantResponseProvenance, assistantRetrievalDecisions, conversations, messages, publicMvpEvaluationResults, tripAnswerContextSnapshots, tripProjects, users } from "../packages/database/src/schema";
import { renderSourceBundlePromptSection, type ContextPrioritySourceBundle } from "../packages/database/src/source-bundle";

import { testDb } from "./helpers/db";

describe("AI Ask stream execution", () => {
  test("persists the exact rendered snapshot and links every answer-side record after a completed stream", async () => {
    await seedUserAndModel();
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [conversation] = await testDb.insert(conversations).values({ userId: "user-1", tripProjectId: project.id }).returning({ id: conversations.id });
    await testDb.update(tripProjects).set({ primaryConversationId: conversation.id }).where(eq(tripProjects.id, project.id));
    const bundle = sourceBundle();
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
    expect(usage?.tripAnswerContextSnapshotId).toBe(snapshot.id);
    expect(provenance).toHaveLength(3);
    expect(provenance.every((row) => row.tripAnswerContextSnapshotId === snapshot.id)).toBe(true);
    expect(provenance.map((row) => row.usedInPrompt)).toEqual([true, true, true]);
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

function sourceBundle(): ContextPrioritySourceBundle {
  return {
    tripAnswerContext: { version: 1, hasProjectScope: true, tripProjectId: "project", aggregateVersion: 1, primaryConversationId: "conversation", anchors: [{ field: "destination", value: "Huế", source: "trip_project" }], planItems: [], constraints: null, currentConversationFacts: [{ field: "budget", value: "5 triệu", source: "conversation" }], conflicts: [{ field: "destination", canonicalValue: "Huế", lowerPriorityValue: "Đà Lạt", projectValue: "Huế", conversationValue: "Đà Lạt", source: "conversation_chat", priority: "lower", material: true }] },
    chatTripContext: { tripProjectFacts: [{ field: "destination", value: "Huế", source: "trip_project" }], chatFacts: [{ field: "budget", value: "5 triệu", source: "conversation" }], conflicts: [{ field: "destination", canonicalValue: "Huế", lowerPriorityValue: "Đà Lạt", projectValue: "Huế", conversationValue: "Đà Lạt", source: "conversation_chat", priority: "lower", material: true }] },
    knowledge: [], web: [], general: { available: true }, warnings: [],
    retrievalDecision: { approvedKnowledgeCandidateCount: 0, approvedKnowledgeSelectedCount: 0, approvedKnowledgeTargetCount: 3, approvedKnowledgeRelevanceThreshold: 1, broadPlanningQuestion: false, freshnessRequired: false, conflictDetected: false, webSearchTriggered: false, webSearchTriggerReasons: [], generalReasoningUsed: true },
  };
}

function mockGateway() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('data: {"model":"test/answer","choices":[{"delta":{"content":"Gợi ý an toàn."}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { "content-type": "text/event-stream" } })));
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
  return { userId: "user-1", sessionId: "session-1", roles: ["traveler" as const], authorizationVersion: 1, issuer: "xuyenviet-web-bff" as const, tokenId: "token-1" };
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
