import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { aiAskCommands, conversations, messages, schema, users } from "@/db/schema";
import { acquireAiAskCommand, terminalizeAiAskCommand, validateAiAskIdempotencyKey } from "@/features/ai/ai-ask-commands";

import { testDb } from "./helpers/db";

const key = "idempotency_key_123";

let concurrencySql: ReturnType<typeof postgres> | null = null;

beforeAll(() => {
  const databaseUrl = process.env.DATABASE_URL_TEST;
  if (!databaseUrl) throw new Error("DATABASE_URL_TEST is required for AI Ask command concurrency tests");
  concurrencySql = postgres(databaseUrl, { max: 2 });
});

afterAll(async () => {
  await concurrencySql?.end();
});

async function loadCommandsWithDatabase(database: ReturnType<typeof drizzle<typeof schema>>) {
  vi.resetModules();
  vi.doMock("@/db/client", () => ({ getDb: () => database }));
  return import("@/features/ai/ai-ask-commands");
}

describe("AI Ask command ledger", () => {
  test("accepts only strict URL-safe idempotency keys", () => {
    expect(validateAiAskIdempotencyKey("a".repeat(16))).toBe(true);
    expect(validateAiAskIdempotencyKey("a".repeat(128))).toBe(true);
    expect(validateAiAskIdempotencyKey("a".repeat(15))).toBe(false);
    expect(validateAiAskIdempotencyKey("a".repeat(129))).toBe(false);
    expect(validateAiAskIdempotencyKey("contains spaces here")).toBe(false);
  });

  test("creates one turn and replays pending then terminal commands", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });

    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "  Đi   Huế  ", conversationId: conversation.id });
    expect(admitted.kind).toBe("admitted");
    if (admitted.kind !== "admitted") return;

    const pending = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    expect(pending).toMatchObject({ kind: "pending_replay", conversationId: conversation.id, userMessage: admitted.userMessage });
    expect(await testDb.select().from(messages)).toHaveLength(1);

    const result = { type: "error" as const, conversationId: conversation.id, userMessage: admitted.userMessage, errorMessage: "Lỗi an toàn" };
    await terminalizeAiAskCommand(admitted.commandId, "failed", result);
    const terminal = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    expect(terminal).toEqual({ kind: "terminal_replay", result });
    expect(await testDb.select().from(messages)).toHaveLength(1);
  });

  test("replays a completed command without another user or assistant message", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const admitted = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });
    if (admitted.kind !== "admitted") throw new Error("Expected command admission");
    const [assistant] = await testDb.insert(messages).values({ conversationId: conversation.id, userId: "owner", role: "assistant", content: "Gợi ý an toàn" }).returning({ id: messages.id });
    const result = { type: "done" as const, conversationId: conversation.id, userMessage: admitted.userMessage, assistantMessage: { id: assistant.id, content: "Gợi ý an toàn" } };

    await terminalizeAiAskCommand(admitted.commandId, "completed", result, assistant.id);
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toEqual({ kind: "terminal_replay", result });
    expect(await testDb.select().from(messages)).toHaveLength(2);
  });

  test("rejects a changed digest without another turn", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id });

    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Đà Nẵng", conversationId: conversation.id })).resolves.toEqual({ kind: "key_reused" });
    expect(await testDb.select().from(messages)).toHaveLength(1);
  });

  test("rejects changed image bytes with identical attachment metadata without another turn", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    const image = { fileName: "road.png", mimeType: "image/png", byteSize: 3, bytes: new Uint8Array([1, 2, 3]) };

    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id, image })).resolves.toMatchObject({ kind: "admitted" });
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id, image: { ...image, bytes: new Uint8Array([3, 2, 1]) } })).resolves.toEqual({ kind: "key_reused" });
    expect(await testDb.select().from(messages)).toHaveLength(1);
  });

  test("allows the same key for another owner and rejects cross-owner references", async () => {
    await testDb.insert(users).values([
      { id: "owner-a", email: "owner-a@example.com" },
      { id: "owner-b", email: "owner-b@example.com" },
    ]);
    const [conversation] = await testDb.insert(conversations).values({ id: "owner-b-conversation", userId: "owner-b" }).returning({ id: conversations.id });

    await expect(acquireAiAskCommand({ userId: "owner-a", idempotencyKey: key, question: "Đi Huế" })).resolves.toMatchObject({ kind: "admitted" });
    await expect(acquireAiAskCommand({ userId: "owner-b", idempotencyKey: key, question: "Đi Huế" })).resolves.toMatchObject({ kind: "admitted" });
    await expect(testDb.insert(aiAskCommands).values({
      userId: "owner-a",
      scopeKind: "conversation",
      scopeId: conversation.id,
      idempotencyKey: "another_valid_key_1",
      requestDigest: "a".repeat(64),
      normalizedQuestion: "Đi Huế",
      selectedScopeDigest: "b".repeat(64),
      conversationId: conversation.id,
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow();
  });

  test("cascades command deletion with its owned conversation", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const [conversation] = await testDb.insert(conversations).values({ id: "conversation", userId: "owner" }).returning({ id: conversations.id });
    await expect(acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế", conversationId: conversation.id })).resolves.toMatchObject({ kind: "admitted" });

    await testDb.delete(conversations).where(eq(conversations.id, conversation.id));

    await expect(testDb.select().from(aiAskCommands)).resolves.toEqual([]);
  });

  test("derives a stable unscoped server scope for first-delivery races", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    const first = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế" });
    const second = await acquireAiAskCommand({ userId: "owner", idempotencyKey: key, question: "Đi Huế" });
    expect(first.kind).toBe("admitted");
    expect(second.kind).toBe("pending_replay");
    const rows = await testDb.select().from(aiAskCommands).where(eq(aiAskCommands.userId, "owner"));
    expect(rows).toHaveLength(1);
    expect(rows[0].scopeKind).toBe("new_conversation");
    expect(rows[0].scopeId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("uses independent connections to admit only one concurrent first delivery", async () => {
    await testDb.insert(users).values({ id: "owner", email: "owner@example.com" });
    if (!concurrencySql) throw new Error("concurrency database is not initialized");
    const concurrencyDb = drizzle(concurrencySql, { schema });
    const { acquireAiAskCommand: acquire } = await loadCommandsWithDatabase(concurrencyDb);

    const outcomes = await Promise.all([
      acquire({ userId: "owner", idempotencyKey: "concurrent_key_123", question: "Đi Huế" }),
      acquire({ userId: "owner", idempotencyKey: "concurrent_key_123", question: "Đi Huế" }),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === "admitted")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "pending_replay")).toHaveLength(1);
    expect(await testDb.select().from(aiAskCommands)).toHaveLength(1);
    expect(await testDb.select().from(messages)).toHaveLength(1);
  });
});
