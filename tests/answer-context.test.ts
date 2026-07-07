import { beforeEach, describe, expect, test, vi } from "vitest";

import { chatContext, conversations, messages, tripProjects, users, type ChatContextField, type ChatContextScope } from "@/db/schema";

import { testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

async function createConversationWithUserMessage({ userId = "user-1", tripProjectId }: { userId?: string; tripProjectId?: string | null } = {}) {
  const [conversation] = await testDb.insert(conversations).values({ userId, tripProjectId: tripProjectId ?? null }).returning({ id: conversations.id });
  const [message] = await testDb.insert(messages).values({ conversationId: conversation.id, userId, role: "user", content: "Tôi đi Hà Nội đến Huế 5 ngày." }).returning({ id: messages.id });

  return { conversation, message };
}

async function seedContextRow({
  userId,
  conversationId,
  sourceMessageId,
  field,
  value,
  scope,
  tripProjectId,
  status = "active",
  createdAt,
}: {
  userId: string;
  conversationId: string;
  sourceMessageId: string;
  field: ChatContextField;
  value: string;
  scope: ChatContextScope;
  tripProjectId?: string | null;
  status?: "active" | "deleted";
  createdAt?: Date;
}) {
  await testDb.insert(chatContext).values({
    userId,
    conversationId,
    sourceMessageId,
    field,
    value,
    scope,
    tripProjectId: scope === "trip_project" ? (tripProjectId ?? null) : null,
    status,
    ...(createdAt ? { createdAt } : {}),
  });
}

describe("answer context assembly", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  test("loads conversation-scoped context for ordinary chat", async () => {
    await createTestUser("user-1");
    const { conversation, message } = await createConversationWithUserMessage();
    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "destination", value: "Huế", scope: "conversation" });
    const { loadAnswerContext, buildAnswerContextPromptSection } = await import("@/features/chat-trips/answer-context");

    const digest = await loadAnswerContext({ userId: "user-1", conversationId: conversation.id });

    expect(digest).toEqual({
      hasProjectScope: false,
      facts: [{ field: "destination", value: "Huế", source: "conversation" }],
      conflicts: [],
    });

    const section = buildAnswerContextPromptSection(digest);

    expect(section).toContain("Ngữ cảnh kế hoạch đã ghi");
    expect(section).toContain('destination: "Huế"');
    expect(section).not.toContain("(dự án)");
  });

  test("prefers project-scoped context and surfaces conflicts", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Nẵng" }).returning({ id: tripProjects.id });
    const { conversation, message } = await createConversationWithUserMessage({ tripProjectId: project.id });

    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "destination", value: "Đà Nẵng", scope: "trip_project", tripProjectId: project.id });
    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "destination", value: "Huế", scope: "conversation" });
    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "budget", value: "15 triệu", scope: "trip_project", tripProjectId: project.id });
    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "origin", value: "Hà Nội", scope: "conversation" });

    const { loadAnswerContext, buildAnswerContextPromptSection } = await import("@/features/chat-trips/answer-context");

    const digest = await loadAnswerContext({ userId: "user-1", conversationId: conversation.id, tripProjectId: project.id });

    expect(digest.hasProjectScope).toBe(true);
    expect(digest.facts).toHaveLength(3);
    expect(digest.facts).toEqual(expect.arrayContaining([
      { field: "destination", value: "Đà Nẵng", source: "trip_project" },
      { field: "budget", value: "15 triệu", source: "trip_project" },
      { field: "origin", value: "Hà Nội", source: "conversation" },
    ]));
    expect(digest.conflicts).toEqual([{ field: "destination", projectValue: "Đà Nẵng", conversationValue: "Huế" }]);

    const section = buildAnswerContextPromptSection(digest);

    expect(section).toContain('destination: "Đà Nẵng" (dự án)');
    expect(section).toContain('destination: dự án="Đà Nẵng" | chat="Huế"');
    expect(section).toContain("Mâu thuẫn giữa chat và dự án");
  });

  test("does not load context from other conversations or projects", async () => {
    await createTestUser("user-1");
    const { conversation: conversationA, message: messageA } = await createConversationWithUserMessage({ userId: "user-1" });
    const { conversation: conversationB, message: messageB } = await createConversationWithUserMessage({ userId: "user-1" });

    await seedContextRow({ userId: "user-1", conversationId: conversationA.id, sourceMessageId: messageA.id, field: "destination", value: "Huế", scope: "conversation" });
    await seedContextRow({ userId: "user-1", conversationId: conversationB.id, sourceMessageId: messageB.id, field: "destination", value: "Đà Nẵng", scope: "conversation" });

    const [otherProject] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Lạt" }).returning({ id: tripProjects.id });
    const { conversation: projectConversation, message: projectMessage } = await createConversationWithUserMessage({ userId: "user-1", tripProjectId: otherProject.id });
    await seedContextRow({ userId: "user-1", conversationId: projectConversation.id, sourceMessageId: projectMessage.id, field: "destination", value: "Đà Lạt", scope: "trip_project", tripProjectId: otherProject.id });

    const { loadAnswerContext } = await import("@/features/chat-trips/answer-context");

    const digest = await loadAnswerContext({ userId: "user-1", conversationId: conversationA.id });

    expect(digest.hasProjectScope).toBe(false);
    expect(digest.facts).toEqual([{ field: "destination", value: "Huế", source: "conversation" }]);
    expect(digest.facts.find((fact) => fact.value === "Đà Nẵng")).toBeUndefined();
    expect(digest.facts.find((fact) => fact.value === "Đà Lạt")).toBeUndefined();
  });

  test("excludes deleted context rows", async () => {
    await createTestUser("user-1");
    const { conversation, message } = await createConversationWithUserMessage();

    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "destination", value: "Huế", scope: "conversation", status: "active" });
    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "origin", value: "Hà Nội", scope: "conversation", status: "deleted" });

    const { loadAnswerContext } = await import("@/features/chat-trips/answer-context");

    const digest = await loadAnswerContext({ userId: "user-1", conversationId: conversation.id });

    expect(digest.facts).toEqual([{ field: "destination", value: "Huế", source: "conversation" }]);
    expect(digest.facts.find((fact) => fact.field === "origin")).toBeUndefined();
  });

  test("dedupes to the latest value within a scope", async () => {
    await createTestUser("user-1");
    const { conversation, message } = await createConversationWithUserMessage();

    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "destination", value: "Huế", scope: "conversation", createdAt: new Date("2026-07-01T00:00:00.000Z") });
    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "destination", value: "Đà Lạt", scope: "conversation", createdAt: new Date("2026-07-05T00:00:00.000Z") });

    const { loadAnswerContext } = await import("@/features/chat-trips/answer-context");

    const digest = await loadAnswerContext({ userId: "user-1", conversationId: conversation.id });

    expect(digest.facts).toEqual([{ field: "destination", value: "Đà Lạt", source: "conversation" }]);
  });

  test("does not load project context when the conversation belongs to a different project", async () => {
    await createTestUser("user-1");
    const [projectA] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const [projectB] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Nẵng" }).returning({ id: tripProjects.id });
    const { conversation: conversationA } = await createConversationWithUserMessage({ userId: "user-1", tripProjectId: projectA.id });
    const { conversation: conversationB, message: messageB } = await createConversationWithUserMessage({ userId: "user-1", tripProjectId: projectB.id });

    await seedContextRow({ userId: "user-1", conversationId: conversationB.id, sourceMessageId: messageB.id, field: "destination", value: "Đà Nẵng", scope: "trip_project", tripProjectId: projectB.id });

    const { loadAnswerContext } = await import("@/features/chat-trips/answer-context");

    const digest = await loadAnswerContext({ userId: "user-1", conversationId: conversationA.id, tripProjectId: projectB.id });

    expect(digest).toEqual({ hasProjectScope: true, facts: [], conflicts: [] });
  });

  test("keeps a fitting conflict visible when long facts exceed the context budget", async () => {
    const { buildAnswerContextPromptSection } = await import("@/features/chat-trips/answer-context");

    const section = buildAnswerContextPromptSection({
      hasProjectScope: true,
      facts: [
        { field: "notes", value: "a".repeat(1_700), source: "conversation" },
        { field: "destination", value: "Đà Nẵng", source: "trip_project" },
      ],
      conflicts: [{ field: "destination", projectValue: "Đà Nẵng", conversationValue: "Huế" }],
    });

    expect(section.length).toBeLessThanOrEqual(2_000);
    expect(section).toContain("Mâu thuẫn giữa chat và dự án");
    expect(section).toContain('destination: dự án="Đà Nẵng" | chat="Huế"');
  });

  test("buildAnswerContextPromptSection returns empty string when no facts", async () => {
    const { buildAnswerContextPromptSection } = await import("@/features/chat-trips/answer-context");

    expect(buildAnswerContextPromptSection({ hasProjectScope: false, facts: [], conflicts: [] })).toBe("");
  });

  test("stream route includes assembled context in the gateway answer request", async () => {
    await createTestUser("user-1");
    const { aiGatewayModels } = await import("@/db/schema");
    await testDb.insert(aiGatewayModels).values({
      id: "extract-model",
      gatewayModelName: "cx/extract",
      displayLabel: "Extract",
      purpose: "extraction",
      defaultForPurpose: true,
      supportsTextInput: true,
      supportsExtraction: true,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 1_000_000,
      outputTokenPriceMicros: 2_000_000,
      pricingUnitTokens: 1_000_000,
      pricingVersion: "test-v1",
      pricingEffectiveAt: new Date("2026-07-07T00:00:00.000Z"),
    });
    await testDb.insert(aiGatewayModels).values({
      id: "answer-model",
      gatewayModelName: "cx/answer",
      displayLabel: "Answer",
      purpose: "ai_ask_initial_answer",
      defaultForPurpose: true,
      supportsTextInput: true,
      supportsStreaming: true,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 1_000_000,
      outputTokenPriceMicros: 2_000_000,
      pricingUnitTokens: 1_000_000,
      pricingVersion: "test-v1",
      pricingEffectiveAt: new Date("2026-07-07T00:00:00.000Z"),
    });

    const { conversation, message } = await createConversationWithUserMessage({ userId: "user-1" });
    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "destination", value: "Huế", scope: "conversation" });

    let answerRequestBody = "";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const bodyStr = String(init?.body);
      const body = JSON.parse(bodyStr) as { stream?: boolean };

      if (body.stream === false) {
        return new Response(JSON.stringify({ model: "cx/extract", choices: [{ message: { content: JSON.stringify({ facts: [] }) } }] }), { status: 200 });
      }

      answerRequestBody = bodyStr;
      return new Response([
        'data: {"model":"cx/answer","choices":[{"delta":{"content":"Nên đi 5 ngày."}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("next/server", () => ({
      after: (callback: () => Promise<void> | void) => {
        void Promise.resolve(callback()).catch(() => undefined);
      },
    }));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));

    const formData = new FormData();
    formData.set("question", "Tôi muốn đi Huế 5 ngày.");
    formData.set("conversationId", conversation.id);
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const responseText = await response.text();

    expect(responseText).toContain('"type":"done"');
    expect(answerRequestBody).toContain("Ngữ cảnh kế hoạch đã ghi");
    const answerRequest = JSON.parse(answerRequestBody) as { messages: Array<{ role: string; content: string }> };
    expect(answerRequest.messages[0]?.content).toContain('destination: "Huế"');
  });

  test("loads project-scoped context shared across conversations of the same project", async () => {
    await createTestUser("user-1");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Đà Nẵng" }).returning({ id: tripProjects.id });
    const { conversation: conversationA, message: messageA } = await createConversationWithUserMessage({ userId: "user-1", tripProjectId: project.id });
    const { conversation: conversationB, message: messageB } = await createConversationWithUserMessage({ userId: "user-1", tripProjectId: project.id });

    await seedContextRow({ userId: "user-1", conversationId: conversationA.id, sourceMessageId: messageA.id, field: "destination", value: "Đà Nẵng", scope: "trip_project", tripProjectId: project.id });
    await seedContextRow({ userId: "user-1", conversationId: conversationB.id, sourceMessageId: messageB.id, field: "budget", value: "15 triệu", scope: "conversation" });

    const { loadAnswerContext } = await import("@/features/chat-trips/answer-context");

    const digest = await loadAnswerContext({ userId: "user-1", conversationId: conversationB.id, tripProjectId: project.id });

    expect(digest.hasProjectScope).toBe(true);
    expect(digest.facts).toHaveLength(2);
    expect(digest.facts).toEqual(expect.arrayContaining([
      { field: "destination", value: "Đà Nẵng", source: "trip_project" },
      { field: "budget", value: "15 triệu", source: "conversation" },
    ]));
  });

  test("does not load another user's context even with their conversation and project ids", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const [project] = await testDb.insert(tripProjects).values({ userId: "user-1", title: "Huế" }).returning({ id: tripProjects.id });
    const { conversation, message } = await createConversationWithUserMessage({ userId: "user-1", tripProjectId: project.id });

    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "destination", value: "Huế", scope: "trip_project", tripProjectId: project.id });
    await seedContextRow({ userId: "user-1", conversationId: conversation.id, sourceMessageId: message.id, field: "origin", value: "Hà Nội", scope: "conversation" });

    const { loadAnswerContext } = await import("@/features/chat-trips/answer-context");

    const digest = await loadAnswerContext({ userId: "user-2", conversationId: conversation.id, tripProjectId: project.id });

    expect(digest.facts).toEqual([]);
    expect(digest.conflicts).toEqual([]);
  });

  test("stream route still completes when context load fails", async () => {
    await createTestUser("user-1");
    const { aiGatewayModels } = await import("@/db/schema");
    await testDb.insert(aiGatewayModels).values({
      id: "answer-model-only",
      gatewayModelName: "cx/answer",
      displayLabel: "Answer",
      purpose: "ai_ask_initial_answer",
      defaultForPurpose: true,
      supportsTextInput: true,
      supportsStreaming: true,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 1_000_000,
      outputTokenPriceMicros: 2_000_000,
      pricingUnitTokens: 1_000_000,
      pricingVersion: "test-v1",
      pricingEffectiveAt: new Date("2026-07-07T00:00:00.000Z"),
    });

    let answerRequestBody = "";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean };

      if (body.stream === false) {
        return new Response(JSON.stringify({ model: "cx/extract", choices: [{ message: { content: JSON.stringify({ facts: [] }) } }] }), { status: 200 });
      }

      answerRequestBody = String(init?.body);
      return new Response([
        'data: {"model":"cx/answer","choices":[{"delta":{"content":"Vẫn trả lời được."}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("next/server", () => ({
      after: (callback: () => Promise<void> | void) => {
        void Promise.resolve(callback()).catch(() => undefined);
      },
    }));
    vi.doMock("@/server/auth", () => ({
      getAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", email: "user-1@example.com" }),
    }));
    vi.doMock("@/features/chat-trips/answer-context", () => ({
      loadAnswerContext: vi.fn().mockRejectedValue(new Error("db down")),
      buildAnswerContextPromptSection: vi.fn().mockReturnValue(""),
    }));

    const formData = new FormData();
    formData.set("question", "Đi Huế 5 ngày?");
    const { POST } = await import("@/app/api/ai-ask/stream/route");

    const response = await POST(new Request("https://xuyenviet.test/api/ai-ask/stream", { method: "POST", body: formData }) as never);
    const responseText = await response.text();

    expect(responseText).toContain('"type":"done"');
    expect(answerRequestBody).not.toContain("Ngữ cảnh kế hoạch đã ghi");
  });
});
